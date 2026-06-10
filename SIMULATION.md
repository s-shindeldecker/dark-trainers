# DarkTrainers experiment data simulation

The primary script is [`darktrainers_simulation.py`](darktrainers_simulation.py). It simulates guest and identified user journeys, evaluates LaunchDarkly flags, and optionally writes custom metric events to a warehouse for native experimentation.

## Profiles

| Profile | LaunchDarkly SDK key env | Warehouse | Use case |
|---------|--------------------------|-----------|----------|
| `production-bq` | `LAUNCHDARKLY_SDK_KEY` | BigQuery | Production LD + BigQuery native experimentation |
| `test-databricks` | `LAUNCHDARKLY_SDK_KEY_TEST` | Databricks | Test LD + Databricks native experimentation |
| `snowflake` | `LAUNCHDARKLY_SDK_KEY_SNOWFLAKE` | Snowflake | Snowflake LD + Snowflake native experimentation |

```bash
# Production LD + BigQuery metric_events
python darktrainers_simulation.py --profile production-bq --records 300

# Test LD + Databricks metric_events (create table on first run)
python darktrainers_simulation.py --profile test-databricks --records 300 --create-table

# Snowflake LD + Snowflake metric_events (create table on first run)
python darktrainers_simulation.py --profile snowflake --records 300 --create-table

# LD-only (events via SDK track; logs to JSONL file)
python darktrainers_simulation.py --mode launchdarkly --records 100
```

Legacy `--mode bigquery` maps to `production-bq` with a deprecation warning. Legacy `--mode snowflake` maps to `snowflake` with a deprecation warning.

## Environment variables

Copy [`.env.example`](.env.example) to `.env` (gitignored) and fill in values.

### LaunchDarkly

| Variable | Profiles |
|----------|----------|
| `LAUNCHDARKLY_SDK_KEY` | `production-bq`, `--mode launchdarkly` |
| `LAUNCHDARKLY_SDK_KEY_TEST` | `test-databricks` |
| `LAUNCHDARKLY_SDK_KEY_SNOWFLAKE` | `snowflake` |

Each key must be the **server-side SDK key** for the target LD environment (Production, Test, or Snowflake).

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

### Snowflake (`snowflake`)

| Variable | Default | Description |
|----------|---------|-------------|
| `SNOWFLAKE_ACCOUNT` | (required) | Account identifier |
| `SNOWFLAKE_USER` | (required) | Username |
| `SNOWFLAKE_PASSWORD` | — | Password (or use key-pair auth) |
| `SNOWFLAKE_PRIVATE_KEY` | — | PEM key path or content (alternative to password) |
| `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` | — | Passphrase for encrypted private key |
| `SNOWFLAKE_WAREHOUSE` | (required) | Warehouse |
| `SNOWFLAKE_DATABASE` | (required) | Database |
| `SNOWFLAKE_SCHEMA` | (required) | Schema |
| `SNOWFLAKE_METRICS_TABLE` | `metric_events` | Table name (or use `SNOWFLAKE_METRIC_EVENTS_TABLE`) |
| `SNOWFLAKE_ROLE` | `ACCOUNTADMIN` | Role |

### Optional tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `DARKTRAINERS_SIMULATION_DELAY_BETWEEN_JOURNEYS` | `2.0` | Seconds between journeys in LD-only mode |

## Metric table schema

BigQuery and Databricks use the same columns (see [RUNBOOK_BQ_NATIVE_DEBUG.md](RUNBOOK_BQ_NATIVE_DEBUG.md)):

- `context_key` (STRING, required)
- `context_kind` (STRING, required)
- `event_key` (STRING, required)
- `event_value` (FLOAT/DOUBLE, nullable)
- `received_time` (TIMESTAMP, required)

Snowflake uses LaunchDarkly's native experimentation schema (uppercase column names):

- `EVENT_ID` (VARCHAR, required)
- `EVENT_KEY` (VARCHAR, required)
- `CONTEXT_KIND` (VARCHAR, required)
- `CONTEXT_KEY` (VARCHAR, required)
- `EVENT_VALUE` (FLOAT, nullable)
- `RECEIVED_TIME` (TIMESTAMP_NTZ, required)

## Adding a new profile

Register a new entry in `PROFILES` inside `darktrainers_simulation.py` with `ld_sdk_key_env` and `warehouse` (`bigquery`, `databricks`, or `snowflake`). No journey logic changes are required.

## Dependencies

```bash
pip install -r requirements.txt
```

Warehouse backends are optional at import time; install only what you need if you prefer a slimmer environment.
