# W-0395B — Cogochi Pages V2: 잔여 구현 (Phase 1/6/7/8 미완 PR)

> Wave: 6 | Priority: P1 | Effort: L
> Charter: In-Scope (L1 Product UX)
> Status: 🟢 7/8 완료 — PR-D(조건부)만 대기
> Created: 2026-05-04
> Updated: 2026-05-04
> Parent: W-0395 (work/completed/W-0395-cogochi-pages-v2.md)
> Issue: #955

## Goal

W-0395에서 설계됐으나 구현되지 않은 8개 PR 완성. 각 PR 독립 배포 가능.

---

## 완료된 것 (건드리지 말 것)

| Phase | PR | GitHub | 내용 |
|---|---|---|---|
| Ph1 | PR1 | #999 ✅ | WatchlistRail + ModePill shell |
| Ph1 | PR2 | #1012 ✅ | TRAIN mode QuizStage + train_answers migration 054 |
| Ph6 | PR1 | #1000 ✅ | LabShell 리팩토링 (80줄→3줄) |
| Ph7 | PR0 | #1002 ✅ | agent persistence schema (migration 053) |
| Ph7 | PR1 | #1006 ✅ | /agent/[id] SSR shell + KPI grid |
| Ph7 | PR2 | #1015 ✅ | EquityCurve SVG + shared HoldTimeStrip |
| Ph8 | L-PR1 | #998 ✅ | LiveStatStrip + /api/landing/stats |
| Ph8 | L-PR2 | #1011 ✅ | MiniLiveChart + CTA 4위치 tracking |
| Ph8 | S-PR1 | #1007 ✅ | Settings 5탭 shell |
| Ph8 | S-PR2 | #1014 ✅ | Subscription tier card + verdict usage bar |

---

## 완료 확인 (main 머지됨)

| PR | GitHub | 내용 |
|---|---|---|
| PR-A | #1043 ✅ | GTM 이벤트 3종 |
| PR-B | #1041 ✅ | FLYWHEEL mode |
| PR-C | #1047 ✅ | HoldTimeStrip StatusBar |
| PR-E | #1051 ✅ | HoldTimeStrip ResultPanel |
| PR-F | #1048 ✅ | SendToTerminal |
| PR-G | #1040 ✅ | Decisions table + drawer |
| PR-H | #1044 ✅ | API Keys READ-ONLY |

---

## 미완료 — 구현 대상 (1개)

### PR-A: Ph1 PR3 — GTM 이벤트 3종 (Effort: S)

**목적**: workmode 전환·퀴즈 완료·탭 전환 측정 → AC1(activation 35%) 실측 가능
**선행**: Ph1 PR1/#999 머지됨 ✅

**실측**:
- `app/src/lib/analytics.ts:11` — `workmode_switch` 타입 이미 선언됨
- `app/src/lib/analytics.ts:12` — `rightpanel_tab_switch` 타입 이미 선언됨
- `train_complete` 타입 추가 필요

**신규/수정 파일**:
- `app/src/lib/analytics.ts` — `train_complete` 타입 추가
- `app/src/lib/hubs/cogochi/CogochiHub.svelte` — workmode_switch 이벤트 fire
- `app/src/lib/shared/panels/ModePill.svelte` — 전환 시 track()
- `app/src/lib/hubs/cogochi/panels/QuizStage.svelte` — 완료 시 train_complete track()

**Exit Criteria**:
- [ ] AC-A1: workmode_switch 이벤트 vitest 2케이스 PASS
- [ ] AC-A2: train_complete 이벤트 vitest 2케이스 PASS
- [ ] AC-A3: 0 PII (user_id 미포함)
- [ ] CI green

---

### PR-B: Ph1 PR4 — FLYWHEEL mode (Effort: L)

**목적**: ModePill FLYWHEEL 탭 활성화 — Layer C 진행률 + countdown 표시
**선행**: Ph1 PR1/#999 ✅, W-0400 Ph2A/#1030 ✅ (flywheel health API 존재)

**실측**:
- `app/src/lib/contracts/generated/engine-openapi.d.ts:2146` — `/observability/flywheel/health` stub 존재
- `app/src/lib/shared/panels/CommandPalette.svelte:29` — FLYWHEEL 모드 진입 이미 있음
- W-0400 hook 재활용: `engine/observability/flywheel/` 이미 구현됨

**신규/수정 파일**:
- `app/src/lib/hubs/cogochi/panels/FlywheelStage.svelte` — Layer C 진행률 bar + countdown timer
- `app/src/lib/shared/panels/ModePill.svelte` — FLYWHEEL disabled→active
- `app/src/routes/api/cogochi/flywheel/+server.ts` — `/observability/flywheel/health` proxy

