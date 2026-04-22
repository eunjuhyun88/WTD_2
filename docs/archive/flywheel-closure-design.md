# Flywheel Closure Design

## Implementation Status (2026-04-19)

**엔진 사이드 완전 완료. 4축 전부 닫힘.**

| Phase | Status | Main commit | Notes |
|-------|--------|------------|-------|
| A — Capture wiring | ✅ done | earlier session | dual-write + engine canonical |
| B — Outcome resolver | ✅ done | `ced6b20` | hourly Job 3b |
| E — Cold-start + observability | ✅ done | `d6d20e1` | CTO pivot: shipped before C/D |
| C — Verdict labeling | ✅ done | `47afb72` | `POST /captures/{id}/verdict` |
| D — Refinement trigger | ✅ done | `f380610` | daily Job 3c, 10 verdicts + 7 days gate |
| Refactor | ✅ done | `a97d019` | threshold dedup, count_by_status, dead code |

**남은 작업:**
- Verdict Inbox UI (app `/dashboard`) — `W-0097`
- Founder seeding via `POST /captures/bulk_import` (human action)
- Public report publishing (Phase E §3) — after data accumulation

---

## Purpose

이 문서는 WTD v2 제품의 학습 루프를 코드 수준에서 닫는 설계를 canonical 하게 정의한다.

`docs/product/core-loop.md`는 의도된 4-layer flywheel을 정의한다. 이 문서는 그 flywheel이 현재 코드에서 어디까지 닫혀있고, 닫히지 않은 라인을 어떤 인터페이스로 잇는지를 설계한다.

## Diagnosed Gap

코드 조사 결과 모듈은 모두 존재하지만 두 capture store가 분리되어 있다.

- App: `terminal_pattern_captures` 테이블에 직접 INSERT (`app/src/lib/server/terminalPersistence.ts:347`)
- Engine: 자체 `CaptureStore` + `LEDGER_RECORD_STORE` + `PatternStateStore` (`engine/api/routes/captures.py:82`)
- 두 시스템이 서로 호출하지 않는다.

결과: `Save Setup`이 engine ledger로 전달되지 않으므로 outcome resolver / refinement trigger / promotion gate가 user 라벨을 학습 데이터로 받지 못한다. Flywheel은 1축(capture)에서 끊겨있다.

## Design Principles

### Principle 1 — Engine is the only capture source of truth

`AGENTS.md` 의 "engine is the only backend truth" 원칙을 capture/ledger 라인까지 확장한다.

- App 라우트는 인증/Zod 검증 후 engine HTTP를 호출한다.
- App DB의 `terminal_pattern_captures` 는 UI view 또는 캐시로 격하한다.
- Engine 의 `CaptureStore` 가 single source of truth.

### Principle 2 — Four axes are one pipeline

Flywheel 4축은 시간 순서상 단일 파이프라인이다.

```
[1] CAPTURE         [2] OUTCOME           [3] VERDICT          [4] REFINEMENT
─────────           ──────────            ─────────            ────────────
Save Setup       →  N hours later      →  user judgment     →  promotion gate re-eval
                    auto-resolve
─────────           ──────────            ─────────            ────────────
LEDGER:capture     LEDGER:outcome       LEDGER:verdict       LEDGER:training_run
                                                              LEDGER:model
```

각 축은 독립 모듈이 아니라 같은 PatternLedger 위의 record_type 차이로 구현된다.

### Principle 3 — Cold-start lane is part of the product

라벨이 없으면 flywheel은 돌지 않는다. 외부 유저 0명에서 출발하므로 founder bulk-import lane을 제품의 일부로 둔다.

### Principle 4 — Public reproducible reports as distribution

매 refinement run 후 reject 포함한 결과를 공개 URL로 발행한다. 이것이 외부 신뢰 + 콘텐츠 채널 + 라벨러 유입의 단일 경로다.

## Architecture

### Capture flow (axis 1)

```
[App Save Setup UI]
      ↓ POST /api/terminal/pattern-captures
[App route]                  authn + zod validation only
      ↓ HTTP POST {ENGINE_URL}/captures
[Engine /captures]           transition validation + persistence
      ↓
[CaptureStore]               canonical record
[LEDGER_RECORD_STORE]        append capture record
[PatternStateStore]          link transition_id
      ↑ read
[App GET]                    UI view query
```

호환성 정책:

- Phase 1: app DB 테이블 유지하면서 engine sync 추가 (이중 쓰기)
- Phase 2: app 테이블을 engine 의 read view 로 전환
- Phase 3: app 테이블 제거, engine 만 canonical

### Outcome resolver (axis 2 — 신규)

```
engine/scanner/jobs/outcome_resolver.py
─────────────────────────────────────
매시간 실행:
1. CaptureStore.list(status='pending_outcome', captured_at + window_hours <= now)
2. 각 capture에 대해:
   a. entry_price 부터 evaluation_window_hours 동안 OHLCV 로드
   b. peak_price, exit_price, max_gain_pct, exit_return_pct 계산
   c. breakout_above_high 또는 invalidation 조건 평가
   d. PatternOutcome 생성
3. LEDGER_RECORD_STORE.append_outcome_record(outcome)
4. CaptureStore.update_status(capture_id, 'outcome_ready')
```

