import { query, withTransaction } from './db';
import { isIP } from 'node:net';

export interface AuthUserRow {
  id: string;
  email: string;
  nickname: string;
  tier: 'guest' | 'registered' | 'connected' | 'verified';
  phase: number;
  wallet_address: string | null;
}

export interface CreateAuthUserInput {
  email: string;
  nickname: string;
  walletAddress: string | null;
  walletSignature: string | null;
}

function isLegacyAuthSchemaError(error: any): boolean {
  return error?.code === '42P01' || error?.code === '42703';
}

function sanitizeIp(raw?: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim() || '';
  if (!first) return null;
  const ipv4WithPort = first.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort?.[1] && isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1];
  const bracketedIpv6 = first.match(/^\[([0-9a-fA-F:]+)\](?::\d+)?$/);
  if (bracketedIpv6?.[1] && isIP(bracketedIpv6[1]) === 6) return bracketedIpv6[1];
  if (isIP(first) > 0) return first;
  return null;
}

export async function findAuthUserConflict(email: string, nickname: string): Promise<{
  emailTaken: boolean;
  nicknameTaken: boolean;
}> {
  let result;
  try {
    result = await query<{ email: string; nickname: string }>(
      `
        SELECT email, nickname
        FROM users
        WHERE lower(email) = lower($1) OR lower(nickname) = lower($2)
      `,
      [email, nickname]
    );
  } catch (error: any) {
    if (!isLegacyAuthSchemaError(error)) throw error;
    result = await query<{ email: string; nickname: string }>(
      `
        SELECT email, nickname
        FROM app_users
        WHERE lower(email) = lower($1) OR lower(nickname) = lower($2)
      `,
      [email, nickname]
    );
  }

  let emailTaken = false;
  let nicknameTaken = false;
  for (const row of result.rows) {
    if (row.email.toLowerCase() === email.toLowerCase()) emailTaken = true;
    if (row.nickname.toLowerCase() === nickname.toLowerCase()) nicknameTaken = true;
  }

  return { emailTaken, nicknameTaken };
}

export async function createAuthUser(input: CreateAuthUserInput): Promise<AuthUserRow> {
  const tier: AuthUserRow['tier'] = input.walletAddress
    ? input.walletSignature
      ? 'verified'
      : 'connected'
    : 'registered';
  const phase = input.walletAddress ? 2 : 1;

  try {
    const result = await query<AuthUserRow>(
      `
        INSERT INTO users (email, nickname, tier, phase, wallet_address, wallet_signature)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, nickname, tier, phase, wallet_address
      `,
      [input.email, input.nickname, tier, phase, input.walletAddress, input.walletSignature]
    );
    return result.rows[0];
  } catch (error: any) {
    if (!isLegacyAuthSchemaError(error)) throw error;
    return createLegacyAuthUser(input, tier, phase);
  }
}

async function createLegacyAuthUser(
  input: CreateAuthUserInput,
  tier: AuthUserRow['tier'],
  phase: number
): Promise<AuthUserRow> {
  return withTransaction(async (client) => {
    const result = await client.query<Omit<AuthUserRow, 'wallet_address'>>(
      `
        INSERT INTO app_users (email, nickname, tier, phase)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, nickname, tier, phase
      `,
      [input.email, input.nickname, tier, phase]
    );
    const user = result.rows[0];

    if (input.walletAddress) {
      await client.query(
        `
          INSERT INTO user_wallets (user_id, address, chain, is_primary, is_verified, signature)
          VALUES ($1, $2, 'EVM', true, $3, $4)
        `,
        [user.id, input.walletAddress, Boolean(input.walletSignature), input.walletSignature]
      );
    }

    return {
      ...user,
      wallet_address: input.walletAddress,
    };
  });
}