**Exit Criteria**:
- [ ] AC-B1: FLYWHEEL 탭 클릭 시 FlywheelStage 렌더
- [ ] AC-B2: Layer C 진행률 0-100% 표시
- [ ] AC-B3: countdown 1초 단위 감소 (setInterval)
- [ ] CI green

---

### PR-C: Ph1 PR5 — HoldTimeStrip StatusBar (Effort: S)

**목적**: WatchlistRail 하단에 watch 중인 미해결 패턴 TTL 색상 strip
**선행**: Ph1 PR1/#999 ✅, Ph7 PR2/#1015 ✅ (HoldTimeStrip 컴포넌트 존재)

**실측**:
- `app/src/lib/components/shared/HoldTimeStrip.svelte` — 이미 존재 (AgentHub에서 사용 중)
- WatchlistRail이 watch 목록 SWR로 가져옴 — TTL 필드 확인 필요

**신규/수정 파일**:
- `app/src/lib/hubs/cogochi/WatchlistRail.svelte` — 하단 HoldTimeStrip 슬롯 추가
- `app/src/routes/api/cogochi/watchlist/+server.ts` — TTL 필드 포함 확인/추가

**Exit Criteria**:
- [ ] AC-C1: watch 패턴 있을 때 TTL 색상 strip 렌더 (green→yellow→red)
- [ ] AC-C2: watch 패턴 0개일 때 strip 숨김
- [ ] CI green

---

### PR-D: Ph6 PR2 — 6탭→3탭 + StrategyBuilder fold (Effort: M)

**목적**: /lab 탭 수 줄여 UX 단순화
**선행**: Ph6 PR1/#1000 ✅ + **1주 telemetry 데이터 확인 후 진행**

⚠️ **조건**: Ph6 PR1 머지 후 1주 이상 운영 데이터 확인 필수. 탭 사용률 데이터 없이 진행 금지.

**실측**:
- `app/src/lib/hubs/lab/LabHub.svelte:41` — StrategyBuilder import 존재
- `app/src/lib/hubs/lab/LabHub.svelte:447` — StrategyBuilder 렌더 위치 확인

**Exit Criteria**:
- [ ] AC-D1: 탭 6개 → 3개 (GA4 사용률 하위 3개 제거)
- [ ] AC-D2: StrategyBuilder fold/unfold 토글 동작
- [ ] AC-D3: 기존 탭 URL 접근 시 redirect 또는 404 처리
- [ ] CI green

---

### PR-E: Ph6 PR3 — HoldTimeStrip ResultPanel 상단 (Effort: S)

**목적**: /lab backtest 결과에 hold p50/p90 표시
**선행**: Ph6 PR1/#1000 ✅, Ph7 PR2/#1015 ✅ (HoldTimeStrip 존재)

**실측**:
- `app/src/lib/hubs/lab/LabHub.svelte:42` — ResultPanel import 존재
- backtest 결과 데이터에 hold time 필드 확인 필요

**신규/수정 파일**:
- `app/src/lib/components/lab/ResultPanel.svelte` — 상단에 HoldTimeStrip 추가
- `app/src/lib/components/shared/HoldTimeStrip.svelte` — props 확인 (p50/p90/label)

**Exit Criteria**:
- [ ] AC-E1: backtest 결과 있을 때 p50/p90 hold time 표시
- [ ] AC-E2: 결과 없을 때 skeleton 표시
- [ ] CI green

---

### PR-F: Ph6 PR4 — SendToTerminal + cogochi 연결 (Effort: M)

**목적**: /lab에서 패턴 선택 → WatchlistRail로 전송
**선행**: Ph1 PR1/#999 ✅ (WatchlistRail 존재) + Ph6 PR1/#1000 ✅

**신규/수정 파일**:
- `app/src/lib/components/lab/SendToTerminal.svelte` — 신규 버튼 컴포넌트
- `app/src/lib/hubs/lab/LabHub.svelte` — SendToTerminal 연결
- `app/src/lib/stores/workMode.store.ts` — watchlist add 액션

**Exit Criteria**:
- [ ] AC-F1: /lab에서 패턴 선택 후 "→ cogochi" 버튼 클릭 시 WatchlistRail에 추가
- [ ] AC-F2: 이미 watch 중인 패턴은 중복 추가 방지
- [ ] CI green

---

### PR-G: Ph7 PR3 — Decisions table + feature drawer (Effort: L)

**목적**: /agent/[id] 하단 결정 이력 테이블 + 상세 drawer
**선행**: Ph7 PR1/#1006 ✅, Ph7 PR2/#1015 ✅

**실측**:
- migration 053 — `agent_equity_snapshots` + `v_agent_stats` 뷰 존재
- `/api/agents/decisions/[agentId]` — PR0에서 구현됨 (cursor pagination)

