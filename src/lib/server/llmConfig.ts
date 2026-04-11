// ═══════════════════════════════════════════════════════════════
// Stockclaw — LLM Configuration (server-side only)
// ═══════════════════════════════════════════════════════════════
//
// 모든 LLM 호출은 이 모듈을 통해 키/엔드포인트를 가져온다.
// 클라이언트 번들에 절대 포함되지 않음 ($lib/server/ 경로).

import { env } from '$env/dynamic/private';

// ─── Gemini (Google) ──────────────────────────────────────────

export const GEMINI_API_KEY = env.GEMINI_API_KEY ?? '';
export const GEMINI_MODEL = 'gemini-2.0-flash';
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

export function geminiUrl(model = GEMINI_MODEL): string {
  return `${GEMINI_ENDPOINT}/models/${model}:generateContent`;
}

// ─── Groq (with key rotation) ─────────────────────────────────

const GROQ_KEYS: string[] = (() => {
  const keys: string[] = [];
  // Primary key
  if (env.GROQ_API_KEY) keys.push(env.GROQ_API_KEY);
  // Rotation keys (comma-separated)
  if (env.GROQ_API_KEYS) {
    for (const k of env.GROQ_API_KEYS.split(',')) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  }
  return keys;
})();

let _groqKeyIdx = 0;

export function getGroqApiKey(): string {
  if (GROQ_KEYS.length === 0) return '';
  const key = GROQ_KEYS[_groqKeyIdx % GROQ_KEYS.length];
  return key;
}

export function rotateGroqKey(): void {
  if (GROQ_KEYS.length > 1) {
    _groqKeyIdx = (_groqKeyIdx + 1) % GROQ_KEYS.length;
  }
}

export const GROQ_API_KEY = GROQ_KEYS[0] ?? '';
export const GROQ_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1';

export function groqUrl(path = '/chat/completions'): string {
  return `${GROQ_ENDPOINT}${path}`;
}

// ─── DeepSeek ─────────────────────────────────────────────────

export const DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY ?? '';
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1';

export function deepseekUrl(path = '/chat/completions'): string {
  return `${DEEPSEEK_ENDPOINT}${path}`;
}

// ─── Qwen (Alibaba DashScope) ─────────────────────────────────

export const QWEN_API_KEY = env.QWEN_API_KEY ?? '';
export const QWEN_MODEL = env.QWEN_MODEL ?? 'qwen-plus-latest';
export const QWEN_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export function qwenUrl(path = '/chat/completions'): string {
  return `${QWEN_ENDPOINT}${path}`;
}

// ─── Grok (xAI) ───────────────────────────────────────────────

export const GROK_API_KEY = env.GROK_API_KEY ?? '';
export const GROK_MODEL = env.GROK_MODEL ?? 'grok-4-1-fast-reasoning';
export const GROK_ENDPOINT = 'https://api.x.ai/v1';

export function grokUrl(path = '/chat/completions'): string {
  return `${GROK_ENDPOINT}${path}`;
}

// ─── Kimi (Moonshot) ──────────────────────────────────────────

export const KIMI_API_KEY = env.KIMI_API_KEY ?? '';
export const KIMI_MODEL = env.KIMI_MODEL ?? 'kimi-k2.5';
export const KIMI_ENDPOINT = 'https://api.moonshot.ai/v1';

export function kimiUrl(path = '/chat/completions'): string {
  return `${KIMI_ENDPOINT}${path}`;
}

// ─── HuggingFace Inference API ─────────────────────────────────

export const HF_TOKEN = env.HF_TOKEN ?? '';
export const HF_MODEL = env.HF_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct';
export const HF_ENDPOINT = 'https://router.huggingface.co/v1';

export function hfUrl(path = '/chat/completions'): string {
  return `${HF_ENDPOINT}${path}`;
}

// ─── Cerebras (blazing fast, OpenAI-compatible) ───────────────

export const CEREBRAS_API_KEY = env.CEREBRAS_API_KEY ?? '';
export const CEREBRAS_MODEL = env.CEREBRAS_MODEL ?? 'qwen-3-235b-a22b-instruct-2507';
export const CEREBRAS_ENDPOINT = 'https://api.cerebras.ai/v1';

export function cerebrasUrl(path = '/chat/completions'): string {
  return `${CEREBRAS_ENDPOINT}${path}`;
}

