// ═══════════════════════════════════════════════════════════════
// LLM Configuration (server-side only)
// ═══════════════════════════════════════════════════════════════
//
// 모든 LLM 호출은 이 모듈을 통해 키/엔드포인트를 가져온다.
// 클라이언트 번들에 절대 포함되지 않음 ($lib/server/ 경로).

import { env } from '$env/dynamic/private';
import {
  buildPool,
  discoverKeysFromEnv,
  type EnvSource,
  type KeyPool,
} from './keyPoolDiscovery';

// ─── Key Rotation Pool Factory ────────────────────────────────
// Every LLM provider shares the same rotation shape:
//   XXX_API_KEY            — primary key (singular, legacy + backward-compat)
//   XXX_API_KEYS           — optional comma-separated rotation pool
// The factory merges both into a single de-duped list and exposes
//   get()    — current active key (respects rotation index)
//   rotate() — advance to next key on 429/401
//   count()  — pool size (0 = unconfigured)
//   primary  — first key in pool (backward-compat constant)
// Pool state is process-local in-memory; rotation index resets on
// cold start. This is intentional for rate-limit forgiveness.
//
// `createKeyPoolWithDiscovery` extends the base factory by also
// scanning the environment for **variant** slots (`KEY__SUFFIX`,
// `KEYS__SUFFIX`) and **alias** slots (alternate env var names for
// the same credential, e.g. `HF_TOKEN` ↔ `HUGGINGFACE_API_KEY`).
// The pure discovery logic lives in `./keyPoolDiscovery.ts` so
// research smokes can test it without a SvelteKit context.

export type { KeyPool };

function createKeyPool(primary: string | undefined, rotation: string | undefined): KeyPool {
  const keys: string[] = [];
  if (primary) keys.push(primary);
  if (rotation) {
    for (const k of rotation.split(',')) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  }
  return buildPool(keys);
}

function createKeyPoolWithDiscovery(
  primaryName: string,
  poolName: string,
  aliasNames: readonly string[] = [],
): KeyPool {
  return buildPool(
    discoverKeysFromEnv(env as unknown as EnvSource, primaryName, poolName, aliasNames),
  );
}

// ─── Gemini (Google, with key rotation) ───────────────────────

const geminiPool = createKeyPoolWithDiscovery('GEMINI_API_KEY', 'GEMINI_API_KEYS');
export const getGeminiApiKey = (): string => geminiPool.get();
export const rotateGeminiKey = (): void => geminiPool.rotate();
export const getGeminiKeyCount = (): number => geminiPool.count();
export const GEMINI_API_KEY = geminiPool.primary;
export const GEMINI_MODEL = 'gemini-2.0-flash';
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

export function geminiUrl(model = GEMINI_MODEL): string {
  return `${GEMINI_ENDPOINT}/models/${model}:generateContent`;
}

// ─── Groq (with key rotation, discovery-aware) ────────────────

const groqPool = createKeyPoolWithDiscovery('GROQ_API_KEY', 'GROQ_API_KEYS');

export function getGroqApiKey(): string {
  return groqPool.get();
}

export function rotateGroqKey(): void {
  groqPool.rotate();
}

export const getGroqKeyCount = (): number => groqPool.count();
export const GROQ_API_KEY = groqPool.primary;
export const GROQ_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1';

export function groqUrl(path = '/chat/completions'): string {
  return `${GROQ_ENDPOINT}${path}`;
}

// ─── DeepSeek (with key rotation) ─────────────────────────────

const deepseekPool = createKeyPoolWithDiscovery('DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEYS');
export const getDeepSeekApiKey = (): string => deepseekPool.get();
export const rotateDeepSeekKey = (): void => deepseekPool.rotate();
export const getDeepSeekKeyCount = (): number => deepseekPool.count();
export const DEEPSEEK_API_KEY = deepseekPool.primary;
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1';

export function deepseekUrl(path = '/chat/completions'): string {
  return `${DEEPSEEK_ENDPOINT}${path}`;
}

// ─── Qwen (Alibaba DashScope, with key rotation) ──────────────

const qwenPool = createKeyPoolWithDiscovery('QWEN_API_KEY', 'QWEN_API_KEYS');
export const getQwenApiKey = (): string => qwenPool.get();
export const rotateQwenKey = (): void => qwenPool.rotate();
export const getQwenKeyCount = (): number => qwenPool.count();
export const QWEN_API_KEY = qwenPool.primary;
export const QWEN_MODEL = env.QWEN_MODEL ?? 'qwen-plus-latest';
export const QWEN_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export function qwenUrl(path = '/chat/completions'): string {
  return `${QWEN_ENDPOINT}${path}`;
}

// ─── Grok (xAI, with key rotation) ────────────────────────────

const grokPool = createKeyPoolWithDiscovery('GROK_API_KEY', 'GROK_API_KEYS');
export const getGrokApiKey = (): string => grokPool.get();
export const rotateGrokKey = (): void => grokPool.rotate();
export const getGrokKeyCount = (): number => grokPool.count();
export const GROK_API_KEY = grokPool.primary;
export const GROK_MODEL = env.GROK_MODEL ?? 'grok-4-1-fast-reasoning';
export const GROK_ENDPOINT = 'https://api.x.ai/v1';

