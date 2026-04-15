import type { TerminalAsset, TerminalVerdict } from '$lib/types/terminal';
import type { TerminalSelectionState } from '$lib/terminal/terminalSelectionState';

export interface TerminalHeaderBadge {
  label: string;
  value: string;
  tone?: 'bull' | 'bear' | 'warn' | 'info' | 'neutral';
}

export interface TerminalHeaderModel {
  subjectLabel: string;
  sourceLabel: string;
  badges: TerminalHeaderBadge[];
}

function formatSignedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatFunding(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(3)}%`;
}

export function buildTerminalHeaderModel(input: {
  selection: TerminalSelectionState;
  activeAsset: TerminalAsset | null;
  activeVerdict: TerminalVerdict | null;
  regime: string;
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL';
}): TerminalHeaderModel {
  const { selection, activeAsset, activeVerdict, regime, flowBias } = input;
  const subjectLabel = (selection.activeSubject.symbol ?? activeAsset?.symbol ?? 'BTCUSDT').replace('USDT', '');
  const sourceLabel = selection.activeSubject.source ?? selection.origin.replace(/^left_/, '').replace(/_/g, ' ');

  return {
    subjectLabel,
    sourceLabel,
    badges: [
      { label: 'TF', value: selection.timeframe.toUpperCase(), tone: 'info' },
      {
        label: 'Bias',
        value: activeVerdict?.direction?.toUpperCase?.() ?? 'NEUTRAL',
        tone:
          activeVerdict?.direction === 'bullish'
            ? 'bull'
            : activeVerdict?.direction === 'bearish'
              ? 'bear'
              : 'neutral',
      },
      { label: 'Regime', value: regime, tone: 'neutral' },
      {
        label: 'Flow',
        value: flowBias,
        tone: flowBias === 'LONG' ? 'bull' : flowBias === 'SHORT' ? 'bear' : 'neutral',
      },
      { label: '24H', value: formatSignedPct(activeAsset?.changePct4h), tone: activeAsset?.changePct4h != null ? (activeAsset.changePct4h >= 0 ? 'bull' : 'bear') : 'neutral' },
      { label: 'OI', value: formatSignedPct(activeAsset?.oiChangePct1h, 1), tone: activeAsset?.oiChangePct1h != null ? (activeAsset.oiChangePct1h >= 0 ? 'bull' : 'bear') : 'neutral' },
      { label: 'Fund', value: formatFunding(activeAsset?.fundingRate), tone: activeAsset?.fundingRate != null && Math.abs(activeAsset.fundingRate) > 0.01 ? 'warn' : 'neutral' },
      { label: 'Fresh', value: activeAsset?.freshnessStatus?.toUpperCase?.() ?? 'DELAYED', tone: activeAsset?.freshnessStatus === 'live' ? 'bull' : 'neutral' },
    ],
  };
}
