// ═══════════════════════════════════════════════════════════════
// Stockclaw — On-chain Alert Rules Engine (server-side)
// ═══════════════════════════════════════════════════════════════
// 텔레그램 봇 스타일 실시간 알림 규칙:
//   @bitcoin_mvrv  → MVRV zone 전환 알림
//   @BinanceWhaleVolumeAlerts → 고래 스파이크 알림
//   @REKTbinance   → 청산 캐스케이드 알림
//
// 모든 데이터 소스 기존 모듈 재활용 (CoinMetrics, GeckoTerminal, Coinalyze)

import { fetchCoinMetricsData } from './coinmetrics';
import { fetchLiquidationHistoryServer } from './coinalyze';
import { getCached, setCache } from './providers/cache';

// ── Types ────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'alert' | 'critical';

export interface OnchainAlert {
  id: string;            // unique key for dedup (e.g. 'mvrv:zone:undervalued')
  category: 'mvrv' | 'whale' | 'liquidation' | 'flow';
  severity: AlertSeverity;
  title: string;
  body: string;
  value: number | null;  // 관련 수치
  timestamp: number;
}

export type MvrvZone =
  | 'deep_value'     // < 0.8
  | 'undervalued'    // 0.8 ~ 1.0
  | 'fair_value'     // 1.0 ~ 1.5
  | 'optimism'       // 1.5 ~ 2.5
  | 'greed'          // 2.5 ~ 3.5
  | 'extreme_greed'; // > 3.5

export interface OnchainSnapshot {
  mvrv: { value: number | null; zone: MvrvZone | null; nupl: number | null };
  whale: { count: number; netflow: number; ratio: number };
  liquidation: { longTotal1h: number; shortTotal1h: number; total1h: number; dominance: string };
  exchangeFlow: { netflow24h: number | null; direction: string };
  alerts: OnchainAlert[];
  fetchedAt: number;
}

// ── MVRV Zone Classification ─────────────────────────────────

const MVRV_ZONES: { zone: MvrvZone; min: number; max: number; label: string; emoji: string }[] = [
  { zone: 'deep_value',    min: -Infinity, max: 0.8,  label: 'Deep Value',    emoji: '🟣' },
  { zone: 'undervalued',   min: 0.8,       max: 1.0,  label: 'Undervalued',   emoji: '🔵' },
  { zone: 'fair_value',    min: 1.0,       max: 1.5,  label: 'Fair Value',    emoji: '🟢' },
  { zone: 'optimism',      min: 1.5,       max: 2.5,  label: 'Optimism',      emoji: '🟡' },
  { zone: 'greed',         min: 2.5,       max: 3.5,  label: 'Greed',         emoji: '🟠' },
  { zone: 'extreme_greed', min: 3.5,       max: Infinity, label: 'Extreme Greed', emoji: '🔴' },
];

export function classifyMvrvZone(mvrv: number): { zone: MvrvZone; label: string; emoji: string } {
  for (const z of MVRV_ZONES) {
    if (mvrv >= z.min && mvrv < z.max) return z;
  }
  return MVRV_ZONES[2]; // fallback: fair_value
}

// ── Previous State (in-memory for zone transition detection) ──

interface PrevState {
  mvrvZone: MvrvZone | null;
  whaleCount: number;
  liqTotal1h: number;
  netflow24h: number | null;
}

let _prevState: PrevState = {
  mvrvZone: null,
  whaleCount: 0,
  liqTotal1h: 0,
  netflow24h: null,
};

// ── Thresholds ───────────────────────────────────────────────

const THRESHOLDS = {
  // Whale (@BinanceWhaleVolumeAlerts style)
  whaleCountSpikeMultiplier: 3,  // 이전 대비 3배 → alert
  whaleNetflowLarge: 500_000,    // $500K+ 한 방향 → alert
  whaleRatioHigh: 0.80,          // 80%+ 고래 비율 → info

  // Liquidation (@REKTbinance style)
  liqAlert: 50_000_000,          // $50M → alert
  liqCascade: 200_000_000,       // $200M → critical
  liqDominanceSkew: 0.80,        // 80% 한 쪽 → "LONGS/SHORTS GETTING REKT"

  // Exchange Flow
  flowInflowSurge: 100_000_000,  // $100M+ 유입 → alert (bearish)
  flowOutflowSurge: -100_000_000, // $100M+ 유출 → info (bullish)
};

