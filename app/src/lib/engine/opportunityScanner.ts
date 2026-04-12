// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Multi-Asset Opportunity Scanner
// ═══════════════════════════════════════════════════════════════
// Lightweight scanning of trending coins → composite opportunity score
// Used by: auto multi-scan, comparison mode, alert engine
//
// Scoring: 0-100
//   Momentum (0-25) + Volume (0-20) + Social (0-20) + Macro (0-15) + OnChain (0-20)

import {
  fetchCMCTrending,
  type CMCTrendingCoin,
} from '$lib/server/coinmarketcap';
import { fetchTopicSocial, hasLunarCrushKey } from '$lib/server/lunarcrush';
import { fetchFredMacroData, hasFredKey } from '$lib/server/fred';
import { fetchCryptoQuantData, hasCryptoQuantKey } from '$lib/server/cryptoquant';

// ─── Types ────────────────────────────────────────────────────

export interface OpportunityScore {
  symbol: string;
  name: string;
  slug: string;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  volume24h: number;
  marketCap: number;
  // Individual scores (0-max per category)
  momentumScore: number;     // 0-25
  volumeScore: number;       // 0-20
  socialScore: number;       // 0-20
  macroScore: number;        // 0-15
  onchainScore: number;      // 0-20
  // Composite
  totalScore: number;        // 0-100
  direction: 'long' | 'short' | 'neutral';
  confidence: number;        // 45-95
  reasons: string[];         // Top 3 reasons
  // Social overlay
  sentiment?: number | null;
  socialVolume?: number | null;
  galaxyScore?: number | null;
  // Alerts
  alerts: string[];          // Detected conditions (squeeze, divergence, spike, etc.)
}

export interface OpportunityScanResult {
  coins: OpportunityScore[];
  macroBackdrop: MacroBackdrop;
  scannedAt: number;
  scanDurationMs: number;
}

interface MacroBackdrop {
  fedFundsRate: number | null;
  yieldCurveSpread: number | null;
  m2ChangePct: number | null;
  overallMacroScore: number;  // -1 to +1 (bearish to bullish)
  regime: 'risk-on' | 'risk-off' | 'neutral';
}

// ─── Symbol → Topic mapping ──────────────────────────────────

const SYMBOL_TO_TOPIC: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche', DOT: 'polkadot',
  LINK: 'chainlink', MATIC: 'polygon', SHIB: 'shiba-inu', UNI: 'uniswap',
  NEAR: 'near-protocol', APT: 'aptos', SUI: 'sui', OP: 'optimism',
  ARB: 'arbitrum', PEPE: 'pepe', WIF: 'dogwifhat', BONK: 'bonk',
  BNB: 'binance-coin', TRX: 'tron', TON: 'toncoin', LTC: 'litecoin',
  BCH: 'bitcoin-cash', FIL: 'filecoin', ATOM: 'cosmos', ICP: 'internet-computer',
  RENDER: 'render-token', FET: 'fetch-ai', ONDO: 'ondo-finance',
};

// ─── Scoring Functions ────────────────────────────────────────

function scoreMomentum(coin: CMCTrendingCoin): { score: number; reasons: string[]; alerts: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const alerts: string[] = [];

  // 1h momentum (fast) — 0-8 points
  const abs1h = Math.abs(coin.change1h);
  if (abs1h > 5) {
    score += 8;
    alerts.push(coin.change1h > 0 ? `⚡ 1h급등 +${coin.change1h.toFixed(1)}%` : `⚡ 1h급락 ${coin.change1h.toFixed(1)}%`);
  } else if (abs1h > 2) {
    score += 5;
  } else if (abs1h > 0.5) {
    score += 2;
  }

  // 24h momentum — 0-10 points (most important)
  const abs24h = Math.abs(coin.change24h);
  if (abs24h > 10) {
    score += 10;
    reasons.push(`24h ${coin.change24h > 0 ? '강세' : '약세'} ${coin.change24h.toFixed(1)}%`);
  } else if (abs24h > 5) {
    score += 7;
    reasons.push(`24h ${coin.change24h.toFixed(1)}%`);
  } else if (abs24h > 2) {
    score += 4;
  } else {
    score += 1;
  }

  // 7d trend alignment — 0-7 points
  const sameDir = (coin.change24h > 0 && coin.change7d > 0) || (coin.change24h < 0 && coin.change7d < 0);
  if (sameDir && Math.abs(coin.change7d) > 10) {
    score += 7;
    reasons.push(`7d 트렌드 정렬 ${coin.change7d.toFixed(1)}%`);
  } else if (sameDir) {
    score += 4;
  } else if (Math.abs(coin.change7d) > 15) {
    // Potential reversal setup
    score += 3;
    alerts.push(`🔄 7d vs 24h 역전 (반전 가능)`);
  }

  return { score: Math.min(25, score), reasons, alerts };
}

