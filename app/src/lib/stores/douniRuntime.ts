// ═══════════════════════════════════════════════════════════════
// douniRuntime — 4-mode AI runtime store (localStorage-persisted)
// ═══════════════════════════════════════════════════════════════
//
// Modes:
//   TERMINAL   — data only, no AI call (Bloomberg-style)
//   HEURISTIC  — server-side template synthesis, no LLM (default)
//   OLLAMA     — local Ollama LLM (uses server env OLLAMA_BASE_URL)
//   API        — external provider with user's own API key

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type DouniMode = 'TERMINAL' | 'HEURISTIC' | 'OLLAMA' | 'API';

export interface DouniRuntimeConfig {
  mode: DouniMode;
  /** API mode: provider name (groq / cerebras / mistral / openrouter / deepseek) */
  provider: string;
  /** API mode: user's own API key */
  apiKey: string;
  /** OLLAMA mode: model name */
  ollamaModel: string;
  /** OLLAMA mode: Ollama server endpoint */
  ollamaEndpoint: string;
}

const STORAGE_KEY = 'douni_runtime';
const APIKEY_STORAGE = 'douni_api_key';

const DEFAULT: DouniRuntimeConfig = {
  mode: 'HEURISTIC',
  provider: 'groq',
  apiKey: '',
  ollamaModel: 'mistral:7b',
  ollamaEndpoint: 'http://localhost:11434',
};

function loadFromStorage(): DouniRuntimeConfig {
  if (!browser) return { ...DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const apiKey = localStorage.getItem(APIKEY_STORAGE) ?? '';
    return { ...DEFAULT, ...(raw ? JSON.parse(raw) : {}), apiKey };
  } catch {
    return { ...DEFAULT };
  }
}

function persistToStorage(c: DouniRuntimeConfig): void {
  if (!browser) return;
  const { apiKey, ...rest } = c;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  if (apiKey) {
    localStorage.setItem(APIKEY_STORAGE, apiKey);
  } else {
    localStorage.removeItem(APIKEY_STORAGE);
  }
}

function createRuntimeStore() {
  const { subscribe, update } = writable<DouniRuntimeConfig>(loadFromStorage());

  function patch(partial: Partial<DouniRuntimeConfig>) {
    update(c => {
      const next = { ...c, ...partial };
      persistToStorage(next);
      return next;
    });
  }

  return {
    subscribe,
    patch,
    setMode: (mode: DouniMode) => patch({ mode }),
  };
}

export const douniRuntimeStore = createRuntimeStore();

/** Non-reactive snapshot — safe inside async functions */
export const getDouniRuntime = () => get(douniRuntimeStore);
