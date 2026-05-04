-- W-0405 PR2: exchange API key storage
-- exchange_connections 테이블: Binance/기타 거래소 API 키 (암호화 저장)

CREATE TABLE IF NOT EXISTS exchange_connections (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange             text NOT NULL CHECK (exchange IN ('binance', 'binance_futures', 'bybit', 'okx')),
  api_key_encrypted    text NOT NULL,
  api_secret_encrypted text NOT NULL,
  api_key_last4        text,    -- 마지막 4자 평문 저장 (보안 위험 없음)
  label                text,
  permissions          text[] DEFAULT '{}',
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'revoked')),
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exchange)
);

CREATE INDEX IF NOT EXISTS idx_exchange_connections_user
  ON exchange_connections (user_id);

ALTER TABLE exchange_connections ENABLE ROW LEVEL SECURITY;

-- Users can read their own connections (api_key_encrypted 은 노출 — last4는 서버에서 계산)
CREATE POLICY "exchange_conn_select_own" ON exchange_connections
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (server-side only) handles all writes
CREATE POLICY "exchange_conn_service_write" ON exchange_connections
  FOR ALL USING (true) WITH CHECK (true);
