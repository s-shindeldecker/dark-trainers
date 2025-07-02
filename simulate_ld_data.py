import argparse
import time
import random
from collections import defaultdict
from faker import Faker
from ldclient import LDClient, Config, Context
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ---- CONFIGURATION ----
LD_SDK_KEY = os.getenv("LAUNCHDARKLY_SDK_KEY", "YOUR_SDK_KEY")  # Uses .env if present

# These would be loaded from a config file in a full implementation
EXPERIMENTS = {
    "trial_duration": {
        "flag": "number-of-days-trial",
        "outcomeMetrics": ["trial_signup", "trial_to_paid_conversion", "total_revenue"],
        "conversionRates": {
            "trial_signup": {"US": 0.18, "UK": 0.16, "EU": 0.14, "CA": 0.12},
            "trial_to_paid_conversion": {"US": 0.45, "UK": 0.42, "EU": 0.38, "CA": 0.35},
        },
        "trialDurationMultiplier": {"3": 0.8, "7": 1.0, "14": 1.2, "30": 1.4},
    },
    "seasonal_banner": {
        "flag": "seasonal-sale-banner-text",
        "outcomeMetrics": ["trial_signup", "banner_click"],
        "conversionRates": {
            "trial_signup": {"US": 0.20, "UK": 0.18, "EU": 0.16, "CA": 0.14},
            "banner_click": {"US": 0.08, "UK": 0.07, "EU": 0.06, "CA": 0.05},
        },
    },
    "hero_banner": {
        "flag": "hero-banner-text",
        "outcomeMetrics": ["trial_signup", "hero_engagement"],
        "conversionRates": {
            "trial_signup": {"US": 0.19, "UK": 0.17, "EU": 0.15, "CA": 0.13},
            "hero_engagement": {"US": 0.12, "UK": 0.11, "EU": 0.10, "CA": 0.09},
        },
    },
}
USER_GENERATION = {
    "countries": ["US", "UK", "FR", "DE", "CA"],
    "petTypes": ["dog", "cat", "both"],
    "planTypes": ["basic", "premium", "trial"],
    "paymentTypes": ["credit_card", "paypal", "apple_pay", "google_pay", "bank"],
}
RANDOMNESS = {"noiseLevel": 0.1}

# ---- SIMULATION LOGIC ----
def add_randomness(base_rate, noise_level):
    noise = (random.random() - 0.5) * 2 * noise_level
    return max(0, min(1, base_rate + noise))

def should_fire_event(metric, country, flag_values, noise_level):
    region = "EU" if country in ("FR", "DE") else country
    base_rate = 0
    for experiment in EXPERIMENTS.values():
        if metric in experiment["outcomeMetrics"]:
            base_rate = experiment["conversionRates"].get(metric, {}).get(region, 0)
            break
    # Apply trial duration multiplier if applicable
    if metric == "trial_signup" and "trialDays" in flag_values:
        multiplier = EXPERIMENTS["trial_duration"]["trialDurationMultiplier"].get(str(flag_values["trialDays"]), 1.0)
        base_rate *= multiplier
    final_rate = add_randomness(base_rate, noise_level)
    return random.random() < final_rate

def generate_user(fake):
    country = random.choice(USER_GENERATION["countries"])
    pet_type = random.choice(USER_GENERATION["petTypes"])
    plan_type = random.choice(USER_GENERATION["planTypes"])
    payment_type = random.choice(USER_GENERATION["paymentTypes"])
    if country == "US":
        state = fake.state()
    elif country == "CA":
        state = random.choice(['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU'])
    elif country == "FR":
        state = random.choice(['Paris', 'Bouches-du-Rhône', 'Nord', 'Rhône', 'Haute-Garonne'])
    elif country == "DE":
        state = random.choice(['Berlin', 'Bavaria', 'North Rhine-Westphalia', 'Baden-Württemberg', 'Hesse'])
    elif country == "UK":
        state = random.choice(['Greater London', 'West Midlands', 'Greater Manchester', 'West Yorkshire', 'Kent'])
    else:
        state = ""
    return {
        "key": fake.uuid4(),
        "anonymous": False,
        "name": fake.name(),
        "country": country,
        "state": state,
        "petType": pet_type,
        "planType": plan_type,
        "paymentType": payment_type,
    }

def evaluate_flags(ldclient, user):
    context = (
        Context.builder(user["key"])
        .anonymous(False)
        .name(user["name"])
        .set("country", user["country"])
        .set("state", user["state"])
        .set("petType", user["petType"])
        .set("planType", user["planType"])
        .set("paymentType", user["paymentType"])
        .build()
    )
    trial_days = ldclient.variation("number-of-days-trial", context, 7)
    seasonal_banner = ldclient.variation("seasonal-sale-banner-text", context, "")
    hero_banner = ldclient.variation("hero-banner-text", context, {})
    return {"trialDays": trial_days, "seasonalBanner": seasonal_banner, "heroBanner": hero_banner}

def simulate_user_journey(ldclient, fake, noise_level):
    user = generate_user(fake)
    flag_values = evaluate_flags(ldclient, user)
    context = (
        Context.builder(user["key"])
        .anonymous(False)
        .name(user["name"])
        .set("country", user["country"])
        .set("state", user["state"])
        .set("petType", user["petType"])
        .set("planType", user["planType"])
        .set("paymentType", user["paymentType"])
        .build()
    )
    events = ["page_view"]
    if should_fire_event("trial_signup", user["country"], flag_values, noise_level):
        events.append("trial_signup")
        ldclient.track("trial_signup", context)
        if should_fire_event("trial_to_paid_conversion", user["country"], flag_values, noise_level):
            events.append("trial_to_paid_conversion")
            ldclient.track("trial_to_paid_conversion", context)
            events.append("total_revenue")
            ldclient.track("total_revenue", context)
    if flag_values["seasonalBanner"] and should_fire_event("banner_click", user["country"], flag_values, noise_level):
        events.append("banner_click")
        ldclient.track("banner_click", context)
    if should_fire_event("hero_engagement", user["country"], flag_values, noise_level):
        events.append("hero_engagement")
        ldclient.track("hero_engagement", context)
    return user, flag_values, events

def main(duration, records_per_second):
    fake = Faker()
    ldclient = LDClient(Config(sdk_key=LD_SDK_KEY))
    total_records = duration * records_per_second
    results = {
        "totalUsers": 0,
        "events": defaultdict(int),
        "flagEvaluations": defaultdict(lambda: defaultdict(int)),
    }
    for i in range(total_records):
        user, flag_values, events = simulate_user_journey(ldclient, fake, RANDOMNESS["noiseLevel"])
        results["totalUsers"] += 1
        for event in events:
            results["events"][event] += 1
        for flag, value in flag_values.items():
            value_str = str(value)
            results["flagEvaluations"][flag][value_str] += 1
        if (i + 1) % records_per_second == 0:
            print(f"Progress: {i + 1}/{total_records} users ({((i + 1) / total_records) * 100:.1f}%)")
            time.sleep(1)
    ldclient.flush()
    ldclient.close()
    print("Simulation complete!")
    print("Results:")
    print(f"Total Users: {results['totalUsers']}")
    print("Events:", dict(results["events"]))
    print("Flag Evaluations:", {k: dict(v) for k, v in results["flagEvaluations"].items()})

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LaunchDarkly Data Simulation")
    parser.add_argument("--duration", type=int, default=600, help="Simulation duration in seconds")
    parser.add_argument("--records-per-second", type=int, default=1, help="Users per second")
    args = parser.parse_args()
    main(args.duration, args.records_per_second) 
