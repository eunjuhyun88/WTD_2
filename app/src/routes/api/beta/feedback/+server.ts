import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user?.wallet_address) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: { body?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const feedbackBody = body.body?.trim();
  if (!feedbackBody) {
    return json({ error: 'body is required' }, { status: 400 });
  }

  try {
    await query(
      `INSERT INTO beta_feedback (wallet_address, body, url)
       VALUES ($1, $2, $3)`,
      [user.wallet_address, feedbackBody, body.url?.trim() || null],
    );
    return json({ ok: true });
  } catch (err) {
    console.error('[beta/feedback] error:', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
