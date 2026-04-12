// ─── Symbol Normalizer ───────────────────────────────────────
// "BTC/USDT" | "btcusdt" | "BTC-USDT" → "BTCUSDT"

const SLASH_DASH = /[\/\-_]/g;

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(SLASH_DASH, '');
}

/** Coinalyze 포맷: "BTCUSDT" → "BTCUSDT_PERP.A" */
export function toCoinalyzeSymbol(symbol: string): string {
  return normalizeSymbol(symbol) + '_PERP.A';
}
