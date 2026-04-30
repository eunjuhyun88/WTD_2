/**
 * Typed adapter for engine /patterns/{slug}/stats response.
 *
 * Engine field names (snake_case, compact) are mapped to display-ready
 * names used throughout the app. This is the single source of truth for
 * the field rename contract — routes should import from here rather than
 * doing inline transforms.
 */

export interface PatternStats {
  pattern_slug: string;
  total_instances: number;
  success_count: number;
  failure_count: number;
  pending_count: number;
  hit_rate: number | null;
  avg_gain_pct: number | null;
  avg_loss_pct: number | null;
  expected_value: number | null;
  btc_conditional: number | null;
  decay_direction: string | null;
  recent_30d_count: number;
  recent_30d_success_rate: number | null;
  ml_shadow: {
    total_entries: number;
    decided_entries: number;
    state_counts: Record<string, number>;
    score_coverage: number | null;
    training_usable_count: number;
    ready_to_train: boolean;
    readiness_reason: string;
  } | null;
}

/** Map one raw engine stats payload to a typed PatternStats object. */
export function adaptEngineStats(raw: Record<string, unknown>, slug: string): PatternStats {
  return {
    pattern_slug:            String(raw.pattern_slug ?? slug),
    total_instances:         Number(raw.total        ?? 0),
    success_count:           Number(raw.success      ?? 0),
    failure_count:           Number(raw.failure      ?? 0),
    pending_count:           Number(raw.pending      ?? 0),
    hit_rate:                raw.success_rate  != null ? Number(raw.success_rate)  : null,
    avg_gain_pct:            raw.avg_gain_pct  != null ? Number(raw.avg_gain_pct)  : null,
    avg_loss_pct:            raw.avg_loss_pct  != null ? Number(raw.avg_loss_pct)  : null,
    expected_value:          raw.expected_value != null ? Number(raw.expected_value) : null,
    btc_conditional:         raw.btc_conditional != null ? Number(raw.btc_conditional) : null,
    decay_direction:         raw.decay_direction != null ? String(raw.decay_direction) : null,
    recent_30d_count:        Number(raw.recent_30d_count ?? 0),
    recent_30d_success_rate: raw.recent_30d_success_rate != null ? Number(raw.recent_30d_success_rate) : null,
    ml_shadow:               raw.ml_shadow ?? null,
  };
}
