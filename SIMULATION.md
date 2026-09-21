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

| Mode | Journeys generated | Contexts | Metric events keyed by | `context_kind` written |
|------|--------------------|----------|------------------------|------------------------|
| `multi` (default) | Guest-only, guest→identified, and identified-from-start | `session`, `user`, and `multi(session+user)` | Session key for guest-only journeys and for journey B's pre-`identify()` events; user key for identified journeys | `session` or `user`, matching the context the event was tracked on |
| `user` | Identified-from-start only | `user` only (inside a `multi`) | User key, always | `user`, always |

Each metric row's `context_kind` is the kind of the context the event was actually tracked on, since `(context_kind, context_key)` is what LaunchDarkly joins metric rows to assignment rows by. A session key labelled `user` joins no user-context assignment data at all, so the metric under-counts silently rather than failing.

Use `user` mode when you want a single-kind population for a **user-randomized** experiment:

- Only user journeys are generated — no guest-only/session-only traffic — so every flag evaluation and every metric event lands on a real `user` context, and every row is `context_kind='user'` truthfully.
- The population is both **known** users (from [`vip_users.csv`](vip_users.csv) / [`standard_users.csv`](standard_users.csv), stable keys) **and freshly generated** users with unique UUID keys, so the randomization-unit count scales with `--records` and is large enough for experiment results.
- No metric-table schema change is required.

```bash
# User-randomized experiment: large user population, user-keyed metrics
python darktrainers_simulation.py --profile production-bq --context-mode user --records 1000

# Default mixed traffic (session + user), e.g. for a session-randomized experiment
python darktrainers_simulation.py --profile production-bq --records 300
```

> Note: the exposure/assignment side of a warehouse-native experiment is supplied by LaunchDarkly's [warehouse Data Export](https://launchdarkly.com/docs/home/warehouse-native/creating), which must be enabled for the flag's environment. The simulation only produces the flag evaluations (exposures via the SDK) and the metric events.

## Warehouse schema (`--warehouse-schema`)

Which warehouse projection a run writes. **Databricks only** — `star` and `both` exit with an error on any other profile.

| Mode | Writes | Notes |
|------|--------|-------|
| `legacy` (default) | `metric_events` only | Exactly the behavior from before this option existed. Every existing invocation is unaffected. |
| `star` | `dim_customer`, `fact_session`, `fact_engagement_event`, `fact_order` | `metric_events` untouched. |
| `both` | Both projections, from the same journeys | What the parity checks in [03_parity_check.sql](sql/databricks/03_parity_check.sql) are written against. |

```bash
# Default — unchanged
python darktrainers_simulation.py --profile test-databricks --records 300

# Dimensional model only
python darktrainers_simulation.py --profile test-databricks --warehouse-schema star --records 300

# Both projections
python darktrainers_simulation.py --profile test-databricks --warehouse-schema both --records 300
```

Why the star schema exists at all: `metric_events` has one `(context_kind, context_key)`
pair, so a row belongs to exactly one context kind and a user-randomized and a
session-randomized experiment cannot share a metric. The dimensional model carries
`user_key` and `session_key` as separate columns, which LaunchDarkly maps as two
context pairs. See [docs/WAREHOUSE_MODEL.md](docs/WAREHOUSE_MODEL.md) for the full
model, the loader's guardrails, and the Snowflake-only limitations (clustered
analysis, ratio metrics) that this **does not** deliver.

Prerequisites for `star`/`both`:

1. [`01_star_schema.sql`](sql/databricks/01_star_schema.sql) applied once. The loader
   verifies the tables exist and never creates them.
2. `dim_product` seeded (Block 1 of [`04_seed_fake_data.sql`](sql/databricks/04_seed_fake_data.sql)),
   **re-run by hand after any catalog change** — the loader references product keys but
   never writes that table.

Every star row carries `run_id = 'sim-<timestamp>-<rand>'`, logged at the start of the
run, so a single run can be deleted precisely.

## Events

| Event key | Value | Where it comes from |
|---|---|---|
| `product_viewed` | product price | every journey |
| `add_to_cart` | product price | tier-weighted |
| `checkout_initiated` | cart total | tier-weighted, AOV skewed by tier |
| `vip_upgrade` | `14.99` | standard tier only |
| `banner_click` | — | only when the promo banner has text |
| `search_performed` | number of results | search leg; server-side in the real app |
| `search_result_clicked` | product price | search leg, only when results came back |
| `search_zero_results` | — | search leg, mutually exclusive with a click |

### Search probabilities

`search_performed` is tier-based; `search_result_clicked` is tier-based **and scaled by
the served `search-ranking-algorithm` variation**. That conditioning is deliberate: a
click rate that varied only by tier would make the experiment's winner a coin flip
across runs. Tying the lift to the served arm gives `personalized-affinity` a real,
repeatable edge for VIP — the story the demo is telling — and `weighted-relevance` a
smaller, broader one.

