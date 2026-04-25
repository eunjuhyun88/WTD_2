// ═══════════════════════════════════════════════════════════════
// KPI Strip — registry + value extractors + tone rules
// ═══════════════════════════════════════════════════════════════
//
// The KPI strip sits above the chart and gives users an at-a-glance read on
// every key live data point that drives a trading decision: OI flow, funding,
// CVD delta, liq density, book spread, book imbalance, tape rate, absorption,
// and WS feed health.
//
// Design follows the pattern users see in CryptoQuant / Velo / CoinGlass /
// Material Indicators:
//   • Current value (large)
//   • Period delta vs previous bar (color-coded)
//   • Mini sparkline (last 24 bars at the chart's tf)
//   • Threshold-based tone signal (bull/bear/warn — not just sign)
//   • Live "WS LIVE" pulse when feed is healthy

import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { DepthLadderEnvelope, LiquidationClustersEnvelope } from '$lib/contracts/terminalBackend';

export type KpiId =
  | 'oi_flow'
  | 'funding'
  | 'cvd_delta'
  | 'liq_density'
  | 'spread'
  | 'imbalance'
  | 'tape'
  | 'absorb'
  | 'ws_status';

export type KpiTone = 'bull' | 'bear' | 'warn' | 'neutral' | 'live' | 'stale';

export interface KpiInputBundle {
  chart: ChartSeriesPayload | null;
  depth: DepthLadderEnvelope['data'] | null;
  liq: LiquidationClustersEnvelope['data'] | null;
  /** Tape rate (trades/min) and absorption flag — supplied by parent if available. */
  tapeTradesPerMin?: number | null;
  absorbActive?: boolean;
  /** Feed status — 'ws' (live), 'poll' (degraded), 'off' (disconnected). */
  feedStatus?: 'ws' | 'poll' | 'off';
}

export interface KpiSnapshot {
  id: KpiId;
  label: string;
  value: string;
  /** Optional delta line ("+12.3% vs 1h"). */
  delta: string | null;
  /** Tone drives card border + value color. */
  tone: KpiTone;
  /** Mini sparkline data (last N values). */
  sparkline: number[];
  /** Optional — if the card click should toggle a chart pane indicator. */
  togglesIndicator?: 'cvd' | 'oi' | 'funding' | 'liq';
}

// ── Helpers ──────────────────────────────────────────────────────

