/**
 * Qdrant REST Client
 * localhost:6333 vector DB wrapper.
 * battle_engine.py memory_service.query() 의 TS 대체.
 */

import { env } from '$env/dynamic/private';
import type { MemoryCard } from '$lib/contracts/signals';

const QDRANT_URL = env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'cogochi_memories';
const DEFAULT_TIMEOUT = 3000;

interface QdrantFilter {
	agentId?: string;
	kind?: string;
	maxCreatedAt?: number;
}

export async function qdrantSearch(
	vector: number[],
	topK: number = 5,
	filter?: QdrantFilter,
): Promise<MemoryCard[]> {
	const must: Record<string, unknown>[] = [];
	if (filter?.agentId) {
		must.push({ key: 'agentId', match: { value: filter.agentId } });
	}
	if (filter?.kind) {
		must.push({ key: 'kind', match: { value: filter.kind } });
	}

	try {
		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector,
				limit: topK,
				with_payload: true,
				filter: must.length > 0 ? { must } : undefined,
			}),
			signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
		});

		if (!res.ok) {
			console.warn(`[qdrant] search HTTP ${res.status}`);
			return [];
		}

		const data = await res.json();
		const results: MemoryCard[] = (data.result ?? []).map(
			(hit: { id: string; payload: Record<string, unknown>; score: number }) => ({
				id: String(hit.id),
				agentId: String(hit.payload.agentId ?? ''),
				kind: String(hit.payload.kind ?? 'MATCH_SUMMARY'),
				content: String(hit.payload.content ?? ''),
				importance: Number(hit.payload.importance ?? 0),
				createdAt: Number(hit.payload.createdAt ?? 0),
			}),
		);

		return results;
	} catch (err) {
		console.warn('[qdrant] search failed:', err);
		return [];
	}
}

export async function qdrantUpsert(
	id: string,
	vector: number[],
	payload: Record<string, unknown>,
): Promise<boolean> {
	try {
		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				points: [{ id, vector, payload }],
			}),
			signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function qdrantDelete(id: string): Promise<boolean> {
	try {
		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ points: [id] }),
			signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function qdrantEnsureCollection(vectorSize: number = 256): Promise<boolean> {
	try {
		const check = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
			signal: AbortSignal.timeout(2000),
		});
		if (check.ok) return true;

		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vectors: { size: vectorSize, distance: 'Cosine' },
			}),
			signal: AbortSignal.timeout(5000),
		});
		return res.ok;
	} catch {
		return false;
	}
}
