import { computeIndicatorSeries } from '$lib/engine/cogochi/layerEngine';
import { detectSupportResistance } from '$lib/engine/cogochi/supportResistance';
import type { AnalyzeDerived, AnalyzeRawBundle, EngineSettled } from './types';

export function mapAnalyzeResponse(raw: AnalyzeRawBundle, derived: AnalyzeDerived, engineSettled: EngineSettled) {
  const { klines, ticker, fundingRate, markPrice, indexPrice, oiPoint, lsTop } = raw;
  const { currentPrice, oi_notional, short_liq_usd, long_liq_usd, taker_ratio, spreadBps, imbalancePct, depthView, liqClusters } = derived;
  const { deepResult, scoreResult } = engineSettled;

  const annotations = detectSupportResistance(klines, currentPrice);
  const indicators = computeIndicatorSeries(klines);
  const chartKlines = klines.slice(-100).map((k) => ({
    t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
  }));

  return {
    deep: deepResult,
    snapshot: scoreResult?.snapshot ?? null,
    p_win: scoreResult?.p_win ?? null,
    blocks_triggered: scoreResult?.blocks_triggered ?? [],
    ensemble: scoreResult?.ensemble ?? null,
    ensemble_triggered: scoreResult?.ensemble_triggered ?? false,
    chart: chartKlines,
    price: currentPrice,
    change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
    derivatives: {
      funding_rate: fundingRate,
      mark_price: markPrice,
      index_price: indexPrice,
      oi_notional,
      short_liq_usd,
      long_liq_usd,
      oi: oiPoint,
      lsRatio: lsTop,
    },
    microstructure: {
      spreadBps,
      imbalancePct,
      takerRatio: taker_ratio ?? null,
      depth: depthView,
      liqClusters,
      liqTotals: {
        shortUsd: short_liq_usd,
        longUsd: long_liq_usd,
      },
    },
    annotations,
    indicators: {
      bbUpper: indicators.bbUpper?.slice(-100),
      bbMiddle: indicators.bbMiddle?.slice(-100),
      bbLower: indicators.bbLower?.slice(-100),
      ema20: indicators.ema20?.slice(-100),
    },
  };
}