function lastFinite(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i];
  return null;
}
function relDelta(curr: number, prev: number): number {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return 0;
  return (curr - prev) / Math.abs(prev);
}
function fmtCompactUsd(v: number | null): string {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${v < 0 ? '-' : '+'}$${(Math.abs(v) / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${v < 0 ? '-' : '+'}$${(Math.abs(v) / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${v < 0 ? '-' : '+'}$${(Math.abs(v) / 1e3).toFixed(1)}K`;
  return `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(0)}`;
}
function fmtPct(v: number | null, d = 2): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
}
function fmtBps(v: number | null, d = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(d)} bps`;
}
function fmtPerMin(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k/m`;
  return `${Math.round(v)}/m`;
}
function fmtDeltaLine(curr: number | null, prev: number | null, suffix = ''): string | null {
  if (curr == null || prev == null) return null;
  const d = relDelta(curr, prev);
  if (!Number.isFinite(d)) return null;
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(2)}%${suffix ? ' ' + suffix : ''}`;
}

// ── Tone rules ──────────────────────────────────────────────────

function toneOiFlow(curr: number | null): KpiTone {
  if (curr == null) return 'neutral';
  if (curr > 0.05)  return 'bull';
  if (curr < -0.05) return 'bear';
  if (Math.abs(curr) > 0.02) return 'warn';
  return 'neutral';
}
function toneFunding(curr: number | null): KpiTone {
  if (curr == null) return 'neutral';
  if (Math.abs(curr) > 0.0001) return 'warn';
  return curr > 0 ? 'bull' : 'bear';
}
function toneCvd(curr: number | null): KpiTone {
  if (curr == null) return 'neutral';
  if (curr >  500_000) return 'bull';
  if (curr < -500_000) return 'bear';
  return 'neutral';
}
function toneSpread(curr: number | null): KpiTone {
  if (curr == null) return 'neutral';
  if (curr > 5) return 'warn';
  return 'neutral';
}
function toneImbalance(curr: number | null): KpiTone {
  if (curr == null) return 'neutral';
  if (curr >  0.30) return 'bull';
  if (curr < -0.30) return 'bear';
  return 'neutral';
}

// ── Snapshot builder ────────────────────────────────────────────

const SPARK_N = 32;

function tail<T>(arr: T[] | undefined | null, n: number): T[] {
  if (!arr || arr.length === 0) return [];
  return arr.slice(-n);
}

export function buildKpiSnapshots(b: KpiInputBundle): KpiSnapshot[] {
  const out: KpiSnapshot[] = [];

  // 1. OI Flow — last bar OI Δ% + sparkline
  {
    const bars = b.chart?.oiBars ?? [];
    const series = bars.map((x) => x.value);
    const curr = lastFinite(series);
    const prev = series.length > 1 ? series[series.length - 2] : null;
    out.push({
      id: 'oi_flow',
      label: 'OI Flow',
      value: fmtPct(curr),
      delta: fmtDeltaLine(curr, prev),
      tone: toneOiFlow(curr),
      sparkline: tail(series, SPARK_N),
      togglesIndicator: 'oi',
    });
  }

  // 2. Funding rate
  {
    const bars = b.chart?.fundingBars ?? [];
    const series = bars.map((x) => x.value);
    const curr = lastFinite(series);
    const prev = series.length > 1 ? series[series.length - 2] : null;
    out.push({
      id: 'funding',
      label: 'Funding',
      value: curr == null ? '—' : `${curr >= 0 ? '+' : ''}${curr.toFixed(4)}%`,
      delta: fmtDeltaLine(curr, prev),
      tone: toneFunding(curr),
      sparkline: tail(series, SPARK_N),
      togglesIndicator: 'funding',
    });
  }

  // 3. CVD delta — last bar Δ value (use raw cvdBars or synthesize from candles)
  {
    let series: number[] = [];
    if (b.chart?.cvdBars && b.chart.cvdBars.length > 0) {
      // raw bars are cumulative — use first-difference for "delta"
      const raw = b.chart.cvdBars.map((x) => x.value);
      series = raw.map((v, i) => (i === 0 ? 0 : v - raw[i - 1]));
    } else if (b.chart?.klines) {
      series = b.chart.klines.map((k) => (k.close >= k.open ? 1 : -1) * k.volume);
    }
    const curr = lastFinite(series);
    const prev = series.length > 1 ? series[series.length - 2] : null;
    out.push({
      id: 'cvd_delta',
      label: 'CVD Δ',
      value: fmtCompactUsd(curr),
      delta: fmtDeltaLine(curr, prev),
      tone: toneCvd(curr),
      sparkline: tail(series, SPARK_N),
      togglesIndicator: 'cvd',
    });
  }

  // 4. Liq density — total long+short USD, last bar
  {
    const bars = b.chart?.liqBars ?? [];
    const series = bars.map((x) => x.longUsd + x.shortUsd);
    const curr = lastFinite(series);
    const prev = series.length > 1 ? series[series.length - 2] : null;
    out.push({
      id: 'liq_density',
      label: 'Liq Density',
      value: curr == null ? '—' : fmtCompactUsd(curr).replace(/^[+-]/, ''),
      delta: fmtDeltaLine(curr, prev),
      tone: curr != null && curr > 1_000_000 ? 'warn' : 'neutral',
      sparkline: tail(series, SPARK_N),
      togglesIndicator: 'liq',
    });
  }

  // 5. Spread
  {
    const curr = b.depth?.spreadBps ?? null;
    out.push({
      id: 'spread',
      label: 'Spread',
      value: fmtBps(curr),
      delta: null,
      tone: toneSpread(curr),
      sparkline: [],
    });
  }

  // 6. Imbalance — depth.imbalanceRatio is centered at 1.0, convert to %
  {
    const r = b.depth?.imbalanceRatio ?? null;
    const pct = r == null || !Number.isFinite(r) ? null : r - 1;
    out.push({
      id: 'imbalance',
      label: 'Imbalance',
      value: pct == null ? '—' : `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(0)}%`,
      delta: null,
      tone: toneImbalance(pct),
      sparkline: [],
    });
  }

  // 7. Tape rate
  {
    const t = b.tapeTradesPerMin ?? null;
    out.push({
      id: 'tape',
      label: 'Tape',
      value: fmtPerMin(t),
      delta: null,
      tone: t != null && t > 500 ? 'warn' : 'neutral',
      sparkline: [],
    });
  }

  // 8. Absorption
  {
    out.push({
      id: 'absorb',
      label: 'Absorb',
      value: b.absorbActive ? 'ACTIVE' : '—',
      delta: null,
      tone: b.absorbActive ? 'warn' : 'neutral',
      sparkline: [],
    });
  }

  // 9. WS feed status pulse
  {
    const fs = b.feedStatus ?? 'off';
    out.push({
      id: 'ws_status',
      label: 'Feed',
      value: fs === 'ws' ? 'WS LIVE' : fs === 'poll' ? 'POLL' : 'OFF',
      delta: null,
      tone: fs === 'ws' ? 'live' : fs === 'poll' ? 'warn' : 'stale',
      sparkline: [],
    });
  }

  return out;
}

/**
 * Build a polyline path string for an SVG sparkline.
 * Renders zero-baseline aware so signed series (CVD, OI Δ) read naturally.
 */
export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const n = values.length;
  const step = n > 1 ? width / (n - 1) : 0;
  let mn = Infinity, mx = -Infinity;
  for (const v of values) { if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) return '';
  const pad = 1;
  const range = (mx - mn) || Math.max(1, Math.abs(mx) + Math.abs(mn));
  const cmds: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const y = height - pad - ((values[i] - mn) / range) * (height - pad * 2);
    cmds.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return cmds.join(' ');
}
