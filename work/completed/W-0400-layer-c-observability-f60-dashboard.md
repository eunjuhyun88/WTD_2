---
> Wave: 6 | Priority: P0 | Effort: M (3-4d)
> Charter: In-Scope F-4, F-60
> Status: 🟡 Design Draft
> Created: 2026-05-03
> Issue: #980
---

# W-0400 — Layer C Training Observability & F-60 Progress Dashboard

## Goal
Layer C LightGBM 자동훈련 파이프라인의 실행 현황과 F-60(퀀트 신호 모네타이즈) 달성까지의 진척을 대시보드에서 실시간으로 볼 수 있게 한다.

## Owner
engine + app

## Scope
**포함:**
- migration 052: `layer_c_train_runs` 테이블 (run_id, triggered_at, n_verdicts, status, ndcg_at_5, map_at_10, ci_lower, promoted, version_id)
- `engine/scoring/auto_trainer.py` — `run_auto_train_pipeline()` 종료 시 DB upsert
- `app/src/routes/api/layer_c/progress/+server.ts` — GET endpoint
- `app/src/lib/components/ai/F60ProgressCard.svelte` — sparkline + 게이지
- `app/src/routes/dashboard/+page.svelte` — F60ProgressCard 삽입

**파일:**
```
engine/scoring/auto_trainer.py
engine/tests/test_w0400_observability.py
app/supabase/migrations/052_layer_c_train_runs.sql
app/src/routes/api/layer_c/progress/+server.ts
app/src/lib/components/ai/F60ProgressCard.svelte
app/src/routes/dashboard/+page.svelte
```

## Non-Goals
- Training 파라미터 튜닝 UI (수동 조작 없음)
- 실시간 WebSocket push (polling 충분)
- Copy trading 실행 (F-60 gate 조건만 표시)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| auto_trainer DB write가 훈련 블로킹 | 중 | 높 | INSERT는 fire-and-forget thread 내, 실패 시 log만 |
| migration 052 충돌 (051 미머지 상태) | 낮 | 중 | PR 전 `ls migrations/` 재확인 |
| Dashboard 레이아웃 깨짐 | 중 | 중 | F60ProgressCard → 독립 카드, 기존 grid row 추가 |

### Dependencies
- W-0398 (Layer C 배선) merged ✅
- migration 051 merged (TV imports) ✅
- `engine/scoring/auto_trainer.py` `run_auto_train_pipeline()` 존재 ✅

### Rollback
- migration: `DROP TABLE layer_c_train_runs;`
- auto_trainer DB write: try/except — 실패해도 pipeline 결과 반환 정상

## AI Researcher 관점

### Data Impact
- `layer_c_train_runs`에 훈련 기록 누적 → 훈련 빈도·성능 trend 분석 가능
- F-60 게이지: `verdicts_labelled / 200` + `accuracy ≥ 0.55` 2-조건 AND

### Statistical Validation
- AC3 응답의 `accuracy`는 `scoring.trainer`의 shadow_eval ndcg_at_5 기준
- 게이지가 100%여도 ci_lower ≤ 0.05 run이면 promoted=false → 표시 구분 필요

### Failure Modes
- DB 연결 없을 때 auto_trainer write 실패 → silent (훈련 결과는 정상 반환)
- F60ProgressCard 데이터 없을 때 → "첫 훈련 대기 중" placeholder

## Decisions
- [D-0400-1] DB write는 pipeline 완료 후 동기 INSERT (try/except로 비차단) — async thread 내라 deadlock 없음
- [D-0400-2] `/api/layer_c/progress` 는 Supabase RPC 없이 직접 SELECT (단순 집계)
- [D-0400-3] F60ProgressCard는 hubs/terminal이 아닌 `lib/components/ai/` 배치 (hub boundary 준수)

## Open Questions
- [ ] [Q-0400-1] dashboard 어느 zone에 카드 배치? (현재 3-zone: Opportunity/Stats/SystemStatus)
- [ ] [Q-0400-2] sparkline 라이브러리: Chart.js 재사용 vs CSS-only mini-bars?

## Implementation Plan
1. migration 052 작성 + 로컬 테스트
2. `auto_trainer.py` — pipeline 종료 후 `_persist_run()` 내부 함수 추가
3. `/api/layer_c/progress` GET endpoint (Supabase client)
4. `F60ProgressCard.svelte` — sparkline + 게이지 + 배지
5. dashboard 통합 + typecheck
6. engine tests 5개 이상 (mock DB, progress 계산)
7. PR + CI

## Exit Criteria
- [ ] AC1: `layer_c_train_runs` migration 052 CI green
- [ ] AC2: `run_auto_train_pipeline()` 완료 시 DB row insert (status, ndcg_at_5, ci_lower, promoted)
- [ ] AC3: `/api/layer_c/progress` GET → `{runs: [...], f60_progress: {verdicts_labelled, accuracy, gate_pct}}` 200
- [ ] AC4: `F60ProgressCard` 렌더링 — sparkline (최근 10 run ndcg_at_5), 게이지 (verdicts_labelled/200)
- [ ] AC5: promoted=true run이 있을 때 "🟢 Layer C 활성" 배지 표시
- [ ] AC6: Dashboard에 F60ProgressCard 통합 (기존 레이아웃 깨지지 않음)
- [ ] AC7: engine 테스트 5개 이상 (DB write mock, progress endpoint)
- [ ] AC8: app typecheck green
- [ ] AC9: Sentry breadcrumb: 훈련 실패 시 `layer_c_train_failed` 이벤트
- [ ] AC10: PR merged + CURRENT.md SHA 업데이트

## Facts
```bash
# migration 번호 확인
ls app/supabase/migrations/ | tail -3
# → 051_tv_imports.sql (다음: 052)

# auto_trainer 존재 확인
grep -n "def run_auto_train_pipeline" engine/scoring/auto_trainer.py
# → line 존재 확인

# dashboard 현재 zone
grep -n "zone\|Zone\|card\|Card" app/src/routes/dashboard/+page.svelte | head -10
```

## Canonical Files
- `engine/scoring/auto_trainer.py`
- `engine/tests/test_w0400_observability.py` (신규)
- `app/supabase/migrations/052_layer_c_train_runs.sql` (신규)
- `app/src/routes/api/layer_c/progress/+server.ts` (신규)
- `app/src/lib/components/ai/F60ProgressCard.svelte` (신규)
- `app/src/routes/dashboard/+page.svelte`

## Assumptions
- W-0398 이미 merged (Layer C 배선 완료)
- Supabase client `app/src/lib/server/supabase.ts` 경로 존재
- `scoring.trainer.shadow_eval()` 반환값에 ndcg_at_5 포함

## Next Steps
1. migration 052 작성
2. auto_trainer.py `_persist_run()` 추가
3. API endpoint + Svelte card

## Handoff Checklist
- [ ] migration 052 적용 후 `ls app/supabase/migrations/` 확인
- [ ] engine tests PASS
- [ ] typecheck green
- [ ] PR open + CURRENT.md SHA 업데이트
