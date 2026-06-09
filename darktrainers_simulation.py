#!/usr/bin/env python3
"""
DarkTrainers LaunchDarkly simulation — session / multi-context journeys with VIP CSV pool.

Models guest-only, guest→identified, and identified-from-start journeys; evaluates flags on the
appropriate LaunchDarkly context; tracks commerce events with metric values for experimentation demos.
"""

import os
import time
import uuid
import json
import csv
import random
import argparse
import logging
from dataclasses import dataclass
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
        },
        "standard": {
            "add_to_cart": 0.12,
            "checkout_initiated": 0.08,
            "vip_upgrade": 0.06,
            "banner_click": 0.08,
        },
        "guest": {
            "add_to_cart": 0.07,
            "checkout_initiated": 0.03,
            "vip_upgrade": 0.0,
            "banner_click": 0.10,
        },
    },
    "simulation": {
        "delay_between_journeys": _get_env_float("DARKTRAINERS_SIMULATION_DELAY_BETWEEN_JOURNEYS", 2.0),
    },
}

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
}

LEGACY_SNOWFLAKE_PROFILE = SimulationProfile(
    name="snowflake-legacy",
    ld_sdk_key_env="LAUNCHDARKLY_SDK_KEY",
    warehouse="snowflake",
)

LD_ONLY_PROFILE = SimulationProfile(
    name="launchdarkly-only",
    ld_sdk_key_env="LAUNCHDARKLY_SDK_KEY",
    warehouse=None,
)


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


