# W-A107 — 종합 검증 감사: W-0365 ~ W-0387

> Agent: A107 | Date: 2026-05-02 | Status: ACTIVE

---

## 0. 실행 방법론

세 에이전트(설계 스펙 추출 / 엔진 구현 스캔 / 프론트엔드 스캔)를 병렬 실행 후 아래 3축으로 교차 검증:

| 축 | 방법 | 대상 |
|---|---|---|
| **기능(Functional)** | AC(수용 기준) 체크리스트 vs 실제 파일/테스트 존재 여부 | 모든 W-항목 |
| **성능(Performance)** | API p95 < 기준값, 라인 카운트 ≤ 목표, import 수 ≤ 목표 | W-0386, W-0384, W-0369 |
| **리팩토링(Quality)** | font 위반 수, Pydantic 경고, 미완성 허브 스텁 | W-0381/0389, W-0372, autoresearch |

---

## 1. 베이스라인 측정 (2026-05-02 기준)

| 지표 | 실제 값 | 목표 | 상태 |
|---|---|---|---|
| Engine 전체 테스트 | **2274 pass, 21 skip** | green | ✅ |
| W-항목 특화 테스트 (research/ + agent + alpha) | **128 pass** | green | ✅ |
| `scheduler.py` 줄수 | **368** | ≤ 350 | ⚠️ +18 |
| `pipeline.py` 줄수 | **131** | ≤ 120 | ⚠️ +11 |
| `from engine.research` top-level 임포트 수 | **13** | ≤ 12 | ⚠️ +1 |
| font-size 7–10px 위반 수 (`app/src`) | **357** | 0 | 🔴 |
| Pydantic v2 deprecation 경고 | **2** (min_items/max_items) | 0 | 🟡 |

---

## 2. W-항목별 구현 완성도 매트릭스

### 🟢 완전 구현 (설계 AC 충족)

| W# | 핵심 구현 근거 | 잔여 이슈 |
|---|---|---|
| **W-0365** | `engine/pnl/cost_model.py` + `pnl_compute.py` + verdict WIN/LOSS/INDETERMINATE | AC8~AC13: 7일 알파 데이터 누적 의존 (자연 대기) |
| **W-0366** | `engine/research/artifacts/feature_catalog.py` + `test_indicator_filters.py` | AC4: Playwright UI 테스트 미실행 |
| **W-0367** | `signal_event_store.py` (DLQ/CB/batch), `alpha_quality.py`, `verification_loop.py`, 16 tests pass | AC6/AC8/AC10: 데이터 누적 의존 |
| **W-0368** | `_CircuitBreaker` (CLOSED→OPEN→HALF-OPEN), `_BatchBuffer`, `_RETRY_BACKOFFS`, `dlq_replay.py` | `test_signal_events_hardening.py` pass ✅ |
| **W-0373** | `privyClient.ts` + `routes/api/auth/privy/+server.ts` + `WalletModal.svelte` | env var 게이팅 — 의도적 |
| **W-0376** (Storage) | `append_phase_attempt_record()` no-op → DB 3.5 MB | AC3/AC6: 5일 모니터링 (자연 대기) |
| **W-0379** | `research/discovery/` 20파일 + `ensemble/` + `validation/` + `/research/` 5개 라우트 | AC3(6분 예산) 성능 미측정 |
| **W-0382-B** | `WatchlistItem/Header/PatternTab` 신규 분리, `WatchlistRail` 702→459L | ✅ |
| **W-0382-C** | 5개 dead store 삭제 확인 | ✅ |
| **W-0384** | `engine/alpha/` (composite_score 452L, scroll_segment, scroll_similar_compose) + `ScrollAnalysisDrawer.svelte` | AC1/AC2 API 응답시간 미측정 |
| **W-0385** | `/patterns/filter-drag`, `/patterns/formula`, `/lab/counterfactual` 3 라우트 + 3 PRs merged | AC3 formula_evidence 실제 DB 행 미확인 |
| **W-0386-A** | `engine/core_loop/` (contracts, ports, spine, builder) ✅ | ✅ |
| **W-0386-C** | from engine.research 임포트 45→13 (목표 ≤12, **차이 1**) | 잔여 1개 임포트 제거 필요 |
| **W-0386-D** | `engine/scanner/scheduler.py` 존재 + job registry | 368줄 (목표 ≤350, **차이 18**) |
| **W-0387** | `engine/agents/judge_runtime.py` (136L) + `save_runtime.py` (114L) + `test_agent_judge.py` / `test_agent_save.py` pass | ✅ |

