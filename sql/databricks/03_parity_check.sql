-- DarkTrainers demo warehouse — legacy vs star reconciliation (Databricks)
--
-- Run after a `--warehouse-schema both` simulation run. Both projections derive
-- from one canonical in-memory event record, so these should match exactly. Any
-- difference is a projector bug, not warehouse drift.
--
-- The `star_events` CTE repeated below is Query B from 02_ld_data_source.sql —
-- the legacy-equivalent projection. It is inlined rather than kept as a view
-- because the data source SQL now lives in LaunchDarkly, so the warehouse has
-- no views at all. If you change Query B, change these CTEs too.
--
-- Set the window to cover the run you just executed. The legacy table has no
-- run_id (deliberately — it is untouched), so time is the only join axis.
--
-- Names are fully qualified so each check can be run on its own.

-- Edit the two timestamps in each check below:
--   RUN_START = just before you launched the simulation
--   RUN_END   = just after it finished


-- ---------------------------------------------------------------------------
-- Check 1 — counts and value totals by event_key
-- ---------------------------------------------------------------------------
-- Expected: one row per event_key, all three delta columns zero.
WITH star_events AS (
  SELECT context_key, event_name AS event_key, event_value, event_ts AS received_time
  FROM test_data_export.sshindel_metrics.fact_engagement_event
  UNION ALL
  SELECT context_key, order_type AS event_key, order_total AS event_value, order_ts AS received_time
  FROM test_data_export.sshindel_metrics.fact_order
),
legacy AS (
  SELECT event_key, COUNT(*) AS n, SUM(event_value) AS total, COUNT(event_value) AS n_valued
  FROM test_data_export.sshindel_metrics.metric_events
  WHERE received_time >= TIMESTAMP '2026-01-01 00:00:00'   -- <-- RUN_START
    AND received_time <  TIMESTAMP '2027-01-01 00:00:00'   -- <-- RUN_END
  GROUP BY event_key
),
star AS (
  SELECT event_key, COUNT(*) AS n, SUM(event_value) AS total, COUNT(event_value) AS n_valued
  FROM star_events
  WHERE received_time >= TIMESTAMP '2026-01-01 00:00:00'   -- <-- RUN_START
    AND received_time <  TIMESTAMP '2027-01-01 00:00:00'   -- <-- RUN_END
  GROUP BY event_key
)
SELECT
  COALESCE(l.event_key, s.event_key)                    AS event_key,
  l.n                                                   AS legacy_rows,
  s.n                                                   AS star_rows,
  COALESCE(s.n, 0) - COALESCE(l.n, 0)                   AS delta_rows,
  ROUND(COALESCE(s.total, 0) - COALESCE(l.total, 0), 4) AS delta_value,
  COALESCE(s.n_valued, 0) - COALESCE(l.n_valued, 0)     AS delta_valued_rows
FROM legacy l
FULL OUTER JOIN star s USING (event_key)
ORDER BY event_key;


-- ---------------------------------------------------------------------------
-- Check 2 — row-level symmetric difference
-- ---------------------------------------------------------------------------
-- Expected: zero rows. `side` tells you which projection has the orphan.
-- context_kind is hardcoded to 'user' on the star side to match what the
-- simulation writes today — see the note on Query B in 02_ld_data_source.sql.
WITH star_events AS (
  SELECT context_key, 'user' AS context_kind, event_name AS event_key, event_value, event_ts AS received_time
  FROM test_data_export.sshindel_metrics.fact_engagement_event
  UNION ALL
  SELECT context_key, 'user' AS context_kind, order_type AS event_key, order_total AS event_value, order_ts AS received_time
  FROM test_data_export.sshindel_metrics.fact_order
),
legacy AS (
  SELECT context_key, context_kind, event_key, event_value, received_time
  FROM test_data_export.sshindel_metrics.metric_events
  WHERE received_time >= TIMESTAMP '2026-01-01 00:00:00'   -- <-- RUN_START
    AND received_time <  TIMESTAMP '2027-01-01 00:00:00'   -- <-- RUN_END
),
star AS (
  SELECT context_key, context_kind, event_key, event_value, received_time
  FROM star_events
  WHERE received_time >= TIMESTAMP '2026-01-01 00:00:00'   -- <-- RUN_START
    AND received_time <  TIMESTAMP '2027-01-01 00:00:00'   -- <-- RUN_END
)
SELECT 'legacy_only' AS side, * FROM (SELECT * FROM legacy EXCEPT ALL SELECT * FROM star)
UNION ALL
SELECT 'star_only'   AS side, * FROM (SELECT * FROM star   EXCEPT ALL SELECT * FROM legacy);


-- ---------------------------------------------------------------------------
-- Check 3 — star-schema referential sanity
-- ---------------------------------------------------------------------------
-- UC constraints are informational and unenforced, so verify by query. This
-- matters more now that the data source SQL does the joins: a missing dimension
-- row would show up as NULL columns in LaunchDarkly rather than an error.
-- Expected: all zeros.
SELECT
  (SELECT COUNT(*) FROM test_data_export.sshindel_metrics.fact_engagement_event e
     LEFT JOIN test_data_export.sshindel_metrics.fact_session s ON e.session_key = s.session_key
   WHERE s.session_key IS NULL)                                      AS engagement_orphan_sessions,
  (SELECT COUNT(*) FROM test_data_export.sshindel_metrics.fact_order o
     LEFT JOIN test_data_export.sshindel_metrics.fact_session s ON o.session_key = s.session_key
   WHERE s.session_key IS NULL)                                      AS order_orphan_sessions,
  (SELECT COUNT(*) FROM test_data_export.sshindel_metrics.fact_engagement_event e
     LEFT JOIN test_data_export.sshindel_metrics.dim_customer c ON e.customer_key = c.customer_key
   WHERE e.customer_key IS NOT NULL AND c.customer_key IS NULL)      AS engagement_orphan_customers,
  (SELECT COUNT(*) FROM test_data_export.sshindel_metrics.fact_order o
     LEFT JOIN test_data_export.sshindel_metrics.dim_customer c ON o.customer_key = c.customer_key
   WHERE o.customer_key IS NOT NULL AND c.customer_key IS NULL)      AS order_orphan_customers,
  (SELECT COUNT(*) FROM test_data_export.sshindel_metrics.fact_engagement_event e
     LEFT JOIN test_data_export.sshindel_metrics.dim_product p ON e.product_id = p.product_id
   WHERE e.product_id IS NOT NULL AND p.product_id IS NULL)          AS engagement_orphan_products,
  (SELECT COUNT(*) FROM (
     SELECT customer_key FROM test_data_export.sshindel_metrics.dim_customer
     GROUP BY customer_key HAVING COUNT(*) > 1))                     AS duplicated_customer_keys;


