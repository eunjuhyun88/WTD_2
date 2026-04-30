# W-0340 — Wallet 연결 전면 개편 (실연결화 + Privy 임베디드 통합)

> Wave: 4 | Priority: P1 | Effort: L
> Charter: In-Scope — Wallet UX, Auth, Connect
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: #724

## Goal

지갑 연결이 실제로 동작하게 한다: `simulatedWallet.ts` 제거, 실 EIP-1193 연결 경로 확립, Privy 임베디드 지갑으로 이메일/소셜 로그인 → 지갑 자동 생성 지원.

## Scope

### 포함

- `simulatedWallet.ts` 완전 삭제 + walletStore.ts 실연결 경로 전환
- `walletStore.ts` `connectWallet()` / `signMessage()` 시뮬레이션 제거
- `WalletModal.svelte` `profile` step → ProfileDrawer 이전 (1103줄 → ≤600줄)
- Privy SDK 설치 + `wallet-select` step에 이메일/소셜 옵션 추가
- `/api/auth/privy` SvelteKit endpoint 신설 (Privy JWT 검증 → 세션 발급)
- Backend JWKS 이중화 (Supabase + Privy)
- AppNavRail 지갑 버튼 + ProfileDrawer (이미 Phase 0에서 완료)

### 파일

```
app/src/lib/wallet/simulatedWallet.ts          삭제
app/src/lib/stores/walletStore.ts              수정 (시뮬레이션 → 실연결)
app/src/components/modals/WalletModal.svelte   수정 (슬림화)
app/src/routes/api/auth/privy/+server.ts       신규
app/src/lib/wallet/privyClient.ts              신규
app/src/components/layout/AppNavRail.svelte    완료 (Phase 0)
app/src/components/layout/ProfileDrawer.svelte 완료 (Phase 0)
```

### API

- `POST /api/auth/privy` — Privy access_token → session cookie 발급
- `GET /api/auth/privy/jwks` — Privy JWKS 프록시 (선택)

## Non-Goals

- Store 분리 (connectionStore/sessionStore/progressionStore) — W-0341로 분리
- 온체인 잔고 실시간 조회 — W-0281 Paper Trading 범위
- Copy trading, leaderboard, AI 차트 분석, 자동매매 (Frozen)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| MetaMask 미설치 브라우저 | 높음 | 중간 | WalletConnect + Privy 폴백 |
| Privy SDK SvelteKit SSR 충돌 | 중간 | 높음 | `{#if browser}` 가드, dynamic import |
| JWKS 검증 실패 시 인증 불통 | 낮음 | 높음 | Privy → fallback Supabase 순서 유지 |
| simulatedWallet 제거 후 기존 테스트 깨짐 | 낮음 | 중간 | grep으로 사전 확인 (walletStore.ts만 사용 확인됨) |

### Dependencies

- `@privy-io/react-auth` 대신 `@privy-io/js-sdk-core` (SvelteKit 호환)
- WalletConnect projectId: `af0c49471ce93fc0242c8bc88e366c26` (이미 .env.local)
- Privy App ID: `cmoky0024008r0cjrdf4cxws3` (이미 .env.local)
- Base chain (8453) primary

### Rollback

Phase 1은 store 레벨 변경 — `connectWallet()` 시그니처 유지로 WalletModal 호환.  
Privy는 별도 auth 경로 추가이므로 기존 MetaMask 경로에 무영향.

## AI Researcher 관점

### Data Impact

- 기존 localStorage에 저장된 `walletState`는 connected=true일 수 있으나 simulated address → 로그인 시 서버 검증 실패. 마이그레이션 불필요 (재연결 유도).

### Statistical Validation

- 실연결 성공률 KPI: MetaMask E2E 3회 연속 성공 (수동 검증)
- Privy 이메일 플로우: 신규 이메일 → embedded wallet 생성 → `/api/auth/privy` 200

### Failure Modes

1. `window.ethereum` undefined → WalletConnect 또는 Privy 안내 표시
2. 사용자 서명 거부 → `sign-message` step 재시도 UI
3. Privy token만료 → `/api/auth/privy` 401 → re-login 유도

## Decisions

- [D-0340-1] `connectWallet(provider, address, chain)` 시그니처 유지 (WalletModal 호환) — 내부 구현만 교체. 거절: 시그니처 변경 시 WalletModal 전체 수정 필요.
- [D-0340-2] Privy JS SDK Core (`@privy-io/js-sdk-core`) 사용, React Auth SDK 사용 안 함 — SvelteKit SSR 안전. 거절: React SDK는 React 의존성 도입.
- [D-0340-3] `simulatedWallet.ts` 완전 삭제 (wrapper 아님) — grep 0 확인 후 삭제. 거절: 유지 시 혼동 지속.

## Open Questions

- [ ] [Q-0340-1] Privy embedded wallet Base 체인 지원 확인 (docs 리뷰 필요)
- [ ] [Q-0340-2] 기존 MetaMask 연결 사용자의 Privy 계정 병합 전략

## Implementation Plan

### Phase 1 — simulatedWallet 제거 + 실연결 경로 확립

1. `walletStore.ts`: import 제거, `connectWallet()` / `signMessage()` 직접 데이터 수용
2. `simulatedWallet.ts` 삭제
3. `svelte-check` + vitest 확인

### Phase 2 — WalletModal 슬림화

4. `profile` step 제거 (ProfileDrawer 담당)
5. 미사용 코드 제거 → ≤600줄 목표
6. `svelte-check` 확인

### Phase 3 — Privy 통합

7. `pnpm add @privy-io/js-sdk-core` (또는 공식 SvelteKit 지원 패키지)
8. `privyClient.ts` 신설: Privy 초기화 + `loginWithEmail()` / `getAccessToken()`
9. `WalletModal.svelte` `wallet-select` step에 소셜/이메일 섹션 추가
10. `/api/auth/privy/+server.ts`: Privy access_token → JWKS 검증 → 세션 발급
11. `svelte-check` + 수동 E2E

### Phase 4 — Backend JWKS 이중화

12. `engine/auth/` Privy JWKS URL 추가
13. JWT verifier 순서: Supabase → Privy (fallback)

## Exit Criteria

- [ ] AC1: `grep -r "simulatedWallet" app/src/` → 0 results
- [ ] AC2: MetaMask/Coinbase/WalletConnect 연결 → Base(8453) 실서명 성공 (수동 E2E)
- [ ] AC3: Privy 이메일 → embedded wallet → `/api/auth/privy` 200 + session cookie
- [ ] AC4: WalletModal ≤600줄 (`wc -l WalletModal.svelte`)
- [ ] AC5: ProfileDrawer Disconnect 동작 (logoutAuth + disconnectWallet)
- [ ] AC6: AppNavRail 지갑 버튼 — 미연결: Connect 모달 열기, 연결: ProfileDrawer 열기
- [ ] AC7: `svelte-check` 0 errors
- [ ] AC8: vitest 기존 테스트 전부 PASS (회귀 없음)
- [ ] AC9: CI green + PR merged + CURRENT.md SHA 업데이트
