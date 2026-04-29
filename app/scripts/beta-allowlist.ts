#!/usr/bin/env node
/**
 * Beta allowlist admin CLI
 *
 * Usage:
 *   npx tsx scripts/beta-allowlist.ts add 0xABC --email a@b.com --note "twitter friend"
 *   npx tsx scripts/beta-allowlist.ts revoke 0xABC
 *   npx tsx scripts/beta-allowlist.ts list
 *
 * Requires DATABASE_URL in environment.
 */
import pg from 'pg';

const { Client } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

async function getClient(): Promise<pg.Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

const [, , command, walletRaw, ...rest] = process.argv;

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

async function main() {
  if (command === 'add') {
    if (!walletRaw) { console.error('wallet_address required'); process.exit(1); }
    const wallet = walletRaw.toLowerCase().trim();
    const flags = parseFlags(rest);
    const client = await getClient();
    try {
      await client.query(
        `INSERT INTO beta_allowlist (wallet_address, email, note, invited_by)
         VALUES ($1, $2, $3, 'admin')
         ON CONFLICT (wallet_address) DO UPDATE SET
           email = COALESCE($2, beta_allowlist.email),
           note = COALESCE($3, beta_allowlist.note),
           revoked_at = NULL`,
        [wallet, flags.email ?? null, flags.note ?? null],
      );
      console.log(`✓ Added: ${wallet}`);
    } finally {
      await client.end();
    }
  } else if (command === 'revoke') {
    if (!walletRaw) { console.error('wallet_address required'); process.exit(1); }
    const wallet = walletRaw.toLowerCase().trim();
    const client = await getClient();
    try {
      await client.query(
        `UPDATE beta_allowlist SET revoked_at = now() WHERE wallet_address = $1`,
        [wallet],
      );
      console.log(`✓ Revoked: ${wallet}`);
    } finally {
      await client.end();
    }
  } else if (command === 'list') {
    const client = await getClient();
    try {
      const res = await client.query(
        `SELECT wallet_address, email, note, added_at, revoked_at, first_login_at
         FROM beta_allowlist ORDER BY added_at DESC`,
      );
      if (res.rows.length === 0) {
        console.log('(empty)');
      } else {
        console.log(`${'ADDRESS'.padEnd(45)} ${'STATUS'.padEnd(10)} EMAIL`);
        console.log('-'.repeat(80));
        for (const row of res.rows) {
          const status = row.revoked_at ? 'waitlist' : 'active';
          console.log(`${row.wallet_address.padEnd(45)} ${status.padEnd(10)} ${row.email ?? ''}`);
        }
      }
    } finally {
      await client.end();
    }
  } else {
    console.log('Usage: beta-allowlist.ts <add|revoke|list> [wallet_address] [--email x] [--note y]');
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
