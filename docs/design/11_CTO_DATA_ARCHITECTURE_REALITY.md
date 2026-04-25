# 11 — CTO Data Architecture: Design vs Reality Reconciliation

**버전**: v1.0 (2026-04-25)
**목적**: 설계 문서(00-10) + 실제 코드베이스 비교 → CTO 최종 아키텍처 정의
**권위**: 이 문서가 모든 이전 설계 문서의 실제 구현 기준을 override한다.
**대상**: 구현 담당 엔지니어 / 에이전트

---

## 0. 왜 이 문서가 필요한가

설계 문서(00-10)는 올바른 방향이지만 세 군데서 현실과 다르다:

1. **LightGBM**: 설계는 LambdaRank ranker (검색 순위용), 실제는 Binary P(win) classifier (패턴 신뢰도용). 이 둘은 다른 task다 — 둘 다 필요하다.
2. **검색 파이프라인**: 설계는 4-stage sequential, 실제는 3-layer parallel blend. 실제 구현이 더 좋다.
3. **LLM 호출 context**: 설계에서 정의되지 않았다. 어떤 데이터를 어떤 순서로 주입하는지 규칙이 없다.

추가로 **Read/Display model**(UI가 보는 것)이 Write/Storage model과 완전히 분리되어 설계되지 않았다.

---

## 1. Ground Truth — 실제 구현 상태 (2026-04-25)

### 1.1 Storage 계층

```
engine/
├── patterns/
│   ├── library.py          → HARDCODED Python dict (16개 패턴)
│   │                         ← registry-backed 아님 ⚠️
│   ├── registry.py         → JSON meta 읽기 (phase def 없음)
│   └── state_store.py      → SQLite WAL + Supabase dual-write ✅
│
├── ledger/
│   ├── store.py            → JSON files on disk (/ledger_data/{slug}/)
│   │                         ← Supabase 아님 ⚠️
│   ├── supabase_store.py   → Supabase sync 레이어 (존재하나 기본 아님)
│   └── supabase_record_store.py → capture_records Supabase
│
├── features/
│   └── materialization_store.py → SQLite (feature_materialization.sqlite)
│                                   Tables: raw_market_bar, raw_perp_metrics,
│                                           raw_orderflow_metrics, feature_windows,
│                                           pattern_events, search_corpus_signatures
│
├── runtime/
│   └── store.py            → SQLite (runtime_state.sqlite)
│
└── search/
    ├── corpus.py           → SQLite (search_corpus.sqlite)
    ├── similar.py          → 3-layer blend (A/B/C, dynamic weights) ✅
    └── quality_ledger.py   → Layer weight 동적 조정 ✅
```

### 1.2 실제 검색 아키텍처 (similar.py)

```
3-layer parallel blend (현재 구현, 올바름):

Layer A: Feature signature L1 distance
  - search_corpus_signatures vs query feature_snapshot
  - Weight default: 0.45 (quality_ledger로 동적 조정)

Layer B: Phase path LCS (Longest Common Subsequence)
  - phase_transition_events vs query phase path
  - Weight default: 0.30

Layer C: LightGBM P(win) binary probability
  - per-user model (engine/scoring/lightgbm_engine.py)
  - Weight default: 0.25
  - Graceful fallback: C가 없으면 A+B만 (0.60, 0.40)

→ weighted_score = A*0.45 + B*0.30 + C*0.25
→ top-K results
```

### 1.3 LightGBM 실제 구현 (scoring/lightgbm_engine.py)

```python
# 실제:
objective = "binary"
metric = "auc"
# per-user model, walk-forward CV
# Returns: P(win) ∈ [0, 1]

# 설계(09_RERANKER_SPEC)가 원하는 것:
objective = "lambdarank"
metric = "ndcg@5"
# Returns: candidate ranking score
```

→ **두 개가 별개 모델이고, 둘 다 필요하다.** (아래 §5에서 해결)

### 1.4 engine/rag/ 실체

