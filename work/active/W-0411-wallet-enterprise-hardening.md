# W-0411 Wallet Enterprise Hardening

## Goal
Privy 이메일 로그인 + 지갑 연결 전체 플로우를 기업 배포 수준으로 hardening — 이메일 전용 유저도 완전한 인증 상태로 인식.

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

## Non-Goals
- DB migration (user_profiles 테이블 생성) — 별도 작업
- Privy dashboard origin 등록 — 수동 설정
- WalletConnect 프로젝트 세팅 변경

## Exit Criteria
- [x] Privy 이메일 OTP 로그인 성공
- [x] MetaMask/Phantom/Base SDK not found 제거
- [x] 이메일 유저 세션 재로드 후 유지
- [x] 이메일 유저 인증 상태 Header/AppTopBar 반영
- [x] Beta gate 이메일 체크
- [x] GMX/Polymarket 지갑 소유권 검증

## Canonical Files
- `app/src/lib/wallet/privyClient.ts`
- `app/src/lib/wallet/providers.ts`
- `app/src/lib/api/auth.ts`
- `app/src/lib/stores/walletStore.ts`
- `app/src/hooks.server.ts`
- `app/src/routes/api/auth/privy/+server.ts`

## Facts
- Privy `loginWithCode` 반환: `identity_token` / `token` (not `accessToken`)
- `@vite-ignore` + variable = Vite가 번들 안함 → 런타임 "SDK not found"
- `credentials:'include'` 없으면 cross-origin 쿠키 미전송
- `hydrateAuthSession()` 미호출 시 이메일 세션 재로드 불가

## Assumptions
- Privy dashboard에 dev origin 등록됨
- Supabase sessions 테이블 존재 (migrations 적용됨)

## Open Questions
- user_profiles 테이블 migration dev DB 미적용 → passport 로드 실패 잔존

## Decisions
- `accessToken` → `identity_token ?? token` 로 수정 (Privy SDK 실제 반환값 기준)
- 이메일 전용 유저 `isAuthenticated = connected || !!(email || nickname)`

## Next Steps
- W-PF-100-P2-eval-challenge 착수
- dev DB migration 적용 (user_profiles, auth_sessions 테이블)

## Handoff Checklist
- [x] PR #1191 merged
- [x] CURRENT.md SHA 업데이트 (PR #1193)
- [x] work item 파일 생성