export function grokUrl(path = '/chat/completions'): string {
  return `${GROK_ENDPOINT}${path}`;
}

// ─── Kimi (Moonshot, with key rotation) ───────────────────────

const kimiPool = createKeyPoolWithDiscovery('KIMI_API_KEY', 'KIMI_API_KEYS');
export const getKimiApiKey = (): string => kimiPool.get();
export const rotateKimiKey = (): void => kimiPool.rotate();
export const getKimiKeyCount = (): number => kimiPool.count();
export const KIMI_API_KEY = kimiPool.primary;
export const KIMI_MODEL = env.KIMI_MODEL ?? 'kimi-k2.6';
export const KIMI_ENDPOINT = 'https://api.moonshot.ai/v1';

export function kimiUrl(path = '/chat/completions'): string {
  return `${KIMI_ENDPOINT}${path}`;
}

// ─── HuggingFace Inference API (OpenAI-compatible router, with token rotation) ──

// HF picks up `HUGGINGFACE_API_KEY` and `HUGGING_FACE_HUB_TOKEN`
// as aliases — the same credential type ships under three env-var
// names depending on the SDK / library version.
const hfPool = createKeyPoolWithDiscovery('HF_TOKEN', 'HF_TOKENS', [
  'HUGGINGFACE_API_KEY',
  'HUGGING_FACE_HUB_TOKEN',
]);
export const getHfToken = (): string => hfPool.get();
export const rotateHfToken = (): void => hfPool.rotate();
export const getHfTokenCount = (): number => hfPool.count();
export const HF_TOKEN = hfPool.primary;
export const HF_MODEL = env.HF_MODEL ?? 'Qwen/Qwen2.5-72B-Instruct';
export const HF_ENDPOINT = 'https://router.huggingface.co/v1';

export function hfUrl(path = '/chat/completions'): string {
  return `${HF_ENDPOINT}${path}`;
}

// ─── Cerebras (blazing fast, OpenAI-compatible, with key rotation) ───

const cerebrasPool = createKeyPoolWithDiscovery('CEREBRAS_API_KEY', 'CEREBRAS_API_KEYS');
export const getCerebrasApiKey = (): string => cerebrasPool.get();
export const rotateCerebrasKey = (): void => cerebrasPool.rotate();
export const getCerebrasKeyCount = (): number => cerebrasPool.count();
export const CEREBRAS_API_KEY = cerebrasPool.primary;
export const CEREBRAS_MODEL = env.CEREBRAS_MODEL ?? 'qwen-3-235b-a22b-instruct-2507';
export const CEREBRAS_ENDPOINT = 'https://api.cerebras.ai/v1';

export function cerebrasUrl(path = '/chat/completions'): string {
  return `${CEREBRAS_ENDPOINT}${path}`;
}

// ─── Mistral La Plateforme (OpenAI-compatible, with key rotation) ─

const mistralPool = createKeyPoolWithDiscovery('MISTRAL_API_KEY', 'MISTRAL_API_KEYS');
export const getMistralApiKey = (): string => mistralPool.get();
export const rotateMistralKey = (): void => mistralPool.rotate();
export const getMistralKeyCount = (): number => mistralPool.count();
export const MISTRAL_API_KEY = mistralPool.primary;
export const MISTRAL_MODEL = env.MISTRAL_MODEL ?? 'mistral-medium-latest';
export const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1';

export function mistralUrl(path = '/chat/completions'): string {
  return `${MISTRAL_ENDPOINT}${path}`;
}

// ─── OpenRouter (aggregator, OpenAI-compatible, with key rotation) ─

const openrouterPool = createKeyPoolWithDiscovery('OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS');
export const getOpenRouterApiKey = (): string => openrouterPool.get();
export const rotateOpenRouterKey = (): void => openrouterPool.rotate();
export const getOpenRouterKeyCount = (): number => openrouterPool.count();
export const OPENROUTER_API_KEY = openrouterPool.primary;
export const OPENROUTER_MODEL = env.OPENROUTER_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b:free';
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1';
export const OPENROUTER_SITE_URL = env.OPENROUTER_SITE_URL ?? 'http://localhost:5173';
export const OPENROUTER_APP_NAME = env.OPENROUTER_APP_NAME ?? 'WTD';

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

function isPoolAvailable(pool: KeyPool, minLength = 20): boolean {
  return pool.count() > 0 && pool.keys.some((k) => isUsableApiKey(k, minLength));
}

export function isGeminiAvailable(): boolean {
  return isPoolAvailable(geminiPool, 20);
}

export function isDeepSeekAvailable(): boolean {
  return isPoolAvailable(deepseekPool, 20);
}

export function isQwenAvailable(): boolean {
  return isPoolAvailable(qwenPool, 20);
}

export function isGrokAvailable(): boolean {
  return isPoolAvailable(grokPool, 20);
}

export function isKimiAvailable(): boolean {
  return isPoolAvailable(kimiPool, 20);
}

export function isHfAvailable(): boolean {
  return isPoolAvailable(hfPool, 10);
}

export function isCerebrasAvailable(): boolean {
  return isPoolAvailable(cerebrasPool, 20);
}

export function isMistralAvailable(): boolean {
  return isPoolAvailable(mistralPool, 20);
}

export function isOpenRouterAvailable(): boolean {
  return isPoolAvailable(openrouterPool, 20);
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
