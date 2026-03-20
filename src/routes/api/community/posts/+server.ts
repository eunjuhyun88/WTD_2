import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt } from '$lib/server/apiValidation';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';
import { errorContains } from '$lib/utils/errorUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>) {
  return {
    id: row.id,
    userId: row.user_id,
    author: row.author,
    avatar: row.avatar,
    avatarColor: row.avatar_color,
    body: row.body,
    signal: row.signal,
    likes: Number(row.likes ?? 0),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 100);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 1000);
    const signal = (url.searchParams.get('signal') || '').trim().toLowerCase();

    const where = signal === 'long' || signal === 'short' ? 'WHERE signal = $1' : '';
    const params = signal === 'long' || signal === 'short' ? [signal, limit, offset] : [limit, offset];

    const countQuery = signal === 'long' || signal === 'short'
      ? `SELECT count(*)::text AS total FROM community_posts WHERE signal = $1`
      : `SELECT count(*)::text AS total FROM community_posts`;
    const countParams = signal === 'long' || signal === 'short' ? [signal] : [];

    const total = await query<{ total: string }>(countQuery, countParams);

    const rows = await query(
      `
        SELECT id, user_id, author, avatar, avatar_color, body, signal, likes, created_at
        FROM community_posts
        ${where}
        ORDER BY created_at DESC
        LIMIT $${signal === 'long' || signal === 'short' ? 2 : 1}
        OFFSET $${signal === 'long' || signal === 'short' ? 3 : 2}
      `,
      params
    );

    return json({
      success: true,
      total: Number(total.rows[0]?.total ?? '0'),
      records: rows.rows.map(mapRow),
      pagination: { limit, offset },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[community/posts/get] unexpected error:', error);
    return json({ error: 'Failed to load community posts' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);

    const author = user.nickname;
    const avatar = typeof body?.avatar === 'string' ? body.avatar.trim() : '🐕';
    const avatarColor = typeof body?.avatarColor === 'string' ? body.avatarColor.trim() : '#E8967D';
    const content = typeof body?.body === 'string' ? body.body.trim() : '';
    const signal = typeof body?.signal === 'string' ? body.signal.trim().toLowerCase() : null;

    if (!content || content.length < 2) {
      return json({ error: 'body must be at least 2 chars' }, { status: 400 });
    }
    if (content.length > 2000) {
      return json({ error: 'body must be 2000 chars or fewer' }, { status: 400 });
    }
    if (avatar.length > 32) {
      return json({ error: 'avatar must be 32 chars or fewer' }, { status: 400 });
    }
    if (avatarColor.length > 32) {
      return json({ error: 'avatarColor must be 32 chars or fewer' }, { status: 400 });
    }
    if (signal && signal !== 'long' && signal !== 'short') {
      return json({ error: 'signal must be long|short or null' }, { status: 400 });
    }

    const insert = await query(
      `
        INSERT INTO community_posts (
          user_id, author, avatar, avatar_color, body, signal, likes, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 0, now())
        RETURNING id, user_id, author, avatar, avatar_color, body, signal, likes, created_at
      `,
      [user.id, author, avatar, avatarColor, content, signal]
    );

    await query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'community_posted', 'terminal', $2, 'info', $3::jsonb)
      `,
      [user.id, insert.rows[0].id, JSON.stringify({ signal })]
    ).catch(() => undefined);

    return json({ success: true, post: mapRow(insert.rows[0]) });
  } catch (error: unknown) {
    if (isRequestBodyTooLargeError(error)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[community/posts/post] unexpected error:', error);
    return json({ error: 'Failed to create community post' }, { status: 500 });
  }
};
