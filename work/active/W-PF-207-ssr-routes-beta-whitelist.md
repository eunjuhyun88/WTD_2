# W-PF-207 — PropFirm SSR Routes + Beta Whitelist

> Wave: 6 | Priority: P0 | Effort: M
> Parent Epic: W-PF-100-P2
> Status: 🟡 In Progress
> Created: 2026-05-04

## Goal

베타 유저가 `/propfirm` 진입 시 `subscriptions.beta_invited` 게이트를 통과하고,
평가 구매 → 대시보드 진행 상황 확인 → 검증 인증서 열람까지 완결된 UI 흐름을 제공.

## Scope

- 포함:
  - `GET /api/propfirm/evaluation` — 현재 유저의 evaluation + tier 메트릭 SSR용 API
  - `/propfirm` — 랜딩 (beta gate + eval 상태 분기)
  - `/propfirm/dashboard` — 평가 대시보드 (trading_days, MLL, profit goal, consistency)
  - `/propfirm/verify/[id]` — PASSED 인증서 (public)
  - `subscriptions.beta_invited` 체크 (migration 064에서 이미 컬럼 존재)

- 파일 (7개):
  - `app/src/routes/api/propfirm/evaluation/+server.ts` (신규)
  - `app/src/routes/propfirm/+page.server.ts` (신규)
  - `app/src/routes/propfirm/+page.svelte` (신규)
  - `app/src/routes/propfirm/dashboard/+page.server.ts` (신규)
  - `app/src/routes/propfirm/dashboard/+page.svelte` (신규)
  - `app/src/routes/propfirm/verify/[id]/+page.server.ts` (신규)
  - `app/src/routes/propfirm/verify/[id]/+page.svelte` (신규)

## Non-Goals

- USDC x402 결제 (W-PF-206 — 스킵)
- 트레이딩 UI / 주문 폼 (별도 PR)
- 차트, 포지션 테이블 (별도 PR)

## Page State 분기

### `/propfirm`

```
auth check → not auth → redirect /
beta_invited check → false → render Waitlist
eval query → ACTIVE → redirect /propfirm/dashboard
eval query → PENDING → render "결제 완료 대기" 
eval query → PASSED → redirect /propfirm/verify/[id]
eval query → FAILED → render "재도전" + buy button
eval query → null → render "도전 시작" + buy button ($99)
```

### `/propfirm/dashboard`

```
auth check → not auth → redirect /
eval query → not ACTIVE → redirect /propfirm
render: trading_days / min_days, MLL 현황, profit goal progress, consistency ratio
```

### `/propfirm/verify/[id]`

```
public — no auth required
verification_runs 조회 → PASS/FAIL + snapshot + hash 표시
not found → 404
```

## API: GET /api/propfirm/evaluation

```ts
// Response (200)
{
  evaluation: {
    id, status, trading_days, equity_start, equity_current,
    started_at, ended_at
  },
  tier: {
    name, fee_usd, mll_pct, profit_goal_pct, min_trading_days
  },
  violations: Array<{ rule, detail, violated_at }>
}
// 204 if no active/recent evaluation
// 401 if not authenticated
```

## Beta Gate

- `subscriptions.beta_invited` 컬럼 (migration 064) 조회
- 없는 경우(구독 행 없음) → beta_invited = false 취급
- `BETA_OPEN=true` 환경변수 → gate 건너뜀 (개발용)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| beta_invited 미등록 유저 우회 | 낮음 | 높음 | server load에서 DB 조회 (캐시 45s) |
| evaluation DB 조회 레이턴시 | 중간 | 중간 | 45s 세션 캐시 재활용, JOIN 최소화 |
| verify 페이지 hash 조작 | 낮음 | 높음 | DB stored hash 비교 (클라이언트 입력 신뢰 안 함) |

### Dependencies

- migrations 064, 065, 066 (beta_invited, evaluations, verification_runs)
- `$lib/server/authGuard.ts` — `getAuthUserFromCookies`
- `$lib/server/db.ts` — `query`
- W-PF-204 `evaluation.py` state machine (기존)

## PR 분해 계획

단일 PR (7 파일, M effort) — shell → API wiring 동시 배포 가능.

### PR 1 — SSR Routes + Beta Gate (Effort: M)

**목적**: 베타 유저가 PropFirm 구매 → 대시보드 진행 확인 → 인증서 열람 완결.
**검증 포인트**: beta_invited=false 유저 접근 차단 확인, ACTIVE eval 대시보드 렌더 확인.

신규:
- `app/src/routes/api/propfirm/evaluation/+server.ts`
- `app/src/routes/propfirm/+page.server.ts`
- `app/src/routes/propfirm/+page.svelte`
- `app/src/routes/propfirm/dashboard/+page.server.ts`
- `app/src/routes/propfirm/dashboard/+page.svelte`
- `app/src/routes/propfirm/verify/[id]/+page.server.ts`
- `app/src/routes/propfirm/verify/[id]/+page.svelte`

**Exit Criteria:**
- [ ] AC1: `/propfirm` — beta_invited=false → Waitlist 렌더 (beta_invited=true → 구매/대시보드)
- [ ] AC2: `/propfirm/dashboard` — ACTIVE eval 없으면 /propfirm redirect
- [ ] AC3: `/propfirm/verify/[id]` — PASS eval → 인증서, 없으면 404
- [ ] AC4: `GET /api/propfirm/evaluation` — 401/204/200 정상 분기
- [ ] AC5: CI green

## 전체 Exit Criteria

- [ ] AC1–AC5 (PR 1)
- [ ] CURRENT.md SHA 업데이트
