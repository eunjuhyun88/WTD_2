import { env } from '$env/dynamic/private';
import type { GuardrailEnforcementMode, GuardrailResult } from '$lib/guardrails/core/types';
import type { ShadowAgentDecision } from '$lib/server/intelShadowAgent';
import type { IntelPolicyOutput } from '$lib/server/intelPolicyRuntime';

export interface ShadowExecutionGateInput {
  shadow: ShadowAgentDecision;
  policy: IntelPolicyOutput;
}

export interface ShadowExecutionGovernance {
  mode: GuardrailEnforcementMode;
  effectiveDecision: 'allow' | 'deny';
  blocked: boolean;
  result: GuardrailResult;
}

export function getExecutionGuardrailMode(): GuardrailEnforcementMode {
  const raw = String(env.INTEL_GUARDRAIL_EXECUTION_MODE ?? '').trim().toLowerCase();
  return raw === 'shadow' ? 'shadow' : 'enforce';
}

export function evaluateShadowExecutionGate(input: ShadowExecutionGateInput): GuardrailResult {
  const reasons: string[] = [];
  const blockers = new Set(input.policy.decision.blockers);

  if (!input.shadow.enforced.shouldExecute) reasons.push('shadow_execution_blocked');
  if (input.shadow.enforced.bias === 'wait') reasons.push('shadow_bias_wait');
  if (blockers.has('volatility_too_high')) reasons.push('policy_volatility_too_high');
  if (blockers.has('coverage_low')) reasons.push('policy_coverage_low');

  if (reasons.length > 0) {
    return {
      decision: 'deny',
      reasons,
      riskTier: 'high',
    };
  }

  return {
    decision: 'allow',
    reasons: ['execution_gate_passed'],
    riskTier: 'high',
  };
}

export function evaluateShadowExecutionGovernance(input: ShadowExecutionGateInput): ShadowExecutionGovernance {
  return evaluateShadowExecutionGovernanceWithMode(input, getExecutionGuardrailMode());
}

export function evaluateShadowExecutionGovernanceWithMode(
  input: ShadowExecutionGateInput,
  mode: GuardrailEnforcementMode,
): ShadowExecutionGovernance {
  const result = evaluateShadowExecutionGate(input);
  const blocked = result.decision !== 'allow' && mode === 'enforce';

  return {
    mode,
    effectiveDecision: blocked ? 'deny' : 'allow',
    blocked,
    result,
  };
}
