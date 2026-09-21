-- DarkTrainers demo warehouse — fake data seed (Databricks)
--
-- Fastest path to non-empty tables. Pure SQL: paste each numbered block into the
-- Databricks SQL editor in order, top to bottom. No Python, no loader, no
-- connection setup. Throwaway demo data; no loader exists and none is planned.
-- See docs/WAREHOUSE_MODEL.md, "Deliberately not built".
--
-- Every seeded row is tagged run_id = 'seed-v1', so cleanup is exact and can
-- never touch loader-written rows. Block 0 below is the undo.
--
-- WHAT THIS IS GOOD FOR
--   * Confirming Query A in 02_ld_data_source.sql runs and returns rows
--   * Creating the LaunchDarkly data source and validating the column mapping
--   * Browsing the star schema in Catalog Explorer
--
-- WHAT IT CANNOT DO
--   * Produce real experiment results. LaunchDarkly joins metric events to the
--     evaluation_events it exported from actual flag evaluations. Customer keys
--     here follow the real vip-user-NNN / standard-user-NNN patterns from
--     vip_users.csv and standard_users.csv, so they MAY join to evaluations from
--     past simulation runs — but session keys are synthetic and will not, and
--     nothing here is guaranteed to fall inside a live experiment's window.
--     Trustworthy results would need a loader writing keys from the same run that
--     evaluated the flags. That is out of scope; see docs/WAREHOUSE_MODEL.md.
--
-- Blocks run in order because each reads committed rows from the previous one.
-- That is deliberate: rand() and the sequence generators would otherwise be
-- re-evaluated per reference and produce rows that do not join.


-- ===========================================================================
-- Block 0 — cleanup / undo  (skip on first run)
-- ===========================================================================
-- Run this before ANY re-seed, and to recover from duplicated keys. Safe to
-- paste as-is: metric_events is never referenced. The fact deletes are scoped to
-- run_id so loader-written rows survive.
--
-- dim_customer is NO LONGER seed-only — the star-schema loader upserts into it
-- (see darktrainers_simulation.py, insert_star_schema_events_databricks). So the
-- delete below is scoped to the seed's own key space (vip-user-NNN /
-- standard-user-NNN, which Block 2 recreates) instead of clearing the table.
-- That deliberately preserves the loader's UUID-keyed "unknown" customers,
-- whose fact rows would otherwise be left orphaned.
--
-- dim_product stays a wholesale clear: the loader only ever references it.

DELETE FROM test_data_export.sshindel_metrics.fact_order            WHERE run_id = 'seed-v1';
DELETE FROM test_data_export.sshindel_metrics.fact_engagement_event WHERE run_id = 'seed-v1';
DELETE FROM test_data_export.sshindel_metrics.fact_session          WHERE run_id = 'seed-v1';
DELETE FROM test_data_export.sshindel_metrics.dim_customer
  WHERE customer_key LIKE 'vip-user-%' OR customer_key LIKE 'standard-user-%';
DELETE FROM test_data_export.sshindel_metrics.dim_product;


-- ===========================================================================
-- Block 1 — dim_product  (55 rows, the real app catalog)
-- ===========================================================================
-- Extracted from src/components/Products/productData.ts, so warehouse rows
-- reference the same SKUs the storefront renders.
--
-- RE-RUN THIS BLOCK (after Block 0) WHENEVER THE CATALOG CHANGES. The star
-- schema loader in darktrainers_simulation.py references product keys but never
-- writes dim_product, so a SKU added to productData.ts and not re-seeded here
-- shows up as an orphaned product_id in fact_engagement_event — Check 3 in
-- 03_parity_check.sql counts exactly that, and Query A returns NULL product
-- columns for those rows.

INSERT INTO test_data_export.sshindel_metrics.dim_product
  (product_id, product_name, category, list_price)
