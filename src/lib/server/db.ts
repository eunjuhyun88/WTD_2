// @ts-expect-error — pg ships without built-in types; install @types/pg to remove this
import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = env[name as keyof typeof env];
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env[name as keyof typeof env];
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function shouldUseSsl(connectionString: string): boolean {
  return !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
}

export function getPool(): pg.Pool {
  if (_pool) return _pool;

  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  // Defaults tuned for moderate concurrency; override with env in production.
  const max = envInt('PGPOOL_MAX', 24, 2, 200);
  const idleTimeoutMillis = envInt('PGPOOL_IDLE_TIMEOUT_MS', 30000, 1000, 300000);
  const connectionTimeoutMillis = envInt('PGPOOL_CONN_TIMEOUT_MS', 5000, 500, 60000);
  const maxUses = envInt('PGPOOL_MAX_USES', 7500, 0, 1000000);

  // Statement timeout: kill any query running longer than this (default 15s)
  const statementTimeoutMs = envInt('PGPOOL_STATEMENT_TIMEOUT_MS', 15000, 1000, 120000);
  const sslDisabled = envBool('PGSSL_DISABLE', false);
  const sslInsecureSkipVerify = envBool('PGSSL_INSECURE_SKIP_VERIFY', false);
  const useSsl = !sslDisabled && shouldUseSsl(connectionString);

  _pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: !sslInsecureSkipVerify } : false,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    maxUses,
  });

  if (useSsl && sslInsecureSkipVerify) {
    console.warn('[DB Pool] PGSSL_INSECURE_SKIP_VERIFY=true (TLS certificate validation disabled)');
  }

  // Set statement_timeout on every new connection to prevent runaway queries
  _pool.on('connect', (client: pg.PoolClient) => {
    client.query(`SET statement_timeout = ${statementTimeoutMs}`).catch(() => {});
  });

  // Log pool errors (connection drops, etc.) instead of crashing
  _pool.on('error', (err: Error) => {
    console.error('[DB Pool] Unexpected error on idle client:', err.message);
  });

  return _pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
