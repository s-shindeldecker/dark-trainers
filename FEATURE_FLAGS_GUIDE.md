# Gravity Farms Petfood - Feature Flags Demo Guide

This guide explains the feature flags used in the Gravity Farms Petfood demo application, their keys, and how they affect the user experience.

## Overview

The Gravity Farms demo uses LaunchDarkly feature flags to demonstrate A/B testing and experimentation capabilities. The application simulates a pet food subscription service with various user journeys and conversion events.

## Feature Flags Overview

### 1. Hero Banner Configuration (`hero-banner-text`)
**Flag Key:** `hero-banner-text`  
**Type:** JSON Object  
**Default Value:** `{"banner-text": "Control Banner"}`

**What it controls:**
- The main hero banner text displayed on the homepage
- Affects conversion rates and user engagement
- Determines which experiment variant a user sees
- See LaunchDarkly - Farm Fresh Petfood project for current settings

**Visual Elements Controlled by JSON:**
- `banner-text` - Main headline text
- `banner-text-color` - Color of the main headline (hex color)
- `horiz-justification` - Horizontal alignment of banner content (left, center, right)
- `image-file` - Background image filename
- `sub-banner-text` - Subtitle/description text
- `sub-banner-text-color` - Color of subtitle text (hex color)
- `vert-justification` - Vertical alignment of banner content (top, center, bottom)

**Example JSON Structure:**
```json
{
  "banner-text": "Fresh, healthy meals delivered",
  "banner-text-color": "#FFF000",
  "horiz-justification": "right",
  "image-file": "hero-control.jpeg",
  "sub-banner-text": "Start your pup's journey to better health with our 7-day free trial",
  "sub-banner-text-color": "#FFFFFF",
  "vert-justification": "top"
}
```

**Code Impact:**
- Located in `gravityfarms_simulation.py` lines 200-220
- Determines variant assignment and conversion probability
- Affects revenue simulation (different mean values per variant)

### 2. Trial Days (`number-of-days-trial`)
**Flag Key:** `number-of-days-trial`  
**Type:** Number  
**Default Value:** `7`

**What it controls:**
- Number of free trial days offered to new customers
- Affects revenue calculations and trial-to-paid conversion
- Used in adjusted revenue calculations

**Available Variations:**
 - The feature flag is a numeric, representing number of days.
 - See LaunchDarkly - Farm Fresh Petfood project for current settings

**Code Impact:**
- Located in `gravityfarms_simulation.py` lines 180-190
- Used in `calculate_adjusted_revenue()` function
- Affects trial cost calculations in revenue metrics

### 3. Seasonal Sale Banner (`seasonal-sale-banner-text`)
**Flag Key:** `seasonal-sale-banner-text`  
**Type:** String  
**Default Value:** `""` (empty)

**What it controls:**
- Displays promotional banner text for seasonal sales
- Triggers banner click events when present
- Adds seasonal marketing messaging

**Available Variations:**
 - See LaunchDarkly - Farm Fresh Petfood project for current settings

**Code Impact:**
- Located in `gravityfarms_simulation.py` lines 250-260
- Controls banner click event probability (10% when banner is present)
- Affects user engagement metrics

## User Journey Simulation

### Flag Evaluation Flow
1. **User Context Generation** - Creates realistic user profiles with:
   - Country (US, UK, FR, DE, CA)
   - Pet type (dog, cat, both)
   - Plan type (basic, premium, trial)
   - Payment method (credit_card, paypal, apple_pay, google_pay, bank)

2. **Flag Evaluation** - All three flags are evaluated for each user:
   ```python
   trial_days_detail = ld_client.variation_detail('number-of-days-trial', context, 7)
   seasonal_banner = ld_client.variation('seasonal-sale-banner-text', context, "")
   hero_banner_detail = ld_client.variation_detail('hero-banner-text', context, {})
   ```

3. **Event Tracking** - Based on flag values and user behavior:
   - `page_view` - Always tracked
   - `trial_signup` - Based on hero banner variant conversion rate
   - `trial_to_paid_conversion` - 50% of signups convert
   - `total_revenue` - Revenue based on variant and user profile
   - `adjusted_revenue` - Revenue minus trial cost
   - `banner_click` - 10% chance if seasonal banner present
   - `hero_engagement` - 15% chance for all users

## Experiment Analysis

### Hero Banner Experiment
The `hero-banner-text` flag runs a multi-variant experiment:

| Variant | Conversion Rate | Revenue Mean | Description |
|---------|----------------|--------------|-------------|
| Control | 5% | $30.00 | Standard banner |
| Variant 1 | 7% | $35.00 | "Top-Rated" messaging |
| Next Generation | 9% | $40.00 | "Next Generation" messaging |

