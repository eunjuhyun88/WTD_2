// ═══════════════════════════════════════════════════════════════
// COGOCHI — L0 Working Memory (always loaded, no DB search)
// Builds the L0Context struct from current MarketFrame + StageFrame
// Token budget: ~200 tokens
// Design: Cogochi_MemorySystemDesign_20260322 § 1.L0
// ═══════════════════════════════════════════════════════════════

import type {
  L0Context,
  MarketFrame,
  StageFrame,
  SignalSnapshot,
  OwnedAgent,
} from '$lib/engine/v4/types.js';

export function buildL0Context(
  market: MarketFrame,
  stage: StageFrame,
  signal: SignalSnapshot,
  agent: OwnedAgent,
): L0Context {
  return {
    // Market
    regime: market.regime,
    price: market.price,
    priceDelta: market.priceDelta,

    // CVD
    cvdState: signal.cvdDivergence
      ? 'DIVERGING'
      : signal.cvd1h > 0
        ? 'BULLISH'
        : signal.cvd1h < 0
          ? 'BEARISH'
          : 'NEUTRAL',

    // Funding
    fundingRate: signal.fundingRate,
    fundingLabel: signal.fundingLabel,

    // OI
    oiChange1h: signal.oiChange1h,

    // Zone
    primaryZone: signal.primaryZone,
    modifiers: signal.modifiers,

    // Stage
    verticalBias: stage.verticalBias,
    predatorNear: stage.predatorZones.length > 0,
    zoneControl: stage.zoneControlScore,

    // Agent self
    health: agent.record.currentHealth,
    bond: agent.bond,
    stage: agent.stage,
  };
}

// Format L0 as compact text for LLM context injection (~200 tokens)
export function l0ContextToText(ctx: L0Context): string {
  return `[L0] regime=${ctx.regime} price=${ctx.price} delta=${(ctx.priceDelta * 100).toFixed(2)}% cvd=${ctx.cvdState} funding=${ctx.fundingRate.toFixed(4)}(${ctx.fundingLabel}) oi_1h=${(ctx.oiChange1h * 100).toFixed(1)}% zone=${ctx.primaryZone} mods=[${ctx.modifiers.join(',')}] bias=${ctx.verticalBias.toFixed(2)} predator=${ctx.predatorNear} zoneCtrl=${ctx.zoneControl.toFixed(2)} hp=${ctx.health.toFixed(2)} bond=${ctx.bond} stage=${ctx.stage}`;
}
