// ═══════════════════════════════════════════════════════════════
// /api/cogochi/terminal/message — DOUNI FC Pipeline (SSE)
// ═══════════════════════════════════════════════════════════════
//
// Cursor-style context management:
//   intentClassifier → token budget decision (0 LLM cost)
//   contextBuilder   → compressed history + gated snapshot
//   callLLMStream    → minimum viable context for each intent

import type { RequestHandler } from './$types';
import { callLLMStreamWithTools, type LLMMessage } from '$lib/server/llmService';
import { douniMessageLimiter } from '$lib/server/rateLimit';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 1769,
  maxDuration: 300,
};
import type { DouniProfile } from '$lib/server/douni/personality';
import type { ServerSignalSnapshot as SignalSnapshot } from '$lib/server/cogochi/signalSnapshot';
import type { SignalSnapshotRaw } from '$lib/server/engineClient';
import { type LLMProvider, getAvailableProvider } from '$lib/server/llmConfig';
import type { DouniSSEEvent, LLMMessageWithTools } from '$lib/server/douni/types';
import { executeTool } from '$lib/server/douni/toolExecutor';
import { classifyIntent } from '$lib/server/douni/intentClassifier';
import { buildContext, type CompressedHistoryEntry } from '$lib/server/douni/contextBuilder';
import { loadAgentContextPack } from '$lib/server/agentContextPack';
import type { ToolCall } from '$lib/server/douni/types';

const MAX_TOOL_ROUNDS = 3;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

type HeuristicSnapshot = Partial<SignalSnapshotRaw> & {
  symbol?: string;
  timeframe?: string;
};

type AgentContextRequest = {
  scanId?: string | null;
  seedRunId?: string | null;
  captureLimit?: number | null;
};

// ── HEURISTIC mode: template synthesis from snapshot (no LLM) ──

function buildHeuristicText(snapshot: HeuristicSnapshot | undefined, locale: string): string {
  const isKo = locale.startsWith('ko') || locale.startsWith('kr');
  const footer = isKo
    ? '\n\n▶ 전체 AI 분석: Settings > AI에서 Groq 키 입력. (무료, 30초)'
    : '\n\n▶ Full AI: add Groq key in Settings > AI. (free, 30s)';

  if (!snapshot) {
    return (isKo
      ? '[DOUNI HEURISTIC]\n심볼을 선택하면 분석 데이터를 로드해요.'
      : '[DOUNI HEURISTIC]\nSelect a symbol to load market data.') + footer;
  }

  const sym = (snapshot.symbol ?? '?').replace('USDT', '');
  const tf = (snapshot.timeframe ?? '4H').toUpperCase();
  const lines: string[] = [`[DOUNI HEURISTIC — ${sym} ${tf}]`];

  if (snapshot.funding_rate != null) {
    const pct = ((snapshot.funding_rate >= 0 ? '+' : '') + (snapshot.funding_rate * 100).toFixed(3) + '%');
    const note = snapshot.funding_rate > 0.01 ? (isKo ? '롱 과열' : 'longs overheated')
      : snapshot.funding_rate < -0.005 ? (isKo ? '숏 우세' : 'shorts dominate')
      : isKo ? '중립' : 'neutral';
    lines.push(`• ${isKo ? '펀딩' : 'Funding'}: ${pct} → ${note}`);
  }
  if (snapshot.oi_change_1h != null) {
    const pct = ((snapshot.oi_change_1h >= 0 ? '+' : '') + (snapshot.oi_change_1h * 100).toFixed(1) + '%');
    const note = snapshot.oi_change_1h > 0.02 ? (isKo ? '포지션 증가' : 'expanding')
      : snapshot.oi_change_1h < -0.02 ? (isKo ? '포지션 감소' : 'contracting')
      : isKo ? '안정' : 'stable';
    lines.push(`• OI 1H: ${pct} → ${note}`);
  }
  if (snapshot.cvd_state) {
    lines.push(`• CVD: ${snapshot.cvd_state.toUpperCase()}`);
  }
  if (snapshot.rsi14 != null) {
    const note = snapshot.rsi14 > 70 ? (isKo ? '과매수' : 'overbought')
      : snapshot.rsi14 < 30 ? (isKo ? '과매도' : 'oversold')
      : isKo ? '중립' : 'neutral';
    lines.push(`• RSI: ${snapshot.rsi14.toFixed(1)} → ${note}`);
  }
  if (snapshot.regime) {
    lines.push(`• ${isKo ? '레짐' : 'Regime'}: ${snapshot.regime.replace('_', ' ').toUpperCase()}`);
  }

  return lines.join('\n') + footer;
}

// ── Error sanitizer — strips key fragments before sending to client ──
// Patterns: Bearer tokens, sk-/gsk_/csk-/nvapi- prefixed keys, JSON auth fields
const KEY_PATTERN = /\b(Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|gsk_\S+|csk-\S+|nvapi-\S+|"(?:api_key|authorization|token)"\s*:\s*"[^"]{8,}")/gi;

