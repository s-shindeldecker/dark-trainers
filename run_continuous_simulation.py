#!/usr/bin/env python3
"""
Continuous LaunchDarkly Data Simulation
Runs the simulation continuously with realistic traffic patterns until manually stopped.
Supports both LaunchDarkly SDK tracking and Snowflake data insertion.
"""

import time
import datetime
import math
import random
import signal
import sys
import argparse
from gravityfarms_simulation import simulate_user_journey_v2, generate_user_context, get_snowflake_connection
from ldclient import LDClient, Config, Context
from faker import Faker
from collections import defaultdict
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Global flag to control the simulation loop
running = True

def signal_handler(signum, frame):
    """Handle Ctrl+C to gracefully stop the simulation"""
    global running
    print("\n🛑 Received interrupt signal. Stopping simulation gracefully...")
    running = False

def get_traffic_multiplier():
    """
    Calculate traffic multiplier based on current time.
    Returns a value between 0.1 and 1.0 based on time of day.
    """
    now = datetime.datetime.now()
    hour = now.hour
    
    # Base traffic pattern (24-hour cycle)
    # Peak hours: 6-9 AM (morning), 5-9 PM (evening)
    # Low hours: 12-5 AM (overnight)
    # Mid hours: 10 AM - 4 PM (daytime)
    
    if 6 <= hour <= 9:  # Morning peak
        base_multiplier = 0.8
    elif 17 <= hour <= 21:  # Evening peak
        base_multiplier = 1.0
    elif 0 <= hour <= 5:  # Overnight (very low)
        base_multiplier = 0.1
    else:  # Daytime (moderate)
        base_multiplier = 0.5
    
    # Add some randomness (±20%)
    variation = random.uniform(0.8, 1.2)
    
    # Add day-of-week variation (weekends slightly lower)
    day_of_week = now.weekday()  # 0=Monday, 6=Sunday
    if day_of_week >= 5:  # Weekend
        day_multiplier = 0.7
    else:
        day_multiplier = 1.0
    
    final_multiplier = base_multiplier * variation * day_multiplier
    
    # Ensure it stays within reasonable bounds
    return max(0.05, min(1.0, final_multiplier))