function scoreVolume(coin: CMCTrendingCoin): { score: number; reasons: string[]; alerts: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const alerts: string[] = [];

  // Volume to market cap ratio — higher = more activity
  if (coin.marketCap > 0) {
    const volRatio = coin.volume24h / coin.marketCap;
    if (volRatio > 0.5) {
      score += 15;
      reasons.push(`거래량 폭발 (Vol/MC ${(volRatio * 100).toFixed(0)}%)`);
      alerts.push(`🔥 거래량 스파이크`);
    } else if (volRatio > 0.2) {
      score += 10;
      reasons.push(`높은 거래량`);
    } else if (volRatio > 0.1) {
      score += 6;
    } else if (volRatio > 0.05) {
      score += 3;
    }
  }

  // Absolute volume (liquidity)
  if (coin.volume24h > 1_000_000_000) score += 5;
  else if (coin.volume24h > 100_000_000) score += 3;
  else if (coin.volume24h > 10_000_000) score += 1;

  return { score: Math.min(20, score), reasons, alerts };
}

function scoreSocial(
  social: { sentiment: number; interactions24h: number; socialDominance: number; galaxyScore: number } | null,
): { score: number; reasons: string[] } {
  if (!social) return { score: 5, reasons: [] }; // neutral baseline

  let score = 0;
  const reasons: string[] = [];

  // Galaxy Score (0-100) — LunarCrush's composite metric
  if (social.galaxyScore > 70) {
    score += 8;
    reasons.push(`Galaxy ⭐${social.galaxyScore}`);
  } else if (social.galaxyScore > 50) {
    score += 5;
  } else if (social.galaxyScore > 30) {
    score += 2;
  }

  // Social volume (engagement)
  if (social.interactions24h > 100_000) {
    score += 6;
    reasons.push(`소셜 핫 ${(social.interactions24h / 1000).toFixed(0)}K 인게이지먼트`);
  } else if (social.interactions24h > 10_000) {
    score += 3;
  }

  // Sentiment (contrarian) — extreme sentiment = caution
  if (social.sentiment > 4.0) {
    score += 2; // too bullish = caution
  } else if (social.sentiment > 3.0) {
    score += 6; // healthy bullish
  } else if (social.sentiment < 2.0) {
    score += 4; // contrarian buy zone
    reasons.push(`역발상 기회 (감성 ${social.sentiment.toFixed(1)})`);
  } else {
    score += 3; // neutral
  }

  return { score: Math.min(20, score), reasons };
}

function scoreMacro(backdrop: MacroBackdrop): { score: number; reasons: string[] } {
  // Macro is the same for all coins, but we scale it
  const raw = backdrop.overallMacroScore; // -1 to +1
  const score = Math.round((raw + 1) * 7.5); // 0-15
  const reasons: string[] = [];

  if (backdrop.regime === 'risk-on') {
    reasons.push(`매크로 risk-on`);
  } else if (backdrop.regime === 'risk-off') {
    reasons.push(`매크로 risk-off ⚠`);
  }

  return { score: Math.max(0, Math.min(15, score)), reasons };
}

function scoreOnchain(
  symbol: string,
  cqData: Awaited<ReturnType<typeof fetchCryptoQuantData>> | null,
): { score: number; reasons: string[]; alerts: string[] } {
  const reasons: string[] = [];
  const alerts: string[] = [];

  // Only BTC and ETH have CryptoQuant data
  if (!cqData || (symbol !== 'BTC' && symbol !== 'ETH')) {
    return { score: 10, reasons: [], alerts: [] }; // neutral baseline
  }

  let score = 10; // baseline

  // MVRV ratio
  if (cqData.onchainMetrics?.mvrv != null) {
    const mvrv = cqData.onchainMetrics.mvrv;
    if (mvrv < 1.0) {
      score += 5;
      reasons.push(`MVRV ${mvrv.toFixed(2)} (저평가)`);
    } else if (mvrv > 3.0) {
      score -= 5;
      reasons.push(`MVRV ${mvrv.toFixed(2)} (과열)`);
      alerts.push(`⚠ MVRV 과열 ${mvrv.toFixed(2)}`);
    }
  }

  // Exchange reserve change
  if (cqData.exchangeReserve?.change7dPct != null) {
    const change = cqData.exchangeReserve.change7dPct;
    if (change < -2) {
      score += 4;
      reasons.push(`거래소 유출 7d ${change.toFixed(1)}% (축적)`);
    } else if (change > 3) {
      score -= 3;
      alerts.push(`⚠ 거래소 유입 증가 +${change.toFixed(1)}%`);
    }
  }

  // Whale netflow
  if (cqData.whaleData?.whaleNetflow != null) {
    if (cqData.whaleData.whaleNetflow < -1000) {
      score += 3;
      reasons.push(`고래 매집 중`);
    } else if (cqData.whaleData.whaleNetflow > 2000) {
      score -= 2;
      alerts.push(`⚠ 고래 매도 압력`);
    }
  }

  return { score: Math.max(0, Math.min(20, score)), reasons, alerts };
}