function sanitizeProviderError(raw: string, status: number): string {
  if (status === 401 || status === 403) return `Authentication failed (${status})`;
  if (status === 429) return `Rate limit reached (429)`;
  const scrubbed = raw.replace(KEY_PATTERN, '[redacted]').slice(0, 120);
  return scrubbed || `Provider error (${status})`;
}

function normalizeAgentContextSymbol(value: string | undefined): string | null {
  const raw = value?.trim().toUpperCase();
  if (!raw) return null;
  const compact = raw.replace('/', '');
  if (compact.endsWith('USDT')) return compact;
  if (/^[A-Z0-9]{2,12}$/.test(compact)) return `${compact}USDT`;
  return null;
}

function normalizeAgentContextTimeframe(value: string | undefined): string {
  const raw = value?.trim().toLowerCase();
  return raw || '1h';
}

// ── API mode: user's own key, OpenAI-compatible stream (no tool loop) ──

const USER_KEY_ENDPOINTS: Record<string, { url: string; model: string }> = {
  groq:       { url: 'https://api.groq.com/openai/v1/chat/completions',          model: 'llama-3.3-70b-versatile' },
  cerebras:   { url: 'https://api.cerebras.ai/v1/chat/completions',              model: 'qwen-3-235b-a22b-instruct-2507' },
  mistral:    { url: 'https://api.mistral.ai/v1/chat/completions',               model: 'mistral-medium-latest' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions',            model: 'meta-llama/llama-3.3-70b-instruct:free' },
  deepseek:   { url: 'https://api.deepseek.com/v1/chat/completions',             model: 'deepseek-chat' },
};

async function* streamWithUserKey(
  messages: LLMMessage[],
  provider: string,
  apiKey: string,
  maxTokens: number,
  temperature: number,
): AsyncGenerator<DouniSSEEvent> {
  const cfg = USER_KEY_ENDPOINTS[provider];
  if (!cfg) { yield { type: 'error', message: `Unknown provider: ${provider}` }; return; }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, max_tokens: maxTokens, temperature }),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => '');
      console.error(`[streamWithUserKey] ${provider} ${res.status}:`, err.slice(0, 200));
      yield { type: 'error', message: sanitizeProviderError(err, res.status) };
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const delta = JSON.parse(raw)?.choices?.[0]?.delta?.content;
          if (delta) yield { type: 'text_delta', text: delta };
        } catch {}
      }
    }
  } finally {
    clearTimeout(timer);
  }
  yield { type: 'done', provider: provider as LLMProvider };
}

const DEFAULT_PROFILE: DouniProfile = {
  name: 'DOUNI',
  archetype: 'RIDER',
  stage: 'EGG',
};

