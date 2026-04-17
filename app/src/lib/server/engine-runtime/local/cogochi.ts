import { computeSignalSnapshot } from '$lib/engine/cogochi/layerEngine';
import { signSnapshot } from '$lib/engine/cogochi/hmac';
import type {
  ExtendedMarketData,
  SignalSnapshot,
  ServerMarketContext as MarketContext,
} from '$lib/contracts/cogochi';

export function computeServerSignalSnapshot(
  context: MarketContext,
  symbol: string,
  timeframe: string,
  extendedMarketData: ExtendedMarketData,
  options: { sign?: boolean } = {},
): SignalSnapshot {
  const snapshot = computeSignalSnapshot(
    context as never,
    symbol,
    timeframe,
    extendedMarketData as never,
  ) as unknown as SignalSnapshot;

  if (options.sign) {
    snapshot.hmac = signSnapshot(snapshot as never);
  }

  return snapshot;
}
