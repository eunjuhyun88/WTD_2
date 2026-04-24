import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { toPositiveNumber } from '$lib/server/apiValidation';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import type { ShadowAgentDecision } from '$lib/server/intelShadowAgent';
import type { IntelPolicyOutput } from '$lib/server/intelPolicyRuntime';
import { evaluateShadowExecutionGovernance } from '$lib/guardrails/decision/shadowExecutionGate';
import { evaluateRuntimeExecutionGate } from '$lib/guardrails/runtime/executionGate';
import { getDefaultChannelPolicyInput } from '$lib/guardrails/runtime/toolPolicyConfig';
import { recordGuardrailAudit } from '$lib/guardrails/core/audit';
import { openQuickTrade } from '$lib/server/quickTradeOpen';

type ShadowPayload = {
  ok?: boolean;
  data?: {
    pair: string;
    timeframe: string;
    policy: IntelPolicyOutput;
    shadow: ShadowAgentDecision;
  };
  error?: string;
};

function isShadowExecutionEnabled(): boolean {
  return String(env.INTEL_SHADOW_EXECUTION_ENABLED ?? '').toLowerCase() === 'true';
}

function toTradeDir(bias: ShadowAgentDecision['enforced']['bias']): 'LONG' | 'SHORT' | null {
  if (bias === 'long') return 'LONG';
  if (bias === 'short') return 'SHORT';
  return null;
}

export const POST: RequestHandler = async ({ cookies, request, fetch }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ ok: false, error: 'Authentication required' }, { status: 401 });

    if (!isShadowExecutionEnabled()) {
      return json(
        {
          ok: false,
          error: 'Shadow execution is disabled (set INTEL_SHADOW_EXECUTION_ENABLED=true)',
        },
        { status: 403 },
      );
    }

    const runtimeChannelGate = evaluateRuntimeExecutionGate({
      mode: 'enforce',
      toolPolicy: {
        toolName: 'intel_shadow_execute',
      },
      channelPolicy: getDefaultChannelPolicyInput('terminal.intel-shadow.execute'),
    });
    recordGuardrailAudit({
      area: 'runtime',
      action: 'intel_shadow_execute:channel_gate',
      mode: 'enforce',
      result: runtimeChannelGate.result,
      metadata: {
        channel: 'terminal.intel-shadow.execute',
        effectiveDecision: runtimeChannelGate.effectiveDecision,
      },
      createdAt: Date.now(),
    });
    if (runtimeChannelGate.blocked) {
      return json({ ok: false, error: 'Runtime channel policy blocked execution' }, { status: 403 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return json({ ok: false, error: 'Invalid request body' }, { status: 400 });
      }
      throw error;
    }

    const pair = normalizePair(body?.pair);
    const timeframe = normalizeTimeframe(body?.timeframe);
    const requestedRefresh = body?.refresh === true;

    const currentPrice = toPositiveNumber(body?.currentPrice, 0);
    const entry = toPositiveNumber(body?.entry, currentPrice);
    const tp = body?.tp == null ? null : toPositiveNumber(body.tp, 0);
    const sl = body?.sl == null ? null : toPositiveNumber(body.sl, 0);
    const userNote = typeof body?.note === 'string' ? body.note.trim().slice(0, 220) : '';

    if (entry <= 0) {
      return json({ ok: false, error: 'entry/currentPrice must be greater than 0' }, { status: 400 });
    }

    const shadowQs = new URLSearchParams({
      pair,
      timeframe,
      refresh: requestedRefresh ? '1' : '0',
    });

    const shadowRes = await fetch(`/api/terminal/intel-agent-shadow?${shadowQs.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!shadowRes.ok) {
      return json({ ok: false, error: `Failed to evaluate shadow decision (${shadowRes.status})` }, { status: 502 });
    }

    const shadowJson = (await shadowRes.json()) as ShadowPayload;
    if (!shadowJson?.ok || !shadowJson?.data?.shadow || !shadowJson?.data?.policy) {
      return json({ ok: false, error: 'Invalid shadow decision payload' }, { status: 502 });
    }

    const shadow = shadowJson.data.shadow;
    const enforced = shadow.enforced;
    const dir = toTradeDir(enforced.bias);
    const governance = evaluateShadowExecutionGovernance({
      shadow,
      policy: shadowJson.data.policy,
    });
    recordGuardrailAudit({
      area: 'decision',
      action: 'intel_shadow_execute',
      mode: governance.mode,
      result: governance.result,
      metadata: {
        pair,
        timeframe,
        shadowSource: shadow.source,
        policyBias: shadowJson.data.policy.decision.bias,
      },
      createdAt: Date.now(),
    });

    if (governance.blocked || !dir) {
      return json(
        {
          ok: false,
          error: 'Shadow guardrails blocked execution',
          details: {
            bias: enforced.bias,
            reasons: governance.result.reasons,
            mode: governance.mode,
          },
        },
        { status: 409 },
      );
    }

    const noteParts = [
      `shadow:${shadow.source}`,
      `policy:${shadowJson.data.policy.decision.bias}`,
      `reasons:${enforced.reasons.slice(0, 3).join('|') || 'none'}`,
      userNote,
    ].filter((value) => value.length > 0);

    const trade = await openQuickTrade({
      userId: user.id,
      pair,
      dir,
      entry,
      tp,
      sl,
      currentPrice: currentPrice > 0 ? currentPrice : entry,
      source: 'intel-shadow-agent',
      note: noteParts.join(' · ').slice(0, 320),
    });

    return json({
      ok: true,
      data: {
        pair,
        timeframe,
        dir,
        entry,
        tp,
        sl,
        shadow: {
          source: shadow.source,
          provider: shadow.provider,
          model: shadow.model,
          enforced,
          governance: {
            mode: governance.mode,
            effectiveDecision: governance.effectiveDecision,
            reasons: governance.result.reasons,
          },
        },
        trade,
      },
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('pair must be like')) {
      return json({ ok: false, error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ ok: false, error: error.message }, { status: 400 });
    }

    console.error('[api/terminal/intel-agent-shadow/execute] error:', error);
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ ok: false, error: 'Server database is not configured' }, { status: 500 });
    }
    return json({ ok: false, error: 'Failed to execute shadow decision' }, { status: 500 });
  }
};
