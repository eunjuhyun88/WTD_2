import type { TerminalAsset, TerminalEvidence, TerminalVerdict } from '$lib/types/terminal';

export type ShellChromeTone = 'bull' | 'bear' | 'neutral' | 'info' | 'warn';
export type FeedTone = 'bull' | 'bear' | 'warn' | 'info' | 'neutral';

export interface BoardActionRow {
  label: string;
  value: string;
  tone: ShellChromeTone | 'risk';
}

export interface StatusStripItem {
  label: string;
  value: string;
  tone: ShellChromeTone;
}

export interface ShellSummaryCard {
  label: string;
  value: string;
  meta: string;
  tone: ShellChromeTone;
}

export interface DockFeedItem {
  symbol: string;
  message: string;
  time: string;
  tone: FeedTone;
}

export interface HeroMetricTile {
  label: string;
  value: string;
  note: string;
  tone: ShellChromeTone;
}

export interface PatternTransitionAlertLike {
  symbol: string;
  phase: string;
}

export interface MarketEventLike {
  tag?: string;
  level?: string;
  text?: string;
}

export function metricValueFromEvidence(
  evidence: TerminalEvidence[],
  names: string[],
  fallback = '—'
): string {
  const hit = evidence.find((item) => names.includes(item.metric));
  return hit?.value ?? fallback;
}

export function metricNoteFromEvidence(
  evidence: TerminalEvidence[],
  names: string[],
  fallback = ''
): string {
  const hit = evidence.find((item) => names.includes(item.metric));
  return hit?.interpretation ?? fallback;
}

function formatSignedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatLastPrice(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: value >= 1000 ? 2 : 4,
  });
}

export function buildHeroMetricTiles(input: {
  heroAsset: TerminalAsset | null;
  activeEvidence: TerminalEvidence[];
  flowBias: string;
}): HeroMetricTile[] {
  const { heroAsset, activeEvidence, flowBias } = input;
  if (!heroAsset) return [];

  const flowValue = metricValueFromEvidence(activeEvidence, ['CVD', 'FR / Flow'], flowBias);
  const flowTone: ShellChromeTone =
    flowValue.startsWith('+') || flowValue.toLowerCase().includes('buy')
      ? 'bull'
      : flowValue.toLowerCase().includes('sell')
        ? 'bear'
        : 'neutral';

  return [
    {
      label: 'Last Price',
      value: formatLastPrice(heroAsset.lastPrice),
      note: heroAsset.symbol.replace('USDT', ''),
      tone: 'neutral',
    },
    {
      label: 'Vol Ratio',
      value: `${heroAsset.volumeRatio1h.toFixed(1)}x`,
      note: metricNoteFromEvidence(activeEvidence, ['Vol Surge', 'Volume'], 'vs recent bars'),
      tone: heroAsset.volumeRatio1h > 1.5 ? 'bull' : 'neutral',
    },
    {
      label: 'OI Change',
      value: `${heroAsset.oiChangePct1h >= 0 ? '+' : ''}${heroAsset.oiChangePct1h.toFixed(1)}%`,
      note: metricNoteFromEvidence(activeEvidence, ['OI Squeeze', 'OI 1H'], 'positioning'),
      tone: heroAsset.oiChangePct1h >= 0 ? 'bull' : 'bear',
    },
    {
      label: 'Funding',
      value: `${(heroAsset.fundingRate * 100).toFixed(3)}%`,
      note: metricNoteFromEvidence(activeEvidence, ['FR / Flow', 'Funding'], 'perp skew'),
      tone: Math.abs(heroAsset.fundingRate) > 0.01 ? 'warn' : 'neutral',
    },
    {
      label: 'CVD / Flow',
      value: flowValue,
      note: metricNoteFromEvidence(activeEvidence, ['CVD', 'FR / Flow'], 'orderflow'),
      tone: flowTone,
    },
    {
      label: 'Range / Regime',
      value: metricValueFromEvidence(activeEvidence, ['Regime', 'Breakout'], flowBias),
      note: metricNoteFromEvidence(activeEvidence, ['Regime', 'Breakout'], 'context'),
      tone: 'neutral',
    },
  ];
}

export function buildFallbackDepth(input: {
  activeAsset: TerminalAsset | null;
  activeAnalysisData: any;
}): { bids: Array<{ price: number; weight: number }>; asks: Array<{ price: number; weight: number }> } | null {
  const { activeAsset, activeAnalysisData } = input;
  const price = activeAsset?.lastPrice || activeAnalysisData?.price || activeAnalysisData?.snapshot?.last_close || 0;
  if (!price) return null;
  const spread = Math.max(activeAsset?.spreadBps ?? 2.4, 1.2) / 10_000;
  const weights = [0.92, 0.72, 0.58, 0.42, 0.28];
  return {
    bids: weights.map((weight, index) => ({
      price: price * (1 - spread * (index + 1.2)),
      weight,
    })),
    asks: weights.map((weight, index) => ({
      price: price * (1 + spread * (index + 1.2)),
      weight: Math.max(0.18, weight - (activeAsset?.oiChangePct1h ?? 0) / 120),
    })),
  };
}