// ─── Mistral La Plateforme (OpenAI-compatible) ────────────────

export const MISTRAL_API_KEY = env.MISTRAL_API_KEY ?? '';
export const MISTRAL_MODEL = env.MISTRAL_MODEL ?? 'mistral-medium-latest';
export const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1';

export function mistralUrl(path = '/chat/completions'): string {
  return `${MISTRAL_ENDPOINT}${path}`;
}

// ─── OpenRouter (aggregator, OpenAI-compatible) ───────────────

export const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY ?? '';
export const OPENROUTER_MODEL = env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b:free';
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1';
export const OPENROUTER_SITE_URL = env.OPENROUTER_SITE_URL ?? 'http://localhost:5173';
export const OPENROUTER_APP_NAME = env.OPENROUTER_APP_NAME ?? 'STOCKCLAW';

export function openrouterUrl(path = '/chat/completions'): string {
  return `${OPENROUTER_ENDPOINT}${path}`;
}

// ─── Ollama (Local LLM — no rate limits) ─────────────────────

export const OLLAMA_BASE_URL = env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
export const OLLAMA_MODEL = env.OLLAMA_MODEL ?? 'qwen3:1.7b';

export function ollamaUrl(path = '/api/generate'): string {
  return `${OLLAMA_BASE_URL}${path}`;
}

/** Ollama OpenAI-compatible chat endpoint (for streaming) */
export function ollamaChatUrl(path = '/v1/chat/completions'): string {
  return `${OLLAMA_BASE_URL}${path}`;
}

// ─── Availability Check ───────────────────────────────────────

const PLACEHOLDER_HINTS = ['your_', 'your-', 'placeholder', 'changeme', 'example', 'dummy', '<'];

function isUsableApiKey(value: string, minLength = 16): boolean {
  const trimmed = value.trim();
  if (trimmed.length < minLength) return false;
  const lower = trimmed.toLowerCase();
  return !PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

export function isOllamaAvailable(): boolean {
  return true; // local, no API key needed
}

export function isGroqAvailable(): boolean {
  return isUsableApiKey(GROQ_API_KEY, 20);
}

export function isGeminiAvailable(): boolean {
  return isUsableApiKey(GEMINI_API_KEY, 20);
}

export function isDeepSeekAvailable(): boolean {
  return isUsableApiKey(DEEPSEEK_API_KEY, 20);
}

export function isQwenAvailable(): boolean {
  return isUsableApiKey(QWEN_API_KEY, 20);
}

export function isGrokAvailable(): boolean {
  return isUsableApiKey(GROK_API_KEY, 20);
}

export function isKimiAvailable(): boolean {
  return isUsableApiKey(KIMI_API_KEY, 20);
}

export function isHfAvailable(): boolean {
  return isUsableApiKey(HF_TOKEN, 10);
}

export function isCerebrasAvailable(): boolean {
  return isUsableApiKey(CEREBRAS_API_KEY, 20);
}

export function isMistralAvailable(): boolean {
  return isUsableApiKey(MISTRAL_API_KEY, 20);
}

export function isOpenRouterAvailable(): boolean {
  return isUsableApiKey(OPENROUTER_API_KEY, 20);
}

// ─── Provider Type ────────────────────────────────────────────

export type LLMProvider =
  | 'ollama'
  | 'groq'
  | 'cerebras'
  | 'mistral'
  | 'openrouter'
  | 'grok'
  | 'qwen'
  | 'kimi'
  | 'hf'
  | 'deepseek'
  | 'gemini';

/** 우선순위: Cerebras(fast) → Groq(13 keys) → Mistral(500k TPM) → HF → OpenRouter → paid → Gemini → Ollama */
export function getAvailableProvider(): LLMProvider | null {
  if (isCerebrasAvailable()) return 'cerebras';
  if (isGroqAvailable()) return 'groq';
  if (isMistralAvailable()) return 'mistral';
  if (isHfAvailable()) return 'hf';
  if (isOpenRouterAvailable()) return 'openrouter';
  if (isGrokAvailable()) return 'grok';
  if (isKimiAvailable()) return 'kimi';
  if (isQwenAvailable()) return 'qwen';
  if (isDeepSeekAvailable()) return 'deepseek';
  if (isGeminiAvailable()) return 'gemini';
  if (isOllamaAvailable()) return 'ollama';
  return null;
}
