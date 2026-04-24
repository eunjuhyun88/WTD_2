-- W-0156: feature_windows table — indexed historical signal snapshots for pattern similarity search.
--
-- Mirrors engine/research/feature_windows.py FeatureWindowStore schema.
-- Populated locally by feature_windows_builder.py (has CSV data) → GCP reads via Supabase.
--
-- Build path:  local machine (CSV data) → builder → upsert here
-- Read path:   GCP Cloud Run /search/similar → SupabaseFeatureWindowStore.filter_candidates()

CREATE TABLE IF NOT EXISTS feature_windows (
    symbol       TEXT    NOT NULL,
    timeframe    TEXT    NOT NULL,
    bar_ts_ms    BIGINT  NOT NULL,

    -- OI
    oi_zscore                      FLOAT NOT NULL DEFAULT 0.0,
    oi_change_24h                  FLOAT NOT NULL DEFAULT 0.0,
    oi_change_1h                   FLOAT NOT NULL DEFAULT 0.0,
    oi_spike_flag                  FLOAT NOT NULL DEFAULT 0.0,
    oi_small_uptick_flag           FLOAT NOT NULL DEFAULT 0.0,
    oi_unwind_flag                 FLOAT NOT NULL DEFAULT 0.0,
    oi_hold_flag                   FLOAT NOT NULL DEFAULT 0.0,
    oi_reexpansion_flag            FLOAT NOT NULL DEFAULT 0.0,

    -- Funding
    funding_rate                   FLOAT NOT NULL DEFAULT 0.0,
    funding_extreme_short_flag     FLOAT NOT NULL DEFAULT 0.0,
    funding_extreme_long_flag      FLOAT NOT NULL DEFAULT 0.0,
    funding_positive_flag          FLOAT NOT NULL DEFAULT 0.0,
    funding_flip_flag              FLOAT NOT NULL DEFAULT 0.0,
    funding_flip_negative_to_positive FLOAT NOT NULL DEFAULT 0.0,
    funding_flip_positive_to_negative FLOAT NOT NULL DEFAULT 0.0,

    -- Volume
    vol_zscore                     FLOAT NOT NULL DEFAULT 0.0,
    vol_ratio_3                    FLOAT NOT NULL DEFAULT 0.0,
    volume_spike_flag              FLOAT NOT NULL DEFAULT 0.0,
    low_volume_flag                FLOAT NOT NULL DEFAULT 0.0,
    volume_dryup_flag              FLOAT NOT NULL DEFAULT 0.0,

    -- Price structure
    price_change_1h                FLOAT NOT NULL DEFAULT 0.0,
    price_change_4h                FLOAT NOT NULL DEFAULT 0.0,
    price_dump_flag                FLOAT NOT NULL DEFAULT 0.0,
    price_spike_flag               FLOAT NOT NULL DEFAULT 0.0,
    fresh_low_break_flag           FLOAT NOT NULL DEFAULT 0.0,
    higher_low_count               FLOAT NOT NULL DEFAULT 0.0,
    higher_high_count              FLOAT NOT NULL DEFAULT 0.0,
    higher_lows_sequence_flag      FLOAT NOT NULL DEFAULT 0.0,
    sideways_flag                  FLOAT NOT NULL DEFAULT 0.0,
    upward_sideways_flag           FLOAT NOT NULL DEFAULT 0.0,
    arch_zone_flag                 FLOAT NOT NULL DEFAULT 0.0,
    compression_ratio              FLOAT NOT NULL DEFAULT 0.0,
    range_width_pct                FLOAT NOT NULL DEFAULT 0.0,
    breakout_strength              FLOAT NOT NULL DEFAULT 0.0,
    range_high_break               FLOAT NOT NULL DEFAULT 0.0,

    -- Positioning
    long_short_ratio               FLOAT NOT NULL DEFAULT 0.0,
    short_build_up_flag            FLOAT NOT NULL DEFAULT 0.0,
    long_build_up_flag             FLOAT NOT NULL DEFAULT 0.0,
    short_to_long_switch_flag      FLOAT NOT NULL DEFAULT 0.0,

    PRIMARY KEY (symbol, timeframe, bar_ts_ms)
);

-- Primary scan index: timeframe + key flag columns + recency
CREATE INDEX IF NOT EXISTS fw_flags_idx
    ON feature_windows (timeframe, oi_spike_flag, volume_spike_flag, price_dump_flag, higher_lows_sequence_flag, bar_ts_ms DESC);

-- Per-symbol lookup index
CREATE INDEX IF NOT EXISTS fw_symbol_idx
    ON feature_windows (symbol, timeframe, bar_ts_ms DESC);

-- RLS: engine service role only. Service key bypasses RLS; no explicit policy needed.
ALTER TABLE feature_windows ENABLE ROW LEVEL SECURITY;

-- Aggregate helper used by SupabaseFeatureWindowStore.symbol_timeframe_coverage()
-- Returns one row per (symbol, timeframe) with bar count and date range.
CREATE OR REPLACE FUNCTION fw_coverage_summary()
RETURNS TABLE (
    symbol        TEXT,
    timeframe     TEXT,
    bar_count     BIGINT,
    oldest_ms     BIGINT,
    newest_ms     BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT
        symbol,
        timeframe,
        COUNT(*)         AS bar_count,
        MIN(bar_ts_ms)   AS oldest_ms,
        MAX(bar_ts_ms)   AS newest_ms
    FROM feature_windows
    GROUP BY symbol, timeframe
    ORDER BY symbol, timeframe;
$$;
