/**
 * Ollama HTTP Client
 * localhost:11434 REST API wrapper.
 * battle_engine.py ollama_client.infer() 의 TS 포팅.
 */

import { env } from '$env/dynamic/private';

const OLLAMA_URL = env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_TIMEOUT = 5000;

interface OllamaOptions {
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
}

export async function ollamaGenerate(
	model: string,
	prompt: string,
	options: OllamaOptions = {},
): Promise<string | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				stream: false,
				format: 'json',
				options: {
					temperature: options.temperature ?? 0.2,
					top_p: options.top_p ?? 0.9,
					num_predict: options.max_tokens ?? 200,
				},
			}),
			signal: controller.signal,
		});

		if (!res.ok) {
			console.error(`[ollama] HTTP ${res.status}: ${await res.text().catch(() => '')}`);
			return null;
		}

		const data = await res.json();
		return typeof data.response === 'string' ? data.response : null;
	} catch (err: unknown) {
		if (err instanceof Error && err.name === 'AbortError') {
			console.warn('[ollama] timeout');
		} else {
			console.error('[ollama] error:', err);
		}
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function ollamaChat(
	model: string,
	messages: Array<{ role: string; content: string }>,
	options: OllamaOptions = {},
): Promise<string | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

	try {
		const res = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages,
				stream: false,
				format: 'json',
				options: {
					temperature: options.temperature ?? 0.2,
					top_p: options.top_p ?? 0.9,
				},
			}),
			signal: controller.signal,
		});

		if (!res.ok) return null;
		const data = await res.json();
		return data.message?.content ?? null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function ollamaHealthCheck(): Promise<boolean> {
	try {
		const res = await fetch(`${OLLAMA_URL}/api/tags`, {
			signal: AbortSignal.timeout(2000),
		});
		return res.ok;
	} catch {
		return false;
	}
}
