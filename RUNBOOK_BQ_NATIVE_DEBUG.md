# BQ Native Experimentation — Debugging Runbook

## Variables — set these before running any query

```
GCP_PROJECT      = darktrainers-demo
DATA_EXPORT      = ld_data_export
RESULTS          = ld_experimentation_results
METRICS_DATASET  = darktrainers_metrics
METRICS_TABLE    = metric_events
ITERATION_ID     = b57fa0b4-1494-4118-bd29-a8b12a0612a8   ← replace with your iteration ID
EXPERIMENT_START = 2026-05-12 16:32:00 UTC                ← replace with your experiment start time
```

---

## Step 0 — Check transfer status

Has the last batch cycle completed? Look for timestamps past the current hour.

```sql
SELECT *
FROM `{GCP_PROJECT}.{DATA_EXPORT}._transfer_status`
```

If timestamps are stale, the batch hasn't run yet. Wait and re-check.

---

## Step 1 — Confirm evaluation events exist for your iteration

```sql
SELECT COUNT(*), MIN(received_time), MAX(received_time)
FROM `{GCP_PROJECT}.{DATA_EXPORT}.evaluation_events`
WHERE experiment_iteration_id = '{ITERATION_ID}'
```

Expected: row count > 0, time range covers period after experiment start.

---

## Step 2 — Confirm both variations are present in evaluation events

```sql
SELECT TO_JSON_STRING(variation_value) as variation, COUNT(*) as count
FROM `{GCP_PROJECT}.{DATA_EXPORT}.evaluation_events`
WHERE experiment_iteration_id = '{ITERATION_ID}'
GROUP BY TO_JSON_STRING(variation_value)
```

Expected: one row per variation with roughly equal counts.

---

## Step 3 — Find your iteration ID (if you don't know it)

```sql
SELECT *
FROM `{GCP_PROJECT}.{DATA_EXPORT}.experiment_iterations`
ORDER BY started_at DESC
LIMIT 10
```

Match the experiment name and started_at timestamp to find your iteration ID.

---

## Step 4 — Confirm metric events exist and join correctly

```sql
SELECT COUNT(DISTINCT e.context_key)
FROM `{GCP_PROJECT}.{DATA_EXPORT}.evaluation_events` e
JOIN `{GCP_PROJECT}.{METRICS_DATASET}.{METRICS_TABLE}` m
  ON e.context_key = m.context_key
WHERE e.experiment_iteration_id = '{ITERATION_ID}'
AND m.received_time >= '{EXPERIMENT_START}'
```

Expected: count > 0. If 0, metric events either don't exist or predate the experiment start.

---

## Step 5 — Check event counts by hour

Are events landing consistently, or in a single burst?

```sql
SELECT event_key, rollup_hour_ts, event_count, analyzed_at
FROM `{GCP_PROJECT}.{RESULTS}.computed_event_counts_hourly`
WHERE data_source_id IN (
  SELECT DISTINCT data_source_id
  FROM `{GCP_PROJECT}.{RESULTS}.computed_event_counts_hourly`
)
ORDER BY rollup_hour_ts DESC
LIMIT 20
```

---

## Step 6 — Confirm both arms are computing in arm aggregates

```sql
SELECT arm_id,
  SUM(count_of_units) as total_units,
  SUM(count_of_units_with_measurements) as with_measurements,
  MAX(analyzed_at) as last_analyzed
FROM `{GCP_PROJECT}.{RESULTS}.computed_arm_aggregates`
WHERE iteration_id = '{ITERATION_ID}'
GROUP BY arm_id
```

Expected: two rows with roughly equal unit counts. If only one row, one arm is not computing.

---

## Step 7 — Check primary metric by arm (detailed)

Replace `{METRIC_VERSION_ID}` with the ID of your primary metric from Step 6's distinct metric_version_ids.

```sql
SELECT arm_id, dimension_name, dimension_value,
  count_of_units, count_of_units_with_measurements,
  sum_of_unit_aggregates, analyzed_at
FROM `{GCP_PROJECT}.{RESULTS}.computed_arm_aggregates`
WHERE iteration_id = '{ITERATION_ID}'
AND metric_version_id = '{METRIC_VERSION_ID}'
ORDER BY dimension_name, dimension_value
LIMIT 20
```

---

## Step 8 — Check all metric version IDs present

```sql
SELECT DISTINCT metric_version_id, COUNT(*) as row_count
FROM `{GCP_PROJECT}.{RESULTS}.computed_arm_aggregates`
WHERE iteration_id = '{ITERATION_ID}'
GROUP BY metric_version_id
```

Expected: one row per metric attached to the experiment.

---

## Step 9 — Check last seen metric events per data source

```sql
SELECT data_source_id, event_key, context_kinds, last_received_ts, analyzed_at
FROM `{GCP_PROJECT}.{RESULTS}.computed_events_last_seen`
ORDER BY last_received_ts DESC
```

---

## Diagnostic decision tree

```
Transfer status timestamps stale?
  → Yes: Wait for next batch cycle (runs ~top of hour, completes ~15-20 min after)
  → No: Continue

Evaluation events count = 0?
  → Check that Data Export is enabled on the flag and environment
  → Check that simulation/app SDK key matches the configured environment

Both variations present in evaluation_events?
  → No: Flag targeting rule may be routing all traffic to one variation
  → Yes: Continue

Join count = 0?
  → Metric events predate experiment start — run more simulation data
  → context_key mismatch — check simulation script writes same key to both LD and BQ

Both arms in computed_arm_aggregates?
  → No: Possible platform bug — escalate with full diagnostic output
  → Yes but UI shows 0 or SRM: Possible UI rendering bug — escalate with arm IDs and iteration ID

Everything looks correct in BQ but UI is wrong?
  → Escalate to engineering with: iteration_id, arm_ids, metric_version_ids, analyzed_at timestamp
```

---

## Notes

- Batch cycle runs approximately every hour, completing 15-20 minutes past the hour
- Metric events must have `received_time` AFTER experiment `started_at` to count as valid exposures  
- VIP users have stable keys (`vip-user-001` through `vip-user-090`) — standard users get random UUIDs each simulation run
- Don't run simulation continuously before demos — VIP AOV accumulates across runs
- AOV skew is intentional: VIP mean ~$620, standard mean ~$85
