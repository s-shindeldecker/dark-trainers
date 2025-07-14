#!/usr/bin/env python3
"""
Gravity Farms Petfood LaunchDarkly Experiment Simulation

Simulates user contexts, evaluates the 'number-of-days-trial' flag,
and tracks outcome events for LaunchDarkly experiment analysis.
Supports both LaunchDarkly SDK tracking and Snowflake data insertion.
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

# Optional Snowflake import
try:
    import snowflake.connector
    SNOWFLAKE_AVAILABLE = True
except ImportError:
    SNOWFLAKE_AVAILABLE = False
    print("Warning: snowflake-connector-python not installed. Snowflake mode will not be available.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('gravityfarms-simulation')

fake = Faker()

COUNTRIES = ["US", "UK", "FR", "DE", "CA"]
PET_TYPES = ["dog", "cat", "both"]
PLAN_TYPES = ["basic", "premium", "trial"]
PAYMENT_TYPES = ["credit_card", "paypal", "apple_pay", "google_pay", "bank"]

def get_snowflake_connection():
    """Create and return a Snowflake connection."""
    if not SNOWFLAKE_AVAILABLE:
        raise ImportError("snowflake-connector-python is not installed")
    
    # Get Snowflake connection parameters from environment
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
    
    # Create connection
    conn_params = {
        'account': account,
        'user': user,
        'warehouse': warehouse,
        'database': database,
        'schema': schema,
        'role': role,
        'session_parameters': {'TIMEZONE': 'UTC'}
    }
    
    # Use private key if available, otherwise password
    if private_key:
        conn_params['private_key'] = private_key
        if private_key_passphrase:
            conn_params['private_key_passphrase'] = private_key_passphrase
    elif password:
        conn_params['password'] = password
    else:
        raise ValueError("Either SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY must be set")
    
    return snowflake.connector.connect(**conn_params)

def insert_metric_event_to_snowflake(conn, event_data):
    """Insert a metric event into Snowflake following LaunchDarkly schema."""
    table_name = os.getenv('SNOWFLAKE_METRIC_EVENTS_TABLE')
    if not table_name:
        raise ValueError("SNOWFLAKE_METRIC_EVENTS_TABLE environment variable is required")
    
    cursor = conn.cursor()
    
    # Prepare the insert statement
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
        logger.debug(f"Inserted metric event: {event_data['event_key']} for user: {event_data['context_key']}")
    except Exception as e:
        logger.error(f"Error inserting metric event: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()

def generate_metric_event_data(user_key, event_key, event_value=None, flag_eval_time=None):
    """Generate metric event data with proper timestamp handling."""
    # Generate full UUID for event ID
    event_id = str(uuid.uuid4())
    
    # If flag_eval_time is provided, add 5-10 minutes for causality
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
        'event_value': event_value,  # None for conversion events, numeric for revenue
        'received_time': received_time.isoformat()
    }

def generate_user_context():
    country = random.choice(COUNTRIES)
    pet_type = random.choice(PET_TYPES)
    plan_type = random.choice(PLAN_TYPES)
    payment_type = random.choice(PAYMENT_TYPES)
    state = fake.state_abbr() if country in ["US", "CA"] else fake.city()
    context_key = str(uuid.uuid4())
    name = fake.name()
    return Context.builder(context_key) \
        .kind("user") \
        .name(name) \
        .set("country", country) \
        .set("state", state) \
        .set("petType", pet_type) \
        .set("planType", plan_type) \
        .set("paymentType", payment_type) \
        .build(), {
            "key": context_key,
            "country": country,
            "state": state,
            "petType": pet_type,
            "planType": plan_type,
            "paymentType": payment_type,
            "name": name
        }

def generate_revenue(plan_type, country):
    base_prices = {
        "basic": {"US": 29.99, "CA": 39.99, "UK": 24.99, "EU": 27.99},
        "premium": {"US": 49.99, "CA": 64.99, "UK": 39.99, "EU": 44.99},
        "deluxe": {"US": 79.99, "CA": 99.99, "UK": 59.99, "EU": 66.99}
    }
    region = "EU" if country in ("FR", "DE") else country
    base_price = base_prices.get(plan_type, base_prices["basic"]).get(region, base_prices["basic"]["US"])
    return round(base_price * random.uniform(0.9, 1.1), 2)

def calculate_adjusted_revenue(total_revenue, trial_days, plan_type, country):
    base_prices = {
        "basic": {"US": 29.99, "CA": 39.99, "UK": 24.99, "EU": 27.99},
        "premium": {"US": 49.99, "CA": 64.99, "UK": 39.99, "EU": 44.99},
        "deluxe": {"US": 79.99, "CA": 99.99, "UK": 59.99, "EU": 66.99}
    }
    region = "EU" if country in ("FR", "DE") else country
    monthly_price = base_prices.get(plan_type, base_prices["basic"]).get(region, base_prices["basic"]["US"])
    daily_rate = monthly_price / 30
    trial_cost = daily_rate * trial_days
    return max(0, round(total_revenue - trial_cost, 2))

def simulate_user_journey_v2(ld_client, fake, mode='launchdarkly', snowflake_conn=None):
    import time
    import random
    import json
    from datetime import datetime
    user_info = None
    context, user_info = generate_user_context()
    
    # Evaluate the flags with variation_detail
    trial_days_detail = ld_client.variation_detail('number-of-days-trial', context, 7)
    seasonal_banner = ld_client.variation('seasonal-sale-banner-text', context, "")
    hero_banner_detail = ld_client.variation_detail('hero-banner-text', context, {})
    
    # Log the full variation_detail objects for debugging
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_key": user_info["key"],
        "trial_days_detail": {
            "value": trial_days_detail.value,
            "variation_index": getattr(trial_days_detail, "variation_index", None),
            "reason": getattr(trial_days_detail, "reason", None),
            "raw": str(trial_days_detail)
        },
        "hero_banner_detail": {
            "value": hero_banner_detail.value,
            "variation_index": getattr(hero_banner_detail, "variation_index", None),
            "reason": getattr(hero_banner_detail, "reason", None),
            "raw": str(hero_banner_detail)
        },
        "seasonal_banner": seasonal_banner
    }
    
    # Write to JSONL file - let post-analysis determine experiment assignment
    with open("experiment_assignments.jsonl", "a") as f:
        f.write(json.dumps(log_entry) + "\n")
    
    # Branch simulation logic based on heroBanner variation
    hero_banner_text = None
    if isinstance(hero_banner_detail.value, dict):
        hero_banner_text = hero_banner_detail.value.get("banner-text", "")
    else:
        hero_banner_text = str(hero_banner_detail.value)
    
    variant_conversion_rate = {
        "Control": 0.05,
        "Variant 1": 0.07,
        "Next Generation": 0.09
    }
    variant_revenue_mean = {
        "Control": 30.0,
        "Variant 1": 35.0,
        "Next Generation": 40.0
    }
    variant = "Control"
    if "control" in hero_banner_text.lower():
        variant = "Control"
    elif "next" in hero_banner_text.lower():
        variant = "Next Generation"
    elif "variant" in hero_banner_text.lower() or "top" in hero_banner_text.lower():
        variant = "Variant 1"
    
    # Initialize events list
    events = ["page_view"]
    snowflake_events = []
    flag_eval_time = datetime.now(timezone.utc)
    
    did_signup = random.random() < variant_conversion_rate[variant]
    if did_signup:
        events.append("trial_signup")
        if mode == 'launchdarkly':
            ld_client.track("trial_signup", context)
        elif mode == 'snowflake':
            snowflake_events.append(generate_metric_event_data(
                user_info["key"], "trial_signup", flag_eval_time=flag_eval_time
            ))
        
        # Simulate conversion to paid
        did_convert = random.random() < 0.5
        if did_convert:
            events.append("trial_to_paid_conversion")
            if mode == 'launchdarkly':
                ld_client.track("trial_to_paid_conversion", context)
            elif mode == 'snowflake':
                snowflake_events.append(generate_metric_event_data(
                    user_info["key"], "trial_to_paid_conversion", flag_eval_time=flag_eval_time
                ))
            
            revenue = random.gauss(variant_revenue_mean[variant], 5.0)
            revenue = max(0, round(revenue, 2))
            events.append("total_revenue")
            if mode == 'launchdarkly':
                ld_client.track("total_revenue", context, metric_value=revenue)
            elif mode == 'snowflake':
                snowflake_events.append(generate_metric_event_data(
                    user_info["key"], "total_revenue", event_value=revenue, flag_eval_time=flag_eval_time
                ))
            
            adjusted = calculate_adjusted_revenue(revenue, trial_days_detail.value, user_info["planType"], user_info["country"])
            events.append("adjusted_revenue")
            if mode == 'launchdarkly':
                ld_client.track("adjusted_revenue", context, metric_value=adjusted)
            elif mode == 'snowflake':
                snowflake_events.append(generate_metric_event_data(
                    user_info["key"], "adjusted_revenue", event_value=adjusted, flag_eval_time=flag_eval_time
                ))
    
    if seasonal_banner and random.random() < 0.1:
        events.append("banner_click")
        if mode == 'launchdarkly':
            ld_client.track("banner_click", context)
        elif mode == 'snowflake':
            snowflake_events.append(generate_metric_event_data(
                user_info["key"], "banner_click", flag_eval_time=flag_eval_time
            ))
    
    if random.random() < 0.15:
        events.append("hero_engagement")
        if mode == 'launchdarkly':
            ld_client.track("hero_engagement", context)
        elif mode == 'snowflake':
            snowflake_events.append(generate_metric_event_data(
                user_info["key"], "hero_engagement", flag_eval_time=flag_eval_time
            ))
    
    if mode == 'launchdarkly':
        ld_client.flush()
        time.sleep(0.001)
    
    flag_values = {
        'trialDays': trial_days_detail.value,
        'seasonalBanner': seasonal_banner,
        'heroBanner': hero_banner_detail.value
    }
    
    return user_info, flag_values, events, snowflake_events

def main():
    parser = argparse.ArgumentParser(description='Gravity Farms LaunchDarkly Experiment Simulation')
    parser.add_argument('--flag', default='number-of-days-trial', help='Feature flag key to evaluate')
    parser.add_argument('--records', type=int, default=100, help='Number of user contexts to simulate')
    parser.add_argument('--base-signup-prob', type=float, default=0.2, help='Base probability of trial signup')
    parser.add_argument('--conversion-prob', type=float, default=0.4, help='Probability of trial to paid conversion')
    parser.add_argument('--mode', choices=['launchdarkly', 'snowflake'], default='launchdarkly', help='Simulation mode (launchdarkly or snowflake)')
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

        log_filename = f'gravityfarms_simulation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
        logger.info(f"Results will be logged to {log_filename}")

        for i in range(args.records):
            context, user_info = generate_user_context()
            # Evaluate the flags
            trial_days = ld_client.variation(args.flag, context, 7)
            seasonal_banner = ld_client.variation("seasonal-sale-banner-text", context, "")
            hero_banner = ld_client.variation("hero-banner-text", context, {})
            logger.info(f"[DEBUG] Context: kind={context.kind}, key={user_info['key']}")
            logger.info(f"[DEBUG] Flag evaluation: {args.flag} = {trial_days} for user: {user_info['key']}")
            logger.info(f"[DEBUG] Flag evaluation: seasonal-sale-banner-text = {seasonal_banner} for user: {user_info['key']}")
            logger.info(f"[DEBUG] Flag evaluation: hero-banner-text = {hero_banner} for user: {user_info['key']}")
            time.sleep(1)  # 1s sleep after flag evaluation

            # Branch simulation logic based on heroBanner variation
            hero_banner_text = None
            if isinstance(hero_banner, dict):
                hero_banner_text = hero_banner.get("banner-text", "")
            else:
                hero_banner_text = str(hero_banner)

            variant_conversion_rate = {
                "Control": 0.05,
                "Variant 1": 0.07,
                "Next Generation": 0.09
            }
            variant_revenue_mean = {
                "Control": 30.0,
                "Variant 1": 35.0,
                "Next Generation": 40.0
            }
            variant = "Control"
            if "control" in hero_banner_text.lower():
                variant = "Control"
            elif "next" in hero_banner_text.lower():
                variant = "Next Generation"
            elif "variant" in hero_banner_text.lower() or "top" in hero_banner_text.lower():
                variant = "Variant 1"

            # Simulate trial signup based on hero banner variant
            did_signup = random.random() < variant_conversion_rate[variant]
            log_entry = {
                "timestamp": int(time.time() * 1000),
                "context_key": user_info['key'],
                "flag_value": trial_days,
                "trial_signup": did_signup,
                "events": []
            }

            if did_signup:
                ld_client.track("trial_signup", context)
                logger.info(f"[DEBUG] Tracking event: trial_signup for user: {user_info['key']}")
                # Simulate conversion to paid
                did_convert = random.random() < 0.5
                log_entry["trial_to_paid_conversion"] = did_convert
                if did_convert:
                    ld_client.track("trial_to_paid_conversion", context)
                    logger.info(f"[DEBUG] Tracking event: trial_to_paid_conversion for user: {user_info['key']}")
                    # Revenue events
                    revenue = random.gauss(variant_revenue_mean[variant], 5.0)
                    revenue = max(0, round(revenue, 2))
                    ld_client.track("total_revenue", context, metric_value=revenue)
                    logger.info(f"[DEBUG] Tracking event: total_revenue for user: {user_info['key']} value: {revenue}")
                    adjusted = calculate_adjusted_revenue(revenue, trial_days, user_info["planType"], user_info["country"])
                    ld_client.track("adjusted_revenue", context, metric_value=adjusted)
                    logger.info(f"[DEBUG] Tracking event: adjusted_revenue for user: {user_info['key']} value: {adjusted}")

            # Track banner_click event if seasonal banner is present and random threshold met
            if seasonal_banner and random.random() < 0.1:
                ld_client.track("banner_click", context)
                logger.info(f"[DEBUG] Tracking event: banner_click for user: {user_info['key']}")

            # Track hero_engagement event with random chance
            if random.random() < 0.15:
                ld_client.track("hero_engagement", context)
                logger.info(f"[DEBUG] Tracking event: hero_engagement for user: {user_info['key']}")

            # Flush after each user
            ld_client.flush()
            logger.info(f"[DEBUG] Flushed events for user: {user_info['key']}")
            time.sleep(1)  # 1s sleep after flush

            # Write to log file
            with open(log_filename, 'a') as f:
                f.write(json.dumps(log_entry) + '\n')

            if (i + 1) % 10 == 0 or (i + 1) == args.records:
                logger.info(f"Processed {i + 1}/{args.records} users")

            time.sleep(0.01)

        ld_client.close()
        logger.info("Simulation complete.")

    elif args.mode == 'snowflake':
        if not SNOWFLAKE_AVAILABLE:
            logger.error("Snowflake mode selected but snowflake-connector-python is not installed.")
            return 1

        # Still need LaunchDarkly SDK for flag evaluation
        ldclient.set_config(Config(sdk_key))
        ld_client = ldclient.get()

        if not ld_client.is_initialized():
            logger.error("LaunchDarkly client failed to initialize")
            return 1

        conn = None
        try:
            conn = get_snowflake_connection()
            logger.info("Snowflake connection successful.")

            for i in range(args.records):
                # Use the updated simulate_user_journey_v2 function
                user_info, flag_values, events, snowflake_events = simulate_user_journey_v2(
                    ld_client, fake, mode='snowflake', snowflake_conn=conn
                )

                # Insert metric events into Snowflake
                for event_data in snowflake_events:
                    try:
                        insert_metric_event_to_snowflake(conn, event_data)
                    except Exception as e:
                        logger.error(f"Error inserting metric event to Snowflake: {e}")

                # Log progress
                if (i + 1) % 10 == 0 or (i + 1) == args.records:
                    logger.info(f"Processed {i + 1}/{args.records} users")

                time.sleep(0.01)  # Small delay between users

            logger.info("Snowflake simulation complete.")

        except Exception as e:
            logger.error(f"Error during Snowflake simulation: {e}")
        finally:
            if conn:
                conn.close()
                logger.info("Snowflake connection closed.")
            ld_client.close()

    return 0

if __name__ == "__main__":
    exit(main()) 