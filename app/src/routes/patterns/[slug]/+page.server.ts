import type { PageServerLoad } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { flattenPatternStates } from '$lib/contracts';
import type { PatternStateView } from '$lib/contracts';
import type { PatternStats } from '$lib/types/patternStats';
import type { PnLStats } from '$lib/types/pnlStats';

interface Transition {
  transition_id: string;
  symbol: string;
  pattern_slug: string;
  from_phase: string | null;
  to_phase: string;
  transition_kind: string;
  reason: string;
  transitioned_at: string | null;
  confidence: number;
}

export const load: PageServerLoad = async ({ params, setHeaders }) => {
  const slug = params.slug;

  setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=120' });

  const [stateRes, transRes, statsRes, pnlRes] = await Promise.allSettled([
    engineFetch('/patterns/states', { signal: AbortSignal.timeout(4000) }),
    engineFetch(`/patterns/transitions?slug=${encodeURIComponent(slug)}&limit=30`, {
      signal: AbortSignal.timeout(4000),
    }),
    engineFetch(`/patterns/stats/all?slug=${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(4000),
    }),
    engineFetch(`/patterns/${encodeURIComponent(slug)}/pnl-stats`, {
      signal: AbortSignal.timeout(4000),
    }),
  ]);

  let states: PatternStateView[] = [];
  if (stateRes.status === 'fulfilled' && stateRes.value.ok) {
    const raw = await stateRes.value.json();
    const all = flattenPatternStates(raw);
    states = all.filter((s) => s.patternSlug === slug);
  }

  let transitions: Transition[] = [];
  if (transRes.status === 'fulfilled' && transRes.value.ok) {
    const raw = await transRes.value.json();
    transitions = (raw?.transitions ?? raw ?? []) as Transition[];
  }

  let stats: PatternStats | null = null;
  if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
    const raw = await statsRes.value.json();
    const list = (raw?.stats ?? raw ?? []) as PatternStats[];
    stats = list.find((s) => s.pattern_slug === slug) ?? null;
  }

  let pnlStats: PnLStats | null = null;
  if (pnlRes.status === 'fulfilled' && pnlRes.value.ok) {
    pnlStats = (await pnlRes.value.json()) as PnLStats;
  }

  return { slug, states, transitions, stats, pnlStats };
};
