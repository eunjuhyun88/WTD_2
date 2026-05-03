import type { PageServerLoad } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { adaptPatternCandidates, flattenPatternStates } from '$lib/contracts';
import type { PatternCandidateView, PatternStateView } from '$lib/contracts';
import type { PatternStats } from '$lib/types/patternStats';

interface Transition {
  transition_id: string;
  symbol: string;
  pattern_slug: string;
  from_phase: string | null;
  to_phase: string;
  confidence: number | null;
  transitioned_at: string | null;
}

export const load: PageServerLoad = async ({ setHeaders }) => {
  setHeaders({ 'cache-control': 'public, max-age=30, stale-while-revalidate=60' });

  const [candRes, stateRes, statsRes, transRes] = await Promise.allSettled([
    engineFetch('/patterns/candidates', { signal: AbortSignal.timeout(4000) }),
    engineFetch('/patterns/states', { signal: AbortSignal.timeout(4000) }),
    engineFetch('/patterns/stats/all', { signal: AbortSignal.timeout(4000) }),
    engineFetch('/patterns/transitions?limit=30', { signal: AbortSignal.timeout(4000) }),
  ]);

  let candidates: PatternCandidateView[] = [];
  if (candRes.status === 'fulfilled' && candRes.value.ok) {
    const raw = await candRes.value.json();
    candidates = adaptPatternCandidates(raw);
  }

  let states: PatternStateView[] = [];
  if (stateRes.status === 'fulfilled' && stateRes.value.ok) {
    const raw = await stateRes.value.json();
    states = flattenPatternStates(raw);
  }

  let stats: PatternStats[] = [];
  if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
    const raw = await statsRes.value.json();
    stats = (raw?.stats ?? raw ?? []) as PatternStats[];
  }

  let transitions: Transition[] = [];
  let lastScan: string | null = null;
  if (transRes.status === 'fulfilled' && transRes.value.ok) {
    const raw = await transRes.value.json();
    transitions = (raw?.transitions ?? raw ?? []) as Transition[];
    lastScan = transitions[0]?.transitioned_at ?? null;
  }

  return { candidates, states, stats, transitions, lastScan };
};
