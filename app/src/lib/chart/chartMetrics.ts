// Pure metric computation functions extracted from ChartBoard.svelte
// All functions are stateless — call inside $derived.by() in the component.

import type { DepthLadderEnvelope } from '$lib/contracts/terminalBackend';

export type MetricTone = 'bull' | 'bear' | 'warn' | 'neutral' | 'info';

export interface MetricItem {
  label: string;
  value: string;
  tone?: MetricTone;
}

export interface QuantRegimeSummary {
  bucket: string;
  label: string;
  hint?: string;
  tone: 'bull' | 'bear' | 'neutral' | 'warn';
  oiDeltaPct: number | null;
  fundingPct: number | null;
}

export interface CvdDivergenceSummary {
  state: 'bullish_divergence' | 'bearish_divergence' | 'aligned' | 'unknown';
  score: number;
  label: string;
  hint?: string;
}

/** Clamp imbalance ratio to [0.65, 1.35]. Falls back to OI delta proxy. */
export function computeDepthRatio(
  depthData: DepthLadderEnvelope['data'] | null,
  currentOiDelta: number | null
): number {
  if (depthData?.imbalanceRatio != null && Number.isFinite(depthData.imbalanceRatio)) {
    return Math.max(0.65, Math.min(1.35, depthData.imbalanceRatio));
  }
  const oi = currentOiDelta ?? 0;
  return Math.max(0.65, Math.min(1.35, 1 + oi / 40));
}

/** Compact summary strip for the collapsible context panel. */
export function computeContextSummaryItems(
  depthData: DepthLadderEnvelope['data'] | null,
  bidPct: number,
  askPct: number,
  liqLong: number,
  liqShort: number,
  quantRegime: QuantRegimeSummary | undefined
): MetricItem[] {
  const items: MetricItem[] = [];

  if (depthData?.spreadBps != null) {
    items.push({ label: 'Spread', value: `${depthData.spreadBps.toFixed(1)} bps` });
  }
  items.push({
    label: 'Book',
    value: `${bidPct}/${askPct}`,
    tone: bidPct >= askPct ? 'bull' : 'bear',
  });
  if (liqLong && liqShort) {
    items.push({
      label: 'Liq',
      value: `${liqLong.toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${liqShort.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      tone: 'warn',
    });
  }
  if (quantRegime?.label) {
    const t = quantRegime.tone;
    items.push({
      label: 'Regime',
      value: quantRegime.label,
      tone: t === 'bull' ? 'bull' : t === 'bear' ? 'bear' : t === 'warn' ? 'warn' : 'neutral',
    });
  }
  return items;
}

/** Always-visible derivative metric strip (funding / OI / CVD / regime / book / spread). */
export function computeMetricStripItems(
  quantRegime: QuantRegimeSummary | undefined,
  cvdDivergence: CvdDivergenceSummary | undefined,
  bidPct: number,
  askPct: number,
  depthData: DepthLadderEnvelope['data'] | null
): MetricItem[] {
  const items: MetricItem[] = [];

  if (quantRegime?.fundingPct != null) {
    const fr = quantRegime.fundingPct;
    const sign = fr >= 0 ? '+' : '';
    items.push({
      label: 'Funding',
      value: `${sign}${fr.toFixed(4)}%`,
      tone: fr > 0.05 ? 'bear' : fr < -0.02 ? 'bull' : 'neutral',
    });
  }

  if (quantRegime?.oiDeltaPct != null) {
    const oi = quantRegime.oiDeltaPct;
    const sign = oi >= 0 ? '+' : '';
    items.push({
      label: 'OI Δ',
      value: `${sign}${oi.toFixed(2)}%`,
      tone: oi > 3 ? 'warn' : oi > 0 ? 'bull' : 'bear',
    });
  }

  if (cvdDivergence?.label) {
    items.push({
      label: 'CVD',
      value: cvdDivergence.label,
      tone: cvdDivergence.state === 'bullish_divergence' ? 'bull'
        : cvdDivergence.state === 'bearish_divergence' ? 'bear'
        : 'neutral',
    });
  }

  if (quantRegime?.label) {
    items.push({
      label: 'Regime',
      value: quantRegime.label,
      tone: quantRegime.tone,
    });
  }

  if (bidPct && askPct) {
    items.push({
      label: 'Book',
      value: `${bidPct}/${askPct}`,
      tone: bidPct >= askPct ? 'bull' : 'bear',
    });
  }

  if (depthData?.spreadBps != null) {
    items.push({ label: 'Spread', value: `${depthData.spreadBps.toFixed(1)} bps`, tone: 'neutral' });
  }

  return items;
}
