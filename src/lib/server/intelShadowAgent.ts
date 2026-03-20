import type { DecisionBias } from '$lib/intel/types';
import type { IntelPolicyOutput } from '$lib/server/intelPolicyRuntime';
import { callLLM, isLLMAvailable, type LLMResult } from '$lib/server/llmService';

export interface ShadowAgentProposal {
  bias: DecisionBias;
  confidence: number;
  horizonMin: number;
  rationale: string[];
  risks: string[];
  nowWhat: string;
}

export interface ShadowAgentEnforcedDecision {
  bias: DecisionBias;
  wouldTrade: boolean;
  shouldExecute: boolean;
  reasons: string[];
}

export interface ShadowAgentDecision {
  mode: 'shadow';
  generatedAt: number;
  source: 'llm' | 'fallback';
  fallbackReason: 'provider_unavailable' | 'llm_call_failed' | null;
  provider: string | null;
  model: string | null;
  proposal: ShadowAgentProposal;
  enforced: ShadowAgentEnforcedDecision;
}

interface LLMDecisionSchema {
  bias?: string;
  confidence?: number;
  horizonMin?: number;
  rationale?: unknown;
  risks?: unknown;
  nowWhat?: string;
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toBias(raw: unknown, fallback: DecisionBias = 'wait'): DecisionBias {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'long' || value === 'buy') return 'long';
  if (value === 'short' || value === 'sell') return 'short';
  if (value === 'wait' || value === 'neutral' || value === 'hold') return 'wait';
  return fallback;
}

function sanitizeLines(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return fallback;
  const out = input
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .slice(0, 4);
  return out.length > 0 ? out : fallback;
}

function actionText(bias: DecisionBias): string {
  if (bias === 'long') return '조건 충족 시 분할 롱 진입 후보, 손절 기준 엄수';
  if (bias === 'short') return '조건 충족 시 분할 숏 진입 후보, 손절 기준 엄수';
  return '신규 포지션 보류, 다음 증거 업데이트 대기';
}