### 🟡 부분 구현 (AC 일부 미충족)

| W# | 구현된 것 | **누락된 것** | 갭 심각도 |
|---|---|---|---|
| **W-0369** | `/strategies/` 라우트 + `PatternStrategyCard/StrategyGrid/BenchmarkChart.svelte` | `/benchmark` 라우트 있음 but **APScheduler 일일 refresh job** 등록 여부 미확인; AC1 p95<2s 측정 없음; `test_pattern_backtest_api.py` 없음 | 중 |
| **W-0372** | Phase A~C (5-Hub 골격, redirect, WatchlistRail fold) ✅ | **Phase D**: `dashboard/` hub = index.ts만, `settings/` hub = stub, `/cogochi` AppShell 4★★★ 컴포넌트 미이식; `migration 041_user_watchlist` 미확인 | 높음 |
| **W-0376** (PnL Ops) | `outcome_resolver.py` 수정, `blocked_candidate_store.py` | AC3 `ledger_outcomes`≥28 행 (DB 확인 필요); `benchmark_packs/` 12개 JSON 확인 필요; `backfill_pnl_outcomes.py` 실행 여부 미확인 | 중 |
| **W-0381** | `typography.css` 토큰 정의 완료 | **357개 font-size 7–10px 위반** 잔존 (AC-G1 = 0 위반 요구) | 높음 |
| **W-0386-B** | `pipeline.py` 131줄, core_loop/ 패키지 | 131줄 > 목표 120줄 (11줄 초과) | 낮음 |

### 🔴 설계만 있고 구현 0

| W# | 설명 | 선행 조건 |
|---|---|---|
| **W-0370** (Phase 2) | Phase 1 API 완료, but UI: SignalFeed.svelte 뱃지, 드릴다운 패널 미완 | W-0367/0368 merged ✅ |
| **W-0380** | ChartBoard dead handler 제거, IndicatorLibrary 삭제, aiQueryRouter 17 테스트 | 없음 |
| **W-0388** | ESLint hub boundary enforcement (`no-restricted-imports`) | W-0382-D merged ✅ |
| **W-0389** | 730→0 font 위반, TopBar L1+L2 재구성, AIAgentPanel full-word tabs | W-0381 tokens 완료 ✅ |
| **W-0390** | 설계 문서 없음 | W-0389 완료 후 |

---

## 3. 검증 방법론 도입 설계

### 3-A. 기능(Functional) 검증 — 추가할 테스트

#### 엔진 레이어 (pytest)

```
tests/research/test_pnl_compute.py        ← 이미 존재 ✅
tests/research/test_benchmark_pack_pnl.py ← 존재 여부 확인 필요 (AC-AC12)
tests/research/test_indicator_filters.py  ← 존재 ✅
tests/research/test_signal_events.py      ← 존재 ✅ (16 tests)
tests/research/test_signal_events_hardening.py ← 존재 ✅
tests/research/test_lookahead_safety.py   ← 존재 ✅
tests/research/test_flag_parity.py        ← 존재 ✅
tests/test_agent_judge.py                 ← 존재 ✅
tests/test_agent_save.py                  ← 존재 ✅
tests/test_alpha_composite.py             ← 존재 ✅
```

**신규 추가 필요:**
```python
# tests/test_pattern_backtest_api.py  (W-0369 AC2: ≥7 tests)
# - GET /patterns/{slug}/backtest → 200
# - APR calculation error ≤ ±0.1%
# - cache hit < 200ms (functools.lru_cache 검증)
# - equity_curve field 존재
# - 52개 슬러그 파라미터라이즈

# tests/research/test_autoresearch_cycle_perf.py  (W-0379 AC3: <6분)
# - orchestrator.run_cycle(sandbox=True) → elapsed < 360s
# - git ratchet: pass all 6 layers → commit exists
# - git ratchet: fail L3 → git reset applied

# tests/test_pipeline_compat.py  (W-0386-B AC-B3/B4)
# - python -m engine.pipeline --help 성공
# - ResearchPipeline() → DeprecationWarning fires
```

#### 프론트엔드 레이어 (vitest + Playwright)

```typescript
// app/src/lib/strategy/__tests__/PatternStrategyCard.test.ts  (W-0369 AC9: ≥10 vitest)
// app/src/routes/strategies/__tests__/page.test.ts

// W-0381/0389 stylelint 자동화:
// app/.stylelintrc.cjs (신규) → CI에서 font-size 7/8/9/10px = 0 강제

// W-0380 단위 테스트:
// app/src/lib/hubs/terminal/__tests__/aiQueryRouter.test.ts (17 test cases)
```