### Mutual Exclusivity
The simulation ensures users are assigned to only one experiment variant at a time, maintaining proper statistical analysis.

## Revenue Calculation

### Base Pricing by Region
Basic Plan:
US: $29.99, CA: $39.99, UK: £24.99, EU: €27.99
Premium Plan:
US: $49.99, CA: $64.99, UK: £39.99, EU: €44.99
Deluxe Plan:

### Adjusted Revenue Formula
```python
daily_rate = monthly_price / 30
trial_cost = daily_rate * trial_days
adjusted_revenue = max(0, total_revenue - trial_cost)
```

## Data Collection Modes

### LaunchDarkly Mode
- Uses LaunchDarkly SDK `track()` calls
- Events sent to LaunchDarkly for analysis
- Real-time dashboard updates

### Snowflake Mode  
- Direct insertion into Snowflake metric events table
- Follows LaunchDarkly schema
- Events have 5-10 minute offset from flag evaluation for causality

## Customization Guide

### Adding New Feature Flags

1. **Define the flag in LaunchDarkly:**
   - Create flag with appropriate key
   - Set flag type (boolean, string, number, JSON)
   - Configure variations

2. **Update simulation code:**
   ```python
   # Add flag evaluation
   new_flag = ld_client.variation('your-flag-key', context, default_value)
   
   # Add conditional logic
   if new_flag:
       # Your custom logic here
       events.append("custom_event")
   ```

3. **Update event tracking:**
   ```python
   if mode == 'launchdarkly':
       ld_client.track("custom_event", context)
   elif mode == 'snowflake':
       snowflake_events.append(generate_metric_event_data(
           user_info["key"], "custom_event", flag_eval_time=flag_eval_time
       ))
   ```

### Modifying Conversion Rates

Edit the `variant_conversion_rate` dictionary in `gravityfarms_simulation.py`:

```python
variant_conversion_rate = {
    "Control": 0.05,        # 5% conversion
    "Variant 1": 0.07,      # 7% conversion  
    "Next Generation": 0.09  # 9% conversion
}
```

### Changing Revenue Models

Modify the `variant_revenue_mean` dictionary:

```python
variant_revenue_mean = {
    "Control": 30.0,        # $30 average
    "Variant 1": 35.0,      # $35 average
    "Next Generation": 40.0  # $40 average
}
```

## Running the Demo

### Basic Simulation
```bash
python gravityfarms_simulation.py --records 100 --mode launchdarkly
```

### Snowflake Mode
```bash
python gravityfarms_simulation.py --records 100 --mode snowflake
```

### Continuous Simulation
```bash
python run_continuous_simulation.py --mode launchdarkly
```

### Analysis
```bash
python analyze_experiment_assignments.py
```

## Environment Variables

Required for LaunchDarkly mode:
- `LAUNCHDARKLY_SDK_KEY`

Required for Snowflake mode:
- `SNOWFLAKE_ACCOUNT`
- `SNOWFLAKE_USER` 
- `SNOWFLAKE_PASSWORD` or `SNOWFLAKE_PRIVATE_KEY`
- `SNOWFLAKE_WAREHOUSE`
- `SNOWFLAKE_DATABASE`
- `SNOWFLAKE_SCHEMA`
- `SNOWFLAKE_METRIC_EVENTS_TABLE`

## Troubleshooting

### Common Issues

1. **Flag not evaluating correctly:**
   - Check flag key spelling
   - Verify flag is enabled in LaunchDarkly
   - Ensure user context has required attributes

2. **Events not appearing:**
   - Check LaunchDarkly SDK key
   - Verify `ld_client.flush()` is called
   - Check network connectivity

3. **Snowflake connection errors:**
   - Verify all environment variables
   - Check Snowflake credentials
   - Ensure table exists with correct schema

### Debug Mode
Enable detailed logging by setting log level:
```python
logging.basicConfig(level=logging.DEBUG)
```

## Best Practices

1. **Flag Naming:** Use kebab-case for flag keys
2. **Default Values:** Always provide sensible defaults
3. **Event Tracking:** Use consistent event names
4. **Testing:** Test flag variations before production
5. **Documentation:** Keep this guide updated with new flags

## Support

For questions about this demo or LaunchDarkly integration, refer to:
- [LaunchDarkly Documentation](https://docs.launchdarkly.com/)
- [LaunchDarkly Python SDK](https://github.com/launchdarkly/python-server-sdk)
- [LaunchDarkly Snowflake Integration](https://docs.launchdarkly.com/integrations/data-export/snowflake)