export async function createAuthSession(args: {
  token: string;
  userId: string;
  expiresAtIso: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const ua = args.userAgent?.trim() ? args.userAgent.trim().slice(0, 512) : null;
  const ip = sanitizeIp(args.ipAddress);

  let inserted = false;
  try {
    await query(
      `
        INSERT INTO sessions (token, user_id, expires_at, user_agent, ip_address, last_seen_at)
        VALUES ($1, $2, $3::timestamptz, $4, $5::inet, now())
      `,
      [args.token, args.userId, args.expiresAtIso, ua, ip]
    );
    inserted = true;
  } catch (error: any) {
    if (error?.code === '42703') {
      await query(
        `
          INSERT INTO sessions (token, user_id, expires_at)
          VALUES ($1, $2, $3::timestamptz)
        `,
        [args.token, args.userId, args.expiresAtIso]
      );
      inserted = true;
    } else if (error?.code === '22P02') {
      // Invalid IP literal: retry without IP metadata.
      await query(
        `
          INSERT INTO sessions (token, user_id, expires_at, user_agent, last_seen_at)
          VALUES ($1, $2, $3::timestamptz, $4, now())
        `,
        [args.token, args.userId, args.expiresAtIso, ua]
      );
      inserted = true;
    } else if (isLegacyAuthSchemaError(error)) {
      await createLegacyAuthSession(args, ua, ip);
      return;
    } else {
      throw error;
    }
  }

  if (!inserted) return;

  // Keep active sessions bounded per user to avoid unbounded table growth.
  await query(
    `
      DELETE FROM sessions
      WHERE id IN (
        SELECT id
        FROM sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
        OFFSET 10
      )
    `,
    [args.userId]
  ).catch(() => undefined);
}

async function createLegacyAuthSession(
  args: {
    token: string;
    userId: string;
    expiresAtIso: string;
  },
  ua: string | null,
  ip: string | null
): Promise<void> {
  try {
    await query(
      `
        INSERT INTO auth_sessions (session_token, user_id, expires_at, user_agent, ip_address)
        VALUES ($1, $2, $3::timestamptz, $4, $5::inet)
      `,
      [args.token, args.userId, args.expiresAtIso, ua, ip]
    );
  } catch (error: any) {
    if (error?.code !== '42703' && error?.code !== '22P02') throw error;
    await query(
      `
        INSERT INTO auth_sessions (session_token, user_id, expires_at)
        VALUES ($1, $2, $3::timestamptz)
      `,
      [args.token, args.userId, args.expiresAtIso]
    );
  }

  await query(
    `
      DELETE FROM auth_sessions
      WHERE id IN (
        SELECT id
        FROM auth_sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
        OFFSET 10
      )
    `,
    [args.userId]
  ).catch(() => undefined);
}

export async function getAuthenticatedUser(token: string, userId: string): Promise<AuthUserRow | null> {
  try {
    const result = await query<AuthUserRow>(
      `
        SELECT
          u.id,
          u.email,
          u.nickname,
          u.tier,
          u.phase,
          u.wallet_address
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1
          AND s.user_id = $2
          AND s.expires_at > now()
          AND s.revoked_at IS NULL
        LIMIT 1
      `,
      [token, userId]
    );

    return result.rows[0] || null;
  } catch (error: any) {
    // Backward compatibility for environments where revoked_at is not migrated yet.
    if (error?.code === '42P01') {
      return getLegacyAuthenticatedUser(token, userId);
    }
    if (error?.code !== '42703') {
      throw error;
    }

    try {
      const fallback = await query<AuthUserRow>(
        `
          SELECT
            u.id,
            u.email,
            u.nickname,
            u.tier,
            u.phase,
            u.wallet_address
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token = $1
            AND s.user_id = $2
            AND s.expires_at > now()
          LIMIT 1
        `,
        [token, userId]
      );
      return fallback.rows[0] || null;
    } catch (fallbackError: any) {
      if (!isLegacyAuthSchemaError(fallbackError)) throw fallbackError;
      return getLegacyAuthenticatedUser(token, userId);
    }
  }
}

async function getLegacyAuthenticatedUser(token: string, userId: string): Promise<AuthUserRow | null> {
  const result = await query<AuthUserRow>(
    `
      SELECT
        u.id,
        u.email,
        u.nickname,
        u.tier,
        u.phase,
        w.address AS wallet_address
      FROM auth_sessions s
      JOIN app_users u ON u.id = s.user_id
      LEFT JOIN user_wallets w
        ON w.user_id = u.id
       AND w.is_primary = true
       AND w.disconnected_at IS NULL
      WHERE s.session_token = $1
        AND s.user_id = $2
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
      LIMIT 1
    `,
    [token, userId]
  );
  return result.rows[0] || null;
}

export async function findAuthUserForLogin(
  email: string,
  nickname: string,
  walletAddress: string
): Promise<AuthUserRow | null> {
  const normalizedNickname = nickname.trim();
  try {
    if (!normalizedNickname) {
      const result = await query<AuthUserRow>(
        `
          SELECT
            id,
            email,
            nickname,
            tier,
            phase,
            wallet_address
          FROM users
          WHERE lower(email) = lower($1)
            AND lower(wallet_address) = lower($2)
          LIMIT 1
        `,
        [email, walletAddress]
      );

      return result.rows[0] || null;
    }

    const result = await query<AuthUserRow>(
      `
        SELECT
          id,
          email,
          nickname,
          tier,
          phase,
          wallet_address
        FROM users
        WHERE lower(email) = lower($1)
          AND lower(nickname) = lower($2)
          AND lower(wallet_address) = lower($3)
        LIMIT 1
      `,
      [email, normalizedNickname, walletAddress]
    );

    return result.rows[0] || null;
  } catch (error: any) {
    if (!isLegacyAuthSchemaError(error)) throw error;
    return findLegacyAuthUserForLogin(email, normalizedNickname, walletAddress);
  }
}

async function findLegacyAuthUserForLogin(
  email: string,
  nickname: string,
  walletAddress: string
): Promise<AuthUserRow | null> {
  const nicknameClause = nickname ? 'AND lower(u.nickname) = lower($2)' : '';
  const walletParam = nickname ? '$3' : '$2';
  const params = nickname ? [email, nickname, walletAddress] : [email, walletAddress];

  const result = await query<AuthUserRow>(
    `
      SELECT
        u.id,
        u.email,
        u.nickname,
        u.tier,
        u.phase,
        w.address AS wallet_address
      FROM app_users u
      JOIN user_wallets w ON w.user_id = u.id
      WHERE lower(u.email) = lower($1)
        ${nicknameClause}
        AND lower(w.address) = lower(${walletParam})
        AND w.disconnected_at IS NULL
      ORDER BY w.is_primary DESC, w.connected_at DESC
      LIMIT 1
    `,
    params
  );

  return result.rows[0] || null;
}

/**
 * Find user by wallet address alone (wallet-first auth).
 */
export async function findAuthUserByWallet(
  walletAddress: string
): Promise<AuthUserRow | null> {
  try {
    const result = await query<AuthUserRow>(
      `
        SELECT id, email, nickname, tier, phase, wallet_address
        FROM users
        WHERE lower(wallet_address) = lower($1)
        LIMIT 1
      `,
      [walletAddress]
    );
    return result.rows[0] || null;
  } catch (error: any) {
    if (!isLegacyAuthSchemaError(error)) throw error;
    const result = await query<AuthUserRow>(
      `
        SELECT
          u.id,
          u.email,
          u.nickname,
          u.tier,
          u.phase,
          w.address AS wallet_address
        FROM user_wallets w
        JOIN app_users u ON u.id = w.user_id
        WHERE lower(w.address) = lower($1)
          AND w.disconnected_at IS NULL
        ORDER BY w.is_primary DESC, w.connected_at DESC
        LIMIT 1
      `,
      [walletAddress]
    );
    return result.rows[0] || null;
  }
}

/**
 * Create a wallet-only user — no email or nickname required.
 * Auto-generates a display nickname from the last 6 chars of the wallet address.
 */
export async function createWalletOnlyUser(
  walletAddress: string,
  walletSignature: string
): Promise<AuthUserRow> {
  const suffix = walletAddress.replace(/^0x/i, '').slice(-6).toUpperCase();

  // Retry with random suffix if nickname collides (uq_users_nickname_lower)
  for (let attempt = 0; attempt < 5; attempt++) {
    const extra = attempt === 0 ? '' : `_${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
    const autoNickname = `Trader_${suffix}${extra}`;

    try {
      try {
        const result = await query<AuthUserRow>(
          `
            INSERT INTO users (wallet_address, wallet_signature, nickname, tier, phase)
            VALUES ($1, $2, $3, 'verified', 2)
            RETURNING id, email, nickname, tier, phase, wallet_address
          `,
          [walletAddress, walletSignature, autoNickname]
        );
        return result.rows[0];
      } catch (error: any) {
        if (!isLegacyAuthSchemaError(error)) throw error;
        return createLegacyWalletOnlyUser(walletAddress, walletSignature, autoNickname);
      }
    } catch (err: any) {
      // 23505 = unique_violation; retry only for nickname conflict, not wallet conflict
      const isNicknameConflict = err?.code === '23505' && err?.constraint?.includes('nickname');
      if (!isNicknameConflict) throw err;
    }
  }

  // Fallback: null nickname (still valid since column is nullable)
  try {
    const result = await query<AuthUserRow>(
      `
        INSERT INTO users (wallet_address, wallet_signature, tier, phase)
        VALUES ($1, $2, 'verified', 2)
        RETURNING id, email, nickname, tier, phase, wallet_address
      `,
      [walletAddress, walletSignature]
    );
    return result.rows[0];
  } catch (error: any) {
    if (!isLegacyAuthSchemaError(error)) throw error;
    return createLegacyWalletOnlyUser(walletAddress, walletSignature, null);
  }
}

async function createLegacyWalletOnlyUser(
  walletAddress: string,
  walletSignature: string,
  nickname: string | null
): Promise<AuthUserRow> {
  return withTransaction(async (client) => {
    const result = await client.query<Omit<AuthUserRow, 'wallet_address'>>(
      `
        INSERT INTO app_users (nickname, tier, phase)
        VALUES ($1, 'verified', 2)
        RETURNING id, email, nickname, tier, phase
      `,
      [nickname]
    );
    const user = result.rows[0];
    await client.query(
      `
        INSERT INTO user_wallets (user_id, address, chain, is_primary, is_verified, signature)
        VALUES ($1, $2, 'EVM', true, true, $3)
      `,
      [user.id, walletAddress, walletSignature]
    );
    return {
      ...user,
      wallet_address: walletAddress,
    };
  });
}
