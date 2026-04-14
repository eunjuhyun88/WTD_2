// ═══════════════════════════════════════════════════════════════
// LLM Service (server-side only)
// ═══════════════════════════════════════════════════════════════
//
// 통합 LLM 호출 서비스. Groq(가장 빠름) → Gemini → DeepSeek 순으로 fallback.
// 에이전트 채팅, 분석 요약 등 모든 LLM 호출의 단일 진입점.

import {
  GROQ_MODEL, groqUrl,
  GEMINI_MODEL, geminiUrl,
  DEEPSEEK_MODEL, deepseekUrl,
  QWEN_MODEL, qwenUrl,
  GROK_MODEL, grokUrl,
  KIMI_MODEL, kimiUrl,
  HF_MODEL, hfUrl,
  CEREBRAS_MODEL, cerebrasUrl,
  MISTRAL_MODEL, mistralUrl,
  OPENROUTER_MODEL, openrouterUrl, OPENROUTER_SITE_URL, OPENROUTER_APP_NAME,
  OLLAMA_MODEL, ollamaUrl, ollamaChatUrl,
  getAvailableProvider,
  isDeepSeekAvailable,
  isGeminiAvailable,
  isGroqAvailable,
  isQwenAvailable,
  isGrokAvailable,
  isKimiAvailable,
  isHfAvailable,
  isCerebrasAvailable,
  isMistralAvailable,
  isOpenRouterAvailable,
  isOllamaAvailable,
  // Rotation pool accessors (one pair per provider)
  getGroqApiKey, rotateGroqKey,
  getCerebrasApiKey, rotateCerebrasKey,
  getHfToken, rotateHfToken,
  getGeminiApiKey, rotateGeminiKey,
  getDeepSeekApiKey, rotateDeepSeekKey,
  getQwenApiKey, rotateQwenKey,
  getGrokApiKey, rotateGrokKey,
  getKimiApiKey, rotateKimiKey,
  getMistralApiKey, rotateMistralKey,
  getOpenRouterApiKey, rotateOpenRouterKey,
  type LLMProvider,
} from './llmConfig';
import type { MultiTimeframeIndicatorContext } from './multiTimeframeContext';

// ─── Types ────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
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

// ─── Ollama (Local LLM — no rate limits) ──────────────────────