export const POST: RequestHandler = async ({ request, getClientAddress, fetch: eventFetch }) => {
  if (!douniMessageLimiter.check(getClientAddress())) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const body = await request.json();
  const {
    message,
    history = [],
    snapshot,
    snapshotTs,
    provider,
    profile,
    greeting = false,
    locale = 'ko-KR',
    detectedSymbol,
    runtimeConfig,
    agentContext,
  } = body as {
    message: string;
    history?: CompressedHistoryEntry[];
      snapshot?: HeuristicSnapshot;
    /** Unix ms when snapshot was computed — used for staleness check */
    snapshotTs?: number;
    provider?: LLMProvider;
    profile?: Partial<DouniProfile>;
    greeting?: boolean;
    locale?: string;
    /** Symbol detected client-side from parsedQuery, passed for snapshot gating */
    detectedSymbol?: string;
    /** Optional IDs for canonical search results to include in AgentContextPack. */
    agentContext?: AgentContextRequest;
    runtimeConfig?: {
      mode: 'TERMINAL' | 'HEURISTIC' | 'OLLAMA' | 'API';
      provider?: string;
      apiKey?: string;
      ollamaModel?: string;
      ollamaEndpoint?: string;
    };
  };

  // Greeting mode: synthesize a locale-aware greeting prompt
  let effectiveMessage = message;
  if (greeting) {
    const hour = new Date().getHours();
    const isKorean = typeof locale === 'string' && locale.toLowerCase().startsWith('ko');
    effectiveMessage = isKorean
      ? `[첫 대화 인사 요청] 지금 ${hour}시야. 유저에게 한국어 반말로 짧게 한 문장 인사해줘. 시간대 반영해서 자연스럽게. 도구 호출하지 말고 그냥 인사만.`
      : `[First greeting request] It's ${hour}:00 now. Greet me in casual English, one short sentence, reflecting the time of day. No tool calls, just greet.`;
  }

  if (!effectiveMessage || typeof effectiveMessage !== 'string') {
    return new Response(JSON.stringify({ error: 'message required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const activeProfile: DouniProfile = { ...DEFAULT_PROFILE, ...profile };

  // ── Runtime mode routing ─────────────────────────────────────
  const runtimeMode = runtimeConfig?.mode;

  // HEURISTIC: template synthesis from snapshot — no LLM call
  if (runtimeMode === 'HEURISTIC') {
    const templateText = buildHeuristicText(snapshot, locale);
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const emit = (ev: DouniSSEEvent) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        emit({ type: 'text_delta', text: templateText });
        emit({ type: 'done', provider: 'ollama' });
        controller.close();
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  // ── Intent classification (0 LLM cost) ─────────────────────
  // Greeting mode always gets minimum budget (no tools, no snapshot)
  const budget = greeting
    ? { intent: 'greeting' as const, tools: [], maxTokens: 80, historyDepth: 0, includeSnapshot: 'never' as const, preferredProvider: 'cerebras' as const }
    : classifyIntent(effectiveMessage);

  // ── Provider resolution ─────────────────────────────────────
  // OLLAMA mode: force local provider regardless of env availability
  const modeOverride: LLMProvider | null =
    runtimeMode === 'OLLAMA' ? 'ollama' : null;

  // Explicit provider > mode override > intent preference > availability chain
  const resolvedProvider: LLMProvider = provider
    ?? modeOverride
    ?? (budget.preferredProvider !== 'default' ? budget.preferredProvider as LLMProvider : null)
    ?? getAvailableProvider()
    ?? 'ollama';

  const agentSymbol = normalizeAgentContextSymbol(snapshot?.symbol ?? detectedSymbol);
  const agentTimeframe = normalizeAgentContextTimeframe(snapshot?.timeframe);
  const agentContextPack = agentSymbol && !greeting
    ? await loadAgentContextPack({
        fetchFn: eventFetch,
        symbol: agentSymbol,
        timeframe: agentTimeframe,
        scanId: agentContext?.scanId ?? null,
        seedRunId: agentContext?.seedRunId ?? null,
        captureLimit: agentContext?.captureLimit ?? 5,
      })
    : undefined;

  // ── Context assembly (Cursor-style) ────────────────────────
  const { messages: builtMessages, tools } = buildContext({
    profile: activeProfile,
    budget,
    history,
    message: effectiveMessage,
    snapshot,
    snapshotTs,
    detectedSymbol,
    agentContextPack,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: DouniSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Fallback helper — emit HEURISTIC template when LLM produced nothing
      const emitHeuristicFallback = () => {
        const fallback = buildHeuristicText(snapshot, locale);
        emit({ type: 'text_delta', text: fallback });
        emit({ type: 'done', provider: 'ollama' });
      };

      let textEmitted = false;

      try {
        const messages: LLMMessageWithTools[] = builtMessages;

        // API mode: use user's own key — direct stream, no tool loop
        if (runtimeMode === 'API' && runtimeConfig?.apiKey && runtimeConfig?.provider) {
          for await (const ev of streamWithUserKey(
            messages as LLMMessage[],
            runtimeConfig.provider,
            runtimeConfig.apiKey,
            budget.maxTokens,
            0.85,
          )) {
            if (ev.type === 'text_delta') textEmitted = true;
            if (ev.type === 'error' && !textEmitted) {
              emitHeuristicFallback();
              return;
            }
            emit(ev);
          }
          if (!textEmitted) emitHeuristicFallback();
          return;
        }

        // Tool executor context
        const toolCtx = {
          symbol: snapshot?.symbol,
          timeframe: snapshot?.timeframe,
          cachedSnapshot: snapshot,
        };

        // Tool call loop (max 3 rounds)
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const collectedToolCalls: ToolCall[] = [];

          for await (const chunk of callLLMStreamWithTools({
            messages: messages as LLMMessage[],
            tools,
            provider: resolvedProvider,
            maxTokens: budget.maxTokens,
            temperature: 0.85,
            timeoutMs: 30000,
          })) {
            switch (chunk.type) {
              case 'text_delta':
                textEmitted = true;
                emit({ type: 'text_delta', text: chunk.text });
                break;
              case 'tool_call_start':
                collectedToolCalls.push(chunk.toolCall);
                break;
              case 'tool_call_delta': {
                const tc = collectedToolCalls[chunk.index];
                if (tc) tc.function.arguments += chunk.arguments;
                break;
              }
              case 'done':
                break;
            }
          }

          // No tool calls → done
          if (collectedToolCalls.length === 0) break;

          // Execute tool calls — parallel when multiple tools requested
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: collectedToolCalls,
          });

          const toolResults = await Promise.all(
            collectedToolCalls.map(tc => executeTool(tc, toolCtx)),
          );
          for (const { result, events } of toolResults) {
            for (const event of events) emit(event);
            messages.push({
              role: 'tool',
              content: JSON.stringify(result.result),
              tool_call_id: result.toolCallId,
              name: result.name,
            });
          }
        }

        if (!textEmitted) {
          emitHeuristicFallback();
        } else {
          emit({ type: 'done', provider: resolvedProvider });
        }
      } catch (err: any) {
        if (!textEmitted) {
          emitHeuristicFallback();
        } else {
          const status = typeof err.status === 'number' ? err.status : 0;
          console.error('[cogochi/message] stream error:', err.message);
          emit({ type: 'error', message: sanitizeProviderError(err.message || '', status) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
};
