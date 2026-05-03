CREATE TABLE IF NOT EXISTS digest_subscriptions (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             text NOT NULL,
  subscribed        boolean DEFAULT true,
  unsubscribe_token uuid DEFAULT gen_random_uuid(),
  created_at        timestamptz DEFAULT now()
);

-- Only service role may write (Edge Function uses service role key)
GRANT SELECT, INSERT, UPDATE ON digest_subscriptions TO service_role;
