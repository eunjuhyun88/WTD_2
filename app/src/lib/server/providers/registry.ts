import type { MarketContext } from '$lib/contracts/marketContext';
import { collectMarketSnapshot } from '$lib/server/marketSnapshotService';
import type { ProviderHealth } from './types';

export function getProviderHealth(): ProviderHealth[] {
  return [];
}

export async function assembleMarketContext(
  eventFetch: typeof fetch,
  input: { pair?: unknown; timeframe?: unknown },
): Promise<{
  context: MarketContext;
  health: ProviderHealth[];
  sourcesOk: Record<string, boolean>;
}> {
  const snapshot = await collectMarketSnapshot(eventFetch, {
    pair: input.pair,
    timeframe: input.timeframe,
    persist: false,
  });

  return {
    context: snapshot.context,
    health: getProviderHealth(),
    sourcesOk: {
      binance: snapshot.sources.binance,
      coinalyze: snapshot.sources.derivatives,
      feargreed: snapshot.sources.fearGreed,
      coingecko: snapshot.sources.coingecko,
      defillama: snapshot.sources.defillama,
      yahoo: snapshot.sources.yahoo,
      coinmarketcap: snapshot.sources.coinmarketcap,
      news: snapshot.sources.news,
      cryptoquant: snapshot.sources.cryptoquant,
      etherscan: snapshot.sources.etherscan,
      lunarcrush: snapshot.sources.lunarcrush,
    },
  };
}
