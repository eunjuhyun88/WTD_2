# W — Data Engine 정본 설계 (Canonical Master)

**Status:** ACTIVE · 정본 (이 문서가 모든 데이터 관련 설계의 single source of truth)
**Date:** 2026-04-26
**Replaces fragmentation across:** `06_DATA_CONTRACTS.md`, `10_COMPLETE_DATA_ARCHITECTURE.md`, `11_CTO_DATA_ARCHITECTURE_REALITY.md`, `engine-pipeline.md`, `feature-implementation-map.md`, `autoresearch-ml.md`, `ENGINE_SPEC.md`, `W-autoresearch-integration-design-20260426.md`, `GITHUB_REPO_ANALYSIS_FULL.md`

---

## 0. 한 줄 결론

Cogochi 데이터 엔진 = **L0 raw market** → **L1 features** → **L2 pattern state machine** → **L3 ledger (entry/outcome/verdict)** → **L4 stats engine** → **L5 wiki + search** → **L6 user surface** → **L7 AutoResearch (Phase D)**.
지금 살릴 파이프 = scanner→capture→inbox→verdict→F-60 gate. 나머지는 Phase D AutoResearch 도입 전 baseline 만들기 위한 사전 작업.

---

## 1. Big Picture — Write Path × Read Path

```
WRITE PATH                                                      READ PATH
───────────────────────────────────────────────                  ────────────────────────────
[L0] Binance/Bybit/OKX/Coinalyze → raw_market_bars             chart        ← feature_windows
     OI/Funding/Liq/CVD          → raw_perp_metrics            HUD          ← pattern_runtime_states
     On-chain/News/Smart-money   → raw_*_metrics               search       ← search_corpus (3-layer)
                  ↓                                             inbox        ← ledger_entries+outcomes
[L1] feature_calc                → feature_windows (92 cols)   wiki         ← wiki_pages
                  ↓                                             stats        ← pattern_stats_cache
[L2] state_machine               → pattern_runtime_states      copy trade   ← copy_trade_signals
                                 → phase_transition_events     notifications← notification_queue
                  ↓
[L3] _on_entry_signal            → ledger_entries (PatternOutcome)
                                 → capture_records          ★FIX 2026-04-26
     72h auto                    → ledger_outcomes
     user click                  → ledger_verdicts (6-cat)   ★R-01
                  ↓
[L4] stats_engine (5min cron)    → pattern_stats_cache (matview)
                                 → user_pattern_stats (matview)
                  ↓
[L5] wiki_ingest_agent (event)   → wiki_pages.body_md (LLM)
     stats_engine                → wiki_pages.frontmatter (수치)
     search                      → search_corpus_signatures + similar.py 3-layer
                  ↓
[L6] User surfaces (terminal/dashboard/wiki/copy-trade/notifications)
                  ↓
[L7] (Phase D) AutoResearch loop: PatternObject.evolution_chain ★R-02
                                 → variants → multi-period gate ★R-05
                                 → from-scratch agent escape (Ryan Li 패턴)
```

---

## 2. Layer 모델 (L0~L7)