| | VIP | Standard | Guest |
|---|---|---|---|
| `search_performed` | 40% | 35% | 30% |
| `search_result_clicked` — `legacy-keyword` | 55% | 30% | 15% |
| `search_result_clicked` — `weighted-relevance` | 66% | 36% | 16.5% |
| `search_result_clicked` — `personalized-affinity` | 79.8% | 34.5% | 15% |

Zero-result rate is also per-arm — a better ranker whiffs less often: `legacy-keyword`
12%, `weighted-relevance` 6%, `personalized-affinity` 6%. A zero-result search cannot
be clicked, so the two outcomes are mutually exclusive by construction.

This is independent of `--force-flag` / `--force-variation` / `--force-lift`, which
bluntly lifts *every* metric on a chosen arm of any flag. Tune the multipliers in
`CONFIG["search"]` to reshape the search story itself.

> **Known divergence from the live app, for guest traffic.** These rates model only
> "the ranking found nothing." They do **not** model drop entitlement, which the app
> applies server-side (`applyDropAccessState`) *before* counting results and firing
> `search_performed` — so in the app a guest search has a second way to reach zero:
> every hit was a drop-exclusive SKU in the `hidden` state. 11 of the 39 searchable
> SKUs (28%) are `isDropExclusive` and therefore hidden from a `teaser` visitor.
> (Entitlement is three-state — see `src/lib/dropAccess.ts`. Only `hidden` removes
> results; `view-only` hits are returned and counted, just not purchasable, so they
> never contribute to a zero-result search.)
>
> Net effect: against live traffic, the simulation **under-states the guest
> zero-result rate and over-states guest `search_performed` values**. Identified
> Standard and VIP traffic is unaffected in the simulation (journeys B and C search
> after `identify()`), and VIP is unaffected in the app too since
> `ac26-drop-access` serves VIP `full-access`. Standard members *are* gated in the
> app but not in the simulation.
>
> Left as a documented gap rather than modeled, because modeling it properly means
> teaching the simulation about `ac26-drop-access` and per-product tags — a real
> addition, not a constant to tune. If a demo compares the simulated guardrail
> against live guest traffic, expect the simulated guest zero-rate to read low.

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
| `SNOWFLAKE_PRIVATE_KEY` | — | PEM key **content**, not a path (alternative to password) |
| `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` | — | Passphrase for encrypted private key |
| `SNOWFLAKE_WAREHOUSE` | (required) | Warehouse |
| `SNOWFLAKE_DATABASE` | (required) | Database |
| `SNOWFLAKE_SCHEMA` | (required) | Schema |
| `SNOWFLAKE_METRICS_TABLE` | `metric_events` | Table name (or use `SNOWFLAKE_METRIC_EVENTS_TABLE`) |
| `SNOWFLAKE_ROLE` | `ACCOUNTADMIN` | Role |

Prefer key-pair auth over `SNOWFLAKE_PASSWORD`, which Snowflake now gates behind MFA.
`SNOWFLAKE_PRIVATE_KEY` must hold the **PEM body itself** — a file path is not accepted.
Use an unencrypted PKCS#8 key as a single line with `\n` escapes, which
[`get_snowflake_connection`](darktrainers_simulation.py) un-escapes before parsing:

```
# one line; keep the PEM BEGIN/END lines, with every real newline written as \n
SNOWFLAKE_PRIVATE_KEY=<BEGIN PRIVATE KEY line>\nMIIEv...\n<END PRIVATE KEY line>
```

(The PEM header is shown as a placeholder rather than spelled out because the secret-scan
[pre-commit hook](.githooks/pre-commit) flags that marker on sight.)

Generate the pair with `openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.p8`,
keep the `.p8` outside the repo (`~/.snowflake`, mode `600`), then register the public half
with `ALTER USER <user> SET RSA_PUBLIC_KEY='<base64 body>'`. The key attaches to the
*user*, not a database — `SNOWFLAKE_DATABASE`/`SCHEMA`/`WAREHOUSE` are only session
context, and the role decides what it can reach.

### Optional tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `DARKTRAINERS_SIMULATION_DELAY_BETWEEN_JOURNEYS` | `2.0` | Seconds between journeys in LD-only mode |

## Metric table schema

The star-schema tables are documented separately in [docs/WAREHOUSE_MODEL.md](docs/WAREHOUSE_MODEL.md); the columns below are the flat `metric_events` table.

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

`context_kind` is written per row as the kind of the context the event was tracked on — `session` for guest-phase events (all of journey A, and journey B before `identify()`), `user` otherwise. It is not a constant: in the default `multi` mode a single run produces both values, and `context_key` is a session UUID exactly on the `session` rows. Filter on `context_kind` when a metric should feed a user-randomized experiment, or run `--context-mode user` for user rows only.

## Adding a new profile

Register a new entry in `PROFILES` inside `darktrainers_simulation.py` with `ld_sdk_key_env` and `warehouse` (`bigquery`, `databricks`, or `snowflake`). No journey logic changes are required.

## Dependencies

```bash
pip install -r requirements.txt
```

Warehouse backends are optional at import time; install only what you need if you prefer a slimmer environment.
