-- 034_chart_notes.sql
-- Personal chart notes / trade journal markers (W-0358)
-- Security: user_id enforced in every query via WHERE user_id = $1 (no RLS — uses pg Pool)

CREATE TABLE IF NOT EXISTS chart_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  symbol        text        NOT NULL CHECK (length(trim(symbol)) >= 1),
  timeframe     text        NOT NULL,
  bar_time      bigint      NOT NULL, -- UTC seconds of the closed bar
  price_at_write numeric(20,8) NOT NULL CHECK (price_at_write > 0),
  body          text        NOT NULL CHECK (length(trim(body)) >= 1 AND length(body) <= 500),
  tag           text        NOT NULL DEFAULT 'observation'
                            CHECK (tag IN ('idea','entry','exit','mistake','observation')),
  is_training_eligible boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chart_notes_lookup
  ON chart_notes (user_id, symbol, timeframe, bar_time);

CREATE INDEX IF NOT EXISTS chart_notes_user_count
  ON chart_notes (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_chart_notes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS chart_notes_updated_at ON chart_notes;
CREATE TRIGGER chart_notes_updated_at
  BEFORE UPDATE ON chart_notes
  FOR EACH ROW EXECUTE FUNCTION update_chart_notes_updated_at();
