import type { ShellSummaryCard, StatusStripItem } from '$lib/terminal/terminalDerived';
import type { TerminalSelectionState } from '$lib/terminal/terminalSelectionState';
import type { TerminalAsset, TerminalVerdict } from '$lib/types/terminal';

export type TerminalCenterPaneId = 'price' | 'oi' | 'funding' | 'flow' | 'onchain' | 'microstructure';
export type TerminalRightBlockId = 'verdict' | 'action' | 'risk' | 'catalyst' | 'sources';
export type TerminalAttentionTone = 'bull' | 'bear' | 'warn' | 'info' | 'neutral';

export interface TerminalRightRailFocusItem {
  id: TerminalRightBlockId;
  label: string;
  value: string;
  reason: string;
  tone: TerminalAttentionTone;
  weight: number;
}

export interface TerminalAttentionModel {
  centerPaneWeights: Record<TerminalCenterPaneId, number>;
  rightBlockWeights: Record<TerminalRightBlockId, number>;
  rightFocusItems: TerminalRightRailFocusItem[];
  panelTabOrder: string[];
  orderedSummaryCards: ShellSummaryCard[];
  orderedStatusItems: StatusStripItem[];
}

interface BuildTerminalAttentionModelInput {
  selection: TerminalSelectionState;
  activeAsset: TerminalAsset | null;
  activeVerdict: TerminalVerdict | null;
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  isScanMode: boolean;
  summaryCards: ShellSummaryCard[];
  statusItems: StatusStripItem[];
}

const RIGHT_BLOCK_LABELS: Record<TerminalRightBlockId, string> = {
  verdict: 'Verdict',
  action: 'Action',
  risk: 'Risk',
  catalyst: 'Catalyst',
  sources: 'Sources',
};

