# W-0401-P1 — Verdict Streak Distinct-Day Counter + 5 배지

> Wave: 6 | Priority: P0 | Effort: M (1 PR)
> Charter: In-Scope (Terminal Hub UX + Layer C 가속)
> Issue: #1018
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Parent: W-0401 (#1004) — Verdict Accumulation Flywheel
> Depends on: W-0397 (#965), W-0398 (#968)

## Goal
사용자가 자신의 passport에서 verdict 연속 일수(distinct day) 스트릭과 5개 배지 단계(1/3/7/14/30일)를 보고, 다음 단계까지 남은 일수를 알 수 있다 — Layer C threshold=50 도달까지의 일일 활성도를 +30~50% 끌어올리는 게이미피케이션 1차 발사.

## Owner
app + engine

## Scope

**포함:**
- `engine/api/routes/passport.py` `_compute_streak` + `_compute_badges` 확장 (3 → 8 배지: 기존 3 + streak 5)
- 5 streak 배지 임계값: 1일, 3일, 7일, 14일, 30일
- 게이밍 방지: distinct day count (UTC date 기준), 같은 날 N개 verdict = 1일
- 품질 게이트: latency<2s 비율 ≤30% (streak 카운트에서 무판단 클릭 제외)
- Supabase migration 054: `streak_history` view (user_id, date_utc, verdict_count, latency_p50_ms, qualified)
- 신규 컴포넌트: `app/src/lib/components/passport/StreakBadgeCard.svelte`
- `+page.server.ts`에서 streak/badges 받아 Card에 전달

**파일:**
- `engine/api/routes/passport.py` (수정: badges/streak 확장)
- `engine/tests/test_passport_streak.py` (신규)
- `app/supabase/migrations/054_verdict_streak_history.sql` (신규)
- `app/src/routes/passport/[username]/+page.server.ts` (수정)
- `app/src/lib/components/passport/StreakBadgeCard.svelte` (신규)
- `app/src/routes/passport/[username]/+page.svelte` (수정: Card 마운트)

## Facts
- Issue: #1018
- Parent: W-0401 (#1004)
- Depends on: W-0397 (#965 merged), W-0398 (#968 merged)
- migration: 054 (053 = agent_equity_snapshots.sql 사용 중)

## Canonical Files
- `engine/api/routes/passport.py`
- `engine/tests/test_passport_streak.py`
- `app/supabase/migrations/054_verdict_streak_history.sql`
- `app/src/lib/components/passport/StreakBadgeCard.svelte`
- `app/src/routes/passport/[username]/+page.server.ts`
- `app/src/routes/passport/[username]/+page.svelte`

## Assumptions
- W-0395 Phase 5 (#983 merged): /passport/[username] SSR 페이지 존재
- 기존 `_compute_streak` 로직 존재 (7일 연속 배지만 있음) — 확장 작업
- 베타 코호트 n ≥ 10 (W-PF-100-P2와 동기화)

## Non-Goals
- Push notification / email digest (W-0401 P3)
- in-app badge dot (W-0401 P2)
- A/B telemetry / verdict_velocity panel (W-0401 P4)
- Public streak leaderboard (P3 이연)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| timezone 불일치로 streak 끊김 | 중 | 중 | UTC date 고정 + KST hint UI 표기 |
| 무판단 클릭 게이밍 (latency<2s) | 중 | 중 | qualified=true 필터 (latency_p50_ms ≥ 2000ms) |
| 기존 3 배지 사용자 마이그레이션 | 저 | 저 | 5 streak 배지가 superset, 기존 배지 삭제 없음 |
| Layer C 학습 데이터 노이즈 | 저 | 중 | streak에만 영향, ML 학습은 별도 weight |

### Dependencies / Rollback
- W-0397 (#965 merged) ✅
- W-0398 (#968 merged) ✅
- W-0395 Phase 5 (#983 merged) ✅ /passport/[username] SSR
- Rollback: 단일 PR revert + migration down
- Files touched: 6파일 (engine 2, app 4)

## AI Researcher 관점

### Streak 정의 (게이밍 방지)
```sql
-- distinct day, qualified verdict only
streak = consecutive days where:
  COUNT(verdicts WHERE latency_ms >= 2000) >= 1
  GROUP BY DATE(verdict_ts, 'UTC')
```

### 측정
- `streak_days` 분포 (hist), median, p90
- 5 배지 도달자 수 / 베타 코호트
- 무판단 클릭 비율 (latency<2s) — 30% 초과 시 alert

### Failure Modes
- **F1**: 사용자가 KST 자정 직전 1개, 직후 1개 → UTC로 다른 날 처리. UI에 "based on UTC days" hint 표기
- **F2**: 베타 코호트 n<20 → W-PF-100-P2 코호트와 동기화
- **F3**: 5 배지 디자인이 작은 화면에서 깨짐 → mobile breakpoint 360px 우선 검증

## Decisions
- [D-1] 5 streak 배지 임계값 = 1/3/7/14/30 (W-0401 부모 D-3 재확인)
- [D-2] distinct day = UTC 날짜 기준 (DB 일관성)
- [D-3] qualified = latency≥2000ms verdict 1+ (게이밍 방지)
- [D-4] 기존 3 배지(streak_7/first_50/acc_70)와 신규 5 streak 배지 병존 (총 8개)
- [D-5] streak_history 뷰는 daily aggregation (실시간 계산 비용 회피)

### 거절 옵션
- **streak = COUNT(verdicts)**: 거절 — 같은 날 100개 클릭 게이밍 가능
- **KST 기반 day**: 거절 — DB는 UTC, frontend display만 KST hint 표기
- **streak 1일 grace period**: 거절 → P3 검토

## Open Questions
- [ ] [Q-1] 5 배지 SVG/이모지 디자인 — 디자이너 핸드오프 vs LLM 생성?

## Implementation Plan
1. **migration 054**: `verdict_streak_history` materialized view + `qualified` 필터 (latency_ms ≥ 2000)
2. **engine/api/routes/passport.py**: `_compute_streak` qualified 필터 추가, `_compute_badges` 5 streak 배지 추가 + 기존 3 유지, `next_streak_threshold` 컬럼 추가
3. **+page.server.ts**: `streak_days`, `badges`, `next_threshold_days_left` 통과
4. **StreakBadgeCard.svelte**: 5단계 progress bar + 현재 배지 하이라이트 + next milestone "X일 더"
5. **+page.svelte**: Card 마운트 (기존 BadgeCarousel 위에)
6. **테스트**: pytest 게이밍 케이스 5종 이상 (same-day 100, latency<2s, UTC boundary, 끊김 reset, 신규 사용자), vitest StreakBadgeCard 5종

## Next Steps
1. migration 054 작성
2. engine/api/routes/passport.py 확장 + pytest
3. StreakBadgeCard.svelte 신규 + +page.server.ts 수정
4. PR 생성

## Handoff Checklist
- [ ] migration 054 up/down 작동
- [ ] pytest ≥10 pass (streak 정확도 + 게이밍 방지)
- [ ] StreakBadgeCard 모바일 360px 깨짐 없음
- [ ] svelte-check 0 errors
- [ ] CI green / PR merged

## Exit Criteria
- [ ] AC1: streak 1/3/7/14/30 정확 (distinct UTC day, qualified only) — pytest ≥10 pass
- [ ] AC2: 같은 날 100 verdict → streak +1 (게이밍 방지 확인)
- [ ] AC3: 베타 코호트 ≥10명 streak ≥3 도달 (1주 후 측정)
- [ ] AC4: StreakBadgeCard 모바일 360px 깨짐 없음 (vitest snapshot)
- [ ] AC5: /passport/[username] SSR latency p95 변화 ±10% 이내
- [ ] AC6: svelte-check 0 errors / pytest 0 errors
- [ ] CI green / PR merged / CURRENT.md SHA 업데이트