판정 규칙은 별도 정책 모듈로 분리:

- `engine/patterns/outcome_policy.py` (신규)
- 패턴별로 다른 success/failure 임계 정의
- W-0086 의 `entry_profitable_at_N` 메트릭이 이 정책의 첫 구현

### Verdict capture (axis 3)

```
[Dashboard UI]                pending verdict inbox
      ↓ user clicks valid|invalid|late|noisy
[App route]                   POST /api/dashboard/verdict
      ↓ HTTP POST {ENGINE_URL}/verdict
[Engine /verdict]             update PatternOutcome.user_verdict
      ↓
[LEDGER_RECORD_STORE]         append verdict record
[CaptureStore]                update_status(capture_id, 'verdict_ready')
```

UI 요구사항:

- /dashboard 에 outcome inbox 패널
- 각 row 에 4-button + optional free text
- verdict 후 동일 capture 재 surfacing 금지

### Refinement trigger (axis 4 — 신규)

```
engine/scanner/jobs/refinement_trigger.py
──────────────────────────────────────────
매일 1회 실행:
for each pattern_slug:
  verdict_count = LEDGER.count(record_type='verdict', pattern_slug, since=last_refinement_at)
  days_since = days(now - last_refinement_at)
  if verdict_count >= MIN_VERDICTS AND days_since >= MIN_DAYS:
    run pattern_refinement(pattern_slug, include_new_verdicts=True)
    LEDGER.append_training_run(...)
    if promotion_gate(report) passes:
      LEDGER.append_model(...)
      ModelRegistry.set_active(pattern_slug, new_model_key)
```

기본 임계 (조정 가능):

- `MIN_VERDICTS = 10`
- `MIN_DAYS = 7`
- `promotion_gate` 는 기존 `engine/research/promotion_report.py` 재사용

### Cold-start: bulk import (신규)

```
POST /captures/bulk_import
Content-Type: multipart/form-data

file: CSV with columns
  symbol, timeframe, captured_at, phase, user_note,
  optional: entry_price, evaluation_window_hours, hypothetical_outcome

각 row → CaptureRecord (capture_kind='manual_hypothesis')
candidate_transition_id 없이 허용
outcome_resolver 가 동일 파이프라인으로 처리
```

운영:

- `engine/scripts/import_founder_setups.py` CLI 제공
- 창업자가 기존 매매 노트/스크린샷 메타데이터를 CSV 로 정리
- 목표: 출시 전 500 capture 시드

### Public report publishing (신규)

매 refinement run 완료 시 자동 생성:

```
research/runs/<pattern_slug>/<run_id>/
  report.md              human-readable summary
  entries.json           모든 outcome (성공+실패)
  rejected_variants.json refinement에서 reject된 변형들
  promotion_decision.json gate 통과/탈락 사유
  rerun.sh               명령 1줄로 재현
```

이 디렉토리를 GitHub Pages 또는 정적 호스팅에 mirror하여 공개 URL 부여.

### Observability: flywheel health (신규)

```python
GET /observability/flywheel/health

{
  "captures_per_day_7d": int,
  "captures_to_outcome_rate": float,    # axis 1→2 closure
  "outcomes_to_verdict_rate": float,    # axis 2→3 closure
  "verdicts_to_refinement_count_7d": int,  # axis 3→4 closure
  "active_models_per_pattern": dict[str, int],
  "promotion_gate_pass_rate_30d": float
}
```

이 6개 숫자가 사업 KPI. MRR 보다 먼저 봐야 할 지표.

## Contract Boundaries

| Layer | Responsibility | Owner |
|---|---|---|
| `app/src/routes/api/terminal/pattern-captures` | authn + zod validation + engine HTTP proxy | app |
| `app/src/routes/api/dashboard/verdict` | authn + zod validation + engine HTTP proxy | app |
| `app/src/lib/contracts/terminalPersistence.ts` | request/response shapes | contract |
| `engine/api/routes/captures.py` | canonical capture POST/GET | engine |
| `engine/api/routes/verdict.py` | canonical verdict POST | engine |
| `engine/capture/store.py` | persistence | engine |
| `engine/ledger/store.py` | append-only ledger | engine |
| `engine/scanner/jobs/outcome_resolver.py` | scheduled outcome closure | engine |
| `engine/scanner/jobs/refinement_trigger.py` | scheduled refinement | engine |
| `engine/patterns/outcome_policy.py` | success/failure decision rules | engine |

## Actual Execution Order

CTO priority pivot: Phase E (cold-start data + observability) was shipped BEFORE Phase C/D.
Rationale: axes 1-2 닫혔지만 트래픽=0. Phase C/D는 데이터 없이 cargo cult.

실제 순서: A → B → E → C → D → Refactor

### Key implementation files

