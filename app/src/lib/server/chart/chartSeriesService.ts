interface KlineBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OIBar {
  time: number;
  value: number;
  color: string;
}

interface FundingBar {
  time: number;
  value: number;
  color: string;
}

export interface ChartPayload {
  symbol: string;
  tf: string;
  klines: KlineBar[];
  oiBars: OIBar[];
  fundingBars: FundingBar[];
  indicators: {
    sma5: Array<{ time: number; value: number }>;
    sma20: Array<{ time: number; value: number }>;
    sma60: Array<{ time: number; value: number }>;
    ema21: Array<{ time: number; value: number }>;
    ema55: Array<{ time: number; value: number }>;
    atr14: Array<{ time: number; value: number }>;
    vwap: Array<{ time: number; value: number }>;
    bbUpper: Array<{ time: number; value: number }>;
    bbLower: Array<{ time: number; value: number }>;
    rsi14: Array<{ time: number; value: number }>;
    macd: Array<{ time: number; macd: number; signal: number; hist: number }>;
    ema21_mtf?: Array<{ time: number; value: number }>;
    ema55_mtf?: Array<{ time: number; value: number }>;
    emaSourceTf?: string;
  };
}

export type ChartSeriesResult = {
  payload: ChartPayload;
  cacheStatus: 'hit' | 'miss';
};

type FetchLike = typeof fetch;

import { alignHtfSeriesToLtfTimes, isStrictlyHigherTf } from '$lib/chart/mtfAlign';

const CHART_CACHE_TTL_MS = 15_000;
const chartCache = new Map<string, { expiresAt: number; payload: ChartPayload }>();

function rollingMeanSeries(values: number[], times: number[], period: number): Array<{ time: number; value: number }> {
  const out: Array<{ time: number; value: number }> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out.push({ time: times[i], value: sum / period });
  }
  return out;
}

function rollingBands(
  values: number[],
  times: number[],
  period: number,
  stdevMultiplier: number,
): { upper: Array<{ time: number; value: number }>; lower: Array<{ time: number; value: number }> } {
  const upper: Array<{ time: number; value: number }> = [];
  const lower: Array<{ time: number; value: number }> = [];
  let sum = 0;
  let sumSquares = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    sum += value;
    sumSquares += value * value;
    if (i >= period) {
      const removed = values[i - period];
      sum -= removed;
      sumSquares -= removed * removed;
    }
    if (i >= period - 1) {
      const mean = sum / period;
      const variance = Math.max(0, sumSquares / period - mean * mean);
      const std = Math.sqrt(variance);
      upper.push({ time: times[i], value: mean + std * stdevMultiplier });
      lower.push({ time: times[i], value: mean - std * stdevMultiplier });
    }
  }
  return { upper, lower };
}

function rollingAverageSeries(values: number[], times: number[], period: number, startIndex: number): Array<{ time: number; value: number }> {
  const out: Array<{ time: number; value: number }> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= startIndex) out.push({ time: times[i], value: sum / period });
  }
  return out;
}

function emaPointsFromKlines(bars: KlineBar[], period: number): Array<{ time: number; value: number }> {
  const k = 2 / (period + 1);
  const out: Array<{ time: number; value: number }> = [];
  let prev: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    const price = bars[i].close;
    if (!Number.isFinite(price)) continue;
    if (prev == null) {
      prev = price;
    } else {
      prev = price * k + prev * (1 - k);
    }
    out.push({ time: bars[i].time, value: prev });
  }
  return out;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(Number.NaN);
      continue;
    }
    if (i === period - 1) {
      out.push(prev);
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h',
  '1d': '1d', '1w': '1w',
};

const OI_PERIOD_MAP: Record<string, string> = {
  '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h', '1d': '1d',
};