```python
# engine/rag/embedding.py — 이름 오해 주의
# 실제: deterministic 256-dim structural embedding
# pgvector 없음, LLM 없음, semantic search 없음

compute_terminal_scan_embedding(signals, timeframe, data_completeness) → list[float] (256)
compute_quick_trade_embedding(params) → list[float] (256)

# 이건 RAG가 아니다.
# Semantic RAG는 아직 없고, Phase 3(뉴스 ingest 시)에 추가.
```

### 1.5 없는 것 목록

| 없는 것 | 위치 | 필요 Phase |
|---|---|---|
| engine/wiki/ 디렉토리 | engine/wiki/ | Phase 2 |
| LambdaRank reranker | engine/search/reranker/ | W-0148 이후 |
| Context assembly 규칙 | engine/agents/context.py | Phase 2 |
| Stats engine (materializ. view) | engine/stats/ | Phase 1 |
| Pattern definition versioning | engine/patterns/ | W-0160 |
| DB migration system | engine/db/migrations/ | 즉시 필요 |
| Semantic RAG (pgvector) | engine/rag/ | Phase 3 |
| Notification queue | — | Phase 1 |

---

## 2. CTO 최종 결정 — 10가지

### Decision 1: 3-layer blend를 유지한다 (설계 변경)

설계(00_MASTER §2.3)는 4-stage sequential이지만,
실제 구현(similar.py)의 **3-layer parallel blend가 더 낫다**.

이유:
- Sequential은 Stage 1에서 잘못 필터링하면 복구 불가
- Parallel blend는 각 layer가 서로 보완 (A가 약해도 B+C로 커버)
- quality_ledger로 weight 동적 조정 = 자동 개선

**CTO 결정**: 3-layer blend 유지. LambdaRank reranker는 4번째 레이어로 추가 (W-0148 이후).

```
현재:  A + B + C blend → top-K
미래:  A + B + C blend → top-20 → LambdaRank → top-5
```

### Decision 2: LightGBM 두 모델 분리

```
모델 1 (기존 유지): Binary P(win) classifier
  위치: engine/scoring/lightgbm_engine.py
  역할: 패턴 신뢰도 점수 (Layer C)
  학습: per-user + global, binary label
  사용처: Layer C weight, HUD p_win 표시

모델 2 (신규, W-0148 이후): LambdaRank Reranker
  위치: engine/search/reranker/lgbm_ranker.py
  역할: 검색 결과 상위 20개 → 5개 순위 결정
  학습: cross-user, 17 features, NDCG@5
  사용처: 검색 Stage 4 (verdict 50+ 이후 활성)
  spec: 09_RERANKER_TRAINING_SPEC.md
```

### Decision 3: Ledger → Supabase 이전 (우선순위 높음)

현재 JSON files는 Cloud Run 재시작 시 소실 위험.

```
현재: engine/ledger_data/{slug}/*.json
목표: Supabase ledger_entries + ledger_outcomes + ledger_verdicts + ledger_scores
이미 있음: ledger/supabase_record_store.py (연결 완료 필요)
우선순위: P1 (데이터 내구성 리스크)
```

### Decision 4: Pattern library → Definition versioning

현재 library.py hardcode → definition_id 없으면 ledger scope 불가.

```
현재: library.py dict (slug = unique key)
목표: Supabase pattern_objects (definition_id UUID primary key)
방법: library.py 값 → DB seeding script
     capture_records.definition_id FK 연결
선행조건: W-0156 (feature_windows) 완료 후
```

### Decision 5: engine/rag/ 이름은 유지, 명시 주석 추가

rename은 breaking change. 대신 각 파일에 명확한 docstring 추가.

```python
# engine/rag/embedding.py
"""
NAMING NOTE: This module is NOT semantic RAG.
It provides deterministic 256-dimensional structural embeddings
for terminal scan signals (8 agent groups × 6 factors).
No LLM, no pgvector, no semantic search.

For actual semantic RAG (news), see: [engine/rag/news.py - Phase 3]
"""
```

### Decision 6: Semantic RAG 추가 시점

**아직 불필요.** 트리거 조건:
- 뉴스 ingestion 기획 확정 시 (Phase 3 진입)
- 사용자 capture note가 의미 있는 양으로 쌓일 시

현재 모든 데이터는 구조적 → deterministic 임베딩이 semantic보다 정확.

