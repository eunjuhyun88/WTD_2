import type { DataCadence } from '../types'

/** Cadence intervals in milliseconds */
export const CADENCE_MS: Record<DataCadence, number> = {
  tick: 0,
  '1s': 1_000,
  '5s': 5_000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
}

/** Cadence intervals in seconds */
export const CADENCE_SECONDS: Record<DataCadence, number> = {
  tick: 0,
  '1s': 1,
  '5s': 5,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3_600,
  '4h': 14_400,
  '1d': 86_400,
  '1w': 604_800,
}

/** Default cadence for each data type */
export const DATA_CADENCE: Record<string, DataCadence> = {
  klines: '1m',
  funding_rate: '5m',
  open_interest: '5m',
  liquidations: '1m',
  depth: '5s',
  mark_price: '5s',
  taker_ratio: '1m',
  fear_greed: '1h',
  exchange_netflow: '1h',
  sopr: '1d',
  mvrv: '4h',
  nupl: '4h',
  sentiment: '1h',
  btc_dominance: '1h',
  stablecoin_mcap: '1h',
}
