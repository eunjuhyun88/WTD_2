import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { ChartViewportSnapshot } from '$lib/contracts/terminalPersistence';

export type { ChartViewportSnapshot };

function inRange(time: number, from: number, to: number): boolean {
  return time >= from && time <= to;
}

export function chartTimeToUnixSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'year' in value && 'month' in value && 'day' in value) {
    const businessDay = value as { year: number; month: number; day: number };
    return Math.floor(Date.UTC(businessDay.year, businessDay.month - 1, businessDay.day) / 1000);
  }
  return 0;
}

export function slicePayloadToViewport(
  payload: ChartSeriesPayload,
  timeFrom: number,
  timeTo: number,
  anchorTime?: number,
): ChartViewportSnapshot {
  const klines = payload.klines.filter((bar) => inRange(bar.time, timeFrom, timeTo));
  const rawIndicators = payload.indicators as Record<string, unknown>;
  const indicators: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawIndicators)) {
    if (key === 'macd' && Array.isArray(value)) {
      indicators[key] = (value as Array<{ time: number }>).filter((point) => inRange(point.time, timeFrom, timeTo));
      continue;
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'time' in (value[0] as object)) {
      indicators[key] = (value as Array<{ time: number }>).filter((point) => inRange(point.time, timeFrom, timeTo));
      continue;
    }
    indicators[key] = value;
  }

  const maxBars = 400;
  let slicedKlines = klines;
  let from = timeFrom;
  let to = timeTo;

  if (slicedKlines.length > maxBars) {
    slicedKlines = slicedKlines.slice(-maxBars);
    from = slicedKlines[0].time;
    to = slicedKlines[slicedKlines.length - 1].time;
    const truncatedIndicators: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(indicators)) {
      if (key === 'macd' && Array.isArray(value)) {
        truncatedIndicators[key] = (value as Array<{ time: number }>).filter((point) => inRange(point.time, from, to));
        continue;
      }
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'time' in (value[0] as object)) {
        truncatedIndicators[key] = (value as Array<{ time: number }>).filter((point) => inRange(point.time, from, to));
        continue;
      }
      truncatedIndicators[key] = value;
    }
    return {
      timeFrom: from,
      timeTo: to,
      tf: payload.tf,
      barCount: slicedKlines.length,
      anchorTime,
      klines: slicedKlines,
      indicators: truncatedIndicators,
    };
  }

  return {
    timeFrom: from,
    timeTo: to,
    tf: payload.tf,
    barCount: slicedKlines.length,
    anchorTime,
    klines: slicedKlines,
    indicators,
  };
}
