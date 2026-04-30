# W-0319 — Wallet Auth Hardening

> Wave: 4 | Priority: P1 | Effort: S | Issue: #676
> Status: Implemented — awaiting PR merge

## Goal

Make the wallet connection and login flow match the shipped UI so users can authenticate with a wallet reliably.

## Owner

app

## Scope

- Allow email + wallet login without nickname when the login UI marks nickname optional.
- Expose Base Smart Wallet in the wallet modal because provider support already exists.
- Return and consume wallet-only auth action as `login` or `register`.
- Add targeted repository tests for optional nickname login lookup.

## Non-Goals

- No DB table migration or auth schema rename in this slice.
- No Solana wallet verification; current server intentionally rejects Solana auth.
- No redesign of the wallet modal visual layout.

## Canonical Files

- `app/src/lib/server/authRepository.ts`
- `app/src/routes/api/auth/login/+server.ts`
- `app/src/routes/api/auth/wallet-auth/+server.ts`
- `app/src/lib/api/auth.ts`
- `app/src/components/modals/WalletModal.svelte`
- `app/src/lib/server/authRepository.test.ts`

## Facts

1. `WalletModal.svelte` labels login nickname as optional.
2. `POST /api/auth/login` currently rejects blank nickname.
3. `findAuthUserForLogin` currently requires email + nickname + wallet.
4. `providers.ts` implements `base`, but `WalletModal.svelte` blocks it in `isWalletProviderKey`.
5. `POST /api/auth/wallet-auth` auto-creates wallet-only users but returns `action: 'login'` for both paths.

## Assumptions

- Email + wallet address is sufficient for login when nickname is absent.
- Returning `action: 'register'` for wallet-only creation is product-useful, but the UI should apply the user for both actions.

## Open Questions

- Should wallet-only users later be forced to add email before paid actions?

## Decisions

- [D-0319-1] Keep nickname optional on login and make server match UI. Rejecting blank nickname was a contract mismatch.
- [D-0319-2] Surface Base Smart Wallet now because the provider code and dependency already exist.
- [D-0319-3] Do not change DB schema in this slice; this is route/client contract hardening.

## Next Steps

1. Patch login lookup and route validation.
2. Patch wallet modal provider/action handling.
3. Add tests and run app verification.

## Exit Criteria

- [x] Login lookup supports email + wallet when nickname is blank.
- [x] Login lookup still supports email + nickname + wallet when nickname is provided.
- [x] Wallet modal can select Base Smart Wallet.
- [x] Wallet-only auto-register applies the authenticated user.
- [x] Focused tests and `npm --prefix app run check` pass.

## Verification

- `npm --prefix app test -- authRepository.test.ts` — pass, 2 tests
- `npm --prefix app test -- session.test.ts authRepository.test.ts` — pass, 6 tests
- `npm --prefix app run check` — pass, 0 errors / 51 warnings

## Handoff Checklist

- [ ] PR merged.
- [ ] Any remaining auth schema concern captured separately.
