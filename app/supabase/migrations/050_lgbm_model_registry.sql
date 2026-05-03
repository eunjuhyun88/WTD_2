-- W-0394: LightGBM 모델 버전 레지스트리
-- Tracks shadow → active → retired lifecycle for LightGBM scoring models.
CREATE TABLE IF NOT EXISTS model_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_type      TEXT NOT NULL DEFAULT 'search_layer_c',
    version         TEXT NOT NULL,           -- 'v1', 'v2', ...
    trained_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    training_size   INTEGER NOT NULL,        -- verdict 표본 수
    ndcg_at_5       FLOAT,                   -- shadow eval 결과
    map_at_10       FLOAT,
    ci_lower        FLOAT,                   -- bootstrap 95% CI 하한
    status          TEXT NOT NULL DEFAULT 'shadow',  -- shadow | active | retired
    gcs_path        TEXT,                    -- gs://bucket/path/to/model.pkl
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_versions_status
    ON model_versions (model_type, status, trained_at DESC);

-- 활성 모델은 model_type당 최대 1개
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_active_unique
    ON model_versions (model_type)
    WHERE status = 'active';
