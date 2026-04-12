// ─── Timestamp Normalizer ────────────────────────────────────
// ms | s | ISO string → unix seconds (정수)

/** ms or seconds → unix seconds */
export function normalizeTimestamp(raw: number): number {
  // 13자리 이상 = ms
  return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
}

/** 타임프레임 그리드에 정렬 (bar 시작 시간) */
export function alignToGrid(ts: number, tfSeconds: number): number {
  if (tfSeconds <= 0) return ts;
  return Math.floor(ts / tfSeconds) * tfSeconds;
}