| Layer | 역할 | Owner | Storage | 상태 |
|---|---|---|---|---|
| **L0** Raw Market | 27 fetcher, 12 scheduler job (klines/OI/funding/liq/CVD/macro/onchain/social/DEX/smart-money) | `engine/data_cache/`, `engine/scanner/scheduler.py` | CSV + SQLite raw_store + Redis L1 | ✅ BUILT |
| **L1** Features | 92-dim feature_windows (symbol × TF × bar) | `engine/scanner/feature_calc.py`, `engine/features/materialization_store.py` | `feature_materialization.sqlite` + Supabase mirror | ✅ BUILT (W-0145 138K rows) |
| **L2** Pattern Engine | PatternObject phase 시퀀스, building blocks 평가, state machine | `engine/patterns/`, `engine/scoring/block_evaluator.py` | `pattern_runtime_states` SQLite+Supabase dual-write, `phase_transition_events` | ✅ BUILT (52 patterns, 29 blocks) |
| **L3** Ledger | entry → score → outcome → verdict (4-table append-only) | `engine/ledger/`, `engine/capture/` | `ledger_data/*.json` (DEPRECATED → Supabase 이전 中) + `pattern_capture.sqlite` + Supabase | 🔄 PARTIAL (capture pipeline 방금 픽스) |
| **L4** Stats | materialized view, decay detection, F-60 gate | `engine/stats/engine.py` | `pattern_stats_cache`, `user_pattern_stats` (Supabase matview) | ✅ BUILT (gate는 R-05 NOT BUILT) |
| **L5a** Wiki | DB가 canonical, markdown은 export only | `engine/wiki/` (NOT BUILT) | `wiki_pages`, `wiki_links`, `wiki_change_log` (Supabase) | ❌ NOT BUILT (Phase 1) |
| **L5b** Search | 3-layer parallel blend (A/B/C) | `engine/search/similar.py`, `engine/research/similarity_ranker.py`, `engine/scoring/lightgbm_engine.py` | `search_corpus.sqlite`, `similar_runs.sqlite`, `quality_ledger` | ✅ BUILT (Layer C는 PARTIAL — 미훈련 시 fallback) |
| **L6** User | terminal · dashboard · lab · wiki · copy-trade | `app/src/routes/*` | (read-only against L0~L5) | 🔄 PARTIAL (1-click Watch, 5-cat verdict UI 미완) |
| **L7** AutoResearch | PatternObject.evolution_chain → variants → multi-period gate → from-scratch escape | `engine/autoresearch/` (NOT BUILT) | `iters.tsv` (Barnadrot 포맷) | ❌ Phase D (12주 후) |

---

## 3. Storage Map — "어떤 DB가 진실인지"

```
┌─ Supabase (Postgres) — durable, multi-process truth ──────────────────────┐
│  pattern_objects ★ definition_id (UUID PK)                                │
│  ledger_entries / ledger_scores / ledger_outcomes / ledger_verdicts        │
│  ledger_negatives                                                          │
│  capture_records ★ Cloud Run 재시작 안전                                   │
│  pattern_stats_cache (matview, 5min refresh)                               │
│  user_pattern_stats (matview)                                              │
│  pattern_runtime_states (dual-write hot copy은 SQLite)                     │
│  phase_transition_events                                                   │
│  user_indicator_preferences                                                │
│  notification_queue / judge_advice                                         │
│  wiki_pages / wiki_links / wiki_change_log    ← Phase 1 신규               │
│  episodic_sessions (30d TTL) / agent_trace_log                            │
│  signal_vocabulary (ko_aliases 포함)                                       │
│  copy_trade_subscriptions / signals / actions  ← Phase 3                   │
│  reranker_models / reranker_scoring_log / reranker_eval_log  ← W-0148 이후 │
│  news_chunks (pgvector) / capture_news_overlap  ← Phase 3                  │
│  raw_options_metrics / signal_events           ← Phase 2-3                 │
└────────────────────────────────────────────────────────────────────────────┘

┌─ SQLite (per-process, 빠르지만 ephemeral) ────────────────────────────────┐
│  feature_materialization.sqlite                                            │
│    └─ raw_market_bar / raw_perp_metrics / raw_orderflow_metrics            │
│    └─ feature_windows / pattern_events / search_corpus_signatures          │
│  search_corpus.sqlite                                                      │
│  similar_runs.sqlite                                                       │
│  runtime_state.sqlite (workspace pins, ephemeral)                          │
│  pattern_capture.sqlite ★ 방금 scanner→capture 파이프 연결                 │
│  pattern_state.sqlite (dual-write hot copy)                                │
└────────────────────────────────────────────────────────────────────────────┘

┌─ Cache (optional, 가속) ────────────────────────────────────────────────────┐
│  Redis L1 (kline 5min prefetch)                                            │
│  CSV files (raw fetcher output, gitignored)                                │
└────────────────────────────────────────────────────────────────────────────┘

┌─ DEPRECATED (제거 대상) ───────────────────────────────────────────────────┐
│  engine/ledger_data/{slug}/*.json  → Supabase ledger_entries 이전 후 제거  │
│  engine/ledger_records/{slug}/*.json (synthetic test data 702 rows)        │
└────────────────────────────────────────────────────────────────────────────┘
```

