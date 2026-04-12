-- ═══════════════════════════════════════════════════════════════
-- Stockclaw — Tournament tables (B-13)
-- ═══════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS tournaments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('DAILY_SPRINT', 'WEEKLY_CUP', 'SEASON_CHAMPIONSHIP')),
  pair          text NOT NULL,
  start_at      timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'REG_OPEN' CHECK (status IN ('REG_OPEN', 'REG_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  max_players   integer NOT NULL CHECK (max_players >= 2),
  entry_fee_lp  integer NOT NULL DEFAULT 0 CHECK (entry_fee_lp >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed            integer,
  paid_lp         integer NOT NULL DEFAULT 0,
  registered_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_brackets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round           integer NOT NULL CHECK (round >= 1),
  match_index     integer NOT NULL CHECK (match_index >= 1),
  user_a_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  user_b_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  winner_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  match_id        uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, match_index)
);

CREATE TABLE IF NOT EXISTS tournament_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  final_rank      integer NOT NULL CHECK (final_rank >= 1),
  lp_reward       integer NOT NULL DEFAULT 0,
  elo_change      integer NOT NULL DEFAULT 0,
  badges          jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_active
  ON tournaments (status, start_at);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament
  ON tournament_registrations (tournament_id, registered_at);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user
  ON tournament_registrations (user_id, registered_at DESC);

CREATE INDEX IF NOT EXISTS idx_tournament_brackets_tournament_round
  ON tournament_brackets (tournament_id, round, match_index);

CREATE INDEX IF NOT EXISTS idx_tournament_results_tournament
  ON tournament_results (tournament_id, final_rank);

COMMIT;