function normalizeRequest(args: {
  symbol?: string;
  tf?: string;
  limit?: number;
  emaTf?: string;
}) {
  const symbol = args.symbol?.trim().toUpperCase() || 'BTCUSDT';
  const tf = args.tf?.trim().toLowerCase() || '1h';
  const limit = Math.min(Math.max(args.limit ?? 500, 1), 1000);
  const emaTf = args.emaTf?.trim() ?? '';
  return { symbol, tf, limit, emaTf };
}

export async function getChartSeries(
  args: {
    symbol?: string;
    tf?: string;
    limit?: number;
    emaTf?: string;
    fetchImpl?: FetchLike;
  },
): Promise<ChartSeriesResult> {
  const { symbol, tf, limit, emaTf } = normalizeRequest(args);
  const fetchImpl = args.fetchImpl ?? fetch;
  const interval = INTERVAL_MAP[tf] ?? '1h';
  const cacheKey = `${symbol}:${tf}:${limit}:emaTf=${emaTf || 'chart'}`;
  const now = Date.now();
  const cached = chartCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return {
      payload: cached.payload,
      cacheStatus: 'hit',
    };
  }

  const [klinesResp, fundingResp] = await Promise.all([
    fetchImpl(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`),
    fetchImpl(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=${Math.min(limit, 500)}`),
  ]);

  if (!klinesResp.ok) throw new Error(`Binance futures klines ${klinesResp.status}`);
  const rawKlines = (await klinesResp.json()) as number[][];

  const klines: KlineBar[] = rawKlines.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1] as unknown as string),
    high: parseFloat(k[2] as unknown as string),
    low: parseFloat(k[3] as unknown as string),
    close: parseFloat(k[4] as unknown as string),
    volume: parseFloat(k[5] as unknown as string),
  }));

  let oiBars: OIBar[] = [];
  const oiPeriod = OI_PERIOD_MAP[tf];
  if (oiPeriod) {
    try {
      const oiUrl = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${oiPeriod}&limit=${Math.min(limit, 500)}`;
      const oiResp = await fetchImpl(oiUrl);
      if (oiResp.ok) {
        const rawOI = (await oiResp.json()) as Array<{ timestamp: number; sumOpenInterest: string }>;
        for (let i = 1; i < rawOI.length; i++) {
          const prev = parseFloat(rawOI[i - 1].sumOpenInterest);
          const curr = parseFloat(rawOI[i].sumOpenInterest);
          const changePct = prev > 0 ? (curr - prev) / prev : 0;
          oiBars.push({
            time: Math.floor(rawOI[i].timestamp / 1000),
            value: changePct * 100,
            color: changePct >= 0 ? 'rgba(99,179,237,0.6)' : 'rgba(248,113,113,0.6)',
          });
        }
      }
    } catch {
      // OI is optional for chart rendering.
    }
  }

  let fundingBars: FundingBar[] = [];
  if (fundingResp.ok) {
    const rawFunding = (await fundingResp.json()) as Array<{ fundingTime: number; fundingRate: string }>;
    fundingBars = rawFunding.map((item) => {
      const rate = parseFloat(item.fundingRate);
      return {
        time: Math.floor(item.fundingTime / 1000),
        value: rate * 100,
        color: rate >= 0 ? 'rgba(38,166,154,0.65)' : 'rgba(239,83,80,0.65)',
      };
    });
  }

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const vols = klines.map((k) => k.volume);
  const times = klines.map((k) => k.time);

  const sma5 = rollingMeanSeries(closes, times, 5);
  const sma20 = rollingMeanSeries(closes, times, 20);
  const sma60 = rollingMeanSeries(closes, times, 60);
  const ema21 = emaPointsFromKlines(klines, 21);
  const ema55 = emaPointsFromKlines(klines, 55);

  let ema21_mtf: Array<{ time: number; value: number }> | undefined;
  let ema55_mtf: Array<{ time: number; value: number }> | undefined;
  let emaSourceTf: string | undefined;

  const emaTfOk =
    Boolean(emaTf) &&
    Boolean(INTERVAL_MAP[emaTf]) &&
    isStrictlyHigherTf(tf, emaTf);

  if (emaTfOk) {
    try {
      const htfInterval = INTERVAL_MAP[emaTf];
      const htfResp = await fetchImpl(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${htfInterval}&limit=${limit}`,
      );
      if (htfResp.ok) {
        const rawHtf = (await htfResp.json()) as number[][];
        const htfKlines: KlineBar[] = rawHtf.map((k) => ({
          time: Math.floor(k[0] / 1000),
          open: parseFloat(k[1] as unknown as string),
          high: parseFloat(k[2] as unknown as string),
          low: parseFloat(k[3] as unknown as string),
          close: parseFloat(k[4] as unknown as string),
          volume: parseFloat(k[5] as unknown as string),
        }));
        const htfEma21 = emaPointsFromKlines(htfKlines, 21);
        const htfEma55 = emaPointsFromKlines(htfKlines, 55);
        const baseTimes = klines.map((k) => k.time);
        ema21_mtf = alignHtfSeriesToLtfTimes(baseTimes, htfEma21);
        ema55_mtf = alignHtfSeriesToLtfTimes(baseTimes, htfEma55);
        emaSourceTf = emaTf;
      }
    } catch {
      // MTF EMA is optional for chart rendering.
    }
  }

  const vwap: Array<{ time: number; value: number }> = [];
  let cumTPV = 0;
  let cumVol = 0;
  for (let i = 0; i < klines.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTPV += tp * vols[i];
    cumVol += vols[i];
    if (cumVol > 0) vwap.push({ time: klines[i].time, value: cumTPV / cumVol });
  }

  const { upper: bbUpper, lower: bbLower } = rollingBands(closes, times, 20, 2);
  const trueRanges = klines.map((_, i) => {
    const prevClose = i > 0 ? closes[i - 1] : closes[i];
    return Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose),
    );
  });
  const atr14 = rollingAverageSeries(trueRanges, times, 14, 14);

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const diff = i === 0 ? 0 : closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const avgGains = rollingAverageSeries(gains, times, 14, 14);
  const avgLosses = rollingAverageSeries(losses, times, 14, 14);
  const rsi14 = avgGains.map((gainPoint, index) => {
    const loss = avgLosses[index]?.value ?? 0;
    const rs = loss === 0 ? 100 : gainPoint.value / loss;
    return {
      time: gainPoint.time,
      value: 100 - 100 / (1 + rs),
    };
  });

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = ema12.map((value, i) => (isNaN(value) || isNaN(ema26[i]) ? NaN : value - ema26[i]));
  const macdValid = macdLine.filter((value) => !isNaN(value));
  const signalLine = ema(macdValid, 9);

  const macd: Array<{ time: number; macd: number; signal: number; hist: number }> = [];
  let sigIdx = 0;
  for (let i = 0; i < klines.length; i++) {
    if (isNaN(macdLine[i])) continue;
    const signal = signalLine[sigIdx] ?? NaN;
    if (!isNaN(signal)) {
      macd.push({
        time: klines[i].time,
        macd: macdLine[i],
        signal,
        hist: macdLine[i] - signal,
      });
    }
    sigIdx++;
  }

  const indicators: ChartPayload['indicators'] = {
    sma5,
    sma20,
    sma60,
    ema21,
    ema55,
    atr14,
    vwap,
    bbUpper,
    bbLower,
    rsi14,
    macd,
  };
  if (ema21_mtf && ema55_mtf && emaSourceTf) {
    indicators.ema21_mtf = ema21_mtf;
    indicators.ema55_mtf = ema55_mtf;
    indicators.emaSourceTf = emaSourceTf;
  }

  const payload: ChartPayload = {
    symbol,
    tf,
    klines,
    oiBars,
    fundingBars,
    indicators,
  };

  chartCache.set(cacheKey, {
    expiresAt: now + CHART_CACHE_TTL_MS,
    payload,
  });

  return {
    payload,
    cacheStatus: 'miss',
  };
}