// ── Rule Engine ──────────────────────────────────────────────

function evaluateAlerts(
  mvrv: number | null,
  nupl: number | null,
  whaleCount: number,
  whaleNetflow: number,
  whaleRatio: number,
  liqLong1h: number,
  liqShort1h: number,
  netflow24h: number | null,
): OnchainAlert[] {
  const alerts: OnchainAlert[] = [];
  const now = Date.now();

  // ─── 1. MVRV Zone Alerts (@bitcoin_mvrv) ───
  if (mvrv != null && Number.isFinite(mvrv)) {
    const { zone, label, emoji } = classifyMvrvZone(mvrv);

    // Zone transition alert
    if (_prevState.mvrvZone != null && _prevState.mvrvZone !== zone) {
      const prevZoneInfo = MVRV_ZONES.find(z => z.zone === _prevState.mvrvZone);
      const severity: AlertSeverity =
        zone === 'deep_value' || zone === 'extreme_greed' ? 'critical' :
        zone === 'undervalued' || zone === 'greed' ? 'alert' : 'info';

      alerts.push({
        id: `mvrv:zone:${zone}`,
        category: 'mvrv',
        severity,
        title: `${emoji} MVRV Zone → ${label.toUpperCase()}`,
        body: `MVRV ${mvrv.toFixed(3)} — ${prevZoneInfo?.label ?? '?'} → ${label}. ${
          zone === 'deep_value' ? '강한 매수 시그널' :
          zone === 'undervalued' ? '매수 기회 구간' :
          zone === 'greed' ? '과열 주의' :
          zone === 'extreme_greed' ? '위험 — 사이클 탑 근접' :
          'NUPL: ' + (nupl?.toFixed(3) ?? 'N/A')
        }`,
        value: mvrv,
        timestamp: now,
      });
    }

    // Always include current zone status (non-alert, for display)
    if (zone === 'deep_value' || zone === 'extreme_greed') {
      alerts.push({
        id: `mvrv:extreme:${zone}`,
        category: 'mvrv',
        severity: 'critical',
        title: `${emoji} MVRV EXTREME: ${mvrv.toFixed(3)}`,
        body: zone === 'deep_value'
          ? `MVRV ${mvrv.toFixed(3)} — 역사적 바닥권. NUPL: ${nupl?.toFixed(3) ?? 'N/A'}`
          : `MVRV ${mvrv.toFixed(3)} — 사이클 탑 경고. 리스크 관리 필수.`,
        value: mvrv,
        timestamp: now,
      });
    }

    _prevState.mvrvZone = zone;
  }

  // ─── 2. Whale Alerts (@BinanceWhaleVolumeAlerts) ───

  // Whale count spike
  if (_prevState.whaleCount > 0 && whaleCount >= _prevState.whaleCount * THRESHOLDS.whaleCountSpikeMultiplier) {
    alerts.push({
      id: `whale:spike:${now}`,
      category: 'whale',
      severity: 'alert',
      title: `🐋 WHALE ACTIVITY SPIKE ×${(whaleCount / _prevState.whaleCount).toFixed(1)}`,
      body: `DEX 고래 거래 ${_prevState.whaleCount} → ${whaleCount}건 급증. 대형 플레이어 활동 감지.`,
      value: whaleCount,
      timestamp: now,
    });
  }

  // Large directional whale flow
  if (Math.abs(whaleNetflow) >= THRESHOLDS.whaleNetflowLarge) {
    const isBuying = whaleNetflow < 0; // negative = buy pressure in our convention
    alerts.push({
      id: `whale:flow:${isBuying ? 'buy' : 'sell'}`,
      category: 'whale',
      severity: 'alert',
      title: `🐋 WHALE ${isBuying ? 'BUYING' : 'SELLING'} $${(Math.abs(whaleNetflow) / 1000).toFixed(0)}K`,
      body: `고래 순${isBuying ? '매수' : '매도'} $${Math.abs(whaleNetflow).toLocaleString()} — ${isBuying ? '축적 신호 (Bullish)' : '분배 신호 (Bearish)'}`,
      value: whaleNetflow,
      timestamp: now,
    });
  }

  // Whale dominance
  if (whaleRatio >= THRESHOLDS.whaleRatioHigh) {
    alerts.push({
      id: 'whale:dominance',
      category: 'whale',
      severity: 'info',
      title: `🐋 WHALE DOMINANCE ${(whaleRatio * 100).toFixed(0)}%`,
      body: `거래의 ${(whaleRatio * 100).toFixed(1)}%가 고래 ($50K+). 대형 플레이어 시장 주도 중.`,
      value: whaleRatio,
      timestamp: now,
    });
  }

  _prevState.whaleCount = whaleCount;

  // ─── 3. Liquidation Alerts (@REKTbinance) ───
  const liqTotal = liqLong1h + liqShort1h;

  if (liqTotal >= THRESHOLDS.liqCascade) {
    // 🚨 LIQUIDATION CASCADE
    alerts.push({
      id: `liq:cascade:${now}`,
      category: 'liquidation',
      severity: 'critical',
      title: `🚨 LIQUIDATION CASCADE $${(liqTotal / 1e6).toFixed(0)}M`,
      body: `1시간 청산 $${(liqTotal / 1e6).toFixed(1)}M — Long $${(liqLong1h / 1e6).toFixed(1)}M / Short $${(liqShort1h / 1e6).toFixed(1)}M. 극심한 변동성 구간.`,
      value: liqTotal,
      timestamp: now,
    });
  } else if (liqTotal >= THRESHOLDS.liqAlert) {
    alerts.push({
      id: `liq:alert:${now}`,
      category: 'liquidation',
      severity: 'alert',
      title: `💀 LIQUIDATIONS $${(liqTotal / 1e6).toFixed(0)}M/1h`,
      body: `Long $${(liqLong1h / 1e6).toFixed(1)}M / Short $${(liqShort1h / 1e6).toFixed(1)}M — ${liqLong1h > liqShort1h ? 'Longs 청산 우세' : 'Shorts 청산 우세'}`,
      value: liqTotal,
      timestamp: now,
    });
  }

  // Liquidation dominance skew
  if (liqTotal > 0) {
    const longPct = liqLong1h / liqTotal;
    const shortPct = liqShort1h / liqTotal;

    if (longPct >= THRESHOLDS.liqDominanceSkew && liqTotal >= THRESHOLDS.liqAlert * 0.5) {
      alerts.push({
        id: `liq:rekt:long`,
        category: 'liquidation',
        severity: 'alert',
        title: `📉 LONGS GETTING REKT — ${(longPct * 100).toFixed(0)}%`,
        body: `Long 청산이 ${(longPct * 100).toFixed(0)}% 차지. $${(liqLong1h / 1e6).toFixed(1)}M 롱 포지션 청산.`,
        value: liqLong1h,
        timestamp: now,
      });
    } else if (shortPct >= THRESHOLDS.liqDominanceSkew && liqTotal >= THRESHOLDS.liqAlert * 0.5) {
      alerts.push({
        id: `liq:rekt:short`,
        category: 'liquidation',
        severity: 'alert',
        title: `📈 SHORTS GETTING REKT — ${(shortPct * 100).toFixed(0)}%`,
        body: `Short 청산이 ${(shortPct * 100).toFixed(0)}% 차지. $${(liqShort1h / 1e6).toFixed(1)}M 숏 포지션 청산.`,
        value: liqShort1h,
        timestamp: now,
      });
    }
  }

  _prevState.liqTotal1h = liqTotal;

  // ─── 4. Exchange Flow Alerts ───
  if (netflow24h != null && Number.isFinite(netflow24h)) {
    if (netflow24h >= THRESHOLDS.flowInflowSurge) {
      alerts.push({
        id: 'flow:inflow',
        category: 'flow',
        severity: 'alert',
        title: `🏦 EXCHANGE INFLOW $${(netflow24h / 1e6).toFixed(0)}M`,
        body: `거래소 순유입 $${(netflow24h / 1e6).toFixed(1)}M — 매도 압력 증가 신호 (Bearish)`,
        value: netflow24h,
        timestamp: now,
      });
    } else if (netflow24h <= THRESHOLDS.flowOutflowSurge) {
      alerts.push({
        id: 'flow:outflow',
        category: 'flow',
        severity: 'info',
        title: `🏦 EXCHANGE OUTFLOW $${(Math.abs(netflow24h) / 1e6).toFixed(0)}M`,
        body: `거래소 순유출 $${(Math.abs(netflow24h) / 1e6).toFixed(1)}M — 축적/홀딩 신호 (Bullish)`,
        value: netflow24h,
        timestamp: now,
      });
    }

    _prevState.netflow24h = netflow24h;
  }

  return alerts;
}

