import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ params }) => {
	const res = await engineFetch(`/tv-import/author/${encodeURIComponent(params.username)}`);
	const data = await res.json();
	return json(data, { status: res.status });
};