### Decision 7: Migration system 도입

현재 embedded DDL (CREATE TABLE IF NOT EXISTS) → 운영 중 schema 변경 불가.

```
즉시 추가:
engine/db/
├── migrations/
│   ├── 001_pattern_objects.sql
│   ├── 002_ledger_tables.sql
│   └── ...
└── migrate.py  (alembic 또는 직접 구현)
```

### Decision 8: Stats Engine 분리 (design v3.2 §4 구현)

현재 pattern win_rate 등이 on-demand 계산 → 느리고 LLM이 직접 수치 만들 위험.

```python
# 신규: engine/stats/engine.py
class StatsEngine:
    def refresh_pattern_stats(self, pattern_id: str):
        """Deterministic SQL → Supabase pattern_stats_cache"""
        # LLM이 절대 호출 안 함
        # stats_engine만 wiki frontmatter 업데이트

# Cloud Scheduler: 매 5분 실행
```

### Decision 9: LLM Context Assembly 규칙 정의 (빠진 가장 중요한 것)

현재 LLM이 호출되는 3곳에 context 주입 규칙이 없다.

```python
# 신규: engine/agents/context.py
class ContextAssembler:
    """
    LLM 호출 시 어떤 데이터를, 어떤 순서로, 얼마나 주입하는지 정의.
    모든 LLM call은 이 클래스를 통한다.
    """

    def for_parser(self, user_id: str, symbol: str) -> ParserContext:
        return {
            "schema": COGOCHI_MD_SLICE,           # ~2K tokens (고정)
            "signal_vocab": SIGNAL_VOCAB,          # ~1K tokens (고정)
            "matched_patterns": get_top3_patterns(), # ~3K tokens (동적)
            "user_verdicts": get_recent_verdicts(user_id, n=5), # ~2K (개인화)
            "current_snapshot": get_feature_snapshot(symbol),   # ~1K (실시간)
            # Total: ~9K tokens
        }

    def for_judge(self, user_id: str, capture_id: str) -> JudgeContext:
        return {
            "schema": COGOCHI_MD_SLICE,           # §5.2 only
            "pattern_page": get_wiki_pattern(pattern_id), # stats + definition
            "user_history": get_user_pattern_history(user_id, pattern_id, n=5),
            "outcome": get_ledger_outcome(capture_id),   # 실제 price movement
            "news_summary": rag_search_at_time(capture_time),  # Layer 3 (Phase 3)
            # Total: ~8K tokens
        }

    def for_refinement(self, pattern_id: str) -> RefinementContext:
        return {
            "pattern_page": get_wiki_pattern(pattern_id),  # full page
            "recent_verdicts": get_anon_verdicts(pattern_id, k_anon=10),
            "overlap_analysis": get_pattern_overlap(pattern_id),
            # Total: ~12K tokens
        }
```

### Decision 10: Read/Display model은 Write/Storage와 완전 분리

→ 아래 §6에서 별도 설계.

---

## 3. 확정된 Storage Architecture

### 3.1 테이블별 최종 저장소

```
데이터                  저장소          이유
─────────────────────────────────────────────────────
pattern_objects         Supabase        canonical, versioned
  (slug, definition_id,  (migration 001)
   phase_conditions)

ledger_entries          Supabase        append-only, durable
ledger_scores           Supabase        (migration 002)
ledger_outcomes         Supabase
ledger_verdicts         Supabase

capture_records         Supabase ✅     이미 있음 (migration 020)
  (definition_ref_json)

pattern_stats_cache     Supabase        materialized view
  (win_rate, etc.)       (migration 021) stats_engine만 씀

user_indicator_prefs    Supabase        §17.1 신규
notification_queue      Supabase        §5 신규

wiki_pages              Supabase        §3.2 신규 (Phase 1)
wiki_links              Supabase
wiki_change_log         Supabase

episodic_sessions       Supabase        30d TTL
news_chunks             Supabase        pgvector (Phase 3)

─────────────────────────────────────────────────────
feature_windows         SQLite ✅       고속, local compute
  (materialization.sqlite) (현재 있음)

search_corpus           SQLite ✅       고속, deterministic
  (search_corpus.sqlite)   (현재 있음)

runtime_workspace_pins  SQLite ✅       ephemeral
  (runtime_state.sqlite)   (현재 있음)

pattern_runtime_states  SQLite +        hot=SQLite, cold=Supabase
  (state_machine)         Supabase ✅   (dual-write 이미 있음)

similar_runs            SQLite          search audit log
  (similar_runs.sqlite)

─────────────────────────────────────────────────────
ledger/store.py JSON    DEPRECATED      Supabase 이전 후 제거
```