function clampWeight(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function cardPriority(card: ShellSummaryCard, weights: Record<TerminalRightBlockId, number>): number {
  const label = card.label.toLowerCase();
  if (label.includes('verdict') || label.includes('bias')) return weights.verdict;
  if (label.includes('action')) return weights.action;
  if (label.includes('confidence') || label.includes('invalid')) return weights.risk;
  if (label.includes('source') || label.includes('runtime')) return weights.sources;
  return 0.5;
}

function statusPriority(item: StatusStripItem, weights: Record<TerminalRightBlockId, number>): number {
  const label = item.label.toLowerCase();
  if (label.includes('regime') || label.includes('flow')) return Math.max(weights.verdict, weights.catalyst);
  if (label.includes('risk') || label.includes('confidence')) return weights.risk;
  if (label.includes('source') || label.includes('runtime')) return weights.sources;
  if (label.includes('action')) return weights.action;
  return 0.45;
}

function tabOrderFromWeights(weights: Record<TerminalRightBlockId, number>): string[] {
  const tabWeights: Array<{ id: string; weight: number }> = [
    { id: 'summary', weight: Math.max(weights.verdict, weights.action) },
    { id: 'entry', weight: weights.action },
    { id: 'risk', weight: weights.risk },
    { id: 'metrics', weight: Math.max(weights.catalyst, weights.sources * 0.6) },
    { id: 'catalysts', weight: weights.catalyst },
  ];
  return tabWeights.sort((a, b) => b.weight - a.weight).map((tab) => tab.id);
}

function toneForBlock(
  block: TerminalRightBlockId,
  activeVerdict: TerminalVerdict | null,
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL'
): TerminalAttentionTone {
  if (block === 'risk') return 'warn';
  if (block === 'sources') return 'info';
  if (block === 'catalyst') return flowBias === 'LONG' ? 'bull' : flowBias === 'SHORT' ? 'bear' : 'info';
  if (activeVerdict?.direction === 'bullish') return 'bull';
  if (activeVerdict?.direction === 'bearish') return 'bear';
  return 'neutral';
}

function valueForBlock(
  block: TerminalRightBlockId,
  activeAsset: TerminalAsset | null,
  activeVerdict: TerminalVerdict | null,
  flowBias: 'LONG' | 'SHORT' | 'NEUTRAL'
): string {
  if (block === 'verdict') return activeVerdict?.direction?.toUpperCase() ?? activeAsset?.bias?.toUpperCase() ?? 'NEUTRAL';
  if (block === 'action') return activeVerdict?.action || activeAsset?.action || 'Wait';
  if (block === 'risk') return activeVerdict?.confidence ? `${activeVerdict.confidence.toUpperCase()} confidence` : activeAsset?.confidence ?? 'watch';
  if (block === 'catalyst') return flowBias;
  return activeAsset?.sources?.length ? `${activeAsset.sources.length} sources` : 'source check';
}

function reasonForBlock(block: TerminalRightBlockId, selection: TerminalSelectionState): string {
  if (selection.activeSubject.reason && (block === 'risk' || block === 'catalyst')) {
    return selection.activeSubject.reason;
  }
  if (selection.activeSubject.source && block === 'sources') return selection.activeSubject.source;
  if (block === 'verdict') return 'Primary read';
  if (block === 'action') return 'Trade plan';
  if (block === 'risk') return 'Invalidation focus';
  if (block === 'catalyst') return 'Flow context';
  return 'Freshness';
}

export function buildTerminalAttentionModel(input: BuildTerminalAttentionModelInput): TerminalAttentionModel {
  const { selection, activeAsset, activeVerdict, flowBias, isScanMode, summaryCards, statusItems } = input;
  const subjectKind = selection.activeSubject.kind;
  const lowConfidence = activeVerdict?.confidence === 'low' || activeAsset?.confidence === 'low';
  const directional = activeVerdict?.direction === 'bullish' || activeVerdict?.direction === 'bearish';

  const centerPaneWeights: Record<TerminalCenterPaneId, number> = {
    price: 1,
    oi: subjectKind === 'alert' || subjectKind === 'preset' ? 0.74 : 0.58,
    funding: subjectKind === 'alert' ? 0.7 : 0.56,
    flow: subjectKind === 'anomaly' || flowBias !== 'NEUTRAL' ? 0.82 : 0.48,
    onchain: subjectKind === 'anomaly' ? 0.68 : 0.34,
    microstructure: subjectKind === 'alert' || lowConfidence ? 0.72 : 0.54,
  };

  const rightBlockWeights: Record<TerminalRightBlockId, number> = {
    verdict: directional ? 0.86 : 0.68,
    action: activeVerdict?.action ? 0.8 : 0.6,
    risk: lowConfidence || subjectKind === 'alert' || subjectKind === 'anomaly' ? 0.9 : 0.62,
    catalyst: subjectKind === 'anomaly' || flowBias !== 'NEUTRAL' || isScanMode ? 0.84 : 0.5,
    sources: subjectKind === 'preset' || subjectKind === 'compare' || lowConfidence ? 0.72 : 0.46,
  };

  const rankedBlocks = (Object.keys(rightBlockWeights) as TerminalRightBlockId[])
    .map((id) => ({
      id,
      label: RIGHT_BLOCK_LABELS[id],
      value: valueForBlock(id, activeAsset, activeVerdict, flowBias),
      reason: reasonForBlock(id, selection),
      tone: toneForBlock(id, activeVerdict, flowBias),
      weight: clampWeight(rightBlockWeights[id]),
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    centerPaneWeights,
    rightBlockWeights,
    rightFocusItems: rankedBlocks.slice(0, 3),
    panelTabOrder: tabOrderFromWeights(rightBlockWeights),
    orderedSummaryCards: [...summaryCards].sort((a, b) => cardPriority(b, rightBlockWeights) - cardPriority(a, rightBlockWeights)),
    orderedStatusItems: [...statusItems].sort((a, b) => statusPriority(b, rightBlockWeights) - statusPriority(a, rightBlockWeights)),
  };
}
