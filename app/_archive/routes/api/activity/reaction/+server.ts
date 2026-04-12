import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';

const SOURCE_PAGES = new Set([
  'arena',
  'terminal',
  'signals',
  'live',
  'oracle',
  'passport',
  'settings',
  'wallet',
  'system',
]);

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();

    const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : '';
    const sourcePage = typeof body?.sourcePage === 'string' ? body.sourcePage.trim() : 'live';
    const sourceId = typeof body?.sourceId === 'string' ? body.sourceId.trim() : null;
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!emoji || emoji.length > 8) {
      return json({ error: 'emoji is required (1~8 chars)' }, { status: 400 });
    }
    if (!SOURCE_PAGES.has(sourcePage)) {
      return json({ error: 'Invalid sourcePage' }, { status: 400 });
    }

    const event = await query(
      `
        INSERT INTO activity_events (
          user_id, event_type, source_page, source_id,
          severity, payload, created_at
        )
        VALUES ($1, 'reaction_sent', $2, $3, 'info', $4::jsonb, now())
        RETURNING
          id, user_id, event_type, source_page, source_id,
          severity, payload, created_at
      `,
      [user.id, sourcePage, sourceId, JSON.stringify({ emoji, ...payload })]
    );

    return json({
      success: true,
      reaction: {
        id: event.rows[0].id,
        userId: event.rows[0].user_id,
        eventType: event.rows[0].event_type,
        sourcePage: event.rows[0].source_page,
        sourceId: event.rows[0].source_id,
        payload: event.rows[0].payload,
        createdAt: new Date(event.rows[0].created_at).getTime(),
      },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[activity/reaction] unexpected error:', error);
    return json({ error: 'Failed to record reaction' }, { status: 500 });
  }
};
