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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('darktrainers-simulation')

fake = Faker()

CONFIG = {
    "vip_csv_path": "vip_users.csv",
    "vip_ratio": 0.50,
    "guest_transition_ratio": 0.40,
    "flags": {
        "session_flags": ["promo-banner-text"],
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
        "delay_between_journeys": 2.0,
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


VIP_USER_POOL = _load_vip_user_pool()

CATEGORIES = ["running", "basketball", "lifestyle", "training"]


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
    ctx = Context.builder(key) \
        .kind("user") \
        .name(record["name"]) \
        .set("country", "US") \
        .set("state", "CA") \
        .set("memberTier", "vip") \
        .set("memberSince", record["memberSince"]) \
        .set("lifetimeSpend", round(lifetime_spend, 2)) \
        .set("preferredCategory", record["preferredCategory"]) \
        .set("earlyAccessEnabled", True) \
        .build()
    user_info = {
        "key": key,
        "name": record["name"],
        "email": "",
        "country": "US",
        "state": "CA",
        "memberTier": "vip",
        "memberSince": record["memberSince"],
        "lifetimeSpend": round(lifetime_spend, 2),
        "preferredCategory": record["preferredCategory"],
        "earlyAccessEnabled": True,
    }
    return ctx, user_info


def generate_user_context(user_record=None):
    """
    Build a kind:user Context and user_info dict.
    If user_record is provided (VIP CSV row), use stable user_key and row attributes.
    If not, generate a random standard user with a UUID key.
    """
    if user_record is not None:
        return _identified_context_from_vip_record(user_record)

    context_key = str(uuid.uuid4())
    name = fake.name()
    email = fake.email()
    state = fake.state_abbr()
    preferred = random.choice(CATEGORIES)
    lifetime_spend = random.uniform(40, 520)
    member_since = fake.date_between(start_date='-2y', end_date='-30d').isoformat()

    ctx = Context.builder(context_key) \
        .kind("user") \
        .name(name) \
        .set("email", email) \
        .set("country", "US") \
        .set("state", state) \
        .set("memberTier", "standard") \
        .set("memberSince", member_since) \
        .set("lifetimeSpend", round(lifetime_spend, 2)) \
        .set("preferredCategory", preferred) \
        .set("earlyAccessEnabled", False) \
        .build()

    user_info = {
        "key": context_key,
        "name": name,
        "email": email,
        "country": "US",
        "state": state,
        "memberTier": "standard",
        "memberSince": member_since,
        "lifetimeSpend": round(lifetime_spend, 2),
        "preferredCategory": preferred,
        "earlyAccessEnabled": False,
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


def _pick_vip_record_or_none():
    """Return a VIP CSV row dict with probability vip_ratio, else None (standard UUID user)."""
    if VIP_USER_POOL and random.random() < CONFIG["vip_ratio"]:
        return random.choice(VIP_USER_POOL)
    return None


def _sample_product_price() -> float:
    lo, hi = CONFIG["products"]["price_range"]
    return round(random.uniform(lo, hi), 2)


def _sample_checkout_total(tier: str) -> float:
    if tier == "vip":
        cfg = CONFIG["aov"]["vip"]
    else:
        cfg = CONFIG["aov"]["standard"]
    return max(0.0, round(random.gauss(cfg["mean"], cfg["stddev"]), 2))


def _eval_session_flags(ld_client, eval_ctx) -> dict:
    out = {}
    for flag_key in CONFIG["flags"]["session_flags"]:
        default = "" if "promo" in flag_key else "standard"
        val = ld_client.variation(flag_key, eval_ctx, default)
        if flag_key == "promo-banner-text":
            out["promoBanner"] = val
        else:
            out[flag_key] = val
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


def _track(ld_client, mode, track_ctx, event_key, user_key_sf, snowflake_events, flag_eval_time, metric_value=None):
    if mode == 'launchdarkly':
        if metric_value is not None:
            ld_client.track(event_key, track_ctx, metric_value=metric_value)
        else:
            ld_client.track(event_key, track_ctx)
    else:
        snowflake_events.append(generate_metric_event_data(
            user_key_sf, event_key, event_value=metric_value, flag_eval_time=flag_eval_time
        ))


def simulate_user_journey_v2(ld_client, fake, mode='launchdarkly', snowflake_conn=None):
    events = []
    snowflake_events = []
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

        _track(ld_client, mode, session_ctx, "product_viewed", session_key, snowflake_events, flag_eval_time, metric_value=product_price)
        events.append("product_viewed")

        gprob = CONFIG["event_probabilities"]["guest"]
        if random.random() < gprob["add_to_cart"]:
            events.append("add_to_cart")
            _track(ld_client, mode, session_ctx, "add_to_cart", session_key, snowflake_events, flag_eval_time, metric_value=product_price)

        if random.random() < gprob["banner_click"] and flag_values.get("promoBanner"):
            events.append("banner_click")
            _track(ld_client, mode, session_ctx, "banner_click", session_key, snowflake_events, flag_eval_time)

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

        _track(ld_client, mode, session_ctx, "product_viewed", session_key, snowflake_events, flag_eval_time, metric_value=product_price)
        events.append("product_viewed")

        vip_record = _pick_vip_record_or_none()
        user_ctx, user_info = generate_user_context(vip_record)
        multi_ctx = _multi_context(session_ctx, user_ctx)
        ld_client.identify(multi_ctx)

        flag_values.update(_eval_identified_flags(ld_client, multi_ctx))

        tier = user_info["memberTier"]
        probs = CONFIG["event_probabilities"][tier]
        sf_key = user_info["key"]

        if random.random() < probs["add_to_cart"]:
            events.append("add_to_cart")
            _track(ld_client, mode, multi_ctx, "add_to_cart", sf_key, snowflake_events, flag_eval_time, metric_value=product_price)

        if random.random() < probs["checkout_initiated"]:
            cart_total = _sample_checkout_total(tier)
            events.append("checkout_initiated")
            _track(ld_client, mode, multi_ctx, "checkout_initiated", sf_key, snowflake_events, flag_eval_time, metric_value=cart_total)

        if tier == "standard" and random.random() < probs["vip_upgrade"]:
            events.append("vip_upgrade")
            _track(ld_client, mode, multi_ctx, "vip_upgrade", sf_key, snowflake_events, flag_eval_time, metric_value=14.99)

        if flag_values.get("promoBanner") and random.random() < probs["banner_click"]:
            events.append("banner_click")
            _track(ld_client, mode, multi_ctx, "banner_click", sf_key, snowflake_events, flag_eval_time)

        user_info["journeyType"] = "guest_transition"
        user_info["sessionKey"] = session_key

    else:
        # Identified from start — multi(session + user) immediately
        vip_record = _pick_vip_record_or_none()
        user_ctx, user_info = generate_user_context(vip_record)
        multi_ctx = _multi_context(session_ctx, user_ctx)
        ld_client.identify(multi_ctx)

        flag_values.update(_eval_all_flags_on_multi(ld_client, multi_ctx))

        tier = user_info["memberTier"]
        probs = CONFIG["event_probabilities"][tier]
        sf_key = user_info["key"]

        _track(ld_client, mode, multi_ctx, "product_viewed", sf_key, snowflake_events, flag_eval_time, metric_value=product_price)
        events.append("product_viewed")

        if random.random() < probs["add_to_cart"]:
            events.append("add_to_cart")
            _track(ld_client, mode, multi_ctx, "add_to_cart", sf_key, snowflake_events, flag_eval_time, metric_value=product_price)

        if random.random() < probs["checkout_initiated"]:
            cart_total = _sample_checkout_total(tier)
            events.append("checkout_initiated")
            _track(ld_client, mode, multi_ctx, "checkout_initiated", sf_key, snowflake_events, flag_eval_time, metric_value=cart_total)

        if tier == "standard" and random.random() < probs["vip_upgrade"]:
            events.append("vip_upgrade")
            _track(ld_client, mode, multi_ctx, "vip_upgrade", sf_key, snowflake_events, flag_eval_time, metric_value=14.99)

        if flag_values.get("promoBanner") and random.random() < probs["banner_click"]:
            events.append("banner_click")
            _track(ld_client, mode, multi_ctx, "banner_click", sf_key, snowflake_events, flag_eval_time)

        user_info["journeyType"] = "identified_start"
        user_info["sessionKey"] = session_key

    if mode == 'launchdarkly':
        ld_client.flush()
        time.sleep(CONFIG["simulation"]["delay_between_journeys"])

    return user_info, flag_values, events, snowflake_events


def main():
    parser = argparse.ArgumentParser(description='DarkTrainers LaunchDarkly simulation')
    parser.add_argument('--records', type=int, default=300, help='Number of user journeys')
    parser.add_argument('--mode', choices=['launchdarkly', 'snowflake'], default='launchdarkly')
    args = parser.parse_args()

    sdk_key = os.getenv('LAUNCHDARKLY_SDK_KEY')
    if not sdk_key and args.mode == 'launchdarkly':
        logger.error("LAUNCHDARKLY_SDK_KEY environment variable is not set")
        return 1

    if args.mode == 'launchdarkly':
        ldclient.set_config(Config(sdk_key))
        ld_client = ldclient.get()
        if not ld_client.is_initialized():
            logger.error("LaunchDarkly client failed to initialize")
            return 1

        log_filename = f'darktrainers_simulation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
        logger.info(f"Logging to {log_filename}")

        for i in range(args.records):
            user_info, flag_values, events, _ = simulate_user_journey_v2(ld_client, fake, mode='launchdarkly')
            with open(log_filename, 'a') as f:
                f.write(json.dumps({
                    "user": user_info["key"],
                    "tier": user_info["memberTier"],
                    "lifetimeSpend": user_info.get("lifetimeSpend", 0),
                    "events": events,
                    "flags": flag_values,
                }) + "\n")
            if (i + 1) % 50 == 0:
                logger.info("Processed %s/%s", i + 1, args.records)

        ld_client.close()
        logger.info("Simulation complete.")
        return 0

    if args.mode == 'snowflake':
        if not SNOWFLAKE_AVAILABLE:
            logger.error("Snowflake mode requires snowflake-connector-python")
            return 1
        ldclient.set_config(Config(sdk_key))
        ld_client = ldclient.get()
        if not ld_client.is_initialized():
            logger.error("LaunchDarkly client failed to initialize")
            return 1
        conn = get_snowflake_connection()
        try:
            for i in range(args.records):
                _, _, _, snowflake_events = simulate_user_journey_v2(
                    ld_client, fake, mode='snowflake', snowflake_conn=conn
                )
                for event_data in snowflake_events:
                    insert_metric_event_to_snowflake(conn, event_data)
                if (i + 1) % 50 == 0:
                    logger.info("Processed %s/%s", i + 1, args.records)
        finally:
            conn.close()
            ld_client.close()
        return 0

    return 0


if __name__ == "__main__":
    exit(main())
