# DarkTrainers experiment data simulation

The primary script is [`darktrainers_simulation.py`](darktrainers_simulation.py). It simulates guest and identified user journeys, evaluates LaunchDarkly flags, and optionally writes custom metric events to a warehouse for native experimentation.

## Profiles

| Profile | LaunchDarkly SDK key env | Warehouse | Use case |
|---------|--------------------------|-----------|----------|
| `production-bq` | `LAUNCHDARKLY_SDK_KEY` | BigQuery | Production LD + BigQuery native experimentation |
| `test-databricks` | `LAUNCHDARKLY_SDK_KEY_TEST` | Databricks | Test LD + Databricks native experimentation |

```bash
# Production LD + BigQuery metric_events
python darktrainers_simulation.py --profile production-bq --records 300

# Test LD + Databricks metric_events (create table on first run)
python darktrainers_simulation.py --profile test-databricks --records 300 --create-table

# LD-only (events via SDK track; logs to JSONL file)
python darktrainers_simulation.py --mode launchdarkly --records 100
```

Legacy `--mode bigquery` maps to `production-bq` with a deprecation warning. `--mode snowflake` still uses Snowflake + `LAUNCHDARKLY_SDK_KEY`.

## Environment variables

Copy [`.env.example`](.env.example) to `.env` (gitignored) and fill in values.

### LaunchDarkly

| Variable | Profiles |
|----------|----------|
| `LAUNCHDARKLY_SDK_KEY` | `production-bq`, `--mode launchdarkly`, `--mode snowflake` |
| `LAUNCHDARKLY_SDK_KEY_TEST` | `test-databricks` |

Each key must be the **server-side SDK key** for the target LD environment (Production vs Test).

### BigQuery (`production-bq`)

| Variable | Default | Description |
|----------|---------|-------------|
| `BIGQUERY_PROJECT_ID` | (required) | GCP project |
| `BIGQUERY_METRICS_DATASET` | `darktrainers_metrics` | Dataset |
| `BIGQUERY_METRICS_TABLE` | `metric_events` | Table |

Authenticate with `GOOGLE_APPLICATION_CREDENTIALS` or Application Default Credentials.

### Databricks (`test-databricks`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABRICKS_HOST` | (required) | Workspace hostname (no `https://`) |
| `DATABRICKS_HTTP_PATH` | (required) | SQL warehouse HTTP path |
| `DATABRICKS_TOKEN` | (required) | Personal access token |
| `DATABRICKS_CATALOG` | (required) | Unity Catalog catalog |
| `DATABRICKS_SCHEMA` | `darktrainers_metrics` | Schema |
| `DATABRICKS_METRICS_TABLE` | `metric_events` | Table |

### Optional tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `DARKTRAINERS_SIMULATION_DELAY_BETWEEN_JOURNEYS` | `2.0` | Seconds between journeys in LD-only mode |

## Metric table schema

Both BigQuery and Databricks use the same columns (see [RUNBOOK_BQ_NATIVE_DEBUG.md](RUNBOOK_BQ_NATIVE_DEBUG.md)):

- `context_key` (STRING, required)
- `context_kind` (STRING, required)
- `event_key` (STRING, required)
- `event_value` (FLOAT/DOUBLE, nullable)
- `received_time` (TIMESTAMP, required)

## Adding a new profile

Register a new entry in `PROFILES` inside `darktrainers_simulation.py` with `ld_sdk_key_env` and `warehouse` (`bigquery`, `databricks`, or `snowflake`). No journey logic changes are required.

## Dependencies

```bash
pip install -r requirements.txt
```

Warehouse backends are optional at import time; install only what you need if you prefer a slimmer environment.
