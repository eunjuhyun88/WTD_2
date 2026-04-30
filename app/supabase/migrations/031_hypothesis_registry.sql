-- W-0317: hypothesis_registry — validation result tracking per pattern family
-- Used by: facade.validate_and_gate(), HypothesisRegistryStore
-- DSR n_trials = COUNT WHERE family=? AND expires_at > now()
-- BH-FDR denominator = COUNT WHERE expires_at > now()

CREATE TABLE IF NOT EXISTS hypothesis_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL,
  family       TEXT NOT NULL,
  overall_pass BOOL NOT NULL,
  stage        TEXT NOT NULL CHECK (stage IN ('shadow', 'soft', 'strict')),
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  gate_json    JSONB,
  result_json  JSONB
);

CREATE INDEX IF NOT EXISTS hypothesis_registry_family_expires
  ON hypothesis_registry (family, expires_at);

CREATE INDEX IF NOT EXISTS hypothesis_registry_expires
  ON hypothesis_registry (expires_at);

COMMENT ON TABLE hypothesis_registry IS
  'W-0317: one row per validate_and_gate() call. expires_at = computed_at + 365d.';
