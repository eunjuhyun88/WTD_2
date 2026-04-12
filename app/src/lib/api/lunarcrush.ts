// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — LunarCrush Social Client
// ═══════════════════════════════════════════════════════════════
// Client-side wrapper for /api/senti/social proxy
// Maps to: SENTI agent → SOCIAL_VOLUME, SOCIAL_SENTIMENT

export interface SocialData {
  topic: string;
  sentiment: number;          // 1-5
  interactions24h: number;
  postsActive: number;
  contributorsActive: number;
  socialDominance: number;    // % of total crypto social
  galaxyScore: number;        // 0-100
  altRank: number;
  topicRank: number;
  close: number;
  percentChange24h: number;
  volume24h: number;
  marketCap: number;
}

/** Fetch social metrics from LunarCrush proxy */
export async function fetchSocialData(token: string): Promise<SocialData | null> {
  try {
    const res = await fetch(`/api/senti/social?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch (err) {
    console.error('[SocialData] fetch error:', err);
    return null;
  }
}

/**
 * Convert LunarCrush sentiment (1-5) to factor score.
 * 1-2 = bearish → contrarian bullish signal
 * 4-5 = bullish → contrarian bearish signal
 * 3 = neutral
 * Returns -40 to +40 (contrarian)
 */
export function sentimentToScore(sentiment: number): number {
  // Center at 3, scale contrarian
  return Math.round(-(sentiment - 3) * 20);
}

/**
 * Social dominance score.
 * Very high dominance (>20%) in a single token → overbought/overhyped signal
 * Returns -30 to +30
 */
export function dominanceToScore(dominance: number): number {
  if (dominance > 25) return -25;  // extreme hype, contrarian bearish
  if (dominance > 15) return -10;  // elevated attention
  if (dominance < 2) return 10;    // under the radar, potential opportunity
  return 0;
}

/**
 * Galaxy score to confidence modifier.
 * Higher galaxy score = stronger conviction in the signal direction.
 * Returns 0 to +15 (confidence boost)
 */
export function galaxyToConfBoost(galaxyScore: number): number {
  if (galaxyScore > 70) return 10;
  if (galaxyScore > 50) return 5;
  return 0;
}
