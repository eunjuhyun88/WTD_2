BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'users table is required before running 0002_unify_legacy_plus_events';
  END IF;

  IF to_regclass('public.sessions') IS NULL THEN
    RAISE EXCEPTION 'sessions table is required before running 0002_unify_legacy_plus_events';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 1) USER SETTINGS / UI STATE
-- =============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_pair text NOT NULL DEFAULT 'BTC/USDT',
  default_timeframe text NOT NULL DEFAULT '4h',
  battle_speed smallint NOT NULL DEFAULT 3 CHECK (battle_speed BETWEEN 1 AND 3),
  signals_enabled boolean NOT NULL DEFAULT true,
  sfx_enabled boolean NOT NULL DEFAULT true,
  chart_theme text NOT NULL DEFAULT 'dark',
  data_source text NOT NULL DEFAULT 'binance',
  language text NOT NULL DEFAULT 'kr',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (default_pair ~ '^[A-Z0-9]{2,12}/[A-Z0-9]{2,12}$'),
  CHECK (default_timeframe IN ('1m','5m','15m','30m','1h','4h','1d','1w'))
);

DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_ui_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  terminal_left_width integer NOT NULL DEFAULT 280,
  terminal_right_width integer NOT NULL DEFAULT 300,
  terminal_left_collapsed boolean NOT NULL DEFAULT false,
  terminal_right_collapsed boolean NOT NULL DEFAULT false,
  terminal_mobile_tab text NOT NULL DEFAULT 'chart' CHECK (terminal_mobile_tab IN ('warroom','chart','intel')),
  terminal_active_tab text NOT NULL DEFAULT 'intel' CHECK (terminal_active_tab IN ('intel','community','positions')),
  terminal_inner_tab text NOT NULL DEFAULT 'headlines' CHECK (terminal_inner_tab IN ('headlines','events','flow')),
  passport_active_tab text NOT NULL DEFAULT 'profile' CHECK (passport_active_tab IN ('profile','wallet','positions','arena')),
  signals_filter text NOT NULL DEFAULT 'all',
  oracle_period text NOT NULL DEFAULT 'all' CHECK (oracle_period IN ('7d','30d','all')),
  oracle_sort text NOT NULL DEFAULT 'accuracy' CHECK (oracle_sort IN ('accuracy','level','sample','conf')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_ui_state_updated_at ON user_ui_state;
CREATE TRIGGER trg_user_ui_state_updated_at
BEFORE UPDATE ON user_ui_state
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- 2) EVENTS / FEEDS / NOTIFICATIONS / CHAT
-- =============================================================

CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('alert','critical','info','success')),
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  dismissable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread_created_at
  ON user_notifications (user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'match_started',
      'match_completed',
      'signal_tracked',
      'signal_converted',
      'trade_opened',
      'trade_closed',
      'prediction_voted',
      'prediction_opened',
      'prediction_closed',
      'community_posted',
      'community_reacted',
      'wallet_connected',
      'wallet_disconnected',
      'chat_sent',
      'reaction_sent',
      'settings_changed',
      'copytrade_published'
    )
  ),
  source_page text NOT NULL CHECK (source_page IN ('arena','terminal','signals','live','oracle','passport','settings','wallet','system')),
  source_id text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_created_at
  ON activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_type_created_at
  ON activity_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'terminal',
  sender_kind text NOT NULL CHECK (sender_kind IN ('user','agent','system')),
  sender_id text,
  sender_name text NOT NULL,
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_messages_user_created_at
  ON agent_chat_messages (user_id, created_at DESC);

-- =============================================================
-- 3) SIGNAL / COPY-TRADE ACTION TRACE
-- =============================================================

