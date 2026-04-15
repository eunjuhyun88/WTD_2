import type { TerminalAsset, TerminalEvidence, TerminalVerdict } from '$lib/types/terminal';
import {
  buildShellSummaryCards,
  buildStatusStripItems,
  buildTerminalSubtitle,
  metricValueFromEvidence,
  type ShellSummaryCard,
  type StatusStripItem,
} from '$lib/terminal/terminalDerived';

export interface TerminalSurfaceSummary {
  regime: string;
  statusStripItems: StatusStripItem[];
  shellSummaryCards: ShellSummaryCard[];
  terminalSubtitle: string;
  overviewFacts: SurfaceMetricItem[];
  heroMetricTiles: SurfaceMetricItem[];
}

export interface SurfaceMetricItem {
  label: string;
  value: string;
  tone: 'bull' | 'bear' | 'warn' | 'info' | 'neutral';
}

interface BuildTerminalSurfaceSummaryInput {
  activeAsset: TerminalAsset | null;
  heroAsset?: TerminalAsset | null;
  activeVerdict: TerminalVerdict | null;
  activeEvidence: TerminalEvidence[];
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  isScanMode: boolean;
  runtimeModeLabel: string;
  activeSymbol: string;
  activePairDisplay: string;
  activeFocusLabel: string;
  timeframeBadgeLabel: string;
  boardAssetsCount: number;
}

function formatSignedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatFundingRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(3)}%`;
}

function toneFromSigned(value: number | null | undefined): SurfaceMetricItem['tone'] {
  if (value == null || !Number.isFinite(value)) return 'neutral';
  if (value > 0) return 'bull';
  if (value < 0) return 'bear';
  return 'neutral';
}

export function buildTerminalSurfaceSummary(
  input: BuildTerminalSurfaceSummaryInput
): TerminalSurfaceSummary {
  const {
    activeAsset,
    heroAsset,
    activeVerdict,
    activeEvidence,
    flowBias,
    isScanMode,
    runtimeModeLabel,
    activeSymbol,
    activePairDisplay,
    activeFocusLabel,
    timeframeBadgeLabel,
    boardAssetsCount,
  } = input;

  const featuredAsset = activeAsset ?? heroAsset ?? null;
  const regime = metricValueFromEvidence(activeEvidence, ['Regime', 'Breakout'], flowBias);
  const directionTone: SurfaceMetricItem['tone'] =
    activeVerdict?.direction === 'bullish'
      ? 'bull'
      : activeVerdict?.direction === 'bearish'
        ? 'bear'
        : 'neutral';
  const overviewFacts: SurfaceMetricItem[] = [
    {
      label: 'Focus',
      value: activeFocusLabel,
      tone: 'info',
    },
    {
      label: 'Mode',
      value: isScanMode ? `Scan · ${boardAssetsCount}` : 'Focus',
      tone: 'neutral',
    },
    {
      label: 'Flow',
      value: flowBias,
      tone: flowBias === 'LONG' ? 'bull' : flowBias === 'SHORT' ? 'bear' : 'neutral',
    },
    {
      label: 'Regime',
      value: regime,
      tone: directionTone,
    },
  ];
  const heroMetricTiles: SurfaceMetricItem[] = [
    {
      label: '4H Change',
      value: formatSignedPct(featuredAsset?.changePct4h),
      tone: toneFromSigned(featuredAsset?.changePct4h),
    },
    {
      label: '1H OI',
      value: formatSignedPct(featuredAsset?.oiChangePct1h),
      tone: toneFromSigned(featuredAsset?.oiChangePct1h),
    },
    {
      label: 'Funding',
      value: formatFundingRate(featuredAsset?.fundingRate),
      tone: toneFromSigned(featuredAsset?.fundingRate),
    },
    {
      label: 'Runtime',
      value: runtimeModeLabel,
      tone: runtimeModeLabel === 'API' ? 'bull' : runtimeModeLabel === 'OLLAMA' ? 'info' : 'neutral',
    },
  ];

  return {
    regime,
    statusStripItems: buildStatusStripItems({
      flowBias,
      isScanMode,
      runtimeModeLabel,
      activeAsset,
      boardAssetsCount,
      activeSymbol,
      activePairDisplay,
      regime,
    }),
    shellSummaryCards: buildShellSummaryCards({
      activeAsset,
      activeVerdict,
      activeFocusLabel,
      timeframeBadgeLabel,
      isScanMode,
      boardAssetsCount,
      runtimeModeLabel,
      regime,
    }),
    terminalSubtitle: buildTerminalSubtitle({
      activeFocusLabel,
      timeframeBadgeLabel,
      isScanMode,
      boardAssetsCount,
      regime,
      activeAsset,
    }),
    overviewFacts,
    heroMetricTiles,
  };
}
