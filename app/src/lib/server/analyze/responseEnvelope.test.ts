import { describe, expect, it } from 'vitest';
import {
	attachAnalyzeRequestMeta,
	buildAnalyzeTraceHeaders,
	createAnalyzeErrorEnvelope,
	createAnalyzePayloadMeta,
	readAnalyzeResponseMeta,
} from './responseEnvelope';

describe('analyze response envelope', () => {
	it('creates explicit degraded metadata for partial engine payloads', () => {
		const meta = createAnalyzePayloadMeta({
			engineMode: 'deep_only',
			upstreamMissing: ['score', 'score'],
		});

		expect(meta).toEqual({
			ok: true,
			degraded: true,
			engine_mode: 'deep_only',
			degraded_reason: 'score_unavailable',
			upstream_missing: ['score'],
		});
	});

	it('attaches request-local trace fields without losing payload metadata', () => {
		const payload = attachAnalyzeRequestMeta(
			{
				price: 101,
				meta: createAnalyzePayloadMeta({
					engineMode: 'score_only',
					upstreamMissing: ['deep'],
				}),
			},
			{ requestId: 'req-123', cacheStatus: 'coalesced' },
		);

		expect(readAnalyzeResponseMeta(payload)).toEqual({
			ok: true,
			degraded: true,
			engine_mode: 'score_only',
			degraded_reason: 'deep_unavailable',
			upstream_missing: ['deep'],
			request_id: 'req-123',
			cache_status: 'coalesced',
		});
	});

	it('builds trace headers from request and payload metadata', () => {
		const payload = attachAnalyzeRequestMeta(
			{
				meta: createAnalyzePayloadMeta({
					engineMode: 'fallback',
					upstreamMissing: ['deep', 'score'],
				}),
			},
			{ requestId: 'req-456', cacheStatus: 'bypass' },
		);

		expect(buildAnalyzeTraceHeaders({ requestId: 'req-456', cacheStatus: 'bypass', payload })).toEqual({
			'x-request-id': 'req-456',
			'x-analyze-cache': 'bypass',
			'x-analyze-engine': 'fallback',
			'x-analyze-degraded': '1',
		});
	});

	it('creates stable error envelopes for caller-facing failures', () => {
		expect(
			createAnalyzeErrorEnvelope({
				requestId: 'req-789',
				error: 'rate_limited',
				reason: 'Too many analyze requests. Please retry shortly.',
				status: 429,
				upstream: 'security',
			}),
		).toEqual({
			ok: false,
			error: 'rate_limited',
			reason: 'Too many analyze requests. Please retry shortly.',
			status: 429,
			request_id: 'req-789',
			upstream: 'security',
		});
	});
});