-- ---------------------------------------------------------------------------
-- Check 4 — the analysis-unit constraint
-- ---------------------------------------------------------------------------
-- LaunchDarkly requires each analysis unit to belong to exactly one
-- randomization unit. A session mapping to more than one customer would
-- silently corrupt session-level analysis.
-- Expected: zero rows.
SELECT session_key, COUNT(DISTINCT customer_key) AS distinct_customers
FROM test_data_export.sshindel_metrics.fact_session
WHERE customer_key IS NOT NULL
GROUP BY session_key
HAVING COUNT(DISTINCT customer_key) > 1;


-- ---------------------------------------------------------------------------
-- Check 5 — the data source query returns what LD expects
-- ---------------------------------------------------------------------------
-- Run Query A from 02_ld_data_source.sql wrapped in this, before pasting it
-- into LaunchDarkly. It catches the two failure modes that produce a silently
-- empty or unusable data source.
-- Expected: null_event_ts = 0, null_event_key = 0, rows_with_no_context = 0,
-- rows_missing_session_join = 0. rows_session_only > 0 is CORRECT — those are
-- guest events with no user_key, which is the whole point of the session grain.
--
-- The ds CTE below is Query A from 02_ld_data_source.sql verbatim (minus its
-- trailing semicolon). If you edit Query A, re-copy it here.
WITH ds AS (
  SELECT
    e.event_name                          AS event_key,
    e.event_value                         AS event_value,
    e.event_ts                            AS event_ts,
    e.customer_key                        AS user_key,
    e.session_key                         AS session_key,
    s.journey_type                        AS journey_type,
    s.device_type                         AS device_type,
    s.traffic_source                      AS traffic_source,
    s.member_tier_at_session              AS member_tier_at_session,
    c.member_tier                         AS customer_member_tier,
    c.lifetime_spend                      AS customer_lifetime_spend,
    c.preferred_category                  AS customer_preferred_category,
    c.state                               AS customer_state,
    p.product_id                          AS product_id,
    p.product_name                        AS product_name,
    p.category                            AS product_category,
    e.event_id                            AS event_id,
    e.context_kind                        AS tracked_context_kind
  FROM test_data_export.sshindel_metrics.fact_engagement_event e
  LEFT JOIN test_data_export.sshindel_metrics.fact_session  s ON e.session_key  = s.session_key
  LEFT JOIN test_data_export.sshindel_metrics.dim_customer  c ON e.customer_key = c.customer_key
  LEFT JOIN test_data_export.sshindel_metrics.dim_product   p ON e.product_id   = p.product_id
  UNION ALL
  SELECT
    o.order_type                          AS event_key,
    o.order_total                         AS event_value,
    o.order_ts                            AS event_ts,
    o.customer_key                        AS user_key,
    o.session_key                         AS session_key,
    s.journey_type                        AS journey_type,
    s.device_type                         AS device_type,
    s.traffic_source                      AS traffic_source,
    s.member_tier_at_session              AS member_tier_at_session,
    c.member_tier                         AS customer_member_tier,
    c.lifetime_spend                      AS customer_lifetime_spend,
    c.preferred_category                  AS customer_preferred_category,
    c.state                               AS customer_state,
    CAST(NULL AS STRING)                  AS product_id,
    CAST(NULL AS STRING)                  AS product_name,
    CAST(NULL AS STRING)                  AS product_category,
    o.order_id                            AS event_id,
    o.context_kind                        AS tracked_context_kind
  FROM test_data_export.sshindel_metrics.fact_order o
  LEFT JOIN test_data_export.sshindel_metrics.fact_session s ON o.session_key  = s.session_key
  LEFT JOIN test_data_export.sshindel_metrics.dim_customer c ON o.customer_key = c.customer_key
)
SELECT
  COUNT(*)                                                           AS total_rows,
  SUM(CASE WHEN event_ts  IS NULL THEN 1 ELSE 0 END)                 AS null_event_ts,
  SUM(CASE WHEN event_key IS NULL THEN 1 ELSE 0 END)                 AS null_event_key,
  SUM(CASE WHEN user_key IS NULL AND session_key IS NULL
           THEN 1 ELSE 0 END)                                        AS rows_with_no_context,
  SUM(CASE WHEN journey_type IS NULL THEN 1 ELSE 0 END)              AS rows_missing_session_join,
  SUM(CASE WHEN user_key IS NULL THEN 1 ELSE 0 END)                  AS rows_session_only,
  COUNT(DISTINCT event_key)                                          AS distinct_event_keys,
  MIN(event_ts)                                                      AS earliest_event,
  MAX(event_ts)                                                      AS latest_event
FROM ds;