### 3.2 데이터 흐름 (Write Path)

```
External:
  Binance/OKX → raw_market_bars (SQLite)
  OI/Funding  → raw_perp_metrics (SQLite)
  On-chain    → raw_onchain_metrics (SQLite)

Compute:
  raw_* → feature_windows (SQLite) ← W-0156 연결 완료 필요

Engine:
  feature_windows → pattern_runtime_states (SQLite + Supabase)
  pattern_state = actionable → ledger_entries (Supabase)
  72h elapsed → ledger_outcomes (Supabase)
  user verdict → ledger_verdicts (Supabase)

User:
  chart drag → capture_records (Supabase)
  indicator toggle → user_indicator_preferences (Supabase)

System:
  StatsEngine (cron 5m) → pattern_stats_cache (Supabase)
  WikiIngestAgent (event) → wiki_pages (Supabase)
  notification 72h → notification_queue (Supabase)
```

---

## 4. 확정된 Search Architecture

### 4.1 현재 (Phase A, 지금)

```
Query (symbol + timeframe + user context)
  ↓
Stage 1: SQL filter on feature_windows
  (symbol, timeframe, lookback window)
  → top 100-200 candidates

Stage 2: 3-layer blend
  Layer A: feature_signature L1 distance (weight: 0.45, adaptive)
  Layer B: phase path LCS (weight: 0.30, adaptive)
  Layer C: LightGBM P(win) (weight: 0.25, per-user model)
  → weighted_score → top-10

Result: [{ candidate, score, explanation }]
```

### 4.2 미래 (Phase B, verdict 50+ 이후)

```
...Stage 2 결과 top-20...

Stage 3: LambdaRank Reranker
  Input: top-20 × 17 features
  Model: engine/search/reranker/lgbm_ranker.py
  Output: NDCG-optimized top-5
  Activation: verdict_count ≥ 50 + NDCG@5 ≥ baseline+0.05

Stage 4 (optional): LLM Judge
  Input: top-3 × context (wiki page + news snippets)
  Output: natural language synthesis + final ordering
  Activation: user requests "explain" or confidence < 0.6
```

### 4.3 LightGBM 두 모델 공존

```
Model 1: Binary P(win) — Layer C
  Purpose: "이 패턴이 72h 내 win할 확률"
  Features: feature_snapshot (symbol/pattern state)
  Label: ledger_outcome.auto_verdict (HIT=1, MISS=0)
  Used in: Layer C weight in search blend

Model 2: LambdaRank — Stage 3
  Purpose: "이 search query에서 어떤 candidate가 더 좋은가"
  Features: 17 RankFeatures (09_RERANKER_SPEC)
  Label: user verdict (VALID=1, INVALID=0)
  Used in: search result reranking
```

---

## 5. LLM Integration Architecture

### 5.1 현재 LLM 호출 위치

```python
# 현재 LLM이 호출되는 곳:
engine/research/query_transformer.py    → PatternDraft 파싱 (rule-based, LLM 아님!)
engine/api/routes/cogochi.py            → /deep endpoint (있는지 확인 필요)

# 실제로 LLM 호출 없는 것 (오해하기 쉬운 이름):
engine/rag/embedding.py                 → deterministic만
engine/research/pattern_discovery_agent.py → CLI, LLM 없음
```

### 5.2 Context Assembly 규칙 (engine/agents/context.py — 신규 필요)

**Rule 1: COGOCHI.md는 항상 첫 번째로 주입**
```
모든 LLM call:
  system = COGOCHI_MD (§1-§6, §9, §16 — ~4K tokens)
  + task-specific context (아래)
```

