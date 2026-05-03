import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const res = await engineFetch('/tv-import/preview', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const data = await res.json();
	return json(data, { status: res.status });
};
