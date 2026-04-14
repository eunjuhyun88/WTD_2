import type { GuardrailResult } from '$lib/guardrails/core/types';

export interface ChannelPolicyInput {
  channelName: string;
  allowlist?: string[];
  denylist?: string[];
  requiresApproval?: string[];
}

function normalize(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function evaluateChannelPolicy(input: ChannelPolicyInput): GuardrailResult {
  const channel = input.channelName.trim().toLowerCase();
  const allowlist = normalize(input.allowlist);
  const denylist = normalize(input.denylist);
  const requiresApproval = normalize(input.requiresApproval);

  if (denylist.has(channel)) {
    return {
      decision: 'deny',
      reasons: ['channel_denied'],
      riskTier: 'high',
    };
  }

  if (allowlist.size > 0 && !allowlist.has(channel)) {
    return {
      decision: 'deny',
      reasons: ['channel_not_allowlisted'],
      riskTier: 'high',
    };
  }

  if (requiresApproval.has(channel)) {
    return {
      decision: 'ask',
      reasons: ['channel_requires_approval'],
      riskTier: 'medium',
    };
  }

  return {
    decision: 'allow',
    reasons: ['channel_allowed'],
    riskTier: 'low',
  };
}

