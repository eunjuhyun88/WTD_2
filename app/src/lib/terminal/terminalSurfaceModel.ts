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
}

interface BuildTerminalSurfaceSummaryInput {
  activeAsset: TerminalAsset | null;
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

export function buildTerminalSurfaceSummary(
  input: BuildTerminalSurfaceSummaryInput
): TerminalSurfaceSummary {
  const {
    activeAsset,
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

  const regime = metricValueFromEvidence(activeEvidence, ['Regime', 'Breakout'], flowBias);

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
  };
}
