import { describe, expect, it } from 'vitest';

import {
  buildBaseSignalSnapshotBundle,
  mapExtendedKlines,
  mapForceOrders,
  mapOiHistory,
  toBtcOnchainSnapshot,
  toDepthSnapshot,
  toMempoolSnapshot,
} from './normalize';

describe('scan normalize helpers', () => {
  it('builds shared base snapshot inputs', () => {
    const klines = [
      { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 120 },
    ];

    const bundle = buildBaseSignalSnapshotBundle({
      symbol: 'BTCUSDT',
      timeframe: '4h',
      klines,
      klines1d: klines,
      ticker: {
        symbol: 'BTCUSDT',
        priceChange: '0',
        priceChangePercent: '4.5',
        lastPrice: '12',
        highPrice: '13',
        lowPrice: '9',
        volume: '0',
        quoteVolume: '2500',
      },
      funding: 0.01,
      oiPoint: 100,
      lsTop: 1.2,
      fearGreed: 55,
      oiHistory: [
        { timestamp: 1, sumOpenInterest: 10, sumOpenInterestValue: 100 },
        { timestamp: 2, sumOpenInterest: 11, sumOpenInterestValue: 125 },
      ],
      takerData: [
        { timestamp: 1, buySellRatio: 0.9, buyVol: 10, sellVol: 11 },
        { timestamp: 2, buySellRatio: 1.1, buyVol: 12, sellVol: 10 },
      ],
    });

    expect(bundle.currentPrice).toBe(12);
    expect(bundle.change24h).toBe(4.5);
    expect(bundle.volume24h).toBe(2500);
    expect(bundle.oiChangePct).toBe(25);
    expect(bundle.takerRatio).toBe(1.1);
    expect(bundle.marketContext.derivatives?.funding).toBe(0.01);
    expect(bundle.marketContext.ticker?.high24h).toBe(13);
    expect(bundle.klines1dExt).toEqual([
      { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 120 },
    ]);
  });

  it('maps force orders into snapshot shape', () => {
    expect(
      mapForceOrders([
        { side: 'sell', price: '101.5', origQty: '2.25', time: 10 },
        { side: 'BUY', price: 99, origQty: 1, time: 11 },
      ]),
    ).toEqual([
      { side: 'SELL', price: 101.5, qty: 2.25, time: 10 },
      { side: 'BUY', price: 99, qty: 1, time: 11 },
    ]);
  });

  it('maps extended kline and oi history helpers', () => {
    expect(
      mapExtendedKlines(
        [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, buy: 6 }],
        (kline) => kline.buy,
      ),
    ).toEqual([
      { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, buyVolume: 6 },
    ]);

    expect(
      mapOiHistory([{ timestamp: 1, sumOpenInterest: 10, sumOpenInterestValue: 150 }]),
    ).toEqual([{ timestamp: 1, oi: 150 }]);
  });

  it('maps depth, onchain, and mempool snapshots into signalSnapshot shape', () => {
    expect(
      toDepthSnapshot({ bidVolume: 1200, askVolume: 900, ratio: 1.33, bids: [], asks: [] }),
    ).toEqual({
      bidVolume: 1200,
      askVolume: 900,
      ratio: 1.33,
    });

    expect(
      toBtcOnchainSnapshot({ nTx: 320000, avgTxValue: 1.75 }),
    ).toEqual({
      nTx: 320000,
      avgTxValue: 1.75,
    });

    expect(
      toMempoolSnapshot({ count: 18250, fastestFee: 14 }),
    ).toEqual({
      pending: 18250,
      fastestFee: 14,
    });
  });
});
