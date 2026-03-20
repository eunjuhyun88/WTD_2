BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_tier_enum AS ENUM ('guest', 'registered', 'connected', 'verified');
CREATE TYPE direction_enum AS ENUM ('LONG', 'SHORT', 'NEUTRAL');
CREATE TYPE trade_direction_enum AS ENUM ('LONG', 'SHORT');
CREATE TYPE quick_trade_status_enum AS ENUM ('open', 'closed', 'stopped');
CREATE TYPE tracked_signal_status_enum AS ENUM ('tracking', 'expired', 'converted');
CREATE TYPE predict_direction_enum AS ENUM ('YES', 'NO');
CREATE TYPE pnl_source_enum AS ENUM ('arena', 'predict');
CREATE TYPE community_signal_enum AS ENUM ('long', 'short');
CREATE TYPE notification_type_enum AS ENUM ('alert', 'critical', 'info', 'success');
CREATE TYPE profile_tier_enum AS ENUM ('bronze', 'silver', 'gold', 'diamond');

CREATE DOMAIN timeframe_code AS text
  CHECK (VALUE IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'));

CREATE DOMAIN trading_pair AS text
  CHECK (VALUE ~ '^[A-Z0-9]{2,12}/[A-Z0-9]{2,12}$');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Core user identity/profile
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  nickname text,
  tier user_tier_enum NOT NULL DEFAULT 'guest',
  phase smallint NOT NULL DEFAULT 0 CHECK (phase BETWEEN 0 AND 5),
  has_seen_demo boolean NOT NULL DEFAULT false,
  has_completed_onboarding boolean NOT NULL DEFAULT false,
  matches_played integer NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  total_lp integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX uq_app_users_email_lower
  ON app_users (lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX uq_app_users_nickname_lower
  ON app_users (lower(nickname))
  WHERE nickname IS NOT NULL;

CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  default_pair trading_pair NOT NULL DEFAULT 'BTC/USDT',
  default_timeframe timeframe_code NOT NULL DEFAULT '4h',
  battle_speed smallint NOT NULL DEFAULT 3 CHECK (battle_speed BETWEEN 1 AND 3),
  language text NOT NULL DEFAULT 'kr',
  signals_enabled boolean NOT NULL DEFAULT true,
  sfx_enabled boolean NOT NULL DEFAULT true,
  chart_theme text NOT NULL DEFAULT 'dark',
  data_source text NOT NULL DEFAULT 'binance',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  address text NOT NULL,
  chain text NOT NULL DEFAULT 'ARB',
  provider text,
  is_primary boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  signature text,
  balance_usdt numeric(18, 6),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (address ~ '^0x[0-9a-fA-F]{40}$' OR address ~ '^[A-Za-z0-9]{20,64}$')
);

CREATE UNIQUE INDEX uq_user_wallets_address_lower ON user_wallets (lower(address));
CREATE UNIQUE INDEX uq_user_wallets_primary_per_user ON user_wallets (user_id) WHERE is_primary;
CREATE INDEX idx_user_wallets_user_id ON user_wallets (user_id);

CREATE TRIGGER trg_user_wallets_updated_at
BEFORE UPDATE ON user_wallets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  user_agent text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX idx_auth_sessions_active ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT 'Anonymous Doge',
  avatar_path text NOT NULL DEFAULT '/doge/doge-default.jpg',
  tier profile_tier_enum NOT NULL DEFAULT 'bronze',
  balance_virtual numeric(18, 2) NOT NULL DEFAULT 10000,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (balance_virtual >= 0)
);

CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_profile_stats (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  win_rate numeric(5, 2) NOT NULL DEFAULT 0 CHECK (win_rate BETWEEN 0 AND 100),
  total_matches integer NOT NULL DEFAULT 0 CHECK (total_matches >= 0),
  total_pnl numeric(18, 6) NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0 CHECK (streak >= 0),
  best_streak integer NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  direction_accuracy numeric(5, 2) NOT NULL DEFAULT 0 CHECK (direction_accuracy BETWEEN 0 AND 100),
  avg_confidence numeric(5, 2) NOT NULL DEFAULT 0 CHECK (avg_confidence BETWEEN 0 AND 100),
  tracked_signals integer NOT NULL DEFAULT 0 CHECK (tracked_signals >= 0),
  agent_wins integer NOT NULL DEFAULT 0 CHECK (agent_wins >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_profile_stats_updated_at
BEFORE UPDATE ON user_profile_stats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_badges (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  badge_id text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE user_agent_stats (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  xp_max integer NOT NULL DEFAULT 100 CHECK (xp_max > 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  best_streak integer NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  avg_confidence numeric(5, 2) NOT NULL DEFAULT 0 CHECK (avg_confidence BETWEEN 0 AND 100),
  best_confidence numeric(5, 2) NOT NULL DEFAULT 0 CHECK (best_confidence BETWEEN 0 AND 100),
  stamps jsonb NOT NULL DEFAULT '{"win":0,"lose":0,"streak":0,"diamond":0,"crown":0}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_id)
);

CREATE TRIGGER trg_user_agent_stats_updated_at
BEFORE UPDATE ON user_agent_stats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Arena / match history
CREATE TABLE arena_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  match_n integer NOT NULL CHECK (match_n >= 0),
  win boolean NOT NULL,
  lp integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  battle_result text,
  consensus_type text,
  lp_mult numeric(8, 4) NOT NULL DEFAULT 1.0,
  signals text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_n)
);

CREATE INDEX idx_arena_matches_user_id_created_at ON arena_matches (user_id, created_at DESC);

CREATE TABLE arena_hypotheses (
  match_id uuid PRIMARY KEY REFERENCES arena_matches(id) ON DELETE CASCADE,
  dir direction_enum NOT NULL,
  confidence numeric(5, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  timeframe timeframe_code NOT NULL,
  entry_price numeric(18, 6) NOT NULL,
  tp_price numeric(18, 6) NOT NULL,
  sl_price numeric(18, 6) NOT NULL,
  rr numeric(10, 4) NOT NULL CHECK (rr >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE arena_match_agent_votes (
  id bigserial PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  agent_name text NOT NULL,
  agent_icon text,
  agent_color text,
  dir direction_enum NOT NULL,
  confidence numeric(5, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, agent_id)
);

CREATE INDEX idx_arena_match_agent_votes_match_id ON arena_match_agent_votes (match_id);

-- Terminal trading state
CREATE TABLE quick_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  pair trading_pair NOT NULL,
  dir trade_direction_enum NOT NULL,
  entry_price numeric(18, 6) NOT NULL,
  tp_price numeric(18, 6),
  sl_price numeric(18, 6),
  current_price numeric(18, 6) NOT NULL,
  pnl_percent numeric(10, 4) NOT NULL DEFAULT 0,
  status quick_trade_status_enum NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_pnl numeric(10, 4),
  source text NOT NULL DEFAULT 'manual',
  note text NOT NULL DEFAULT ''
);

CREATE INDEX idx_quick_trades_user_status_opened_at ON quick_trades (user_id, status, opened_at DESC);

CREATE TABLE tracked_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  pair trading_pair NOT NULL,
  dir trade_direction_enum NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  confidence numeric(5, 2) NOT NULL DEFAULT 75 CHECK (confidence BETWEEN 0 AND 100),
  tracked_at timestamptz NOT NULL DEFAULT now(),
  current_price numeric(18, 6) NOT NULL,
  entry_price numeric(18, 6) NOT NULL,
  pnl_percent numeric(10, 4) NOT NULL DEFAULT 0,
  status tracked_signal_status_enum NOT NULL DEFAULT 'tracking',
  expires_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  converted_trade_id uuid REFERENCES quick_trades(id) ON DELETE SET NULL,
  CHECK (expires_at > tracked_at)
);

CREATE INDEX idx_tracked_signals_user_status_expires_at ON tracked_signals (user_id, status, expires_at);

-- Prediction (Polymarket)
CREATE TABLE prediction_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  market_id text NOT NULL,
  market_title text NOT NULL,
  direction predict_direction_enum NOT NULL,
  entry_odds numeric(10, 6) NOT NULL CHECK (entry_odds > 0 AND entry_odds <= 1),
  amount numeric(18, 6) NOT NULL CHECK (amount > 0),
  current_odds numeric(10, 6) NOT NULL CHECK (current_odds > 0 AND current_odds <= 1),
  settled boolean NOT NULL DEFAULT false,
  pnl numeric(18, 6),
  opened_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX idx_prediction_positions_user_settled_opened_at
  ON prediction_positions (user_id, settled, opened_at DESC);

-- Unified pnl ledger
CREATE TABLE pnl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  source pnl_source_enum NOT NULL,
  source_id text NOT NULL,
  pnl numeric(18, 6) NOT NULL,
  details text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pnl_entries_user_recorded_at ON pnl_entries (user_id, recorded_at DESC);

-- Community
CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  avatar text NOT NULL DEFAULT '🐕',
  avatar_color text NOT NULL DEFAULT '#ffe600',
  body text NOT NULL,
  signal community_signal_enum,
  likes_count integer NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_posts_created_at ON community_posts (created_at DESC);

CREATE TABLE community_post_likes (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Notifications
CREATE TABLE user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type notification_type_enum NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  dismissable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX idx_user_notifications_user_unread_created_at
  ON user_notifications (user_id, is_read, created_at DESC);

COMMIT;
