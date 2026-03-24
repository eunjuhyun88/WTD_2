// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle API: Start a new battle
// POST: Initialize battle with scenario + squad
// GET: List available scenarios
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { initBattle, createDefaultSquad } from '$lib/engine/v4/battleStateMachine.js';
import type { BattleScenario } from '$lib/engine/v4/types.js';
import { activeBattles } from '$lib/server/battleStore.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { scenarioId, userId, agentName, archetype } = body;

    if (!scenarioId || !userId) {
      return json({ error: 'scenarioId and userId required' }, { status: 400 });
    }

    // Load scenario (MVP: generate mock scenario)
    const scenario = getMockScenario(scenarioId);
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
  return json({
    scenarios: [
      { id: 'ftx-crash-2022', label: 'FTX Collapse 2022-11-09', ticks: 24 },
      { id: 'luna-crash-2022', label: 'LUNA Crash 2022-05-09', ticks: 24 },
      { id: 'covid-crash-2020', label: 'COVID Crash 2020-03-12', ticks: 24 },
      { id: 'bull-run-2021', label: 'Bull Run ATH 2021-11-10', ticks: 24 },
    ],
    activeBattles: activeBattles.size,
  });
};

// ─── Mock scenario generator ───────────────────────────────────

function getMockScenario(id: string): BattleScenario | null {
  // Generate synthetic candle data for testing
  // Realistic BTC hourly: avg ±0.3% per candle, trend ±0.1~0.3% bias
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
    // Realistic BTC hourly noise: ±0.3% typical, occasional ±1% spikes
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
  // More realistic funding: clusters of overheat + normal periods
  let funding = 0;
  return Array.from({ length: count }, (_, i) => {
    // Funding tends to trend and occasionally spike
    funding += (Math.random() - 0.48) * 0.015; // slight long bias
    funding *= 0.85; // mean-revert
    funding += (Math.random() > 0.85 ? (Math.random() - 0.5) * 0.08 : 0); // occasional spike
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
