export type GuardrailDecision = 'allow' | 'ask' | 'deny';

export type GuardrailEnforcementMode = 'shadow' | 'enforce';

export type GuardrailRiskTier = 'low' | 'medium' | 'high';

export interface GuardrailResult {
  decision: GuardrailDecision;
  reasons: string[];
  riskTier: GuardrailRiskTier;
}

export interface GuardrailAuditEvent {
  area: 'transport' | 'runtime' | 'decision';
  action: string;
  mode: GuardrailEnforcementMode;
  result: GuardrailResult;
  metadata?: Record<string, unknown>;
  createdAt: number;
}