**규칙**:
- "Engine is source of truth" — App-web은 재해석 금지, 타입 assertion + UI reshape만.
- Supabase ↔ SQLite dual-write는 hot/cold 패턴 (state_store.py 패턴 따름).
- 모든 persisted/wire 객체에 `schema_version: int` 필수.

---

## 4. 핵심 객체 스키마 (요약)

### 4.1 PatternObject (R-02 evolution lineage 추가)

```python
@dataclass
class PatternObject:
    slug: str                              # stable PK
    name: str
    description: str
    phases: list[PhaseCondition]
    entry_phase: str
    target_phase: str
    timeframe: str = "1h"
    universe_scope: str = "binance_dynamic"
    direction: Literal["long","short"] = "long"
    version: int = 1
    created_by: str = "system"
    # ★ R-02 (이번 세션 추가)
    parent_id: str | None = None
    evolution_chain: list[str] = field(default_factory=list)
    derivation_note: str | None = None
```

### 4.2 PatternOutcome (Ledger entry · ★ R-01 6-cat)

```python
@dataclass
class PatternOutcome:
    id: str = uuid4()[:8]
    pattern_slug, pattern_version, definition_id, definition_ref
    symbol: str
    user_id: str | None
    # Timeline: phase2_at, accumulation_at, breakout_at, invalidated_at
    # Prices: phase2_price, entry_price, peak_price, exit_price, invalidation_price
    outcome: Literal["success","failure","timeout","pending"] = "pending"
    btc_trend_at_entry: str = "unknown"
    # ★ R-01 (이번 세션 변경)
    user_verdict: Literal["valid","invalid","near_miss","too_early","too_late","missed"] | None = None
    user_note: str | None = None
    # Reproducibility
    feature_snapshot: dict | None
    entry_transition_id, entry_scan_id, entry_block_scores, entry_block_coverage
    # ML shadow
    entry_p_win, entry_ml_state, entry_model_key, entry_model_version
    entry_rollout_state, entry_threshold, entry_threshold_passed, entry_ml_error
```

### 4.3 CaptureRecord (★ scanner→capture 파이프 방금 픽스)

```python
@dataclass(frozen=True)
class CaptureRecord:
    capture_id: str = uuid4()
    capture_kind: "pattern_candidate" | "manual_hypothesis" | "chart_bookmark" | "post_trade_review"
    symbol, pattern_slug, pattern_version, definition_id, definition_ref
    phase, timeframe, captured_at_ms
    candidate_transition_id, scan_id            # ← scanner 추적용
    feature_snapshot: dict | None
    block_scores: dict
    outcome_id: str | None                      # ← ledger 연결
    status: "pending_outcome" | "outcome_ready" | "verdict_ready" | "closed"
```

### 4.4 6-cat Verdict 의미 (Ryan Li 16-seed validation 근거)

| verdict | 의미 | 시그널 → 어떤 파라미터 sweep |
|---|---|---|
| `valid` | 패턴 맞음 | (positive 라벨) |
| `invalid` | 패턴 아님 | required_blocks 추가/threshold 상향 |
| `near_miss` | 방향 맞고 타이밍 살짝 빗나감 | evaluation_window_hours 조정 |
| `too_early` | 패턴 맞는데 entry phase 기준 조기 진입 | phase_score_threshold 상향 |
| `too_late` | 패턴 이미 끝난 후 감지 | scanner scan_interval 단축 |
| `missed` | 패턴 발생했는데 감지 못 함 | required_blocks 재검토 |

→ **이 6개 라벨이 있어야 Phase D dead-end-confirmation table의 각 행이 나온다.**

---

## 5. API Surface (Route Ownership)