CREATE TABLE IF NOT EXISTS signal_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  signal_id uuid REFERENCES tracked_signals(id) ON DELETE SET NULL,
  linked_trade_id uuid REFERENCES quick_trades(id) ON DELETE SET NULL,
  pair text NOT NULL CHECK (pair ~ '^[A-Z0-9]{2,12}/[A-Z0-9]{2,12}$'),
  dir text NOT NULL CHECK (dir IN ('LONG','SHORT','NEUTRAL')),
  action_type text NOT NULL CHECK (action_type IN ('track','untrack','convert_to_trade','copy_trade','quick_long','quick_short')),
  source text NOT NULL DEFAULT 'manual',
  confidence numeric(5,2) CHECK (confidence BETWEEN 0 AND 100),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_actions_user_created_at
  ON signal_actions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_actions_pair_created_at
  ON signal_actions (pair, created_at DESC);

CREATE TABLE IF NOT EXISTS copy_trade_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  selected_signal_ids text[] NOT NULL DEFAULT '{}',
  draft jsonb NOT NULL,
  published boolean NOT NULL DEFAULT false,
  published_trade_id uuid REFERENCES quick_trades(id) ON DELETE SET NULL,
  published_signal_id uuid REFERENCES tracked_signals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_copy_trade_runs_user_created_at
  ON copy_trade_runs (user_id, created_at DESC);

-- =============================================================
-- 4) COMMUNITY REACTIONS
-- =============================================================

CREATE TABLE IF NOT EXISTS community_post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(emoji) BETWEEN 1 AND 8)
);

CREATE INDEX IF NOT EXISTS idx_community_post_reactions_post_created_at
  ON community_post_reactions (post_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_post_reaction_user_emoji
  ON community_post_reactions (post_id, user_id, emoji)
  WHERE user_id IS NOT NULL;

-- =============================================================
-- 5) OPTIONAL ANALYTICS / AUDIT TABLES
-- =============================================================

CREATE TABLE IF NOT EXISTS arena_phase_events (
  id bigserial PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  phase text NOT NULL,
  actor text,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arena_phase_events_match_created_at
  ON arena_phase_events (match_id, created_at);

CREATE TABLE IF NOT EXISTS wallet_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address text NOT NULL,
  chain text NOT NULL DEFAULT 'ARB',
  provider text,
  signature text,
  verified boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (address ~ '^0x[0-9a-fA-F]{40}$' OR address ~ '^[A-Za-z0-9]{20,64}$')
);

CREATE INDEX IF NOT EXISTS idx_wallet_connections_user_connected_at
  ON wallet_connections (user_id, connected_at DESC);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_symbol text NOT NULL,
  asset_name text NOT NULL,
  amount numeric(28, 10) NOT NULL DEFAULT 0,
  avg_price numeric(28, 10) NOT NULL DEFAULT 0,
  current_price numeric(28, 10) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount >= 0),
  CHECK (avg_price >= 0),
  CHECK (current_price >= 0),
  UNIQUE (user_id, asset_symbol, source)
);

DROP TRIGGER IF EXISTS trg_portfolio_holdings_updated_at ON portfolio_holdings;
CREATE TRIGGER trg_portfolio_holdings_updated_at
BEFORE UPDATE ON portfolio_holdings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_value numeric(28, 10) NOT NULL,
  total_cost numeric(28, 10) NOT NULL,
  total_pnl numeric(28, 10) NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_taken_at
  ON portfolio_snapshots (user_id, taken_at DESC);

-- =============================================================
-- 6) COMPATIBILITY VIEWS (NO DUPLICATE PHYSICAL TABLES)
-- =============================================================

DO $$
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN
    EXECUTE
      'CREATE VIEW app_users AS
         SELECT id, email, nickname, tier, phase, created_at, updated_at
         FROM users';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.auth_sessions') IS NULL THEN
    EXECUTE
      'CREATE VIEW auth_sessions AS
         SELECT
           id,
           token AS session_token,
           user_id,
           NULL::text AS user_agent,
           NULL::inet AS ip_address,
           created_at,
           expires_at,
           NULL::timestamptz AS revoked_at
         FROM sessions';
  END IF;
END
$$;

COMMIT;