**Rule 2: Parser call context (< 10K tokens)**
```python
{
  "system": COGOCHI_MD_CORE,          # 4K — 항상 고정
  "pattern_matches": top3_patterns,  # 3K — PatternDraft 후보
  "user_recent_verdicts": last5,     # 2K — 개인화
  "current_snapshot": snapshot,      # 1K — 현재 상태
  # Total: ~10K
}
```

**Rule 3: Judge call context (< 12K tokens)**
```python
{
  "system": COGOCHI_MD_JUDGE_SECTION, # 2K (§5.2만)
  "pattern_wiki_page": wiki_page,     # 4K — 정의+통계
  "user_pattern_history": last5,      # 3K — 본인 이력
  "outcome_data": movement_summary,   # 1K — 실제 결과
  "news_at_time": news_snippets,      # 2K — Phase 3 추가
  # Total: ~12K
}
```

**Rule 4: LLM은 frontmatter 수치를 생성하지 않는다**
```python
# 금지:
llm.generate("PTB_REVERSAL의 승률을 계산해줘")

# 허용:
stats = stats_engine.compute_pattern_stats("PTB_REVERSAL")
llm.generate(f"이 통계를 해석해줘: {stats}")
```

**Rule 5: 동일 context로 같은 날 3회 이상 호출 금지 (cost spike 방지)**
```python
# episodic_sessions에서 중복 감지
# 같은 session_id + pattern_id = 캐시 반환
```

---

## 6. Read/Display Architecture (별도 설계)

### 6.1 Write와 Read는 완전히 다른 문제

```
Write (Storage):                  Read (Display):
  목적: 정확하게 저장                목적: 빠르게 보여주기
  특성: append-only, durable       특성: 집계, 필터, 캐시
  소유: engine/                    소유: app/src/routes/api/
  shape: normalized DB rows        shape: UI에 맞는 aggregated payload
```

### 6.2 현재 Read path 문제

```
터미널 화면 1개 로드 = API call 7+ 번:
  /api/market/ohlcv      (Binance direct)
  /api/market/oi         (Coinalyze)
  /api/market/funding    (Coinalyze)
  /api/cogochi/analyze   (engine /deep)
  /api/patterns/states   (engine /patterns)
  /api/cogochi/alerts    (engine /scanner)
  /api/user/captures     (Supabase)
```

### 6.3 목표 Read Architecture

```
터미널 = GET /api/v2/workspace/{symbol}/{timeframe}

→ WorkspacePayload (단일 응답):
{
  // Chart (external, cache 1m)
  ohlcv: Bar[],

  // Analysis (engine, cache 30s)
  pattern_states: PatternState[],    // 현재 phase
  active_alerts: Alert[],            // 스캐너
  p_win: number | null,              // LightGBM

  // Market context (external, cache 5m)
  oi_snapshot: OIData,
  funding_snapshot: FundingData,

  // User data (Supabase direct, cache 5s)
  recent_captures: Capture[],        // 최근 저장
  pending_verdicts: Verdict[],       // 판정 대기
}
```

### 6.4 화면별 Read Model 정의

| 화면 | 데이터 소스 | Payload | Cache |
|---|---|---|---|
| 터미널 메인 | engine + external + Supabase | WorkspacePayload | 30s |
| 패턴 검색 | engine/search + Supabase | SearchResult[] | 1m |
| Verdict Inbox | Supabase + engine/ledger | InboxItem[] | 5s |
| 내 통계 | Supabase pattern_stats_cache | UserStatsPayload | 5m |
| 패턴 위키 | Supabase wiki_pages + stats | WikiPatternPage | 10m |
| 캡처 히스토리 | Supabase capture_records | CaptureList | 30s |
| 인디케이터 설정 | Supabase user_indicator_prefs | IndicatorPrefs | 1h |

### 6.5 Pre-computed vs On-demand

