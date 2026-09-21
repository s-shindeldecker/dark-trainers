-- DarkTrainers demo warehouse — LaunchDarkly metric data source query (Databricks)
--
-- This file is the SOURCE OF RECORD for the SQL pasted into the LaunchDarkly
-- data source config (Data -> Data sources -> Create metric source -> "Enter a
-- SQL query against one or more tables"). LD stores its own copy, so when you
-- edit this file, re-paste it into LD — and vice versa.
--
-- The joins are deliberately here, in the data source query, rather than hidden
-- behind a warehouse view. Showing a 2-fact / 3-dimension join is the point of
-- the demo: this is what a customer's real data source SQL looks like, versus
-- the `SELECT *` over a single flat table it replaces.
--
-- Table names are FULLY QUALIFIED because LaunchDarkly executes this query in
-- its own session — there is no USE CATALOG / USE SCHEMA context. The catalog
-- (test_data_export) matches $DATABRICKS_CATALOG in .env; the new tables live in
-- the sshindel_metrics schema, parallel to the legacy sshindel_metrics.
--
-- No aggregation. LaunchDarkly does not accept pre-calculated metrics, so each
-- row is exactly one event occurrence and LD computes counts, sums, and
-- averages itself. Adding GROUP BY here breaks metric creation.


-- ===========================================================================
-- Query A — the star-schema data source  (paste this into LaunchDarkly)
-- ===========================================================================
--
-- Column mapping in the LD "Map your data in LaunchDarkly" step:
--
--   Timestamp    -> event_ts
--   Event key    -> event_key
--   Event value  -> event_value
--   Context key  -> user_key      mapped to context kind "user"
--   Context key  -> session_key   mapped to context kind "session"
--                   (click "Add another context pair" for the second one)
--
-- Both context keys on the same row is what the old single-column
-- (context_kind, context_key) shape could not express. It lets one metric serve
-- a user-randomized experiment and a session-randomized one.
--
-- The `session` context kind must be marked "available for experiments" in LD
-- (Code -> Contexts -> gear -> Edit) or it will not appear as a randomization
-- unit. Kinds auto-created from SDKs are not available by default.
--
-- user_key is NULL for events that fired before identify(). Those rows drop out
-- of user-randomized analysis and stay valid for session-randomized analysis,
-- which is intended.
--
-- Every join is a LEFT JOIN from the fact tables on purpose: an INNER JOIN
-- would silently drop a metric event if a dimension row were missing, which
-- would corrupt experiment results in a way that is very hard to notice.

SELECT
  -- Fields LaunchDarkly maps
  e.event_name                          AS event_key,
  e.event_value                         AS event_value,
  e.event_ts                            AS event_ts,
  e.customer_key                        AS user_key,
  e.session_key                         AS session_key,

  -- Session dimensions
  s.journey_type                        AS journey_type,
  s.device_type                         AS device_type,
  s.traffic_source                      AS traffic_source,
  s.member_tier_at_session              AS member_tier_at_session,

  -- Customer dimensions
  c.member_tier                         AS customer_member_tier,
  c.lifetime_spend                      AS customer_lifetime_spend,
  c.preferred_category                  AS customer_preferred_category,
  c.state                               AS customer_state,

  -- Product dimensions
  p.product_id                          AS product_id,
  p.product_name                        AS product_name,
  p.category                            AS product_category,

  -- Diagnostics (not mapped in LD)
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

  -- Orders carry no single product; the cart grain is not modeled.
  CAST(NULL AS STRING)                  AS product_id,
  CAST(NULL AS STRING)                  AS product_name,
  CAST(NULL AS STRING)                  AS product_category,

  o.order_id                            AS event_id,
  o.context_kind                        AS tracked_context_kind
FROM test_data_export.sshindel_metrics.fact_order o
LEFT JOIN test_data_export.sshindel_metrics.fact_session s ON o.session_key  = s.session_key
LEFT JOIN test_data_export.sshindel_metrics.dim_customer c ON o.customer_key = c.customer_key;


-- ===========================================================================
-- Query B — legacy-equivalent projection  (verification only, do NOT paste)
-- ===========================================================================
--
-- Reproduces the exact 5-column shape of sshindel_metrics.metric_events
-- from the star tables, so 03_parity_check.sql can prove the new model lost
-- nothing before you repoint LaunchDarkly.
--
-- It selects the real context_kind from the fact tables. This used to hardcode
-- 'user' to replicate a bug in the simulation's generate_metric_event_data(),
-- which labelled every row 'user' even when the event was tracked on a session
-- context (journeys A and B wrote session keys as user-kind). That write now
-- passes the true kind, so both projections agree and the reconciliation is
-- meaningful without compensating for anything. Query A above still exposes the
-- same value under the clearer name `tracked_context_kind`.
--
-- 03_parity_check.sql already inlines this query; it is repeated here so the
-- two projections sit side by side and stay in sync when either changes.

SELECT
  context_key,
  context_kind,
  event_name      AS event_key,
  event_value,
  event_ts        AS received_time
FROM test_data_export.sshindel_metrics.fact_engagement_event

UNION ALL

SELECT
  context_key,
  context_kind,
  order_type      AS event_key,
  order_total     AS event_value,
  order_ts        AS received_time
FROM test_data_export.sshindel_metrics.fact_order;
