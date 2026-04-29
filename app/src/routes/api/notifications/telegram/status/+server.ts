import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const result = await query<{ telegram_chat_id: string | null }>(
      `SELECT telegram_chat_id FROM user_preferences WHERE user_id = $1`,
      [user.id]
    );

    const chatId = result.rows[0]?.telegram_chat_id ?? null;

    return json({
      connected: Boolean(chatId),
      chat_id: chatId,
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[telegram/status] unexpected error:', error);
    return json({ error: 'Failed to check Telegram status' }, { status: 500 });
  }
};
