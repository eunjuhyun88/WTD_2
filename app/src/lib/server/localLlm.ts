import type { LLMMessage } from './llmService';
import type { DouniSSEEvent } from './douni/types';

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen3:1.7b';

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '::1' || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function resolveLoopbackOllamaChatUrl(endpoint?: string): string {
  const raw = endpoint?.trim() || DEFAULT_OLLAMA_ENDPOINT;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid Ollama endpoint URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Ollama endpoint must use http or https');
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error('Ollama endpoint must be localhost, 127.0.0.1, or ::1');
  }

  url.pathname = '/v1/chat/completions';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function normalizeOllamaModel(model?: string): string {
  return model?.trim() || DEFAULT_OLLAMA_MODEL;
}

function disableThinking(messages: LLMMessage[]): LLMMessage[] {
  const [first, ...rest] = messages;
  if (first?.role === 'system') {
    return [{ ...first, content: `/no_think\n${first.content ?? ''}` }, ...rest];
  }
  return [{ role: 'system', content: '/no_think' }, ...messages];
}

export async function* streamLoopbackOllamaChat(options: {
  messages: LLMMessage[];
  endpoint?: string;
  model?: string;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
}): AsyncGenerator<DouniSSEEvent> {
  const url = resolveLoopbackOllamaChatUrl(options.endpoint);
  const model = normalizeOllamaModel(options.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: disableThinking(options.messages),
        stream: true,
        think: false,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => '');
      throw new Error(`Ollama ${res.status}: ${err.slice(0, 200)}`);
    }

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

        const raw = trimmed.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;

        try {
          const delta = JSON.parse(raw)?.choices?.[0]?.delta?.content;
          if (delta) yield { type: 'text_delta', text: delta };
        } catch {
          // Ignore malformed stream chunks; the final request failure path is handled above.
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  yield { type: 'done', provider: 'ollama' };
}
