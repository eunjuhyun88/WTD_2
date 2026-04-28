# Beta Allowlist — Operations

Beta access is controlled by the `beta_allowlist` table in Supabase.

## Adding a user

```bash
DATABASE_URL=<your-db-url> npx tsx app/scripts/beta-allowlist.ts add 0xWALLET --email user@example.com --note "twitter friend"
```

## Viewing the list

```bash
DATABASE_URL=<your-db-url> npx tsx app/scripts/beta-allowlist.ts list
```

## Revoking access

```bash
DATABASE_URL=<your-db-url> npx tsx app/scripts/beta-allowlist.ts revoke 0xWALLET
```

## Promoting a waitlist user

A user on the waitlist has a `revoked_at` timestamp. To grant access, set `revoked_at = NULL`:

```sql
UPDATE beta_allowlist SET revoked_at = NULL WHERE wallet_address = '0xabc...';
```

Or use the add command again (it un-revokes on conflict):

```bash
npx tsx app/scripts/beta-allowlist.ts add 0xWALLET
```

## BETA_OPEN flag

To disable the gate entirely (e.g., open beta):

```
BETA_OPEN=true
```

Set this in Vercel / Cloud Run env to bypass all allowlist checks.

## How it works

1. User signs in with wallet (SIWE signature)
2. `hooks.server.ts` calls `checkBetaAllowlist(user.wallet_address)` after session hydration
3. If wallet not in allowlist → `/?auth=beta-pending` redirect (shows waitlist panel)
4. If wallet in allowlist → normal app access
5. Result cached in `hotCache` for 45s to avoid per-request DB hits
