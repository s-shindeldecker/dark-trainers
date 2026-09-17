# Demo warehouse star schema

A small dimensional model that resembles a real customer's warehouse, loaded from the
same simulation runs that feed `sshindel_metrics.metric_events`. It exists so the
LaunchDarkly demo can show warehouse-native experimentation against a plausible
schema instead of a single all-events table.

**Status: complete as scoped** (2026-09-09). The intent was a *parallel* data source
that demonstrates a realistic warehouse shape without disturbing anything live, and
that is done:

- Tables exist in `test_data_export.sshindel_metrics` and are populated with fake data
- A LaunchDarkly metric data source is configured against Query A and verified serving
  data in the LD UI
- `metric_events` and the simulation script are untouched — the legacy path remains
  the live one

Nothing here is wired into the simulation. These are hand-run SQL files: apply the
DDL once, run the seed, run the checks. There is no loader, and building one is not
planned — see [Deliberately not built](#deliberately-not-built).

## Why this exists

The current model is one table, `metric_events`, with five columns:
`context_key`, `context_kind`, `event_key`, `event_value`, `received_time`. It works,
but it misrepresents how customers actually store data, and it has one structural
limit: a single `(context_kind, context_key)` column pair means **one row belongs to
exactly one context kind**. A user-randomized experiment and a session-randomized
experiment therefore cannot share a metric.

LaunchDarkly data sources map columns to context kinds as key/kind *pairs*, and accept
more than one ("Add another context pair"). So the fix is a wider row carrying both
`user_key` and `session_key` as columns — which is what the star schema produces
naturally.

## Guardrails

The legacy path is not modified. Specifically:

- **Same schema, new table names.** The five tables live in
  `test_data_export.sshindel_metrics` alongside `metric_events`. Isolation is by
  table name — the `dim_` / `fact_` prefixes don't collide, and nothing reads,
  writes, or alters `metric_events` except the read-only parity queries.
- `generate_metric_event_data()` and all three `insert_metric_events_to_*` functions
  in [darktrainers_simulation.py](../darktrainers_simulation.py) stay as they are.
- No loader exists, so no existing command changes behavior. The simulation writes
  only to `metric_events`, exactly as before.
- Swapping LD between old and new is a data-source config change. No migration
  either direction, so rollback is symmetrical.

## Tables

Grain is the load-bearing detail:

| Table | Grain | Notes |
|---|---|---|
| `dim_customer` | 1 row per LD user context key | Upserted via `MERGE` — VIP keys recur across runs. Guests absent by design. |
| `dim_product` | 1 row per catalog product | Seeded from [productData.ts](../src/components/Products/productData.ts) so warehouse rows use real SKUs. |
| `fact_session` | 1 row per journey | `customer_key` nullable — NULL for guest-only journeys. |
| `fact_engagement_event` | 1 row per `product_viewed` / `add_to_cart` / `banner_click` | Carries the true LD `context_kind`. |
| `fact_order` | 1 row per `checkout_initiated` / `vip_upgrade` | `order_type` distinguishes them. |

`fact_session` is what makes session-level analysis possible at all: a session grain
with a nullable customer means guest sessions stay countable as sessions while
correctly dropping out of user-randomized analysis.

Each session belongs to **at most one** customer — `uuid4()` per journey, and journey
type B reuses one `session_key` across `identify()`. LaunchDarkly requires exactly
this of an analysis unit relative to a randomization unit; violating it lets one
analysis unit receive multiple variations and produces nonsense. Check 4 in
[03_parity_check.sql](../sql/databricks/03_parity_check.sql) guards it.

### Explicit non-goals

- **No flag/variation/exposure tables.** LaunchDarkly exports `evaluation_events`
  itself; duplicating served variations here would create a competing source of truth
  for the exact join the [BQ runbook](../RUNBOOK_BQ_NATIVE_DEBUG.md) depends on.
- **No aggregation anywhere.** LaunchDarkly does not accept pre-calculated metrics.
  Every row is a single event occurrence; LD computes counts, sums, and averages. A
  `GROUP BY` in the data source query would break metric creation.
- **No warehouse views.** The joins live in the LaunchDarkly data source SQL instead
  — see below.
- **No ratio metrics** (deferred — see Constraints).

## LaunchDarkly data source query

There are no views. LaunchDarkly data sources accept a SQL query against one or more
tables, so the joins live in the data source config, where a customer would actually
see and edit them. Showing a 2-fact / 3-dimension join *is* the demo — it's the
contrast against the `SELECT *` over one flat table that it replaces.

[02_ld_data_source.sql](../sql/databricks/02_ld_data_source.sql) is the source of
record for that SQL. LaunchDarkly keeps its own copy, so the two have to be kept in
sync by hand — edit the file, re-paste into LD.

| Query | Purpose |
|---|---|
| **Query A** | The star-schema data source. Paste into LD. Joins both fact tables to `fact_session`, `dim_customer`, and `dim_product`. |
| **Query B** | Legacy-equivalent 5-column projection. Verification only, never pasted into LD. |

Column mapping for Query A:

| LD field | Column |
|---|---|
| Timestamp | `event_ts` |
| Event key | `event_key` |
| Event value | `event_value` |
| Context key | `user_key` → kind `user` |
| Context key | `session_key` → kind `session` (via "Add another context pair") |

Two things that will silently cost you an afternoon:

- Table names must be **fully qualified** (`catalog.schema.table`). LD runs the query
  in its own session with no `USE CATALOG` context.
- The `session` context kind must be marked **available for experiments** in LD
  (Code → Contexts → gear → Edit) or it won't appear as a randomization unit. Kinds
  auto-created from SDKs are not available by default.

Every join is a `LEFT JOIN` from the facts deliberately. An `INNER JOIN` would drop a
metric event if a dimension row were missing — corrupting experiment results in a way
that's very hard to spot. Check 3 in the parity file counts orphans for the same
reason.

### The `context_kind` quirk, and why Query B replicates it

`generate_metric_event_data()` hardcodes `'context_kind': 'user'`
([darktrainers_simulation.py:478](../darktrainers_simulation.py:478)) even for events
tracked on a session context. Journeys A and B therefore write **session keys labelled
as user-kind**. The runbook's join is on `context_key` alone, so it works in practice,
but it is wrong.

The star tables record the true kind. Query B deliberately **replicates the bug** so
old and new reconcile row-for-row — fixing it there would defeat the only check that
proves the swap is safe. Query A exposes the real value as `tracked_context_kind`,
carried for diagnostics and not mapped in LD.

## Constraints found in LD docs

Verified against the LaunchDarkly docs, and they shape what this model can deliver
per warehouse:

- **The integration's catalog/schema are immutable after save.** Catalog, schema,
  metrics catalog, and metrics schema cannot be edited once the Databricks native
  Experimentation integration is created — changing them means deleting and
  recreating it. The service principal is granted `USE SCHEMA` + `SELECT` on one
  metrics schema, which is exactly why the new tables live in `sshindel_metrics`
  rather than a schema of their own.
- **Ratio metrics are Snowflake-only.** Not available for Databricks, BigQuery,
  LD-hosted events, or OpenTelemetry. Deferred out of scope for now.
- **Clustered analysis is Snowflake-only** — the `Analyze by` menu that allows
  randomizing by `user` while analyzing by `session` requires Snowflake plus the
  frequentist methodology.
- **Metric event filtering on extra mapped columns is Snowflake-only.** The
  dimension columns Query A joins in are still useful for ad-hoc SQL on Databricks,
  just not as LD-side event filters.

Session-*randomized* experiments need none of the above — only `session_key` mapped as
a context pair — so they work on Databricks today.

## Files

| File | What it is | How it runs |
|---|---|---|
| [01_star_schema.sql](../sql/databricks/01_star_schema.sql) | DDL for the five tables | Once, against the warehouse |
| [02_ld_data_source.sql](../sql/databricks/02_ld_data_source.sql) | Query A (the LD data source) + Query B (legacy-equivalent projection) | Not run against the warehouse — Query A is pasted into LD |
| [03_parity_check.sql](../sql/databricks/03_parity_check.sql) | Checks 1-5: reconciliation, referential sanity, analysis-unit constraint, data-source shape | By hand, one check at a time |
| [04_seed_fake_data.sql](../sql/databricks/04_seed_fake_data.sql) | Blocks 0-6: reset, seed, verify | By hand, blocks in order, **once each** |

### Running it from scratch

1. Apply `01_star_schema.sql`.
2. Run `04_seed_fake_data.sql` Blocks 1→5 in order, exactly once each. Blocks 1 and 2
   are plain `INSERT`s with no uniqueness guard, so a repeated block duplicates keys,
   and duplicates compound into join fan-out. Block 6 detects this; Block 0 is the
   reset.
3. Run Block 6 and confirm `dupes = 0` on every row.
4. Run Checks 3, 4, and 5 from `03_parity_check.sql`.
5. Paste Query A from `02_ld_data_source.sql` into the LD data source and map the
   columns per the table above.

Checks 1 and 2 compare against `metric_events` and will **not** reconcile for seeded
data — those rows never went through the legacy path. They exist for a future loader,
not for this seed.

## Deliberately not built

Scoped out, recorded here so the absence reads as a decision rather than an oversight:

- **A loader.** The original plan had the simulation dual-write both projections from
  one canonical event record, with a `--warehouse-schema {legacy,star,both}` flag
  defaulting to `legacy`. Not built. `darktrainers_simulation.py` is untouched.
- **Real experiment results.** This follows from having no loader. LaunchDarkly joins
  metric events to the `evaluation_events` it exported from actual flag evaluations.
  The seed's customer keys reproduce the real `vip-user-NNN` / `standard-user-NNN`
  patterns and may join to past evaluations, but its session keys are synthetic and
  join to nothing. **Metrics built on this data source can show empty or meaningless
  results, and that is expected.** Trustworthy numbers need a loader writing keys from
  the same run that evaluated the flags.
- **BigQuery and Snowflake variants.** Databricks only. The `sql/databricks/` path
  leaves room for siblings.
- **Ratio metrics and clustered analysis.** Snowflake-only features — see Constraints.

The informational `PRIMARY KEY`/`FOREIGN KEY` block at the end of
`01_star_schema.sql` is optional — Unity Catalog does not enforce these, they only
make the star shape legible in Catalog Explorer and to lineage tools. If your
workspace rejects them, skip the block; nothing depends on it.
