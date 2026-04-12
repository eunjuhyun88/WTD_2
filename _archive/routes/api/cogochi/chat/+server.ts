// ═══════════════════════════════════════════════════════════════
// Cogochi Chat API — DOUNI AI Agent (SSE streaming)
// ═══════════════════════════════════════════════════════════════

import type { RequestHandler } from './$types';
import { callLLMStream, type LLMMessage } from '$lib/server/llmService';
import {
  buildDouniSystemPrompt,
  buildAnalysisContext,
  type DouniProfile,
} from '$lib/engine/cogochi/douni/douniPersonality';
import type { SignalSnapshot } from '$lib/engine/cogochi/types';
import type { LLMProvider } from '$lib/server/llmConfig';

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
  } = body as {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    snapshot?: SignalSnapshot;
    provider?: LLMProvider;
  };

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. Build system prompt
  const systemPrompt = buildDouniSystemPrompt(DEFAULT_PROFILE);

  // 2. Assemble LLM messages
  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // 3. Inject analysis context OR "no data" guard
  if (snapshot) {
    try {
      const analysisCtx = buildAnalysisContext(snapshot, DEFAULT_PROFILE.archetype);
      llmMessages.push({
        role: 'system',
        content: `[Current Analysis Data]\n${analysisCtx}`,
      });
    } catch {
      // Snapshot might be partial — skip context injection
    }
  } else {
    llmMessages.push({
      role: 'system',
      content: `[NO ANALYSIS DATA LOADED]
You have NO market data right now. You MUST follow these rules:
1. NEVER mention specific prices, indicators, or layer values — you have none.
2. NEVER say things like "CVD is rising" or "L1 MARKUP confirmed" — that is fabrication.
3. If the user asks about market conditions, tell them to run an analysis first: "먼저 종목 분석부터 하자. BTC 4H 이런 식으로 말해줘."
4. You CAN have general trading conversation, explain concepts, or discuss strategy.
5. Keep it short. Don't pretend you have data you don't have.`,
    });
  }

  // 4. Add conversation history (last 10 turns)
  const recent = (history || []).slice(-10);
  for (const h of recent) {
    llmMessages.push({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    });
  }

  // 5. Add current user message
  llmMessages.push({ role: 'user', content: message });

  // 6. Stream response via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of callLLMStream({
          messages: llmMessages,
          provider: provider || undefined,
          maxTokens: 1024,
          temperature: 0.6,
          timeoutMs: 30000,
        })) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ t: chunk })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
        );
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