// ─── Macro Backdrop Calculator ────────────────────────────────

async function computeMacroBackdrop(): Promise<MacroBackdrop> {
  let overallScore = 0;
  let fedFundsRate: number | null = null;
  let yieldCurveSpread: number | null = null;
  let m2ChangePct: number | null = null;

  if (hasFredKey()) {
    try {
      const fred = await fetchFredMacroData();
      if (fred.fedFundsRate?.latest) {
        fedFundsRate = fred.fedFundsRate.latest.value;
        // Rate cuts = bullish
        if (fred.fedFundsRate.change != null && fred.fedFundsRate.change < 0) overallScore += 0.3;
        else if (fedFundsRate > 5.0) overallScore -= 0.2;
      }
      if (fred.yieldCurve?.latest) {
        yieldCurveSpread = fred.yieldCurve.latest.value;
        if (yieldCurveSpread < 0) overallScore -= 0.2; // inverted
        else if (yieldCurveSpread > 0.5) overallScore += 0.15;
      }
      if (fred.m2?.changePct != null) {
        m2ChangePct = fred.m2.changePct;
        if (m2ChangePct > 0.5) overallScore += 0.2; // expansion
        else if (m2ChangePct < -0.5) overallScore -= 0.2;
      }
    } catch (e) {
      // FRED unavailable
    }
  }

  overallScore = Math.max(-1, Math.min(1, overallScore));
  const regime: MacroBackdrop['regime'] = overallScore > 0.15 ? 'risk-on' : overallScore < -0.15 ? 'risk-off' : 'neutral';

  return { fedFundsRate, yieldCurveSpread, m2ChangePct, overallMacroScore: overallScore, regime };
}

// ─── Direction & Confidence ───────────────────────────────────

function computeDirection(score: number, coin: CMCTrendingCoin): { direction: OpportunityScore['direction']; confidence: number } {
  // Combine score with price direction
  const priceDir = coin.change24h > 1 ? 1 : coin.change24h < -1 ? -1 : 0;
  const scoreDir = score > 55 ? 1 : score < 40 ? -1 : 0;

  let direction: OpportunityScore['direction'];
  if (priceDir > 0 && scoreDir >= 0) direction = 'long';
  else if (priceDir < 0 && scoreDir <= 0) direction = 'short';
  else if (scoreDir > 0) direction = 'long';
  else if (scoreDir < 0) direction = 'short';
  else direction = 'neutral';

  // Confidence based on score extremity
  const confidence = Math.round(Math.max(45, Math.min(95, 45 + Math.abs(score - 50) * 1.5)));

  return { direction, confidence };
}

// ─── Main Scanner ─────────────────────────────────────────────