VALUES
  ('volt-hi-ac26-magenta', 'VOLT-HI x AC26', 'lifestyle', 285),
  ('volt-hi-ac26-purple-wave', 'VOLT-HI x AC26', 'lifestyle', 285),
  ('volt-hi-ac26-full-campaign', 'VOLT-HI x AC26', 'lifestyle', 325),
  ('apex-low-ac26-monstar', 'APEX LOW x AC26', 'lifestyle', 265),
  ('apex-low-ac26-albert', 'APEX LOW x AC26', 'lifestyle', 265),
  ('phantom-hi-x-gravity-farms', 'DarkTrainers PHANTOM HI x Gravity Farms', 'lifestyle', 220),
  ('volt-1', 'DarkTrainers VOLT-1', 'running', 185),
  ('apex-low', 'DarkTrainers APEX LOW', 'lifestyle', 140),
  ('circuit-mid', 'DarkTrainers CIRCUIT MID', 'training', 165),
  ('phantom-hi', 'DarkTrainers PHANTOM HI', 'basketball', 175),
  ('shadow-runner', 'DarkTrainers SHADOW RUNNER', 'running', 155),
  ('gridlock', 'DarkTrainers GRIDLOCK', 'lifestyle', 130),
  ('vault-proto', 'DarkTrainers VAULT PROTO', 'basketball', 195),
  ('pulse-tr', 'DarkTrainers PULSE TR', 'training', 145),
  ('apex-low-x-control-freak', 'DarkTrainers Apex Low X Control Freak', 'running', 190),
  ('volt-2-pacer', 'DarkTrainers VOLT-2 PACER', 'running', 195),
  ('shadow-runner-trail', 'DarkTrainers SHADOW RUNNER TRAIL', 'running', 170),
  ('shadow-runner-lite', 'DarkTrainers SHADOW RUNNER LITE', 'running', 140),
  ('volt-1-eclipse', 'DarkTrainers VOLT-1', 'running', 185),
  ('shadow-tempo', 'DarkTrainers SHADOW TEMPO', 'running', 165),
  ('volt-hydro', 'DarkTrainers VOLT HYDRO', 'running', 175),
  ('phantom-hi-elite', 'DarkTrainers PHANTOM HI ELITE', 'basketball', 205),
  ('phantom-lo', 'DarkTrainers PHANTOM LO', 'basketball', 160),
  ('vault-proto-ii', 'DarkTrainers VAULT PROTO II', 'basketball', 215),
  ('vault-court-classic', 'DarkTrainers VAULT COURT CLASSIC', 'basketball', 150),
  ('phantom-post', 'DarkTrainers PHANTOM POST', 'basketball', 185),
  ('apex-low-sail', 'DarkTrainers APEX LOW', 'lifestyle', 145),
  ('apex-mid-oxide', 'DarkTrainers APEX MID OXIDE', 'lifestyle', 158),
  ('gridlock-noir', 'DarkTrainers GRIDLOCK NOIR', 'lifestyle', 135),
  ('gridlock-court-canvas', 'DarkTrainers GRIDLOCK COURT CANVAS', 'lifestyle', 120),
  ('volt-hi-city', 'DarkTrainers VOLT-HI CITY', 'lifestyle', 210),
  ('phantom-hi-heritage', 'DarkTrainers PHANTOM HI HERITAGE', 'lifestyle', 195),
  ('apex-low-ac26-sequel', 'APEX LOW x AC26', 'lifestyle', 275),
  ('circuit-mid-pro', 'DarkTrainers CIRCUIT MID PRO', 'training', 180),
  ('circuit-low-flex', 'DarkTrainers CIRCUIT LOW FLEX', 'training', 138),
  ('pulse-tr-2', 'DarkTrainers PULSE TR 2', 'training', 155),
  ('pulse-tr-studio', 'DarkTrainers PULSE TR STUDIO', 'training', 130),
  ('circuit-strap', 'DarkTrainers CIRCUIT STRAP', 'training', 172),
  ('pulse-trail-tr', 'DarkTrainers PULSE TRAIL TR', 'training', 168),
  ('toggle-figure-volt', 'Toggle Figure – Volt', 'collectibles', 34.99),
  ('toggle-figure-matte-black', 'Toggle Figure – Matte Black', 'collectibles', 29.99),
  ('toggle-figure-glow', 'Toggle Figure – Glow Edition', 'collectibles', 39.99),
  ('toggle-beanie-baby', 'Toggle Beanie Plush', 'collectibles', 24.99),
  ('togglemon-card-special', 'Togglemon Special Edition Card', 'collectibles', 24.99),
  ('jumbo-mascot-plush', 'Jumbo Mascot Plush', 'collectibles', 49.99),
  ('togglemon-cardpack', 'Togglemon Card Pack', 'collectibles', 9.99),
  ('togglemon-holopack', 'Togglemon Holo Pack', 'collectibles', 14.99),
  ('aibert-figure-matte-blue', 'Aibert Figure – Matte Blue', 'collectibles', 29.99),
  ('aibert-figure-sk8ter', 'Aibert Figure – Sk8ter Edition', 'collectibles', 34.99),
  ('jumbo-aibert-plush', 'Jumbo Aibert Plush', 'collectibles', 44.99),
  ('agentcontrol-comic-issue1', 'AgentControl Comic – Issue 1', 'collectibles', 14.99),
  ('togglemon-holopack-agentcontrol', 'Togglemon Holo Pack – AgentControl Edition', 'collectibles', 24.99),
  ('codecontrol-comic-issue1', 'CodeControl Comic – Issue 1', 'collectibles', 12.99),
  ('codecontrol-crackdown-game', 'CodeControl: Crackdown – Retro Game', 'collectibles', 19.99),
  ('codecontrol-unisex-shirt', 'CodeControl Issue #1 Tee – Unisex', 'collectibles', 34.99);