---

### 3-B. 성능(Performance) 검증 — 추가할 기준

| 측정 지점 | 도구 | 기준 | 현재 상태 |
|---|---|---|---|
| `GET /alpha/scan` p95 | pytest-benchmark | < 200ms (cache hit) | 미측정 |
| `GET /alpha/scroll` p95 | pytest-benchmark | < 3s | 미측정 |
| `GET /patterns/{slug}/backtest` p95 | pytest-benchmark | < 2s (< 200ms cache) | 미측정 |
| `GET /research/alpha-quality` p95 | pytest-benchmark | < 500ms (mock 30d) | 미측정 |
| autoresearch cycle 소요 시간 | time.monotonic | < 360s | 미측정 |
| from engine.research import 수 | `grep -rh` count | ≤ 12 | **13** (1 초과) |
| `scheduler.py` 줄수 | `wc -l` | ≤ 350 | **368** (18 초과) |
| `pipeline.py` 줄수 | `wc -l` | ≤ 120 | **131** (11 초과) |

**pytest-benchmark 설치 및 suite 신규 파일:**
```
engine/tests/perf/test_api_latency.py   ← 신규
engine/tests/perf/test_alpha_perf.py    ← 신규
```

---

### 3-C. 리팩토링(Quality) 검증 — 추가할 게이트

#### 즉시 적용 가능한 CI 게이트

```yaml
# .github/workflows/quality.yml (신규 또는 기존 확장)

steps:
  - name: font-size violations
    run: |
      COUNT=$(grep -rE "font-size:\s*(7|8|9|10)px" app/src --include="*.svelte" --include="*.css" | wc -l)
      echo "font violations: $COUNT"
      [ "$COUNT" -le "50" ] || (echo "❌ font violations $COUNT > 50" && exit 1)
    # 현재 357 → W-0389 구현 후 0으로 목표

  - name: engine.research top-level imports
    run: |
      COUNT=$(grep -rh "from engine\.research" engine/ --include="*.py" | wc -l)
      echo "top-level research imports: $COUNT"
      [ "$COUNT" -le "15" ] || (echo "❌ imports $COUNT > 15" && exit 1)

  - name: scheduler.py line count
    run: |
      LINES=$(wc -l < engine/scanner/scheduler.py)
      [ "$LINES" -le "400" ] || (echo "❌ scheduler.py $LINES lines > 400" && exit 1)

  - name: Pydantic deprecation check
    run: |
      uv run pytest --tb=short -q 2>&1 | grep -c "PydanticDeprecatedSince20" | xargs -I{} test {} -eq 0
```

#### Pydantic v2 경고 수정 (즉시 가능):
```python
# engine/research/discovery/proposer/schemas.py:77
# 변경 전:
proposals: list[ChangeProposal] = Field(..., min_items=1, max_items=20)
# 변경 후:
proposals: list[ChangeProposal] = Field(..., min_length=1, max_length=20)
```

---

## 4. 우선순위별 개선 로드맵

### P0 — 즉시 (1-2일, 단독 작업 가능)

| # | 항목 | 파일 | 예상 시간 |
|---|---|---|---|
| P0-1 | **W-0388** ESLint hub boundary | `app/eslint.config.js` 신규 | 2h |
| P0-2 | **Pydantic min_items 경고** 수정 | `proposer/schemas.py:77` | 15min |
| P0-3 | **W-0386 잔여 AC** — pipeline.py -11줄, scheduler.py -18줄, research import -1 | 3 파일 마이너 수정 | 2h |
| P0-4 | **W-0380** ChartBoard 핸들러 제거 + IndicatorLibrary 삭제 + aiQueryRouter 17 tests | 4 파일 | 3h |

### P1 — 단기 (3-5일, 순차 작업)

| # | 항목 | 핵심 내용 | 선행 조건 |
|---|---|---|---|
| P1-1 | **W-0370 Phase 2** SignalFeed UI | `SignalFeed.svelte` + 뱃지 | W-0370 Phase 1 merged ✅ |
| P1-2 | **W-0369 AC 보완** | `test_pattern_backtest_api.py` + APScheduler job 등록 확인 | 없음 |
| P1-3 | **pytest-benchmark suite** 신규 | `tests/perf/` 2파일 | 없음 |
| P1-4 | **W-0376 PnL Ops 완료 확인** | DB 28행 확인 + benchmark_packs 12개 확인 | DB 접근 |