// ── Main Fetch + Evaluate ────────────────────────────────────

const SNAPSHOT_CACHE_TTL = 120_000; // 2min cache for the aggregated snapshot

export async function fetchOnchainAlerts(token: 'btc' | 'eth' = 'btc'): Promise<OnchainSnapshot> {
  const cacheKey = `onchainAlerts:${token}`;
  const cached = getCached<OnchainSnapshot>(cacheKey);
  if (cached) return cached;

  // Parallel fetch: CoinMetrics (MVRV + whale + flow) + Coinalyze (liquidation)
  const [cmRes, liqRes] = await Promise.allSettled([
    fetchCoinMetricsData(token),
    fetchLiquidationHistoryServer('BTC/USDT', '1hour', 1),
  ]);

  // Extract CoinMetrics data
  const cm = cmRes.status === 'fulfilled' ? cmRes.value : null;
  const mvrv = cm?.onchainMetrics?.mvrv ?? null;
  const nupl = cm?.onchainMetrics?.nupl ?? null;
  const whaleCount = cm?.whaleData?.whaleCount ?? 0;
  const whaleNetflow = cm?.whaleData?.whaleNetflow ?? 0;
  const whaleRatio = cm?.whaleData?.exchangeWhaleRatio ?? 0;
  const netflow24h = cm?.exchangeReserve?.netflow24h ?? null;

  // Extract liquidation data (sum of last hour)
  const liqData = liqRes.status === 'fulfilled' ? liqRes.value : [];
  let liqLong1h = 0;
  let liqShort1h = 0;
  for (const pt of liqData) {
    liqLong1h += pt.long;
    liqShort1h += pt.short;
  }

  // Run rule engine
  const alerts = evaluateAlerts(
    mvrv, nupl, whaleCount, whaleNetflow, whaleRatio,
    liqLong1h, liqShort1h, netflow24h,
  );

  // Classify
  const mvrvZoneInfo = mvrv != null ? classifyMvrvZone(mvrv) : null;
  const liqTotal = liqLong1h + liqShort1h;
  const liqDominance = liqTotal > 0
    ? (liqLong1h > liqShort1h ? `Long ${((liqLong1h / liqTotal) * 100).toFixed(0)}%` : `Short ${((liqShort1h / liqTotal) * 100).toFixed(0)}%`)
    : 'N/A';

  const snapshot: OnchainSnapshot = {
    mvrv: { value: mvrv, zone: mvrvZoneInfo?.zone ?? null, nupl },
    whale: { count: whaleCount, netflow: whaleNetflow, ratio: whaleRatio },
    liquidation: { longTotal1h: liqLong1h, shortTotal1h: liqShort1h, total1h: liqTotal, dominance: liqDominance },
    exchangeFlow: {
      netflow24h,
      direction: netflow24h == null ? 'unknown' : netflow24h > 0 ? 'inflow' : 'outflow',
    },
    alerts,
    fetchedAt: Date.now(),
  };

  setCache(cacheKey, snapshot, SNAPSHOT_CACHE_TTL);
  return snapshot;
}

// ── Reset (for testing) ──────────────────────────────────────
export function resetAlertState(): void {
  _prevState = { mvrvZone: null, whaleCount: 0, liqTotal1h: 0, netflow24h: null };
}