-- ===========================================================================
-- Block 2 — dim_customer  (300 rows: 90 VIP + 210 standard)
-- ===========================================================================
-- Keys reproduce the exact patterns in vip_users.csv (vip-user-001..090) and
-- standard_users.csv (standard-user-001..210). Those are stable keys the real
-- simulation has evaluated flags against, which is the only reason this seed has
-- any chance of joining to exported evaluation_events.
--
-- Attribute values are randomized rather than copied from the CSVs — for seed
-- purposes the distribution matters, the exact spend does not.

INSERT INTO test_data_export.sshindel_metrics.dim_customer
SELECT
  format_string('vip-user-%03d', id)                                  AS customer_key,
  format_string('VIP Member %03d', id)                                AS customer_name,
  format_string('vip%03d@example.com', id)                            AS email,
  'US'                                                                AS country,
  element_at(array('CA','NY','TX','WA','IL','FL'), CAST(rand()*6 AS INT) + 1) AS state,
  'vip'                                                               AS member_tier,
  CAST(date_add(current_date(), -CAST(rand()*1400 + 90 AS INT)) AS DATE) AS member_since,
  ROUND(rand() * 3700 + 800, 2)                                       AS lifetime_spend,
  element_at(array('running','basketball','lifestyle','training'), CAST(rand()*4 AS INT) + 1) AS preferred_category,
  true                                                                AS early_access_enabled,
  true                                                                AS is_known_user,
  timestampadd(SECOND, -CAST(rand() * 5184000 AS INT), current_timestamp()) AS first_seen_ts,
  current_timestamp()                                                 AS last_seen_ts
FROM (SELECT explode(sequence(1, 90)) AS id)

UNION ALL

SELECT
  format_string('standard-user-%03d', id),
  format_string('Standard Member %03d', id),
  format_string('standard%03d@example.com', id),
  'US',
  element_at(array('CA','NY','TX','WA','IL','FL'), CAST(rand()*6 AS INT) + 1),
  'standard',
  CAST(date_add(current_date(), -CAST(rand()*700 + 30 AS INT)) AS DATE),
  ROUND(rand() * 480 + 40, 2),
  element_at(array('running','basketball','lifestyle','training'), CAST(rand()*4 AS INT) + 1),
  false,
  true,
  timestampadd(SECOND, -CAST(rand() * 5184000 AS INT), current_timestamp()),
  current_timestamp()
FROM (SELECT explode(sequence(1, 210)) AS id);