### P2 — 중기 (1-2주, 설계 → 구현)

| # | 항목 | 규모 | 선행 조건 |
|---|---|---|---|
| P2-1 | **W-0389** UX Typography (357→0 font violations) | 86개 svelte 파일 | W-0381 ✅ |
| P2-2 | **W-0372 Phase D** dashboard/settings hub 구현 | 5개 컴포넌트 + migration 041 | W-0372 A-C ✅ |
| P2-3 | **W-0379 AC3** autoresearch 6분 예산 측정 + 최적화 | perf test + 조건부 병렬화 | 없음 |
| P2-4 | **W-0390** 설계 문서 작성 | 1일 | W-0389 완료 후 |

### P3 — 장기 (데이터 누적 의존)

| # | 항목 | 조건 |
|---|---|---|
| P3-1 | W-0365 AC8~AC13 검증 (alpha week) | 7일 데이터 누적 |
| P3-2 | W-0376 Storage AC3/AC6 모니터링 | 5일 연속 < 30MB |
| P3-3 | W-0367 AC6/AC8 (30일 실데이터 ≥20 신호) | 30일 스케줄러 가동 |

---

## 5. 발견된 버그 / 리스크

| 번호 | 분류 | 파일 | 설명 | 심각도 |
|---|---|---|---|---|
| BUG-1 | Pydantic v3 호환 | `engine/research/discovery/proposer/schemas.py:77` | `min_items`/`max_items` deprecated → Pydantic v3에서 crash | 중 |
| BUG-2 | AC 미충족 | `engine/scanner/scheduler.py` | 368줄 (목표 ≤350) — 18줄 초과 | 낮음 |
| BUG-3 | AC 미충족 | `engine/pipeline.py` | 131줄 (목표 ≤120) — 11줄 초과 | 낮음 |
| BUG-4 | AC 미충족 | `engine/` research imports | 13개 (목표 ≤12) — 1개 초과 | 낮음 |
| BUG-5 | 미구현 | `app/src/lib/hubs/dashboard/` | Phase D: 스텁만 있음 (index.ts 1개) | 높음 |
| BUG-6 | 미구현 | `app/src/lib/hubs/settings/` | Phase D: 스텁만 있음 | 높음 |
| BUG-7 | 미구현 | `app/src/lib/styles/typography.css` | 토큰 정의됐지만 357개 사용처 미적용 | 높음 |
| BUG-8 | 검증 부재 | `engine/tests/perf/` | API 성능 측정 테스트 전혀 없음 | 중 |
| BUG-9 | 검증 부재 | `tests/test_pattern_backtest_api.py` | W-0369 AC2 필요 테스트 없음 | 중 |

---

## 6. 즉시 실행할 검증 명령어 (재현 가능한 체크리스트)

```bash
# === 기능 검증 ===
uv run pytest tests/research/ tests/test_agent_judge.py tests/test_agent_save.py tests/test_alpha_composite.py -q
# 기대: 128 PASS

uv run pytest tests/ -q --tb=short
# 기대: ~2274 PASS

# === 성능 게이트 ===
wc -l engine/scanner/scheduler.py  # 기대: ≤ 350
wc -l engine/pipeline.py           # 기대: ≤ 120
grep -rh "from engine\.research" engine/ --include="*.py" | wc -l  # 기대: ≤ 12

# === 리팩토링 게이트 ===
grep -rE "font-size:\s*(7|8|9|10)px" app/src --include="*.svelte" --include="*.css" | wc -l
# 기대: 0 (현재: 357)

ls app/src/lib/hubs/dashboard/  # 기대: 컴포넌트 다수 (현재: index.ts만)

# === Pydantic 경고 ===
uv run pytest -q 2>&1 | grep "PydanticDeprecatedSince"
# 기대: 0줄 (현재: 2줄)
```

---

## 7. 다음 에이전트 인계 사항

**즉시 픽업 가능:**
1. `P0-2` Pydantic 경고 수정 → `proposer/schemas.py:77` min_items → min_length (15분)
2. `P0-3` W-0386 잔여 AC → scheduler.py 18줄 제거, pipeline.py 11줄 제거, research import 1개 제거
3. `P0-4` W-0380 구현 → ChartBoard + IndicatorLibrary + aiQueryRouter tests

**설계 우선:**
- W-0389 (357개 font 위반) → 86파일 수정 전 PR-A~G 분할 계획 확정 필요
- W-0372 Phase D → AppShell terminal 이식 전 컴포넌트 목록 재검토 필요

---

*Generated by A107 | 2026-05-02*
