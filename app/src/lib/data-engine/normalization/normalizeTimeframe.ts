// ─── Timeframe Normalizer ────────────────────────────────────
// "1min" | "4hour" | "1H" | "daily" → canonical "1m" / "4h" / "1h" / "1d"

const TF_MAP: Record<string, string> = {
  '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1hour': '1h', '2hour': '2h', '4hour': '4h', '6hour': '6h', '8hour': '8h', '12hour': '12h',
  'daily': '1d', 'weekly': '1w', 'monthly': '1M',
};

export function normalizeTimeframe(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (TF_MAP[lower]) return TF_MAP[lower];
  // Already canonical (1m, 4h, 1d…)
  return raw.trim().toLowerCase();
}

/** Returns timeframe duration in seconds */
export function tfToSeconds(tf: string): number {
  const n = normalizeTimeframe(tf);
  const match = n.match(/^(\d+)([mhd wM])$/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 'm': return val * 60;
    case 'h': return val * 3600;
    case 'd': return val * 86400;
    case 'w': return val * 604800;
    case 'M': return val * 2592000;
    default: return 0;
  }
}