| Route | Ownership | Runtime | 상태 |
|---|---|---|---|
| `POST /api/patterns/parse` (AI Parser) | orchestrated | engine | ❌ A-03 NOT BUILT |
| `POST /api/patterns/draft-from-range` (Chart Drag) | orchestrated | engine | ❌ A-04 NOT BUILT |
| `POST /api/patterns/register` | engine-owned | engine | ✅ A-05 BUILT |
| `POST /api/patterns/{id}/approve` | engine-owned | engine | ✅ |
| `GET  /api/patterns/states` | proxy | engine | ✅ B-02 |
| `POST /api/patterns/{slug}/evaluate` | engine-owned | engine | ✅ B-01 |
| `POST /api/search/similar` (3-layer blend) | orchestrated | engine | ✅ C-01 |
| `POST /api/captures` / `GET /api/runtime/captures` | app-domain | app | ✅ E-01/02 |
| `POST /api/captures/{id}/watch` (1-click Watch) | engine-owned | engine | ❌ D-03 NOT BUILT (R-04) |
| `POST /api/captures/{id}/verdict` | app-domain | app | ✅ F-01 (3-cat) → ✅ R-01 6-cat type 변경, UI 미완 (F-02) |
| `GET  /api/captures?status=outcome_ready` (Verdict Inbox) | app-domain | app | ✅ F-03 |
| `GET  /api/users/{id}/f60-status` | engine-owned | engine | ❌ H-07 NOT BUILT (R-05) |
| `GET  /api/wiki/patterns/{id}` | engine-owned | engine | ❌ Phase 1 NOT BUILT |
| `GET  /api/notifications` | app-domain | app | ❌ Phase 1 NOT BUILT |

전체 routes는 [feature-implementation-map.md](docs/live/feature-implementation-map.md)에 BUILT/NOT BUILT 매트릭스로 있음.

---

## 6. Pipeline Flow (이벤트 시퀀스)

### 6.1 Live Pattern Monitoring (현재 동작)

```
1. APScheduler tier-1 (15min) → pattern_scan job
2. evaluate_symbol_for_patterns(symbol) per 300+ symbols (asyncio.gather)
3. PatternStateMachine.feed(blocks_triggered)
4. phase_transition 발생 시:
   ┌─ INSERT phase_transition_events (Supabase)
   ├─ UPDATE pattern_runtime_states (SQLite + Supabase)
   └─ if to_phase == entry_phase:
        _on_entry_signal(transition):
          ┌─ ENTRY SIGNAL log
          ├─ PatternOutcome 생성
          ├─ LEDGER_STORE.save(outcome) → ledger_data/*.json
          ├─ LEDGER_RECORD_STORE.append_entry_record + append_score_record
          └─ ★ CaptureRecord 생성 + _CAPTURE_STORE.save() → SQLite + Supabase  ←★FIX
5. 72h elapsed → outcome_resolver job → ledger_outcomes
6. User opens dashboard inbox → GET /captures?status=outcome_ready
7. User clicks 6-cat verdict → POST /captures/{id}/verdict
8. StatsEngine 5min cron → pattern_stats_cache.refresh()
9. F-60 gate evaluation: median(W1, W2, W3) ≥ 0.55 AND min ≥ 0.40 → "validated"
10. WikiIngestAgent (event) → wiki_pages.body_md 업데이트 (LLM)
11. StatsEngine → wiki_pages.frontmatter 업데이트 (수치, LLM 절대 금지)
```

### 6.2 New Pattern Registration (현재 + Phase D)

```
[현재]
1. POST /patterns/parse  (AI Parser, NOT BUILT) → PatternDraft
   OR POST /patterns/draft-from-range (Chart Drag, NOT BUILT) → PatternDraft
2. User reviews/edits → POST /patterns/candidates → PatternCandidate (pending)
3. Reviewer approves → POST /patterns/{id}/approve → PatternObject (version=1)
4. Backfill job → pattern_runtime_state populated
5. Scanner begins tracking

[Phase D 추가, R-02 hook]
1'. POST /patterns/parse {mode: "variant", parent_id: "oi_reversal_v1"}
    → derivation_note 자동 기록 → PatternObject(parent_id, evolution_chain) 등록
2'. iters.tsv append (iter, accuracy, delta, w1/w2/w3, status, params, description)
3'. backtest 실행 (verdict ledger eval set 기준)
4'. multi-period gate 통과 시 keep, 실패 시 discard (NEVER STOP loop)
```

