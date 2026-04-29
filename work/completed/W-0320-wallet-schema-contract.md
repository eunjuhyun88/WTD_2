# W-0320 — Wallet Auth DB Schema Contract Hardening

> Wave: Wave4 | Priority: P0 | Effort: S
> Status: Review
> Issue: #679

## Goal

Make wallet auth work across the two DB shapes present in the repo: canonical `users/sessions` and legacy `app_users/auth_sessions + user_wallets`.

## Owner

Codex A091 — app auth/wallet DB contract.

## Scope

- Harden `authRepository` reads/writes with a legacy schema fallback.
- Harden wallet link persistence when `users.wallet_address` columns are absent.
- Add tests proving the fallback SQL path.

## Non-Goals

- Do not rewrite the full migration history in this PR.
- Do not change wallet signature cryptography.
- Do not alter onboarding UI copy.

## Canonical Files

- `app/src/lib/server/authRepository.ts`
- `app/src/lib/server/walletAuthRepository.ts`
- `app/src/lib/server/authRepository.test.ts`
- `app/src/lib/server/walletAuthRepository.test.ts`
- `app/supabase/migrations/001_init.sql`
- `app/supabase/migrations/000_bootstrap_v3.sql`

## Facts

- Runtime auth repository currently queries `users` and `sessions`.
- `001_init.sql` creates `app_users`, `user_wallets`, and `auth_sessions`.
- `000_bootstrap_v3.sql` documents production as `users` real table and `app_users` view.
- W-0319 made wallet-auth auto-register usable but still assumes `users.wallet_address`.

## Assumptions

- Production likely has `users/sessions`, so fallback must not disturb the canonical path.
- Local or fresh DBs may still use the `001_init.sql` shape.

## Open Questions

- [ ] Should a later migration cleanup collapse all identity tables to `users/sessions` only?

## Decisions

- **[D-0320-1]** Use query-level fallback for `42P01`/`42703` instead of migration rewrite. This keeps production stable while making older schemas usable.
- **[D-0320-2]** Store legacy wallet identity in `user_wallets`; return `wallet_address` via join.

## Next Steps

1. Done — fallback paths for auth lookup/create/session.
2. Done — tests for canonical failure -> legacy fallback.
3. Done — app tests and check.

## Exit Criteria

- [x] Wallet-only auto-register works when `users.wallet_address` is missing.
- [x] Email+wallet login works when wallet is stored in `user_wallets`.
- [x] Sessions can be created in `auth_sessions` fallback.
- [x] `npm --prefix app test -- authRepository.test.ts walletAuthRepository.test.ts` passes.
- [x] `npm --prefix app run check` passes.

## Handoff Checklist

- [ ] PR merged
- [ ] CI green
- [ ] Next DB migration cleanup noted
