// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Fear & Greed Index Client (B-05)
// ═══════════════════════════════════════════════════════════════
// Alternative.me Crypto Fear & Greed — completely free, no key
// https://api.alternative.me/fng/
//
// Maps to: SENTI agent → FG_TREND factor

const FNG_API = 'https://api.alternative.me/fng/';

export interface FearGreedData {
  value: number;        // 0-100 (0=Extreme Fear, 100=Extreme Greed)
  classification: string; // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  timestamp: number;    // unix seconds
}

export interface FearGreedHistory {
  current: FearGreedData;
  history: FearGreedData[];
}

async function fngFetch(params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params);
  const url = qs.toString() ? `${FNG_API}?${qs}` : FNG_API;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`FNG API ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch current Fear & Greed Index */
export async function fetchFearGreed(): Promise<FearGreedData | null> {
  try {
    const json = await fngFetch();
    if (!json?.data?.[0]) return null;
    const d = json.data[0];
    return {
      value: Number(d.value),
      classification: d.value_classification ?? 'Unknown',
      timestamp: Number(d.timestamp),
    };
  } catch (err) {
    console.error('[FearGreed] fetch error:', err);
    return null;
  }
}

/** Fetch Fear & Greed history (N days) */
export async function fetchFearGreedHistory(days = 30): Promise<FearGreedHistory | null> {
  try {
    const json = await fngFetch({ limit: String(days) });
    if (!json?.data?.length) return null;

    const items: FearGreedData[] = json.data.map((d: any) => ({
      value: Number(d.value),
      classification: d.value_classification ?? 'Unknown',
      timestamp: Number(d.timestamp),
    }));

    return {
      current: items[0],
      history: items,
    };
  } catch (err) {
    console.error('[FearGreed] history error:', err);
    return null;
  }
}

/**
 * Compute Fear & Greed trend score for factorEngine
 * Returns -100 to +100:
 *   Extreme Fear (0-20) → +50~+100 (contrarian bullish)
 *   Fear (20-40) → +10~+50
 *   Neutral (40-60) → -10~+10
 *   Greed (60-80) → -10~-50
 *   Extreme Greed (80-100) → -50~-100 (contrarian bearish)
 */
export function fngToScore(value: number): number {
  // Linear map: FNG 50 → 0, FNG 0 → +100, FNG 100 → -100
  return Math.round(-(value - 50) * 2);
}
