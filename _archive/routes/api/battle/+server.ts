// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle API: Start a new battle
// POST: Initialize battle with scenario + squad
// GET: List available scenarios (real data + legacy mock)
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { initBattle, createDefaultSquad } from '$lib/engine/v4/battleStateMachine.js';
import type { BattleScenario } from '$lib/engine/v4/types.js';
import { activeBattles } from '$lib/server/battleStore.js';
import { buildScenarioById, listScenarios } from '$lib/server/scenarioBuilder.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { scenarioId, userId, agentName, archetype } = body;

    if (!scenarioId || !userId) {
      return json({ error: 'scenarioId and userId required' }, { status: 400 });
    }

    // Phase 4: Try real data scenario first, fall back to mock
    let scenario: BattleScenario | null = null;
    try {
      scenario = await buildScenarioById(scenarioId);
    } catch (err) {
      console.warn(`[api/battle] Real scenario fetch failed for "${scenarioId}", falling back to mock:`, err);
    }

    // Fallback to legacy mock if real data unavailable
    if (!scenario) {
      scenario = getMockScenario(scenarioId);
    }

    if (!scenario) {
      return json({ error: `Scenario "${scenarioId}" not found` }, { status: 404 });
    }

    // Create squad
    const squad = createDefaultSquad(userId, agentName ?? 'Agent', archetype ?? 'CRUSHER');

    // Initialize battle
    const state = initBattle(scenario, squad);

    // Store in memory
    const battleId = `${userId}-${Date.now()}`;
    activeBattles.set(battleId, state);

    return json({
      success: true,
      battleId,
      state: {
        scenarioId: state.scenarioId,
        tick: state.tick,
        round: state.round,
        squad: state.squad.map(a => ({
          id: a.id,
          name: a.name,
          archetypeId: a.archetypeId,
          squadRole: a.squadRole,
          health: a.record.currentHealth,
        })),
        scenario: {
          label: state.scenario.label,
          tickLimit: state.scenario.tickLimit,
          objectiveThreshold: state.scenario.objectiveThreshold,
        },
      },
    });
  } catch (err: any) {
    console.error('[api/battle] POST error:', err);
    return json({ error: 'Failed to start battle' }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  // Phase 4: Show real data scenarios from catalog + legacy mock
  const realScenarios = listScenarios();

  return json({
    scenarios: [
      // Real data scenarios (Phase 4)
      ...realScenarios.map(s => ({
        id: s.id,
        label: s.label,
        source: 'real' as const,
        cached: s.cached,
      })),
      // Legacy mock scenarios (kept for compatibility)
      { id: 'ftx-crash-2022', label: 'FTX Collapse (mock)', source: 'mock' as const, cached: true },
      { id: 'luna-crash-2022', label: 'LUNA Crash (mock)', source: 'mock' as const, cached: true },
      { id: 'covid-crash-2020', label: 'COVID Crash (mock)', source: 'mock' as const, cached: true },
      { id: 'bull-run-2021', label: 'Bull Run ATH (mock)', source: 'mock' as const, cached: true },
    ],
    activeBattles: activeBattles.size,
  });
};

// ─── Legacy mock scenario generator (kept for fallback) ──────

function getMockScenario(id: string): BattleScenario | null {
  const configs: Record<string, { label: string; startPrice: number; trend: number }> = {
    'ftx-crash-2022': { label: 'FTX Collapse 2022-11-09', startPrice: 21000, trend: -0.003 },
    'luna-crash-2022': { label: 'LUNA Crash 2022-05-09', startPrice: 38000, trend: -0.004 },
    'covid-crash-2020': { label: 'COVID Crash 2020-03-12', startPrice: 8000, trend: -0.005 },
    'bull-run-2021': { label: 'Bull Run ATH 2021-11-10', startPrice: 64000, trend: 0.002 },
  };

  const config = configs[id];
  if (!config) return null;

  const candles = generateCandles(config.startPrice, config.trend, 24);
  const now = Date.now();

  return {
    id,
    label: config.label,
    candles,
    oiHistory: generateOI(24),
    fundingHistory: generateFunding(24),
    lsRatioHistory: generateLS(24),
    startTimestamp: now - 24 * 3600 * 1000,
    endTimestamp: now,
  };
}

function generateCandles(startPrice: number, trend: number, count: number) {
  const candles = [];
  let price = startPrice;
  const baseTime = Math.floor(Date.now() / 1000) - count * 3600;

  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.5) * 0.006;
    const spike = Math.random() > 0.9 ? (Math.random() - 0.5) * 0.015 : 0;
    const change = trend + noise + spike;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = 1000 + Math.random() * 5000;

    candles.push({ time: baseTime + i * 3600, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

function generateOI(count: number) {
  let oi = 5000000000;
  return Array.from({ length: count }, (_, i) => {
    const delta = (Math.random() - 0.5) * 200000000;
    oi += delta;
    return { timestamp: Date.now() - (count - i) * 3600000, openInterest: oi, delta };
  });
}

function generateFunding(count: number) {
  let funding = 0;
  return Array.from({ length: count }, (_, i) => {
    funding += (Math.random() - 0.48) * 0.015;
    funding *= 0.85;
    funding += (Math.random() > 0.85 ? (Math.random() - 0.5) * 0.08 : 0);
    return {
      timestamp: Date.now() - (count - i) * 3600000,
      fundingRate: funding,
    };
  });
}

function generateLS(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const longRatio = 0.4 + Math.random() * 0.2;
    return {
      timestamp: Date.now() - (count - i) * 3600000,
      longRatio,
      shortRatio: 1 - longRatio,
    };
  });
}
