#!/usr/bin/env python3
"""
DarkTrainers LaunchDarkly simulation — sneaker commerce contexts with memberTier skew.

Generates identified users (~70% standard / 30% VIP), evaluates DarkTrainers flags,
and tracks product_viewed, add_to_cart, checkout_initiated, vip_upgrade, banner_click.

VIP users have higher lifetimeSpend and much higher checkout values/frequency than standard
(intentional imbalance for stratified sampling demos).
"""

import os
import time
import uuid
import json
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


def generate_user_context():
    """~70% standard / 30% VIP; US-only; VIP has 4–5x higher lifetime spend on average."""
    is_vip = random.random() < 0.30
    member_tier = "vip" if is_vip else "standard"
    context_key = str(uuid.uuid4())
    name = fake.name()
    email = fake.email()
    state = fake.state_abbr()
    preferred = random.choice(CATEGORIES)

    if is_vip:
        lifetime_spend = random.uniform(900, 4200)
        member_since = fake.date_between(start_date='-4y', end_date='-1y').isoformat()
        early_access = True
    else:
        lifetime_spend = random.uniform(40, 520)
        member_since = fake.date_between(start_date='-2y', end_date='-30d').isoformat()
        early_access = False

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


def simulate_user_journey_v2(ld_client, fake, mode='launchdarkly', snowflake_conn=None):
    context, user_info = generate_user_context()
    member_tier = user_info["memberTier"]

    plp_sort = ld_client.variation("plp-sort-default", context, "featured")
    show_vip_pricing = ld_client.variation("show-vip-pricing", context, False)
    promo = ld_client.variation("promo-banner-text", context, "")

    events = []
    snowflake_events = []
    flag_eval_time = datetime.now(timezone.utc)

    # Synthetic product price for metrics
    product_price = round(random.uniform(130, 210), 2)

    if mode == 'launchdarkly':
        ld_client.track("product_viewed", context, metric_value=product_price)
    else:
        snowflake_events.append(generate_metric_event_data(
            user_info["key"], "product_viewed", event_value=product_price, flag_eval_time=flag_eval_time
        ))
    events.append("product_viewed")

    # add_to_cart: VIP much more likely
    p_cart = 0.55 if member_tier == "vip" else 0.12
    if random.random() < p_cart:
        events.append("add_to_cart")
        if mode == 'launchdarkly':
            ld_client.track("add_to_cart", context, metric_value=product_price)
        else:
            snowflake_events.append(generate_metric_event_data(
                user_info["key"], "add_to_cart", event_value=product_price, flag_eval_time=flag_eval_time
            ))

    # checkout_initiated: strong VIP skew (rate and cart total)
    if member_tier == "vip":
        p_checkout = 0.42
        cart_total = max(0, random.gauss(380, 85))
    else:
        p_checkout = 0.08
        cart_total = max(0, random.gauss(102, 22))

    if random.random() < p_checkout:
        cart_total = round(cart_total, 2)
        events.append("checkout_initiated")
        if mode == 'launchdarkly':
            ld_client.track("checkout_initiated", context, metric_value=cart_total)
        else:
            snowflake_events.append(generate_metric_event_data(
                user_info["key"], "checkout_initiated", event_value=cart_total, flag_eval_time=flag_eval_time
            ))

    # vip_upgrade only for standard tier in sim
    if member_tier == "standard" and random.random() < 0.06:
        events.append("vip_upgrade")
        if mode == 'launchdarkly':
            ld_client.track("vip_upgrade", context, metric_value=14.99)
        else:
            snowflake_events.append(generate_metric_event_data(
                user_info["key"], "vip_upgrade", event_value=14.99, flag_eval_time=flag_eval_time
            ))

    if promo and random.random() < 0.08:
        events.append("banner_click")
        if mode == 'launchdarkly':
            ld_client.track("banner_click", context)
        else:
            snowflake_events.append(generate_metric_event_data(
                user_info["key"], "banner_click", flag_eval_time=flag_eval_time
            ))

    if mode == 'launchdarkly':
        ld_client.flush()
        time.sleep(0.001)

    flag_values = {
        "plpSort": plp_sort,
        "showVipPricing": show_vip_pricing,
        "promoBanner": promo,
    }
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
                    "lifetimeSpend": user_info["lifetimeSpend"],
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
