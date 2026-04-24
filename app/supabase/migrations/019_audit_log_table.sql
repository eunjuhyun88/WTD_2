-- W-0162: Audit logging table — track all user actions for security and compliance.
-- Supports 1000+ concurrent users with per-request audit trail.
--
-- Performance rationale:
--   Append-only design enables O(1) INSERT performance.
--   Composite index (user_id, action, created_at) enables efficient user activity queries.
--   Timestamp index enables retention policy queries (e.g., delete records > 90 days old).

CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT          NOT NULL,
    action        TEXT          NOT NULL,
    resource_type TEXT,
    resource_id   TEXT,
    ip_address    TEXT,
    user_agent    TEXT,
    status        TEXT          NOT NULL DEFAULT 'success',
    error_code    TEXT,
    error_message TEXT,
    metadata      JSONB         DEFAULT '{}',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Primary access pattern: audit trail for a specific user, ordered by timestamp.
CREATE INDEX IF NOT EXISTS audit_log_user_created_idx
    ON audit_log (user_id, created_at DESC);

-- Secondary: query by action type (e.g., "capture_create", "capture_read").
CREATE INDEX IF NOT EXISTS audit_log_action_created_idx
    ON audit_log (action, created_at DESC);

-- Tertiary: resource-specific queries (e.g., all actions on capture_id X).
CREATE INDEX IF NOT EXISTS audit_log_resource_created_idx
    ON audit_log (resource_type, resource_id, created_at DESC);

-- Retention policy: efficient deletion of old records (e.g., > 90 days).
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
    ON audit_log (created_at DESC);

-- Composite for common query: "user's actions of type X".
CREATE INDEX IF NOT EXISTS audit_log_user_action_created_idx
    ON audit_log (user_id, action, created_at DESC);

-- RLS: Users can only see their own audit log.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_user_read
    ON audit_log
    FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY audit_log_service_write
    ON audit_log
    FOR INSERT
    WITH CHECK (true);