function defaultProposal(policy: IntelPolicyOutput): ShadowAgentProposal {
  const baseBias = policy.decision.bias;
  const baseConfidence = clamp(policy.decision.confidence || 0, 0, 100);
  const reasons = policy.decision.reasons.length > 0 ? policy.decision.reasons.slice(0, 3) : ['유효 증거 부족'];
  const risks = policy.decision.blockers.length > 0 ? policy.decision.blockers.slice(0, 3) : ['명시적 리스크 없음'];

  return {
    bias: baseBias,
    confidence: baseConfidence,
    horizonMin: 60,
    rationale: reasons,
    risks,
    nowWhat: actionText(baseBias),
  };
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function parseLLMDecision(rawText: string, fallback: ShadowAgentProposal): ShadowAgentProposal {
  const jsonBlock = extractJsonObject(rawText);
  if (!jsonBlock) return fallback;

  let parsed: LLMDecisionSchema;
  try {
    parsed = JSON.parse(jsonBlock) as LLMDecisionSchema;
  } catch {
    return fallback;
  }

  const bias = toBias(parsed.bias, fallback.bias);
  const confidence = clamp(typeof parsed.confidence === 'number' ? parsed.confidence : fallback.confidence, 0, 100);
  const horizonMin = clamp(typeof parsed.horizonMin === 'number' ? parsed.horizonMin : fallback.horizonMin, 30, 180);
  const rationale = sanitizeLines(parsed.rationale, fallback.rationale);
  const risks = sanitizeLines(parsed.risks, fallback.risks);
  const nowWhat =
    typeof parsed.nowWhat === 'string' && parsed.nowWhat.trim().length > 0 ? parsed.nowWhat.trim().slice(0, 220) : fallback.nowWhat;

  return {
    bias,
    confidence,
    horizonMin,
    rationale,
    risks,
    nowWhat,
  };
}

function summarizePolicy(policy: IntelPolicyOutput): string {
  const panelTop = (Object.entries(policy.panels) as Array<[string, IntelPolicyOutput['panels'][keyof IntelPolicyOutput['panels']]]>)
    .map(([panel, cards]) => {
      const top = cards[0];
      if (!top) return null;
      return `${panel}: ${top.title} | bias=${top.bias} | conf=${Math.round(top.confidence)} | gate=${Math.round(top.gate.weightedScore)}`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 5);

  return [
    `policy_bias=${policy.decision.bias}`,
    `policy_confidence=${Math.round(policy.decision.confidence)}`,
    `edgePct=${Math.round(policy.decision.edgePct)}`,
    `coveragePct=${Math.round(policy.decision.coveragePct)}`,
    `blockers=${policy.decision.blockers.join(',') || 'none'}`,
    `reasons=${policy.decision.reasons.join(' | ') || 'none'}`,
    `panels=${panelTop.join(' || ') || 'none'}`,
  ].join('\n');
}

async function askLLM(policy: IntelPolicyOutput): Promise<{ proposal: ShadowAgentProposal; llm: LLMResult } | null> {
  if (!isLLMAvailable()) return null;

  const fallback = defaultProposal(policy);
  const summary = summarizePolicy(policy);

  const system = [
    'You are STOCKCLAW Shadow Risk Agent.',
    'Task: Produce a single SHORT-TERM proposal for next 30-120m from supplied policy data.',
    'Never assume execution. This is SHADOW mode only.',
    'Respond with JSON only. No markdown.',
    'Required JSON schema:',
    '{"bias":"long|short|wait","confidence":0-100,"horizonMin":30-180,"rationale":["..."],"risks":["..."],"nowWhat":"..."}',
    'Rules:',
    '- If blockers include coverage_low/backtest_win_rate_low/volatility_too_high, bias should usually be wait.',
    '- Keep rationale and risks concise.',
  ].join('\n');

  const user = [
    'Policy snapshot:',
    summary,
    '',
    'Return strict JSON now.',
  ].join('\n');

  try {
    const llm = await callLLM({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.15,
      maxTokens: 260,
      timeoutMs: 9000,
    });

    const proposal = parseLLMDecision(llm.text, fallback);
    return { proposal, llm };
  } catch {
    return null;
  }
}

function enforceGuards(policy: IntelPolicyOutput, proposal: ShadowAgentProposal): ShadowAgentEnforcedDecision {
  const blockers = new Set(policy.decision.blockers);
  const reasons: string[] = [];

  let bias = proposal.bias;

  if (blockers.has('coverage_low') || blockers.has('backtest_win_rate_low') || blockers.has('volatility_too_high')) {
    bias = 'wait';
    reasons.push('hard_no_trade_blocker');
  }

  if (blockers.has('edge_below_threshold') && proposal.bias !== 'wait') {
    bias = 'wait';
    reasons.push('edge_too_low');
  }

  if (proposal.confidence < 58 && proposal.bias !== 'wait') {
    bias = 'wait';
    reasons.push('agent_confidence_low');
  }

  if (policy.decision.bias === 'wait' && proposal.bias !== 'wait') {
    bias = 'wait';
    reasons.push('policy_wait_override');
  }

  if (
    policy.decision.bias !== 'wait' &&
    proposal.bias !== 'wait' &&
    proposal.bias !== policy.decision.bias &&
    policy.decision.edgePct >= 20
  ) {
    bias = 'wait';
    reasons.push('direction_conflict_with_policy');
  }

  if (bias === 'wait' && reasons.length === 0) reasons.push('shadow_conservative_wait');
  if (bias !== 'wait' && reasons.length === 0) reasons.push('passes_guardrails');

  const executionGateFailures: string[] = [];
  if (bias === 'wait') executionGateFailures.push('bias_wait');
  if (!policy.decision.shouldTrade) executionGateFailures.push('policy_should_trade_false');
  if (policy.decision.qualityGateScore < 75) executionGateFailures.push('policy_quality_low');
  if (policy.decision.edgePct < 12) executionGateFailures.push('policy_edge_low');
  if (policy.decision.coveragePct < 85) executionGateFailures.push('policy_coverage_low');
  if (policy.decision.confidence < 60) executionGateFailures.push('policy_confidence_low');
  if (proposal.confidence < 62) executionGateFailures.push('proposal_confidence_low');
  if (reasons.some((reason) => reason === 'hard_no_trade_blocker' || reason === 'direction_conflict_with_policy')) {
    executionGateFailures.push('guardrail_blocked');
  }

  const shouldExecute = executionGateFailures.length === 0;
  if (shouldExecute) {
    reasons.push('execution_gate_passed');
  } else {
    for (const failure of executionGateFailures.slice(0, 4)) {
      reasons.push(`execution_block:${failure}`);
    }
  }

  return {
    bias,
    wouldTrade: bias !== 'wait',
    shouldExecute,
    reasons,
  };
}

export async function buildShadowAgentDecision(policy: IntelPolicyOutput): Promise<ShadowAgentDecision> {
  const fallback = defaultProposal(policy);
  const llmResult = await askLLM(policy);
  const proposal = llmResult?.proposal ?? fallback;
  const enforced = enforceGuards(policy, proposal);
  const fallbackReason: ShadowAgentDecision['fallbackReason'] = llmResult
    ? null
    : isLLMAvailable()
      ? 'llm_call_failed'
      : 'provider_unavailable';

  return {
    mode: 'shadow',
    generatedAt: Date.now(),
    source: llmResult ? 'llm' : 'fallback',
    fallbackReason,
    provider: llmResult?.llm.provider ?? null,
    model: llmResult?.llm.model ?? null,
    proposal,
    enforced,
  };
}
