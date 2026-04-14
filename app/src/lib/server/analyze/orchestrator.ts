import { engine, type DeepPerpData, type KlineBar, type PerpSnapshot } from '$lib/server/engineClient';
import type { EngineSettled } from './types';

export async function runEngineAnalysis(
  symbol: string,
  klines: KlineBar[],
  perpDeep: DeepPerpData,
  perpScore: PerpSnapshot,
): Promise<EngineSettled> {
  const [deepSettled, scoreSettled] = await Promise.allSettled([
    engine.deep(symbol, klines, perpDeep),
    engine.score(symbol, klines, perpScore),
  ]);

  return {
    deepResult: deepSettled.status === 'fulfilled' ? deepSettled.value : null,
    scoreResult: scoreSettled.status === 'fulfilled' ? scoreSettled.value : null,
    deepError: deepSettled.status === 'rejected' ? deepSettled.reason : null,
    scoreError: scoreSettled.status === 'rejected' ? scoreSettled.reason : null,
  };
}
