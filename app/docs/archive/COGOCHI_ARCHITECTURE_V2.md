# Cogochi Architecture v2

> Last updated: 2026-04-13
> Authors: CTO / AI Researcher

---

## Product Definition

**Cogochi는 트레이더가 발견한 차트 구간을 PatternSeed로 저장하고, AutoResearch가 이를 PatternObject로 구조화하며, Scanner가 시장 전체에서 다시 찾고, Ledger가 결과를 검증해 개인 패턴 자산으로 축적하는 3-엔진 운영 시스템이다.**

LLM은 코어가 아니라 패턴 메모리를 강화하는 내부 두뇌다.

---

## Core Loop

```
Chart Segment → Capture → AutoResearch → PatternObject
                                             ↓
                                         Scanner
                                             ↓
                                   PatternMatchCandidate
                                             ↓
                                          Ledger
                                             ↓
                                   VerdictRecord + Stats
                                             ↓
                                       Memory Wiki
                                             ↓
                                  Personal Pattern Library
```

---

## User Flow (7 Steps)

| Step | Name | Action |
|------|------|--------|
| 1 | **Find** | 유저가 차트에서 의미 있는 급등/급락 구간 발견 |
| 2 | **Capture** | 봉/구간 선택 → 심볼, TF, 시점 캡처 → PatternSeed 생성 |
| 3 | **Analyze** | AutoResearch가 전후 맥락 자동 분석 (OI, FR, Vol, 가격구조) |
| 4 | **Propose** | 시스템이 패턴 후보 제안 (phase/state, 핵심 조건, 유사 사례 Top N) |
| 5 | **Confirm** | 유저가 후보 선택 / 수정 / 새 패턴으로 저장 |
| 6 | **Scan** | Scanner가 시장 전체에서 해당 패턴 지속 탐색 |
| 7 | **Validate** | 결과 기록 (hit/miss/expired), 취향 반영 누적 |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      App Layer (SvelteKit)                   │
│  /terminal         /lab              /memory (/graph)        │
│  Capture + Chart   Verdict + Refine  Pattern Asset View      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                        API Layer                             │
│  SvelteKit API Routes (/api/engine/* proxy)                  │
│  WebSocket Gateway (live prices, order book)                 │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                   Core Engine (FastAPI)                      │
│                                                              │
│  Capture Service    AutoResearch Engine    Pattern Library   │
│  (seed 생성)        (패턴 구조화)           (slug→Object)     │
│                                                              │
│  State Machine Scanner    Verdict Ledger    Refinement Eng   │
│  (phase tracking)         (hit/miss/stats)  (threshold 조정) │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                      Memory Layer                            │
│  Pattern Wiki (markdown + LLM compile)                       │
│  Graph Index (similarity links)                              │
│  NL Search (자연어 질의)                                      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
│  Market Cache         Pattern DB          Ledger DB          │
│  (klines/OI/funding)  (seeds+objects)     (outcomes+verdicts)│
│                       Object Store (screenshots/reports)     │
└──────────────────────────────────────────────────────────────┘
```

---

## 3-Engine Detail

### Engine A: AutoResearch

**역할**: 저장된 구간 → 패턴 후보 생성

```
Input:  PatternSeed { symbol, timeframe, window, note, tags }

Pipeline:
  1. Context Fetch
     klines[-48h : +24h], OI history, funding history
     volume + taker buy ratio, onchain snapshot

  2. Feature Extraction
     price structure (HH/HL/LL/LH)
     OI pattern (spike / hold / decline)
     funding sequence (extreme → flip)
     volume pattern (dryup → surge)
     regime (BTC trend at capture)

  3. Phase Inference (LLM-assisted, Claude)
     feature timeline → phase sequence → PhaseDefinition[]
     match score vs existing patterns in library

  4. Similarity Search
     embed feature vector → cosine search vs ledger
     top-N similar cases returned

Output: PatternProposal {
  best_match_slug, match_score
  proposed_phases[], key_conditions[]
  similar_cases: CaseRef[], confidence
}
```

**Module**: `engine/autoresearch/`

---

### Engine B: Scanner (기존 확장)

**역할**: 활성 PatternObject → 시장 전체 재탐색

현재 구현: PatternStateMachine (phase tracking per symbol) ✅

추가 예정:
- Dynamic Universe (CMC top 50 + watchlist)
- Sequence Similarity Score (feature vector distance per phase, soft matching)
- Multi-TF Scanner (15m / 1h / 4h 병렬, confluence 점수)
- Alert Routing (in-app, Telegram webhook, email digest)

---

### Engine C: Ledger (기존 확장)

**역할**: 결과 기록 → 통계 → Refinement 근거

현재 구현: LedgerStore (JSON-based) ✅

추가 예정:
- Auto-close Logic (entry_price at ACCUM entry, evaluate +72h)
- RefinementSuggestion (LLM이 ledger 데이터 기반 threshold 제안)
- Regime-aware Stats (BTC trend at entry)
- DB Migration (JSON → SQLite → PostgreSQL)

---

## Screen Structure

### `/terminal` — Capture 중심
**핵심 질문**: 이 구간을 패턴으로 저장할 가치가 있는가?

```
메인 차트
보조 지표 패널 (OI, funding, volume, RSI)
Save Setup 버튼
  → AI Pattern Proposal 카드 (AutoResearch 결과)
  → Similar Cases Top N
```

### `/lab` — Verdict 중심
**핵심 질문**: 이 패턴이 진짜 쓸모 있는가, 어떻게 더 정확하게 만들까?

```
Pattern Detail
Phase Timeline (FAKE_DUMP → ARCH → REAL_DUMP → ACCUM → BREAKOUT)
Verdict Ledger (hit/miss/expired 기록)
Similarity Comparison Table
Refinement Controls (threshold 조정)
```

### `/memory` (또는 `/graph`) — Asset 중심
**핵심 질문**: 나는 어떤 패턴에 강한 사람인가?

```
Personal Pattern Library
Cluster / Graph (유사도 기반 군집)
Hit Rate by Pattern
Market Regime Overlay
NL Search
```

---

## Data Models

### PatternSeed
```python
@dataclass
class PatternSeed:
    id: str                     # uuid[:8]
    user_id: str | None
    symbol: str                 # "BTCUSDT"
    timeframe: str              # "1h"
    capture_ts: datetime
    window_start: datetime | None
    window_end: datetime | None
    user_note: str | None
    user_tags: list[str]
    screenshot_uri: str | None
    raw_features: dict          # feature snapshot at capture time
    status: str                 # pending / analyzed / archived
```

### PatternObject
```python
@dataclass
class PatternObject:
    id: str
    slug: str                   # unique, URL-safe
    base_seed_id: str | None
    user_id: str | None
    name: str
    summary: str
    core_hypothesis: str
    phases: list[PhaseDefinition]
    entry_phase: str
    target_phase: str
    timeframe: str
    required_blocks: list[str]
    optional_blocks: list[str]
    disqualifiers: list[str]
    similarity_spec: dict
    status: str                 # draft / active / archived
    version: int
```

### PatternProposal
```python
@dataclass
class PatternProposal:
    seed_id: str
    best_match_slug: str | None
    match_score: float          # 0.0 – 1.0
    proposed_phases: list[dict]
    key_conditions: list[str]
    similar_cases: list[dict]
    confidence: str             # high / medium / low
    explanation: str            # LLM natural language explanation
    created_at: datetime
```

### VerdictRecord
```python
@dataclass
class VerdictRecord:
    id: str
    pattern_id: str
    symbol: str
    entry_phase: str
    entry_ts: datetime | None
    entry_price: float | None
    peak_price: float | None
    max_gain_pct: float | None
    verdict: str                # hit / miss / expired / pending
    market_regime: str          # bull / bear / sideways
    user_override: str | None   # valid / invalid / missed
    user_note: str | None
    features_at_entry: dict
```

---

## API Specification

### Capture API
```
POST /capture/seed
  Body: { symbol, timeframe, window_start, window_end, note, tags }
  Response: { seed_id, status: "queued" }

GET  /capture/{seed_id}
  Response: PatternSeed + analysis_status

POST /capture/{seed_id}/analyze     ← triggers AutoResearch (SSE)
  Response: stream of PatternProposal events
```

### AutoResearch API
```
POST /autoresearch/analyze
  Body: { seed_id }
  Response: SSE stream → PatternProposal

GET  /autoresearch/{seed_id}/proposal
  Response: PatternProposal (cached)

POST /autoresearch/{seed_id}/confirm
  Body: { accepted_phases, modifications }
  Response: PatternObject (newly created or updated)
```

### Pattern API
```
GET  /patterns/library            → PatternObject[]
POST /patterns                    → create PatternObject
GET  /patterns/{slug}             → PatternObject + stats
PATCH /patterns/{slug}            → refinement update
GET  /patterns/{slug}/candidates  → PatternMatchCandidate[] (active)
GET  /patterns/{slug}/similar-cases?limit=5&min_score=0.7
POST /patterns/{slug}/verdict     → set user_verdict on outcome
GET  /patterns/states             → { slug: { symbol: PhaseState } }
GET  /patterns/candidates         → all entry candidates
POST /patterns/scan               → trigger full universe scan
```

### Ledger API
```
GET  /ledger/{slug}/outcomes?status=pending
PATCH /ledger/{slug}/outcomes/{id}   Body: { user_override, note }
GET  /ledger/{slug}/stats            → PatternStats (hit_rate, avg_gain, regime)
GET  /ledger/{slug}/refinement-suggestions  → RefinementSuggestion[]
```

### Memory API
```
GET  /memory/search?q=OI+reversal&limit=10  → WikiPage[]
GET  /memory/graph                           → { nodes, edges }
GET  /memory/cluster?user_id=...             → PatternCluster[]
POST /memory/compile                         → trigger wiki recompile
```

---

## Memory Wiki Structure (Karpathy-style)

```
engine/memory/
├── raw/                    # 원본 참고용 (SSOT 아님)
│   ├── seeds/              # PatternSeed JSON exports
│   ├── screenshots/        # chart captures
│   └── notes/              # user free-text
│
├── wiki/                   # LLM이 유지하는 structured knowledge
│   ├── patterns/
│   │   ├── tradoor-oi-reversal-v1.md
│   │   └── _index.md
│   ├── cases/
│   │   ├── btcusdt-2024-11-15-hit.md
│   │   └── ethusdt-2024-12-01-miss.md
│   ├── concepts/
│   │   ├── oi-reversal.md
│   │   └── funding-flip.md
│   ├── regimes/
│   │   ├── bull-market.md
│   │   └── bear-market.md
│   ├── failures/
│   │   └── common-miss-conditions.md
│   ├── _graph.json         # similarity links (cosine > 0.65)
│   ├── _index.md           # auto-maintained master index
│   └── _log.md             # LLM compile log
│
└── schema/
    ├── wiki_schema.md      # LLM wiki 유지 규칙
    └── compile_prompt.md   # AutoResearch wiki compile 프롬프트
```

**Wiki Rules** (SSOT는 항상 DB):
1. wiki는 DB에서 파생 — 직접 수정하지 말 것
2. 각 패턴 페이지: Summary / Core Hypothesis / Phase Structure / Key Conditions / Stats / Related / Cases
3. 실패 케이스는 `failures/` 에도 backlink
4. `_graph.json`은 cosine similarity > 0.65 링크만

---

## Natural Language Search Architecture

```
Query (자연어)
    ↓
Query Router
    ├── Structured (fast)   → DB query (regex + filter)
    │   "ACCUMULATION phase 목록"
    ├── Wiki Search (medium) → BM25 over wiki/*.md
    │   "OI reversal 실패 원인"
    └── LLM Analysis (slow)  → LLM reads wiki pages + ledger stats
        "내가 강한 패턴 군집은?"
    ↓
Rendered Response (table / chart / card / text)
```

구현 원칙: fancy RAG 없이 `_index.md` + BM25 + LLM context window로 충분.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit 2.x + Svelte 5, lightweight-charts v5, D3.js |
| Backend | FastAPI (Python 3.12), Pydantic v2, APScheduler |
| LLM | Claude 3.5 Sonnet (AutoResearch, NL search, wiki compile) |
| Embedding | text-embedding-3-small or voyage-3 (similarity search) |
| Storage | SQLite (dev) → PostgreSQL + Supabase (prod) |
| Object Store | Supabase Storage (screenshots, reports) |
| Search | BM25 (wiki) + pgvector (similarity) |
| Market Data | Binance FAPI (free), CoinGlass (optional), Glassnode (optional) |

---

## Product Principles

1. **SSOT는 엔진 데이터 구조** — wiki/요약/자연어는 파생물
2. **Capture가 항상 시작점** — 저장 없이는 자산이 안 쌓임
3. **Verdict가 반드시 닫혀야 함** — 검증 없는 알림은 해자가 안 됨
4. **Human-in-the-loop** — 시스템은 후보 제안, 유저가 승인/수정
5. **외부 메시지는 단순, 내부 엔진은 복잡**

---

## Implementation Milestones

| Phase | Goal | Key Deliverable |
|-------|------|-----------------|
| M1 ✅ | Pattern Scanner 동작 | `/patterns` 대시보드 |
| **M2** | AutoResearch 파이프라인 | Save → Propose 루프 |
| M3 | Ledger + Verdict UI | `/lab` 완성 |
| M4 | Memory Wiki | `/memory` + NL 검색 |
| M5 | Similarity Search | Similar Cases Top N |
| M6 | DB 마이그레이션 | JSON → PostgreSQL |
| M7 | Multi-user | user_id 분리 + Supabase Auth |

---

## Sprint 3 Scope (AutoResearch Pipeline)

```
engine/autoresearch/
  __init__.py
  types.py          ← PatternSeed, PatternProposal
  pipeline.py       ← analyze_seed() main orchestrator
  context_fetcher.py ← fetch klines/OI/funding around window
  feature_timeline.py ← build feature timeline from raw data
  phase_proposer.py ← Claude-assisted phase inference
  similarity.py     ← cosine search vs existing patterns/ledger

engine/api/routes/autoresearch.py ← SSE endpoint

app/src/routes/api/autoresearch/+server.ts ← SvelteKit proxy
app/src/components/terminal/workspace/PatternProposalCard.svelte
```
