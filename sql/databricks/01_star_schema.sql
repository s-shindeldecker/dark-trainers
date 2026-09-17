-- DarkTrainers demo warehouse — star schema (Databricks / Unity Catalog)
--
-- Runs alongside the legacy sshindel_metrics.metric_events table; nothing here
-- reads, writes, or alters it. This is the only file applied to the warehouse;
-- the LaunchDarkly data source SQL lives in 02_ld_data_source.sql.
--
-- These tables are created IN THE SAME SCHEMA as the existing metric_events table
-- (test_data_export.sshindel_metrics) on purpose. The LaunchDarkly Databricks
-- integration is granted USE SCHEMA + SELECT on one metrics schema, and that value
-- is immutable once the integration is saved — a separate schema would require
-- deleting and recreating the integration. Co-locating reuses the existing grants.
--
-- Isolation from metric_events is therefore by TABLE NAME, not by schema. The
-- dim_ / fact_ prefixes do not collide with metric_events, and nothing in this file
-- or the data source SQL writes to or alters it.
--
-- Every name is fully qualified and there are no USE statements, so each statement
-- below can be run on its own. To retarget a workspace, find/replace the two-part
-- prefix test_data_export.sshindel_metrics.


-- ---------------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------------

-- One row per LaunchDarkly user context key. Upserted (MERGE) rather than
-- inserted: VIP keys (vip-user-001..090) recur across simulation runs, so
-- insert-only would duplicate them.
CREATE TABLE IF NOT EXISTS test_data_export.sshindel_metrics.dim_customer (
  customer_key          STRING  NOT NULL COMMENT 'LD user context key',
  customer_name         STRING,
  email                 STRING,
  country               STRING,
  state                 STRING,
  member_tier           STRING  NOT NULL COMMENT 'standard | vip',
  member_since          DATE,
  lifetime_spend        DOUBLE,
  preferred_category    STRING,
  early_access_enabled  BOOLEAN,
  is_known_user         BOOLEAN COMMENT 'true = from vip_users.csv / standard_users.csv; false = generated UUID key',
  first_seen_ts         TIMESTAMP,
  last_seen_ts          TIMESTAMP
)
COMMENT 'Customer dimension. Guests are absent by design — they have no user context.';

-- One row per catalog product. Seeded from src/components/Products/productData.ts
-- so warehouse rows reference the same SKUs the app renders.
CREATE TABLE IF NOT EXISTS test_data_export.sshindel_metrics.dim_product (
  product_id    STRING NOT NULL,
  product_name  STRING NOT NULL,
  category      STRING NOT NULL COMMENT 'running | basketball | lifestyle | training | collectibles',
  list_price    DOUBLE
)
COMMENT 'Product dimension, seeded from the app catalog.';


-- ---------------------------------------------------------------------------
-- Facts
-- ---------------------------------------------------------------------------

-- One row per simulated journey. customer_key is NULL for guest-only journeys,
-- which is what keeps guest sessions out of user-randomized analysis while
-- still making them countable as sessions.
--
-- Each session belongs to at most one customer (uuid4 per journey, and journey
-- type B reuses the same session_key across identify()). That one-to-at-most-one
-- property is what LD requires of an analysis unit relative to a randomization
-- unit; do not change it without re-reading the constraint.
CREATE TABLE IF NOT EXISTS test_data_export.sshindel_metrics.fact_session (
  session_key             STRING    NOT NULL COMMENT 'LD session context key',
  customer_key            STRING             COMMENT 'NULL for guest_only journeys',
  journey_type            STRING    NOT NULL COMMENT 'guest_only | guest_transition | identified_start',
  session_start_ts        TIMESTAMP NOT NULL,
  session_end_ts          TIMESTAMP,
  member_tier_at_session  STRING    NOT NULL COMMENT 'guest | standard | vip',
  device_type             STRING    COMMENT 'desktop | mobile | tablet',
  browser                 STRING,
  os                      STRING,
  traffic_source          STRING    COMMENT 'direct | organic | paid_social | email',
  landing_page            STRING,
  run_id                  STRING    COMMENT 'simulation run that produced this row; not exposed to LD'
)
COMMENT 'Session fact. One row per journey; the grain that makes session-randomized experiments analyzable.';

