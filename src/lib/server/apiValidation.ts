export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PAIR_RE = /^[A-Z0-9]{2,12}\/[A-Z0-9]{2,12}$/;
export const TRADE_DIR_RE = /^(LONG|SHORT)$/;

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? Number(n) : fallback;
}

export function toPositiveNumber(value: unknown, fallback = 0): number {
  const n = toNumber(value, fallback);
  return n > 0 ? n : fallback;
}

export function toBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(toNumber(value, fallback));
  return Math.min(max, Math.max(min, n));
}

export function normalizePair(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function normalizeTradeDir(value: unknown): 'LONG' | 'SHORT' | '' {
  if (typeof value !== 'string') return '';
  const v = value.trim().toUpperCase();
  return v === 'LONG' || v === 'SHORT' ? v : '';
}

export function getPairBase(pair: string): string {
  return pair.split('/')[0] || '';
}
