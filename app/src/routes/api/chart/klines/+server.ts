import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

// Binance kline intervals — spot API supports all; futures OI only supports listed below
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h',
  '1d': '1d', '1w': '1w',
};

// Binance FAPI openInterestHist supported periods
const OI_PERIOD_MAP: Record<string, string> = {
  '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h', '1d': '1d',
};

export const GET: RequestHandler = async ({ url }) => {
  const symbol  = url.searchParams.get('symbol') ?? 'BTCUSDT';
  const tf      = url.searchParams.get('tf') ?? '1h';
  const limit   = Math.min(parseInt(url.searchParams.get('limit') ?? '500'), 1000);

  const interval = INTERVAL_MAP[tf] ?? '1h';

  try {
    // ── Klines ───────────────────────────────────────────────────────────────
    const klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const klinesResp = await fetch(klinesUrl);
    if (!klinesResp.ok) throw new Error(`Binance klines ${klinesResp.status}`);
    const rawKlines = await klinesResp.json() as number[][];

    const klines: KlineBar[] = rawKlines.map(k => ({
      time:   Math.floor(k[0] / 1000),
      open:   parseFloat(k[1] as unknown as string),
      high:   parseFloat(k[2] as unknown as string),
      low:    parseFloat(k[3] as unknown as string),
      close:  parseFloat(k[4] as unknown as string),
      volume: parseFloat(k[5] as unknown as string),
    }));

    // ── OI Δ% (futures only, not all intervals) ───────────────────────────────
    let oiBars: OIBar[] = [];
    const oiPeriod = OI_PERIOD_MAP[tf];
    if (oiPeriod) {
      try {
        const oiUrl = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${oiPeriod}&limit=${Math.min(limit, 500)}`;
        const oiResp = await fetch(oiUrl);
        if (oiResp.ok) {
          const rawOI = await oiResp.json() as Array<{ timestamp: number; sumOpenInterest: string }>;
          for (let i = 1; i < rawOI.length; i++) {
            const prev = parseFloat(rawOI[i - 1].sumOpenInterest);
            const curr = parseFloat(rawOI[i].sumOpenInterest);
            const changePct = prev > 0 ? (curr - prev) / prev : 0;
            oiBars.push({
              time:  Math.floor(rawOI[i].timestamp / 1000),
              value: changePct * 100,
              color: changePct >= 0 ? 'rgba(99,179,237,0.6)' : 'rgba(248,113,113,0.6)',
            });
          }
        }
      } catch {
        // OI unavailable — silently skip
      }
    }

    // ── Indicators ───────────────────────────────────────────────────────────
    const closes = klines.map(k => k.close);
    const highs  = klines.map(k => k.high);
    const lows   = klines.map(k => k.low);
    const vols   = klines.map(k => k.volume);

    function sma(arr: number[], period: number, offset = 0): Array<{ time: number; value: number }> {
      return klines
        .slice(offset)
        .map((k, i) => {
          const absIdx = i + offset;
          if (absIdx < period - 1) return null;
          const sum = arr.slice(absIdx - period + 1, absIdx + 1).reduce((a, b) => a + b, 0);
          return { time: k.time, value: sum / period };
        })
        .filter((x): x is { time: number; value: number } => x !== null);
    }

    // SMA 5/20/60
    const sma5  = sma(closes, 5);
    const sma20 = sma(closes, 20);
    const sma60 = sma(closes, 60);

    // VWAP (rolling daily reset based on session; approximated here as cumulative VWAP from bar 0)
    const vwap: Array<{ time: number; value: number }> = [];
    let cumTPV = 0, cumVol = 0;
    for (let i = 0; i < klines.length; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      cumTPV += tp * vols[i];
      cumVol += vols[i];
      if (cumVol > 0) vwap.push({ time: klines[i].time, value: cumTPV / cumVol });
    }

    // Bollinger Bands (20, 2)
    const bbUpper: Array<{ time: number; value: number }> = [];
    const bbLower: Array<{ time: number; value: number }> = [];
    for (let i = 19; i < closes.length; i++) {
      const slice = closes.slice(i - 19, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / 20;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / 20;
      const std = Math.sqrt(variance);
      bbUpper.push({ time: klines[i].time, value: mean + 2 * std });
      bbLower.push({ time: klines[i].time, value: mean - 2 * std });
    }

    // RSI-14
    const rsi14: Array<{ time: number; value: number }> = [];
    for (let i = 14; i < closes.length; i++) {
      let gains = 0, losses = 0;
      for (let j = i - 13; j <= i; j++) {
        const diff = closes[j] - closes[j - 1];
        if (diff > 0) gains += diff; else losses -= diff;
      }
      const rs = losses === 0 ? 100 : gains / losses;
      rsi14.push({ time: klines[i].time, value: 100 - 100 / (1 + rs) });
    }

    // MACD (12, 26, 9)
    function ema(arr: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const out: number[] = [];
      let prev = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = 0; i < arr.length; i++) {
        if (i < period - 1) { out.push(NaN); continue; }
        if (i === period - 1) { out.push(prev); continue; }
        prev = arr[i] * k + prev * (1 - k);
        out.push(prev);
      }
      return out;
    }
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine: number[] = ema12.map((v, i) => isNaN(v) || isNaN(ema26[i]) ? NaN : v - ema26[i]);
    const macdValid = macdLine.filter(v => !isNaN(v));
    const signalLine = ema(macdValid, 9);

    const macd: Array<{ time: number; macd: number; signal: number; hist: number }> = [];
    let sigIdx = 0;
    for (let i = 0; i < klines.length; i++) {
      if (isNaN(macdLine[i])) continue;
      const sig = signalLine[sigIdx] ?? NaN;
      if (!isNaN(sig)) {
        macd.push({
          time:   klines[i].time,
          macd:   macdLine[i],
          signal: sig,
          hist:   macdLine[i] - sig,
        });
      }
      sigIdx++;
    }

    return json({
      symbol,
      tf,
      klines,
      oiBars,
      indicators: { sma5, sma20, sma60, vwap, bbUpper, bbLower, rsi14, macd },
    });
  } catch (err) {
    return json({ error: String(err) }, { status: 500 });
  }
};
