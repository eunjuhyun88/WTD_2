// ═══════════════════════════════════════════════════════════════
// /api/cogochi/terminal/message — DOUNI FC Pipeline (SSE)
// ═══════════════════════════════════════════════════════════════
//
// Function Calling 지원 DOUNI 대화 엔드포인트.
// 기존 /api/cogochi/chat는 텍스트 전용 — 이 엔드포인트는 도구 호출 포함.
//
// 흐름:
//   User → LLM(tools) → tool_call → execute → result → LLM(재호출) → 텍스트
//                        ↑_____________________________________|
//                        (최대 3라운드)

import type { RequestHandler } from './$types';
import { callLLMStreamWithTools, type LLMMessage } from '$lib/server/llmService';
import {
  buildDouniSystemPrompt,
  buildAnalysisContext,
  type DouniProfile,
} from '$lib/engine/cogochi/douni/douniPersonality';
import type { SignalSnapshot } from '$lib/engine/cogochi/types';
import { type LLMProvider, getAvailableProvider } from '$lib/server/llmConfig';
import type { LLMStreamChunk, ToolCall, DouniSSEEvent, LLMMessageWithTools } from '$lib/server/douni/types';
import { DOUNI_TOOLS } from '$lib/server/douni/tools';
import { executeTool } from '$lib/server/douni/toolExecutor';

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
    provider,
    profile,
    greeting = false,
    locale = 'ko-KR',
  } = body as {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    snapshot?: SignalSnapshot;
    provider?: LLMProvider;
    profile?: Partial<DouniProfile>;
    greeting?: boolean;
    locale?: string;
  };

  // Special mode: first-load greeting. Synthesize a user prompt so the LLM
  // generates a locale-aware greeting instead of the frontend hardcoding it.
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

  const activeProfile: DouniProfile = {
    ...DEFAULT_PROFILE,
    ...profile,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: DouniSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // 1. Build system prompt (single system message for HF/provider compat)
        let systemPrompt = buildDouniSystemPrompt(activeProfile);

        // 2. Inject analysis context into system prompt
        if (snapshot) {
          try {
            const analysisCtx = buildAnalysisContext(snapshot, activeProfile.archetype);
            systemPrompt += `\n\n[Current Analysis Data]\n${analysisCtx}`;
          } catch { /* skip partial snapshot */ }
        } else {
          systemPrompt += `\n\n[NO ANALYSIS DATA]\nYou have no market data. If the user asks about markets, use the analyze_market tool to fetch data.\nYou can also have general trading conversation without data.`;
        }

        // 3. Assemble messages (single system message at top)
        const messages: LLMMessageWithTools[] = [
          { role: 'system', content: systemPrompt },
        ];

        // 4. History (last 10 turns)
        for (const h of (history || []).slice(-10)) {
          messages.push({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content,
          });
        }

        // 5. Current user message (may be synthesized for greeting mode)
        messages.push({ role: 'user', content: effectiveMessage });

        // 6. Tool call loop (max 3 rounds)
        const toolCtx = {
          symbol: snapshot?.symbol,
          timeframe: snapshot?.timeframe,
          cachedSnapshot: snapshot,
        };

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const collectedToolCalls: ToolCall[] = [];
          let hasText = false;

          // Stream from LLM with tools
          for await (const chunk of callLLMStreamWithTools({
            messages: messages as LLMMessage[],
            tools: DOUNI_TOOLS,
            provider: provider || undefined,
            maxTokens: 1024,
            temperature: 0.6,
            timeoutMs: 30000,
          })) {
            switch (chunk.type) {
              case 'text_delta':
                hasText = true;
                emit({ type: 'text_delta', text: chunk.text });
                break;

              case 'tool_call_start':
                collectedToolCalls.push(chunk.toolCall);
                break;

              case 'tool_call_delta': {
                const tc = collectedToolCalls[chunk.index];
                if (tc) {
                  tc.function.arguments += chunk.arguments;
                }
                break;
              }

              case 'done':
                // Will handle after loop
                break;
            }
          }

          // If LLM produced text and no tool calls, we're done
          if (collectedToolCalls.length === 0) {
            break;
          }

          // Execute tool calls
          const assistantMessage: LLMMessageWithTools = {
            role: 'assistant',
            content: null,
            tool_calls: collectedToolCalls,
          };
          messages.push(assistantMessage);

          for (const tc of collectedToolCalls) {
            const { result, events } = await executeTool(tc, toolCtx);

            // Emit tool events to client
            for (const event of events) {
              emit(event);
            }

            // Add tool result to messages for next round
            messages.push({
              role: 'tool',
              content: JSON.stringify(result.result),
              tool_call_id: tc.id,
              name: tc.function.name,
            });
          }

          // Next round: LLM will see tool results and respond
        }

        // Done
        emit({
          type: 'done',
          provider: (provider || getAvailableProvider() || 'ollama') as LLMProvider,
        });
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
