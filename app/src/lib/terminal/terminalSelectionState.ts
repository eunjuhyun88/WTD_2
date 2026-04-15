export type TerminalSubjectKind = 'symbol' | 'alert' | 'anomaly' | 'preset' | 'compare';

export interface TerminalSelectionSubject {
  kind: TerminalSubjectKind;
  symbol?: string;
  symbols?: string[];
  source?: string;
  reason?: string;
  timestamp?: number;
}

export interface TerminalSelectionState {
  activeSubject: TerminalSelectionSubject;
  timeframe: string;
}

export type TerminalSelectionPayload = TerminalSelectionSubject & {
  timeframe?: string;
};

export function normalizeTerminalSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase().replace('/', '');
  if (!normalized) return 'BTCUSDT';
  return normalized.endsWith('USDT') ? normalized : `${normalized}USDT`;
}

export function createTerminalSelectionState(timeframe = '4h', symbol = 'BTCUSDT'): TerminalSelectionState {
  return {
    activeSubject: {
      kind: 'symbol',
      symbol: normalizeTerminalSymbol(symbol),
      source: 'initial',
      reason: 'default-selection',
      timestamp: Date.now(),
    },
    timeframe,
  };
}

export function applySelectionPayload(
  current: TerminalSelectionState,
  payload: TerminalSelectionPayload,
): TerminalSelectionState {
  const symbol = payload.symbol ? normalizeTerminalSymbol(payload.symbol) : undefined;
  const symbols = payload.symbols?.map(normalizeTerminalSymbol);

  return {
    timeframe: payload.timeframe ?? current.timeframe,
    activeSubject: {
      kind: payload.kind,
      ...(symbol ? { symbol } : {}),
      ...(symbols && symbols.length > 0 ? { symbols } : {}),
      ...(payload.source ? { source: payload.source } : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
      timestamp: payload.timestamp ?? Date.now(),
    },
  };
}
