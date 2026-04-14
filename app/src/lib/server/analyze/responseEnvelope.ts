import type { PublicRouteCacheStatus } from '../publicRouteCache';

export type AnalyzeEngineMode = 'full' | 'deep_only' | 'score_only' | 'fallback';
export type AnalyzeRouteCacheStatus = PublicRouteCacheStatus | 'bypass';

export type AnalyzeResponseMeta = {
	ok: true;
	degraded: boolean;
	engine_mode: AnalyzeEngineMode;
	degraded_reason?: string;
	upstream_missing?: string[];
	request_id?: string;
	cache_status?: AnalyzeRouteCacheStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStringList(values: string[] | undefined): string[] | undefined {
	if (!values?.length) return undefined;
	const normalized = Array.from(
		new Set(
			values
				.map((value) => value.trim())
				.filter(Boolean),
		),
	);
	return normalized.length > 0 ? normalized : undefined;
}

function degradedReasonForMode(engineMode: AnalyzeEngineMode): string | undefined {
	if (engineMode === 'deep_only') return 'score_unavailable';
	if (engineMode === 'score_only') return 'deep_unavailable';
	if (engineMode === 'fallback') return 'engine_unreachable';
	return undefined;
}

export function createAnalyzePayloadMeta(args: {
	engineMode: AnalyzeEngineMode;
	degradedReason?: string;
	upstreamMissing?: string[];
}): AnalyzeResponseMeta {
	const degraded = args.engineMode !== 'full';
	const degradedReason = degraded
		? (args.degradedReason?.trim() || degradedReasonForMode(args.engineMode))
		: undefined;
	const upstreamMissing = normalizeStringList(args.upstreamMissing);

	return {
		ok: true,
		degraded,
		engine_mode: args.engineMode,
		...(degradedReason ? { degraded_reason: degradedReason } : {}),
		...(upstreamMissing ? { upstream_missing: upstreamMissing } : {}),
	};
}

export function readAnalyzeResponseMeta(payload: Record<string, unknown>): AnalyzeResponseMeta | null {
	const raw = payload.meta;
	if (!isRecord(raw)) return null;
	const engineMode = raw.engine_mode;
	if (
		engineMode !== 'full' &&
		engineMode !== 'deep_only' &&
		engineMode !== 'score_only' &&
		engineMode !== 'fallback'
	) {
		return null;
	}

	const degradedReason =
		typeof raw.degraded_reason === 'string' && raw.degraded_reason.trim().length > 0
			? raw.degraded_reason
			: undefined;
	const upstreamMissing = Array.isArray(raw.upstream_missing)
		? raw.upstream_missing.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		: undefined;
	const requestId =
		typeof raw.request_id === 'string' && raw.request_id.trim().length > 0 ? raw.request_id : undefined;
	const cacheStatus = raw.cache_status;

	return {
		ok: true,
		degraded: Boolean(raw.degraded),
		engine_mode: engineMode,
		...(degradedReason ? { degraded_reason: degradedReason } : {}),
		...(upstreamMissing?.length ? { upstream_missing: upstreamMissing } : {}),
		...(requestId ? { request_id: requestId } : {}),
		...(cacheStatus === 'hit' ||
		cacheStatus === 'miss' ||
		cacheStatus === 'coalesced' ||
		cacheStatus === 'bypass'
			? { cache_status: cacheStatus }
			: {}),
	};
}

export function attachAnalyzeRequestMeta(
	payload: Record<string, unknown>,
	args: {
		requestId: string;
		cacheStatus: AnalyzeRouteCacheStatus;
	},
): Record<string, unknown> {
	const currentMeta = readAnalyzeResponseMeta(payload) ?? {
		ok: true,
		degraded: false,
		engine_mode: 'full' as AnalyzeEngineMode,
	};

	return {
		...payload,
		meta: {
			...currentMeta,
			request_id: args.requestId,
			cache_status: args.cacheStatus,
		},
	};
}

export function createAnalyzeErrorEnvelope(args: {
	requestId: string;
	error: string;
	reason: string;
	status: number;
	upstream?: string;
	issues?: string[];
}): Record<string, unknown> {
	const issues = normalizeStringList(args.issues);
	return {
		ok: false,
		error: args.error,
		reason: args.reason,
		status: args.status,
		request_id: args.requestId,
		...(args.upstream ? { upstream: args.upstream } : {}),
		...(issues ? { issues } : {}),
	};
}

export function buildAnalyzeTraceHeaders(args: {
	requestId: string;
	cacheStatus?: AnalyzeRouteCacheStatus;
	payload?: Record<string, unknown>;
}): Record<string, string> {
	const meta = args.payload ? readAnalyzeResponseMeta(args.payload) : null;

	return {
		'x-request-id': args.requestId,
		...(args.cacheStatus ? { 'x-analyze-cache': args.cacheStatus } : {}),
		...(meta ? { 'x-analyze-engine': meta.engine_mode } : {}),
		...(meta ? { 'x-analyze-degraded': meta.degraded ? '1' : '0' } : {}),
	};
}
