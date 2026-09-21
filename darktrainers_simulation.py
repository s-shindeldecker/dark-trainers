#!/usr/bin/env python3
"""
DarkTrainers LaunchDarkly simulation — session / multi-context journeys with VIP CSV pool.

Models guest-only, guest→identified, and identified-from-start journeys; evaluates flags on the
appropriate LaunchDarkly context; tracks commerce events with metric values for experimentation demos.
"""

import os
import re
import time
import uuid
import json
import csv
import random
import argparse
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from faker import Faker
import ldclient
from ldclient.config import Config
from ldclient.context import Context
from dotenv import load_dotenv
load_dotenv()

try:
    import snowflake.connector
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False
    print("Warning: snowflake-connector-python not installed. Snowflake mode will not be available.")

try:
    from google.cloud import bigquery
    BIGQUERY_AVAILABLE = True
except ImportError:
    BIGQUERY_AVAILABLE = False
    print("Warning: google-cloud-bigquery not installed. BigQuery mode will not be available.")

try:
    from databricks import sql as databricks_sql
    DATABRICKS_AVAILABLE = True
except ImportError:
    DATABRICKS_AVAILABLE = False
    print("Warning: databricks-sql-connector not installed. Databricks mode will not be available.")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('darktrainers-simulation')

fake = Faker()

def _get_env_float(name, default):
    raw = os.getenv(name)
    if raw in (None, ""):
        return default

    try:
        value = float(raw)
        if value < 0:
            raise ValueError
        return value
    except ValueError:
        logger.warning("Invalid %s=%r; using default %s", name, raw, default)
        return default


CONFIG = {
    "vip_csv_path": "vip_users.csv",
    "standard_csv_path": "standard_users.csv",
    "known_vip_ratio": 0.65,
    "vip_ratio": 0.30,
    "guest_transition_ratio": 0.40,
    "flags": {
        "session_flags": ["promo-banner-text", "promo-banner-position"],
        "identified_flags": ["pdp-hero-layout", "vip-upgrade-cta-copy"],
        # Server-side only. Evaluated at the search step on whatever context the
        # search runs on, mirroring server/routes/search.ts.
        "search_flag": "search-ranking-algorithm",
    },
    "products": {
        "price_range": (130, 210),
    },
    "aov": {
        "vip": {"mean": 620, "stddev": 90},
        "standard": {"mean": 85, "stddev": 18},
    },
    "event_probabilities": {
        "vip": {
            "add_to_cart": 0.70,
            "checkout_initiated": 0.58,
            "vip_upgrade": 0.0,
            "banner_click": 0.08,
            "search_performed": 0.40,
            # Conditional on a search having happened AND returned results.
            "search_result_clicked": 0.55,
        },
        "standard": {
            "add_to_cart": 0.12,
            "checkout_initiated": 0.08,
            "vip_upgrade": 0.06,
            "banner_click": 0.08,
            "search_performed": 0.35,
            "search_result_clicked": 0.30,
        },
        "guest": {
            "add_to_cart": 0.07,
            "checkout_initiated": 0.03,
            "vip_upgrade": 0.0,
            "banner_click": 0.10,
            "search_performed": 0.30,
            "search_result_clicked": 0.15,
        },
    },
    # Server-side search behavior, conditioned on the served
    # `search-ranking-algorithm` variation rather than on tier alone.
    #
    # This is deliberate: a click rate that only varies by tier makes the
    # experiment's winner a coin flip across runs, which is useless on stage.
    # Tying the lift to the served arm gives `personalized-affinity` a real,
    # repeatable edge for VIP — the story the demo is actually telling — and
    # gives `weighted-relevance` a smaller, broad-based one.
    #
    # Independent of --force-flag/--force-variation/--force-lift, which bluntly
    # lifts *every* metric on a chosen arm. Use that to force any flag's winner;
    # this is the structural shape of the search story itself.
    "search": {
        # Result count reported by a non-empty search; becomes the
        # `search_performed` metric value, matching the real route.
        "results_range": (3, 24),
        # A better ranker finds something more often. The legacy arm's narrower
        # field set genuinely whiffs more, so its zero-result rate is higher.
        "zero_result_rate": {
            "legacy-keyword": 0.12,
            "weighted-relevance": 0.06,
            "personalized-affinity": 0.06,
        },
        # Multiplier on the tier's base search_result_clicked probability.
        "click_multiplier": {
            "legacy-keyword": {"vip": 1.00, "standard": 1.00, "guest": 1.00},
            "weighted-relevance": {"vip": 1.20, "standard": 1.20, "guest": 1.10},
            "personalized-affinity": {"vip": 1.45, "standard": 1.15, "guest": 1.00},
        },
    },
    "simulation": {
        "delay_between_journeys": _get_env_float("DARKTRAINERS_SIMULATION_DELAY_BETWEEN_JOURNEYS", 2.0),
    },
}

DEFAULT_SEARCH_VARIATION = "legacy-keyword"

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_vip_user_pool():
    path = os.path.join(_SCRIPT_DIR, CONFIG["vip_csv_path"])
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def _load_standard_user_pool():
    path = os.path.join(_SCRIPT_DIR, CONFIG["standard_csv_path"])
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


VIP_USER_POOL = _load_vip_user_pool()
STANDARD_USER_POOL = _load_standard_user_pool()

CATEGORIES = ["running", "basketball", "lifestyle", "training"]

# ---------------------------------------------------------------------------
# Product catalog (for star-schema product keys only)
# ---------------------------------------------------------------------------
# The app's catalog is a TypeScript module, and dim_product is a hand-seeded
# snapshot of that same file. Parsing it here keeps the product keys the loader
# writes in sync with the catalog automatically, instead of a second hardcoded
# list that silently drifts every time a SKU is added.
#
# This is read-only and best-effort: if the parse comes up short the simulation
# logs a warning and writes NULL product keys, which the schema allows. It must
# never be a reason a demo run fails.
_PRODUCT_DATA_PATH = os.path.join(_SCRIPT_DIR, "src", "components", "Products", "productData.ts")

# id → category → price is the field order in every object literal in that file.
# `memberPrice:` is not matched (capital P), so the first `price:` after a
# category is always the list price.
_PRODUCT_RE = re.compile(
    r"id:\s*'(?P<id>[^']+)'.*?category:\s*'(?P<category>[^']+)'.*?\bprice:\s*(?P<price>[\d.]+)",
    re.DOTALL,
)


def _load_product_catalog():
    """Return [(product_id, category, price)] for searchable (non-collectible) SKUs."""
    try:
        with open(_PRODUCT_DATA_PATH, encoding="utf-8") as f:
            source = f.read()
    except OSError as e:
        logger.warning("Could not read %s (%s); star rows will have NULL product keys",
                       _PRODUCT_DATA_PATH, e)
        return []

    catalog = [
        (m.group("id"), m.group("category"), float(m.group("price")))
        for m in _PRODUCT_RE.finditer(source)
        # Collectibles have their own catalog page and are not part of the
        # sneaker PLP the simulation models.
        if m.group("category") != "collectibles"
    ]

    if len(catalog) < 5:
        logger.warning(
            "Parsed only %d products from productData.ts; star rows will have NULL "
            "product keys. Check the file's formatting against _PRODUCT_RE.",
            len(catalog),
        )
        return []

    return catalog


PRODUCT_CATALOG = _load_product_catalog()


@dataclass(frozen=True)
class SimulationProfile:
    name: str
    ld_sdk_key_env: str
    warehouse: str | None  # bigquery | databricks | snowflake; None = LD-only


PROFILES: dict[str, SimulationProfile] = {
    "production-bq": SimulationProfile(
        name="production-bq",
        ld_sdk_key_env="LAUNCHDARKLY_SDK_KEY",
        warehouse="bigquery",
    ),
    "test-databricks": SimulationProfile(
        name="test-databricks",
        ld_sdk_key_env="LAUNCHDARKLY_SDK_KEY_TEST",
        warehouse="databricks",
    ),
    "snowflake": SimulationProfile(
        name="snowflake",
        ld_sdk_key_env="LAUNCHDARKLY_SDK_KEY_SNOWFLAKE",
        warehouse="snowflake",
    ),
}

LD_ONLY_PROFILE = SimulationProfile(
    name="launchdarkly-only",
    ld_sdk_key_env="LAUNCHDARKLY_SDK_KEY",
    warehouse=None,
)


@dataclass(frozen=True)
class ForceWinner:
    """Synthetic skew to 'force' an experiment winner.

    When the served variation index for `flag_key` matches `variation_index`,
    every probability-gated metric event in that journey gets `lift` added to
    its firing probability (absolute percentage points, capped at 1.0). Used to
    push a chosen arm of an experiment to win during demos/simulations.
    """
    flag_key: str
    variation_index: int
    lift: float


