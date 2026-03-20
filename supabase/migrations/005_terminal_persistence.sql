-- ═══════════════════════════════════════════════════════════════
-- Stockclaw — Terminal Persistence Migration (S-05)
-- scan_runs / scan_signals / agent_chat_messages
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- ─── 3.1 terminal_scan_runs — 스캔 세션 ─────────────────────
CREATE TABLE IF NOT EXISTS terminal_scan_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  pair        text NOT NULL,           -- 'BTC/USDT'
  timeframe   text NOT NULL,           -- '4h'
  token       text NOT NULL,           -- 'BTC'

  -- 합산 결과
  consensus   text NOT NULL CHECK (consensus IN ('long','short','neutral')),
  avg_confidence numeric(5,2) NOT NULL,
  summary     text NOT NULL,           -- "Consensus LONG · Avg CONF 72%"

  -- 하이라이트 (에이전트별 요약)
  highlights  jsonb NOT NULL DEFAULT '[]',
  -- [{ agent: "STRUCTURE", vote: "long", conf: 72, note: "..." }]

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_user
  ON terminal_scan_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_runs_pair
  ON terminal_scan_runs (user_id, pair, timeframe, created_at DESC);

-- ─── 3.2 terminal_scan_signals — 스캔 내 개별 시그널 ────────
CREATE TABLE IF NOT EXISTS terminal_scan_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id     uuid NOT NULL REFERENCES terminal_scan_runs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  agent_id    text NOT NULL,           -- 'STRUCTURE','VPA','ICT',...
  agent_name  text NOT NULL,           -- display name
  vote        text NOT NULL CHECK (vote IN ('long','short','neutral')),
  confidence  numeric(5,2) NOT NULL,   -- 45-95
  analysis_text text NOT NULL,         -- "Price $97,234 · MA20 $96,800 · RSI 58.3"
  data_source text NOT NULL,           -- "BINANCE:BTC:4H"

  -- 트레이드 플랜
  entry_price numeric(16,8) NOT NULL,
  tp_price    numeric(16,8) NOT NULL,
  sl_price    numeric(16,8) NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_signals_scan
  ON terminal_scan_signals (scan_id);

CREATE INDEX IF NOT EXISTS idx_scan_signals_user
  ON terminal_scan_signals (user_id, created_at DESC);

-- ─── 3.3 agent_chat_messages — 에이전트 채팅 히스토리 ────────
CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  from_agent  text NOT NULL,           -- 'YOU', 'SYSTEM', 'ORCHESTRATOR', 'STRUCTURE', ...
  icon        text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '',
  message     text NOT NULL,
  is_user     boolean NOT NULL DEFAULT false,
  is_system   boolean NOT NULL DEFAULT false,

  -- 스캔 연결 (스캔 완료 시 자동 생성된 메시지)
  scan_id     uuid REFERENCES terminal_scan_runs(id) ON DELETE SET NULL,

  -- 응답 생성 소스 (에이전트 메시지만 해당)
  response_source text CHECK (response_source IN ('scan_context', 'llm', 'fallback')),

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON agent_chat_messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_scan
  ON agent_chat_messages (scan_id);

-- ─── RLS Policies ───────────────────────────────────────────
-- scan_runs
ALTER TABLE terminal_scan_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_runs_own ON terminal_scan_runs
  FOR ALL USING (user_id = auth.uid());

-- scan_signals
ALTER TABLE terminal_scan_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_signals_own ON terminal_scan_signals
  FOR ALL USING (user_id = auth.uid());

-- chat_messages
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_own ON agent_chat_messages
  FOR ALL USING (user_id = auth.uid());

COMMIT;
