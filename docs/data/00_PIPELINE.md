# W — Data Pipeline 정본 (Canonical)

**Status:** ACTIVE · 정본 (데이터 흐름의 single source of truth)
**Date:** 2026-04-26
**Scope:** raw 데이터 수집 → context 관리 → 유저 제공 → 저장. 두 축으로 분리: **(A) 시스템이 수집** · **(B) 유저가 저장**.

---

## 0. 한 줄 결론

```
[A. 시스템 Pull]  외부 API → fetcher 27개 → CSV/Redis/SQLite raw → L1 feature_windows → L2 패턴 엔진 → L3 ledger
[B. 유저 Push]    chart drag/click/text → app route → engine route → capture/verdict/prefs (Supabase durable)
                                                                              ↓
                                          [Context]  ContextAssembler (Parser/Judge/Refinement) + Wiki ingest
                                                                              ↓
                                          [Read]     terminal/dashboard/wiki UI ← Supabase + SQLite hot copy
```

두 stream은 **L3 ledger**에서 합류한다 (시스템 entry signal × 유저 verdict).

---

## 1. 두 축 분리 (왜 나누는가)

| 축 | 트리거 | 빈도 | 데이터 양 | 신뢰도 | 변경 가능성 | 저장소 우선 |
|---|---|---|---|---|---|---|
| **A. System Fetch** | 외부 API (스케줄러) | 1s ~ 24h | 거대 (TB/월) | 외부 (rate limit, gap) | append-only, 재페치 가능 | SQLite raw + Redis cache, Supabase 동기화 X (raw는 ephemeral) |
| **B. User Save** | UI 액션 | 1 / hour 평균 | 작음 (MB/유저) | 본인 책임 | append-only, 수정/삭제 발생 | **Supabase durable 우선**, SQLite는 hot copy만 |

**왜 분리해야 하나**:
- A는 lost OK (재페치 가능), B는 lost NOT OK
- A는 process-local cache로 충분, B는 multi-process truth 필요
- A는 schema 자주 변함 (feed format), B는 schema stable
- A는 user_id 무관 (전 유저 공통), B는 user_id 필수 + RLS

---

## 2. 축 A: System Fetch Pipeline (시스템이 가져오는 것)

### 2.1 외부 데이터 소스 → Fetcher 27개

```
engine/data_cache/
├── Klines (가격/OHLCV)
│   ├── fetch_binance.py            ← Binance spot/perp klines
│   ├── fetch_okx_historical.py     ← OKX historical bars
│   ├── fetch_coinbase.py           ← Coinbase
│   └── fetch_alpha_universe.py     ← universe 발견
│
├── Perp Metrics (OI / Funding / Long-Short)
│   ├── fetch_binance_perp.py       ← Binance OI + funding
│   ├── fetch_exchange_oi.py        ← Bybit/OKX OI 합산
│   └── coinalyze_credentials.py    ← Coinalyze API auth
│
├── Liquidations (청산)
│   ├── fetch_binance_liquidations.py
│   ├── fetch_coinalyze_liquidations.py
│   └── liquidation_windows.py      ← 청산 윈도우 집계
│
├── Macro (거시지표)
│   ├── fetch_macro.py              ← Fear&Greed, DXY, VIX, FRED
│   └── fetch_cme_cot.py            ← CME COT 보고서
│
├── On-chain
│   ├── fetch_onchain.py            ← MVRV, Puell (CoinMetrics)
│   ├── fetch_bscscan.py            ← BSC scan
│   └── fetch_dexscreener.py        ← DEX 가격/유동성
│
├── Smart Money / Flow
│   ├── fetch_okx_smart_money.py    ← OKX 스마트머니 추종
│   └── fetch_social.py             ← 소셜 시그널 (Twitter velocity 등)
│
└── Infrastructure
    ├── loader.py                   ← 통합 load_klines / load_perp / load_macro_bundle
    ├── raw_ingest.py               ← raw → SQLite 적재
    ├── raw_store.py                ← SQLite raw_store 인터페이스
    ├── registry.py                 ← signal registry
    ├── resample.py                 ← TF 변환 (1m → 5m → 1h)
    ├── token_universe.py           ← 활성 universe 관리
    ├── market_search.py            ← market 검색 인덱스
    └── freshness.py                ← TTL/staleness 체크
```

### 2.2 Scheduler (12 jobs, APScheduler in-process)

