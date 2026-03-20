// ═══════════════════════════════════════════════════════════════
// Stockclaw — LLM Service (server-side only)
// ═══════════════════════════════════════════════════════════════
//
// 통합 LLM 호출 서비스. Groq(가장 빠름) → Gemini → DeepSeek 순으로 fallback.
// 에이전트 채팅, 분석 요약 등 모든 LLM 호출의 단일 진입점.

import {
  GROQ_API_KEY, GROQ_MODEL, groqUrl,
  GEMINI_API_KEY, GEMINI_MODEL, geminiUrl,
  DEEPSEEK_API_KEY, DEEPSEEK_MODEL, deepseekUrl,
  getAvailableProvider,
  isDeepSeekAvailable,
  isGeminiAvailable,
  isGroqAvailable,
  type LLMProvider,
} from './llmConfig';
import type { MultiTimeframeIndicatorContext } from './multiTimeframeContext';

// ─── Types ────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallOptions {
  messages: LLMMessage[];
  /** 우선 사용할 provider (없으면 자동 선택) */
  provider?: LLMProvider;
  /** 최대 토큰 수 (기본 512) */
  maxTokens?: number;
  /** temperature (기본 0.7) */
  temperature?: number;
  /** 타임아웃 ms (기본 15000) */
  timeoutMs?: number;
}