def insert_metric_event_to_snowflake(conn, event_data):
    table_name = os.getenv('SNOWFLAKE_METRIC_EVENTS_TABLE')
    if not table_name:
        raise ValueError("SNOWFLAKE_METRIC_EVENTS_TABLE environment variable is required")

    cursor = conn.cursor()
    insert_sql = f"""
    INSERT INTO {table_name} (
        EVENT_ID, EVENT_KEY, CONTEXT_KIND, CONTEXT_KEY,
        EVENT_VALUE, RECEIVED_TIME
    ) VALUES (%s, %s, %s, %s, %s, %s)
    """
    try:
        cursor.execute(insert_sql, (
            event_data['event_id'],
            event_data['event_key'],
            event_data['context_kind'],
            event_data['context_key'],
            event_data['event_value'],
            event_data['received_time']
        ))
        conn.commit()
    except Exception as e:
        logger.error(f"Error inserting metric event: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()


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


def generate_metric_event_data(user_key, event_key, event_value=None, flag_eval_time=None):
    event_id = str(uuid.uuid4())
    if flag_eval_time:
        offset_minutes = random.uniform(5, 10)
        received_time = flag_eval_time + timedelta(minutes=offset_minutes)
    else:
        received_time = datetime.now(timezone.utc)

    return {
        'event_id': event_id,
        'event_key': event_key,
        'context_kind': 'user',
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


def _eval_session_flags(ld_client, eval_ctx) -> dict:
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
            default = "standard"
            out[flag_key] = ld_client.variation(flag_key, eval_ctx, default)
    return out


def _eval_identified_flags(ld_client, eval_ctx) -> dict:
    out = {}
    for flag_key in CONFIG["flags"]["identified_flags"]:
        if flag_key == "pdp-hero-layout":
            val = ld_client.variation(flag_key, eval_ctx, "standard")
            out["pdpHeroLayout"] = val
        elif flag_key == "vip-upgrade-cta-copy":
            val = ld_client.variation(flag_key, eval_ctx, "Join VIP")
            out["vipUpgradeCtaCopy"] = val
        else:
            out[flag_key] = ld_client.variation(flag_key, eval_ctx, None)
    return out


def _eval_all_flags_on_multi(ld_client, multi_ctx) -> dict:
    merged = {}
    merged.update(_eval_session_flags(ld_client, multi_ctx))
    merged.update(_eval_identified_flags(ld_client, multi_ctx))
    return merged


def _track(ld_client, mode, track_ctx, event_key, user_key_sf, warehouse_events, flag_eval_time, metric_value=None):
    if mode == 'launchdarkly':
        if metric_value is not None:
            ld_client.track(event_key, track_ctx, metric_value=metric_value)
        else:
            ld_client.track(event_key, track_ctx)
    else:
        warehouse_events.append(generate_metric_event_data(
            user_key_sf, event_key, event_value=metric_value, flag_eval_time=flag_eval_time
        ))


def simulate_user_journey_v2(ld_client, fake, mode='launchdarkly', snowflake_conn=None):
    events = []
    warehouse_events = []
    flag_eval_time = datetime.now(timezone.utc)
    flag_values = {}
    journey = _pick_journey_type()

    pr_lo, pr_hi = CONFIG["products"]["price_range"]
    product_price = round(random.uniform(pr_lo, pr_hi), 2)

    session_key = str(uuid.uuid4())
    session_ctx = _session_context(session_key)

    if journey == "A":
        # Guest only — session context only
        flag_values.update(_eval_session_flags(ld_client, session_ctx))

        _track(ld_client, mode, session_ctx, "product_viewed", session_key, warehouse_events, flag_eval_time, metric_value=product_price)
        events.append("product_viewed")

        gprob = CONFIG["event_probabilities"]["guest"]
        if random.random() < gprob["add_to_cart"]:
            events.append("add_to_cart")
            _track(ld_client, mode, session_ctx, "add_to_cart", session_key, warehouse_events, flag_eval_time, metric_value=product_price)

        if flag_values.get("promoBanner"):
            if random.random() < _banner_click_probability(gprob, flag_values):
                events.append("banner_click")
                _track(ld_client, mode, session_ctx, "banner_click", session_key, warehouse_events, flag_eval_time)

        user_info = {
            "key": session_key,
            "memberTier": "guest",
            "lifetimeSpend": 0,
            "journeyType": "guest_only",
        }

    elif journey == "B":
        # Guest → identified; same session_key across identify()
        ld_client.identify(session_ctx)
        flag_values.update(_eval_session_flags(ld_client, session_ctx))

        _track(ld_client, mode, session_ctx, "product_viewed", session_key, warehouse_events, flag_eval_time, metric_value=product_price)
        events.append("product_viewed")

        user_record = _pick_user_record()
        user_ctx, user_info = generate_user_context(user_record)
        multi_ctx = _multi_context(session_ctx, user_ctx)
        ld_client.identify(multi_ctx)

        flag_values.update(_eval_identified_flags(ld_client, multi_ctx))

        tier = user_info["memberTier"]
        probs = CONFIG["event_probabilities"][tier]
        sf_key = user_info["key"]

        if random.random() < probs["add_to_cart"]:
            events.append("add_to_cart")
            _track(ld_client, mode, multi_ctx, "add_to_cart", sf_key, warehouse_events, flag_eval_time, metric_value=product_price)

        checkout_prob = min(1.0, probs["checkout_initiated"] * (1.10 if flag_values.get("pdpHeroLayout") == "editorial" else 1.0))
        if random.random() < checkout_prob:
            cart_total = _sample_checkout_total(tier)
            events.append("checkout_initiated")
            _track(ld_client, mode, multi_ctx, "checkout_initiated", sf_key, warehouse_events, flag_eval_time, metric_value=cart_total)

        if tier == "standard" and random.random() < probs["vip_upgrade"]:
            events.append("vip_upgrade")
            _track(ld_client, mode, multi_ctx, "vip_upgrade", sf_key, warehouse_events, flag_eval_time, metric_value=14.99)

        if flag_values.get("promoBanner"):
            if random.random() < _banner_click_probability(probs, flag_values):
                events.append("banner_click")
                _track(ld_client, mode, multi_ctx, "banner_click", sf_key, warehouse_events, flag_eval_time)

        user_info["journeyType"] = "guest_transition"
        user_info["sessionKey"] = session_key

    else:
        # Identified from start — multi(session + user) immediately
        user_record = _pick_user_record()
        user_ctx, user_info = generate_user_context(user_record)
        multi_ctx = _multi_context(session_ctx, user_ctx)
        ld_client.identify(multi_ctx)

        flag_values.update(_eval_all_flags_on_multi(ld_client, multi_ctx))

        tier = user_info["memberTier"]
        probs = CONFIG["event_probabilities"][tier]
        sf_key = user_info["key"]

        _track(ld_client, mode, multi_ctx, "product_viewed", sf_key, warehouse_events, flag_eval_time, metric_value=product_price)
        events.append("product_viewed")

        if random.random() < probs["add_to_cart"]:
            events.append("add_to_cart")
            _track(ld_client, mode, multi_ctx, "add_to_cart", sf_key, warehouse_events, flag_eval_time, metric_value=product_price)

        checkout_prob = min(1.0, probs["checkout_initiated"] * (1.10 if flag_values.get("pdpHeroLayout") == "editorial" else 1.0))
        if random.random() < checkout_prob:
            cart_total = _sample_checkout_total(tier)
            events.append("checkout_initiated")
            _track(ld_client, mode, multi_ctx, "checkout_initiated", sf_key, warehouse_events, flag_eval_time, metric_value=cart_total)

        if tier == "standard" and random.random() < probs["vip_upgrade"]:
            events.append("vip_upgrade")
            _track(ld_client, mode, multi_ctx, "vip_upgrade", sf_key, warehouse_events, flag_eval_time, metric_value=14.99)

        if flag_values.get("promoBanner"):
            if random.random() < _banner_click_probability(probs, flag_values):
                events.append("banner_click")
                _track(ld_client, mode, multi_ctx, "banner_click", sf_key, warehouse_events, flag_eval_time)

        user_info["journeyType"] = "identified_start"
        user_info["sessionKey"] = session_key

    ld_client.flush()
    time.sleep(CONFIG["simulation"]["delay_between_journeys"])

    return user_info, flag_values, events, warehouse_events


def resolve_profile_from_args(args) -> SimulationProfile:
    if args.profile:
        return PROFILES[args.profile]
    if args.mode == "bigquery":
        logger.warning(
            "--mode bigquery is deprecated; use --profile production-bq instead"
        )
        return PROFILES["production-bq"]
    if args.mode == "snowflake":
        return LEGACY_SNOWFLAKE_PROFILE
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
            conn = get_databricks_connection()
            try:
                if create_table:
                    create_databricks_table_if_not_exists(conn, catalog, schema, table)
                pending_events = []
                for i in range(records):
                    _, _, _, warehouse_events = simulate_user_journey_v2(
                        ld_client, fake, mode=journey_mode
                    )
                    pending_events.extend(warehouse_events)
                    if len(pending_events) >= 25:
                        insert_metric_events_to_databricks(
                            conn, catalog, schema, table, pending_events
                        )
                        pending_events = []
                    if (i + 1) % 50 == 0:
                        logger.info("Processed %s/%s", i + 1, records)
                if pending_events:
                    insert_metric_events_to_databricks(
                        conn, catalog, schema, table, pending_events
                    )
            finally:
                conn.close()

        elif journey_mode == "snowflake":
            if not SNOWFLAKE_AVAILABLE:
                logger.error("Snowflake requires snowflake-connector-python")
                return 1
            conn = get_snowflake_connection()
            try:
                for i in range(records):
                    _, _, _, snowflake_events = simulate_user_journey_v2(
                        ld_client, fake, mode=journey_mode, snowflake_conn=conn
                    )
                    for event_data in snowflake_events:
                        insert_metric_event_to_snowflake(conn, event_data)
                    if (i + 1) % 50 == 0:
                        logger.info("Processed %s/%s", i + 1, records)
            finally:
                conn.close()

        else:
            logger.error("Unknown warehouse backend: %s", journey_mode)
            return 1

        logger.info("Simulation complete.")
        return 0
    finally:
        ld_client.close()


def main():
    parser = argparse.ArgumentParser(description="DarkTrainers LaunchDarkly simulation")
    parser.add_argument("--records", type=int, default=300, help="Number of user journeys")
    parser.add_argument(
        "--profile",
        choices=list(PROFILES.keys()),
        default=None,
        help="Demo profile: production-bq (Production LD + BigQuery) or "
        "test-databricks (Test LD + Databricks)",
    )
    parser.add_argument(
        "--mode",
        choices=["launchdarkly", "snowflake", "bigquery"],
        default="launchdarkly",
        help="Legacy mode selector (use --profile for warehouse runs)",
    )
    parser.add_argument(
        "--create-table",
        action="store_true",
        help="Create the metrics table before running (BigQuery or Databricks)",
    )
    args = parser.parse_args()

    if args.profile and args.mode == "bigquery":
        logger.warning("Both --profile and --mode bigquery set; using --profile")

    profile = resolve_profile_from_args(args)
    return run_profile(profile, args.records, args.create_table)


if __name__ == "__main__":
    exit(main())
