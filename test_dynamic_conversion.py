#!/usr/bin/env python3
"""
Test script to verify dynamic batch conversion configuration
"""

from run_continuous_simulation import get_dynamic_batch_conversion_config

def test_dynamic_conversion():
    """Test the dynamic conversion configuration function"""
    print("🧪 Testing Dynamic Batch Conversion Configuration")
    print("=" * 60)
    
    # Test multiple iterations to see different scenarios
    for i in range(1, 11):
        config = get_dynamic_batch_conversion_config(i)
        print(f"\n🎯 Batch {i}: {config['scenario_name']}")
        print(f"📊 Conversion Rates:")
        for variant, rate in config['conversion_rates'].items():
            print(f"   {variant}: {rate:.1%}")
        
        # Identify the winner
        winner = max(config['conversion_rates'], key=config['conversion_rates'].get)
        winner_rate = config['conversion_rates'][winner]
        print(f"🏆 Winner: {winner} ({winner_rate:.1%})")
    
    print("\n✅ Dynamic conversion configuration test complete!")

if __name__ == "__main__":
    test_dynamic_conversion() 