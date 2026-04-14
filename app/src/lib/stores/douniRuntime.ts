// ═══════════════════════════════════════════════════════════════
// douniRuntime — 4-mode AI runtime store (localStorage-persisted)
// ═══════════════════════════════════════════════════════════════
//
// Modes:
//   TERMINAL   — data only, no AI call (Bloomberg-style)
//   HEURISTIC  — server-side template synthesis, no LLM
//   OLLAMA     — local Ollama LLM (uses server env OLLAMA_BASE_URL)
//   API        — full AI path via server provider pool or user's own API key (default)

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
const LEGACY_MIGRATION_KEY = 'douni_runtime_migrated_v2';

const DEFAULT: DouniRuntimeConfig = {
  mode: 'API',
  provider: 'groq',
  apiKey: '',
  ollamaModel: 'mistral:7b',
  ollamaEndpoint: 'http://localhost:11434',
};

const LEGACY_DEFAULT: Omit<DouniRuntimeConfig, 'apiKey'> = {
  mode: 'HEURISTIC',
  provider: 'groq',
  ollamaModel: 'mistral:7b',
  ollamaEndpoint: 'http://localhost:11434',
};

function matchesLegacyDefault(config: Partial<DouniRuntimeConfig>): boolean {
  return (
    config.mode === LEGACY_DEFAULT.mode &&
    (config.provider ?? LEGACY_DEFAULT.provider) === LEGACY_DEFAULT.provider &&
    (config.ollamaModel ?? LEGACY_DEFAULT.ollamaModel) === LEGACY_DEFAULT.ollamaModel &&
    (config.ollamaEndpoint ?? LEGACY_DEFAULT.ollamaEndpoint) === LEGACY_DEFAULT.ollamaEndpoint
  );
}

function loadFromStorage(): DouniRuntimeConfig {
  if (!browser) return { ...DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const apiKey = localStorage.getItem(APIKEY_STORAGE) ?? '';
    if (!raw) return { ...DEFAULT, apiKey };

    const parsed = JSON.parse(raw) as Partial<DouniRuntimeConfig>;
    const shouldUpgradeLegacyDefault =
      localStorage.getItem(LEGACY_MIGRATION_KEY) !== '1' &&
      !apiKey &&
      matchesLegacyDefault(parsed);

    const next = {
      ...DEFAULT,
      ...parsed,
      apiKey,
      mode: shouldUpgradeLegacyDefault ? DEFAULT.mode : (parsed.mode ?? DEFAULT.mode),
    };

    if (shouldUpgradeLegacyDefault) {
      persistToStorage(next);
    }
    localStorage.setItem(LEGACY_MIGRATION_KEY, '1');

    return next;
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