### 6.3 Karpathy Loop 매핑 (Phase D)

```
LOOP FOREVER:
1. iters.tsv 읽기  ← Barnadrot template
2. 현재 best PatternObject 읽기
3. ONE targeted change (hypothesis 1개)
4. PatternObject variant 생성 (parent_id 설정)
5. git commit "iter N: <description>"
6. backtest 실행 (verdict ledger eval set)
7. multi-period accuracy 추출
8. improved → keep + iters.tsv append
9. not improved → discard + iters.tsv append
NEVER STOP
```

---

## 7. CTO 10 결정 (override priority)

이전 설계 문서(00-09)와 충돌 시 이 10개가 우선:

1. **3-layer parallel blend 유지** (4-stage sequential 아님). LambdaRank reranker는 4번째 레이어로 W-0148 이후 추가.
2. **LightGBM 두 모델 분리**: Binary P(win) classifier (Layer C, 기존) + LambdaRank reranker (W-0148+, 신규).
3. **Ledger → Supabase 이전 P1**: JSON files = Cloud Run 재시작 시 소실 위험.
4. **Pattern library → Definition versioning**: hardcoded `library.py` dict → `pattern_objects` Supabase + definition_id UUID FK.
5. **engine/rag/ 이름 유지**: 실체는 deterministic 256-dim structural embedding (semantic RAG 아님), docstring으로 명시.
6. **Semantic RAG 추가는 Phase 3**: news ingestion 확정 시.
7. **Migration system 즉시 도입**: `engine/db/migrations/*.sql` + `migrate.py`. embedded DDL 폐기.
8. **Stats Engine 분리**: deterministic SQL → matview, LLM은 절대 수치 만들지 않음.
9. **LLM Context Assembly 규칙**: 모든 LLM call은 `engine/agents/context.py:ContextAssembler`를 통한다 (Parser/Judge/Refinement 3 변형).
10. **Read/Display model 완전 분리**: Write/Storage와 reshape 금지.

---

## 8. AutoResearch 통합 (R-01 ~ R-08, 8 repo 매핑)

### 8.1 8 Repo 평가 (확정)

| 순위 | Repo | 평가 | Cogochi 적용 |
|---|---|---|---|
| 1 | `ryanli-me/paradigm-pm-challenge` | ⭐⭐⭐⭐⭐ | 1,039 variant + multi-seed gate 패러다임 = R-01/R-02/R-05 |
| 2 | `octavi42/prediction-market-maker` | ⭐⭐⭐⭐ | v01→v109 evolution_chain = R-02 직접 적용 |
| 3 | `paradigmxyz/sfp` | ⭐⭐⭐⭐ | LLM catastrophic forgetting → 우리 LightGBM 재학습 SFP 적용 (Phase 2) |
| 4 | `Barnadrot/attention-kernel-research` | ⭐⭐⭐⭐ | program.md + iters.tsv = Phase D template 직접 채용 |
| 5 | `Kropiunig/optimization-arena-exploits` | ⭐⭐⭐ | seed lottery 수학 증명 = R-05 multi-period gate 정당화 |
| 6 | `danrobinson/prediction-market-challenge` | ⭐⭐ | simulator framework reference만 |
| 7 | `Ar9av/obsidian-wiki` | ⭐⭐⭐ | 우리 memory/ 시스템과 동형 — synthesis/만 Phase D 추가 |
| 8 | `jessepinkman9900/obsidian-agent-wiki` | ⭐⭐ | Ar9av wrapper, 추가 작업 없음 |

### 8.2 R-시리즈 → 구현 매트릭스