```
Pre-computed (stats_engine, 주기적):
  - pattern_stats_cache (win_rate, occurrence_count) ← 5분마다
  - user_pattern_stats (개인 통계) ← verdict 제출 시
  - wiki_pages frontmatter ← stats_engine 실행 후

On-demand (실시간):
  - OHLCV, OI, funding (외부 API)
  - pattern_runtime_states (in-memory, fast)
  - 검색 결과 (search/similar.py, fast)

Never on-demand:
  - 통계 수치 (LLM 금지, stats_engine만)
```

---

## 7. Implementation Queue (우선순위 순)

### P0 — 지금 당장 (데이터 내구성 리스크)

```
① Ledger → Supabase 이전
  파일: engine/ledger/store.py 수정
       engine/ledger/supabase_store.py 완성
  이유: JSON files는 Cloud Run 재시작 시 소실
  예상: 3일

② DB Migration system 도입
  파일: engine/db/migrations/*.sql
        engine/db/migrate.py
  이유: schema 변경 관리 불가
  예상: 1일
```

### P1 — 이번 주 (핵심 기능)

```
③ W-0156: Feature compute → feature_windows 연결 완성
  파일: engine/features/materialization.py
  이유: Layer A 검색이 재계산 없이 materialized 사용
  예상: 2일

④ engine/rag/embedding.py docstring 추가
  파일: engine/rag/embedding.py 첫 줄
  이유: 이름 오해 방지 (10분)
  예상: 10분

⑤ Pattern Stats Engine 최소 구현
  파일: engine/stats/engine.py (신규)
        stats refresh job
  이유: pattern_stats_cache 없으면 Wiki 불가
  예상: 2일
```

### P2 — Phase 2 (LLM 기능)

```
⑥ engine/agents/context.py (Context Assembly)
  이유: LLM 호출 규칙 없으면 cost spike + drift
  예상: 2일

⑦ engine/wiki/ 디렉토리 + WikiIngestAgent
  이유: COGOCHI.md schema 기반 wiki 구현
  예상: 5일(§18.6 spec 참조)

⑧ Pattern definition versioning (W-0160)
  이유: definition_id 없으면 ledger scope 불가
  예상: 3일
```

### P3 — Phase 3 이후 (데이터 축적 후)

```
⑨ LambdaRank Reranker (09_RERANKER_SPEC)
  선행조건: user verdict ≥ 50
  예상: 6일

⑩ Semantic RAG (news_chunks + pgvector)
  선행조건: 뉴스 ingestion 기획 확정
  예상: 5일

⑪ Read/Display BFF endpoint
  /api/v2/workspace/{symbol}/{tf}
  예상: 3일
```

---

## 8. 설계 문서 vs 현실 최종 대조표

| 설계 문서 주장 | 현실 | CTO 결정 |
|---|---|---|
| 4-stage sequential search | 3-layer parallel blend 구현됨 | ✅ 현실이 더 좋음, 유지 |
| LambdaRank reranker | Binary P(win) classifier | ✅ 둘 다 필요, 병행 |
| Ledger = Postgres | JSON files | 🔴 Supabase 이전 (P0) |
| Pattern = registry-backed | Hardcoded Python | 🟡 definition versioning (P2) |
| LLM Wiki 구현 | 없음 | 🟡 Phase 2 (§18 spec) |
| RAG = news 전용 | engine/rag/ = deterministic embedding | ✅ 일치, docstring 추가 |
| Stats engine 분리 | on-demand 계산 | 🔴 신규 필요 (P1) |
| Context assembly 규칙 | 없음 | 🔴 신규 필요 (P2) |
| Read/Display model | 없음 | 🟡 P3 BFF endpoint |
| DB migration system | 없음 (embedded DDL) | 🔴 즉시 필요 (P0) |

---

## 9. 한 줄 결론

> **실제 구현(3-layer blend, dual-write state machine, quality ledger)은 설계보다 앞선 부분이 있고,
> 핵심 갭 3개(Ledger→Supabase, Stats Engine, Context Assembly)를 먼저 해결해야
> LLM Wiki와 LambdaRank가 올바르게 올라갈 수 있다.
> Read/Display model은 Write와 완전히 분리해서 설계한다.**

---

*CTO Data Architecture Reality v1.0 | 2026-04-25 | 설계 00-10 + 실제 codebase 비교 final*