export interface LLMResult {
  text: string;
  provider: LLMProvider;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

// ─── Groq (OpenAI-compatible) ─────────────────────────────────

async function callGroq(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(groqUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Groq ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) throw new Error('Groq: empty response');

    return {
      text: choice.message.content.trim(),
      provider: 'groq',
      model: GROQ_MODEL,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Gemini ───────────────────────────────────────────────────

async function callGemini(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Gemini format: system instruction + contents
  const systemMsg = messages.find(m => m.role === 'system');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  try {
    const res = await fetch(`${geminiUrl()}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini: empty response');

    return {
      text: text.trim(),
      provider: 'gemini',
      model: GEMINI_MODEL,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── DeepSeek (OpenAI-compatible) ─────────────────────────────

async function callDeepSeek(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(deepseekUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`DeepSeek ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) throw new Error('DeepSeek: empty response');

    return {
      text: choice.message.content.trim(),
      provider: 'deepseek',
      model: DEEPSEEK_MODEL,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Unified Call with Fallback ───────────────────────────────

const PROVIDER_CALL: Record<LLMProvider, typeof callGroq> = {
  groq: callGroq,
  gemini: callGemini,
  deepseek: callDeepSeek,
};

const FALLBACK_ORDER: LLMProvider[] = ['groq', 'deepseek', 'gemini'];

function availableProviders(): LLMProvider[] {
  const checks: Record<LLMProvider, boolean> = {
    groq: isGroqAvailable(),
    deepseek: isDeepSeekAvailable(),
    gemini: isGeminiAvailable(),
  };
  return FALLBACK_ORDER.filter(p => checks[p]);
}

export interface LLMRuntimeStatus {
  available: boolean;
  providers: LLMProvider[];
  preferred: LLMProvider | null;
}

export function getLLMRuntimeStatus(): LLMRuntimeStatus {
  const providers = availableProviders();
  return {
    available: providers.length > 0,
    providers,
    preferred: getAvailableProvider(),
  };
}

/**
 * 통합 LLM 호출. 지정된 provider 또는 자동 선택 후, 실패 시 다음 provider로 fallback.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResult> {
  const { messages, maxTokens = 512, temperature = 0.7, timeoutMs = 15000 } = options;
  const providers = availableProviders();

  if (providers.length === 0) {
    throw new Error('No LLM provider available. Check API keys (GROQ_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY).');
  }

  // 지정된 provider가 있으면 맨 앞으로
  const preferred = options.provider;
  const ordered = preferred && providers.includes(preferred)
    ? [preferred, ...providers.filter(p => p !== preferred)]
    : providers;

  let lastError: Error | null = null;

  for (const provider of ordered) {
    try {
      return await PROVIDER_CALL[provider](messages, maxTokens, temperature, timeoutMs);
    } catch (err: any) {
      lastError = err;
      console.warn(`[llmService] ${provider} failed: ${err.message}`);
    }
  }

  throw lastError ?? new Error('All LLM providers failed');
}

/**
 * LLM 사용 가능 여부 체크
 */
export function isLLMAvailable(): boolean {
  return availableProviders().length > 0;
}

// ─── Agent Chat System Prompt Builder ─────────────────────────

export interface AgentChatContext {
  agentId: string;
  agentDescription: string;
  pair: string;
  timeframe: string;
  scanSummary?: string | null;
  scanSignals?: Array<{
    agentName: string;
    vote: string;
    confidence: number;
    analysisText: string;
    entryPrice?: number;
    tpPrice?: number;
    slPrice?: number;
  }>;
  /** 실시간 가격 (클라이언트에서 전달) */
  livePrices?: Record<string, number>;
  /** 다중 시간봉 기술지표 컨텍스트 (서버 계산) */
  multiTimeframe?: MultiTimeframeIndicatorContext | null;
}

/**
 * 에이전트별 시스템 프롬프트 빌더.
 * 스캔 컨텍스트가 있으면 포함, 없으면 일반 분석으로 fallback.
 */
export function buildAgentSystemPrompt(ctx: AgentChatContext): string {
  const lines: string[] = [
    `You are ${ctx.agentId}, a specialized crypto trading analysis agent in the Stockclaw terminal.`,
    `Specialty: ${ctx.agentDescription}`,
    '',
    'Conversation Rules:',
    '- FIRST: Answer what the user actually asked. If they greet you, greet back. If they ask who you are, introduce yourself.',
    '- ONLY provide trading analysis when the user asks about markets, charts, price, trading, or related topics.',
    '- Respond concisely (2-4 sentences). Match the user\'s language (Korean OK).',
    '- Format: plain text, no markdown headers. Use → for flow, | for separators.',
    '',
    'When giving trading analysis:',
    '- Use trading jargon appropriate to your specialty.',
    '- Include specific price levels, percentages, or metrics when available.',
    '- State directional bias (LONG/SHORT/NEUTRAL) with confidence %.',
  ];

  // 실시간 가격 정보 추가
  if (ctx.livePrices && Object.keys(ctx.livePrices).length > 0) {
    lines.push('', '── Current Live Prices (REAL-TIME) ──');
    for (const [sym, price] of Object.entries(ctx.livePrices)) {
      if (typeof price === 'number' && price > 0) {
        lines.push(`  ${sym}: $${price.toLocaleString()}`);
      }
    }
    lines.push('IMPORTANT: Always use these LIVE prices. Never make up or guess prices.');
  }

  if (ctx.multiTimeframe && ctx.multiTimeframe.snapshots.length > 0) {
    lines.push('', `── Multi-Timeframe Technical Context (${ctx.multiTimeframe.pair}) ──`);
    lines.push(
      `Consensus: ${ctx.multiTimeframe.consensusBias.toUpperCase()} ${ctx.multiTimeframe.consensusConfidence}% | ` +
      `Alignment ${ctx.multiTimeframe.alignmentPct}% | Score ${ctx.multiTimeframe.weightedScore.toFixed(1)}`
    );
    for (const snap of ctx.multiTimeframe.snapshots.slice(0, 5)) {
      lines.push(
        `  ${snap.timeframe}: d${snap.changePct.toFixed(2)}% | EMA ${snap.emaTrend} | RSI ${snap.rsi14.toFixed(1)} ${snap.rsiState} | ` +
        `MACD ${snap.macdState} | ATR ${snap.atrPct.toFixed(2)}% | VOLx${snap.volumeRatio20.toFixed(2)} | ` +
        `${snap.bias.toUpperCase()} ${snap.confidence}%`
      );
    }
    lines.push('For chart/timeframe questions, prioritize this MTF context before legacy scan rows.');
  }

  if (ctx.scanSummary || (ctx.scanSignals && ctx.scanSignals.length > 0)) {
    lines.push('', `── Scan Context (${ctx.pair} ${ctx.timeframe.toUpperCase()}) ──`);
    if (ctx.scanSummary) {
      lines.push(`Consensus: ${ctx.scanSummary}`);
    }
    if (ctx.scanSignals && ctx.scanSignals.length > 0) {
      lines.push('Agent Signals:');
      for (const sig of ctx.scanSignals.slice(0, 5)) {
        const prices = sig.entryPrice
          ? ` | ENTRY ${sig.entryPrice} / TP ${sig.tpPrice} / SL ${sig.slPrice}`
          : '';
        lines.push(`  ${sig.agentName}: ${sig.vote.toUpperCase()} ${sig.confidence}%${prices} — ${sig.analysisText}`);
      }
    }
    lines.push('', 'Use this scan data ONLY when the user asks about trading or markets.');
  }

  return lines.join('\n');
}

/**
 * 오케스트레이터 시스템 프롬프트 (멘션 없이 질문할 때)
 */
export function buildOrchestratorSystemPrompt(ctx: Omit<AgentChatContext, 'agentId' | 'agentDescription'>): string {
  const lines: string[] = [
    'You are the ORCHESTRATOR, the lead AI commander of the Stockclaw 8-agent crypto intelligence system.',
    '',
    'Your agents: STRUCTURE (chart), VPA (volume), ICT (smart money), DERIV (derivatives), VALUATION (on-chain), FLOW (fund flows), SENTI (sentiment), MACRO (macro).',
    '',
    'Conversation Rules:',
    '- FIRST: Answer what the user actually asked. If they greet you, greet back. If they ask who you are, introduce yourself and your agents.',
    '- For general questions (who are you, what can you do, help, etc.), respond conversationally.',
    '- ONLY provide trading analysis when the user asks about markets, price, or trading.',
    '- Respond concisely (2-5 sentences). Match the user\'s language (Korean OK).',
    '- If the user asks about a specific domain, suggest tagging the relevant agent (e.g., "@DERIV for derivatives data").',
    '',
    'When giving trading analysis:',
    '- Synthesize multi-agent perspectives into actionable insights.',
    '- Include directional bias, confidence, and key levels.',
    '- Use trading jargon.',
  ];

  // 실시간 가격 정보 추가
  if (ctx.livePrices && Object.keys(ctx.livePrices).length > 0) {
    lines.push('', '── Current Live Prices (REAL-TIME) ──');
    for (const [sym, price] of Object.entries(ctx.livePrices)) {
      if (typeof price === 'number' && price > 0) {
        lines.push(`  ${sym}: $${price.toLocaleString()}`);
      }
    }
    lines.push('IMPORTANT: Always use these LIVE prices when discussing markets. Never guess or use outdated prices.');
  }

  if (ctx.multiTimeframe && ctx.multiTimeframe.snapshots.length > 0) {
    lines.push('', `── Multi-Timeframe Technical Context (${ctx.multiTimeframe.pair}) ──`);
    lines.push(
      `Consensus: ${ctx.multiTimeframe.consensusBias.toUpperCase()} ${ctx.multiTimeframe.consensusConfidence}% | ` +
      `Alignment ${ctx.multiTimeframe.alignmentPct}% | Score ${ctx.multiTimeframe.weightedScore.toFixed(1)}`
    );
    for (const snap of ctx.multiTimeframe.snapshots.slice(0, 5)) {
      lines.push(
        `  ${snap.timeframe}: d${snap.changePct.toFixed(2)}% | EMA ${snap.emaTrend} | RSI ${snap.rsi14.toFixed(1)} ${snap.rsiState} | ` +
        `MACD ${snap.macdState} | ATR ${snap.atrPct.toFixed(2)}% | VOLx${snap.volumeRatio20.toFixed(2)} | ` +
        `${snap.bias.toUpperCase()} ${snap.confidence}%`
      );
    }
    lines.push('For trading answers, use this MTF section as primary chart evidence.');
  }

  if (ctx.scanSummary || (ctx.scanSignals && ctx.scanSignals.length > 0)) {
    lines.push('', `── Scan Context (${ctx.pair} ${ctx.timeframe.toUpperCase()}) ──`);
    if (ctx.scanSummary) lines.push(`Summary: ${ctx.scanSummary}`);
    if (ctx.scanSignals && ctx.scanSignals.length > 0) {
      lines.push('Signals:');
      for (const sig of ctx.scanSignals.slice(0, 5)) {
        lines.push(`  ${sig.agentName}: ${sig.vote.toUpperCase()} ${sig.confidence}%`);
      }
    }
    lines.push('', 'Use this data ONLY when the user asks about trading or markets.');
  }

  return lines.join('\n');
}