-- ===========================================================================
-- Block 3 — fact_session  (~1200 rows over the last 14 days)
-- ===========================================================================
-- Three sessions per customer (identified) plus 300 guest sessions with a NULL
-- customer_key. The guest rows are the point of the session grain: countable as
-- sessions, correctly excluded from user-randomized analysis.
--
-- Each session_key maps to at most one customer_key, which is the LaunchDarkly
-- analysis-unit constraint. Check 4 in 03_parity_check.sql verifies it.
--
-- Adjust the 14-day window (1209600 seconds) if your experiment started more
-- recently — metric events must fall AFTER the experiment start to be counted.

INSERT INTO test_data_export.sshindel_metrics.fact_session
SELECT
  format_string('sess-%s-%d', c.customer_key, n)                      AS session_key,
  c.customer_key                                                      AS customer_key,
  CASE WHEN rand() < 0.4 THEN 'guest_transition' ELSE 'identified_start' END AS journey_type,
  timestampadd(SECOND, -CAST(rand() * 1209600 AS INT), current_timestamp()) AS session_start_ts,
  CAST(NULL AS TIMESTAMP)                                             AS session_end_ts,
  c.member_tier                                                       AS member_tier_at_session,
  element_at(array('desktop','mobile','mobile','tablet'), CAST(rand()*4 AS INT) + 1) AS device_type,
  element_at(array('Chrome','Safari','Firefox','Edge'), CAST(rand()*4 AS INT) + 1) AS browser,
  element_at(array('macOS','Windows','iOS','Android'), CAST(rand()*4 AS INT) + 1)  AS os,
  element_at(array('direct','organic','paid_social','email'), CAST(rand()*4 AS INT) + 1) AS traffic_source,
  element_at(array('/','/products','/drops','/collectibles'), CAST(rand()*4 AS INT) + 1) AS landing_page,
  'seed-v1'                                                           AS run_id
FROM test_data_export.sshindel_metrics.dim_customer c
CROSS JOIN (SELECT explode(sequence(1, 3)) AS n)

UNION ALL

SELECT
  format_string('sess-guest-%06d', id),
  CAST(NULL AS STRING),
  'guest_only',
  timestampadd(SECOND, -CAST(rand() * 1209600 AS INT), current_timestamp()),
  CAST(NULL AS TIMESTAMP),
  'guest',
  element_at(array('desktop','mobile','mobile','tablet'), CAST(rand()*4 AS INT) + 1),
  element_at(array('Chrome','Safari','Firefox','Edge'), CAST(rand()*4 AS INT) + 1),
  element_at(array('macOS','Windows','iOS','Android'), CAST(rand()*4 AS INT) + 1),
  element_at(array('direct','organic','paid_social','email'), CAST(rand()*4 AS INT) + 1),
  element_at(array('/','/products','/drops','/collectibles'), CAST(rand()*4 AS INT) + 1),
  'seed-v1'
FROM (SELECT explode(sequence(1, 300)) AS id);


-- ===========================================================================
-- Block 4 — fact_engagement_event
-- ===========================================================================
-- product_viewed on every session; add_to_cart and banner_click gated by
-- probability, with VIP converting far better than standard or guest. Mirrors
-- CONFIG["event_probabilities"] in darktrainers_simulation.py closely enough for
-- a demo.
--
-- context_kind / context_key record the TRUE context: kind 'user' keyed on the
-- customer for identified sessions, kind 'session' keyed on the session for
-- guests. This is the corrected behavior — the legacy table labels everything
-- 'user'. See the Query B note in 02_ld_data_source.sql.

