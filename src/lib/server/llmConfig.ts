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

// ─── Groq ─────────────────────────────────────────────────────

export const GROQ_API_KEY = env.GROQ_API_KEY ?? '';
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

const PLACEHOLDER_HINTS = ['your_', 'your-', 'placeholder', 'changeme', 'example', 'dummy', '<'];

function isUsableApiKey(value: string, minLength = 16): boolean {
  const trimmed = value.trim();
  if (trimmed.length < minLength) return false;
  const lower = trimmed.toLowerCase();
  return !PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

// ─── Availability Check ───────────────────────────────────────

export function isGeminiAvailable(): boolean {
  return isUsableApiKey(GEMINI_API_KEY, 20);
}

export function isGroqAvailable(): boolean {
  return isUsableApiKey(GROQ_API_KEY, 20);
}

export function isDeepSeekAvailable(): boolean {
  return isUsableApiKey(DEEPSEEK_API_KEY, 20);
}

export type LLMProvider = 'groq' | 'gemini' | 'deepseek';

/** 우선순위: Groq(가장 빠름) → DeepSeek(추론 강함) → Gemini */
export function getAvailableProvider(): LLMProvider | null {
  if (isGroqAvailable()) return 'groq';
  if (isDeepSeekAvailable()) return 'deepseek';
  if (isGeminiAvailable()) return 'gemini';
  return null;
}
