// ─── Cadence Registry ────────────────────────────────────────
// 각 raw 데이터 타입의 폴링 주기 정의.

import { DataCadence } from '../types';
import { KnownRawId } from '$lib/contracts/ids';

/** rawId → 폴링 주기 (ms) */
export const CADENCE: Record<string, number> = {
  // 실시간 (5s)
  [KnownRawId.TICKER_24HR]: DataCadence.TICK,
  [KnownRawId.FUNDING_RATE]: DataCadence.TICK,

  // 빠름 (15s)
  [KnownRawId.DEPTH_L2_20]: DataCadence.FAST,

  // 중간 (1m)
  [KnownRawId.KLINES_5M]: DataCadence.MEDIUM,
  [KnownRawId.OPEN_INTEREST_POINT]: DataCadence.MEDIUM,
  [KnownRawId.TAKER_BUY_SELL_RATIO]: DataCadence.MEDIUM,
  [KnownRawId.FORCE_ORDERS_1H]: DataCadence.MEDIUM,

  // 느림 (5m)
  [KnownRawId.KLINES_1H]: DataCadence.SLOW,
  [KnownRawId.OI_HIST_5M]: DataCadence.SLOW,
  [KnownRawId.OI_HIST_1H]: DataCadence.SLOW,
  [KnownRawId.LONG_SHORT_GLOBAL]: DataCadence.SLOW,
  [KnownRawId.LONG_SHORT_TOP_1H]: DataCadence.SLOW,

  // 매우 느림 (15m)
  [KnownRawId.KLINES_4H]: DataCadence.SLOW2,
  [KnownRawId.KLINES_1D]: DataCadence.SLOW2,
  [KnownRawId.FEAR_GREED_VALUE]: DataCadence.SLOW2,
} as const;

export function getCadence(rawId: string): number {
  return CADENCE[rawId] ?? DataCadence.SLOW;
}
