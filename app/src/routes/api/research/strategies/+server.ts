import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface Strategy {
  name: string;
  group: string;
  description: string;
}

const STRATEGIES: Strategy[] = [
  {
    name: 'single',
    group: 'A_parallel',
    description: 'Single LLM baseline'
  },
  {
    name: 'parallel-vote',
    group: 'A_parallel',
    description: 'Majority vote across N LLMs'
  },
  {
    name: 'rank-fusion',
    group: 'A_parallel',
    description: 'Reciprocal rank fusion of N candidates'
  },
  {
    name: 'moe-regime',
    group: 'B_hierarchical',
    description: 'Mixture of experts by market regime'
  },
  {
    name: 'judge-arbitrate',
    group: 'B_hierarchical',
    description: 'Judge LLM arbitrates disagreement'
  },
  {
    name: 'role-pipeline',
    group: 'B_hierarchical',
    description: 'Role-based pipeline (analyzer → validator → reasoner)'
  },
  {
    name: 'tournament',
    group: 'C_iterative',
    description: 'Tournament elimination across rounds'
  },
  {
    name: 'self-refine',
    group: 'C_iterative',
    description: 'Self-refinement via iterative feedback'
  },
  {
    name: 'debate',
    group: 'C_iterative',
    description: 'Debate format with judge resolution'
  },
  {
    name: 'moa',
    group: 'C_iterative',
    description: 'Mixture of agents with dynamic weighting'
  }
];

export const GET: RequestHandler = async () => {
  try {
    return json({
      ok: true,
      strategies: STRATEGIES
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
