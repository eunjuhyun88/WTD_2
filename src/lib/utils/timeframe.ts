export type CanonicalTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

const CANONICAL_TIMEFRAMES: ReadonlySet<CanonicalTimeframe> = new Set([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
]);

export function normalizeTimeframe(
  input: string | null | undefined,
  fallback: CanonicalTimeframe = '4h'
): CanonicalTimeframe {
  if (!input) return fallback;
  const tf = input.trim().toLowerCase();
  return CANONICAL_TIMEFRAMES.has(tf as CanonicalTimeframe) ? (tf as CanonicalTimeframe) : fallback;
}

export function formatTimeframeLabel(input: string | null | undefined): string {
  const tf = normalizeTimeframe(input);
  const labels: Record<CanonicalTimeframe, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
    '1w': '1W',
  };
  return labels[tf];
}

export function toBinanceInterval(input: string | null | undefined): string {
  return normalizeTimeframe(input);
}

export function toCoinalyzeInterval(input: string | null | undefined): string {
  const tf = normalizeTimeframe(input);
  const map: Record<CanonicalTimeframe, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1hour',
    '4h': '4hour',
    '1d': 'daily',
    '1w': 'weekly',
  };
  return map[tf];
}

export function toTradingViewInterval(input: string | null | undefined): string {
  const tf = normalizeTimeframe(input);
  const map: Record<CanonicalTimeframe, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',
    '1d': 'D',
    '1w': 'W',
  };
  return map[tf];
}

export const CORE_TIMEFRAME_OPTIONS: ReadonlyArray<{ value: CanonicalTimeframe; label: string }> = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];
