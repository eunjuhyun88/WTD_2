import type {
	AgentContextEvidence,
	AgentContextPack,
	AgentContextRuntimeCaptureSummary,
	AgentContextRuntimeSummary
} from '$lib/contracts/agent/agentContext';
import type { RuntimeCaptureListResponse, CaptureRecord } from '$lib/contracts/runtime/captures';
import type { ScanResult } from '$lib/contracts/search/scan';
import type { SeedSearchResult } from '$lib/contracts/search/seedSearch';
import { fetchFactContextProxy } from '$lib/server/enginePlanes/facts';
import { fetchRuntimeCaptureListProxy } from '$lib/server/enginePlanes/runtime';
import { fetchSearchScanRunProxy, fetchSeedSearchRunProxy } from '$lib/server/enginePlanes/search';

type ServerFetch = typeof fetch;

export interface LoadAgentContextPackOptions {
	fetchFn: ServerFetch;
	symbol: string;
	timeframe: string;
	userId?: string | null;
	scanId?: string | null;
	seedRunId?: string | null;
	captureLimit?: number;
	offline?: boolean;
}

const DEFAULT_CAPTURE_LIMIT = 5;

function summarizeCapture(capture: CaptureRecord): AgentContextRuntimeCaptureSummary {
	return {
		id: capture.capture_id,
		kind: capture.capture_kind,
		symbol: capture.symbol,
		timeframe: capture.timeframe,
		status: capture.status,
		captured_at_ms: capture.captured_at_ms,
		pattern_slug: capture.pattern_slug ?? null,
		phase: capture.phase ?? null,
		user_note: capture.user_note ?? null,
		scan_id: capture.scan_id ?? null,
		candidate_id: capture.candidate_id ?? null,
		verdict_id: capture.verdict_id ?? null,
		outcome_id: capture.outcome_id ?? null,
	};
}

function summarizeRuntime(
	payload: RuntimeCaptureListResponse | null,
): AgentContextRuntimeSummary {
	if (!payload) {
		return {
			status: 'unavailable',
			generated_at: null,
			captures: [],
		};
	}

	return {
		status: payload.status,
		generated_at: payload.generated_at,
		captures: payload.captures.map(summarizeCapture),
	};
}

function buildEvidence(
	facts: AgentContextPack['facts'],
	scan: ScanResult | null,
	seedSearch: SeedSearchResult | null,
	runtime: AgentContextRuntimeSummary,
): AgentContextEvidence[] {
	const evidence: AgentContextEvidence[] = [];
	if (facts?.status) {
		evidence.push({ metric: 'fact_state', value: facts.status, state: facts.status });
	}
	if (facts?.confluence?.verdict) {
		evidence.push({
			metric: 'confluence',
			value: facts.confluence.verdict,
			state: facts.confluence.regime ?? null,
		});
	}
	if (scan) {
		evidence.push({
			metric: 'scan_candidates',
			value: String(scan.candidates.length),
			state: scan.status,
		});
	}
	if (seedSearch) {
		evidence.push({
			metric: 'seed_search_candidates',
			value: String(seedSearch.candidates.length),
			state: seedSearch.status,
		});
	}
	evidence.push({
		metric: 'runtime_captures',
		value: String(runtime.captures.length),
		state: runtime.status,
	});
	return evidence;
}

export async function loadAgentContextPack(
	options: LoadAgentContextPackOptions,
): Promise<AgentContextPack> {
	const { fetchFn, symbol, timeframe } = options;
	const captureLimit = options.captureLimit ?? DEFAULT_CAPTURE_LIMIT;

	const [facts, scan, seedSearch, runtimePayload] = await Promise.all([
		fetchFactContextProxy(fetchFn, {
			symbol,
			timeframe,
			offline: options.offline ?? true,
		}),
		options.scanId ? fetchSearchScanRunProxy(fetchFn, options.scanId) : Promise.resolve(null),
		options.seedRunId ? fetchSeedSearchRunProxy(fetchFn, options.seedRunId) : Promise.resolve(null),
		fetchRuntimeCaptureListProxy(fetchFn, {
			userId: options.userId ?? undefined,
			symbol,
			limit: captureLimit,
		}),
	]);

	const runtime = summarizeRuntime(runtimePayload);

	return {
		symbol,
		timeframe,
		facts,
		scan,
		seed_search: seedSearch,
		runtime,
		evidence: buildEvidence(facts, scan, seedSearch, runtime),
	};
}
