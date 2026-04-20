-- W-0116: Alpha Universe observation tables
-- alpha_user_watches: per-user symbol watch requests with phase + confidence gate
-- alpha_anomalies:    anomaly detection queue for Alpha tokens

-- ── alpha_user_watches ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alpha_user_watches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL,
    symbol          text NOT NULL,
    target_phase    text NOT NULL,
    min_confidence  float DEFAULT 0.70,
    created_at      timestamptz DEFAULT now(),
    expires_at      timestamptz DEFAULT now() + interval '7 days',
    triggered_at    timestamptz,
    notify_channels text[] DEFAULT array['cogochi']
);

CREATE INDEX IF NOT EXISTS idx_alpha_watches_user ON alpha_user_watches (user_id);
CREATE INDEX IF NOT EXISTS idx_alpha_watches_symbol ON alpha_user_watches (symbol, target_phase);
CREATE INDEX IF NOT EXISTS idx_alpha_watches_active ON alpha_user_watches (expires_at)
    WHERE triggered_at IS NULL;

-- ── alpha_anomalies ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alpha_anomalies (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol               text NOT NULL,
    feature              text NOT NULL,
    z_score              float,
    severity             text NOT NULL,  -- 'medium' | 'high' | 'investigation_required'
    description          text,
    evidence             jsonb,
    observed_at          timestamptz DEFAULT now(),
    investigated         bool DEFAULT false,
    investigation_result text
);

CREATE INDEX IF NOT EXISTS idx_alpha_anomalies_symbol ON alpha_anomalies (symbol, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alpha_anomalies_uninvestigated ON alpha_anomalies (severity, observed_at)
    WHERE investigated = false;

-- ── RLS: read-own-watches ────────────────────────────────────────────────────

ALTER TABLE alpha_user_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own watches"
    ON alpha_user_watches FOR SELECT
    USING (user_id = auth.uid()::text);

CREATE POLICY "users insert own watches"
    ON alpha_user_watches FOR INSERT
    WITH CHECK (user_id = auth.uid()::text);

-- alpha_anomalies: read-only for authenticated users (insert via service role only)
ALTER TABLE alpha_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read anomalies"
    ON alpha_anomalies FOR SELECT
    TO authenticated
    USING (true);
