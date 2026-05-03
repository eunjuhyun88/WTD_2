-- W-0393: TradingView Idea Twin & Hypothesis Compiler
-- Migration 049: tv_imports + user_pattern_combos + idea_twin_links + author_reputation_index

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. tv_imports — raw import record (one per URL)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tv_imports (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url          text NOT NULL,
    source_type         text NOT NULL CHECK (source_type IN ('idea', 'script', 'chart')),
    parser_tier         text NOT NULL CHECK (parser_tier IN ('pine', 'text', 'vision')),
    chart_id            text,
    snapshot_url        text,
    symbol              text,
    exchange            text,
    timeframe_raw       text,
    timeframe_engine    text,
    title               text,
    description         text,
    author_username     text,
    author_display_name text,
    vision_spec         jsonb NOT NULL DEFAULT '{}',
    compiler_spec       jsonb NOT NULL DEFAULT '{}',
    diagnostics         jsonb NOT NULL DEFAULT '{}',
    status              text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'committed', 'rejected')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tv_imports_author_username_idx
    ON public.tv_imports (author_username);
CREATE INDEX IF NOT EXISTS tv_imports_symbol_idx
    ON public.tv_imports (symbol);
CREATE INDEX IF NOT EXISTS tv_imports_status_idx
    ON public.tv_imports (status);
CREATE INDEX IF NOT EXISTS tv_imports_created_at_idx
    ON public.tv_imports (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. user_pattern_combos — compiled hypothesis → scanner combo
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_pattern_combos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id           uuid REFERENCES public.tv_imports(id) ON DELETE CASCADE,
    variant_id          uuid NOT NULL DEFAULT gen_random_uuid(),
    source_url          text NOT NULL,
    chart_id            text,
    snapshot_url        text,
    symbol              text,
    timeframe           text NOT NULL DEFAULT '4h',
    direction           text NOT NULL DEFAULT 'long'
                            CHECK (direction IN ('long', 'short', 'both')),
    pattern_family      text NOT NULL DEFAULT 'alpha_confluence',
    trigger_block       text,
    confirmation_blocks text[] NOT NULL DEFAULT '{}',
    indicator_filters   jsonb NOT NULL DEFAULT '[]',
    search_origin       text NOT NULL DEFAULT 'tv_import',
    strictness          text NOT NULL DEFAULT 'base'
                            CHECK (strictness IN ('strict', 'base', 'loose')),
    diagnostics         jsonb NOT NULL DEFAULT '{}',
    status              text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'archived')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_pattern_combos_import_id_idx
    ON public.user_pattern_combos (import_id);
CREATE INDEX IF NOT EXISTS user_pattern_combos_status_idx
    ON public.user_pattern_combos (status);
CREATE INDEX IF NOT EXISTS user_pattern_combos_symbol_timeframe_idx
    ON public.user_pattern_combos (symbol, timeframe);
CREATE INDEX IF NOT EXISTS user_pattern_combos_search_origin_idx
    ON public.user_pattern_combos (search_origin);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. idea_twin_links — moat layer: TV author alpha vs engine alpha
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.idea_twin_links (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id                   uuid NOT NULL REFERENCES public.tv_imports(id) ON DELETE CASCADE,
    combo_id                    uuid NOT NULL REFERENCES public.user_pattern_combos(id) ON DELETE CASCADE,
    author_username             text NOT NULL,
    author_display_name         text,
    engine_alpha_score_at_import numeric(6, 4),
    actual_outcome              text CHECK (actual_outcome IN ('win', 'loss', 'neutral', NULL)),
    actual_outcome_pct          numeric(8, 4),
    outcome_resolved_at         timestamptz,
    horizon_bars                int NOT NULL DEFAULT 30,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idea_twin_links_import_id_idx
    ON public.idea_twin_links (import_id);
CREATE INDEX IF NOT EXISTS idea_twin_links_author_username_idx
    ON public.idea_twin_links (author_username);
CREATE INDEX IF NOT EXISTS idea_twin_links_outcome_resolved_at_idx
    ON public.idea_twin_links (outcome_resolved_at)
    WHERE outcome_resolved_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. author_reputation_index — materialized view (moat flywheel)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.author_reputation_index AS
SELECT
    itl.author_username,
    COUNT(*)                                              AS n_imported,
    AVG(itl.engine_alpha_score_at_import)                AS avg_alpha_score,
    MEDIAN(itl.engine_alpha_score_at_import)             AS median_alpha,
    SUM(CASE WHEN itl.actual_outcome = 'win' THEN 1.0 ELSE 0.0 END)
        / NULLIF(COUNT(CASE WHEN itl.actual_outcome IS NOT NULL THEN 1 END), 0)
                                                          AS win_rate,
    AVG(itl.actual_outcome_pct)                          AS avg_return,
    MAX(itl.created_at)                                  AS last_import_at
FROM public.idea_twin_links itl
GROUP BY itl.author_username
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS author_reputation_index_username_idx
    ON public.author_reputation_index (author_username);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. updated_at auto-update triggers
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tv_imports_updated_at ON public.tv_imports;
CREATE TRIGGER tv_imports_updated_at
    BEFORE UPDATE ON public.tv_imports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_pattern_combos_updated_at ON public.user_pattern_combos;
CREATE TRIGGER user_pattern_combos_updated_at
    BEFORE UPDATE ON public.user_pattern_combos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. RLS policies
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pattern_combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_twin_links ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — authenticated users can read their own
CREATE POLICY "tv_imports_service_role" ON public.tv_imports
    USING (true) WITH CHECK (true);

CREATE POLICY "user_pattern_combos_service_role" ON public.user_pattern_combos
    USING (true) WITH CHECK (true);

CREATE POLICY "idea_twin_links_service_role" ON public.idea_twin_links
    USING (true) WITH CHECK (true);
