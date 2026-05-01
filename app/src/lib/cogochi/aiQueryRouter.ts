/**
 * aiQueryRouter — Phase D-7 AI Search query → action mapper.
 *
 * Pure TS, easy to unit-test. Used by AIAgentPanel and AIPanel.
 */

export type AIRouterAction =
  | { kind: 'analyze';    symbol: string; timeframe: string }
  | { kind: 'scan';       timeframe: string }
  | { kind: 'judge';      symbol: string; timeframe: string; verdict: 'long' | 'short' }
  | { kind: 'indicator';  query: string }
  | { kind: 'overlay';    symbol: string; price: number; label: string }
  | { kind: 'recall';     symbol: string; timeframe: string }
  | { kind: 'timeframe';  timeframe: string }
  | { kind: 'unknown';    reason: string };

export interface AIRouterContext {
  symbol: string;
  timeframe: string;
}

const TF_TOKENS: ReadonlyArray<[RegExp, string]> = [
  [/\b1\s*m(in)?\b/i, '1m'],
  [/\b3\s*m(in)?\b/i, '3m'],
  [/\b5\s*m(in)?\b|5분/i, '5m'],
  [/\b15\s*m(in)?\b|15분/i, '15m'],
  [/\b30\s*m(in)?\b|30분/i, '30m'],
  [/\b1\s*h(our)?\b|1시간/i, '1h'],
  [/\b2\s*h(our)?\b|2시간/i, '2h'],
  [/\b4\s*h(our)?\b|4시간/i, '4h'],
  [/\b6\s*h(our)?\b|6시간/i, '6h'],
  [/\b12\s*h(our)?\b|12시간/i, '12h'],
  [/\b1\s*d(ay)?\b|일봉/i, '1D'],
  [/\b1\s*w(eek)?\b|주봉/i, '1w'],
];

export function extractTimeframe(text: string, fallback: string): string {
  for (const [re, tf] of TF_TOKENS) {
    if (re.test(text)) return tf;
  }
  return fallback;
}

export function extractSymbol(text: string, fallback: string): string {
  const m =
    text.match(/([A-Z]{2,10})\s*(분석|analyze|long|short|롱|숏|판정)/i) ??
    text.match(/\b(BTC|ETH|SOL|BNB|XRP|AVAX|DOGE|ADA|MATIC|LINK|DOT|NEAR|APT|ARB|OP|TRX|TON|SUI|SHIB|LTC|ATOM)\b/i);
  if (!m) return fallback;
  const base = m[1].toUpperCase();
  return base.endsWith('USDT') ? base : `${base}USDT`;
}

/**
 * Extract a price like "96,000" / "96000" / "$3,500".
 * Returns null when not present.
 */
export function extractPrice(text: string): number | null {
  const m = text.match(/\$?\s*(\d{1,3}(?:[,]\d{3})+|\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Classify intent and produce a typed action descriptor.
 *
 * Order matters: more specific patterns first.
 */
export function routeAIQuery(text: string, ctx: AIRouterContext): AIRouterAction {
  const t = text.trim();
  if (!t) return { kind: 'unknown', reason: 'empty' };
  const lower = t.toLowerCase();

  // Timeframe change ("5분봉으로 바꿔줘", "switch to 5m")
  if (/(바꿔|change|switch|change to|이동)/i.test(t) || /^\s*tf\s/i.test(t)) {
    const tf = extractTimeframe(t, ctx.timeframe);
    if (tf !== ctx.timeframe) {
      return { kind: 'timeframe', timeframe: tf };
    }
  }

  // Pattern recall
  if (/similar pattern|recall|유사|비슷한|recall/i.test(lower)) {
    return {
      kind: 'recall',
      symbol: extractSymbol(t, ctx.symbol),
      timeframe: extractTimeframe(t, ctx.timeframe),
    };
  }

  // Overlay (e.g. "BTC 96,000 저항 표시", "draw resistance at 3500")
  if (/저항|지지|resistance|support|draw|표시|line at/i.test(lower)) {
    const price = extractPrice(t);
    if (price !== null) {
      const isResist = /저항|resistance/i.test(lower);
      return {
        kind: 'overlay',
        symbol: extractSymbol(t, ctx.symbol),
        price,
        label: isResist ? 'Resistance' : 'Support',
      };
    }
  }

  // Scan
  if (/스캔|scan|찾아|screener/.test(lower)) {
    return { kind: 'scan', timeframe: extractTimeframe(t, ctx.timeframe) };
  }

  // Judge — explicit verdict words
  if (/판정|judge|long|short|롱|숏|매수|매도/.test(lower)) {
    const isLong = /long|롱|매수/.test(lower);
    return {
      kind: 'judge',
      symbol: extractSymbol(t, ctx.symbol),
      timeframe: extractTimeframe(t, ctx.timeframe),
      verdict: isLong ? 'long' : 'short',
    };
  }

  // Analyze — generic "어때 / 분석 / what / show me"
  if (/분석|analyze|어때|봐줘|show me|what|어떻|어떄/.test(lower)) {
    return {
      kind: 'analyze',
      symbol: extractSymbol(t, ctx.symbol),
      timeframe: extractTimeframe(t, ctx.timeframe),
    };
  }

  // Default → indicator (passes through to findIndicatorByQuery)
  return { kind: 'indicator', query: t };
}