```
engine/scanner/scheduler.py
SCAN_INTERVAL = 900s (15min) default

│ Job                              │ 주기    │ 무엇을        │ 출력 저장소                │
│──────────────────────────────────│─────────│───────────────│────────────────────────────│
│ pattern_scan_job                 │ 15min   │ 300+ symbol × │ phase_transition_events   │
│                                  │         │ 52 pattern    │ ledger_entries             │
│                                  │         │ scan          │ capture_records ★ FIX     │
│ scan_universe_job                │ 15min   │ universe 평가 │ engine_alerts (Supabase)  │
│ auto_evaluate_job                │ 15min   │ pattern 자동  │ ledger_outcomes            │
│                                  │         │ 평가          │                            │
│ outcome_resolver_job             │ 1h      │ 72h 경과 처리 │ ledger_outcomes            │
│ refinement_trigger_job           │ daily   │ refinement    │ refinement_proposals      │
│                                  │         │ 후보 검출     │                            │
│ pattern_refinement_job           │ 6h opt  │ 패턴 개선     │ pattern_versions           │
│ scan_alpha_observer_job          │ 15min   │ alpha 관찰    │ alpha_world_model         │
│ scan_alpha_warm_job              │ 15min   │ alpha 워밍업  │ feature cache              │
│ search_corpus_refresh_job        │ opt     │ search index  │ search_corpus.sqlite       │
│ market_search_index_refresh      │ 30min   │ market 검색   │ market_search index        │
│ feature_windows_prefetcher       │ continuous │ 코어 prefetch │ feature_materialization │
│ kline 5min prefetch (Redis)      │ 5min    │ 핫 데이터     │ Redis L1 cache             │
│──────────────────────────────────│─────────│───────────────│────────────────────────────│

Cloud Scheduler (out-of-process, 5 jobs registered):
  feature-materialization-run / db-cleanup-daily / pattern-scan-run /
  outcome-resolver-run / feature-windows-build
```

### 2.3 Pull → Store 흐름

```
[1] Fetcher 호출 (예: fetch_binance_perp.fetch_oi(symbol, tf))
        ↓
[2] HTTP request → external API (rate limit guard, retry with backoff)
        ↓
[3] raw response → CSV file (data_cache/cache/) ← ★ ephemeral, gitignored
        ↓
[4] raw_ingest.py → SQLite raw_market_bar / raw_perp_metrics / raw_orderflow_metrics
                    (feature_materialization.sqlite)
        ↓
[5] feature_calc.compute_features_table(symbol, tf)
        ↓
[6] feature_windows (92 cols) ← SQLite materialization_store + Supabase mirror (W-0145, 138K rows)
        ↓
[7] block_evaluator.evaluate_blocks(features) → 29 building blocks
        ↓
[8] PatternStateMachine.feed(blocks_triggered) → state transition
        ↓
[9] _on_entry_signal → PatternOutcome + CaptureRecord ★ (방금 픽스, Sec 4)
```

### 2.4 Storage 계층 (System Fetch 측)

```
Hot (process-local, 빠름):
├── Redis L1     ← kline 5분 prefetch (TTL 5min)
└── CSV files   ← raw fetcher output (TTL 24h, 자동 정리)

Warm (per-process, 중간):
├── feature_materialization.sqlite
│   ├── raw_market_bar
│   ├── raw_perp_metrics
│   ├── raw_orderflow_metrics
│   ├── feature_windows (92 cols × symbol × TF)
│   └── search_corpus_signatures
├── search_corpus.sqlite
├── similar_runs.sqlite
└── runtime_state.sqlite

Cold (Supabase, 진실):
├── feature_windows (mirror, 138K rows)
├── pattern_runtime_states (dual-write hot=SQLite)
├── phase_transition_events
└── engine_alerts
```

**규칙**:
- raw_* 테이블은 SQLite local만, Supabase 안 보냄 (재페치 가능 + 너무 큼)
- feature_windows는 dual: SQLite (compute fast) + Supabase (cross-process query)
- pattern state는 dual: SQLite (hot) + Supabase (durable, multi-process truth)

---

## 3. 축 B: User Save Pipeline (유저가 저장하는 것)

### 3.1 유저 액션 → 저장 항목

