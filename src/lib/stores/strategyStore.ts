// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Strategy Store
// ═══════════════════════════════════════════════════════════════
//
// Manages trading strategies: condition blocks, exit config, risk config.
// Each strategy has versioned history with backtest results.
// Persisted to localStorage via autoSave pattern.

import { writable, derived } from 'svelte/store';
import { STORAGE_KEYS } from './storageKeys';
import { loadFromStorage, autoSave } from '$lib/utils/storage';
import type { Strategy, ConditionBlock, ExitConfig, RiskConfig, BacktestResult } from '$lib/engine/backtestEngine';

// ─── Re-export engine types for convenience ─────────────────

export type { Strategy, ConditionBlock, ExitConfig, RiskConfig, BacktestResult };

// ─── Strategy Version (immutable snapshot) ──────────────────

export interface StrategyVersion {
  version: number;
  entryConditions: ConditionBlock[];
  exitConditions: ExitConfig;
  riskConfig: RiskConfig;
  timestamp: number;
  // Backtest results (null = not yet tested)
  winRate: number | null;
  sharpe: number | null;
  maxDD: number | null;
  totalPnl: number | null;
  cyclesTested: number;
  label: string;
}

// ─── Available Factor Blocks ────────────────────────────────

export interface FactorBlockDef {
  id: string;
  name: string;
  nameKR: string;
  category: string;
  description: string;
  defaultOperator: ConditionBlock['operator'];
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

export const FACTOR_BLOCKS: FactorBlockDef[] = [
  // Structure
  { id: 'RSI', name: 'RSI(14)', nameKR: 'RSI', category: '구조', description: '과매수/과매도 지표 (0-100)', defaultOperator: 'lt', defaultValue: 30, min: 0, max: 100, step: 1 },
  { id: 'RSI_ZONE', name: 'RSI Zone', nameKR: 'RSI 존', category: '구조', description: 'RSI 원시값 (과매도<30, 과매수>70)', defaultOperator: 'lt', defaultValue: 30, min: 0, max: 100, step: 1 },
  { id: 'EMA_TREND', name: 'EMA Trend', nameKR: 'EMA 추세', category: '구조', description: 'EMA7/25 갭 (양수=상승, 음수=하락, bp)', defaultOperator: 'gt', defaultValue: 0, min: -500, max: 500, step: 10 },
  { id: 'EMA_CROSS', name: 'EMA Cross', nameKR: 'EMA 크로스', category: '구조', description: '1=골든, -1=데드, 0=없음', defaultOperator: 'gt', defaultValue: 0, min: -1, max: 1, step: 1 },
  { id: 'PRICE_VS_SMA200', name: 'Price vs SMA200', nameKR: 'SMA200 대비', category: '구조', description: 'SMA200 대비 가격 위치 (%)', defaultOperator: 'gt', defaultValue: 0, min: -50, max: 100, step: 1 },

  // Momentum
  { id: 'MACD_HISTOGRAM', name: 'MACD Histogram', nameKR: 'MACD 히스토그램', category: '모멘텀', description: 'MACD-Signal 차이 (양수=상승 모멘텀)', defaultOperator: 'gt', defaultValue: 0, min: -1000, max: 1000, step: 10 },
  { id: 'MACD_CROSS', name: 'MACD Cross', nameKR: 'MACD 크로스', category: '모멘텀', description: '1=골든, -1=데드, 0=없음', defaultOperator: 'gt', defaultValue: 0, min: -1, max: 1, step: 1 },

  // Volume/CVD
  { id: 'CVD_SLOPE', name: 'CVD Slope', nameKR: 'CVD 기울기', category: '볼륨', description: '5봉 CVD 변화량 (양수=매수 압력 증가)', defaultOperator: 'gt', defaultValue: 0, min: -10000, max: 10000, step: 100 },
  { id: 'VOLUME_SPIKE', name: 'Volume Spike', nameKR: '거래량 스파이크', category: '볼륨', description: '20봉 평균 대비 현재 거래량 비율', defaultOperator: 'gt', defaultValue: 2, min: 0.5, max: 5, step: 0.1 },
  { id: 'OBV_TREND', name: 'OBV Trend', nameKR: 'OBV 추세', category: '볼륨', description: '10봉 OBV 변화 (양수=매수 우위)', defaultOperator: 'gt', defaultValue: 0, min: -100000, max: 100000, step: 1000 },

  // Volatility
  { id: 'ATR_PERCENT', name: 'ATR %', nameKR: 'ATR 비율', category: '변동성', description: 'ATR/종가 % (높으면 변동성 높음)', defaultOperator: 'lt', defaultValue: 3, min: 0, max: 10, step: 0.1 },
  { id: 'BB_POSITION', name: 'BB Position', nameKR: 'BB 위치', category: '변동성', description: 'BB 내 위치 (0=하단, 100=상단)', defaultOperator: 'lt', defaultValue: 20, min: 0, max: 100, step: 1 },
  { id: 'BB_WIDTH', name: 'BB Width', nameKR: 'BB 너비', category: '변동성', description: 'BB 너비/중심 % (좁으면 스퀴즈)', defaultOperator: 'lt', defaultValue: 5, min: 0, max: 30, step: 0.5 },
  { id: 'BB_SQUEEZE', name: 'BB Squeeze %ile', nameKR: 'BB 스퀴즈', category: '변동성', description: '120봉 기준 BB너비 퍼센타일 (낮으면 스퀴즈)', defaultOperator: 'lt', defaultValue: 20, min: 0, max: 100, step: 1 },

  // Price Action
  { id: 'HIGHER_HIGH', name: 'Higher High', nameKR: '고점 갱신', category: '프라이스액션', description: '1=HH+HL (상승구조), 0=아님', defaultOperator: 'gt', defaultValue: 0, min: 0, max: 1, step: 1 },
  { id: 'LOWER_LOW', name: 'Lower Low', nameKR: '저점 갱신', category: '프라이스액션', description: '1=LL+LH (하락구조), 0=아님', defaultOperator: 'gt', defaultValue: 0, min: 0, max: 1, step: 1 },
];

export const FACTOR_CATEGORIES = [...new Set(FACTOR_BLOCKS.map(f => f.category))];

// ─── Default configs ────────────────────────────────────────

export const DEFAULT_EXIT: ExitConfig = {
  tpPercent: 3,
  slPercent: 1.5,
  trailingType: 'atr',
  trailingValue: 1.5,
};

export const DEFAULT_RISK: RiskConfig = {
  positionSizePercent: 2,
  maxConcurrentPositions: 1,
  maxDailyLossPercent: 5,
};

// ─── Preset strategies ──────────────────────────────────────

export interface PresetStrategy {
  name: string;
  source: string;
  description: string;
  direction: Strategy['direction'];
  entryConditions: ConditionBlock[];
  exitConditions: ExitConfig;
  riskConfig: RiskConfig;
}

export const PRESET_STRATEGIES: PresetStrategy[] = [
  {
    name: 'RSI Mean Reversion',
    source: 'Classic TA',
    description: 'RSI 과매도(50 이하) + EMA 상승추세에서 롱 진입. 범용적 전략.',
    direction: 'long',
    entryConditions: [
      { factorId: 'RSI', operator: 'lt', value: 45, enabled: true },
      { factorId: 'EMA_TREND', operator: 'gt', value: 0, enabled: true },
    ],
    exitConditions: { tpPercent: 3, slPercent: 1.5, trailingType: 'atr', trailingValue: 1.5 },
    riskConfig: { positionSizePercent: 2, maxConcurrentPositions: 1, maxDailyLossPercent: 5 },
  },
  {
    name: 'Momentum + Vol Filter',
    source: 'Quantpedia / SSRN',
    description: 'EMA 골든크로스 + 높은 거래량 + 낮은 변동성에서 진입',
    direction: 'long',
    entryConditions: [
      { factorId: 'EMA_CROSS', operator: 'gt', value: 0, enabled: true },
      { factorId: 'VOLUME_SPIKE', operator: 'gt', value: 1.5, enabled: true },
      { factorId: 'ATR_PERCENT', operator: 'lt', value: 4, enabled: true },
    ],
    exitConditions: { tpPercent: 4, slPercent: 2, trailingType: 'atr', trailingValue: 1.5 },
    riskConfig: { positionSizePercent: 2, maxConcurrentPositions: 1, maxDailyLossPercent: 5 },
  },
  {
    name: 'BB Squeeze Breakout',
    source: 'Bollinger / Keltner',
    description: 'BB 스퀴즈 후 확장 + 상승 모멘텀에서 진입',
    direction: 'both',
    entryConditions: [
      { factorId: 'BB_SQUEEZE', operator: 'lt', value: 15, enabled: true },
      { factorId: 'MACD_HISTOGRAM', operator: 'gt', value: 0, enabled: true },
      { factorId: 'VOLUME_SPIKE', operator: 'gt', value: 1.3, enabled: true },
    ],
    exitConditions: { tpPercent: 5, slPercent: 2, trailingType: 'percent', trailingValue: 2 },
    riskConfig: { positionSizePercent: 1.5, maxConcurrentPositions: 1, maxDailyLossPercent: 4 },
  },
  {
    name: 'Mean Reversion RSI',
    source: 'Classic TA',
    description: 'RSI 극단 과매도 + BB 하단 근처에서 역추세 롱',
    direction: 'long',
    entryConditions: [
      { factorId: 'RSI', operator: 'lt', value: 25, enabled: true },
      { factorId: 'BB_POSITION', operator: 'lt', value: 10, enabled: true },
    ],
    exitConditions: { tpPercent: 2.5, slPercent: 1.5, trailingType: 'none', trailingValue: 0 },
    riskConfig: { positionSizePercent: 2, maxConcurrentPositions: 2, maxDailyLossPercent: 5 },
  },
];

// ─── Store State ────────────────────────────────────────────

export interface StrategyEntry {
  strategy: Strategy;
  versions: StrategyVersion[];
  lastResult: BacktestResult | null;
  selectedCycles: string[];
  lastModified: number;
}

interface StrategyState {
  entries: Record<string, StrategyEntry>;
  activeId: string | null;
}

function loadState(): StrategyState {
  return loadFromStorage<StrategyState>(STORAGE_KEYS.strategies, {
    entries: {},
    activeId: null,
  });
}

export const strategyStore = writable<StrategyState>(loadState());

// localStorage persistence (500ms debounce)
autoSave(strategyStore, STORAGE_KEYS.strategies, undefined, 500);

// ─── Derived selectors ──────────────────────────────────────

export const activeStrategy = derived(strategyStore, $s => {
  if (!$s.activeId || !$s.entries[$s.activeId]) return null;
  return $s.entries[$s.activeId];
});

export const allStrategies = derived(strategyStore, $s =>
  Object.values($s.entries).sort((a, b) => b.lastModified - a.lastModified)
);

export const strategyCount = derived(strategyStore, $s =>
  Object.keys($s.entries).length
);

// ─── Actions ────────────────────────────────────────────────

let _idCounter = Date.now();
function genId(): string {
  return `strat-${_idCounter++}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a new empty strategy */
export function createStrategy(name: string, direction: Strategy['direction'] = 'long'): string {
  const id = genId();
  const now = Date.now();

  const strategy: Strategy = {
    id,
    name,
    version: 1,
    entryConditions: [],
    exitConditions: { ...DEFAULT_EXIT },
    riskConfig: { ...DEFAULT_RISK },
    direction,
    createdAt: now,
  };

  const entry: StrategyEntry = {
    strategy,
    versions: [{
      version: 1,
      entryConditions: [],
      exitConditions: { ...DEFAULT_EXIT },
      riskConfig: { ...DEFAULT_RISK },
      timestamp: now,
      winRate: null,
      sharpe: null,
      maxDD: null,
      totalPnl: null,
      cyclesTested: 0,
      label: `${name} v1`,
    }],
    lastResult: null,
    selectedCycles: ['2020-covid', '2021-bull', '2022-bear', '2023-recovery'],
    lastModified: now,
  };

  strategyStore.update(s => ({
    entries: { ...s.entries, [id]: entry },
    activeId: id,
  }));

  return id;
}

/** Create strategy from a preset */
export function createFromPreset(preset: PresetStrategy): string {
  const id = genId();
  const now = Date.now();

  const strategy: Strategy = {
    id,
    name: preset.name,
    version: 1,
    entryConditions: preset.entryConditions.map(c => ({ ...c })),
    exitConditions: { ...preset.exitConditions },
    riskConfig: { ...preset.riskConfig },
    direction: preset.direction,
    createdAt: now,
  };

  const entry: StrategyEntry = {
    strategy,
    versions: [{
      version: 1,
      entryConditions: strategy.entryConditions.map(c => ({ ...c })),
      exitConditions: { ...strategy.exitConditions },
      riskConfig: { ...strategy.riskConfig },
      timestamp: now,
      winRate: null,
      sharpe: null,
      maxDD: null,
      totalPnl: null,
      cyclesTested: 0,
      label: `${preset.name} v1`,
    }],
    lastResult: null,
    selectedCycles: ['2020-covid', '2021-bull', '2022-bear', '2023-recovery'],
    lastModified: now,
  };

  strategyStore.update(s => ({
    entries: { ...s.entries, [id]: entry },
    activeId: id,
  }));

  return id;
}

/** Fork a strategy (from community share) */
export function forkStrategy(
  sourceStrategy: Strategy,
  authorId?: string,
): string {
  const id = genId();
  const now = Date.now();
  const name = `${sourceStrategy.name} (fork)`;

  const strategy: Strategy = {
    ...sourceStrategy,
    id,
    name,
    version: 1,
    createdAt: now,
    parentId: sourceStrategy.id,
    authorId,
  };

  const entry: StrategyEntry = {
    strategy,
    versions: [{
      version: 1,
      entryConditions: strategy.entryConditions.map(c => ({ ...c })),
      exitConditions: { ...strategy.exitConditions },
      riskConfig: { ...strategy.riskConfig },
      timestamp: now,
      winRate: null,
      sharpe: null,
      maxDD: null,
      totalPnl: null,
      cyclesTested: 0,
      label: `${name} v1`,
    }],
    lastResult: null,
    selectedCycles: ['2020-covid', '2021-bull', '2022-bear', '2023-recovery'],
    lastModified: now,
  };

  strategyStore.update(s => ({
    entries: { ...s.entries, [id]: entry },
    activeId: id,
  }));

  return id;
}

/** Set active strategy */
export function setActiveStrategy(id: string): void {
  strategyStore.update(s => ({ ...s, activeId: id }));
}

/** Add a condition block */
export function addCondition(strategyId: string, condition: ConditionBlock): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    entry.strategy.entryConditions.push({ ...condition });
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Remove a condition block by index */
export function removeCondition(strategyId: string, index: number): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    entry.strategy.entryConditions.splice(index, 1);
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Toggle a condition block on/off */
export function toggleCondition(strategyId: string, index: number): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    const cond = entry.strategy.entryConditions[index];
    if (cond) cond.enabled = !cond.enabled;
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Update a condition block */
export function updateCondition(strategyId: string, index: number, updates: Partial<ConditionBlock>): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    const cond = entry.strategy.entryConditions[index];
    if (!cond) return s;
    Object.assign(cond, updates);
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Update exit config */
export function updateExit(strategyId: string, updates: Partial<ExitConfig>): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    Object.assign(entry.strategy.exitConditions, updates);
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Update risk config */
export function updateRisk(strategyId: string, updates: Partial<RiskConfig>): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    Object.assign(entry.strategy.riskConfig, updates);
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Update selected cycles */
export function updateSelectedCycles(strategyId: string, cycles: string[]): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    entry.selectedCycles = cycles;
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Save backtest result and create new version */
export function saveResult(strategyId: string, result: BacktestResult): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;

    entry.lastResult = result;

    // Bump version
    const nextVersion = entry.versions.length + 1;
    entry.strategy.version = nextVersion;

    entry.versions.push({
      version: nextVersion,
      entryConditions: entry.strategy.entryConditions.map(c => ({ ...c })),
      exitConditions: { ...entry.strategy.exitConditions },
      riskConfig: { ...entry.strategy.riskConfig },
      timestamp: Date.now(),
      winRate: result.winRate,
      sharpe: result.sharpeRatio,
      maxDD: result.maxDrawdownPercent,
      totalPnl: result.totalPnlPercent,
      cyclesTested: result.cycleBreakdown.length,
      label: `${entry.strategy.name} v${nextVersion}`,
    });

    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Revert to a previous version */
export function revertToVersion(strategyId: string, versionNum: number): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;

    const target = entry.versions.find(v => v.version === versionNum);
    if (!target) return s;

    entry.strategy.entryConditions = target.entryConditions.map(c => ({ ...c }));
    entry.strategy.exitConditions = { ...target.exitConditions };
    entry.strategy.riskConfig = { ...target.riskConfig };
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Delete a strategy */
export function deleteStrategy(strategyId: string): void {
  strategyStore.update(s => {
    const { [strategyId]: _, ...rest } = s.entries;
    return {
      entries: rest,
      activeId: s.activeId === strategyId ? null : s.activeId,
    };
  });
}

/** Update strategy direction */
export function updateDirection(strategyId: string, direction: Strategy['direction']): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    entry.strategy.direction = direction;
    entry.lastModified = Date.now();
    return { ...s };
  });
}

/** Rename strategy */
export function renameStrategy(strategyId: string, name: string): void {
  strategyStore.update(s => {
    const entry = s.entries[strategyId];
    if (!entry) return s;
    entry.strategy.name = name;
    entry.lastModified = Date.now();
    return { ...s };
  });
}
