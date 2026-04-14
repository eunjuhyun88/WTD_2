import type { GuardrailEnforcementMode, GuardrailResult } from '$lib/guardrails/core/types';
import { mergeGuardrailResults } from '$lib/guardrails/core/policy';
import { evaluateChannelPolicy, type ChannelPolicyInput } from './channelPolicy';
import { evaluateToolPolicy, type ToolPolicyInput } from './toolPolicy';

export interface RuntimeExecutionGateInput {
  mode: GuardrailEnforcementMode;
  toolPolicy: ToolPolicyInput;
  channelPolicy: ChannelPolicyInput;
}

export interface RuntimeExecutionGateResult {
  blocked: boolean;
  mode: GuardrailEnforcementMode;
  effectiveDecision: 'allow' | 'deny';
  result: GuardrailResult;
}

export function evaluateRuntimeExecutionGate(
  input: RuntimeExecutionGateInput,
): RuntimeExecutionGateResult {
  const merged = mergeGuardrailResults([
    evaluateChannelPolicy(input.channelPolicy),
    evaluateToolPolicy(input.toolPolicy),
  ]);
  const blocked = merged.decision === 'deny' || (merged.decision === 'ask' && input.mode === 'enforce');
  return {
    blocked,
    mode: input.mode,
    effectiveDecision: blocked ? 'deny' : 'allow',
    result: merged,
  };
}

