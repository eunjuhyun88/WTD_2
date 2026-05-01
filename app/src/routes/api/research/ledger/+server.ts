import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface LedgerEntry {
  cycleId: number;
  status: string;
  strategy: string;
  candidatesProposed: number;
  candidatesAfterL2: number;
  dsrDelta: number;
  costUsd: number;
  latencySec: number;
  commitSha: string;
  createdAt: string;
}

export const GET: RequestHandler = async ({ url }) => {
  const limit = parseInt(url.searchParams.get('limit') ?? '20');
  const offset = parseInt(url.searchParams.get('offset') ?? '0');

  try {
    // TODO: Fetch from Supabase autoresearch_ledger table
    // For now, generate mock data
    const entries: LedgerEntry[] = Array(limit)
      .fill(0)
      .map((_, i) => ({
        cycleId: offset + i + 1,
        status: Math.random() > 0.7 ? 'committed' : Math.random() > 0.4 ? 'rejected' : 'pending',
        strategy: ['single', 'parallel-vote', 'rank-fusion', 'moe-regime', 'judge-arbitrate'][
          Math.floor(Math.random() * 5)
        ],
        candidatesProposed: Math.floor(Math.random() * 500) + 100,
        candidatesAfterL2: Math.floor(Math.random() * 300) + 50,
        dsrDelta: (Math.random() - 0.5) * 2,
        costUsd: Math.random() * 150 + 30,
        latencySec: Math.random() * 45 + 10,
        commitSha: Math.random().toString(16).substring(2, 42),
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString()
      }));

    return json({
      ok: true,
      entries: entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
};
