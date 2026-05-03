-- W-0400: Layer C 훈련 실행 기록
-- run_auto_train_pipeline() 완료마다 1 row insert.
CREATE TABLE IF NOT EXISTS layer_c_train_runs (
    run_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    n_verdicts      INTEGER NOT NULL,               -- 훈련에 사용된 verdict 수
    status          TEXT NOT NULL DEFAULT 'shadow', -- shadow | promoted | skipped | failed
    ndcg_at_5       FLOAT,
    map_at_10       FLOAT,
    ci_lower        FLOAT,
    promoted        BOOLEAN NOT NULL DEFAULT FALSE,
    version_id      UUID REFERENCES model_versions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_layer_c_train_runs_triggered_at
    ON layer_c_train_runs (triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_layer_c_train_runs_promoted
    ON layer_c_train_runs (promoted, triggered_at DESC);
