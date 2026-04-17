import { computeServerSignalSnapshot as computeRuntimeSignalSnapshot } from '$lib/server/engine-runtime/cogochi';
import type {
  ExtendedMarketData,
  SignalSnapshot,
  ServerMarketContext as MarketContext,
} from '$lib/contracts/cogochi';

export type ServerSignalSnapshot = SignalSnapshot;
export type ServerExtendedMarketData = ExtendedMarketData;
export type ServerMarketContext = MarketContext;

export function computeServerSignalSnapshot(
  context: ServerMarketContext,
  symbol: string,
  timeframe: string,
  extendedMarketData: ServerExtendedMarketData,
  options: { sign?: boolean } = {},
): ServerSignalSnapshot {
  return computeRuntimeSignalSnapshot(context, symbol, timeframe, extendedMarketData, options);
}
