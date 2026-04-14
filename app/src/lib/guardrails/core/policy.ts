import type { GuardrailResult } from './types';

const DECISION_WEIGHT: Record<GuardrailResult['decision'], number> = {
  allow: 0,
  ask: 1,
  deny: 2,
};

export interface GuardrailPolicyAggregate {
  decision: GuardrailResult['decision'];
  reasons: string[];
  riskTier: GuardrailResult['riskTier'];
}

function highestRiskTier(results: GuardrailResult[]): GuardrailResult['riskTier'] {
  if (results.some((item) => item.riskTier === 'high')) return 'high';
  if (results.some((item) => item.riskTier === 'medium')) return 'medium';
  return 'low';
}

export function mergeGuardrailResults(results: GuardrailResult[]): GuardrailPolicyAggregate {
  if (results.length === 0) {
    return {
      decision: 'allow',
      reasons: ['no_policy_results'],
      riskTier: 'low',
    };
  }

  const decision = results.reduce<GuardrailResult['decision']>((current, next) => {
    return DECISION_WEIGHT[next.decision] > DECISION_WEIGHT[current] ? next.decision : current;
  }, 'allow');

  return {
    decision,
    reasons: Array.from(new Set(results.flatMap((item) => item.reasons))),
    riskTier: highestRiskTier(results),
  };
}

