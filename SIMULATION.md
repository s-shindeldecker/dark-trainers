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

# LD-only (events via SDK track; logs to JSONL file) — the default when no --profile is set
python darktrainers_simulation.py --records 100
```

Runs without `--profile` are LD-only (no warehouse). Use `--profile` to select a warehouse-backed run.

## Context modes (`--context-mode`)

Controls which context kinds the simulated journeys create, evaluate flags on, and track metrics against. Applies to every profile and to LD-only runs.

| Mode | Journeys generated | Contexts | Metric events keyed by |
|------|--------------------|----------|------------------------|
| `multi` (default) | Guest-only, guest→identified, and identified-from-start | `session`, `user`, and `multi(session+user)` | Session key for guest-only journeys; user key for identified journeys |
| `user` | Identified-from-start only | `user` only (inside a `multi`) | User key, always |

Use `user` mode when you want clean data for a **user-randomized** experiment:

- Only user journeys are generated — no guest-only/session-only traffic — so every flag evaluation and every metric event lands on a real `user` context. This avoids session keys being emitted under `context_kind='user'`.
- The population is both **known** users (from [`vip_users.csv`](vip_users.csv) / [`standard_users.csv`](standard_users.csv), stable keys) **and freshly generated** users with unique UUID keys, so the randomization-unit count scales with `--records` and is large enough for experiment results.
- No metric-table schema change is required.

```bash
# User-randomized experiment: large user population, user-keyed metrics
python darktrainers_simulation.py --profile production-bq --context-mode user --records 1000

# Default mixed traffic (session + user), e.g. for a session-randomized experiment
python darktrainers_simulation.py --profile production-bq --records 300
```

> Note: the exposure/assignment side of a warehouse-native experiment is supplied by LaunchDarkly's [warehouse Data Export](https://launchdarkly.com/docs/home/warehouse-native/creating), which must be enabled for the flag's environment. The simulation only produces the flag evaluations (exposures via the SDK) and the metric events.

## Environment variables

Copy [`.env.example`](.env.example) to `.env` (gitignored) and fill in values.

### LaunchDarkly

| Variable | Profiles |
|----------|----------|
| `LAUNCHDARKLY_SDK_KEY` | `production-bq`, LD-only (no `--profile`) |
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
