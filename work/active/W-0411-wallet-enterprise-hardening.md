# W-0411 Wallet Enterprise Hardening

## Goal
Privy 이메일 로그인 + 지갑 연결 전체 플로우를 기업 배포 수준으로 hardening.

## Owner
app

## Status
✅ MERGED — PR #1191 (ba8f76f0)

## Scope
- `app/src/lib/wallet/privyClient.ts` — identity_token/token 수정
- `app/src/lib/wallet/providers.ts` — SDK static imports
- `app/src/lib/api/auth.ts` — credentials:'include'
- `app/src/routes/+layout.svelte` — hydrateAuthSession()
- `app/src/components/layout/AppTopBar.svelte` — isAuthenticated email-only
- `app/src/components/layout/Header.svelte` — isAuthenticated email-only
- `app/src/components/modals/WalletModal.svelte` — EIP-6963, Privy 오류 처리
- `app/src/hooks.server.ts` — beta gate email param
- `app/src/lib/stores/walletStore.ts` — signMessage tier, localStorage
- `app/src/routes/api/auth/privy/+server.ts` — emailHint, IP recording
- `app/src/routes/api/auth/session/+server.ts` — walletAddress consistency
- `app/src/routes/api/beta/waitlist/+server.ts` — email column
- `app/src/routes/api/gmx/prepare/+server.ts` — ownership check
- `app/src/routes/api/gmx/close/+server.ts` — JSON parse safety
- `app/src/routes/api/gmx/confirm/+server.ts` — JSON parse safety
- `app/src/routes/api/positions/polymarket/prepare/+server.ts` — ownership check
- `app/src/routes/api/positions/polymarket/auth/+server.ts` — email-only message
- `app/src/routes/dashboard/+page.svelte` — email-only UX
- `app/src/routes/settings/passport/+page.svelte` — Link Wallet CTA
- `app/src/routes/+page.svelte` — beta-pending banner

## Exit Criteria
- [x] Privy 이메일 OTP 로그인 성공
- [x] MetaMask/Phantom/Base SDK not found 제거
- [x] 이메일 유저 세션 재로드 후 유지
- [x] 이메일 유저 인증 상태 Header/AppTopBar 반영
- [x] Beta gate 이메일 체크
- [x] GMX/Polymarket 지갑 소유권 검증