| Stage | ID | 변경 | 파일 | 상태 | 근거 |
|---|---|---|---|---|---|
| 1 | R-01 | Verdict 6-cat | `engine/ledger/types.py:54` + 4 routes + UI | ✅ type 완료, UI 미완 | Ryan Li 16-seed |
| 2 | R-02 | PatternObject evolution_chain | `engine/patterns/types.py` (3 fields) + register/parse routes | ✅ types 완료, routes 미완 | Octavi v01-v109 |
| 핵심 픽스 | scanner→capture | `_on_entry_signal`에 CaptureRecord 생성 | `engine/patterns/scanner.py` | ✅ 완료 | (선결조건) |
| 3 | R-03 | Chart drag → PatternDraft | `engine/features/range_extractor.py` (신규) + `POST /patterns/draft-from-range` | ❌ NOT BUILT (A-04) | UX 진입경로 |
| 4 | R-04 | 1-click Watch | `POST /captures/{id}/watch` + UI 버튼 | ❌ NOT BUILT (D-03) | 인박스 → 모니터링 연결 |
| 5 | R-05 | Multi-period gate | `engine/stats/engine.py:_compute_gate_status` | ❌ NOT BUILT (H-07) | Ryan Li + Kropiunig 수학 |
| 6 | R-06 | F-60 status API | `GET /users/{id}/f60-status` + dashboard progress bar | ❌ NOT BUILT (H-07/L-05) | 게이트 가시화 |
| 7 | R-07 | iters.tsv format | `engine/autoresearch/iters.tsv` 헤더 결정 | ⏳ Phase D 직전 | Barnadrot template |
| 8 | R-08 | from-scratch agent escape | parallel agent + fresh context | ❌ Phase D | Ryan Li WRITEUP §5 |

### 8.3 multi-period gate 로직 (R-05 spec)

```python
def _compute_gate_status(outcomes: list[PatternOutcome]) -> GateStatus:
    resolved = [o for o in outcomes if o.outcome != "pending"]
    if len(resolved) < 200:
        return GateStatus(passed=False, reason="insufficient_data")

    # 30일 rolling window 3개
    windows = split_rolling_30d(resolved, n=3)
    accuracies = []
    for w in windows:
        valid = sum(1 for o in w if o.user_verdict in ("valid", "near_miss"))
        total = sum(1 for o in w if o.user_verdict is not None)
        if total > 0:
            accuracies.append(valid / total)

    if len(accuracies) < 2:
        return GateStatus(passed=False, reason="insufficient_windows")

    median_acc = statistics.median(accuracies)
    floor_acc = min(accuracies)
    return GateStatus(
        passed=median_acc >= 0.55 and floor_acc >= 0.40,
        median_accuracy=median_acc,
        floor_accuracy=floor_acc,
        window_accuracies=accuracies,
    )
```

**왜 이 식인가**:
- Ryan Li: leaderboard 1-seed $52.03 → final 3-seed $42.32 (drop 20%) → single period 과적합
- Kropiunig: 동일 strategy 3회 제출 $282/$259/$250 ($32 variance on identical code) → seed lottery 증명
- 따라서 **median + floor 동시 통과**가 strategy quality vs seed luck 분리의 유일한 방법

---

## 9. 구현 상태 종합 (BUILT / NOT BUILT)

전체 매트릭스는 [feature-implementation-map.md](docs/live/feature-implementation-map.md). 데이터 엔진 핵심만 발췌:

### 9.1 BUILT ✅ (Day-1 운영 가능)

- L0 Raw fetcher 27개 + 12 scheduler job
- L1 feature_windows (138K rows backfill 완료, W-0145)
- L2 PatternObject 52개 + building blocks 29개 + state machine
- L3 ledger 4-table type + capture pipeline (★ 방금 픽스)
- L4 StatsEngine 5min TTL cache
- L5b 3-layer search blend (Layer C는 모델 미훈련 시 fallback)
- L6 terminal multi-pane chart + Pine Script + Verdict Inbox 3-cat
- Ledger 6-cat type ★ 방금
- PatternObject evolution_chain ★ 방금
- JWT RS256 + JWKS 캐싱 (1000x), token blacklist
- App CI 250 tests / Engine CI 1448 passed
- Cloud Scheduler 5 jobs 등록
- GCP cogotchi 1024MiB 서빙 中

### 9.2 NOT BUILT ❌ (Phase 1 우선)

