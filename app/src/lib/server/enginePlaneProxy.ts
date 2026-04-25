import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { ENGINE_URL, buildEngineHeaders } from '$lib/server/engineTransport';
import { engineProxyLimiter } from '$lib/server/rateLimit';

export type EnginePlaneProxyName = 'facts' | 'search' | 'runtime';
type EnginePlaneProxyMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type PlaneRule = {
	pattern: RegExp;
	methods: ReadonlySet<EnginePlaneProxyMethod>;
	toUpstream: (path: string) => string;
	heavy?: boolean;
	timeoutMs?: number;
};

const FACTS_RULES: PlaneRule[] = [
	{
		pattern: /^ctx\/fact$/,
		methods: new Set(['GET']),
		toUpstream: (path) => path,
		timeoutMs: 10_000,
	},
	{
		pattern: /^(price-context|perp-context|reference-stack|chain-intel|market-cap|confluence|indicator-catalog)$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `facts/${path}`,
		timeoutMs: 10_000,
	},
];

const SEARCH_RULES: PlaneRule[] = [
	{
		pattern: /^catalog$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `search/${path}`,
		timeoutMs: 10_000,
	},
	{
		pattern: /^scan$/,
		methods: new Set(['POST']),
		toUpstream: (path) => `search/${path}`,
		heavy: true,
		timeoutMs: 30_000,
	},
	{
		pattern: /^scan\/[^/]+$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `search/${path}`,
		timeoutMs: 10_000,
	},
	{
		pattern: /^seed$/,
		methods: new Set(['POST']),
		toUpstream: (path) => `search/${path}`,
		heavy: true,
		timeoutMs: 30_000,
	},
	{
		pattern: /^seed\/[^/]+$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `search/${path}`,
		timeoutMs: 10_000,
	},
];

const RUNTIME_RULES: PlaneRule[] = [
	{
		pattern: /^captures$/,
		methods: new Set(['GET', 'POST']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 15_000,
	},
	{
		pattern: /^captures\/[^/]+$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 10_000,
	},
	{
		pattern: /^workspace\/pins$/,
		methods: new Set(['POST']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 15_000,
	},
	{
		pattern: /^workspace\/[^/]+$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 10_000,
	},
	{
		pattern: /^setups$/,
		methods: new Set(['POST']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 15_000,
	},
	{
		pattern: /^setups\/[^/]+$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 10_000,
	},
	{
		pattern: /^research-contexts$/,
		methods: new Set(['POST']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 15_000,
	},
	{
		pattern: /^research-contexts\/[^/]+$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 10_000,
	},
	{
		pattern: /^ledger\/[^/]+$/,
		methods: new Set(['GET']),
		toUpstream: (path) => `runtime/${path}`,
		timeoutMs: 10_000,
	},
];

const PLANE_RULES: Record<EnginePlaneProxyName, PlaneRule[]> = {
	facts: FACTS_RULES,
	search: SEARCH_RULES,
	runtime: RUNTIME_RULES,
};

const HEADER_PLANE: Record<EnginePlaneProxyName, string> = {
	facts: 'fact',
	search: 'search',
	runtime: 'runtime',
};

type EnginePlaneProxyEvent = RequestEvent & {
	params: { path: string };
	getClientAddress?: () => string;
};

export function normalizePlaneProxyPath(path: string): string {
	return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function buildPlaneAppPath(plane: EnginePlaneProxyName, path: string): string {
	return `/api/${plane}/${normalizePlaneProxyPath(path)}`;
}

function matchPlaneRule(
	plane: EnginePlaneProxyName,
	path: string,
	method: EnginePlaneProxyMethod,
): PlaneRule | null {
	const normalizedPath = normalizePlaneProxyPath(path);
	return (
		PLANE_RULES[plane].find((rule) => rule.methods.has(method) && rule.pattern.test(normalizedPath)) ?? null
	);
}

export function isAllowedPlaneProxyPath(
	plane: EnginePlaneProxyName,
	path: string,
	method: EnginePlaneProxyMethod,
): boolean {
	return matchPlaneRule(plane, path, method) !== null;
}

export async function proxyEnginePlaneRequest(
	request: Request,
	plane: EnginePlaneProxyName,
	path: string,
	getClientAddress?: (() => string) | undefined,
): Promise<Response> {
	const method = request.method as EnginePlaneProxyMethod;
	const normalizedPath = normalizePlaneProxyPath(path);
	const rule = matchPlaneRule(plane, normalizedPath, method);
	if (!rule) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	if (rule.heavy && getClientAddress && !engineProxyLimiter.check(getClientAddress())) {
		return json({ error: 'Too many requests' }, { status: 429 });
	}

	const upstreamPath = rule.toUpstream(normalizedPath);
	const query = new URL(request.url).search;
	const url = `${ENGINE_URL}/${upstreamPath}${query}`;
	const controller = new AbortController();
	const timeoutMs = rule.timeoutMs ?? 15_000;
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const headers = buildEngineHeaders();
		const contentType = request.headers.get('content-type');
		if (contentType) headers.set('content-type', contentType);

		const body =
			request.method !== 'GET' && request.method !== 'HEAD'
				? await request.arrayBuffer()
				: undefined;

		const upstream = await fetch(url, {
			method: request.method,
			headers,
			body,
			signal: controller.signal,
		});

		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				'content-type': upstream.headers.get('content-type') ?? 'application/json',
				'X-WTD-Plane': HEADER_PLANE[plane],
				'X-WTD-Upstream': upstreamPath,
				'X-WTD-State': upstream.headers.get('x-wtd-state') ?? 'proxied',
			},
		});
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			throw error(504, `Engine timed out after ${timeoutMs}ms (path: ${upstreamPath})`);
		}
		throw error(502, `Engine unreachable: ${(err as Error).message}`);
	} finally {
		clearTimeout(timer);
	}
}

export function handleEnginePlaneRequest(
	event: EnginePlaneProxyEvent,
	plane: EnginePlaneProxyName,
	method: EnginePlaneProxyMethod,
): Promise<Response> {
	const path = normalizePlaneProxyPath(event.params.path);
	if (!isAllowedPlaneProxyPath(plane, path, method)) {
		return Promise.resolve(json({ error: 'Not found' }, { status: 404 }));
	}
	return proxyEnginePlaneRequest(event.request, plane, path, event.getClientAddress);
}
