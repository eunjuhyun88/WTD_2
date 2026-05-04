/**
 * GET /api/observability/verdict-velocity
 * Proxies to engine GET /observability/verdict-velocity.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ url }) => {
  const days = url.searchParams.get('days') ?? '30';
  try {
    const res = await engineFetch(`/observability/verdict-velocity?days=${days}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    throw error(502, 'verdict-velocity unavailable');
  }
};