**신규/수정 파일**:
- `app/src/lib/hubs/agent/panels/DecisionsTable.svelte` — cursor pagination 테이블
- `app/src/lib/hubs/agent/panels/DecisionDrawer.svelte` — 상세 drawer (≤150ms)
- `app/src/lib/hubs/agent/AgentHub.svelte` — DecisionsTable 연결

**Exit Criteria**:
- [ ] AC-G1: 결정 이력 테이블 cursor pagination 동작 (offset 금지)
- [ ] AC-G2: 행 클릭 시 drawer open ≤150ms
- [ ] AC-G3: drawer close 시 URL 상태 복원
- [ ] CI green

---

### PR-H: Ph8 S-PR3 — API Keys READ-ONLY + AC10 badge (Effort: M)

**목적**: Settings에서 API 키 등록/조회 (trade/withdraw 권한 거부)
**선행**: Ph8 S-PR1/#1007 ✅, Ph8 S-PR2/#1014 ✅

⚠️ **보안 결정 (CTO 확정)**:
- 저장: Supabase pgcrypto (외부 KMS 불필요)
- 검증: CCXT `exchange.fetchPermissions()` — trade/withdraw 감지 시 즉시 reject
- 조회: 평문 secret 클라이언트 미반환 (마스킹: `sk-...xxxx`)

**신규/수정 파일**:
- `app/supabase/migrations/056_api_keys.sql` — api_keys 테이블 (pgcrypto 암호화)
- `app/src/routes/api/settings/api-keys/+server.ts` — POST(등록)/GET(조회)/DELETE
- `app/src/lib/hubs/settings/panels/ApiKeysPanel.svelte` — 등록 폼 + 목록
- `app/src/lib/hubs/settings/SettingsHub.svelte` — ApiKeysPanel 탭 연결

**Exit Criteria**:
- [ ] AC-H1: API 키 등록 시 CCXT 권한 검증 (trade/withdraw → reject)
- [ ] AC-H2: 조회 응답에 secret 평문 미포함 (마스킹만)
- [ ] AC-H3: pgcrypto 암호화 확인 (DB 직접 조회 시 암호화 확인)
- [ ] AC-H4: AC10 badge 노출 (키 등록 시)
- [ ] 보안 리뷰 PASS
- [ ] CI green

---

## 의존 관계 (시작 전 확인)

```
PR-A (GTM)         → Ph1 PR1/#999 ✅ 선행 완료
PR-B (FLYWHEEL)    → Ph1 PR1/#999 ✅, W-0400/#1030 ✅
PR-C (HoldTime WR) → Ph1 PR1/#999 ✅, Ph7 PR2/#1015 ✅
PR-D (6→3탭)       → Ph6 PR1/#1000 ✅ + 1주 telemetry ⏳ 조건부
PR-E (HoldTime RP) → Ph6 PR1/#1000 ✅
PR-F (SendTerminal)→ Ph1 PR1/#999 ✅, Ph6 PR1/#1000 ✅
PR-G (Decisions)   → Ph7 PR1/#1006 ✅, Ph7 PR2/#1015 ✅
PR-H (API Keys)    → Ph8 S-PR2/#1014 ✅, 보안 정책 확정 ✅
```

## 병렬 시작 가능 조합

**즉시 시작 가능 (선행 완료)**:
- PR-A + PR-B + PR-C + PR-E + PR-F + PR-G + PR-H — 7개 병렬 가능

**조건부**:
- PR-D — Ph6 PR1 1주 telemetry 후

## 다음 에이전트 픽업 명령

```bash
cat work/active/W-0395B-cogochi-pages-v2-remaining.md
# PR-A부터 시작: GTM 이벤트 3종 (S, 가장 빠름)
# 또는 PR-G: Decisions table (독립, 백엔드 API 이미 존재)
```

## Canonical Files (건드릴 파일)

- `app/src/lib/analytics.ts`
- `app/src/lib/hubs/cogochi/CogochiHub.svelte`
- `app/src/lib/hubs/cogochi/WatchlistRail.svelte`
- `app/src/lib/hubs/cogochi/panels/QuizStage.svelte`
- `app/src/lib/hubs/cogochi/panels/FlywheelStage.svelte` (신규)
- `app/src/lib/hubs/lab/LabHub.svelte`
- `app/src/lib/components/lab/ResultPanel.svelte`
- `app/src/lib/components/lab/SendToTerminal.svelte` (신규)
- `app/src/lib/hubs/agent/panels/DecisionsTable.svelte` (신규)
- `app/src/lib/hubs/agent/panels/DecisionDrawer.svelte` (신규)
- `app/src/lib/hubs/agent/AgentHub.svelte`
- `app/src/lib/hubs/settings/panels/ApiKeysPanel.svelte` (신규)
- `app/src/routes/api/cogochi/flywheel/+server.ts` (신규)
- `app/src/routes/api/settings/api-keys/+server.ts` (신규)
- `app/supabase/migrations/056_api_keys.sql` (신규)