- **A-03**: AI Parser route + UI
- **A-04**: Chart drag → PatternDraft (R-03)
- **D-03**: 1-click Watch (R-04)
- **F-02**: 6-cat Verdict UI 버튼 (R-01 후속)
- **H-07/H-08**: F-60 multi-period gate + per-user accuracy (R-05/R-06)
- **L-05**: Dashboard F-60 progress bar
- **Wiki Layer 전체**: `engine/wiki/` (ingest/query/lint/exporter) + `wiki_pages` 테이블
- **Stats matview 신규**: pattern_stats_cache + user_pattern_stats Supabase 마이그레이션
- **Notifications**: notification_queue + 72h verdict scheduler
- **Migration system**: `engine/db/migrations/`
- **ContextAssembler**: `engine/agents/context.py`

### 9.3 PARTIAL 🔄

- L3 Ledger Supabase 이전 (현재 JSON files; supabase_record_store.py 존재하나 기본 아님)
- LightGBM Layer C (코드 있으나 미훈련; 훈련 후 자동 활성)

---

## 10. Phase 로드맵 (작업 우선순위 순)

### Phase 1 — 이번 주 (baseline 만들기, AutoResearch 진입 전)

```
[★ 방금 완료]
✅ scanner._on_entry_signal에 CaptureRecord 생성 — 파이프 연결
✅ R-01 user_verdict 6-cat 타입
✅ R-02 PatternObject.evolution_chain 필드
✅ AutoResearch 통합 설계 문서

[지금 해야 할 것 — Phase 1 Day-1 baseline]
[ ] R-01 후속: routes + UI 6-cat 버튼 (F-02)
[ ] R-04 1-click Watch: POST /captures/{id}/watch + UI 버튼 (D-03)
[ ] R-05/R-06 F-60 multi-period gate + status API + progress bar (H-07/L-05)
[ ] Ledger Supabase 이전 (CTO Decision 3) — 데이터 내구성 P1
[ ] Migration system 도입 (CTO Decision 7)
[ ] pattern_stats_cache + user_pattern_stats matview 생성
[ ] notification_queue + 72h verdict scheduler

→ 완료 시: 100 capture × 200 verdict 누적 가능 → F-60 gate 측정 시작
```

### Phase 2 — 다음 4주 (Wiki + Stats 완성)

```
[ ] wiki_pages + WikiIngestAgent + WikiQueryAgent + WikiLintAgent
[ ] ContextAssembler (Parser/Judge/Refinement 3 변형)
[ ] judge_advice 사전 생성 파이프라인
[ ] user_activity_log + analytics
[ ] agent_trace_log
[ ] episodic_sessions (30d TTL)
[ ] Pattern definition versioning (CTO Decision 4)
[ ] SFP catastrophic forgetting 모니터링 (LightGBM 재학습 시)
```

### Phase 3 — M6+ (RAG + Social)

```
[ ] news_chunks (pgvector) + news ingest
[ ] capture_news_overlap + news-conditioned stats
[ ] copy_trade_subscriptions + signals + actions
[ ] community layer (k-anonymized)
[ ] reranker_models + LambdaRank Stage 4 (W-0148)
[ ] raw_options_metrics (G archetype) + raw_options_oi (I archetype)
[ ] signal_events (J archetype)
```

### Phase D — 12주 후 (AutoResearch)

선결: R-01~R-08 + verdict 200+ + F-60 gate validated.

```
[ ] R-07 iters.tsv 포맷 결정 (Barnadrot 직접 채용)
[ ] R-08 program.md 구조 → engine/autoresearch/orchestrator.py
[ ] from-scratch escape: parallel agent + fresh context
[ ] PatternObject variant 자동 생성 (parent_id 체인)
[ ] dead-end-confirmation table (6-cat verdict 라벨 기반)
[ ] synthesis/ wiki layer (Pattern × Outcome correlation)
```

---

## 11. 비용 모델 (요약)

| 항목 | 빈도 | 비용/op | 일 비용/user |
|---|---|---|---|
| 기존 (Parser/Judge/Search/Engine) | — | — | $0.35 ~ $1.25 |
| Stats Engine refresh (SQL only) | 288/day | ~$0 | $0 |
| Notification SMS | 0-3/day | $0.005 | $0.015 |
| Judge Agent pre-gen | 1-3/day | $0.05 | $0.05~0.15 |
| Wiki MD export | 50/day | ~$0 | $0 |
| News ingest (Phase 3, shared) | — | $0.001/article | ~$0 |
| Phase D AutoResearch loop | 자율 | LLM call ~ $0.10/iter | (개발용, 사용자 전가 X) |

