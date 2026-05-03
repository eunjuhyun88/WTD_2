# W-0401 — Verdict Accumulation Flywheel (Layer C Threshold=50 가속화)

> Wave: 6 | Priority: P0 | Effort: M (총 4 PR)
> Charter: In-Scope (Terminal Hub UX + Layer C)
> Issue: #1004
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Depends on: W-0397 (#965), W-0398 (#968), W-0400 (#987)

## Goal
사용자가 verdict 50개 누적까지 평균 21일 → **7일 이내**로 단축, Layer C LightGBM 첫 학습이 발사되어 패턴 점수 모델이 자동으로 turbo 모드로 전환되는 경험을 베타 사용자 모두가 1회 이상 본다.

## Owner
app + engine

## Scope

**포함:**
- P1: streak counter (distinct day) + 5 배지 tier (1/3/7/14/30) — passport.py 확장 + passport UI
- P2: unverified pattern in-app badge — VerdictInboxPanel 대기 카운트 prop + header dot (≥10건)
- P3: daily digest email — Supabase cron function 06:00 KST + verdict summary + 다음 임계값까지 N
- P4: A/B telemetry — verdict_velocity_per_user metric, F-60 dashboard panel, cohort analysis

**파일:**
- `engine/passport.py` (streak 카운터 + 배지 임계값 5종)
- `engine/api/routes/passport.py` (streak 필드 SSR)
- `app/src/routes/passport/[username]/+page.server.ts`
- `app/src/lib/components/passport/StreakBadgeCard.svelte` (신규)
- `app/src/lib/hubs/terminal/peek/VerdictInboxPanel.svelte` (대기 카운트 prop)
- `app/src/lib/components/header/UnverifiedDot.svelte` (신규)
- `engine/notifications/digest.py` (신규)
- `app/supabase/migrations/053_verdict_flywheel.sql` (streak_history, digest_subscriptions, verdict_velocity_snapshots)
- `app/supabase/functions/digest-email/index.ts` (신규)
- `engine/observability/verdict_velocity.py` (신규)
- `app/src/lib/components/admin/VerdictVelocityPanel.svelte` (신규)

## Non-Goals
- Push notification (browser permission UX 깨짐, 옵트인 5% → P3 이연)
- Auto-resolve ABSTAIN (Layer C 학습 데이터 노이즈 증가)
- Public leaderboard 즉시 (bottom 사용자 위축 → threshold 도달 후 P3 retention용)
- streak = mark 횟수 누적 (게이밍 방지 위해 distinct day)

## 가속 메커니즘 트레이드오프

| 메커니즘 | 효과 추정 | 채택 | 근거 |
|---|---|---|---|
| A. Streak 게이미피케이션 | +30~50% 일일 활성도 | ✅ | Duolingo 케이스, distinct day로 게이밍 방지 |
| B. Push notification | +20~40% 응답률 | ❌ | 옵트인 5%, spam 역효과 |
| C. Daily digest email | +15~30% 주간 활성도 | ✅ | unsubscribe 부담 낮음 |
| D. Auto-resolve ABSTAIN | 양↑품질↓ | ❌ | Layer C 학습 노이즈 증가 |
| E. Public leaderboard | +20~80% top user | ⏳P3 | bottom 위축, 도달 후 retention용 |
| F. Unverified in-app badge | +10~25% 복귀 | ✅ | 저강도, 거부감 없음 |

## Phase Breakdown (4 PR)

| Phase | PR | Scope | Effort | AC 핵심 수치 |
|---|---|---|---|---|
| P1 | PR-A | streak counters + 배지 5종 (passport.py + UI) | M | streak 1/3/7/14/30 정확, unit tests ≥10 |
| P2 | PR-B | unverified pattern in-app badge + header dot | S | 대기 ≥10건 dot, 클릭 → /patterns ≤200ms |
| P3 | PR-C | daily digest email (Supabase function + cron) | M | 06:00 KST 발송, open rate ≥30%, click ≥10% |
| P4 | PR-D | A/B telemetry + verdict_velocity panel | S | +30% velocity, Wilcoxon p<0.05, d≥0.5 |

P1/P2 병렬 가능. P3는 P1 이후. P4는 전체 데이터 수집 후 마지막.

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| streak 게이미피케이션 → 무판단 클릭 | 중 | High | distinct day count + latency<2s 비율 ≤30% 품질 게이트, weight 0 |
| email digest unsubscribe 폭주 | 저 | 중 | 명확한 가치 + 1-click toggle |
| in-app dot spam 인식 | 저 | 중 | 임계값 ≥10, 8px 미세 dot |
| Layer C threshold 도달 후 학습 실패 | 저 | High | W-0400 F-60 대시보드 모니터, rollback + transparent 통지 |
| A/B 통계 power 부족 (n<20) | 중 | 중 | W-PF-100-P2 베타 코호트와 시작일 동기화 (n≥30) |

### Dependencies
- W-0397 (#965 merged): kbd+undo+ETA 이미 존재
- W-0398 (#968 merged): Layer C scheduler 배선 완료
- W-0400 (#987 merged): F-60 대시보드 존재 → verdict_velocity panel 추가

## AI Researcher 관점

### 측정 설계 (PR-D)
- **Metric**: `verdict_velocity = COUNT(verdicts) / active_days` per user, 14일 윈도우
- **Cohort**: within-subject paired (도입 전 14일 vs 도입 후 14일)
- **Test**: paired Wilcoxon signed-rank, α=0.05, BH-FDR (3 메트릭)
- **Target**: Cohen's d ≥ 0.5, n ≥ 20, power ≥ 0.80

### 품질 보전 지표
- median verdict latency — 목표 단축, 단 latency<2s 비율 ≤30% (무판단 게이트)
- threshold=50 도달 사용자 수 도입 전 vs 후 ≥2x
- Layer C valid_acc 도입 전 대비 -2pt 이내 (품질 보전)

## Decisions
- [D-1] 채택: A+C+F, B/D 거절, E는 P3 이연
- [D-2] streak = distinct day count (게이밍 방지)
- [D-3] streak 임계값 1/3/7/14/30 (passport.py 기존 패턴 재사용)
- [D-4] in-app badge 임계값 = 대기 ≥10건
- [D-5] daily digest = 06:00 KST, Supabase scheduled function, 1-click unsubscribe
- [D-6] A/B = within-subject paired (전후 14일), W-PF-100-P2 코호트 통합
- [D-7] verdict latency<2s 비율 ≤30% → 초과 시 Layer C weight 0
- [D-8] migration 053 (052는 W-PF-100-P2)
- [D-9] streak/digest opt-out 가능, 기본 opt-in (베타 한정)

## Canonical Files
- `engine/passport.py`
- `engine/api/routes/passport.py`
- `app/src/routes/passport/[username]/+page.server.ts`
- `app/src/lib/components/passport/StreakBadgeCard.svelte`
- `app/src/lib/hubs/terminal/peek/VerdictInboxPanel.svelte`
- `app/src/lib/components/header/UnverifiedDot.svelte`
- `engine/notifications/digest.py`
- `app/supabase/migrations/053_verdict_flywheel.sql`
- `app/supabase/functions/digest-email/index.ts`
- `engine/observability/verdict_velocity.py`
- `app/src/lib/components/admin/VerdictVelocityPanel.svelte`

## Facts
- W-0397 (#965), W-0398 (#968), W-0400 (#987) 모두 merged — 의존성 충족
- 현재 마지막 migration: `051_tv_imports.sql` → 다음 번호 052 선점 확인 필요
- `VerdictInboxPanel.svelte` 이미 존재, prop 추가만 필요
- `passport.py` streak 필드 미존재 — 신규 추가

## Assumptions
- A1: migration 052번이 W-PF-100-P2에 선점됨 → W-0401은 053 사용
- A2: distinct day 기준 timezone = KST 00:00
- A3: 베타 사용자 ≥20명 확보 가능 (A/B power 충족)
- A4: Supabase scheduled functions (pg_cron) 이미 활성화 상태

## Open Questions
- [ ] [Q-1] streak grace day 1회/주 허용 여부 — 베타 데이터 후 결정
- [ ] [Q-2] digest 발송 시간 06:00 vs 09:00 KST — A/B 분기 가능
- [ ] [Q-3] in-app badge 임계값 10 vs 20 — 평균 대기량 측정 후 조정
- [ ] [Q-4] streak 끊김 시 격려 메시지 (소셜 유도) — P3 이연 검토

## Exit Criteria
- [ ] AC1: streak 1/3/7/14/30 배지 5종 정확 카운트, passport SSR 노출 (unit tests ≥10 PASS)
- [ ] AC2: 대기 ≥10건 in-app dot 표시, 클릭 → /patterns ≤200ms
- [ ] AC3: daily digest 06:00 KST 발송, open rate ≥30%, click rate ≥10% (베타 ≥20명, 7일)
- [ ] AC4: verdict_velocity_per_user 도입 후 ≥30% 증가, paired Wilcoxon p<0.05, Cohen's d≥0.5 (n≥20, 14일)
- [ ] AC5: latency<2s 비율 ≤30% 품질 게이트, 초과 시 weight 0 적용
- [ ] AC6: threshold=50 도달 사용자 수 도입 전 vs 후 ≥2x
- [ ] AC7: Layer C 학습 valid_acc 도입 전 대비 -2pt 이내
- [ ] AC8: streak/digest opt-out 1-click 작동, unsubscribe rate ≤10%
- [ ] AC9: engine/tests/passport/ + app/tests/verdict-flywheel/ ≥25 PASS
- [ ] AC10: 4 PR 머지, F-60 dashboard verdict_velocity panel, CURRENT.md SHA 업데이트

## Next Steps
1. P1: `engine/passport.py` streak distinct-day 카운터 + 배지 5종 추가
2. P2: `VerdictInboxPanel.svelte` 대기 카운트 + `UnverifiedDot.svelte` 헤더 dot
3. P3: `engine/notifications/digest.py` + Supabase function + cron 셋업
4. P4: `engine/observability/verdict_velocity.py` + F-60 dashboard panel + 측정

## Handoff Checklist
- [ ] W-PF-100-P2 베타 코호트 시작일과 P1 배포 날짜 동기화 확인 (n≥20 보장)
- [ ] migration 053 번호 실측 확인 (현재 051까지, 052=W-PF-201 선점)
- [ ] streak distinct-day 기준 timezone (KST 00:00 기준 확정)
- [ ] Layer C weight 0 로직이 W-0398 auto_trainer.py 학습 input과 통합되는지 확인