```
액션 / Entry Point                    저장 테이블                       Supabase 우선
─────────────────────────────────────────────────────────────────────────────────
[B-1] 차트 구간 드래그              capture_records                  ✅ durable
      → POST /api/captures
[B-2] 텍스트 → AI Parser            pattern_candidates → patterns    ✅ durable
      → POST /api/patterns/parse                                      ❌ NOT BUILT (A-03)
[B-3] 차트 range → Pattern draft    pattern_candidates → patterns    ❌ NOT BUILT (A-04)
      → POST /api/patterns/draft-from-range
[B-4] Verdict 클릭 (6-cat)          ledger_verdicts                  ✅ durable ★R-01
      → POST /api/captures/{id}/verdict
[B-5] 1-click Watch                 watchlist                        ❌ NOT BUILT (D-03)
      → POST /api/captures/{id}/watch
[B-6] Indicator on/off              user_indicator_preferences       ✅ durable
      → PUT /api/user/indicator-preferences
[B-7] Workspace pin (심볼 고정)     workspace_pins (runtime)         ⚠️ ephemeral SQLite
      → POST /api/runtime/workspace/pins
[B-8] Setup 등록                    setups                           ✅ durable
      → POST /api/runtime/setups
[B-9] Research context              research_contexts                ✅ durable
      → POST /api/runtime/research-contexts
[B-10] AI 대화                      episodic_sessions (30d TTL)      ✅ durable, TTL
      → /api/cogochi/chat
[B-11] Personal variant (threshold) personal_variants                ✅ durable
      → PUT /api/patterns/{slug}/personal-variant
[B-12] Refinement proposal          refinement_proposals             ✅ durable, admin gate
      → POST /api/wiki/refinement
[B-13] Notification action          notification_queue (status)      ✅ durable
      → POST /api/notifications/{id}/read
```

### 3.2 Capture Record 상태 머신 (B의 핵심 entity)

```
status lifecycle:
  pending_outcome  ←── INSERT (시스템 _on_entry_signal OR 유저 chart drag)
       ↓ (72h elapsed, outcome_resolver)
  outcome_ready    ←── ledger_outcomes 채워짐 (peak_price, exit_return_pct, auto verdict)
       ↓ (유저 verdict 클릭)
  verdict_ready    ←── ledger_verdicts INSERT (6-cat)
       ↓ (stats engine refresh)
  closed           ←── stats_engine 반영 완료
```

### 3.3 시스템 vs 유저가 만든 capture 구분

```python
# capture_records.capture_kind 필드로 구분
"pattern_candidate"     ← 시스템 scanner가 자동 생성 (★ FIX 2026-04-26)
"manual_hypothesis"     ← 유저 텍스트 → AI Parser
"chart_bookmark"        ← 유저 chart drag
"post_trade_review"     ← 유저 사후 리뷰
```

**중요**: 두 stream(A, B)이 capture_records에서 합류한다. capture_kind로 출처를 추적.

### 3.4 Storage 계층 (User Save 측)

```
Supabase (durable, multi-process truth) — 모든 user data 우선:
├── capture_records          ★ 시스템 + 유저 합류 지점
├── ledger_entries / scores / outcomes / verdicts
├── ledger_negatives
├── pattern_candidates
├── pattern_objects (definition_id UUID)
├── personal_variants
├── user_indicator_preferences
├── notification_queue
├── judge_advice
├── episodic_sessions (30d TTL)
├── user_activity_log
├── wiki_pages / wiki_links / wiki_change_log  ← Phase 1 신규
├── setups
└── research_contexts

SQLite (hot copy, ephemeral):
├── pattern_capture.sqlite   ← capture_records hot mirror
├── pattern_state.sqlite     ← pattern_runtime_states hot
└── runtime_state.sqlite     ← workspace_pins (ephemeral OK)

규칙:
- 유저 데이터는 Supabase durable이 우선, SQLite는 read-acceleration
- workspace_pins만 ephemeral OK (탭 닫으면 reset)
- Cloud Run 재시작에도 살아남아야 하는 것 = Supabase 의무
```

---

## 4. 축 A × B 합류 — _on_entry_signal (★ 방금 픽스)

