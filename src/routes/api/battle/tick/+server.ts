// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle API: Run one tick
// POST: Execute one battle tick (7 states) and return result
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { runBattleTick } from '$lib/engine/v4/battleStateMachine.js';
import { activeBattles } from '$lib/server/battleStore.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { battleId } = body;

    if (!battleId) {
      return json({ error: 'battleId required' }, { status: 400 });
    }

    const state = activeBattles.get(battleId);
    if (!state) {
      return json({ error: `Battle "${battleId}" not found` }, { status: 404 });
    }

    // Check if battle already ended
    if (state.matchResult) {
      return json({
        success: true,
        finished: true,
        matchResult: state.matchResult,
        tick: state.tick,
      });
    }

    // Advance tick
    const nextState = {
      ...state,
      tick: state.tick + 1,
      scenario: { ...state.scenario, tick: state.tick + 1 },
    };

    // Run one full tick through 7 states
    const result = await runBattleTick(nextState);

    // Update stored state
    activeBattles.set(battleId, result);

    return json({
      success: true,
      finished: !!result.matchResult,
      tick: result.tick,
      state: result.state,

      // OBSERVE output
      signal: result.signal ? {
        cvdDivergence: result.signal.cvdDivergence,
        fundingLabel: result.signal.fundingLabel,
        oiTrend: result.signal.oiTrend,
        htfStructure: result.signal.htfStructure,
        primaryZone: result.signal.primaryZone,
        modifiers: result.signal.modifiers,
      } : null,

      // DEBATE output
      consensus: result.consensus,
      vetoDecision: result.vetoDecision,

      // DECIDE output
      plan: result.plan ? {
        primary: result.plan.primary,
        secondary: result.plan.secondary,
        power: result.plan.power,
        trainerLabel: result.plan.trainerLabel,
      } : null,

      // RESOLVE output
      outcome: result.outcome,
      matchResult: result.matchResult,
      xpGained: result.xpGained,
      events: result.events.filter(e => e.tick === result.tick),

      // REFLECT output
      reflection: result.reflection,
      memoryCardsCreated: result.memoryCards?.length ?? 0,
      orpoQueued: result.orpoQueued,
      bondDelta: result.bondDelta,

      // Position + PnL
      position: result.position ? {
        direction: result.position.direction,
        entryPrice: result.position.entryPrice,
        status: result.position.status,
        unrealizedPnl: result.position.unrealizedPnl,
        pnlPercent: result.position.pnlPercent,
      } : null,
      positionAction: result.positionAction,
      tradeHistory: {
        totalPnl: result.tradeHistory.totalPnl,
        tradeCount: result.tradeHistory.tradeCount,
        winCount: result.tradeHistory.winCount,
        lossCount: result.tradeHistory.lossCount,
      },

      // Stage status
      stage: {
        zoneControl: result.stage.zoneControlScore,
        capturedZones: result.stage.capturedZones.length,
        verticalBias: result.stage.verticalBias,
      },

      // Squad health
      squad: result.squad.map(a => ({
        id: a.id,
        name: a.name,
        health: a.record.currentHealth,
        xp: a.record.xp,
        streak: a.record.currentStreak,
      })),
    });
  } catch (err: any) {
    console.error('[api/battle/tick] POST error:', err);
    return json({ error: 'Failed to run battle tick' }, { status: 500 });
  }
};
