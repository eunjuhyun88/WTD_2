import { describe, expect, it } from 'vitest';
import { normalizeOllamaModel, resolveLoopbackOllamaChatUrl } from './localLlm';

describe('localLlm', () => {
  it('resolves loopback Ollama endpoints to the OpenAI-compatible chat path', () => {
    expect(resolveLoopbackOllamaChatUrl('http://localhost:11434')).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
    expect(resolveLoopbackOllamaChatUrl('http://127.0.0.1:11434/api/tags')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    );
  });

  it('rejects non-loopback endpoints', () => {
    expect(() => resolveLoopbackOllamaChatUrl('https://example.com:11434')).toThrow(/localhost/i);
    expect(() => resolveLoopbackOllamaChatUrl('file:///tmp/model')).toThrow(/http/i);
  });

  it('normalizes empty model names', () => {
    expect(normalizeOllamaModel(' gemma3:27b ')).toBe('gemma3:27b');
    expect(normalizeOllamaModel('')).toBe('qwen3:1.7b');
  });
});
