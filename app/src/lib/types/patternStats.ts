/**
 * Typed adapter for engine /patterns/{slug}/stats response.
 *
 * Engine field names (snake_case, compact) are mapped to display-ready
 * names used throughout the app. This is the single source of truth for
 * the field rename contract — routes should import from here rather than
 * doing inline transforms.
 */

export interface PatternStatsMlShadow {
  total_entries?: number;
  decided_entries?: number;
  state_counts?: Record<string, number>;
  scored_entries?: number;
  scored_decided_entries?: number;
  score_coverage?: number | null;
  avg_p_win?: number | null;
  threshold_pass_count?: number;
  threshold_pass_rate?: number | null;
  above_threshold_success_rate?: number | null;
  below_threshold_success_rate?: number | null;
  training_usable_count?: number;
  training_win_count?: number;
  training_loss_count?: number;
  ready_to_train?: boolean;
  readiness_reason?: string;
  last_model_version?: string | null;
}

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
  btc_conditional: {
    bullish: number | null;
    bearish: number | null;
    sideways: number | null;
  } | null;
  decay_direction: string | null;
  recent_30d_count: number;
  recent_30d_success_rate: number | null;
  ml_shadow: PatternStatsMlShadow | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function adaptBtcConditional(raw: unknown): PatternStats['btc_conditional'] {
  const value = asRecord(raw);
  if (!value) return null;
  return {
    bullish: asNumber(value.bullish),
    bearish: asNumber(value.bearish),
    sideways: asNumber(value.sideways),
  };
}

function adaptMlShadow(raw: unknown): PatternStatsMlShadow | null {
  const value = asRecord(raw);
  if (!value) return null;
  return {
    total_entries: asNumber(value.total_entries) ?? undefined,
    decided_entries: asNumber(value.decided_entries) ?? undefined,
    state_counts: asRecord(value.state_counts) as Record<string, number> | undefined,
    scored_entries: asNumber(value.scored_entries) ?? undefined,
    scored_decided_entries: asNumber(value.scored_decided_entries) ?? undefined,
    score_coverage: asNumber(value.score_coverage),
    avg_p_win: asNumber(value.avg_p_win),
    threshold_pass_count: asNumber(value.threshold_pass_count) ?? undefined,
    threshold_pass_rate: asNumber(value.threshold_pass_rate),
    above_threshold_success_rate: asNumber(value.above_threshold_success_rate),
    below_threshold_success_rate: asNumber(value.below_threshold_success_rate),
    training_usable_count: asNumber(value.training_usable_count) ?? undefined,
    training_win_count: asNumber(value.training_win_count) ?? undefined,
    training_loss_count: asNumber(value.training_loss_count) ?? undefined,
    ready_to_train: typeof value.ready_to_train === 'boolean' ? value.ready_to_train : undefined,
    readiness_reason: typeof value.readiness_reason === 'string' ? value.readiness_reason : undefined,
    last_model_version: typeof value.last_model_version === 'string' ? value.last_model_version : null,
  };
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
    btc_conditional:         adaptBtcConditional(raw.btc_conditional),
    decay_direction:         raw.decay_direction != null ? String(raw.decay_direction) : null,
    recent_30d_count:        Number(raw.recent_30d_count ?? 0),
    recent_30d_success_rate: raw.recent_30d_success_rate != null ? Number(raw.recent_30d_success_rate) : null,
    ml_shadow:               adaptMlShadow(raw.ml_shadow),
  };
}