-- product_viewed | add_to_cart | banner_click.
--
-- context_kind / context_key record the context the event was ACTUALLY tracked
-- on, which is not always kind=user — see the note on Query B in
-- 02_ld_data_source.sql.
CREATE TABLE IF NOT EXISTS test_data_export.sshindel_metrics.fact_engagement_event (
  event_id       STRING    NOT NULL,
  session_key    STRING    NOT NULL,
  customer_key   STRING             COMMENT 'NULL when the event fired before identify()',
  product_id     STRING             COMMENT 'NULL for non-product events (banner_click)',
  event_name     STRING    NOT NULL COMMENT 'product_viewed | add_to_cart | banner_click',
  event_ts       TIMESTAMP NOT NULL,
  event_value    DOUBLE             COMMENT 'product price; NULL for banner_click',
  context_kind   STRING    NOT NULL COMMENT 'true LD context kind the event was tracked on',
  context_key    STRING    NOT NULL COMMENT 'true LD context key the event was tracked on',
  run_id         STRING
)
COMMENT 'Non-purchase engagement events.';

-- checkout_initiated | vip_upgrade. Both are revenue-bearing conversions, so
-- they share a grain rather than getting a table each.
CREATE TABLE IF NOT EXISTS test_data_export.sshindel_metrics.fact_order (
  order_id      STRING    NOT NULL,
  session_key   STRING    NOT NULL,
  customer_key  STRING             COMMENT 'orders only occur on identified journeys, but kept nullable to match fact_session',
  order_type    STRING    NOT NULL COMMENT 'checkout_initiated | vip_upgrade',
  order_ts      TIMESTAMP NOT NULL,
  order_total   DOUBLE,
  item_count    INT,
  context_kind  STRING    NOT NULL,
  context_key   STRING    NOT NULL,
  run_id        STRING
)
COMMENT 'Order fact. order_type distinguishes cart checkout from the $14.99 VIP upgrade.';


-- ---------------------------------------------------------------------------
-- Informational constraints (optional)
-- ---------------------------------------------------------------------------
-- Unity Catalog PK/FK are informational only (NOT enforced) — they exist to make
-- the star shape legible in Catalog Explorer and to lineage tools. Requires a
-- recent DBR/UC. If your workspace rejects these, skip this block: nothing in
-- the data source SQL or the loader depends on them.

ALTER TABLE test_data_export.sshindel_metrics.dim_customer          ADD CONSTRAINT pk_dim_customer          PRIMARY KEY (customer_key);
ALTER TABLE test_data_export.sshindel_metrics.dim_product           ADD CONSTRAINT pk_dim_product           PRIMARY KEY (product_id);
ALTER TABLE test_data_export.sshindel_metrics.fact_session          ADD CONSTRAINT pk_fact_session          PRIMARY KEY (session_key);
ALTER TABLE test_data_export.sshindel_metrics.fact_engagement_event ADD CONSTRAINT pk_fact_engagement_event PRIMARY KEY (event_id);
ALTER TABLE test_data_export.sshindel_metrics.fact_order            ADD CONSTRAINT pk_fact_order            PRIMARY KEY (order_id);

ALTER TABLE test_data_export.sshindel_metrics.fact_engagement_event ADD CONSTRAINT fk_engagement_session
  FOREIGN KEY (session_key) REFERENCES test_data_export.sshindel_metrics.fact_session;
ALTER TABLE test_data_export.sshindel_metrics.fact_engagement_event ADD CONSTRAINT fk_engagement_product
  FOREIGN KEY (product_id) REFERENCES test_data_export.sshindel_metrics.dim_product;
ALTER TABLE test_data_export.sshindel_metrics.fact_order            ADD CONSTRAINT fk_order_session
  FOREIGN KEY (session_key) REFERENCES test_data_export.sshindel_metrics.fact_session;
