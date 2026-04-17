import { computeIndicatorSeries, detectSupportResistance } from '$lib/chart/analysisPrimitives';
import { createAnalyzePayloadMeta, type AnalyzeEngineMode } from './responseEnvelope';
import type { AnalyzeDerived, AnalyzeRawBundle, EngineSettled } from './types';

function formatSignedPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function mapAnalyzeResponse(raw: AnalyzeRawBundle, derived: AnalyzeDerived, engineSettled: EngineSettled) {
  const { klines, ticker, fundingRate, markPrice, indexPrice, oiPoint, lsTop } = raw;
  const { currentPrice, oi_notional, short_liq_usd, long_liq_usd, taker_ratio, spreadBps, imbalancePct, depthView, liqClusters } = derived;
  const { deepResult, scoreResult } = engineSettled;
  const engineMode: AnalyzeEngineMode = deepResult && scoreResult
    ? 'full'
    : deepResult
      ? 'deep_only'
      : 'score_only';
  const degradedReason = engineMode === 'deep_only'
    ? 'score_unavailable'
    : engineMode === 'score_only'
      ? 'deep_unavailable'
      : undefined;
  const upstreamMissing = [
    ...(deepResult ? [] : ['deep']),
    ...(scoreResult ? [] : ['score']),
  ];

  const annotations = detectSupportResistance(klines, currentPrice);
  const indicators = computeIndicatorSeries(klines);
  const chartKlines = klines.slice(-100).map((k) => ({
    t: k.time, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
  }));
  const atrLevels = deepResult?.atr_levels ?? {};
  const entry = Number(atrLevels.entry_long ?? atrLevels.entry ?? (currentPrice ? currentPrice * 0.994 : 0));
  const stop = Number(atrLevels.stop_long ?? atrLevels.stop ?? (currentPrice ? currentPrice * 0.988 : 0));
  const tp1 = Number(atrLevels.tp1_long ?? atrLevels.target ?? (currentPrice ? currentPrice * 1.008 : 0));
  const tp2 = Number(atrLevels.tp2_long ?? (currentPrice ? currentPrice * 1.016 : 0));
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(tp2 - entry);
  const riskReward = risk > 0 ? Math.max(0.1, reward / risk) : 0;
  const confidencePct =
    scoreResult?.p_win != null
      ? scoreResult.p_win * 100
      : Math.abs(deepResult?.total_score ?? 0) >= 50
        ? 72
        : Math.abs(deepResult?.total_score ?? 0) >= 20
          ? 58
          : 44;
  const biasLabel = deepResult?.verdict
    ? String(deepResult.verdict).includes('BEAR')
      ? 'bearish continuation'
      : String(deepResult.verdict).includes('BULL')
        ? 'bullish continuation'
        : 'neutral'
    : scoreResult?.ensemble?.direction?.includes('short')
      ? 'bearish continuation'
      : scoreResult?.ensemble?.direction?.includes('long')
        ? 'bullish continuation'
        : 'neutral';
  const avoid =
    scoreResult?.ensemble?.block_analysis?.disqualifiers?.[0]
    ?? (fundingRate != null && Math.abs(fundingRate) > 0.01 ? 'Crowded funding extremes' : 'Chasing extension');
  const riskTrigger =
    fundingRate != null && oiPoint != null
      ? `Funding ${(fundingRate * 100).toFixed(3)}% with OI ${oiPoint.toFixed(0)}`
      : fundingRate != null
        ? `Funding ${(fundingRate * 100).toFixed(3)}%`
        : 'Funding / CVD flip';
  const invalidation =
    stop > 0
      ? `$${stop.toLocaleString('en-US', { maximumFractionDigits: stop >= 1000 ? 2 : 4 })}`
      : 'Structure break';
  const crowding =
    lsTop != null
      ? `${lsTop.toFixed(2)}x long/short`
      : oiPoint != null
        ? `${formatSignedPct(derived.oi_pct, 1)} OI shift`
        : 'Balanced';
  const nowIso = new Date().toISOString();
  const sources = [
    { id: 'binance', name: 'Binance Spot/Perp', kind: 'market' as const, timestamp: nowIso, detail: 'klines, depth, mark/index price' },
    { id: 'market-derivatives', name: 'Market Derivatives', kind: 'derived' as const, timestamp: nowIso, detail: 'funding, OI, liquidation aggregation' },
    ...(deepResult ? [{ id: 'deep-engine', name: 'Deep Engine', kind: 'model' as const, timestamp: nowIso, detail: `verdict ${deepResult.verdict ?? 'ready'}` }] : []),
    ...(scoreResult ? [{ id: 'score-engine', name: 'Score Engine', kind: 'model' as const, timestamp: nowIso, detail: `p(win) ${scoreResult.p_win != null ? `${(scoreResult.p_win * 100).toFixed(1)}%` : 'n/a'}` }] : []),
  ];

  return {
    deep: deepResult,
    snapshot: scoreResult?.snapshot ?? null,
    p_win: scoreResult?.p_win ?? null,
    blocks_triggered: scoreResult?.blocks_triggered ?? [],
    ensemble: scoreResult?.ensemble ?? null,
    ensemble_triggered: scoreResult?.ensemble_triggered ?? false,
    _fallback: false,
    _degraded: engineMode !== 'full',
    ...(degradedReason ? { _degraded_reason: degradedReason } : {}),
    chart: chartKlines,
    price: currentPrice,
    change24h: ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0,
    entryPlan: {
      entry,
      stop,
      targets: [
        { label: 'TP1', price: tp1 },
        { label: 'TP2', price: tp2 },
      ],
      riskReward,
      validUntil: chartKlines.length > 0 ? new Date(chartKlines[chartKlines.length - 1]!.t + 4 * 60 * 60 * 1000).toISOString() : null,
      confidencePct,
    },
    riskPlan: {
      bias: biasLabel,
      avoid,
      riskTrigger,
      invalidation,
      crowding,
    },
    flowSummary: {
      cvd: scoreResult?.snapshot?.cvd_state ? String(scoreResult.snapshot.cvd_state) : 'balanced',
      oi: oiPoint != null ? `${oiPoint.toFixed(0)} · ${formatSignedPct(derived.oi_pct, 1)}` : 'n/a',
      funding: fundingRate != null ? `${(fundingRate * 100).toFixed(3)}%` : 'n/a',
      takerBuyRatio: taker_ratio ?? null,
    },
    sources,
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
    meta: createAnalyzePayloadMeta({
      engineMode,
      degradedReason,
      upstreamMissing,
    }),
  };
}
