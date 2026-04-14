import {
	readAnalyzeResponseMeta,
	type AnalyzeRouteCacheStatus,
} from './responseEnvelope';

export function logAnalyzeRouteEvent(args: {
	event: 'success' | 'fallback' | 'blocked' | 'error';
	requestId: string;
	symbol: string;
	tf: string;
	status: number;
	cacheStatus?: AnalyzeRouteCacheStatus;
	payload?: Record<string, unknown>;
	error?: string;
	reason?: string;
}): void {
	const meta = args.payload ? readAnalyzeResponseMeta(args.payload) : null;

	console.info('[analyze:route]', {
		event: args.event,
		request_id: args.requestId,
		symbol: args.symbol,
		tf: args.tf,
		status: args.status,
		...(args.cacheStatus ? { cache_status: args.cacheStatus } : {}),
		...(meta ? { degraded: meta.degraded, engine_mode: meta.engine_mode } : {}),
		...(meta?.degraded_reason ? { degraded_reason: meta.degraded_reason } : {}),
		...(meta?.upstream_missing?.length ? { upstream_missing: meta.upstream_missing } : {}),
		...(args.error ? { error: args.error } : {}),
		...(args.reason ? { reason: args.reason } : {}),
	});
}
