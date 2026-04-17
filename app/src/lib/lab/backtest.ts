import { runMultiCycleBacktest as runEngineMultiCycleBacktest } from '$lib/engine/backtestEngine';
import type { BinanceKline } from '$lib/contracts/marketContext';
import type { BacktestOptions, BacktestResult, Strategy } from '$lib/contracts/backtest';

export type {
  BacktestResult,
  BacktestOptions,
  ConditionBlock,
  CycleResult,
  ExitConfig,
  RiskConfig,
  Strategy,
  TradeRecord,
} from '$lib/contracts/backtest';

export function runMultiCycleBacktest(
  strategy: Strategy,
  cycleKlines: Array<{ cycleId: string; klines: BinanceKline[] }>,
  options: BacktestOptions = {},
): BacktestResult {
  return runEngineMultiCycleBacktest(
    strategy as never,
    cycleKlines as never,
    options as never,
  ) as unknown as BacktestResult;
}