```python
# engine/patterns/scanner.py:_on_entry_signal
# 시스템이 패턴 entry 감지 → 유저가 inbox에서 verdict하도록 capture까지 생성

def _on_entry_signal(transition: PhaseTransition) -> None:
    # ... ENTRY SIGNAL 로깅, ML score 계산 ...

    # [축 A] 시스템 측 evidence
    outcome = PatternOutcome(...)
    LEDGER_STORE.save(outcome)                                  # JSON files (DEPRECATED)
    LEDGER_RECORD_STORE.append_entry_record(outcome)            # Supabase
    LEDGER_RECORD_STORE.append_score_record(outcome)            # Supabase

    # [축 A → B 합류] ★ 방금 추가: 유저가 inbox에서 볼 수 있게
    capture = CaptureRecord(
        capture_kind="pattern_candidate",  ← 시스템 발견 (manual_hypothesis와 구분)
        symbol=transition.symbol,
        pattern_slug=transition.pattern_slug,
        pattern_version=transition.pattern_version or 1,
        definition_id=outcome.definition_id,
        definition_ref=outcome.definition_ref,
        phase=transition.to_phase,
        timeframe=transition.timeframe,
        captured_at_ms=int(transition.timestamp.timestamp() * 1000),
        candidate_transition_id=transition.transition_id,
        scan_id=transition.scan_id,
        feature_snapshot=transition.feature_snapshot,
        block_scores=transition.block_scores or {},
        outcome_id=outcome.id,                              ← ledger 연결
        status="pending_outcome",
    )
    _CAPTURE_STORE.save(capture)
    # → SQLite pattern_capture.sqlite + 비동기 Supabase capture_records upsert

# 결과: 유저는 dashboard inbox에서 시스템이 발견한 패턴을 볼 수 있음
#        → 6-cat verdict 클릭 → ledger_verdicts INSERT → F-60 gate 측정
```

**이 한 줄(_CAPTURE_STORE.save)이 빠져 있어서 지난 수개월간 verdict 0건이었다.**

---

## 5. Context 관리 (LLM 호출 시 데이터 주입)

### 5.1 ContextAssembler 3 변형 (CTO Decision 9, 모든 LLM call의 단일 진입점)

```python
# engine/agents/context.py (NOT BUILT — Phase 2)

class ContextAssembler:
    """모든 LLM 호출은 이 클래스를 통한다. 직접 prompt 조립 금지."""

    def for_parser(self, user_id: str, symbol: str) -> ParserContext:
        # AI Parser용 (유저 텍스트 → PatternDraft)
        return {
            "schema": COGOCHI_MD_SLICE,            # ~2K tokens 고정 (engine/wiki/COGOCHI.md)
            "signal_vocab": SIGNAL_VOCAB,          # ~1K tokens 고정 (signal_vocabulary 테이블)
            "matched_patterns": top3_patterns(),   # ~3K tokens 동적 (patterns 매칭)
            "user_verdicts": recent_verdicts(user_id, n=5),  # ~2K 개인화
            "current_snapshot": feature_snapshot(symbol),    # ~1K 실시간
            # Total: ~9K tokens
        }

    def for_judge(self, user_id: str, capture_id: str) -> JudgeContext:
        # Judge용 (72h 후 verdict 사전 분석)
        return {
            "schema": COGOCHI_MD_SLICE_5_2,        # §5.2 only
            "pattern_page": wiki_pattern(pattern_id),  # stats + definition
            "user_history": user_pattern_history(user_id, pattern_id, n=5),
            "outcome": ledger_outcome(capture_id),  # 실제 price movement
            "news_summary": rag_at_time(capture_time),  # Phase 3 RAG
            # Total: ~8K tokens
        }

    def for_refinement(self, pattern_id: str) -> RefinementContext:
        # Refinement용 (패턴 개선 제안)
        return {
            "pattern_page": wiki_pattern(pattern_id),  # full
            "recent_verdicts": anon_verdicts(pattern_id, k_anon=10),
            "overlap_analysis": pattern_overlap(pattern_id),
            # Total: ~12K tokens
        }
```

**원칙**: LLM은 prose만 만든다. 수치는 stats_engine, raw 데이터는 ContextAssembler가 주입.

### 5.2 Wiki Layer (Karpathy pattern, ingest-time 정리)

