CREATE TABLE IF NOT EXISTS train_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  capture_id text NOT NULL,
  symbol text NOT NULL,
  answer text NOT NULL CHECK (answer IN ('UP', 'DOWN', 'SKIP')),
  correct_direction text CHECK (correct_direction IN ('UP', 'DOWN')),
  session_id text NOT NULL,
  answered_at timestamptz DEFAULT now()
);
CREATE INDEX ON train_answers (user_id, session_id);
CREATE INDEX ON train_answers (answered_at);
