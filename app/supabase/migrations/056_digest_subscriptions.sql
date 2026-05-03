-- Migration 056: digest_subscriptions (W-0401-P3)
-- Tracks daily digest email opt-out per user.
-- Default: all users with verdicts receive digest.
-- Insert row with opt_in=false to unsubscribe.

CREATE TABLE IF NOT EXISTS digest_subscriptions (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  opt_in      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_digest_subscriptions_updated_at
  BEFORE UPDATE ON digest_subscriptions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Only service role can write (Edge Function uses service role key)
GRANT SELECT, INSERT, UPDATE ON digest_subscriptions TO service_role;
