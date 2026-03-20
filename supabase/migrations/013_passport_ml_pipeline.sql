-- ═══════════════════════════════════════════════════════════════
-- 013: Passport ML Pipeline Foundation (ORPO / Retraining)
-- Outbox + inference lineage + datasets + train jobs + eval + reports
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS passport_event_outbox (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trace_id text NOT NULL,
  event_type text NOT NULL,
  event_time timestamptz NOT NULL DEFAULT now(),
  source_table text NOT NULL,
  source_id text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_passport_event_outbox_user_status_created
  ON passport_event_outbox (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_passport_event_outbox_status_next_retry
  ON passport_event_outbox (status, next_retry_at);

DROP TRIGGER IF EXISTS trg_passport_event_outbox_updated_at ON passport_event_outbox;
CREATE TRIGGER trg_passport_event_outbox_updated_at
BEFORE UPDATE ON passport_event_outbox
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS model_inference_logs (
  inference_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trace_id text NOT NULL,
  model_name text NOT NULL,
  model_version text NOT NULL,
  model_role text NOT NULL CHECK (model_role IN ('policy', 'analyst')),
  prompt_hash text NOT NULL,
  prompt_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_inference_logs_user_created
  ON model_inference_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_inference_logs_trace
  ON model_inference_logs (trace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS decision_trajectories (
  trajectory_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trace_id text NOT NULL,
  source_event_id uuid NOT NULL UNIQUE,
  inference_id uuid REFERENCES model_inference_logs(inference_id) ON DELETE SET NULL,
  context_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome_features jsonb,
  utility_score numeric(12, 4),
  label_quality text NOT NULL DEFAULT 'pending' CHECK (label_quality IN ('pending', 'good', 'bad', 'ambiguous')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_trajectories_user_created
  ON decision_trajectories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_trajectories_trace
  ON decision_trajectories (trace_id);

CREATE TABLE IF NOT EXISTS ml_dataset_versions (
  dataset_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dataset_type text NOT NULL CHECK (dataset_type IN ('pretrain', 'sft', 'orpo')),
  version_label text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('building', 'ready', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dataset_type, version_label)
);

CREATE INDEX IF NOT EXISTS idx_ml_dataset_versions_user_created
  ON ml_dataset_versions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_dataset_versions_type_status
  ON ml_dataset_versions (dataset_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS ml_preference_pairs (
  pair_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL REFERENCES ml_dataset_versions(dataset_version_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  trace_id text NOT NULL,
  prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  chosen jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejected jsonb NOT NULL DEFAULT '{}'::jsonb,
  margin_score numeric(12, 4) NOT NULL,
  pair_quality text NOT NULL CHECK (pair_quality IN ('high', 'medium', 'low')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_preference_pairs_dataset
  ON ml_preference_pairs (dataset_version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_preference_pairs_user
  ON ml_preference_pairs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ml_train_jobs (
  train_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  train_type text NOT NULL CHECK (train_type IN ('pretrain', 'sft', 'orpo', 'retrain')),
  model_role text NOT NULL CHECK (model_role IN ('policy', 'analyst')),
  base_model text NOT NULL,
  target_model_version text NOT NULL,
  dataset_version_ids uuid[] NOT NULL DEFAULT '{}',
  hyperparams jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger_reason text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed', 'succeeded', 'canceled')),
  started_at timestamptz,
  finished_at timestamptz,
  artifacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_train_jobs_user_status_created
  ON ml_train_jobs (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_train_jobs_role_created
  ON ml_train_jobs (model_role, created_at DESC);

CREATE TABLE IF NOT EXISTS ml_eval_reports (
  eval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  train_job_id uuid REFERENCES ml_train_jobs(train_job_id) ON DELETE SET NULL,
  model_version text NOT NULL,
  eval_scope text NOT NULL CHECK (eval_scope IN ('offline', 'shadow', 'canary')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  gate_result text NOT NULL CHECK (gate_result IN ('pass', 'fail')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_eval_reports_user_created
  ON ml_eval_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_eval_reports_scope_created
  ON ml_eval_reports (eval_scope, created_at DESC);

CREATE TABLE IF NOT EXISTS ml_model_registry (
  model_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_role text NOT NULL CHECK (model_role IN ('policy', 'analyst')),
  model_name text NOT NULL,
  model_version text NOT NULL,
  train_window jsonb NOT NULL DEFAULT '{}'::jsonb,
  eval_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  deployed_at timestamptz,
  status text NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow', 'canary', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_role, model_version)
);

CREATE INDEX IF NOT EXISTS idx_ml_model_registry_role_status
  ON ml_model_registry (model_role, status, created_at DESC);

CREATE TABLE IF NOT EXISTS passport_reports (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'on_demand')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  model_name text NOT NULL,
  model_version text NOT NULL,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_training_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_md text NOT NULL,
  score_overview jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_type, period_start, period_end, model_version)
);

CREATE INDEX IF NOT EXISTS idx_passport_reports_user_created
  ON passport_reports (user_id, created_at DESC);

COMMIT;
