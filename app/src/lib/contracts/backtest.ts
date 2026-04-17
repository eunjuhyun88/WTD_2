export interface ConditionBlock {
  factorId: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'between';
  value: number;
  value2?: number;
  enabled: boolean;
}

export interface ExitConfig {
  tpPercent: number;
  slPercent: number;
  trailingType: 'none' | 'atr' | 'percent';
  trailingValue: number;
}

export interface RiskConfig {
  positionSizePercent: number;
  maxConcurrentPositions: number;
  maxDailyLossPercent: number;
}

export interface Strategy {
  id: string;
  name: string;
  version: number;
  entryConditions: ConditionBlock[];
  exitConditions: ExitConfig;
  riskConfig: RiskConfig;
  direction: 'long' | 'short' | 'both';
  createdAt: number;
  parentId?: string;
  authorId?: string;
}

export interface TradeRecord {
  entryBar: number;
  exitBar: number;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  pnlPercent: number;
  costPercent: number;
  netPnlPercent: number;
  rMultiple: number;
  exitType: 'TP_HIT' | 'SL_HIT' | 'SL_GAP' | 'TP_GAP' | 'TRAILING' | 'END_OF_DATA';
  holdBars: number;
  slPrice: number;
  tpPrice: number;
}

export interface CycleResult {
  cycleId: string;
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  avgRMultiple: number;
  trades: TradeRecord[];
}

export interface BacktestResult {
  strategyId: string;
  strategyVersion: number;
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  avgRMultiple: number;
  profitFactor: number;
  trades: TradeRecord[];
  cycleBreakdown: CycleResult[];
  inSample: CycleResult | null;
  outOfSample: CycleResult | null;
  overfitRatio: number;
}

export interface BacktestOptions {
  interval?: string;
  warmupBars?: number;
  walkForwardSplit?: number;
}