-- 4a — product_viewed (one per session)
-- rand() cannot appear in a JOIN condition on Spark, so the random product
-- index is computed in a projection (sess) and joined deterministically against
-- a numbered product list (prod). 55 matches dim_product's row count, asserted
-- by Block 6 — keep the two in step when the catalog changes.
-- Subqueries inline rather than CTEs: `INSERT INTO ... WITH ... SELECT` is
-- accepted unevenly across engines, and this form is unambiguous.
INSERT INTO test_data_export.sshindel_metrics.fact_engagement_event
SELECT
  format_string('evt-view-%s', s.session_key)                         AS event_id,
  s.session_key,
  s.customer_key,
  p.product_id,
  'product_viewed'                                                    AS event_name,
  timestampadd(MINUTE, s.view_offset_min, s.session_start_ts)         AS event_ts,
  p.list_price                                                        AS event_value,
  CASE WHEN s.customer_key IS NULL THEN 'session' ELSE 'user' END     AS context_kind,
  COALESCE(s.customer_key, s.session_key)                             AS context_key,
  'seed-v1'                                                           AS run_id
FROM (
  SELECT
    session_key,
    customer_key,
    session_start_ts,
    CAST(rand() * 55 AS INT) + 1                                      AS prod_rn,
    CAST(rand() * 5 AS INT)                                           AS view_offset_min
  FROM test_data_export.sshindel_metrics.fact_session
  WHERE run_id = 'seed-v1'
) s
JOIN (
  SELECT
    product_id,
    list_price,
    ROW_NUMBER() OVER (ORDER BY product_id)                           AS rn
  FROM test_data_export.sshindel_metrics.dim_product
) p ON p.rn = s.prod_rn;

-- 4b — add_to_cart (tier-weighted)
INSERT INTO test_data_export.sshindel_metrics.fact_engagement_event
SELECT
  format_string('evt-cart-%s', e.session_key),
  e.session_key,
  e.customer_key,
  e.product_id,
  'add_to_cart',
  timestampadd(MINUTE, CAST(rand() * 10 AS INT) + 5, e.event_ts),
  e.event_value,
  e.context_kind,
  e.context_key,
  'seed-v1'
FROM test_data_export.sshindel_metrics.fact_engagement_event e
JOIN test_data_export.sshindel_metrics.fact_session s ON e.session_key = s.session_key
WHERE e.event_name = 'product_viewed'
  AND e.run_id = 'seed-v1'
  AND rand() < CASE s.member_tier_at_session
                 WHEN 'vip'      THEN 0.70
                 WHEN 'standard' THEN 0.12
                 ELSE 0.07
               END;

-- 4c — banner_click (no event_value, matching the simulation)
INSERT INTO test_data_export.sshindel_metrics.fact_engagement_event
SELECT
  format_string('evt-banner-%s', s.session_key),
  s.session_key,
  s.customer_key,
  CAST(NULL AS STRING),
  'banner_click',
  timestampadd(MINUTE, CAST(rand() * 8 AS INT) + 1, s.session_start_ts),
  CAST(NULL AS DOUBLE),
  CASE WHEN s.customer_key IS NULL THEN 'session' ELSE 'user' END,
  COALESCE(s.customer_key, s.session_key),
  'seed-v1'
FROM test_data_export.sshindel_metrics.fact_session s
WHERE s.run_id = 'seed-v1'
  AND rand() < 0.09;


-- ===========================================================================
-- Block 5 — fact_order
-- ===========================================================================
-- checkout_initiated on sessions that added to cart, with the intentional AOV
-- skew from the simulation (VIP ~$620, standard ~$85). vip_upgrade at $14.99 for
-- a slice of standard customers only.

-- 5a — checkout_initiated
INSERT INTO test_data_export.sshindel_metrics.fact_order
SELECT
  format_string('ord-%s', e.session_key)                              AS order_id,
  e.session_key,
  e.customer_key,
  'checkout_initiated'                                                AS order_type,
  timestampadd(MINUTE, CAST(rand() * 15 AS INT) + 10, e.event_ts)     AS order_ts,
  CASE s.member_tier_at_session
    WHEN 'vip'      THEN ROUND(620 + (rand() - 0.5) * 180, 2)
    WHEN 'standard' THEN ROUND( 85 + (rand() - 0.5) *  36, 2)
    ELSE                 ROUND( 70 + (rand() - 0.5) *  30, 2)
  END                                                                 AS order_total,
  CAST(rand() * 3 AS INT) + 1                                         AS item_count,
  e.context_kind,
  e.context_key,
  'seed-v1'
