-- ═══════════════════════════════════════════════════════════════
-- Migration 0009: Doctrines + Exchange Connections + Imported Trades
-- Cogochi Builder path: import → analyze → doctrine → autorun
-- ═══════════════════════════════════════════════════════════════

-- Doctrine: agent's trading personality/config
CREATE TABLE IF NOT EXISTS doctrines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID,
  archetype TEXT NOT NULL CHECK (archetype IN ('CRUSHER','RIDER','ORACLE','GUARDIAN')),
  system_prompt TEXT NOT NULL,
  role_prompt TEXT,
  risk_style TEXT DEFAULT 'moderate' CHECK (risk_style IN ('conservative','moderate','aggressive')),
  horizon TEXT DEFAULT 'swing' CHECK (horizon IN ('scalp','swing','position')),
  signal_weights JSONB NOT NULL DEFAULT '{"cvdDivergence":0.5,"fundingRate":0.5,"openInterest":0.5,"htfStructure":0.5}',
  natural_rules TEXT[] DEFAULT '{}',
  enabled_data_sources TEXT[] DEFAULT '{cvd,funding,oi,htf}',
  autorun_objective TEXT,
  version INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctrines_agent ON doctrines(agent_id);
CREATE INDEX IF NOT EXISTS idx_doctrines_user ON doctrines(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctrines_active ON doctrines(agent_id, user_id) WHERE active = true;

-- Exchange connections (API keys, encrypted)
CREATE TABLE IF NOT EXISTS exchange_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('binance','bybit','okx','bitget')),
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{read}',
  label TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','revoked','error')),
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_user ON exchange_connections(user_id);

-- Imported trade history
CREATE TABLE IF NOT EXISTS imported_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  connection_id UUID REFERENCES exchange_connections(id),
  source TEXT NOT NULL CHECK (source IN ('binance_api','bybit_api','okx_api','wallet_onchain','csv_upload')),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  quote_quantity NUMERIC,
  fee NUMERIC DEFAULT 0,
  fee_asset TEXT,
  realized_pnl NUMERIC,
  trade_time TIMESTAMPTZ NOT NULL,
  external_id TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imported_user ON imported_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_imported_time ON imported_trades(user_id, trade_time DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_external ON imported_trades(user_id, source, external_id) WHERE external_id IS NOT NULL;

-- AutoResearch experiments
CREATE TABLE IF NOT EXISTS autorun_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  doctrine_id UUID REFERENCES doctrines(id),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  total_runs INTEGER DEFAULT 100,
  completed_runs INTEGER DEFAULT 0,
  best_score NUMERIC,
  best_params JSONB,
  objective TEXT DEFAULT 'composite',
  config JSONB NOT NULL DEFAULT '{}',
  results JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autorun_user ON autorun_experiments(user_id, agent_id);