export function buildFallbackLiqClusters(input: {
  activeAsset: TerminalAsset | null;
  activeAnalysisData: any;
  chartLevels: { stop?: number; target?: number };
}): Array<{ side: 'SELL' | 'BUY'; label: string; price: number; distancePct: number; usd: number }> {
  const { activeAsset, activeAnalysisData, chartLevels } = input;
  const price = activeAsset?.lastPrice || activeAnalysisData?.price || activeAnalysisData?.snapshot?.last_close || 0;
  if (!price) return [];
  const stop = chartLevels.stop ?? price * 0.984;
  const target = chartLevels.target ?? price * 1.018;
  const volumeScale = Math.max(0.6, Math.min(2.8, activeAsset?.volumeRatio1h ?? 1));
  return [
    {
      side: 'SELL',
      label: 'Longs',
      price: stop,
      distancePct: ((stop - price) / price) * 100,
      usd: 18_000_000 * volumeScale,
    },
    {
      side: 'BUY',
      label: 'Shorts',
      price: target,
      distancePct: ((target - price) / price) * 100,
      usd: 14_000_000 * volumeScale,
    },
  ];
}

export function getOrderbookTone(ratio: number | null | undefined): ShellChromeTone {
  if ((ratio ?? 1) >= 1.15) return 'bull';
  if ((ratio ?? 1) <= 0.85) return 'bear';
  return 'neutral';
}

export function getOrderbookBiasLabel(ratio: number | null | undefined): string {
  if ((ratio ?? 1) >= 1.15) return 'Bid Heavy';
  if ((ratio ?? 1) <= 0.85) return 'Ask Heavy';
  return 'Balanced';
}

export function buildBoardActionRows(activeVerdict: TerminalVerdict | null): BoardActionRow[] {
  if (!activeVerdict) return [];
  return [
    {
      label: 'Verdict',
      value: activeVerdict.direction?.toUpperCase?.() ?? 'NEUTRAL',
      tone: activeVerdict.direction === 'bullish' ? 'bull' : activeVerdict.direction === 'bearish' ? 'bear' : 'neutral',
    },
    {
      label: 'Action',
      value: activeVerdict.action || 'Wait for clarity',
      tone: activeVerdict.direction === 'bullish' ? 'bull' : activeVerdict.direction === 'bearish' ? 'bear' : 'info',
    },
    {
      label: 'Invalidation',
      value: activeVerdict.invalidation || '—',
      tone: 'risk',
    },
    {
      label: 'Confidence',
      value: activeVerdict.confidence?.toUpperCase?.() ?? 'LOW',
      tone: activeVerdict.confidence === 'high' ? 'bull' : activeVerdict.confidence === 'medium' ? 'warn' : 'neutral',
    },
  ];
}

export function buildStatusStripItems(input: {
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  isScanMode: boolean;
  runtimeModeLabel: string;
  activeAsset: TerminalAsset | null;
  boardAssetsCount: number;
  activeSymbol: string;
  activePairDisplay: string;
  regime: string;
}): StatusStripItem[] {
  const {
    flowBias,
    isScanMode,
    runtimeModeLabel,
    activeAsset,
    boardAssetsCount,
    activeSymbol,
    activePairDisplay,
    regime,
  } = input;
  const engineMode = activeAsset?.freshnessStatus === 'disconnected' ? 'MARKET ONLY' : 'FULL';
  return [
    { label: 'Mode', value: isScanMode ? 'SCAN' : 'FOCUS', tone: 'info' },
    { label: 'AI', value: runtimeModeLabel, tone: runtimeModeLabel === 'API' ? 'bull' : runtimeModeLabel === 'OLLAMA' ? 'info' : 'neutral' },
    { label: 'Engine', value: engineMode, tone: engineMode === 'FULL' ? 'bull' : 'warn' },
    { label: 'Flow Bias', value: flowBias, tone: flowBias === 'LONG' ? 'bull' : flowBias === 'SHORT' ? 'bear' : 'neutral' },
    { label: 'Regime', value: regime, tone: 'neutral' },
    { label: 'Board', value: `${boardAssetsCount} symbols`, tone: 'neutral' },
    { label: 'Active', value: activeSymbol ? activeSymbol.replace('USDT', '') : activePairDisplay, tone: 'neutral' },
    { label: 'Freshness', value: activeAsset?.freshnessStatus ?? 'delayed', tone: activeAsset?.freshnessStatus === 'live' ? 'bull' : 'neutral' },
  ];
}

