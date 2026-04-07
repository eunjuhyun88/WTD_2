-- Cogochi Tables
-- 001_initial_schema.py (Alembic) → raw SQL for SvelteKit project convention

CREATE TABLE IF NOT EXISTS cogochi_agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_address  VARCHAR(42)  NOT NULL,
  name           VARCHAR(64)  NOT NULL,
  archetype_id   VARCHAR(16)  NOT NULL,
  stage          SMALLINT     DEFAULT 0,
  level          SMALLINT     DEFAULT 1,
  xp             INTEGER      DEFAULT 0,
  bond           SMALLINT     DEFAULT 0,
  doctrine       JSONB        NOT NULL,
  skill_loadout  JSONB        NOT NULL DEFAULT '{}',
  model_version  VARCHAR(128),
  nft_token_id   VARCHAR(64),
  status         VARCHAR(16)  DEFAULT 'READY',
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cog_agents_owner  ON cogochi_agents(owner_address);
CREATE INDEX IF NOT EXISTS idx_cog_agents_status ON cogochi_agents(status);

CREATE TABLE IF NOT EXISTS cogochi_scenarios (
  id              VARCHAR(64)  PRIMARY KEY,
  symbol          VARCHAR(16)  NOT NULL,
  interval        VARCHAR(4)   NOT NULL,
  start_ts        BIGINT       NOT NULL,
  end_ts          BIGINT       NOT NULL,
  candles         JSONB        NOT NULL,
  future_candles  JSONB        DEFAULT '[]',
  snapshot        JSONB        NOT NULL,
  difficulty      VARCHAR(8),
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cogochi_battle_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID         REFERENCES cogochi_agents(id),
  scenario_id       VARCHAR(64)  NOT NULL,
  outcome           VARCHAR(8)   NOT NULL,
  agent_action      VARCHAR(8)   NOT NULL,
  trainer_action    VARCHAR(20),
  confidence        FLOAT,
  thesis            TEXT,
  reflection        TEXT,
  skills_used       TEXT[]       DEFAULT '{}',
  pnl               FLOAT,
  chain_commit_hash VARCHAR(66),
  xp_gained         INTEGER      DEFAULT 0,
  bond_gained       SMALLINT     DEFAULT 0,
  snapshot          JSONB,
  skill_results     JSONB,
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cog_battle_agent   ON cogochi_battle_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_cog_battle_time    ON cogochi_battle_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cog_battle_outcome ON cogochi_battle_results(outcome);

CREATE TABLE IF NOT EXISTS cogochi_market_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID         REFERENCES cogochi_agents(id),
  owner_address   VARCHAR(42)  NOT NULL,
  price_usdc      NUMERIC(10,2) NOT NULL,
  price_cogochi   NUMERIC(18,8),
  active          BOOLEAN      DEFAULT TRUE,
  escrow_tx_hash  VARCHAR(66),
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cog_listings_active ON cogochi_market_listings(active);
CREATE INDEX IF NOT EXISTS idx_cog_listings_owner  ON cogochi_market_listings(owner_address);

CREATE TABLE IF NOT EXISTS cogochi_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       UUID         REFERENCES cogochi_market_listings(id),
  subscriber_addr  VARCHAR(42)  NOT NULL,
  started_at       TIMESTAMPTZ  DEFAULT NOW(),
  expires_at       TIMESTAMPTZ  NOT NULL,
  status           VARCHAR(16)  DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_cog_subs_subscriber ON cogochi_subscriptions(subscriber_addr);
CREATE INDEX IF NOT EXISTS idx_cog_subs_status     ON cogochi_subscriptions(status);

CREATE TABLE IF NOT EXISTS cogochi_autorun_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID         REFERENCES cogochi_agents(id),
  status          VARCHAR(16)  DEFAULT 'RUNNING',
  total_rounds    INTEGER      DEFAULT 100,
  current_round   INTEGER      DEFAULT 0,
  best_metric     FLOAT,
  best_doctrine   JSONB,
  result_version  VARCHAR(16),
  started_at      TIMESTAMPTZ  DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cog_autorun_agent  ON cogochi_autorun_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_cog_autorun_status ON cogochi_autorun_jobs(status);

CREATE TABLE IF NOT EXISTS cogochi_community_skills (
  id              VARCHAR(64)  PRIMARY KEY,
  name            VARCHAR(128) NOT NULL,
  description     TEXT,
  author_address  VARCHAR(42)  NOT NULL,
  version         VARCHAR(16)  DEFAULT '1.0.0',
  skill_type      VARCHAR(16)  NOT NULL,
  phase           SMALLINT     DEFAULT 1,
  endpoint        TEXT         NOT NULL,
  auth_type       VARCHAR(16)  NOT NULL,
  timeout_ms      INTEGER      DEFAULT 3000,
  cost_per_call   NUMERIC(18,8),
  schema_def      JSONB,
  active          BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
