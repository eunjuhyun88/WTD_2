export type TerminalSubjectKind = 'symbol' | 'alert' | 'anomaly' | 'preset' | 'compare';
export type TerminalSelectionOrigin =
  | 'left_watchlist'
  | 'left_alerts'
  | 'left_anomalies'
  | 'left_presets'
  | 'pattern_engine'
  | 'prompt'
  | 'system_default';

export interface TerminalSelectionState {
  activeSubject: {
    kind: TerminalSubjectKind;
    symbol?: string;
    symbols?: string[];
    source?: string;
    reason?: string;
    timestamp?: number;
  };
  timeframe: string;
  origin: TerminalSelectionOrigin;
}

interface CreateTerminalSelectionInput {
  kind: TerminalSubjectKind;
  timeframe: string;
  origin: TerminalSelectionOrigin;
  symbol?: string;
  symbols?: string[];
  source?: string;
  reason?: string;
  timestamp?: number;
}

export function createTerminalSelection(input: CreateTerminalSelectionInput): TerminalSelectionState {
  const {
    kind,
    timeframe,
    origin,
    symbol,
    symbols,
    source,
    reason,
    timestamp = Date.now(),
  } = input;

  return {
    activeSubject: {
      kind,
      symbol,
      symbols,
      source,
      reason,
      timestamp,
    },
    timeframe,
    origin,
  };
}

export function createSymbolSelection(
  symbol: string,
  timeframe: string,
  origin: TerminalSelectionOrigin,
  reason?: string
): TerminalSelectionState {
  return createTerminalSelection({
    kind: 'symbol',
    symbol,
    timeframe,
    origin,
    reason,
  });
}