# Set from CLI in main(); None disables the skew. Module-global because the
# simulation is single-threaded and sequential, matching CONFIG/fake usage.
FORCE_WINNER: ForceWinner | None = None

# Set from CLI in main(). "multi" (default) = the mixed guest/session + user
# journeys. "user" = user contexts only (known CSV users plus freshly generated
# unique-key users), identified-from-start, so every flag evaluation and every
# metric event is on a real user context. Module-global for the same
# single-threaded reason as FORCE_WINNER above.
CONTEXT_MODE: str = "multi"

# Set from CLI in main(). "legacy" (default) = write only the flat
# metric_events table, exactly as before this flag existed. "star" = write only
# the dimensional tables. "both" = write both projections from the same journey.
# Defaulting to "legacy" is the load-bearing guardrail: every existing demo,
# script invocation, and prior behavior is unaffected unless someone explicitly
# asks for the star schema. Module-global for the same single-threaded reason as
# FORCE_WINNER and CONTEXT_MODE above.
WAREHOUSE_SCHEMA: str = "legacy"

WAREHOUSE_SCHEMA_CHOICES = ("legacy", "star", "both")


def wants_star_schema() -> bool:
    return WAREHOUSE_SCHEMA in ("star", "both")


def wants_legacy_schema() -> bool:
    return WAREHOUSE_SCHEMA in ("legacy", "both")


# ---------------------------------------------------------------------------
# Star-schema records
# ---------------------------------------------------------------------------
# One dataclass per table in sql/databricks/01_star_schema.sql, minus
# dim_product — that table is a hand-seeded snapshot of productData.ts and the
# loader only ever *references* its keys, never writes them.
#
# Deliberately absent, and staying absent: any flag / variation / exposure
# table. LaunchDarkly exports evaluation_events itself and is the single source
# of truth for which variation was served. There is also no aggregation
# anywhere — one row per event occurrence, because LD computes the counts, sums,
# and averages and rejects pre-calculated metrics.


@dataclass
class StarCustomer:
    """dim_customer row. Upserted via MERGE — these keys recur across runs."""
    customer_key: str
    customer_name: str
    email: str
    country: str
    state: str
    member_tier: str
    member_since: str
    lifetime_spend: float
    preferred_category: str
    early_access_enabled: bool
    is_known_user: bool
    first_seen_ts: str
    last_seen_ts: str


@dataclass
class StarSession:
    """fact_session row. One per journey; customer_key NULL for guest-only."""
    session_key: str
    customer_key: str | None
    journey_type: str
    session_start_ts: str
    session_end_ts: str | None
    member_tier_at_session: str
    device_type: str
    browser: str
    os: str
    traffic_source: str
    landing_page: str
    run_id: str


@dataclass
class StarEngagementEvent:
    """fact_engagement_event row. product_id NULL for non-product events."""
    event_id: str
    session_key: str
    customer_key: str | None
    product_id: str | None
    event_name: str
    event_ts: str
    event_value: float | None
    context_kind: str
    context_key: str
    run_id: str


@dataclass
class StarOrder:
    """fact_order row. order_type separates checkout from the VIP upgrade."""
    order_id: str
    session_key: str
    customer_key: str | None
    order_type: str
    order_ts: str
    order_total: float | None
    item_count: int | None
    context_kind: str
    context_key: str
    run_id: str


# Which table each event key lands in, per section 7 of the feature plan. Events
# not listed here are not written to the star schema at all.
STAR_ORDER_EVENTS = ("checkout_initiated", "vip_upgrade")


@dataclass
class StarJourney:
    """
    Accumulator a journey fills when star-schema output is requested.

    Passing one into simulate_user_journey_v2 is what turns star output on. When
    it is None — the default, and what every existing caller does, including
    run_continuous_simulation.py — no star work happens at all and the journey's
    return tuple keeps its original four-value shape.
    """
    run_id: str
    session: StarSession | None = None
    customer: StarCustomer | None = None
    engagement: list = field(default_factory=list)
    orders: list = field(default_factory=list)

    def start_session(self, session_key: str, journey_type: str, started_at: str, tier: str) -> None:
        self.session = StarSession(
            session_key=session_key,
            customer_key=None,
            journey_type=journey_type,
            session_start_ts=started_at,
            session_end_ts=None,
            member_tier_at_session=tier,
            device_type=random.choice(["desktop", "mobile", "mobile", "tablet"]),
            browser=random.choice(["Chrome", "Safari", "Firefox", "Edge"]),
            os=random.choice(["macOS", "Windows", "iOS", "Android"]),
            traffic_source=random.choice(["direct", "organic", "paid_social", "email"]),
            landing_page=random.choice(["/", "/products", "/drops", "/collectibles"]),
            run_id=self.run_id,
        )

    def identify(self, user_info: dict, now: str) -> None:
        """
        Attach the identified customer to this session.

        A session belongs to at most one customer — a hard LaunchDarkly
        constraint on an analysis unit relative to a randomization unit, and
        what Check 4 in 03_parity_check.sql guards. The journey calls this once,
        at its single identify() point, so the property holds by construction.
        """
        if self.session is None:
            return
        self.session.customer_key = user_info["key"]
        self.session.member_tier_at_session = user_info["memberTier"]
        self.customer = StarCustomer(
            customer_key=user_info["key"],
            customer_name=user_info.get("name", ""),
            email=user_info.get("email", ""),
            country=user_info.get("country", "US"),
            state=user_info.get("state", ""),
            member_tier=user_info["memberTier"],
            member_since=user_info.get("memberSince", ""),
            lifetime_spend=float(user_info.get("lifetimeSpend", 0) or 0),
            preferred_category=user_info.get("preferredCategory", ""),
            early_access_enabled=bool(user_info.get("earlyAccessEnabled", False)),
            is_known_user=user_info["key"].startswith(("vip-user-", "standard-user-")),
            first_seen_ts=now,
            last_seen_ts=now,
        )

    def add_event(self, event_key, event_ts, context_kind, context_key,
                  event_value=None, product_id=None, item_count=None) -> None:
        """Route one tracked event to fact_order or fact_engagement_event."""
        if self.session is None:
            return
        # Snapshot the customer key as it stands *now*: an event fired before
        # identify() genuinely has no customer, and forcing one on afterwards
        # would misattribute guest behavior to the user who showed up later.
        customer_key = self.session.customer_key

        if event_key in STAR_ORDER_EVENTS:
            self.orders.append(StarOrder(
                order_id=str(uuid.uuid4()),
                session_key=self.session.session_key,
                customer_key=customer_key,
                order_type=event_key,
                order_ts=event_ts,
                order_total=event_value,
                item_count=item_count,
                context_kind=context_kind,
                context_key=context_key,
                run_id=self.run_id,
            ))
        else:
            self.engagement.append(StarEngagementEvent(
                event_id=str(uuid.uuid4()),
                session_key=self.session.session_key,
                customer_key=customer_key,
                product_id=product_id,
                event_name=event_key,
                event_ts=event_ts,
                event_value=event_value,
                context_kind=context_kind,
                context_key=context_key,
                run_id=self.run_id,
            ))

    def end_session(self, ended_at: str) -> None:
        if self.session is not None:
            self.session.session_end_ts = ended_at

    def is_empty(self) -> bool:
        return self.session is None


def _record_index(variation_indices, flag_key, variation_index):
    if variation_indices is not None:
        variation_indices[flag_key] = variation_index


def _forced_metric_lift(variation_indices) -> float:
    """Lift (absolute prob points) to add to each metric event this journey."""
    if FORCE_WINNER is None:
        return 0.0
    if variation_indices.get(FORCE_WINNER.flag_key) == FORCE_WINNER.variation_index:
        return FORCE_WINNER.lift
    return 0.0


def _metric_fires(prob: float, lift: float) -> bool:
    return random.random() < min(1.0, prob + lift)


def resolve_ld_sdk_key(profile: SimulationProfile) -> str:
    sdk_key = os.getenv(profile.ld_sdk_key_env)
    if not sdk_key:
        raise ValueError(
            f"{profile.ld_sdk_key_env} environment variable is required for profile '{profile.name}'"
        )
    return sdk_key


def init_ld_client(sdk_key: str):
    ldclient.set_config(Config(sdk_key))
    ld_client = ldclient.get()
    if not ld_client.is_initialized():
        raise RuntimeError("LaunchDarkly client failed to initialize")
    return ld_client


