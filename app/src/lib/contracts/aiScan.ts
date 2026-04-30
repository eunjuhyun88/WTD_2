/**
 * AI scan suggestion contract — W-0333
 * Type for symbols the AI assistant suggests during a scan query.
 */

export interface AiTokenSuggestion {
  symbol: string;        // e.g. "BTCUSDT"
  reason?: string;       // e.g. "OI 24h +23% 이상치"
  changePct4h?: number;
  oiTrend?: 'up' | 'down' | 'flat';
  fundingRate?: number;
  score?: number;        // 0-100 relevance
}

/** Keywords that indicate a scan/multi-token query */
export const SCAN_KEYWORDS = ['oi', '급증', 'scan', 'squeeze', '찾아', 'screener', '스캐너', 'find', '탐색'];

export function isScanQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return SCAN_KEYWORDS.some(kw => lower.includes(kw));
}
