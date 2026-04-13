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

export const GET: RequestHandler = async ({ url }) => {
  const symbol = url.searchParams.get('symbol') ?? 'BTCUSDT';
  const tf = url.searchParams.get('tf') ?? '1h';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '300'), 500);

  const intervalMap: Record<string, string> = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '4h', '1d': '1d',
  };
  const interval = intervalMap[tf] ?? '1h';

  try {
    const klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const klinesResp = await fetch(klinesUrl);
    if (!klinesResp.ok) throw new Error(`Binance klines ${klinesResp.status}`);
    const rawKlines = await klinesResp.json() as number[][];

    const klines: KlineBar[] = rawKlines.map(k => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1] as unknown as string),
      high: parseFloat(k[2] as unknown as string),
      low: parseFloat(k[3] as unknown as string),
      close: parseFloat(k[4] as unknown as string),
      volume: parseFloat(k[5] as unknown as string),
    }));

    let oiBars: OIBar[] = [];
    try {
      const oiUrl = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${interval}&limit=${Math.min(limit, 500)}`;
      const oiResp = await fetch(oiUrl);
      if (oiResp.ok) {
        const rawOI = await oiResp.json() as Array<{ timestamp: number; sumOpenInterest: string }>;
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
      // OI unavailable — silently skip
    }

    function computeSMA(closes: number[], period: number): Array<{ time: number; value: number }> {
      return klines
        .map((k, i) => {
          if (i < period - 1) return null;
          const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          return { time: k.time, value: sum / period };
        })
        .filter((x): x is { time: number; value: number } => x !== null);
    }

    const closes = klines.map(k => k.close);
    const sma5 = computeSMA(closes, 5);
    const sma20 = computeSMA(closes, 20);
    const sma60 = computeSMA(closes, 60);

    function computeRSI(closes: number[], period = 14): Array<{ time: number; value: number }> {
      const result: Array<{ time: number; value: number }> = [];
      for (let i = period; i < closes.length; i++) {
        let gains = 0, losses = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const diff = closes[j] - closes[j - 1];
          if (diff > 0) gains += diff; else losses -= diff;
        }
        const rs = losses === 0 ? 100 : gains / losses;
        const rsi = 100 - 100 / (1 + rs);
        result.push({ time: klines[i].time, value: rsi });
      }
      return result;
    }
    const rsi14 = computeRSI(closes);

    return json({
      symbol,
      tf,
      klines,
      oiBars,
      indicators: { sma5, sma20, sma60, rsi14 },
    });
  } catch (err) {
    return json({ error: String(err) }, { status: 500 });
  }
};