def get_databricks_connection():
    if not DATABRICKS_AVAILABLE:
        raise ImportError("databricks-sql-connector is not installed")

    host = os.getenv("DATABRICKS_HOST")
    http_path = os.getenv("DATABRICKS_HTTP_PATH")
    token = os.getenv("DATABRICKS_TOKEN")
    if not all([host, http_path, token]):
        raise ValueError(
            "DATABRICKS_HOST, DATABRICKS_HTTP_PATH, and DATABRICKS_TOKEN are required"
        )

    return databricks_sql.connect(
        server_hostname=host,
        http_path=http_path,
        access_token=token,
    )


def get_databricks_table_ref():
    catalog = os.getenv("DATABRICKS_CATALOG")
    if not catalog:
        raise ValueError("DATABRICKS_CATALOG environment variable is required")
    schema = os.getenv("DATABRICKS_SCHEMA", "darktrainers_metrics")
    table = os.getenv("DATABRICKS_METRICS_TABLE", "metric_events")
    return catalog, schema, table


def create_databricks_table_if_not_exists(conn, catalog, schema, table):
    table_ref = f"{catalog}.{schema}.{table}"
    ddl = f"""
    CREATE TABLE IF NOT EXISTS {table_ref} (
        context_key STRING NOT NULL,
        context_kind STRING NOT NULL,
        event_key STRING NOT NULL,
        event_value DOUBLE,
        received_time TIMESTAMP NOT NULL
    )
    """
    with conn.cursor() as cursor:
        cursor.execute(ddl)


def insert_metric_events_to_databricks(conn, catalog, schema, table, events, chunk_size=25):
    if not events:
        return

    table_ref = f"{catalog}.{schema}.{table}"

    rows = [
        (
            event["context_key"],
            event["context_kind"],
            event["event_key"],
            event["event_value"],
            event["received_time"],
        )
        for event in events
    ]

    with conn.cursor() as cursor:
        for i in range(0, len(rows), chunk_size):
            chunk = rows[i:i + chunk_size]
            placeholders = ", ".join(["(?, ?, ?, ?, ?)"] * len(chunk))
            insert_sql = f"INSERT INTO {table_ref} (context_key, context_kind, event_key, event_value, received_time) VALUES {placeholders}"
            flat_params = [val for row in chunk for val in row]
            cursor.execute(insert_sql, flat_params)


# ---------------------------------------------------------------------------
# Star-schema loader (Databricks)
# ---------------------------------------------------------------------------
# Deliberately named and shaped to match the legacy per-warehouse pattern above
# (insert_metric_events_to_databricks / _to_bigquery / _to_snowflake), even
# though only the Databricks version exists. A future
# insert_star_schema_events_snowflake(conn, database, schema, journeys) is then
# an addition, not a redesign.
#
# Databricks only, and that is a real constraint rather than an oversight:
# clustered analysis (randomize by user, analyze by session) and ratio metrics
# are Snowflake-only in LaunchDarkly. If the narrative needs either, that is a
# separate scoped decision — see docs/WAREHOUSE_MODEL.md, "Constraints found in
# LD docs", and section 12 of the feature plan.

STAR_FACT_TABLES = ("fact_session", "fact_engagement_event", "fact_order")
STAR_DIM_TABLES = ("dim_customer", "dim_product")

_DIM_CUSTOMER_COLUMNS = (
    "customer_key", "customer_name", "email", "country", "state", "member_tier",
    "member_since", "lifetime_spend", "preferred_category", "early_access_enabled",
    "is_known_user", "first_seen_ts", "last_seen_ts",
)

# Columns first_seen_ts is excluded from on UPDATE: a returning customer's
# "first seen" must not be rewritten to the current run's timestamp.
_DIM_CUSTOMER_UPDATE_COLUMNS = tuple(
    c for c in _DIM_CUSTOMER_COLUMNS if c not in ("customer_key", "first_seen_ts")
)

_FACT_SESSION_COLUMNS = (
    "session_key", "customer_key", "journey_type", "session_start_ts", "session_end_ts",
    "member_tier_at_session", "device_type", "browser", "os", "traffic_source",
    "landing_page", "run_id",
)

_FACT_ENGAGEMENT_COLUMNS = (
    "event_id", "session_key", "customer_key", "product_id", "event_name", "event_ts",
    "event_value", "context_kind", "context_key", "run_id",
)

_FACT_ORDER_COLUMNS = (
    "order_id", "session_key", "customer_key", "order_type", "order_ts", "order_total",
    "item_count", "context_kind", "context_key", "run_id",
)


def get_databricks_star_schema_ref():
    """(catalog, schema) for the star tables — the same schema as metric_events.

    Co-location is required, not incidental: the LaunchDarkly Databricks
    integration is granted USE SCHEMA + SELECT on exactly one metrics schema and
    that value is immutable once saved. Isolation from metric_events is by table
    name (the dim_ / fact_ prefixes), which is why nothing here can collide with
    the legacy table.
    """
    catalog, schema, _table = get_databricks_table_ref()
    return catalog, schema


def verify_star_tables_exist(conn, catalog, schema):
    """Fail fast, with the fix, if the DDL has not been applied to this workspace."""
    missing = []
    with conn.cursor() as cursor:
        for table in (*STAR_DIM_TABLES, *STAR_FACT_TABLES):
            try:
                cursor.execute(f"SELECT 1 FROM {catalog}.{schema}.{table} LIMIT 1")
                cursor.fetchall()
            except Exception:
                missing.append(table)

    if missing:
        raise RuntimeError(
            f"Star-schema tables missing from {catalog}.{schema}: {', '.join(missing)}. "
            "Apply sql/databricks/01_star_schema.sql once against the warehouse, then "
            "seed dim_product with Block 1 of sql/databricks/04_seed_fake_data.sql. "
            "The loader never creates or writes dim_product."
        )


def _insert_star_rows(cursor, table_ref, columns, rows, chunk_size):
    """Chunked multi-row INSERT, matching insert_metric_events_to_databricks."""
    if not rows:
        return
    column_list = ", ".join(columns)
    placeholder = "(" + ", ".join(["?"] * len(columns)) + ")"

    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        values = ", ".join([placeholder] * len(chunk))
        insert_sql = f"INSERT INTO {table_ref} ({column_list}) VALUES {values}"
        cursor.execute(insert_sql, [value for row in chunk for value in row])


def _dedupe_customers(journeys):
    """
    Collapse repeat customers to one row per key, keeping the last sighting.

    Required, not an optimization: VIP keys recur across journeys within a
    single run, and a MERGE whose source matches a target row more than once
    fails outright on Databricks. Deduping here is also what makes the MERGE
    idempotent across runs, which is the whole reason dim_customer is upserted
    rather than inserted (Block 6 of the seed script is the check that catches
    getting this wrong).
    """
    by_key = {}
    for journey in journeys:
        if journey.customer is not None:
            by_key[journey.customer.customer_key] = journey.customer
    return list(by_key.values())


def _merge_dim_customer(cursor, table_ref, customers, chunk_size):
    if not customers:
        return

    source_columns = ", ".join(_DIM_CUSTOMER_COLUMNS)
    # Cast in the source projection so the MERGE compares and writes the
    # declared types (DATE / DOUBLE / BOOLEAN / TIMESTAMP) rather than strings.
    source_projection = """
            customer_key,
            customer_name,
            email,
            country,
            state,
            member_tier,
            CAST(member_since AS DATE)            AS member_since,
            CAST(lifetime_spend AS DOUBLE)        AS lifetime_spend,
            preferred_category,
            CAST(early_access_enabled AS BOOLEAN) AS early_access_enabled,
            CAST(is_known_user AS BOOLEAN)        AS is_known_user,
            CAST(first_seen_ts AS TIMESTAMP)      AS first_seen_ts,
            CAST(last_seen_ts AS TIMESTAMP)       AS last_seen_ts
    """
    update_set = ",\n          ".join(f"t.{c} = s.{c}" for c in _DIM_CUSTOMER_UPDATE_COLUMNS)
    insert_columns = ", ".join(_DIM_CUSTOMER_COLUMNS)
    insert_values = ", ".join(f"s.{c}" for c in _DIM_CUSTOMER_COLUMNS)
    placeholder = "(" + ", ".join(["?"] * len(_DIM_CUSTOMER_COLUMNS)) + ")"

    for i in range(0, len(customers), chunk_size):
        chunk = customers[i:i + chunk_size]
        values = ", ".join([placeholder] * len(chunk))
        merge_sql = f"""
        MERGE INTO {table_ref} AS t
        USING (
          SELECT
{source_projection}
          FROM VALUES {values} AS v({source_columns})
        ) AS s
        ON t.customer_key = s.customer_key
        WHEN MATCHED THEN UPDATE SET
          {update_set}
        WHEN NOT MATCHED THEN INSERT ({insert_columns}) VALUES ({insert_values})
        """
        params = []
        for customer in chunk:
            params.extend([
                customer.customer_key,
                customer.customer_name,
                customer.email,
                customer.country,
                customer.state,
                customer.member_tier,
                customer.member_since or None,
                customer.lifetime_spend,
                customer.preferred_category,
                customer.early_access_enabled,
                customer.is_known_user,
                customer.first_seen_ts,
                customer.last_seen_ts,
            ])
        cursor.execute(merge_sql, params)


