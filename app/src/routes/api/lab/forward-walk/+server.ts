// ═══════════════════════════════════════════════════════════════
// COGOCHI — Forward-Walk Validation API (Phase 5)
// POST: Run forward-walk on a scenario
// GET: List available scenarios for forward-walk
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { autorunLimiter } from '$lib/server/rateLimit';
import { runForwardWalk } from '$lib/server/autoResearch/forwardWalk.js';
import { buildScenarioById, SCENARIO_CATALOG } from '$lib/server/scenarioBuilder.js';
import type { ArchetypeId } from '$lib/contracts/researchV4';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!autorunLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const body = await request.json();
    const {
      scenarioId,
      archetype = 'CRUSHER',
      splitRatio = 0.7,
      hillClimbRounds = 20,
    } = body;

    if (!scenarioId) {
      return json({ error: 'scenarioId required' }, { status: 400 });
    }

    const scenario = await buildScenarioById(scenarioId);
    if (!scenario) {
      return json({ error: `Scenario "${scenarioId}" not found` }, { status: 404 });
    }

    if (scenario.candles.length < 10) {
      return json({ error: 'Scenario too short for forward-walk (need 10+ candles)' }, { status: 400 });
    }

    const logs: string[] = [];
    const result = await runForwardWalk(
      {
        scenario,
        archetype: archetype as ArchetypeId,
        splitRatio,
        hillClimbRounds,
      },
      (msg) => logs.push(msg),
    );

    return json({
      success: true,
      result,
      logs,
    });
  } catch (err: any) {
    console.error('[api/lab/forward-walk] POST error:', err);
    return json({ error: err.message ?? 'Forward-walk failed' }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  return json({
    scenarios: SCENARIO_CATALOG.map(s => ({
      id: s.id,
      label: s.label,
      symbol: s.symbol,
      interval: s.interval,
      candleCount: s.candleCount,
    })),
    defaults: {
      splitRatio: 0.7,
      hillClimbRounds: 20,
      archetype: 'CRUSHER',
    },
  });
};
