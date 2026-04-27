# W-0132 — Copy Trading Phase 1 (MVP)

## Goal

JUDGE score 기반 트레이더 리더보드 + 구독 시스템 MVP. 단일 진실: memory의 `project_copy_trading_prd_2026_04_22.md`.

## Owner

app

## Scope

### Engine (`engine/`)
- `engine/copy_trading/` 모듈 신설
  - `leader_score.py` — JUDGE win/loss record → ELO-style score 계산
  - `leaderboard.py` — top-N 조회 (Supabase)

### Supabase
- Migration 019: `trader_profiles`, `copy_subscriptions` 테이블
  ```sql
  trader_profiles (id, user_id, display_name, judge_score, win_count, loss_count, updated_at)
  copy_subscriptions (id, follower_id, leader_id, created_at, active)
  ```

### App routes (`app/src/routes/api/`)
- `GET /api/copy-trading/leaderboard` — top-20, judge_score 기준
- `POST /api/copy-trading/subscribe` — leader_id 구독
- `DELETE /api/copy-trading/subscribe/[id]` — 구독 해지

### UI (`app/src/`)
- `lib/cogochi/CopyTradingLeaderboard.svelte` — ConfluenceBanner 레이아웃 재사용
  - rank + display_name + judge_score + W/L + subscribe 버튼
- AppShell 또는 별도 탭에 진입점

## Non-Goals

- Phase 2 (자동 주문 복사, 브로커 연동)
- Phase 3 (성과 수수료, 정산)
- 실시간 포지션 미러링

## Canonical Files

- `work/active/W-0132-copy-trading-phase1.md`
- `work/active/CURRENT.md`
- `memory/project_copy_trading_prd_2026_04_22.md`
- `app/src/routes/api/copy-trading/*`
- `app/src/lib/cogochi/CopyTradingLeaderboard.svelte`
- `engine/copy_trading/`
- `app/supabase/migrations/019_copy_trading_phase1.sql`

## Facts

1. JUDGE score source: `pattern_ledger_records.outcome` (existing)
2. 구독 단계에서는 알림만 — 실제 주문 실행 없음
3. PRD: memory `project_copy_trading_prd_2026_04_22.md`

## Assumptions

1. User auth는 Supabase Auth 기존 연결 사용
2. W-0131 완료 후 시작 (독립 브랜치이므로 병렬 가능)

## Open Questions

- migration 번호와 prod rollout 순서를 W-0126/다른 infra 작업과 어떻게 충돌 없이 맞출지 확인 필요

## Decisions

- Phase 1 owner 는 app 으로 두고, engine scoring/helper 는 feature dependency 로 포함한다.
- 구독 단계에서는 알림/리더보드 까지만 다루고 실제 주문 복사는 Phase 2 이후로 미룬다.

## Next Steps

1. migration 019 스키마를 확정하고 branch 를 `main` 기준 clean lane 으로 생성한다.
2. leaderboard/subscribe API 와 app panel 을 먼저 연결하고 engine score 계산을 얹는다.
3. prod migration 적용 전까지는 UI empty state 와 local verification 을 우선 마친다.

## Exit Criteria

- [ ] `/api/copy-trading/leaderboard` → 200, top-20 리스트
- [ ] `/api/copy-trading/subscribe` → 201, DB 저장 확인
- [ ] LeaderboardPanel 렌더링 — 빈 상태 graceful 처리
- [ ] Migration 019 Supabase prod 실행 완료

## Branch

`claude/w-0132-copy-trading-p1` (base: main)

## Status

PENDING — W-0131 이후 시작 권장 (독립 브랜치로 병렬 실행 가능)

## Handoff Checklist

- active work item: `work/active/W-0132-copy-trading-phase1.md`
- branch/worktree state: target branch `claude/w-0132-copy-trading-p1` not yet created
- verification status: implementation not started; API/UI/migration checks all pending
- remaining blockers: migration 019 definition and rollout order need confirmation
