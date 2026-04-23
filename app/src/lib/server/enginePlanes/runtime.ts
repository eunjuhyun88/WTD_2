import type { RuntimeCaptureResponse } from '$lib/contracts/runtime/captures';
import type { RuntimeLedgerResponse } from '$lib/contracts/runtime/ledger';
import type { RuntimeResearchContextResponse } from '$lib/contracts/runtime/researchContext';
import type { RuntimeWorkspaceStateResponse } from '$lib/contracts/runtime/workspaceState';
import { fetchEnginePlaneJson, postEnginePlaneJson } from './shared';

type ServerFetch = typeof fetch;

export async function postRuntimeCaptureProxy(
	fetchFn: ServerFetch,
	body: unknown,
): Promise<RuntimeCaptureResponse | null> {
	return postEnginePlaneJson<RuntimeCaptureResponse>(fetchFn, 'runtime', {
		path: 'captures',
		body,
		timeoutMs: 15_000,
	});
}

export async function fetchRuntimeCaptureProxy(
	fetchFn: ServerFetch,
	captureId: string,
): Promise<RuntimeCaptureResponse | null> {
	return fetchEnginePlaneJson<RuntimeCaptureResponse>(fetchFn, 'runtime', {
		path: `captures/${captureId}`,
		timeoutMs: 8_000,
	});
}

export async function fetchRuntimeWorkspaceStateProxy(
	fetchFn: ServerFetch,
	symbol: string,
): Promise<RuntimeWorkspaceStateResponse | null> {
	return fetchEnginePlaneJson<RuntimeWorkspaceStateResponse>(fetchFn, 'runtime', {
		path: `workspace/${symbol}`,
		timeoutMs: 8_000,
	});
}

export async function fetchRuntimeResearchContextProxy(
	fetchFn: ServerFetch,
	researchContextId: string,
): Promise<RuntimeResearchContextResponse | null> {
	return fetchEnginePlaneJson<RuntimeResearchContextResponse>(fetchFn, 'runtime', {
		path: `research-contexts/${researchContextId}`,
		timeoutMs: 8_000,
	});
}

export async function fetchRuntimeLedgerProxy(
	fetchFn: ServerFetch,
	ledgerId: string,
): Promise<RuntimeLedgerResponse | null> {
	return fetchEnginePlaneJson<RuntimeLedgerResponse>(fetchFn, 'runtime', {
		path: `ledger/${ledgerId}`,
		timeoutMs: 8_000,
	});
}