def calculate_simulation_params():
    """
    Calculate simulation duration and records per second based on traffic pattern.
    """
    traffic_multiplier = get_traffic_multiplier()
    
    # Base configuration: 1 user per 10 seconds during peak
    base_records_per_second = 0.1  # 1 user every 10 seconds
    
    # Apply traffic multiplier
    records_per_second = base_records_per_second * traffic_multiplier
    
    # Ensure minimum and maximum bounds
    records_per_second = max(0.01, min(1.0, records_per_second))  # Between 1 user per 100s and 1 user per second
    
    # Calculate duration for this batch (5-15 minutes)
    duration_minutes = random.uniform(5, 15)
    duration_seconds = int(duration_minutes * 60)
    
    # Calculate total users for this batch
    total_users = max(1, int(duration_seconds * records_per_second))
    
    # Adjust records_per_second to ensure we get the desired number of users
    adjusted_records_per_second = max(1, total_users // duration_seconds)
    
    return duration_seconds, adjusted_records_per_second

def log_status(iteration, start_time, duration, records_per_second, traffic_multiplier):
    """Log current simulation status"""
    now = datetime.datetime.now()
    elapsed = now - start_time
    users_per_minute = records_per_second * 60
    
    print(f"\n🔄 Iteration {iteration}")
    print(f"   Time: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   Traffic Multiplier: {traffic_multiplier:.2f}")
    print(f"   Users per second: {records_per_second:.3f}")
    print(f"   Users per minute: {users_per_minute:.1f}")
    print(f"   Duration: {duration} seconds ({duration/60:.1f} minutes)")
    print(f"   Total elapsed: {elapsed}")
    print(f"   Estimated users this batch: {int(duration * records_per_second)}")

def run_simulation(duration, records_per_second, mode='launchdarkly'):
    """Run simulation with interruption checking"""
    global running
    
    LD_SDK_KEY = os.getenv("LAUNCHDARKLY_SDK_KEY", "YOUR_SDK_KEY")
    fake = Faker()
    ldclient = LDClient(Config(sdk_key=LD_SDK_KEY))
    
    # Initialize Snowflake connection if needed
    snowflake_conn = None
    if mode == 'snowflake':
        try:
            snowflake_conn = get_snowflake_connection()
            print("   ✅ Snowflake connection established")
        except Exception as e:
            print(f"   ❌ Failed to connect to Snowflake: {e}")
            return
    
    total_records = duration * records_per_second
    results = {
        "totalUsers": 0,
        "events": defaultdict(int),
        "flagEvaluations": defaultdict(lambda: defaultdict(int)),
        "snowflakeEvents": 0 if mode == 'snowflake' else None
    }
    
    try:
        for i in range(total_records):
            # Check if we should stop
            if not running:
                print(f"\n⏹️  Simulation interrupted at {i + 1}/{total_records} users")
                break
                
            user_info, flag_values, events, snowflake_events = simulate_user_journey_v2(
                ldclient, fake, mode=mode, snowflake_conn=snowflake_conn
            )
            results["totalUsers"] += 1
            for event in events:
                results["events"][event] += 1
            for flag, value in flag_values.items():
                value_str = str(value)
                results["flagEvaluations"][flag][value_str] += 1
            
            if mode == 'snowflake' and snowflake_events:
                results["snowflakeEvents"] += len(snowflake_events)
            
            if (i + 1) % records_per_second == 0:
                print(f"Progress: {i + 1}/{total_records} users ({((i + 1) / total_records) * 100:.1f}%)")
                time.sleep(1)
        
        if mode == 'launchdarkly':
            ldclient.flush()
        
        if running:  # Only print results if not interrupted
            print("Simulation batch complete!")
            print("Results:")
            print(f"Total Users: {results['totalUsers']}")
            print("Events:", dict(results["events"]))
            print("Flag Evaluations:", {k: dict(v) for k, v in results["flagEvaluations"].items()})
            if mode == 'snowflake':
                print(f"Snowflake Events Inserted: {results['snowflakeEvents']}")
    
    finally:
        ldclient.close()
        if snowflake_conn:
            snowflake_conn.close()
            print("   🔌 Snowflake connection closed")

def main():
    """Main function to run continuous simulation"""
    global running
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Continuous LaunchDarkly Data Simulation')
    parser.add_argument('--mode', choices=['launchdarkly', 'snowflake'], 
                       default='launchdarkly', help='Simulation mode (launchdarkly or snowflake)')
    args = parser.parse_args()
    
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    print("🚀 Starting Continuous LaunchDarkly Data Simulation")
    print("=" * 60)
    print(f"Mode: {args.mode.upper()}")
    print("This script will run continuously with realistic traffic patterns.")
    print("Press Ctrl+C to stop gracefully.")
    print("=" * 60)
    
    start_time = datetime.datetime.now()
    iteration = 0
    
    try:
        while running:
            iteration += 1
            
            # Calculate simulation parameters based on current time
            duration, records_per_second = calculate_simulation_params()
            traffic_multiplier = get_traffic_multiplier()
            
            # Log current status
            log_status(iteration, start_time, duration, records_per_second, traffic_multiplier)
            
            # Run the simulation batch
            print(f"   Starting simulation batch...")
            run_simulation(duration, records_per_second, mode=args.mode)
            
            # Add a small break between batches (30-90 seconds)
            if running:
                break_duration = random.uniform(30, 90)
                print(f"   ⏸️  Pausing for {break_duration:.0f} seconds before next batch...")
                time.sleep(break_duration)
    
    except KeyboardInterrupt:
        print("\n🛑 Simulation stopped by user.")
    except Exception as e:
        print(f"\n❌ Error during simulation: {e}")
    finally:
        end_time = datetime.datetime.now()
        total_duration = end_time - start_time
        print(f"\n✅ Simulation completed!")
        print(f"   Total runtime: {total_duration}")
        print(f"   Total iterations: {iteration}")
        print(f"   Started: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   Ended: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main() 