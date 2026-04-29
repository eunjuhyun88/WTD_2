import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { query } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  // Verify secret token if configured
  const secretToken = env.TELEGRAM_WEBHOOK_SECRET;
  if (secretToken) {
    const headerToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (headerToken !== secretToken) {
      return json({ ok: false }, { status: 403 });
    }
  }

  const update = await request.json().catch(() => null);
  if (!update?.message?.text) return json({ ok: true });

  const text: string = update.message.text.trim();
  const chatId = String(update.message.chat.id);

  if (!text.startsWith('/connect ')) return json({ ok: true });

  const code = text.replace('/connect ', '').trim().toUpperCase();
  if (code.length !== 6) return json({ ok: true });

  // Validate code
  const codeResult = await query<{
    user_id: string;
    expires_at: string;
    used: boolean;
  }>(
    `SELECT user_id, expires_at, used
     FROM telegram_connect_codes
     WHERE code = $1`,
    [code]
  ).catch(() => null);

  const row = codeResult?.rows[0];

  if (!row || row.used || new Date(row.expires_at) < new Date()) {
    await sendReply(chatId, '코드가 유효하지 않거나 만료되었습니다. 앱에서 새 코드를 생성하세요.');
    return json({ ok: true });
  }

  // Mark used
  await query(
    `UPDATE telegram_connect_codes SET used = TRUE WHERE code = $1`,
    [code]
  ).catch(() => {});

  // Store chat_id in user_preferences (upsert)
  await query(
    `INSERT INTO user_preferences (user_id, telegram_chat_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id, updated_at = NOW()`,
    [row.user_id, chatId]
  ).catch(() => {});

  await sendReply(chatId, 'Telegram 연결 완료! 이제 DOUNI 알림을 받을 수 있습니다.');
  return json({ ok: true });
};

async function sendReply(chatId: string, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}
