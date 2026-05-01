/** Strategy / backtest API client — W-0369 Phase 3. */

export interface PatternBacktestStats {
  slug: string;
  timeframe: string;
  universe_size: number | null;
  since: string | null;
  n_signals: number;
  win_rate: number | null;
  avg_return_72h: number | null;
  hit_rate: number | null;
  avg_peak_pct: number | null;
  sharpe: number | null;
  apr: number | null;
  equity_curve: number[];
  insufficient_data: boolean;
  cache_hit?: boolean;
  cached_at?: string | null;
}

export interface PatternObjectRow {
  slug: string;
  name: string;
  description: string;
  direction: string;
  timeframe: string;
  tags: string[];
  universe_scope: string;
}

const ENGINE = '/api/engine';

export async function fetchPatternBacktest(slug: string, tf = '1h'): Promise<PatternBacktestStats> {
  const res = await fetch(`${ENGINE}/patterns/${encodeURIComponent(slug)}/backtest?tf=${tf}`);
  if (!res.ok) throw new Error(`backtest fetch failed: ${res.status}`);
  return res.json() as Promise<PatternBacktestStats>;
}

export async function fetchAllPatternObjects(limit = 100): Promise<PatternObjectRow[]> {
  const res = await fetch(`${ENGINE}/patterns/objects?limit=${limit}`);
  if (!res.ok) throw new Error(`pattern objects fetch failed: ${res.status}`);
  return res.json() as Promise<PatternObjectRow[]>;
}

export async function fetchAllPatternStats(
  slugs: string[],
  tf = '1h',
): Promise<Map<string, PatternBacktestStats>> {
  const results = await Promise.allSettled(slugs.map((s) => fetchPatternBacktest(s, tf)));
  const map = new Map<string, PatternBacktestStats>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map.set(slugs[i], r.value);
  });
  return map;
}