export async function runOpportunityScan(limit = 15): Promise<OpportunityScanResult> {
  const startMs = Date.now();

  // Phase 1: Fetch trending coins + macro backdrop in parallel
  const [trendingCoins, macroBackdrop, cqBtcData] = await Promise.all([
    fetchCMCTrending(limit),
    computeMacroBackdrop(),
    hasCryptoQuantKey() ? fetchCryptoQuantData('btc') : Promise.resolve(null),
  ]);

  if (trendingCoins.length === 0) {
    return { coins: [], macroBackdrop, scannedAt: Date.now(), scanDurationMs: Date.now() - startMs };
  }

  // Phase 2: Enrich top coins with social data (limit to 10 for speed)
  const socialLimit = Math.min(trendingCoins.length, 10);
  let socialMap = new Map<string, Awaited<ReturnType<typeof fetchTopicSocial>>>();

  if (hasLunarCrushKey()) {
    const socialPromises = trendingCoins.slice(0, socialLimit).map(async (coin) => {
      const topic = SYMBOL_TO_TOPIC[coin.symbol] ?? coin.slug;
      try {
        const data = await fetchTopicSocial(topic);
        return { symbol: coin.symbol, data };
      } catch {
        return { symbol: coin.symbol, data: null };
      }
    });

    const socialResults = await Promise.allSettled(socialPromises);
    for (const r of socialResults) {
      if (r.status === 'fulfilled' && r.value.data) {
        socialMap.set(r.value.symbol, r.value.data);
      }
    }
  }

  // Phase 3: Score each coin
  const scoredCoins: OpportunityScore[] = trendingCoins.map((coin) => {
    const social = socialMap.get(coin.symbol) ?? null;
    const cqData = (coin.symbol === 'BTC' || coin.symbol === 'ETH') ? cqBtcData : null;

    const momentum = scoreMomentum(coin);
    const volume = scoreVolume(coin);
    const socialResult = scoreSocial(social);
    const macro = scoreMacro(macroBackdrop);
    const onchain = scoreOnchain(coin.symbol, cqData);

    const totalScore = momentum.score + volume.score + socialResult.score + macro.score + onchain.score;
    const { direction, confidence } = computeDirection(totalScore, coin);

    // Collect top 3 reasons
    const allReasons = [...momentum.reasons, ...volume.reasons, ...socialResult.reasons, ...macro.reasons, ...onchain.reasons];
    const reasons = allReasons.slice(0, 3);
    if (reasons.length === 0) reasons.push(coin.change24h > 0 ? '양호한 모멘텀' : '모멘텀 약세');

    // Collect alerts
    const alerts = [...momentum.alerts, ...volume.alerts, ...onchain.alerts];

    return {
      symbol: coin.symbol,
      name: coin.name,
      slug: coin.slug,
      price: coin.price,
      change1h: coin.change1h,
      change24h: coin.change24h,
      change7d: coin.change7d,
      volume24h: coin.volume24h,
      marketCap: coin.marketCap,
      momentumScore: momentum.score,
      volumeScore: volume.score,
      socialScore: socialResult.score,
      macroScore: macro.score,
      onchainScore: onchain.score,
      totalScore,
      direction,
      confidence,
      reasons,
      sentiment: social?.sentiment ?? null,
      socialVolume: social?.interactions24h ?? null,
      galaxyScore: social?.galaxyScore ?? null,
      alerts,
    };
  });

  // Sort by total score (descending)
  scoredCoins.sort((a, b) => b.totalScore - a.totalScore);

  return {
    coins: scoredCoins,
    macroBackdrop,
    scannedAt: Date.now(),
    scanDurationMs: Date.now() - startMs,
  };
}

// ─── Alert Detection (for background monitoring) ──────────────

export interface OpportunityAlert {
  symbol: string;
  type: 'spike' | 'squeeze' | 'divergence' | 'whale' | 'volume' | 'social';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  score: number;
  timestamp: number;
}

export function extractAlerts(scanResult: OpportunityScanResult): OpportunityAlert[] {
  const alerts: OpportunityAlert[] = [];
  const now = Date.now();

  for (const coin of scanResult.coins) {
    // 1h spike detection
    if (Math.abs(coin.change1h) > 5) {
      alerts.push({
        symbol: coin.symbol,
        type: 'spike',
        severity: Math.abs(coin.change1h) > 10 ? 'critical' : 'warning',
        message: `${coin.symbol} 1h ${coin.change1h > 0 ? '급등' : '급락'} ${coin.change1h.toFixed(1)}%`,
        score: coin.totalScore,
        timestamp: now,
      });
    }

    // Volume spike
    if (coin.marketCap > 0 && coin.volume24h / coin.marketCap > 0.5) {
      alerts.push({
        symbol: coin.symbol,
        type: 'volume',
        severity: 'warning',
        message: `${coin.symbol} 거래량 폭발 (MC 대비 ${((coin.volume24h / coin.marketCap) * 100).toFixed(0)}%)`,
        score: coin.totalScore,
        timestamp: now,
      });
    }

    // High opportunity (totalScore > 70)
    if (coin.totalScore > 70) {
      alerts.push({
        symbol: coin.symbol,
        type: 'social',
        severity: 'info',
        message: `${coin.symbol} 고점수 기회 (${coin.totalScore}/100) — ${coin.reasons[0]}`,
        score: coin.totalScore,
        timestamp: now,
      });
    }

    // Coin-specific alerts from scanning
    for (const alertMsg of coin.alerts) {
      alerts.push({
        symbol: coin.symbol,
        type: alertMsg.includes('스퀴즈') ? 'squeeze' : alertMsg.includes('고래') ? 'whale' : 'divergence',
        severity: alertMsg.startsWith('⚠') ? 'warning' : 'info',
        message: `${coin.symbol}: ${alertMsg}`,
        score: coin.totalScore,
        timestamp: now,
      });
    }
  }

  // Sort by severity then score
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.score - a.score);

  return alerts;
}
