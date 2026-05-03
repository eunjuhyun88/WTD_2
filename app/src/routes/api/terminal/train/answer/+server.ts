import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  const { capture_id, symbol, answer, session_id } = body;

  if (!['UP', 'DOWN', 'SKIP'].includes(answer)) {
    return json({ error: 'invalid answer' }, { status: 400 });
  }

  const userId = locals.user?.id ?? null;

  try {
    await query(
      `INSERT INTO train_answers (user_id, capture_id, symbol, answer, session_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, capture_id, symbol, answer, session_id],
    );
  } catch (err) {
    console.error('[train/answer] insert error:', err);
    // Non-fatal: quiz UX should not fail due to DB issues
  }

  return json({ ok: true });
};