async function callOllama(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Combine messages into single prompt (Ollama generate API)
    const prompt = '/no_think\n' + messages.map(m => {
      if (m.role === 'system') return `[System]\n${m.content}`;
      if (m.role === 'assistant') return `[Assistant]\n${m.content}`;
      return m.content;
    }).join('\n\n');

    const res = await fetch(ollamaUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        format: 'json',
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Ollama ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    if (!data.response) throw new Error('Ollama: empty response');

    return {
      text: data.response.trim(),
      provider: 'ollama',
      model: OLLAMA_MODEL,
      usage: data.eval_count ? {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
      } : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Groq (OpenAI-compatible) ─────────────────────────────────

async function callGroq(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiKey = getGroqApiKey();
    const res = await fetch(groqUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
      // On 429 (rate limit), rotate to next key and throw for retry
      if (res.status === 429) {
        rotateGroqKey();
      }
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
    const res = await fetch(`${geminiUrl()}?key=${getGeminiApiKey()}`, {
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
      // Rotate on quota (429) or auth failure (401/403 for revoked keys)
      if (res.status === 429 || res.status === 401 || res.status === 403) rotateGeminiKey();
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
        'Authorization': `Bearer ${getDeepSeekApiKey()}`,
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
      if (res.status === 429 || res.status === 401) rotateDeepSeekKey();
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

// ─── Qwen (DashScope, OpenAI-compatible, with key rotation) ──

async function callQwen(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  return callOpenAICompatible(
    'qwen', qwenUrl(), getQwenApiKey(), QWEN_MODEL,
    messages, maxTokens, temperature, timeoutMs,
    (status) => { if (status === 429 || status === 401) rotateQwenKey(); },
  );
}

// ─── Grok (xAI, OpenAI-compatible, with key rotation) ────────

async function callGrok(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  return callOpenAICompatible(
    'grok', grokUrl(), getGrokApiKey(), GROK_MODEL,
    messages, maxTokens, temperature, timeoutMs,
    (status) => { if (status === 429 || status === 401) rotateGrokKey(); },
  );
}

// ─── Kimi (Moonshot, OpenAI-compatible, with key rotation) ───

async function callKimi(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  return callOpenAICompatible(
    'kimi', kimiUrl(), getKimiApiKey(), KIMI_MODEL,
    messages, maxTokens, temperature, timeoutMs,
    (status) => { if (status === 429 || status === 401) rotateKimiKey(); },
  );
}

// ─── Cerebras (blazing fast, OpenAI-compatible, with key rotation) ───

async function callCerebras(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  return callOpenAICompatible(
    'cerebras',
    cerebrasUrl(),
    getCerebrasApiKey(),
    CEREBRAS_MODEL,
    messages,
    maxTokens,
    temperature,
    timeoutMs,
    (status) => {
      // Rotate on rate-limit (429) or auth failure (401, e.g. revoked key)
      if (status === 429 || status === 401) rotateCerebrasKey();
    },
  );
}

// ─── Mistral La Plateforme (OpenAI-compatible, with key rotation) ─

async function callMistral(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  return callOpenAICompatible(
    'mistral', mistralUrl(), getMistralApiKey(), MISTRAL_MODEL,
    messages, maxTokens, temperature, timeoutMs,
    (status) => { if (status === 429 || status === 401) rotateMistralKey(); },
  );
}

// ─── OpenRouter (aggregator, OpenAI-compatible + extra headers, with key rotation) ─

async function callOpenRouter(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(openrouterUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getOpenRouterApiKey()}`,
        'HTTP-Referer': OPENROUTER_SITE_URL,
        'X-Title': OPENROUTER_APP_NAME,
      },
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (res.status === 429 || res.status === 401) rotateOpenRouterKey();
      throw new Error(`openrouter ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) throw new Error('openrouter: empty response');
    return {
      text: choice.message.content.trim(),
      provider: 'openrouter',
      model: data.model ?? OPENROUTER_MODEL,
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── HuggingFace Inference API (OpenAI-compatible, with token rotation) ─

async function callHf(messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number): Promise<LLMResult> {
  return callOpenAICompatible(
    'hf',
    hfUrl(),
    getHfToken(),
    HF_MODEL,
    messages,
    maxTokens,
    temperature,
    timeoutMs,
    (status) => {
      // Rotate on rate-limit (429) or auth failure (401, e.g. revoked token)
      if (status === 429 || status === 401) rotateHfToken();
    },
  );
}

// ─── Generic OpenAI-compatible caller ────────────────────────

async function callOpenAICompatible(
  providerName: string, url: string, apiKey: string, model: string,
  messages: LLMMessage[], maxTokens: number, temperature: number, timeoutMs: number,
  onHttpError?: (status: number) => void,
): Promise<LLMResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      onHttpError?.(res.status);
      throw new Error(`${providerName} ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) throw new Error(`${providerName}: empty response`);
    return {
      text: choice.message.content.trim(),
      provider: providerName as LLMProvider,
      model,
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Unified Call with Fallback ───────────────────────────────

const PROVIDER_CALL: Record<LLMProvider, typeof callGroq> = {
  ollama: callOllama,
  groq: callGroq,
  cerebras: callCerebras,
  mistral: callMistral,
  openrouter: callOpenRouter,
  grok: callGrok,
  qwen: callQwen,
  kimi: callKimi,
  hf: callHf,
  deepseek: callDeepSeek,
  gemini: callGemini,
};

// Cerebras(fast free) → Groq(13 keys) → Mistral(500k TPM) → HF(free) → OpenRouter(last-resort) → paid → Gemini → Ollama
const FALLBACK_ORDER: LLMProvider[] = [
  'cerebras', 'groq', 'mistral', 'hf', 'openrouter',
  'grok', 'kimi', 'qwen', 'deepseek', 'gemini', 'ollama',
];

function availableProviders(): LLMProvider[] {
  const checks: Record<LLMProvider, boolean> = {
    ollama: isOllamaAvailable(),
    groq: isGroqAvailable(),
    cerebras: isCerebrasAvailable(),
    mistral: isMistralAvailable(),
    openrouter: isOpenRouterAvailable(),
    grok: isGrokAvailable(),
    qwen: isQwenAvailable(),
    kimi: isKimiAvailable(),
    hf: isHfAvailable(),
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

// ─── Streaming LLM Call ──────────────────────────────────────

export interface LLMStreamOptions {
  messages: LLMMessage[];
  provider?: LLMProvider;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * SSE 스트리밍 LLM 호출. AsyncGenerator로 텍스트 청크를 yield.
 * 풀백 체인 지원 — 첫 성공 provider로 스트리밍.
 */
export async function* callLLMStream(options: LLMStreamOptions): AsyncGenerator<string> {
  const { messages, maxTokens = 1024, temperature = 0.7, timeoutMs = 30000 } = options;
  const providers = availableProviders();
  if (providers.length === 0) throw new Error('No LLM provider available');

  const preferred = options.provider;
  const ordered = preferred && providers.includes(preferred)
    ? [preferred, ...providers.filter(p => p !== preferred)]
    : providers;

  let lastError: Error | null = null;

  for (const provider of ordered) {
    try {
      yield* streamFromProvider(provider, messages, maxTokens, temperature, timeoutMs);
      return;
    } catch (err: any) {
      lastError = err;
      console.warn(`[llmService] ${provider} stream failed: ${err.message}`);
    }
  }
  throw lastError ?? new Error('All LLM providers failed (streaming)');
}

interface StreamConfig {
  url: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  onRotate: () => void;
}

function getStreamConfig(provider: LLMProvider): StreamConfig {
  switch (provider) {
    case 'ollama':     return { url: ollamaChatUrl(), apiKey: '', model: OLLAMA_MODEL, onRotate: () => {} };
    case 'groq':       return { url: groqUrl(), apiKey: getGroqApiKey(), model: GROQ_MODEL, onRotate: rotateGroqKey };
    case 'cerebras':   return { url: cerebrasUrl(), apiKey: getCerebrasApiKey(), model: CEREBRAS_MODEL, onRotate: rotateCerebrasKey };
    case 'mistral':    return { url: mistralUrl(), apiKey: getMistralApiKey(), model: MISTRAL_MODEL, onRotate: rotateMistralKey };
    case 'openrouter': return {
      url: openrouterUrl(),
      apiKey: getOpenRouterApiKey(),
      model: OPENROUTER_MODEL,
      extraHeaders: { 'HTTP-Referer': OPENROUTER_SITE_URL, 'X-Title': OPENROUTER_APP_NAME },
      onRotate: rotateOpenRouterKey,
    };
    case 'grok':     return { url: grokUrl(), apiKey: getGrokApiKey(), model: GROK_MODEL, onRotate: rotateGrokKey };
    case 'qwen':     return { url: qwenUrl(), apiKey: getQwenApiKey(), model: QWEN_MODEL, onRotate: rotateQwenKey };
    case 'kimi':     return { url: kimiUrl(), apiKey: getKimiApiKey(), model: KIMI_MODEL, onRotate: rotateKimiKey };
    case 'hf':       return { url: hfUrl(), apiKey: getHfToken(), model: HF_MODEL, onRotate: rotateHfToken };
    case 'deepseek': return { url: deepseekUrl(), apiKey: getDeepSeekApiKey(), model: DEEPSEEK_MODEL, onRotate: rotateDeepSeekKey };
    default:         throw new Error(`${provider}: streaming not supported`);
  }
}

async function* streamGemini(
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): AsyncGenerator<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const systemMsg = messages.find(m => m.role === 'system');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const model = GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${getGeminiApiKey()}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (res.status === 429 || res.status === 401 || res.status === 403) rotateGeminiKey();
      throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 200)}`);
    }

    if (!res.body) throw new Error('Gemini: no response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function* streamFromProvider(
  provider: LLMProvider,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): AsyncGenerator<string> {
  if (provider === 'gemini') {
    yield* streamGemini(messages, maxTokens, temperature, timeoutMs);
    return;
  }

  const { url, apiKey, model, extraHeaders, onRotate } = getStreamConfig(provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (res.status === 429 || res.status === 401) onRotate();
      throw new Error(`${provider} ${res.status}: ${errBody.slice(0, 200)}`);
    }

    if (!res.body) throw new Error(`${provider}: no response body`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Streaming with Tool Calls ──────────────────────────────

import type {
  ToolDefinition,
  ToolCall,
  LLMStreamChunk,
  LLMStreamWithToolsOptions,
} from './douni/types';

/**
 * SSE 스트리밍 + Function Calling.
 * 텍스트 청크와 tool_call 청크를 구조화된 LLMStreamChunk로 yield.
 * tool_call이 나오면 caller가 실행 후 재호출해야 함.
 */
export async function* callLLMStreamWithTools(
  options: LLMStreamWithToolsOptions,
): AsyncGenerator<LLMStreamChunk> {
  const { messages, tools, maxTokens = 1024, temperature = 0.6, timeoutMs = 30000 } = options;
  const providers = availableProviders();
  if (providers.length === 0) throw new Error('No LLM provider available');

  const preferred = options.provider;
  // Gemini/Ollama don't support OpenAI tool calling format — exclude
  type ToolCapableProvider = Exclude<LLMProvider, 'gemini' | 'ollama'>;
  const toolProviders = providers.filter(
    (p): p is ToolCapableProvider => p !== 'gemini' && p !== 'ollama',
  );
  const ordered: ToolCapableProvider[] = preferred && toolProviders.includes(preferred as ToolCapableProvider)
    ? [preferred as ToolCapableProvider, ...toolProviders.filter(p => p !== preferred)]
    : toolProviders;

  if (ordered.length === 0) {
    throw new Error('No tool-calling capable provider available');
  }

  let lastError: Error | null = null;

  for (const provider of ordered) {
    // Groq has ~13 rotating keys — on 429 retry same provider with next key before falling to next provider
    const maxAttempts = provider === 'groq' ? 5 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        yield* streamFromProviderWithTools(provider, messages, tools, maxTokens, temperature, timeoutMs);
        return;
      } catch (err: any) {
        lastError = err;
        const is429 = /\s429(?::|\s)/.test(err.message || '');
        const shouldRetrySame = provider === 'groq' && is429 && attempt < maxAttempts - 1;
        console.warn(
          `[llmService] ${provider} tool stream failed${shouldRetrySame ? ` (retry ${attempt + 1}/${maxAttempts} with rotated key)` : ''}: ${err.message}`,
        );
        if (shouldRetrySame) continue; // rotateGroqKey() was already called in streamFromProviderWithTools on 429
        break; // fall to next provider
      }
    }
  }
  throw lastError ?? new Error('All tool-calling providers failed');
}

async function* streamFromProviderWithTools(
  provider: LLMProvider,
  messages: LLMMessage[],
  tools: ToolDefinition[],
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): AsyncGenerator<LLMStreamChunk> {
  const { url, apiKey, model, extraHeaders } = getStreamConfig(provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // HF: normalize messages — merge multiple system msgs, convert tool→user
  let normalizedMessages = messages;
  if (provider === 'hf') {
    const systemParts: string[] = [];
    const rest: LLMMessage[] = [];
    for (const m of messages) {
      if (m.role === 'system') {
        systemParts.push(m.content ?? '');
      } else if (m.role === 'tool') {
        // HF doesn't support tool role — convert to user message
        rest.push({ role: 'user', content: `[Tool Result: ${m.name}]\n${m.content}` });
      } else if (m.role === 'assistant' && m.tool_calls) {
        // Strip tool_calls from assistant messages for HF
        const toolNames = m.tool_calls.map(tc => tc.function.name).join(', ');
        rest.push({ role: 'assistant', content: m.content || `[Called tools: ${toolNames}]` });
      } else {
        rest.push(m);
      }
    }
    normalizedMessages = [
      { role: 'system' as const, content: systemParts.join('\n\n') },
      ...rest,
    ];
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    // HF: don't send tools (not reliably supported for all HF models)
    const bodyTools = provider === 'hf' ? undefined : tools;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: normalizedMessages,
        ...(bodyTools ? { tools: bodyTools } : {}),
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      if (res.status === 429 || res.status === 401) {
        // Universal rotation — every provider's streaming path honours 429/401 failover
        if (provider === 'groq') rotateGroqKey();
        else if (provider === 'cerebras') rotateCerebrasKey();
        else if (provider === 'hf') rotateHfToken();
        else if (provider === 'deepseek') rotateDeepSeekKey();
        else if (provider === 'qwen') rotateQwenKey();
        else if (provider === 'grok') rotateGrokKey();
        else if (provider === 'kimi') rotateKimiKey();
        else if (provider === 'mistral') rotateMistralKey();
        else if (provider === 'openrouter') rotateOpenRouterKey();
      }
      throw new Error(`${provider} ${res.status}: ${errBody.slice(0, 200)}`);
    }

    if (!res.body) throw new Error(`${provider}: no response body`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulate tool calls across chunks
    const pendingToolCalls: Map<number, ToolCall> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          yield { type: 'done' };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            yield { type: 'text_delta', text: delta.content };
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;

              if (tc.id) {
                // New tool call start
                const toolCall: ToolCall = {
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? '',
                  },
                };
                pendingToolCalls.set(idx, toolCall);
                yield { type: 'tool_call_start', toolCall };
              } else if (tc.function?.arguments) {
                // Continuation of arguments
                const existing = pendingToolCalls.get(idx);
                if (existing) {
                  existing.function.arguments += tc.function.arguments;
                }
                yield { type: 'tool_call_delta', index: idx, arguments: tc.function.arguments };
              }
            }
          }

          // Check finish reason
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === 'tool_calls' || finishReason === 'stop') {
            // Emit completed tool calls
            for (const [idx, tc] of pendingToolCalls) {
              yield { type: 'tool_call_done', index: idx };
            }
          }
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

/** 현재 사용 중인 provider 이름 반환 (UI 표시용) */
export function getCurrentProvider(): LLMProvider | null {
  return getAvailableProvider();
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
    `You are ${ctx.agentId}, a specialized crypto trading analysis agent in the wtd terminal.`,
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
    'You are the ORCHESTRATOR, the lead AI commander of the wtd 8-agent crypto intelligence system.',
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