```
[Karpathy 차이]
RAG: query 시점에 raw에서 fragment 꺼냄
Wiki: ingest 시점에 LLM이 미리 정리해서 wiki page에 저장 → query는 wiki 직접 조회

이벤트 → 페이지 업데이트:
  capture INSERT       → users/{id}/captures/{cap_id}.md.body_md (LLM)
  verdict INSERT       → patterns/{slug}.md (1줄 추가) + users/{id}/index.md
  pattern_stats refresh→ patterns/{slug}.md.frontmatter (StatsEngine, LLM 아님)
  weekly cron          → weekly/{yyyy-Www}.md (synthesis)

저장:
  Canonical:  Supabase wiki_pages (frontmatter JSONB + body_md text)
  Export:     cogochi/wiki/**/*.md (LLM context 주입용, gitignored)

분리 원칙 (corruption 방지):
  frontmatter (수치) → stats_engine 전용
  body_md     (산문)  → LLM 전용
  변경은 wiki_change_log에 모두 기록
```

### 5.3 Stats Engine (5min cron, deterministic)

```
입력:  ledger_entries + ledger_outcomes + ledger_verdicts (Supabase)
처리:  pure SQL (REFRESH MATERIALIZED VIEW CONCURRENTLY)
출력:
  pattern_stats_cache (matview): occurrence_count, win_rate, avg_return_on_hit, ...
  user_pattern_stats  (matview): per-user 슬라이스
  → wiki_pages.frontmatter 자동 업데이트 (last_calculated)

연계 작업:
  decay_signals → refinement_trigger
  F-60 gate evaluation (R-05 NOT BUILT)
```

---

## 6. 유저 제공 (Read Path) — 화면별 데이터 출처

| 화면 | 컴포넌트 | API 호출 | 데이터 출처 |
|---|---|---|---|
| Terminal | TradingView 차트 | `GET /api/market/ohlcv` + WS `/api/chart/feed` | Binance WS + Redis L1 + SQLite klines |
| Terminal | OI 패널 | `GET /api/market/oi` | SQLite raw_perp_metrics |
| Terminal | Funding 패널 | `GET /api/market/funding` | SQLite raw_perp_metrics |
| Terminal | Multi-pane (Liq/CVD) | `GET /api/market/liq-clusters` `/flow` | SQLite raw_orderflow_metrics |
| Terminal | 패턴 HUD (우측) | `GET /api/patterns/states?symbol` | Supabase pattern_runtime_states |
| Terminal | 인텔 패널 | `POST /api/cogochi/analyze` | LLM (ContextAssembler.for_judge) |
| Terminal | Workspace pins | `GET /api/runtime/workspace/{symbol}` | SQLite runtime_state.sqlite |
| Dashboard | Verdict Inbox | `GET /api/captures?status=outcome_ready` | Supabase capture_records JOIN ledger_outcomes |
| Dashboard | Live signals | `GET /api/live-signals` | Supabase engine_alerts |
| Dashboard | F-60 progress | `GET /api/users/{id}/f60-status` ❌ NOT BUILT | StatsEngine matview (R-05/R-06) |
| Dashboard | 내 통계 | `GET /api/user/stats` ❌ NOT BUILT | user_pattern_stats matview |
| Lab | Pattern evaluate | `POST /api/patterns/{slug}/evaluate` | Engine state machine 즉시 평가 |
| Lab | Forward walk | `POST /api/lab/forward-walk` | feature_windows backfill |
| Wiki | 패턴 페이지 | `GET /api/wiki/patterns/{id}` ❌ NOT BUILT | wiki_pages + pattern_stats_cache + user_pattern_stats |
| Search | Similar live | `POST /api/search/similar` | 3-layer blend (search_corpus + phase_transition_events + LightGBM) |
| Notifications | 알림 목록 | `GET /api/notifications` ❌ NOT BUILT | Supabase notification_queue |

**일반 규칙**:
- 실시간 (WS): klines, alerts, live-signals
- Polling: 패턴 상태, capture 인박스 (15min~1h)
- Cached (matview): stats, F-60 (5min refresh)
- LLM-assist: cogochi/analyze, judge, parser

---

## 7. 저장 정책 요약

### 7.1 어디에 저장할까 (decision tree)

```
질문 1: 재페치 가능한가? (외부 API에서 다시 받을 수 있는가)
  YES → SQLite local (ephemeral OK, raw_*)
  NO  → Supabase durable

질문 2: process boundary 넘어 읽혀야 하나?
  YES (multi-Cloud-Run-replica) → Supabase
  NO (single-process)            → SQLite

질문 3: 빈도가 높은가?
  HIGH (TF=1m, 매분 INSERT) → SQLite + 주기적 batch flush to Supabase
  LOW                       → Supabase 직접 INSERT

질문 4: schema 자주 변하는가?
  YES (외부 feed format)    → SQLite + JSONB column
  NO                        → Supabase typed schema
```

