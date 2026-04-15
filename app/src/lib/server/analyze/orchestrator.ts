import { engine, type DeepPerpData, type KlineBar, type PerpSnapshot } from '$lib/server/engineClient';
import type { EngineSettled } from './types';

const engineAnalysisInFlight = new Map<string, Promise<EngineSettled>>();

function buildEngineAnalysisKey(
  symbol: string,
  klines: KlineBar[],
  perpDeep: DeepPerpData,
  perpScore: PerpSnapshot,
): string {
  const last = klines[klines.length - 1];
  return [
    symbol,
    klines.length,
    last?.t ?? 0,
    last?.c ?? 0,
    perpDeep.fr ?? '',
    perpDeep.oi_pct ?? '',
    perpDeep.taker_ratio ?? '',
    perpDeep.price_pct ?? '',
    perpDeep.oi_notional ?? '',
    perpScore.funding_rate ?? '',
    perpScore.oi_change_1h ?? '',
    perpScore.long_short_ratio ?? '',
  ].join(':');
}

export async function runEngineAnalysis(
  symbol: string,
  klines: KlineBar[],
  perpDeep: DeepPerpData,
  perpScore: PerpSnapshot,
  options?: { requestId?: string },
): Promise<EngineSettled> {
  const key = buildEngineAnalysisKey(symbol, klines, perpDeep, perpScore);
  const existing = engineAnalysisInFlight.get(key);
  if (existing) return existing;

  const job = (async () => {
    const [deepSettled, scoreSettled] = await Promise.allSettled([
      engine.deep(symbol, klines, perpDeep, options),
      engine.score(symbol, klines, perpScore, options),
    ]);

    return {
      deepResult: deepSettled.status === 'fulfilled' ? deepSettled.value : null,
      scoreResult: scoreSettled.status === 'fulfilled' ? scoreSettled.value : null,
      deepError: deepSettled.status === 'rejected' ? deepSettled.reason : null,
      scoreError: scoreSettled.status === 'rejected' ? scoreSettled.reason : null,
    };
  })().finally(() => {
    engineAnalysisInFlight.delete(key);
  });

  engineAnalysisInFlight.set(key, job);
  return job;
}
