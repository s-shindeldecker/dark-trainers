# Demo warehouse star schema

A small dimensional model that resembles a real customer's warehouse, loaded from the
same simulation runs that feed `sshindel_metrics.metric_events`. It exists so the
LaunchDarkly demo can show warehouse-native experimentation against a plausible
schema instead of a single all-events table.

**Status: loaded from the simulation** (2026-09-17). The original scope was a
*parallel* data source demonstrating a realistic warehouse shape without disturbing
anything live, with no loader. That first half still holds:

- Tables exist in `test_data_export.sshindel_metrics` and are populated
- A LaunchDarkly metric data source is configured against Query A and verified serving
  data in the LD UI

What changed: the server-side search experiment randomizes on `multi{session,user}`,
which is exactly the case `metric_events` structurally cannot serve (one row, one
context kind). So the loader that was [deliberately not
built](#deliberately-not-built) now exists — see [The loader](#the-loader). The
legacy path is still the live default:

- `--warehouse-schema` defaults to `legacy`, so every existing invocation writes only
  `metric_events`, exactly as before
- `generate_metric_event_data()` and all three `insert_metric_events_to_*` functions
  are untouched
- The DDL and seed are still hand-run SQL files: apply the DDL once, run the seed,
  run the checks

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
  The loader is a sibling function, not a modification of them.
- **`--warehouse-schema` defaults to `legacy`.** This is the load-bearing guardrail:
  no existing command changes behavior, and the simulation writes only to
  `metric_events` unless someone explicitly passes `star` or `both`.
- Swapping LD between old and new is a data-source config change. No migration
  either direction, so rollback is symmetrical.

## Tables

Grain is the load-bearing detail:

| Table | Grain | Notes |
|---|---|---|
| `dim_customer` | 1 row per LD user context key | Upserted via `MERGE` — VIP keys recur across runs. Guests absent by design. |
| `dim_product` | 1 row per catalog product | Hand-seeded snapshot of [productData.ts](../src/components/Products/productData.ts). **The loader never writes it** — re-run Block 1 by hand after a catalog change. |
| `fact_session` | 1 row per journey | `customer_key` nullable — NULL for guest-only journeys. |
| `fact_engagement_event` | 1 row per `product_viewed` / `add_to_cart` / `banner_click` / `search_performed` / `search_result_clicked` / `search_zero_results` | Carries the true LD `context_kind`. |
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

### `context_kind`: both projections now write the true kind

Both the star tables and the flat `metric_events` table record the kind of the context
each event actually fired on: `session` for events on a session-only context, `user`
for events on a `multi{session,user}` context. A verification run shows the split
plainly — `product_viewed` comes back as a mix of `session` (journey A, and journey B
pre-identify) and `user` (journey C).

This used to differ between the two. `generate_metric_event_data()` hardcoded
`'context_kind': 'user'` for every row, so journeys A and B wrote **session keys
labelled as user-kind** into `metric_events`. The runbook's join is on `context_key`
alone so it went unnoticed, but those rows could not join LaunchDarkly's user-context
assignment data, which makes a user-randomized experiment's metrics under-count
silently. `_track()` now threads the real kind through to the row builder; the star
loader never had the bug and is unchanged.

Consequently **Query B no longer projects a literal `'user'`** on the star side, and
Check 2 in the parity file no longer needs to cancel the mismatch out — `context_kind`
is compared like any other column. Rows written before the fix still carry the old
label, so bound a parity run's `RUN_START`/`RUN_END` to a post-fix run or those rows
show up as kind-only mismatches. Query A continues to expose the same value under the
clearer name `tracked_context_kind`, carried for diagnostics and not mapped in LD.

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
| [04_seed_fake_data.sql](../sql/databricks/04_seed_fake_data.sql) | Blocks 0-6: reset, seed, verify | By hand, blocks in order, **once each**. Block 1 (`dim_product`) is also re-run on its own after a catalog change. |
| [darktrainers_simulation.py](../darktrainers_simulation.py) | `insert_star_schema_events_databricks()` — the loader | `--warehouse-schema star\|both` on the `test-databricks` profile |

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
6. For results that actually mean something, run the loader so the star rows carry
   keys from a run that evaluated the flags:
   `python darktrainers_simulation.py --profile test-databricks --warehouse-schema both --records 300`

Checks 1 and 2 compare against `metric_events`. They will **not** reconcile for seeded
data — those rows never went through the legacy path, which is why their star side is
scoped to `run_id LIKE 'sim-%'`. Even for loader rows they are diagnostic rather than a
gate: exact reconciliation is explicitly not a requirement.

## Deliberately not built

Scoped out, recorded here so the absence reads as a decision rather than an oversight:

- **BigQuery and Snowflake loader variants.** Databricks only. The `sql/databricks/`
  path and the `insert_star_schema_events_databricks` naming both leave room for
  siblings, so adding one is an addition rather than a rewrite.
- **Ratio metrics and clustered analysis.** Snowflake-only features — see Constraints.
  If the narrative needs either, that is a separate scoped decision, not something to
  assume this model delivers.
- **Flag / variation / exposure tables.** LaunchDarkly exports `evaluation_events`
  itself; see the non-goals above. The loader writes metric events only.

~~**A loader.**~~ Built — see below.

## The loader

`insert_star_schema_events_databricks()` in
[darktrainers_simulation.py](../darktrainers_simulation.py) writes the dimensional
model from the same journeys that feed `metric_events`. It exists because the
server-side search experiment randomizes on `multi{session,user}`, and a
single-context-kind row cannot carry that.

```sh
# default — unchanged behavior, metric_events only
python darktrainers_simulation.py --profile test-databricks --records 300

# star tables only, metric_events untouched
python darktrainers_simulation.py --profile test-databricks --warehouse-schema star --records 300

# both projections from the same journeys
python darktrainers_simulation.py --profile test-databricks --warehouse-schema both --records 300
```

| Aspect | Behavior |
|---|---|
| Default | `legacy`. Star output is off unless explicitly asked for. |
| Warehouse | Databricks only. `star`/`both` on any other profile exits with an error rather than writing a partial anything. |
| Preflight | Verifies the five tables exist and names `01_star_schema.sql` if they don't. It never creates them — two copies of the DDL would drift. |
| `dim_customer` | `MERGE` upsert, deduped per run first (a Databricks `MERGE` fails outright if the source matches a target row twice, and VIP keys recur within a run). `first_seen_ts` is never overwritten. |
| `dim_product` | Never written. Referenced only. |
| `fact_session` | One row per journey, `customer_key` NULL for guest-only, one customer per session by construction (a journey has exactly one `identify()` point). |
| Product keys | Parsed out of `productData.ts` at import, so they track the catalog automatically instead of via a second hardcoded list. Best-effort: a failed parse logs a warning and writes NULL product keys rather than failing the run. |
| Traceability | Every star row carries `run_id = 'sim-<timestamp>-<rand>'`, logged at the start of the run, so one run can be deleted exactly. Seeded rows carry `seed-v1`. |

**The bar it clears** is a demo capability proof: a `both` run completes without
errors and produces non-empty star rows. Exact reconciliation with `metric_events`
(Checks 1 and 2) is explicitly *not* required — dropped events or minor
discrepancies are fine. Checks 3 and 4 are the ones that matter, because a
referential orphan or a session bound to two customers is what makes an LD results
screen look visibly broken rather than just quietly imperfect.

**After a catalog change**, re-run Block 1 of
[04_seed_fake_data.sql](../sql/databricks/04_seed_fake_data.sql) by hand. The loader
references product keys but never writes `dim_product`, so new SKUs otherwise show up
as orphaned `product_id`s (Check 3 counts them) and Query A returns NULL product
columns for those rows.

**Real experiment results** now follow from having a loader: LaunchDarkly joins metric
events to the `evaluation_events` it exported from actual flag evaluations, and the
loader writes keys from the same run that evaluated the flags. The hand-seeded
`seed-v1` rows still join to nothing on the session side — **metrics computed over
seed data alone can show empty or meaningless results, and that is expected.**

The informational `PRIMARY KEY`/`FOREIGN KEY` block at the end of
`01_star_schema.sql` is optional — Unity Catalog does not enforce these, they only
make the star shape legible in Catalog Explorer and to lineage tools. If your
workspace rejects them, skip the block; nothing depends on it.
