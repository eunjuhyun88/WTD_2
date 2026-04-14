import type { GuardrailResult } from '$lib/guardrails/core/types';

export interface ToolPolicyInput {
  toolName: string;
  allowlist?: string[];
  denylist?: string[];
  requiresApproval?: string[];
}

function normalize(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function evaluateToolPolicy(input: ToolPolicyInput): GuardrailResult {
  const tool = input.toolName.trim().toLowerCase();
  const allowlist = normalize(input.allowlist);
  const denylist = normalize(input.denylist);
  const requiresApproval = normalize(input.requiresApproval);

  if (denylist.has(tool)) {
    return {
      decision: 'deny',
      reasons: ['tool_denied'],
      riskTier: 'high',
    };
  }

  if (allowlist.size > 0 && !allowlist.has(tool)) {
    return {
      decision: 'deny',
      reasons: ['tool_not_allowlisted'],
      riskTier: 'high',
    };
  }

  if (requiresApproval.has(tool)) {
    return {
      decision: 'ask',
      reasons: ['tool_requires_approval'],
      riskTier: 'medium',
    };
  }

  return {
    decision: 'allow',
    reasons: ['tool_allowed'],
    riskTier: 'low',
  };
}
