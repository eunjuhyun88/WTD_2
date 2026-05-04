/**
 * POST /api/exchange/binance — validate + save Binance Read-Only API key
 * DELETE /api/exchange/binance — remove saved key
 * GET /api/exchange/binance — check connection status
 */
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { encryptApiKey } from '$lib/server/exchange/binanceConnector';
import { validateBinanceReadOnly } from '$lib/server/exchange/binanceValidator';

const SaveSchema = z.object({
  apiKey: z.string().regex(/^[A-Za-z0-9]{64}$/, 'API Key는 64자 영숫자여야 합니다'),
  secret: z.string().min(30, 'Secret은 최소 30자 이상이어야 합니다'),
});

export async function POST({ request, cookies }: RequestEvent) {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid JSON' }, { status: 400 }); }

  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'invalid request' }, { status: 422 });
  }

  const { apiKey, secret } = parsed.data;

  // 1. Validate with Binance API
  const validation = await validateBinanceReadOnly(apiKey, secret);
  if (!validation.ok) {
    return json(
      { error: validation.error, code: validation.code },
      { status: validation.code === 'trading_enabled' ? 403 : 400 },
    );
  }

  // 2. Encrypt and upsert
  try {
    const encKey = encryptApiKey(apiKey);
    const encSecret = encryptApiKey(secret);
    await query(
      `INSERT INTO exchange_connections
         (user_id, exchange, api_key_encrypted, api_secret_encrypted, permissions, status, api_key_last4)
       VALUES ($1, 'binance', $2, $3, $4, 'active', $5)
       ON CONFLICT (user_id, exchange)
       DO UPDATE SET
         api_key_encrypted    = EXCLUDED.api_key_encrypted,
         api_secret_encrypted = EXCLUDED.api_secret_encrypted,
         permissions          = EXCLUDED.permissions,
         status               = 'active',
         api_key_last4        = EXCLUDED.api_key_last4,
         created_at           = now()`,
      [user.id, encKey, encSecret, ['read'], apiKey.slice(-4)],
    );

    // Return last4 only — never return plaintext key
    return json({
      ok: true,
      apiKeyLast4: apiKey.slice(-4),
      savedAt: new Date().toISOString(),
      ipRestrict: validation.permissions?.ipRestrict ?? false,
    });
  } catch (err: unknown) {
    console.error('[exchange/binance] save error:', err);
    return json({ error: '저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE({ cookies }: RequestEvent) {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await query(
      `DELETE FROM exchange_connections WHERE user_id = $1 AND exchange = 'binance'`,
      [user.id],
    );
    return json({ ok: true });
  } catch (err: unknown) {
    console.error('[exchange/binance] delete error:', err);
    return json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function GET({ cookies }: RequestEvent) {
  const user = await getAuthUserFromCookies(cookies);
  // Unauthenticated: graceful { connected: false } rather than 401
  if (!user) return json({ connected: false });

  try {
    const rows = await query<{ created_at: string; api_key_last4: string | null }>(
      `SELECT api_key_last4, created_at
       FROM exchange_connections
       WHERE user_id = $1 AND exchange = 'binance' AND status = 'active'
       LIMIT 1`,
      [user.id],
    );
    if (rows.rows.length === 0) return json({ connected: false });
    return json({
      connected: true,
      apiKeyLast4: rows.rows[0].api_key_last4,
      savedAt: rows.rows[0].created_at,
    });
  } catch {
    return json({ connected: false });
  }
}