### 7.2 Retention / TTL

| 데이터 | TTL | 정리 방식 |
|---|---|---|
| Redis L1 (kline) | 5min | 자동 만료 |
| CSV cache | 24h | data_cache 정리 daily cron |
| raw_market_bar (SQLite) | 30d | db-cleanup-daily Cloud Scheduler |
| feature_windows (SQLite) | 90d | 주기적 prune |
| feature_windows (Supabase) | 무한 (search 용) | 압축 후 cold storage (Phase 3) |
| pattern_runtime_states | 무한 | active=false → soft delete |
| ledger_* | 무한 | append-only, immutable |
| capture_records | 무한 | 유저 자산 |
| episodic_sessions | 30d | `expires_at` generated column + daily DELETE |
| notification_queue | 90d (status=read) | weekly cleanup |
| audit_log | 365d | 압축 후 cold storage |
| wiki_change_log | 무한 | append-only |

---

## 8. 현재 파이프라인 상태 (BUILT/BROKEN/NOT BUILT)

*마지막 업데이트: 2026-04-27 (Wave 1~3 완료 반영)*

### 8.1 BUILT ✅

- A 축: 27 fetcher + 12 scheduler job 모두 동작
- A 축: feature_windows 138K rows backfilled (W-0145)
- A 축: SQLite raw_store + Supabase mirror 동기화
- A 축: pattern scanner + state machine + ledger entry
- A×B 합류: _on_entry_signal → CaptureRecord (2026-04-26 픽스)
- B 축: capture_records (chart drag) + ledger_verdicts
- B 축: workspace pins, setups, research_contexts
- B 축: indicator_preferences (W-0123)
- B 축: 5-cat verdict (`valid|invalid|missed|too_late|unclear`) — engine PR #370 + app PR #381
- B 축: AI Parser engine (A-03-eng, PR #371) — `POST /patterns/parse`
- B 축: Chart drag → PatternDraft engine (A-04-eng, PR #372) — `POST /patterns/draft-from-range`
- B 축: 1-click Watch engine (D-03-eng, PR #373) + app UI (PR #383)
- B 축: H-08 verdict accuracy API (PR #377) — `GET /users/{id}/verdict-accuracy`
- B 축: F-17 Viz Intent Router (PR #378) — `POST /viz/route` 6×6 intent × template
- 인프라: F-30 ledger 4-table split Phase 1+2 (PR #387) — migration 024 + dual-write
- PatternObject evolution_chain 필드 (2026-04-26)

### 8.2 BROKEN ⚠️ (실제로는 작동 안 함)

- LightGBM Layer C = 모델 미훈련 → fallback (0.60·A + 0.40·B)
- Wiki layer = 디렉토리 없음
- ContextAssembler = 클래스 없음 → 각 LLM call이 ad-hoc prompt 조립
- F-30 migration 024 미적용 (Supabase에서 수동 실행 필요)

### 8.3 NOT BUILT ❌

**Wave 2 (진행 중 — 다른 에이전트):**
- A-03-app AI Parser UI
- A-04-app Chart drag Draft UI
- H-07 F-60 multi-period gate API (R-05/R-06)

**미착수:**
- F-30 Phase 3~5 (backfill → H-08 read path 전환 → cleanup)
- Notification 시스템 (notification_queue + 72h scheduler)
- Wiki API + UI
- Dashboard F-60 progress bar
- ContextAssembler (`engine/agents/context.py`)

---

## 9. 데이터 무결성 보장

### 9.1 시스템 (A 축)

- Rate limit guard (Binance 1200/min, Bybit 600/min, OKX 60/2s)
- Retry with exponential backoff (max 3 attempts)
- Gap detection (`freshness.py` → 빈 timestamp 채움)
- Schema migration: `engine/db/migrations/*.sql` (NOT BUILT, 즉시 필요)
- Replay: 동일 cycle_id → 동일 transition decisions

### 9.2 유저 (B 축)

- Idempotency: `POST /captures/{id}/watch` 중복 호출 → 동일 watch_id 반환
- RLS (Row-Level Security): user_id 일치 데이터만 read/write
- Audit log: 모든 write에 `user_id`, `occurred_at`, `source` 기록
- Verdict immutability: 한 번 제출하면 수정 불가 (정정은 새 verdict로)
- Wiki frontmatter 보호: stats_engine 외에는 write 불가 (DB trigger)

---

## 10. 외부 의존성 / 비용

| 외부 API | 무료 여부 | 일일 호출량 | 우리 비용 |
|---|---|---|---|
| Binance public | 무료 (rate limit) | 1.5M | $0 |
| Bybit public | 무료 | 0.5M | $0 |
| OKX public | 무료 | 0.5M | $0 |
| Coinalyze | 유료 ($X/mo) | 50K | API key 비용 |
| CoinMetrics | 유료 | 5K | API key 비용 |
| FRED (macro) | 무료 | 1K | $0 |
| Fear&Greed | 무료 | 24 | $0 |
| DexScreener | 무료 | 10K | $0 |
| OpenAI/Anthropic (LLM) | 유료 | per user | Parser/Judge ~$0.10-0.20/user/day |
| Supabase | 유료 | storage+queries | ~$25-100/mo |
| GCP Cloud Run | 유료 | min-instances=0 | ~$50-200/mo |

---

## 11. 다음 작업 우선순위

### Wave 1~3 완료 (2026-04-27 기준)

```
✅ scanner._on_entry_signal CaptureRecord 생성 (A×B 합류 fix)
✅ 5-cat verdict UI (F-02, PR #370+#381)
✅ AI Parser engine (A-03-eng, PR #371)
✅ Chart drag PatternDraft engine (A-04-eng, PR #372)
✅ 1-click Watch engine + app (D-03, PR #373+#383)
✅ H-08 verdict accuracy API (PR #377)
✅ F-17 Viz Intent Router (PR #378)
✅ F-30 ledger 4-table Phase 1+2 (PR #387)
```

### Wave 2 진행 중 (다른 에이전트)

- H-07 F-60 multi-period gate API
- A-03-app AI Parser UI
- A-04-app Chart drag Draft UI

### 다음 우선순위 (Wave 2 완료 후)

1. **F-30 Phase 3+4**: backfill + H-08 read path 전환 (migration 024 적용 후)
2. **Notification 시스템**: 72h verdict 알림 → inbox 유도
3. **Wiki layer**: `engine/wiki/` + wiki_pages Supabase
4. **ContextAssembler**: `engine/agents/context.py` — LLM 단일 진입점

### Phase 2

- ContextAssembler 3 변형 (Parser/Judge/Refinement)
- Pattern definition versioning (Supabase)
- Dashboard F-60 progress bar + 내 통계

### Phase D (12주 후)

- AutoResearch loop (Karpathy program.md + iters.tsv)
- PatternObject variant 자동 생성
- from-scratch agent escape

---

## 12. 출처 / 관련 문서

| 문서 | 다루는 영역 |
|---|---|
| 이 문서 | **데이터 파이프라인 정본 (system fetch × user save)** |
| [`work/active/W-data-engine-master-design-20260426.md`](work/active/W-data-engine-master-design-20260426.md) | 데이터 엔진 전체 아키텍처 정본 |
| [`work/active/W-autoresearch-integration-design-20260426.md`](work/active/W-autoresearch-integration-design-20260426.md) | 8 repo AutoResearch 통합 설계 |
| [`docs/design/06_DATA_CONTRACTS.md`](docs/design/06_DATA_CONTRACTS.md) | API/DB/event 스키마 |
| [`docs/design/10_COMPLETE_DATA_ARCHITECTURE.md`](docs/design/10_COMPLETE_DATA_ARCHITECTURE.md) | User Activity + Wiki + Stats + Notification 전체 SQL |
| [`docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md`](docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md) | 설계 vs 실제 + 10 CTO 결정 |
| [`docs/live/feature-implementation-map.md`](docs/live/feature-implementation-map.md) | A~L 전체 기능 BUILT/NOT BUILT |
| [`docs/live/engine-pipeline.md`](docs/live/engine-pipeline.md) | engine 도메인 boundary |
| [`docs/live/autoresearch-ml.md`](docs/live/autoresearch-ml.md) | AutoResearch Phase A0~D 계약 |
| [`engine/scanner/scheduler.py`](engine/scanner/scheduler.py) | 12 jobs scheduler (코드) |
| [`engine/data_cache/`](engine/data_cache/) | 27 fetcher 실제 구현 |

---

*Document version: v1.0 · Canonical Data Pipeline · 2026-04-26*
*시스템 Pull 축 + 유저 Push 축 + Context 관리 + Read Path 통합 정본*
