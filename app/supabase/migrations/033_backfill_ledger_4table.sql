-- Migration 033: F-30 Phase 3 — Backfill pattern_ledger_records → 4 typed tables
-- Uses ON CONFLICT DO NOTHING (dual-write already populated recent rows)

INSERT INTO ledger_outcomes (id, capture_id, pattern_slug, outcome,
    max_gain_pct, exit_return_pct, duration_hours, created_at)
SELECT
    id,
    COALESCE(capture_id, ''),
    pattern_slug,
    COALESCE(payload->>'outcome', 'pending'),
    (payload->>'max_gain_pct')::numeric,
    (payload->>'exit_return_pct')::numeric,
    (payload->>'duration_hours')::numeric,
    created_at
FROM pattern_ledger_records
WHERE record_type = 'outcome'
ON CONFLICT (id) DO NOTHING;

INSERT INTO ledger_verdicts (id, capture_id, pattern_slug, user_id, verdict, note, outcome_id, created_at)
SELECT
    id,
    COALESCE(capture_id, ''),
    pattern_slug,
    COALESCE(payload->>'user_id', user_id, 'unknown'),
    COALESCE(payload->>'user_verdict', payload->>'verdict', 'unknown'),
    payload->>'user_note',
    outcome_id,
    created_at
FROM pattern_ledger_records
WHERE record_type = 'verdict'
ON CONFLICT (id) DO NOTHING;

INSERT INTO ledger_entries (id, capture_id, pattern_slug, entry_price, btc_trend, created_at)
SELECT
    id,
    COALESCE(capture_id, ''),
    pattern_slug,
    (payload->>'entry_price')::numeric,
    COALESCE(payload->>'btc_trend_at_entry', payload->>'btc_trend'),
    created_at
FROM pattern_ledger_records
WHERE record_type = 'entry'
ON CONFLICT (id) DO NOTHING;

INSERT INTO ledger_scores (id, capture_id, pattern_slug, p_win, model_key,
    threshold, threshold_passed, created_at)
SELECT
    id,
    COALESCE(capture_id, ''),
    pattern_slug,
    (payload->>'entry_p_win')::numeric,
    payload->>'entry_model_key',
    (payload->>'entry_threshold')::numeric,
    (payload->>'entry_threshold_passed')::boolean,
    created_at
FROM pattern_ledger_records
WHERE record_type = 'score'
ON CONFLICT (id) DO NOTHING;