| Component | File | Job/Route |
|-----------|------|-----------|
| Capture ingest | `engine/api/routes/captures.py` | `POST /captures`, `POST /captures/bulk_import` |
| Outcome policy | `engine/patterns/outcome_policy.py` | `decide_outcome()`, `policy_for()` |
| Outcome resolver | `engine/scanner/jobs/outcome_resolver.py` | Job 3b, 3600s |
| Verdict labeling | `engine/api/routes/captures.py` | `POST /captures/{id}/verdict` |
| Refinement trigger | `engine/scanner/jobs/refinement_trigger.py` | Job 3c, 86400s |
| Observability | `engine/api/routes/observability.py` | `GET /observability/flywheel/health` |
| Capture store | `engine/capture/store.py` | `count_by_status()`, `update_status()`, `list_due_for_outcome()` |

## Execution Roadmap (original, for reference)

### Phase A — Capture wiring (P0, ~3 weeks)

목표: app Save Setup 이 engine ledger 에 도달하도록.

1. `app/src/lib/server/terminalPersistence.createPatternCapture` → engine HTTP 호출 교체
2. `app/src/lib/server/terminalPersistence.listPatternCaptures` → engine GET 호출 교체
3. App DB 의 `terminal_pattern_captures` 를 engine sync view 로 전환
4. E2E 테스트: Save Setup → engine `LEDGER:capture` row appended 검증

이 단계가 끝나면 flywheel 1축이 닫힘.

### Phase B — Outcome resolver (P0, ~2 weeks)

목표: capture 가 자동으로 outcome 으로 닫히도록.

1. `outcome_policy.py` 작성 (`entry_profitable_at_N` 첫 구현)
2. `outcome_resolver.py` 스케줄러 잡 작성
3. Cron 또는 worker 등록
4. E2E 테스트: pending capture → N시간 후 outcome record 생성 검증

이 단계가 끝나면 flywheel 1-2축이 닫힘.

### Phase C — Verdict + dashboard (P1, ~3 weeks)

목표: outcome 이 user verdict 로 닫히도록.

1. `/dashboard` 에 outcome inbox UI
2. POST `/verdict` route (app + engine)
3. Verdict 후 capture status 업데이트

이 단계가 끝나면 flywheel 1-2-3축이 닫힘.

### Phase D — Refinement trigger (P1, ~2 weeks)

목표: 일정 verdict 누적 시 자동 promotion gate 재평가.

1. `refinement_trigger.py` 스케줄러 잡 작성
2. Promotion gate 결과를 model registry 에 자동 반영
3. E2E 테스트: 10 verdict 누적 → refinement run + promotion decision 기록

이 단계가 끝나면 flywheel 4축이 모두 닫힘.

### Phase E — Cold-start + observability (P2, ~3 weeks)

1. `/captures/bulk_import` route + `import_founder_setups.py` CLI
2. `flywheel/health` observability route
3. Public report auto-publishing

## Mapping to Existing Work Items

| Phase | Existing work item | Action |
|---|---|---|
| A | W-0036 terminal-persistence-first-rollout | extend with engine wiring |
| A | W-0064 save-setup-capture-route-stabilization | re-scope to engine proxy |
| A | W-0042 terminal-app-domain-persistence | re-scope to view-only |
| B | W-0040 pattern-ledger-record-family | extend with outcome resolver |
| B | (new) | outcome_policy.py |
| C | (new W-0088 follow-up) | dashboard verdict UI |
| D | W-0048 refinement-policy-and-reporting | implement refinement_trigger |
| D | W-0044 pattern-model-promotion-gate | wire to refinement output |
| E | W-0047 research-run-state-plane | extend with public publish |
| E | W-0017 engine-snapshot-contract | extend with flywheel/health |

## Decisions

- Engine is the only capture source of truth.
- Capture store split is the single root cause of flywheel non-closure.
- Outcome resolver is a scheduler job, not an event-driven webhook (simpler, idempotent).
- Refinement trigger is time + verdict-count gated, not pure threshold (avoids thrashing).
- Founder bulk import is a first-class product surface, not a one-off script.
- Public reproducible reports are the primary distribution channel.

## Non-Goals

- 기존 `terminal_pattern_captures` 테이블 즉시 제거 (Phase A는 dual-write 만)
- 새로운 pattern slug 추가 (현재 `tradoor-oi-reversal-v1` 만 사용)
- Mobile UX, RAG, Cogochi personality 확장 (flywheel 닫힐 때까지 동결)
- LLM chart interpretation layer (Layer 3) 구현
- Pricing / monetization wiring

## Success Criteria

이 설계는 다음 6개 숫자가 모두 양수가 될 때 완성된다.

1. `captures_per_day_7d > 0`
2. `captures_to_outcome_rate > 0.9`
3. `outcomes_to_verdict_rate > 0.5`
4. `verdicts_to_refinement_count_7d > 0`
5. `active_models_per_pattern[tradoor-oi-reversal-v1] >= 1`
6. `promotion_gate_pass_rate_30d > 0`
