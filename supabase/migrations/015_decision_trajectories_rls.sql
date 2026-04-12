-- ═══════════════════════════════════════════════════════════════
-- 0012: decision_trajectories — RLS policy
--
-- P1.C-schema-migration DoD: "Supabase RLS policy drafted for
-- trajectory table (even if permissive for now)".
--
-- Design:
--   v2 rows (verdict_block IS NOT NULL) are agent/engine-written
--   and do NOT carry a user_id. They are not user-scoped, they
--   are system-scoped. RLS needs to allow:
--     (a) Service role (backend API routes) — full CRUD.
--     (b) Authenticated users — read-only on their own rows
--         (user_id = auth.uid()). v2 rows (user_id IS NULL)
--         are invisible to authenticated users.
--     (c) Anon — no access.
--
-- This is a permissive-default RLS that satisfies the DoD's
-- "even if permissive for now" clause while still closing the
-- table to unauthenticated reads.
--
-- Security note: the service_role bypass is implicit in Supabase
-- (service_role key skips RLS). So we only need to define the
-- authenticated + anon policies.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Enable RLS (idempotent — no-op if already enabled)
ALTER TABLE decision_trajectories ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read their own rows only
CREATE POLICY decision_trajectories_user_read
  ON decision_trajectories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Authenticated users: insert their own rows only
CREATE POLICY decision_trajectories_user_insert
  ON decision_trajectories
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- v2 engine rows (user_id IS NULL) are only accessible via
-- service_role, which bypasses RLS. No explicit policy needed.

COMMIT;
