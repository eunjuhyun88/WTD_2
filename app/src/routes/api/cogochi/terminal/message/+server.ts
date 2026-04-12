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
import type { DouniProfile } from '$lib/engine/cogochi/douni/douniPersonality';
import type { SignalSnapshot } from '$lib/engine/cogochi/types';
import { type LLMProvider, getAvailableProvider } from '$lib/server/llmConfig';
import type { DouniSSEEvent, LLMMessageWithTools } from '$lib/server/douni/types';
import { executeTool } from '$lib/server/douni/toolExecutor';
import { classifyIntent } from '$lib/server/douni/intentClassifier';
import { buildContext, type CompressedHistoryEntry } from '$lib/server/douni/contextBuilder';
import type { ToolCall } from '$lib/server/douni/types';

const MAX_TOOL_ROUNDS = 3;

const DEFAULT_PROFILE: DouniProfile = {
  name: 'DOUNI',
  archetype: 'RIDER',
  stage: 'EGG',
};

export const POST: RequestHandler = async ({ request }) => {
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
  } = body as {
    message: string;
    history?: CompressedHistoryEntry[];
    snapshot?: SignalSnapshot;
    /** Unix ms when snapshot was computed — used for staleness check */
    snapshotTs?: number;
    provider?: LLMProvider;
    profile?: Partial<DouniProfile>;
    greeting?: boolean;
    locale?: string;
    /** Symbol detected client-side from parsedQuery, passed for snapshot gating */
    detectedSymbol?: string;
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

  // ── Intent classification (0 LLM cost) ─────────────────────
  // Greeting mode always gets minimum budget (no tools, no snapshot)
  const budget = greeting
    ? { intent: 'greeting' as const, tools: [], maxTokens: 80, historyDepth: 0, includeSnapshot: 'never' as const, preferredProvider: 'cerebras' as const }
    : classifyIntent(effectiveMessage);

  // ── Provider resolution ─────────────────────────────────────
  // Explicit provider > intent preference > availability chain
  const resolvedProvider: LLMProvider = provider
    ?? (budget.preferredProvider !== 'default' ? budget.preferredProvider as LLMProvider : null)
    ?? getAvailableProvider()
    ?? 'ollama';

  // ── Context assembly (Cursor-style) ────────────────────────
  const { messages: builtMessages, tools } = buildContext({
    profile: activeProfile,
    budget,
    history,
    message: effectiveMessage,
    snapshot,
    snapshotTs,
    detectedSymbol,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: DouniSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const messages: LLMMessageWithTools[] = builtMessages;

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

        emit({ type: 'done', provider: resolvedProvider });
      } catch (err: any) {
        emit({ type: 'error', message: err.message || 'Stream failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