def insert_star_schema_events_databricks(conn, catalog, schema, journeys, chunk_size=25):
    """
    Write a batch of journeys into the dimensional model.

    Write order matters: dim_customer and fact_session first, so the fact rows
    that reference them never sit orphaned between statements (Check 3 in
    03_parity_check.sql counts exactly those orphans).

    dim_product is never written — it is a hand-refreshed snapshot of
    productData.ts, and the loader only references its keys. After a catalog
    expansion, Block 1 of 04_seed_fake_data.sql has to be re-run by hand or the
    new SKUs' product keys will have nothing to join to.
    """
    journeys = [j for j in journeys if not j.is_empty()]
    if not journeys:
        return

    sessions = [
        (
            j.session.session_key, j.session.customer_key, j.session.journey_type,
            j.session.session_start_ts, j.session.session_end_ts,
            j.session.member_tier_at_session, j.session.device_type, j.session.browser,
            j.session.os, j.session.traffic_source, j.session.landing_page, j.session.run_id,
        )
        for j in journeys
    ]
    engagement = [
        (
            e.event_id, e.session_key, e.customer_key, e.product_id, e.event_name,
            e.event_ts, e.event_value, e.context_kind, e.context_key, e.run_id,
        )
        for j in journeys for e in j.engagement
    ]
    orders = [
        (
            o.order_id, o.session_key, o.customer_key, o.order_type, o.order_ts,
            o.order_total, o.item_count, o.context_kind, o.context_key, o.run_id,
        )
        for j in journeys for o in j.orders
    ]

    with conn.cursor() as cursor:
        _merge_dim_customer(cursor, f"{catalog}.{schema}.dim_customer",
                            _dedupe_customers(journeys), chunk_size)
        _insert_star_rows(cursor, f"{catalog}.{schema}.fact_session",
                          _FACT_SESSION_COLUMNS, sessions, chunk_size)
        _insert_star_rows(cursor, f"{catalog}.{schema}.fact_engagement_event",
                          _FACT_ENGAGEMENT_COLUMNS, engagement, chunk_size)
        _insert_star_rows(cursor, f"{catalog}.{schema}.fact_order",
                          _FACT_ORDER_COLUMNS, orders, chunk_size)


def get_snowflake_connection():
    if not SNOWFLAKE_AVAILABLE:
        raise ImportError("snowflake-connector-python is not installed")

    account = os.getenv('SNOWFLAKE_ACCOUNT')
    user = os.getenv('SNOWFLAKE_USER')
    password = os.getenv('SNOWFLAKE_PASSWORD')
    private_key = os.getenv('SNOWFLAKE_PRIVATE_KEY')
    private_key_passphrase = os.getenv('SNOWFLAKE_PRIVATE_KEY_PASSPHRASE')
    warehouse = os.getenv('SNOWFLAKE_WAREHOUSE')
    database = os.getenv('SNOWFLAKE_DATABASE')
    schema = os.getenv('SNOWFLAKE_SCHEMA')
    role = os.getenv('SNOWFLAKE_ROLE', 'ACCOUNTADMIN')

    if not all([account, user, warehouse, database, schema]):
        raise ValueError("Missing required Snowflake environment variables")

    conn_params = {
        'account': account,
        'user': user,
        'warehouse': warehouse,
        'database': database,
        'schema': schema,
        'role': role,
        'session_parameters': {'TIMEZONE': 'UTC'}
    }

    if private_key:
        private_key = private_key.replace('\\n', '\n')
        try:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.backends import default_backend
            private_key_bytes = private_key.encode('utf-8')
            private_key_obj = serialization.load_pem_private_key(
                private_key_bytes,
                password=private_key_passphrase.encode('utf-8') if private_key_passphrase else None,
                backend=default_backend()
            )
            conn_params['private_key'] = private_key_obj
        except ImportError:
            logger.warning("cryptography library not available, using private key as-is")
            conn_params['private_key'] = private_key
            if private_key_passphrase:
                conn_params['private_key_passphrase'] = private_key_passphrase
        except Exception as e:
            raise ValueError(f"Failed to parse private key: {e}. Please ensure the key is in PEM format.")
    elif password:
        conn_params['password'] = password
    else:
        raise ValueError("Either SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY must be set")

    return snowflake.connector.connect(**conn_params)


def get_snowflake_table_ref() -> str:
    database = os.getenv("SNOWFLAKE_DATABASE")
    schema = os.getenv("SNOWFLAKE_SCHEMA")
    table = os.getenv(
        "SNOWFLAKE_METRICS_TABLE",
        os.getenv("SNOWFLAKE_METRIC_EVENTS_TABLE", "metric_events"),
    )
    if not database or not schema:
        raise ValueError("SNOWFLAKE_DATABASE and SNOWFLAKE_SCHEMA environment variables are required")
    if table.count(".") >= 2:
        return table
    return f"{database}.{schema}.{table}"


def create_snowflake_table_if_not_exists(conn, table_ref: str) -> None:
    ddl = f"""
    CREATE TABLE IF NOT EXISTS {table_ref} (
        EVENT_ID VARCHAR NOT NULL,
        EVENT_KEY VARCHAR NOT NULL,
        CONTEXT_KIND VARCHAR NOT NULL,
        CONTEXT_KEY VARCHAR NOT NULL,
        EVENT_VALUE FLOAT,
        RECEIVED_TIME TIMESTAMP_NTZ NOT NULL
    )
    """
    with conn.cursor() as cursor:
        cursor.execute(ddl)


def insert_metric_events_to_snowflake(conn, table_ref: str, events, chunk_size: int = 25) -> None:
    if not events:
        return

    insert_sql = f"""
    INSERT INTO {table_ref} (
        EVENT_ID, EVENT_KEY, CONTEXT_KIND, CONTEXT_KEY,
        EVENT_VALUE, RECEIVED_TIME
    ) VALUES (%s, %s, %s, %s, %s, %s)
    """

    with conn.cursor() as cursor:
        for i in range(0, len(events), chunk_size):
            chunk = events[i:i + chunk_size]
            for event_data in chunk:
                cursor.execute(
                    insert_sql,
                    (
                        event_data["event_id"],
                        event_data["event_key"],
                        event_data["context_kind"],
                        event_data["context_key"],
                        event_data["event_value"],
                        event_data["received_time"],
                    ),
                )
        conn.commit()


def insert_metric_event_to_snowflake(conn, event_data):
    table_ref = get_snowflake_table_ref()
    insert_metric_events_to_snowflake(conn, table_ref, [event_data], chunk_size=1)


def get_bigquery_client():
    if not BIGQUERY_AVAILABLE:
        raise ImportError("google-cloud-bigquery is not installed")

    project_id = os.getenv('BIGQUERY_PROJECT_ID')
    if not project_id:
        raise ValueError("BIGQUERY_PROJECT_ID environment variable is required")

    dataset_id = os.getenv('BIGQUERY_METRICS_DATASET', 'darktrainers_metrics')
    table_id = os.getenv('BIGQUERY_METRICS_TABLE', 'metric_events')

    return bigquery.Client(project=project_id), dataset_id, table_id


