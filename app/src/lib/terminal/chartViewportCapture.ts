import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';
export type { ChartViewportSnapshot };

function inRange(t: number, from: number, to: number): boolean {
  return t >= from && t <= to;
}

/** Convert lightweight-charts `Time` to unix seconds (UTC). */
export function chartTimeToUnixSeconds(t: unknown): number {
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  if (typeof t === 'object' && t !== null && 'year' in t && 'month' in t && 'day' in t) {
    const b = t as { year: number; month: number; day: number };
    return Math.floor(Date.UTC(b.year, b.month - 1, b.day) / 1000);
  }
  return 0;
}

/**
 * Slice chart payload to [timeFrom, timeTo] (inclusive, bar open times).
 * Scalar indicator fields (e.g. emaSourceTf) are copied through.
 */
export function slicePayloadToViewport(
  payload: ChartSeriesPayload,
  timeFrom: number,
  timeTo: number,
  anchorTime?: number,
): ChartViewportSnapshot {
  const klines = payload.klines.filter((k) => inRange(k.time, timeFrom, timeTo));
  const raw = payload.indicators as Record<string, unknown>;
  const indicators: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(raw)) {
    if (key === 'macd' && Array.isArray(val)) {
      indicators[key] = (val as Array<{ time: number }>).filter((p) => inRange(p.time, timeFrom, timeTo));
      continue;
    }
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && 'time' in (val[0] as object)) {
      indicators[key] = (val as Array<{ time: number }>).filter((p) => inRange(p.time, timeFrom, timeTo));
      continue;
    }
    indicators[key] = val;
  }

  const MAX_BARS = 400;
  let outKlines = klines;
  let t0 = timeFrom;
  let t1 = timeTo;
  if (outKlines.length > MAX_BARS) {
    outKlines = outKlines.slice(-MAX_BARS);
    t0 = outKlines[0].time;
    t1 = outKlines[outKlines.length - 1].time;
    const reInd: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(indicators)) {
      if (key === 'macd' && Array.isArray(val)) {
        reInd[key] = (val as Array<{ time: number }>).filter((p) => inRange(p.time, t0, t1));
        continue;
      }
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && 'time' in (val[0] as object)) {
        reInd[key] = (val as Array<{ time: number }>).filter((p) => inRange(p.time, t0, t1));
        continue;
      }
      reInd[key] = val;
    }
    return {
      timeFrom: t0,
      timeTo: t1,
      tf: payload.tf,
      barCount: outKlines.length,
      anchorTime,
      klines: outKlines,
      indicators: reInd,
    };
  }

  return {
    timeFrom: t0,
    timeTo: t1,
    tf: payload.tf,
    barCount: outKlines.length,
    anchorTime,
    klines: outKlines,
    indicators,
  };
}
