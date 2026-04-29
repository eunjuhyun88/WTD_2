import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const POST: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const code = generateCode();

    await query(
      `INSERT INTO telegram_connect_codes (code, user_id)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [code, user.id]
    );

    return json({ code, expires_in: 600 });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[telegram/connect] unexpected error:', error);
    return json({ error: 'Failed to generate connect code' }, { status: 500 });
  }
};
