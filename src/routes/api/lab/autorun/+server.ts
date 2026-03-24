// ═══════════════════════════════════════════════════════════════
// COGOCHI — AutoResearch API
// POST: Start experiment run
// GET: Check progress / get results
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { runAutoResearch, type AutoResearchReport, type ExperimentConfig } from '$lib/server/autoResearch/experimentRunner.js';

// In-memory job store
const _jobs = new Map<string, {
  status: 'running' | 'completed' | 'failed';
  progress: { done: number; total: number };
  bestScore: number;
  result?: AutoResearchReport;
  error?: string;
  startedAt: number;
}>();

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { userId, archetype, objective, experiments } = body;

    if (!userId) {
      return json({ error: 'userId required' }, { status: 400 });
    }

    const jobId = `autorun-${userId}-${Date.now()}`;

    // Initialize job
    _jobs.set(jobId, {
      status: 'running',
      progress: { done: 0, total: experiments ?? 20 },
      bestScore: 0,
      startedAt: Date.now(),
    });

    // Run in background (don't await)
    runExperimentAsync(jobId, {
      agentId: `${userId}-agent`,
      userId,
      archetype: archetype ?? 'CRUSHER',
      scenarios: generateQuickScenarios(),
      totalExperiments: Math.min(experiments ?? 20, 100),
      objective: objective ?? 'balanced',
      baseWeights: { cvdDivergence: 0.5, fundingRate: 0.5, openInterest: 0.5, htfStructure: 0.5 },
    });

    return json({ success: true, jobId });
  } catch (err: any) {
    console.error('[api/lab/autorun] POST error:', err);
    return json({ error: 'Failed to start autorun' }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url }) => {
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    // List all jobs
    const jobs = Array.from(_jobs.entries()).map(([id, j]) => ({
      jobId: id, status: j.status, progress: j.progress, bestScore: j.bestScore,
    }));
    return json({ jobs });
  }

  const job = _jobs.get(jobId);
  if (!job) {
    return json({ error: 'Job not found' }, { status: 404 });
  }

  return json({
    jobId,
    status: job.status,
    progress: job.progress,
    bestScore: job.bestScore,
    elapsedMs: Date.now() - job.startedAt,
    result: job.status === 'completed' ? job.result : undefined,
    error: job.error,
  });
};

// ─── Background runner ─────────────────────────────────────────

async function runExperimentAsync(jobId: string, config: ExperimentConfig) {
  try {
    const result = await runAutoResearch(config, (done, total, best) => {
      const job = _jobs.get(jobId);
      if (job) {
        job.progress = { done, total };
        job.bestScore = best?.compositeScore ?? 0;
      }
    });

    const job = _jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.result = result;
    }
  } catch (err: any) {
    const job = _jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = err?.message;
    }
  }
}

// ─── Quick scenario generator for autorun ──────────────────────

function generateQuickScenarios() {
  const configs = [
    { id: 'ar-crash-1', label: 'Crash Scenario', startPrice: 40000, trend: -0.025 },
    { id: 'ar-bull-1', label: 'Bull Scenario', startPrice: 30000, trend: 0.02 },
    { id: 'ar-range-1', label: 'Range Scenario', startPrice: 35000, trend: 0.001 },
    { id: 'ar-volatile-1', label: 'Volatile Scenario', startPrice: 38000, trend: -0.005 },
  ];

  return configs.map(c => ({
    id: c.id,
    label: c.label,
    candles: generateCandles(c.startPrice, c.trend, 24),
    oiHistory: generateOI(24),
    fundingHistory: generateFunding(24),
    lsRatioHistory: generateLS(24),
    startTimestamp: Date.now() - 24 * 3600000,
    endTimestamp: Date.now(),
  }));
}

function generateCandles(startPrice: number, trend: number, count: number) {
  const candles = [];
  let price = startPrice;
  const baseTime = Math.floor(Date.now() / 1000) - count * 3600;
  for (let i = 0; i < count; i++) {
    const change = trend + (Math.random() - 0.5) * 0.02;
    const open = price;
    const close = price * (1 + change);
    candles.push({
      time: baseTime + i * 3600,
      open, high: Math.max(open, close) * 1.003,
      low: Math.min(open, close) * 0.997,
      close, volume: 1000 + Math.random() * 5000,
    });
    price = close;
  }
  return candles;
}

function generateOI(n: number) {
  let oi = 5e9;
  return Array.from({ length: n }, (_, i) => {
    const d = (Math.random() - 0.5) * 2e8;
    oi += d;
    return { timestamp: Date.now() - (n - i) * 3600000, openInterest: oi, delta: d };
  });
}

function generateFunding(n: number) {
  let f = 0;
  return Array.from({ length: n }, (_, i) => {
    f += (Math.random() - 0.48) * 0.015;
    f *= 0.85;
    if (Math.random() > 0.85) f += (Math.random() - 0.5) * 0.08;
    return { timestamp: Date.now() - (n - i) * 3600000, fundingRate: f };
  });
}

function generateLS(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const l = 0.4 + Math.random() * 0.2;
    return { timestamp: Date.now() - (n - i) * 3600000, longRatio: l, shortRatio: 1 - l };
  });
}
