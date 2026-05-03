import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { encryptSecret, isSecretsEncryptionConfigured } from '$lib/server/secretCrypto';

const ALLOWED_EXCHANGES = new Set(['binance', 'bybit']);

// Mask all but the last 4 characters of the api_key
function maskApiKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

// CCXT permission names that indicate trade/withdraw capability
const DANGEROUS_PERMISSIONS = ['trade', 'withdraw', 'futures', 'leveraged'];

function detectDangerousPermissions(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter(
    (p): p is string =>
      typeof p === 'string' && DANGEROUS_PERMISSIONS.includes(p.toLowerCase()),
  );
}

/** GET /api/keys — list user's registered keys (api_key masked, no secret) */
export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const result = await query<{
      id: string;
      exchange: string;
      api_key: string;
      permissions: unknown;
      is_read_only: boolean;
      created_at: string;
      last_verified_at: string | null;
    }>(
      `SELECT id, exchange, api_key, permissions, is_read_only, created_at, last_verified_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user.id],
    );

    const keys = result.rows.map((row) => ({
      id: row.id,
      exchange: row.exchange,
      api_key: maskApiKey(row.api_key),
      permissions: row.permissions,
      is_read_only: row.is_read_only,
      created_at: row.created_at,
      last_verified_at: row.last_verified_at,
    }));

    return json({ keys });
  } catch {
    return json({ error: 'Failed to load API keys' }, { status: 500 });
  }
};

/** POST /api/keys — register a new exchange API key */
export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    if (!isSecretsEncryptionConfigured()) {
      return json({ error: 'Server encryption is not configured' }, { status: 503 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { exchange, api_key, secret, permissions } = body as Record<string, unknown>;

    if (typeof exchange !== 'string' || !ALLOWED_EXCHANGES.has(exchange)) {
      return json({ error: 'exchange must be one of: binance, bybit' }, { status: 400 });
    }
    if (typeof api_key !== 'string' || !api_key.trim()) {
      return json({ error: 'api_key is required' }, { status: 400 });
    }
    if (typeof secret !== 'string' || !secret.trim()) {
      return json({ error: 'secret is required' }, { status: 400 });
    }

    // Validate permissions — CCXT permission check
    const perms: unknown = Array.isArray(permissions) ? permissions : [];
    const dangerous = detectDangerousPermissions(perms);
    if (dangerous.length > 0) {
      return json(
        {
          error: `READ-ONLY 키만 허용됩니다. 다음 권한이 감지되었습니다: ${dangerous.join(', ')}. 거래소에서 조회 전용 키를 새로 발급한 후 다시 시도하세요.`,
          rejected_permissions: dangerous,
        },
        { status: 400 },
      );
    }

    const secretEncrypted = encryptSecret(secret.trim());

    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO api_keys (user_id, exchange, api_key, secret_encrypted, permissions)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (user_id, exchange) DO UPDATE SET
         api_key          = EXCLUDED.api_key,
         secret_encrypted = EXCLUDED.secret_encrypted,
         permissions      = EXCLUDED.permissions,
         last_verified_at = NULL
       RETURNING id, created_at`,
      [user.id, exchange, api_key.trim(), secretEncrypted, JSON.stringify(perms)],
    );

    const row = result.rows[0];
    return json(
      {
        id: row.id,
        exchange,
        api_key: maskApiKey(api_key.trim()),
        created_at: row.created_at,
      },
      { status: 201 },
    );
  } catch {
    return json({ error: 'Failed to register API key' }, { status: 500 });
  }
};

/** DELETE /api/keys/:id — delete a specific API key */
export const DELETE: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    // id is passed as a query param: DELETE /api/keys?id=xxx
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id query parameter is required' }, { status: 400 });

    const result = await query(
      `DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id],
    );

    if (result.rowCount === 0) {
      return json({ error: 'Key not found' }, { status: 404 });
    }

    return json({ success: true, deleted_id: id });
  } catch {
    return json({ error: 'Failed to delete API key' }, { status: 500 });
  }
};