def create_bq_table_if_not_exists(bq_client, project_id, dataset_id, table_id):
    table_ref = f"{project_id}.{dataset_id}.{table_id}"
    schema = [
        bigquery.SchemaField("context_key", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("context_kind", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("event_key", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("event_value", "FLOAT", mode="NULLABLE"),
        bigquery.SchemaField("received_time", "TIMESTAMP", mode="REQUIRED"),
    ]
    table = bigquery.Table(table_ref, schema=schema)
    bq_client.create_table(table, exists_ok=True)


def insert_metric_events_to_bigquery(bq_client, project_id, dataset_id, table_id, events):
    if not events:
        return

    table_ref = f"{project_id}.{dataset_id}.{table_id}"
    rows = [
        {
            "context_key": event["context_key"],
            "context_kind": event["context_kind"],
            "event_key": event["event_key"],
            "event_value": event["event_value"],
            "received_time": event["received_time"],
        }
        for event in events
    ]
    errors = bq_client.insert_rows_json(table_ref, rows)
    if errors:
        raise RuntimeError(f"Error inserting metric events into BigQuery: {errors}")


def generate_metric_event_data(user_key, event_key, event_value=None, flag_eval_time=None,
                               context_kind='user'):
    """
    Build one flat metric_events row.

    `context_kind` must be the kind of the context the event was actually
    tracked on: it is the half of (context_kind, context_key) that decides which
    assignment data LaunchDarkly can join the row to. A session key labelled
    'user' joins nothing, so the metric silently under-counts rather than
    failing. Defaults to 'user' so callers predating the parameter are unchanged.
    """
    event_id = str(uuid.uuid4())
    if flag_eval_time:
        offset_minutes = random.uniform(5, 10)
        received_time = flag_eval_time + timedelta(minutes=offset_minutes)
    else:
        received_time = datetime.now(timezone.utc)

    return {
        'event_id': event_id,
        'event_key': event_key,
        'context_kind': context_kind,
        'context_key': user_key,
        'event_value': event_value,
        'received_time': received_time.isoformat()
    }


def _session_context(session_key: str) -> Context:
    return Context.builder(session_key).kind("session").build()


def _identified_context_from_vip_record(record: dict):
    key = record["user_key"]
    lifetime_spend = float(record["lifetimeSpend"])
    member_tier = record["memberTier"]
    early_access = member_tier == "vip"
    ctx = Context.builder(key) \
        .kind("user") \
        .name(record["name"]) \
        .set("country", "US") \
        .set("state", "CA") \
        .set("memberTier", member_tier) \
        .set("memberSince", record["memberSince"]) \
        .set("lifetimeSpend", round(lifetime_spend, 2)) \
        .set("preferredCategory", record["preferredCategory"]) \
        .set("earlyAccessEnabled", early_access) \
        .build()
    user_info = {
        "key": key,
        "name": record["name"],
        "email": "",
        "country": "US",
        "state": "CA",
        "memberTier": member_tier,
        "memberSince": record["memberSince"],
        "lifetimeSpend": round(lifetime_spend, 2),
        "preferredCategory": record["preferredCategory"],
        "earlyAccessEnabled": early_access,
    }
    return ctx, user_info


def generate_user_context(user_record=None):
    """
    Build a kind:user Context and user_info dict.
    If user_record is a VIP CSV row, use stable user_key and row attributes.
    If user_record is 'unknown_vip', generate a UUID-keyed VIP user.
    If not, generate a random standard user with a UUID key.
    """
    if user_record is not None and user_record not in ("unknown_vip", "unknown_standard"):
        return _identified_context_from_vip_record(user_record)

    is_unknown_vip = (user_record == "unknown_vip")
    is_unknown_standard = (user_record == "unknown_standard")

    context_key = str(uuid.uuid4())
    name = fake.name()
    email = fake.email()
    state = fake.state_abbr()
    preferred = random.choice(CATEGORIES)

    if is_unknown_vip:
        lifetime_spend = random.uniform(800, 4500)
        member_tier = "vip"
        early_access = True
        member_since = fake.date_between(start_date='-4y', end_date='-90d').isoformat()
    else:
        lifetime_spend = random.uniform(40, 520)
        member_tier = "standard"
        early_access = False
        member_since = fake.date_between(start_date='-2y', end_date='-30d').isoformat()

    ctx = Context.builder(context_key) \
        .kind("user") \
        .name(name) \
        .set("email", email) \
        .set("country", "US") \
        .set("state", state) \
        .set("memberTier", member_tier) \
        .set("memberSince", member_since) \
        .set("lifetimeSpend", round(lifetime_spend, 2)) \
        .set("preferredCategory", preferred) \
        .set("earlyAccessEnabled", early_access) \
        .build()

    user_info = {
        "key": context_key,
        "name": name,
        "email": email,
        "country": "US",
        "state": state,
        "memberTier": member_tier,
        "memberSince": member_since,
        "lifetimeSpend": round(lifetime_spend, 2),
        "preferredCategory": preferred,
        "earlyAccessEnabled": early_access,
    }
    return ctx, user_info


def _multi_context(session_ctx: Context, user_ctx: Context) -> Context:
    return Context.multi_builder().add(session_ctx).add(user_ctx).build()


def _pick_journey_type() -> str:
    """Return 'A' (guest only), 'B' (guest→identified), or 'C' (identified from start)."""
    if CONTEXT_MODE == "user":
        # Known-users-only mode: always identified from start so every flag
        # evaluation and metric event lands on a real user context.
        return "C"
    r = random.random()
    if r < CONFIG["guest_transition_ratio"]:
        return "B"
    r2 = random.random()
    if r2 < 0.5:
        return "A"
    return "C"


def _pick_user_record():
    """
    Returns:
      - A VIP CSV row dict (known VIP, stable key)
      - The sentinel "unknown_vip" (new high-value customer, UUID key)
      - A standard CSV row dict (known standard user, stable key)
      - The sentinel "unknown_standard" (new standard customer, UUID key)

    Both context modes use this same mix. In "user" mode the freshly generated
    (UUID-keyed) users keep the randomization-unit population large enough for
    experiment results — every record still resolves to a kind:user context.
    """
    if random.random() < CONFIG["vip_ratio"]:
        if VIP_USER_POOL and random.random() < CONFIG["known_vip_ratio"]:
            return random.choice(VIP_USER_POOL)
        else:
            return "unknown_vip"
    else:
        known_standard_ratio = 0.20
        if STANDARD_USER_POOL and random.random() < known_standard_ratio:
            return random.choice(STANDARD_USER_POOL)
        return "unknown_standard"


def _sample_product_price() -> float:
    lo, hi = CONFIG["products"]["price_range"]
    return round(random.uniform(lo, hi), 2)


def _sample_checkout_total(tier: str) -> float:
    if tier == "vip":
        cfg = CONFIG["aov"]["vip"]
    else:
        cfg = CONFIG["aov"]["standard"]
    return max(0.0, round(random.gauss(cfg["mean"], cfg["stddev"]), 2))


def _banner_click_probability(probs: dict, flag_values: dict) -> float:
    banner_prob = probs["banner_click"]
    if flag_values.get("promoBannerVariationIndex") == 2:
        banner_prob = min(1.0, banner_prob * 1.15)
    if flag_values.get("promoBannerPosition") == "bottom":
        banner_prob = min(1.0, banner_prob * 1.28)
    return banner_prob


def _eval_session_flags(ld_client, eval_ctx, variation_indices=None) -> dict:
    out = {}
    for flag_key in CONFIG["flags"]["session_flags"]:
        if flag_key == "promo-banner-text":
            detail = ld_client.variation_detail("promo-banner-text", eval_ctx, "")
            out["promoBanner"] = detail.value
            out["promoBannerVariationIndex"] = detail.variation_index
        elif flag_key == "promo-banner-position":
            detail = ld_client.variation_detail("promo-banner-position", eval_ctx, "top")
            out["promoBannerPosition"] = detail.value
        else:
            detail = ld_client.variation_detail(flag_key, eval_ctx, "standard")
            out[flag_key] = detail.value
        _record_index(variation_indices, flag_key, detail.variation_index)
    return out


def _eval_identified_flags(ld_client, eval_ctx, variation_indices=None) -> dict:
    out = {}
    for flag_key in CONFIG["flags"]["identified_flags"]:
        if flag_key == "pdp-hero-layout":
            detail = ld_client.variation_detail(flag_key, eval_ctx, "standard")
            out["pdpHeroLayout"] = detail.value
        elif flag_key == "vip-upgrade-cta-copy":
            detail = ld_client.variation_detail(flag_key, eval_ctx, "Join VIP")
            out["vipUpgradeCtaCopy"] = detail.value
        else:
            detail = ld_client.variation_detail(flag_key, eval_ctx, None)
            out[flag_key] = detail.value
        _record_index(variation_indices, flag_key, detail.variation_index)
    return out


def _eval_all_flags_on_multi(ld_client, multi_ctx, variation_indices=None) -> dict:
    merged = {}
    merged.update(_eval_session_flags(ld_client, multi_ctx, variation_indices))
    merged.update(_eval_identified_flags(ld_client, multi_ctx, variation_indices))
    return merged


def _event_timestamp(flag_eval_time) -> str:
    """
    The timestamp generate_metric_event_data() would have produced.

    Only used for events that never generate a legacy row (mode='launchdarkly'),
    so a star-schema row still lands inside the run's time window.
    """
    if flag_eval_time:
        offset_minutes = random.uniform(5, 10)
        return (flag_eval_time + timedelta(minutes=offset_minutes)).isoformat()
    return datetime.now(timezone.utc).isoformat()


def _track(ld_client, mode, track_ctx, event_key, user_key_sf, warehouse_events, flag_eval_time, metric_value=None,
           context_kind='user'):
    """
    Emit one event, to LaunchDarkly or to the legacy warehouse buffer.

    `context_kind` is the kind of `track_ctx` — the context this event is
    genuinely tracked on — and must match the kind `user_key_sf` is a key for:
    'session' for a session-only context, 'user' for a multi(session + user)
    one. It defaults to 'user' for callers that predate the parameter, but a
    guest-phase call site has to pass 'session' or the row lands unjoinable.
    LD-only mode ignores it; the SDK reads the kind off the context itself.

    Returns the ISO timestamp the event was recorded at. In warehouse mode that
    is the *same* value written to metric_events, so a star-schema row built
    alongside it carries an identical timestamp rather than a second independent
    random offset. The return value is additive — legacy behavior is unchanged
    and no existing caller reads it.
    """
    if mode == 'launchdarkly':
        if metric_value is not None:
            ld_client.track(event_key, track_ctx, metric_value=metric_value)
        else:
            ld_client.track(event_key, track_ctx)
        return _event_timestamp(flag_eval_time)

    event = generate_metric_event_data(
        user_key_sf, event_key, event_value=metric_value, flag_eval_time=flag_eval_time,
        context_kind=context_kind
    )
    warehouse_events.append(event)
    return event['received_time']


def _eval_search_flag(ld_client, eval_ctx, variation_indices=None) -> str:
    """
    Evaluate the server-side ranking flag on the context the search runs on.

    variation_detail (not variation) for the same reason the Express route uses
    it: this call is the experiment exposure, and the index feeds --force-flag.
    An unrecognized value falls back to the control arm, exactly like the route.
    """
    flag_key = CONFIG["flags"]["search_flag"]
    detail = ld_client.variation_detail(flag_key, eval_ctx, DEFAULT_SEARCH_VARIATION)
    _record_index(variation_indices, flag_key, detail.variation_index)
    if detail.value in CONFIG["search"]["click_multiplier"]:
        return detail.value
    return DEFAULT_SEARCH_VARIATION


def _search_zero_result(served: str) -> bool:
    rate = CONFIG["search"]["zero_result_rate"].get(served, 0.12)
    return random.random() < rate


def _sample_result_count() -> int:
    lo, hi = CONFIG["search"]["results_range"]
    return random.randint(lo, hi)


def _search_click_probability(probs: dict, tier: str, served: str) -> float:
    """Tier's base click rate, scaled by the served ranking arm."""
    base = probs.get("search_result_clicked", 0.0)
    multiplier = CONFIG["search"]["click_multiplier"].get(served, {}).get(tier, 1.0)
    return min(1.0, base * multiplier)


def _pick_journey_product(star_enabled: bool) -> dict:
    """
    The product this journey interacts with.

    With star output off, this is exactly the original behavior: a price sampled
    from CONFIG["products"]["price_range"] and no product identity at all. With
    star output on, a real catalog SKU is drawn so
    fact_engagement_event.product_id joins to dim_product, and that SKU's list
    price becomes the event value so both projections carry the same number.
    """
    if star_enabled and PRODUCT_CATALOG:
        product_id, category, price = random.choice(PRODUCT_CATALOG)
        return {"id": product_id, "category": category, "price": price}
    return {"id": None, "category": None, "price": _sample_product_price()}


def _simulate_search_step(ld_client, mode, eval_ctx, context_key, context_kind, tier, probs,
                          lift, events, warehouse_events, flag_eval_time, variation_indices,
                          star, product):
    """
    The search leg of a journey, mirroring server/routes/search.ts.

    The ranking flag is evaluated on the same context the search runs on, and
    search_performed / search_zero_results are emitted server-side; only the
    click is the visitor's own action. A zero-result search cannot be clicked,
    so the two outcomes are mutually exclusive by construction rather than by
    two independent coin flips.

    Returns the served variation, or None if this journey didn't search.
    """
    if not _metric_fires(probs.get("search_performed", 0.0), lift):
        return None

    served = _eval_search_flag(ld_client, eval_ctx, variation_indices)
    result_count = 0 if _search_zero_result(served) else _sample_result_count()

    events.append("search_performed")
    event_ts = _track(ld_client, mode, eval_ctx, "search_performed", context_key,
                      warehouse_events, flag_eval_time, metric_value=float(result_count),
                      context_kind=context_kind)
    if star is not None:
        star.add_event("search_performed", event_ts, context_kind, context_key,
                       event_value=float(result_count))

    if result_count == 0:
        events.append("search_zero_results")
        event_ts = _track(ld_client, mode, eval_ctx, "search_zero_results", context_key,
                          warehouse_events, flag_eval_time, context_kind=context_kind)
        if star is not None:
            star.add_event("search_zero_results", event_ts, context_kind, context_key)
        return served

    if _metric_fires(_search_click_probability(probs, tier, served), lift):
        events.append("search_result_clicked")
        event_ts = _track(ld_client, mode, eval_ctx, "search_result_clicked", context_key,
                          warehouse_events, flag_eval_time, metric_value=product["price"],
                          context_kind=context_kind)
        if star is not None:
            star.add_event("search_result_clicked", event_ts, context_kind, context_key,
                           event_value=product["price"], product_id=product["id"])

    return served


JOURNEY_TYPE_NAMES = {
    "A": "guest_only",
    "B": "guest_transition",
    "C": "identified_start",
}


def simulate_user_journey_v2(ld_client, fake, mode='launchdarkly', snowflake_conn=None, star=None):
    """
    Simulate one visitor journey.

    `star` is an optional StarJourney accumulator. Passing one is what turns
    star-schema output on; leaving it None — which every pre-existing caller
    does, including run_continuous_simulation.py — means no star work happens
    and the return tuple keeps its original four-value shape.

    The true LaunchDarkly context kind is tracked per event and written to
    *both* projections: 'session' for events tracked on a session-only context,
    'user' for events tracked on a multi(session + user) context. The legacy
    flat path used to hardcode 'user' for both, which labelled journey A's and
    journey B's guest-phase session keys as user-kind and left those rows unable
    to join user-context assignment data; it now passes the real kind through
    _track. Query B in 02_ld_data_source.sql and Check 2 in 03_parity_check.sql
    no longer need to cancel that out.
    """
    events = []
    warehouse_events = []
    flag_eval_time = datetime.now(timezone.utc)
    flag_values = {}
    variation_indices = {}
    journey = _pick_journey_type()

    product = _pick_journey_product(star is not None)
    product_price = product["price"]

    session_key = str(uuid.uuid4())
    session_ctx = _session_context(session_key)

    if star is not None:
        # One fact_session row per journey, opened here and closed at the end.
        # A single session_key per journey (and reused across identify() in
        # journey B) is what keeps a session bound to at most one customer.
        star.start_session(session_key, JOURNEY_TYPE_NAMES[journey],
                           flag_eval_time.isoformat(), "guest")

    if journey == "A":
        # Guest only — session context only
        flag_values.update(_eval_session_flags(ld_client, session_ctx, variation_indices))
        lift = _forced_metric_lift(variation_indices)

        gprob = CONFIG["event_probabilities"]["guest"]

        # Search first: a guest lands, searches, then views a product.
        _simulate_search_step(ld_client, mode, session_ctx, session_key, "session", "guest",
                              gprob, lift, events, warehouse_events, flag_eval_time,
                              variation_indices, star, product)

        event_ts = _track(ld_client, mode, session_ctx, "product_viewed", session_key, warehouse_events, flag_eval_time, metric_value=product_price, context_kind="session")
        events.append("product_viewed")
        if star is not None:
            star.add_event("product_viewed", event_ts, "session", session_key,
                           event_value=product_price, product_id=product["id"])

        if _metric_fires(gprob["add_to_cart"], lift):
            events.append("add_to_cart")
            event_ts = _track(ld_client, mode, session_ctx, "add_to_cart", session_key, warehouse_events, flag_eval_time, metric_value=product_price, context_kind="session")
            if star is not None:
                star.add_event("add_to_cart", event_ts, "session", session_key,
                               event_value=product_price, product_id=product["id"])

        if flag_values.get("promoBanner"):
            if _metric_fires(_banner_click_probability(gprob, flag_values), lift):
                events.append("banner_click")
                event_ts = _track(ld_client, mode, session_ctx, "banner_click", session_key, warehouse_events, flag_eval_time, context_kind="session")
                if star is not None:
                    star.add_event("banner_click", event_ts, "session", session_key)

        user_info = {
            "key": session_key,
            "memberTier": "guest",
            "lifetimeSpend": 0,
            "journeyType": "guest_only",
        }

    elif journey == "B":
        # Guest → identified; same session_key across identify()
        ld_client.identify(session_ctx)
        flag_values.update(_eval_session_flags(ld_client, session_ctx, variation_indices))

        event_ts = _track(ld_client, mode, session_ctx, "product_viewed", session_key, warehouse_events, flag_eval_time, metric_value=product_price, context_kind="session")
        events.append("product_viewed")
        if star is not None:
            # Fired before identify(): customer_key is genuinely NULL here, and
            # StarJourney.add_event snapshots it as such.
            star.add_event("product_viewed", event_ts, "session", session_key,
                           event_value=product_price, product_id=product["id"])

        user_record = _pick_user_record()
        user_ctx, user_info = generate_user_context(user_record)
        multi_ctx = _multi_context(session_ctx, user_ctx)
        ld_client.identify(multi_ctx)

        flag_values.update(_eval_identified_flags(ld_client, multi_ctx, variation_indices))
        lift = _forced_metric_lift(variation_indices)

        tier = user_info["memberTier"]
        probs = CONFIG["event_probabilities"][tier]
        sf_key = user_info["key"]

        if star is not None:
            star.identify(user_info, flag_eval_time.isoformat())

        # Searching after signing in is what gives the personalized arm real
        # attributes (memberTier, preferredCategory) to rank on — journey A
        # already covers the anonymous, session-context search.
        _simulate_search_step(ld_client, mode, multi_ctx, sf_key, "user", tier, probs, lift,
                              events, warehouse_events, flag_eval_time, variation_indices,
                              star, product)

        if _metric_fires(probs["add_to_cart"], lift):
            events.append("add_to_cart")
            event_ts = _track(ld_client, mode, multi_ctx, "add_to_cart", sf_key, warehouse_events, flag_eval_time, metric_value=product_price)
            if star is not None:
                star.add_event("add_to_cart", event_ts, "user", sf_key,
                               event_value=product_price, product_id=product["id"])

        checkout_prob = min(1.0, probs["checkout_initiated"] * (1.10 if flag_values.get("pdpHeroLayout") == "editorial" else 1.0))
        if _metric_fires(checkout_prob, lift):
            cart_total = _sample_checkout_total(tier)
            events.append("checkout_initiated")
            event_ts = _track(ld_client, mode, multi_ctx, "checkout_initiated", sf_key, warehouse_events, flag_eval_time, metric_value=cart_total)
            if star is not None:
                star.add_event("checkout_initiated", event_ts, "user", sf_key,
                               event_value=cart_total, item_count=random.randint(1, 3))

        if tier == "standard" and _metric_fires(probs["vip_upgrade"], lift):
            events.append("vip_upgrade")
            event_ts = _track(ld_client, mode, multi_ctx, "vip_upgrade", sf_key, warehouse_events, flag_eval_time, metric_value=14.99)
            if star is not None:
                star.add_event("vip_upgrade", event_ts, "user", sf_key,
                               event_value=14.99, item_count=1)

        if flag_values.get("promoBanner"):
            if _metric_fires(_banner_click_probability(probs, flag_values), lift):
                events.append("banner_click")
                event_ts = _track(ld_client, mode, multi_ctx, "banner_click", sf_key, warehouse_events, flag_eval_time)
                if star is not None:
                    star.add_event("banner_click", event_ts, "user", sf_key)

        user_info["journeyType"] = "guest_transition"
        user_info["sessionKey"] = session_key

    else:
        # Identified from start — multi(session + user) immediately
        user_record = _pick_user_record()
        user_ctx, user_info = generate_user_context(user_record)
        multi_ctx = _multi_context(session_ctx, user_ctx)
        ld_client.identify(multi_ctx)

        flag_values.update(_eval_all_flags_on_multi(ld_client, multi_ctx, variation_indices))
        lift = _forced_metric_lift(variation_indices)

        tier = user_info["memberTier"]
        probs = CONFIG["event_probabilities"][tier]
        sf_key = user_info["key"]

        if star is not None:
            star.identify(user_info, flag_eval_time.isoformat())

        _simulate_search_step(ld_client, mode, multi_ctx, sf_key, "user", tier, probs, lift,
                              events, warehouse_events, flag_eval_time, variation_indices,
                              star, product)

        event_ts = _track(ld_client, mode, multi_ctx, "product_viewed", sf_key, warehouse_events, flag_eval_time, metric_value=product_price)
        events.append("product_viewed")
        if star is not None:
            star.add_event("product_viewed", event_ts, "user", sf_key,
                           event_value=product_price, product_id=product["id"])

        if _metric_fires(probs["add_to_cart"], lift):
            events.append("add_to_cart")
            event_ts = _track(ld_client, mode, multi_ctx, "add_to_cart", sf_key, warehouse_events, flag_eval_time, metric_value=product_price)
            if star is not None:
                star.add_event("add_to_cart", event_ts, "user", sf_key,
                               event_value=product_price, product_id=product["id"])

        checkout_prob = min(1.0, probs["checkout_initiated"] * (1.10 if flag_values.get("pdpHeroLayout") == "editorial" else 1.0))
        if _metric_fires(checkout_prob, lift):
            cart_total = _sample_checkout_total(tier)
            events.append("checkout_initiated")
            event_ts = _track(ld_client, mode, multi_ctx, "checkout_initiated", sf_key, warehouse_events, flag_eval_time, metric_value=cart_total)
            if star is not None:
                star.add_event("checkout_initiated", event_ts, "user", sf_key,
                               event_value=cart_total, item_count=random.randint(1, 3))

        if tier == "standard" and _metric_fires(probs["vip_upgrade"], lift):
            events.append("vip_upgrade")
            event_ts = _track(ld_client, mode, multi_ctx, "vip_upgrade", sf_key, warehouse_events, flag_eval_time, metric_value=14.99)
            if star is not None:
                star.add_event("vip_upgrade", event_ts, "user", sf_key,
                               event_value=14.99, item_count=1)

        if flag_values.get("promoBanner"):
            if _metric_fires(_banner_click_probability(probs, flag_values), lift):
                events.append("banner_click")
                event_ts = _track(ld_client, mode, multi_ctx, "banner_click", sf_key, warehouse_events, flag_eval_time)
                if star is not None:
                    star.add_event("banner_click", event_ts, "user", sf_key)

        user_info["journeyType"] = "identified_start"
        user_info["sessionKey"] = session_key

    time.sleep(CONFIG["simulation"]["delay_between_journeys"])

    if star is not None:
        star.end_session(datetime.now(timezone.utc).isoformat())

    return user_info, flag_values, events, warehouse_events


def _new_run_id() -> str:
    """
    Tag for every star row this run writes, so a run can be deleted exactly.

    Mirrors the seed script's run_id = 'seed-v1' convention: Block 0 of
    04_seed_fake_data.sql deletes by run_id precisely so cleanup can never touch
    loader-written rows, and the same holds in reverse.
    """
    return f"sim-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:6]}"


def resolve_profile_from_args(args) -> SimulationProfile:
    if args.profile:
        return PROFILES[args.profile]
    return LD_ONLY_PROFILE


def run_ld_only_simulation(ld_client, records: int) -> None:
    log_filename = f'darktrainers_simulation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
    logger.info("Logging to %s", log_filename)
    logger.info(
        "Delay between journeys: %ss (env: DARKTRAINERS_SIMULATION_DELAY_BETWEEN_JOURNEYS)",
        CONFIG["simulation"]["delay_between_journeys"],
    )
    for i in range(records):
        user_info, flag_values, events, _ = simulate_user_journey_v2(
            ld_client, fake, mode="launchdarkly"
        )
        with open(log_filename, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "user": user_info["key"],
                "tier": user_info["memberTier"],
                "knownVip": user_info["key"].startswith("vip-user-"),
                "knownStandard": user_info["key"].startswith("standard-user-"),
                "lifetimeSpend": user_info.get("lifetimeSpend", 0),
                "journeyType": user_info.get("journeyType", "unknown"),
                "events": events,
                "flags": flag_values,
            }) + "\n")
        if (i + 1) % 50 == 0:
            logger.info("Processed %s/%s", i + 1, records)


def run_profile(profile: SimulationProfile, records: int, create_table: bool) -> int:
    if wants_star_schema() and profile.warehouse != "databricks":
        logger.error(
            "--warehouse-schema %s is Databricks-only — the star schema exists only in "
            "sql/databricks/ and clustered analysis / ratio metrics (the reasons to want a "
            "Snowflake sibling) are Snowflake-only features LaunchDarkly does not offer on "
            "Databricks. Run with --profile test-databricks, or --warehouse-schema legacy.",
            WAREHOUSE_SCHEMA,
        )
        return 1

    try:
        sdk_key = resolve_ld_sdk_key(profile)
    except ValueError as e:
        logger.error("%s", e)
        return 1

    logger.info("Profile: %s (LD key env: %s)", profile.name, profile.ld_sdk_key_env)

    try:
        ld_client = init_ld_client(sdk_key)
    except RuntimeError as e:
        logger.error("%s", e)
        return 1

    if profile.warehouse is None:
        try:
            run_ld_only_simulation(ld_client, records)
            logger.info("Simulation complete.")
            return 0
        finally:
            ld_client.flush()
            ld_client.close()

    journey_mode = profile.warehouse

    try:
        if journey_mode == "bigquery":
            if not BIGQUERY_AVAILABLE:
                logger.error("BigQuery requires google-cloud-bigquery")
                return 1
            bq_client, dataset_id, table_id = get_bigquery_client()
            project_id = bq_client.project
            if create_table:
                create_bq_table_if_not_exists(bq_client, project_id, dataset_id, table_id)
            for i in range(records):
                _, _, _, warehouse_events = simulate_user_journey_v2(
                    ld_client, fake, mode=journey_mode
                )
                insert_metric_events_to_bigquery(
                    bq_client, project_id, dataset_id, table_id, warehouse_events
                )
                if (i + 1) % 50 == 0:
                    logger.info("Processed %s/%s", i + 1, records)

        elif journey_mode == "databricks":
            if not DATABRICKS_AVAILABLE:
                logger.error("Databricks requires databricks-sql-connector")
                return 1
            catalog, schema, table = get_databricks_table_ref()
            write_legacy = wants_legacy_schema()
            write_star = wants_star_schema()
            run_id = _new_run_id() if write_star else None
            conn = get_databricks_connection()
            try:
                if create_table and write_legacy:
                    create_databricks_table_if_not_exists(conn, catalog, schema, table)
                if write_star:
                    # The star DDL is applied by hand (01_star_schema.sql) and is
                    # deliberately not duplicated here — two copies of the schema
                    # would drift. Fail now, with the fix, rather than mid-run.
                    verify_star_tables_exist(conn, catalog, schema)
                    logger.info(
                        "Star schema: writing to %s.%s with run_id=%s "
                        "(undo: DELETE FROM %s.%s.fact_order / fact_engagement_event / "
                        "fact_session WHERE run_id = '%s')",
                        catalog, schema, run_id, catalog, schema, run_id,
                    )
                pending_events = []
                pending_journeys = []
                for i in range(records):
                    star = StarJourney(run_id=run_id) if write_star else None
                    _, _, _, warehouse_events = simulate_user_journey_v2(
                        ld_client, fake, mode=journey_mode, star=star
                    )
                    # In 'star' mode the legacy rows are still generated in memory
                    # (that path is untouched) and simply never written.
                    if write_legacy:
                        pending_events.extend(warehouse_events)
                    if star is not None:
                        pending_journeys.append(star)
                    if write_legacy and len(pending_events) >= 25:
                        insert_metric_events_to_databricks(
                            conn, catalog, schema, table, pending_events
                        )
                        pending_events = []
                    if write_star and len(pending_journeys) >= 25:
                        insert_star_schema_events_databricks(
                            conn, catalog, schema, pending_journeys
                        )
                        pending_journeys = []
                    if (i + 1) % 50 == 0:
                        logger.info("Processed %s/%s", i + 1, records)
                if pending_events:
                    insert_metric_events_to_databricks(
                        conn, catalog, schema, table, pending_events
                    )
                if pending_journeys:
                    insert_star_schema_events_databricks(
                        conn, catalog, schema, pending_journeys
                    )
            finally:
                conn.close()

        elif journey_mode == "snowflake":
            if not SNOWFLAKE_AVAILABLE:
                logger.error("Snowflake requires snowflake-connector-python")
                return 1
            table_ref = get_snowflake_table_ref()
            conn = get_snowflake_connection()
            try:
                if create_table:
                    create_snowflake_table_if_not_exists(conn, table_ref)
                pending_events = []
                for i in range(records):
                    _, _, _, snowflake_events = simulate_user_journey_v2(
                        ld_client, fake, mode=journey_mode, snowflake_conn=conn
                    )
                    pending_events.extend(snowflake_events)
                    if len(pending_events) >= 25:
                        insert_metric_events_to_snowflake(conn, table_ref, pending_events)
                        pending_events = []
                    if (i + 1) % 50 == 0:
                        logger.info("Processed %s/%s", i + 1, records)
                if pending_events:
                    insert_metric_events_to_snowflake(conn, table_ref, pending_events)
            finally:
                conn.close()

        else:
            logger.error("Unknown warehouse backend: %s", journey_mode)
            return 1

        logger.info("Simulation complete.")
        return 0
    finally:
        ld_client.flush()
        ld_client.close()


def main():
    parser = argparse.ArgumentParser(description="DarkTrainers LaunchDarkly simulation")
    parser.add_argument("--records", type=int, default=300, help="Number of user journeys")
    parser.add_argument(
        "--profile",
        choices=list(PROFILES.keys()),
        default=None,
        help="Demo profile: production-bq (Production LD + BigQuery), "
        "test-databricks (Test LD + Databricks), or snowflake (Snowflake LD + Snowflake)",
    )
    parser.add_argument(
        "--create-table",
        action="store_true",
        help="Create the metrics table before running (BigQuery, Databricks, or Snowflake)",
    )
    parser.add_argument(
        "--context-mode",
        choices=["multi", "user"],
        default="multi",
        help="multi (default): mixed guest-only, guest->identified, and identified "
        "journeys. user: user contexts only (known CSV users plus freshly generated "
        "unique-key users), identified from start, with flags evaluated and metrics "
        "tracked on the user context (clean, large population for user-randomized "
        "experiments; no metric-schema change).",
    )
    parser.add_argument(
        "--warehouse-schema",
        choices=list(WAREHOUSE_SCHEMA_CHOICES),
        default="legacy",
        help="Which warehouse projection to write. legacy (default): only the flat "
        "metric_events table, exactly as before this option existed — every existing "
        "invocation is unaffected. star: only the dimensional tables (dim_customer, "
        "fact_session, fact_engagement_event, fact_order). both: write both projections "
        "from the same journeys. star/both are Databricks-only and require "
        "--profile test-databricks with sql/databricks/01_star_schema.sql already applied.",
    )
    parser.add_argument(
        "--force-flag",
        default=None,
        help="Force an experiment winner: flag key whose winning arm gets a metric lift",
    )
    parser.add_argument(
        "--force-variation",
        type=int,
        default=None,
        help="Variation index (0-based) that should win; metrics lift when this variation is served",
    )
    parser.add_argument(
        "--force-lift",
        type=float,
        default=None,
        help="Absolute probability points added to each metric event on the winning arm "
        "(e.g. 0.12 = +12 percentage points). Must be 0-1.",
    )
    args = parser.parse_args()

    global WAREHOUSE_SCHEMA
    WAREHOUSE_SCHEMA = args.warehouse_schema
    if WAREHOUSE_SCHEMA != "legacy":
        logger.info(
            "WAREHOUSE SCHEMA: %s — %s. Star rows are tagged with a per-run run_id so "
            "they can be deleted exactly; dim_product is never written (refresh it by "
            "hand with Block 1 of sql/databricks/04_seed_fake_data.sql after a catalog "
            "change).",
            WAREHOUSE_SCHEMA,
            "star tables only, metric_events untouched" if WAREHOUSE_SCHEMA == "star"
            else "both metric_events and the star tables",
        )
        if not PRODUCT_CATALOG:
            logger.warning(
                "No products parsed from productData.ts — star rows will carry NULL "
                "product keys and dim_product will not join."
            )

    global CONTEXT_MODE
    CONTEXT_MODE = args.context_mode
    if CONTEXT_MODE == "user":
        logger.info(
            "CONTEXT MODE: user — user contexts only (known + freshly generated), "
            "identified-from-start; flags evaluated and metrics tracked on the user context."
        )

    force_args = (args.force_flag, args.force_variation, args.force_lift)
    if any(a is not None for a in force_args):
        if any(a is None for a in force_args):
            parser.error(
                "--force-flag, --force-variation, and --force-lift must be used together"
            )
        if args.force_variation < 0:
            parser.error("--force-variation must be >= 0")
        if not 0.0 <= args.force_lift <= 1.0:
            parser.error("--force-lift must be between 0.0 and 1.0")
        global FORCE_WINNER
        FORCE_WINNER = ForceWinner(
            flag_key=args.force_flag,
            variation_index=args.force_variation,
            lift=args.force_lift,
        )
        logger.warning(
            "FORCE WINNER ACTIVE: flag '%s' variation %d gets +%.1f pp on every metric "
            "event. Output is intentionally skewed — do not use for real analysis.",
            FORCE_WINNER.flag_key,
            FORCE_WINNER.variation_index,
            FORCE_WINNER.lift * 100,
        )

    profile = resolve_profile_from_args(args)
    return run_profile(profile, args.records, args.create_table)


if __name__ == "__main__":
    exit(main())
