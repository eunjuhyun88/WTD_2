import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { UUID_RE } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

async function recalcLikes(postId: string) {
  const likes = await query<{ cnt: string }>(
    `
      SELECT count(distinct user_id)::text AS cnt
      FROM community_post_reactions
      WHERE post_id = $1
    `,
    [postId]
  );

  const likesCount = Number(likes.rows[0]?.cnt ?? '0');
  await query(`UPDATE community_posts SET likes = $1 WHERE id = $2`, [likesCount, postId]);
  return likesCount;
}

export const POST: RequestHandler = async ({ cookies, request, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const id = params.id;
    if (!id || !UUID_RE.test(id)) return json({ error: 'Invalid post id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : '👍';

    if (!emoji || emoji.length > 8) {
      return json({ error: 'emoji is required (1~8 chars)' }, { status: 400 });
    }

    const exists = await query<{ id: string }>(`SELECT id FROM community_posts WHERE id = $1 LIMIT 1`, [id]);
    if (!exists.rowCount) return json({ error: 'Post not found' }, { status: 404 });

    const inserted = await query(
      `
        INSERT INTO community_post_reactions (post_id, user_id, emoji, created_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
      [id, user.id, emoji]
    );

    const likes = await recalcLikes(id);

    await query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'community_reacted', 'terminal', $2, 'info', $3::jsonb)
      `,
      [user.id, id, JSON.stringify({ emoji })]
    ).catch(() => undefined);

    return json({ success: true, inserted: inserted.rowCount > 0, likes });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[community/posts/react/post] unexpected error:', error);
    return json({ error: 'Failed to react community post' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ cookies, request, params, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const id = params.id;
    if (!id || !UUID_RE.test(id)) return json({ error: 'Invalid post id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const emojiParam = (url.searchParams.get('emoji') || '').trim();
    const emojiBody = typeof body?.emoji === 'string' ? body.emoji.trim() : '';
    const emoji = emojiParam || emojiBody;

    let result;
    if (emoji) {
      result = await query(
        `
          DELETE FROM community_post_reactions
          WHERE post_id = $1 AND user_id = $2 AND emoji = $3
        `,
        [id, user.id, emoji]
      );
    } else {
      result = await query(
        `
          DELETE FROM community_post_reactions
          WHERE post_id = $1 AND user_id = $2
        `,
        [id, user.id]
      );
    }

    const likes = await recalcLikes(id);
    return json({ success: true, removed: result.rowCount, likes });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[community/posts/react/delete] unexpected error:', error);
    return json({ error: 'Failed to remove reaction' }, { status: 500 });
  }
};
