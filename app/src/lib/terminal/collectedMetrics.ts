import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { TerminalBoardModel } from '$lib/terminal/terminalBoardModel';

export interface CollectedMetricCell {
  id: string;
  label: string;
  value: string;
  sub?: string;
  tone?: 'bull' | 'bear' | 'neutral' | 'warn';
}

function lastPoint(arr: Array<{ time: number; value: number }> | undefined): number | null {
  if (!arr?.length) return null;
  const v = arr[arr.length - 1]?.value;
  return v != null && Number.isFinite(v) ? v : null;
}

/** Zone B: single strip of numbers — chart L1 snapshot + L4 board context (no duplicate chart header chips). */
export function buildCollectedMetricCells(
  payload: ChartSeriesPayload | null,
  board: TerminalBoardModel,
): CollectedMetricCell[] {
  const out: CollectedMetricCell[] = [];
  const ind = (payload?.indicators ?? {}) as Record<string, unknown>;

  const klines = payload?.klines;
  const lastBar = klines?.length ? klines[klines.length - 1] : null;
  if (lastBar) {
    out.push({
      id: 'ohlc',
      label: 'O · H · L · C',
      value: `${fmtNum(lastBar.open)} · ${fmtNum(lastBar.high)} · ${fmtNum(lastBar.low)} · ${fmtNum(lastBar.close)}`,
      sub: payload?.tf ? `bar · ${payload.tf}` : undefined,
    });
  }

  const rsi = lastPoint(ind.rsi14 as Array<{ time: number; value: number }> | undefined);
  if (rsi != null) {
    out.push({
      id: 'rsi',
      label: 'RSI 14',
      value: rsi.toFixed(1),
      tone: rsi >= 70 ? 'bear' : rsi <= 30 ? 'bull' : 'neutral',
    });
  }

  const macdArr = ind.macd as Array<{ time: number; macd: number; signal: number; hist: number }> | undefined;
  if (macdArr?.length) {
    const m = macdArr[macdArr.length - 1];
    if ([m.macd, m.signal, m.hist].every((x) => Number.isFinite(x))) {
      out.push({
        id: 'macd',
        label: 'MACD',
        value: `${m.macd.toFixed(4)} / ${m.signal.toFixed(4)}`,
        sub: `hist ${m.hist >= 0 ? '+' : ''}${m.hist.toFixed(4)}`,
        tone: m.hist > 0 ? 'bull' : m.hist < 0 ? 'bear' : 'neutral',
      });
    }
  }

  const fund = payload?.fundingBars?.length;
  const lastFund = fund ? payload!.fundingBars![payload!.fundingBars!.length - 1]?.value : null;
  if (lastFund != null && Number.isFinite(lastFund)) {
    out.push({
      id: 'fund',
      label: 'Fund %',
      value: `${lastFund >= 0 ? '+' : ''}${lastFund.toFixed(4)}%`,
      tone: lastFund > 0 ? 'bull' : lastFund < 0 ? 'bear' : 'neutral',
    });
  }

  const oi = payload?.oiBars?.length;
  const lastOi = oi ? payload!.oiBars![payload!.oiBars!.length - 1]?.value : null;
  if (lastOi != null && Number.isFinite(lastOi)) {
    out.push({
      id: 'oid',
      label: 'OI Δ',
      value: `${lastOi >= 0 ? '+' : ''}${lastOi.toFixed(2)}%`,
      tone: lastOi > 0 ? 'bull' : lastOi < 0 ? 'bear' : 'neutral',
    });
  }

  const emaSrc = ind.emaSourceTf as string | undefined;
  if (emaSrc) {
    out.push({
      id: 'emasrc',
      label: 'EMA basis',
      value: emaSrc,
      sub: 'MTF',
    });
  }

  const hint = board.quantRegime.hint;
  out.push({
    id: 'regime',
    label: 'Regime',
    value: board.quantRegime.label,
    sub: hint ? (hint.length > 72 ? `${hint.slice(0, 72)}…` : hint) : undefined,
    tone: board.quantRegime.tone === 'bull' ? 'bull' : board.quantRegime.tone === 'bear' ? 'bear' : board.quantRegime.tone === 'warn' ? 'warn' : 'neutral',
  });

  out.push({
    id: 'flow',
    label: 'Flow vs price',
    value: board.cvdDivergence.label.length > 48 ? `${board.cvdDivergence.label.slice(0, 46)}…` : board.cvdDivergence.label,
    sub: `score ${Math.round(board.cvdDivergence.score * 100)}%`,
    tone:
      board.cvdDivergence.state === 'bullish_divergence'
        ? 'bull'
        : board.cvdDivergence.state === 'bearish_divergence'
          ? 'bear'
          : 'neutral',
  });

  return out;
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (a >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
