// ─── Unit Normalizer ─────────────────────────────────────────
// 외부 API가 반환하는 단위를 내부 표준 단위로 변환.

/** Funding rate: raw decimal → BPS (basis points). 0.0001 → 1.0 */
export function fundingToBps(raw: number): number {
  return raw * 10_000;
}

/** OI: raw USD 값 그대로 유지 (이미 USD) */
export function normalizeOI(raw: number): number {
  return raw;
}

/** L/S ratio: raw 그대로 (1.0 = neutral) */
export function normalizeLsRatio(raw: number): number {
  return raw;
}

/** Taker buy ratio: buyVol / (buyVol + sellVol) → 0~1 */
export function normalizeTakerRatio(buyVol: number, sellVol: number): number {
  const total = buyVol + sellVol;
  if (total === 0) return 0.5;
  return buyVol / total;
}