**총 추가**: +$0.07~0.17/user/day (~15% 증가)

---

## 12. Non-Goals (의도적으로 안 함)

- GraphQL surface (REST + JSON 충분)
- gRPC between app and engine (Phase 3+)
- 실시간 WebSocket 스트리밍 (polling/SSE로 충분)
- ClickHouse / TimescaleDB (현재 규모에서 불필요)
- Per-user fine-tuning (Phase B 이후)
- Copy trading 자동 실행 (사람 확인 없는 자동 주문 금지)
- 소셜 피드 / 댓글 / 좋아요 (제품 scope 아님)
- Engine business logic이 app 라우트 핸들러로 누출
- Read/Display model이 Write/Storage 모델과 혼합

---

## 13. 출처 문서 (deep-dive 링크)

이 정본이 통합한 원본:

| 출처 | 다루는 영역 | 깊이 참조 시 |
|---|---|---|
| [`docs/design/06_DATA_CONTRACTS.md`](docs/design/06_DATA_CONTRACTS.md) | API/DB/event 스키마 + 실패모드 + replay | API contract 세부 |
| [`docs/design/10_COMPLETE_DATA_ARCHITECTURE.md`](docs/design/10_COMPLETE_DATA_ARCHITECTURE.md) | User Activity + Wiki + Stats + Notification + Social + Copy Trade DB | 신규 테이블 SQL 전문 |
| [`docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md`](docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md) | 설계 vs 실제 reconciliation + 10 CTO 결정 | override 논리 |
| [`docs/live/engine-pipeline.md`](docs/live/engine-pipeline.md) | engine 도메인 boundary | engine/ 책임 경계 |
| [`docs/live/feature-implementation-map.md`](docs/live/feature-implementation-map.md) | 전체 기능 BUILT/NOT BUILT 매트릭스 (A~L) | 이슈 등록 단위 |
| [`docs/live/autoresearch-ml.md`](docs/live/autoresearch-ml.md) | AutoResearch Phase A0~D 계약 | ML lifecycle |
| [`engine/ENGINE_SPEC.md`](engine/ENGINE_SPEC.md) | 엔진 런타임 spec | 엔진 내부 구조 |
| [`engine/wiki/COGOCHI.md`](engine/wiki/COGOCHI.md) | Wiki/LLM context 정책 | Judge advice 포맷 |
| [`work/active/W-autoresearch-integration-design-20260426.md`](work/active/W-autoresearch-integration-design-20260426.md) | 8 repo AutoResearch 통합 설계 | Ryan Li/Octavi/Barnadrot 원문 인용 |
| `~/Downloads/GITHUB_REPO_ANALYSIS_FULL.md` | 8 repo 원본 코드/README 분석 | repo별 raw 분석 |

---

## 14. 다음 작업 (이 정본 다음 단계)

지금 이 worktree에서 commit + 다음 분기:

1. **즉시 commit**: scanner.py + ledger/types.py + patterns/types.py + 이 설계 문서
2. **다음 turn 결정**: 
   - (a) R-01 후속 routes/UI 6-cat 버튼
   - (b) R-04 1-click Watch
   - (c) R-05/R-06 F-60 multi-period gate
   - (d) Ledger Supabase 이전 (CTO Decision 3, P1)

**추천 순서**: (c) F-60 게이트 먼저 → (a) UI verdict → (b) Watch → (d) Supabase 이전.
이유: F-60이 baseline 측정의 종결점. UI + Watch는 verdict 수집 가속. Supabase 이전은 데이터 누적 시작 후 시급.

---

*Document version: v1.0 · Canonical · Replaces all prior data architecture fragments*
*Author: 이번 세션 (2026-04-26) · 8 repo 분석 + 9 source doc 통합 · 정본*
