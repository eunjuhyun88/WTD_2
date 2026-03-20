import { query } from './db';
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
  const result = await query<{ email: string; nickname: string }>(
    `
      SELECT email, nickname
      FROM users
      WHERE lower(email) = lower($1) OR lower(nickname) = lower($2)
    `,
    [email, nickname]
  );

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

  const result = await query<AuthUserRow>(
    `
      INSERT INTO users (email, nickname, tier, phase, wallet_address, wallet_signature)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, nickname, tier, phase, wallet_address
    `,
    [input.email, input.nickname, tier, phase, input.walletAddress, input.walletSignature]
  );
  return result.rows[0];
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

  try {
    await query(
      `
        INSERT INTO sessions (token, user_id, expires_at, user_agent, ip_address, last_seen_at)
        VALUES ($1, $2, $3::timestamptz, $4, $5::inet, now())
      `,
      [args.token, args.userId, args.expiresAtIso, ua, ip]
    );
  } catch (error: any) {
    if (error?.code === '42703') {
      await query(
        `
          INSERT INTO sessions (token, user_id, expires_at)
          VALUES ($1, $2, $3::timestamptz)
        `,
        [args.token, args.userId, args.expiresAtIso]
      );
    } else if (error?.code === '22P02') {
      // Invalid IP literal: retry without IP metadata.
      await query(
        `
          INSERT INTO sessions (token, user_id, expires_at, user_agent, last_seen_at)
          VALUES ($1, $2, $3::timestamptz, $4, now())
        `,
        [args.token, args.userId, args.expiresAtIso, ua]
      );
    } else {
      throw error;
    }
  }

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
    if (error?.code !== '42703') {
      throw error;
    }

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
  }
}

export async function findAuthUserForLogin(
  email: string,
  nickname: string,
  walletAddress: string
): Promise<AuthUserRow | null> {
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
    [email, nickname, walletAddress]
  );

  return result.rows[0] || null;
}