FROM test_data_export.sshindel_metrics.fact_engagement_event e
JOIN test_data_export.sshindel_metrics.fact_session s ON e.session_key = s.session_key
WHERE e.event_name = 'add_to_cart'
  AND e.run_id = 'seed-v1'
  AND rand() < 0.80;

-- 5b — vip_upgrade (standard customers only, fixed $14.99)
INSERT INTO test_data_export.sshindel_metrics.fact_order
SELECT
  format_string('ord-upg-%s', s.session_key),
  s.session_key,
  s.customer_key,
  'vip_upgrade',
  timestampadd(MINUTE, CAST(rand() * 20 AS INT) + 5, s.session_start_ts),
  14.99,
  1,
  'user',
  s.customer_key,
  'seed-v1'
FROM test_data_export.sshindel_metrics.fact_session s
WHERE s.run_id = 'seed-v1'
  AND s.member_tier_at_session = 'standard'
  AND rand() < 0.06;


-- ===========================================================================
-- Block 6 — verify
-- ===========================================================================
-- Expected shape: dim_product 55, dim_customer 300, fact_session 1200,
-- fact_engagement_event roughly 1500-1800, fact_order roughly 300-400.
--
-- Note that dim_customer and the fact tables will read HIGHER than this if the
-- star-schema loader has run (darktrainers_simulation.py --warehouse-schema
-- star|both). Loader rows carry run_id = 'sim-...'; seeded rows carry
-- 'seed-v1'. Filter on run_id to look at one or the other.

-- RUN THIS FIRST. `dupes` must be 0 on every row.
--
-- Blocks 1 and 2 are plain INSERTs with no uniqueness guard, so running any
-- block twice duplicates keys instead of erroring. Duplicates then compound:
-- Block 3 builds session_key from dim_customer via CROSS JOIN, so duplicate
-- customers create duplicate sessions, and every join in Query A fans out.
-- The symptom is a Check 5 total_rows in the hundreds of thousands instead of
-- ~2000. The cure is Block 0 followed by one clean pass.

SELECT 'dim_product'           AS tbl, COUNT(*) AS rows,
       COUNT(DISTINCT product_id) AS distinct_keys,
       COUNT(*) - COUNT(DISTINCT product_id) AS dupes
FROM test_data_export.sshindel_metrics.dim_product
UNION ALL SELECT 'dim_customer', COUNT(*), COUNT(DISTINCT customer_key),
       COUNT(*) - COUNT(DISTINCT customer_key)
FROM test_data_export.sshindel_metrics.dim_customer
UNION ALL SELECT 'fact_session', COUNT(*), COUNT(DISTINCT session_key),
       COUNT(*) - COUNT(DISTINCT session_key)
FROM test_data_export.sshindel_metrics.fact_session
UNION ALL SELECT 'fact_engagement_event', COUNT(*), COUNT(DISTINCT event_id),
       COUNT(*) - COUNT(DISTINCT event_id)
FROM test_data_export.sshindel_metrics.fact_engagement_event
UNION ALL SELECT 'fact_order', COUNT(*), COUNT(DISTINCT order_id),
       COUNT(*) - COUNT(DISTINCT order_id)
FROM test_data_export.sshindel_metrics.fact_order
ORDER BY tbl;

-- Event mix and value sanity. VIP order_total should average far above standard.
SELECT event_name AS event_key, COUNT(*) AS n, ROUND(AVG(event_value), 2) AS avg_value
FROM test_data_export.sshindel_metrics.fact_engagement_event
WHERE run_id = 'seed-v1'
GROUP BY event_name
UNION ALL
SELECT order_type, COUNT(*), ROUND(AVG(order_total), 2)
FROM test_data_export.sshindel_metrics.fact_order
WHERE run_id = 'seed-v1'
GROUP BY order_type
ORDER BY event_key;

-- Then run Checks 3, 4, and 5 in 03_parity_check.sql. Checks 1 and 2 compare
-- against metric_events and will NOT reconcile for seed data — these rows never
-- went through the legacy path. They exist for a future loader, not for this seed.