export function buildShellSummaryCards(input: {
  activeAsset: TerminalAsset | null;
  activeVerdict: TerminalVerdict | null;
  activeFocusLabel: string;
  timeframeBadgeLabel: string;
  isScanMode: boolean;
  boardAssetsCount: number;
  runtimeModeLabel: string;
  regime: string;
}): ShellSummaryCard[] {
  const {
    activeAsset,
    activeVerdict,
    activeFocusLabel,
    timeframeBadgeLabel,
    isScanMode,
    boardAssetsCount,
    runtimeModeLabel,
    regime,
  } = input;
  const engineMode = activeAsset?.freshnessStatus === 'disconnected' ? 'Market only' : 'Full context';
  const priceChange = activeAsset?.changePct4h ?? 0;
  const directionTone: ShellChromeTone =
    activeVerdict?.direction === 'bullish' ? 'bull' : activeVerdict?.direction === 'bearish' ? 'bear' : 'neutral';
  const priceTone: ShellChromeTone = priceChange > 0 ? 'bull' : priceChange < 0 ? 'bear' : 'neutral';

  return [
    {
      label: 'Focus',
      value: `${activeFocusLabel}/USDT`,
      meta: `${timeframeBadgeLabel} · ${isScanMode ? `${boardAssetsCount} symbols` : 'single board'}`,
      tone: 'info',
    },
    {
      label: 'Last Price',
      value: formatLastPrice(activeAsset?.lastPrice),
      meta: `${formatSignedPct(activeAsset?.changePct4h, 1)} 4H`,
      tone: priceTone,
    },
    {
      label: 'Engine',
      value: engineMode,
      meta: `${runtimeModeLabel} · ${activeAsset?.freshnessStatus ?? 'delayed'}`,
      tone: engineMode === 'Full context' ? 'bull' : 'warn',
    },
    {
      label: 'Primary Read',
      value: regime,
      meta: activeVerdict ? `${activeVerdict.confidence} confidence` : 'Awaiting analysis',
      tone: directionTone,
    },
  ];
}

export function buildTerminalSubtitle(input: {
  activeFocusLabel: string;
  timeframeBadgeLabel: string;
  isScanMode: boolean;
  boardAssetsCount: number;
  regime: string;
  activeAsset: TerminalAsset | null;
}): string {
  const { activeFocusLabel, timeframeBadgeLabel, isScanMode, boardAssetsCount, regime, activeAsset } = input;
  const boardMode = isScanMode ? `${boardAssetsCount} symbols loaded in scan mode` : 'single-asset focus board';
  const engineMode = activeAsset?.freshnessStatus === 'disconnected'
    ? 'market-only fallback active'
    : 'full engine context available';
  return `${activeFocusLabel} is pinned on ${timeframeBadgeLabel}. ${boardMode}. ${regime} regime with ${engineMode}.`;
}

export function buildDockFeedItems(input: {
  activeFocusLabel: string;
  activeAsset: TerminalAsset | null;
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  boardAssetsCount: number;
  timeframeBadgeLabel: string;
  runtimeModeLabel: string;
  patternTransitionAlerts: PatternTransitionAlertLike[];
  statusStripItems: StatusStripItem[];
  marketEvents: MarketEventLike[];
}): DockFeedItem[] {
  const {
    activeFocusLabel,
    activeAsset,
    flowBias,
    boardAssetsCount,
    timeframeBadgeLabel,
    runtimeModeLabel,
    patternTransitionAlerts,
    statusStripItems,
    marketEvents,
  } = input;
  const items: DockFeedItem[] = [
    {
      symbol: activeFocusLabel,
      message: `${activeAsset?.lastPrice ? activeAsset.lastPrice.toLocaleString('en-US', { maximumFractionDigits: activeAsset.lastPrice >= 1000 ? 0 : 2 }) : '—'} · ${formatSignedPct(activeAsset?.changePct4h, 1)} 4H`,
      time: 'now',
      tone: (activeAsset?.changePct4h ?? 0) >= 0 ? 'bull' : 'bear',
    },
    {
      symbol: 'FLOW',
      message: `Bias ${flowBias} · ${boardAssetsCount > 1 ? 'scan board' : 'focus board'}`,
      time: timeframeBadgeLabel,
      tone: flowBias === 'LONG' ? 'bull' : flowBias === 'SHORT' ? 'bear' : 'neutral',
    },
    {
      symbol: 'MODE',
      message: `AI ${runtimeModeLabel} · ${activeAsset?.freshnessStatus ?? 'delayed'}`,
      time: 'live',
      tone: runtimeModeLabel === 'API' ? 'info' : 'neutral',
    },
    {
      symbol: 'TF',
      message: `${timeframeBadgeLabel} ladder active`,
      time: 'ctx',
      tone: 'neutral',
    },
  ];

  if (patternTransitionAlerts.length > 0) {
    items.push({
      symbol: patternTransitionAlerts[0].symbol.replace('USDT', ''),
      message: `Pattern ${patternTransitionAlerts[0].phase}`,
      time: 'alert',
      tone: 'warn',
    });
  }

  if (statusStripItems[0]) {
    items.push({
      symbol: statusStripItems[0].label.toUpperCase(),
      message: String(statusStripItems[0].value),
      time: 'sys',
      tone: statusStripItems[0].tone as FeedTone,
    });
  }

  for (const event of marketEvents.slice(0, 2)) {
    items.push({
      symbol: event.tag ?? 'EVT',
      message: event.text ?? 'market event',
      time: 'evt',
      tone: event.level === 'warning' ? 'warn' : event.level === 'critical' ? 'bear' : 'info',
    });
  }

  return items;
}
