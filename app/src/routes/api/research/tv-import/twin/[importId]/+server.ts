import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ params }) => {
	const res = await engineFetch(`/tv-import/twin/${encodeURIComponent(params.importId)}`);
	const data = await res.json();
	return json(data, { status: res.status });
};
