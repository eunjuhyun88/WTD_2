import { describe, expect, it } from 'vitest';
import {
  evaluateShadowExecutionGate,
  evaluateShadowExecutionGovernanceWithMode,
} from './shadowExecutionGate';
import type { ShadowAgentDecision } from '$lib/server/intelShadowAgent';
import type { IntelPolicyOutput } from '$lib/server/intelPolicyRuntime';

function sampleShadow(partial?: Partial<ShadowAgentDecision>): ShadowAgentDecision {
  return {
    mode: 'shadow',
    generatedAt: Date.now(),
    source: 'fallback',
    fallbackReason: 'provider_unavailable',
    provider: null,
    model: null,
    proposal: {
      bias: 'long',
      confidence: 70,
      horizonMin: 60,
      rationale: ['x'],
      risks: ['y'],
      nowWhat: 'z',
    },
    enforced: {
      bias: 'long',
      wouldTrade: true,
      shouldExecute: true,
      reasons: ['passes_guardrails'],
    },
    ...partial,
  };
}

function samplePolicy(blockers: string[] = []): IntelPolicyOutput {
  return {
    generatedAt: Date.now(),
    decision: {
      bias: 'long',
      confidence: 70,
      shouldTrade: true,
      qualityGateScore: 80,
      longScore: 80,
      shortScore: 20,
      waitScore: 10,
      netEdge: 30,
      edgePct: 30,
      coveragePct: 92,
      reasons: ['ok'],
      blockers,
      policyVersion: '3.0.0',
      breakdown: [],
    },
    panels: {
      headlines: [],
      events: [],
      flow: [],
      trending: [],
      picks: [],
    },
    summary: {
      pair: 'BTC/USDT',
      timeframe: '4h',
      domainsUsed: [],
      avgHelpfulness: 0,
    },
  };
}

describe('shadow execution gate', () => {
  it('denies when shadow execution flag is false', () => {
    const result = evaluateShadowExecutionGate({
      shadow: sampleShadow({
        enforced: { bias: 'wait', wouldTrade: false, shouldExecute: false, reasons: ['blocked'] },
      }),
      policy: samplePolicy([]),
    });
    expect(result.decision).toBe('deny');
    expect(result.reasons).toContain('shadow_execution_blocked');
  });

  it('allows when no blocker exists', () => {
    const result = evaluateShadowExecutionGate({
      shadow: sampleShadow(),
      policy: samplePolicy([]),
    });
    expect(result.decision).toBe('allow');
  });

  it('keeps allow decision in shadow mode', async () => {
    const result = evaluateShadowExecutionGovernanceWithMode(
      {
      shadow: sampleShadow({
        enforced: { bias: 'wait', wouldTrade: false, shouldExecute: false, reasons: ['blocked'] },
      }),
      policy: samplePolicy(['coverage_low']),
      },
      'shadow',
    );
    expect(result.blocked).toBe(false);
    expect(result.effectiveDecision).toBe('allow');
  });
});
