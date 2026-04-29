# COGOCHI v3.0 — Master Design Set

**작성:** AI Researcher / CTO
**버전:** 2026-04-25 v3.0
**상태:** Canonical (이전 모든 cogochi-unified-design* 문서 대체)

---

## 문서 읽는 순서

| # | 파일 | 읽는 대상 | 분량 |
|---|---|---|---|
| 00 | `00_MASTER_ARCHITECTURE.md` | 전원 (시작점) | 8min |
| 01 | `01_PATTERN_OBJECT_MODEL.md` | Engine / Research agent | 12min |
| 02 | `02_ENGINE_RUNTIME.md` | Engine agent | 15min |
| 03 | `03_SEARCH_ENGINE.md` | Research agent | 15min |
| 04 | `04_AI_AGENT_LAYER.md` | Research / App agent | 12min |
| 05 | `05_VISUALIZATION_ENGINE.md` | App / Frontend agent | 12min |
| 06 | `06_DATA_CONTRACTS.md` | Contract agent / 전원 참조 | 10min |
| 07 | `07_IMPLEMENTATION_ROADMAP.md` | CTO / PM / 전원 | 10min |

총 ~90min 독서.

---

## 이 문서의 목적

지난 여러 문서가 조각조각 진화했다. 한 화면에 무엇을 보여줄지부터, AI가 어디까지 판단할지, sequence matcher가 어떻게 동작할지, 검색 엔진이 어떤 구조여야 할지까지 — 각 주제가 별도 문서로 흩어져 있었다.

이 set은:

1. **단일 canonical source**
2. **구현 현실과 설계 목표 분리**
3. **AI agent 역할 범위 엄격 명시**
4. **검증 가능한 kill criteria 포함**

---

## 핵심 합의 7가지

### 1. 제품 카테고리 확정

> **Pattern Research Operating System (Trader Memory OS)**

대중형 차트 툴 아님. 고급 트레이더 + 팀/데스크용.

### 2. AI는 의미 번역기 (판단자 아님)

```
AI = 자연어 → 구조화 JSON
엔진 = 구조 → 검색 → 결과 → 재학습
```

### 3. 4-단계 검색

```
Intent → Candidate (SQL) → Sequence (edit distance) → Rerank (LightGBM) → [Judge (LLM)]
```

단일 벡터검색이나 단일 LLM으로 끝나면 정확도 불가능.

### 4. Durable state > Speed

현재 in-memory state machine은 재시작 시 phase path 소실. Postgres-backed state plane이 Slice 2.

### 5. 6 Intent × 6 Template

```
WHY → event_focus       | STATE → state_view
COMPARE → compare_view  | SEARCH → scan_grid
FLOW → flow_view        | EXECUTION → execution_view
```

한 화면 = 하나의 template. 강조 1개, 보조 2개.

### 6. 4 Plane 분리

```
Chart     = market truth
Right HUD = decision state
Bottom    = evidence + compare + ledger + refinement
AI panel  = research copilot
```

### 7. Rule-first, ML-later

Fine-tuning은 200+ verdict 이후. Day-1은 rule + state machine + ledger.

---

## 전체 아키텍처 한눈에

```
┌─────────────────────────────────────────────────────────────────────┐
│ User (terminal / lab / dashboard)                                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Intent          │  │ Visualization   │  │ Capture         │
│ Classifier (LLM)│  │ Config Builder  │  │ (Save Setup)    │
└────────┬────────┘  └─────────────────┘  └────────┬────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────┐                       ┌─────────────────┐
│ Parser (LLM)    │                       │ Pattern         │
│ natural→Draft   │                       │ Candidate Review│
└────────┬────────┘                       └────────┬────────┘
         │                                         │
         ▼                                         ▼
┌─────────────────┐                       ┌─────────────────┐
│ Query           │                       │ Pattern Object  │
│ Transformer     │                       │ Registry        │
│ (deterministic) │                       │ (versioned)     │
└────────┬────────┘                       └────────┬────────┘
         │                                         │
         └───────────────────┬─────────────────────┘
                             │
                             ▼
                   ┌───────────────────┐
                   │ State Machine     │
                   │ (durable Postgres)│
                   └─────────┬─────────┘
                             │
                             ▼
                   ┌───────────────────┐
                   │ Scanner           │
                   │ (tier-based)      │
                   └─────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Search        │   │ Ledger        │   │ Alert         │
│ (4 stages)    │   │ (4 tables)    │   │ Pipeline      │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────┬─────────┴─────────┬─────────┘
                  │                   │
                  ▼                   ▼
         ┌────────────────┐  ┌────────────────┐
         │ Reranker       │  │ Refinement     │
         │ (LightGBM)     │  │ Engine         │
         └────────┬───────┘  └────────┬───────┘
                  │                   │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Personal Variant │
                  │ / Fine-tune      │
                  │ (Phase 2+)       │
                  └──────────────────┘
```

---

## 무엇이 새로 추가되었나

이전 문서 대비 변경점:

### 추가
- **Intent → Template → Highlight → Chart Config** 명시적 파이프라인 (§05)
- **4-stage search** 공식화 with 성능 예산 (§03)
- **AI agent 역할 경계** 엄격 명시 (§04)
- **Split ledger** 4 테이블 설계 (§02 §4)
- **Durable state plane** migration plan (§02)
- **Benchmark pack** infrastructure (§03 §9)
- **Signal vocabulary** single source (§01 §2)
- **Resizable split-pane layout** IDE-style (§05 §6)

### 정리
- Hardcoded `library.py` → `pattern_objects` registry (§01 §9)
- JSON ledger → 4 split tables (§02 §4)
- Free-form floating canvas (최근 시도) 폐기 → split-pane 확정

### 보강
- Kill criteria 정량화 (§07 §5)
- 슬라이스 parallelism 규칙 (§07 §4)
- Cost model per-user (§04 §10, §07 §5.3)

---

## 비-목표 (명시)

- TradingView parity
- Signal service (판단 자동화 판매)
- 대중형 SaaS
- 자동 매매 실행 (Phase 3 별도 track)
- End-to-end deep learning on raw bars
- Real-time sub-second scan latency (tier 1만 1min)
- LLM이 ledger verdict를 직접 기록
- 자유 서술 AI 출력 (모두 structured)

---

## 관련 기존 문서

보존하되 이 set이 canonical:

- `cogochi_pattern_engine.docx.md` (비즈니스 narrative, 유지)
- `pattern-engine-runtime.md` (overlap, 이 set으로 대체)
- `core-loop.md`, `core-loop-system-spec.md` (overlap, 이 set으로 대체)
- `multi-timeframe-autoresearch-search.md` (Slice 11 근거, 유지)
- `refinement-methodology.md` (Slice 8 근거, 유지)
- `indicator-visual-design.md` (§05에서 참조)
- `multi-agent-execution-control-plane.md` (§07 §9에서 참조)

---

## 다음 행동

1. **이 set 리뷰 미팅** (engineer + CTO + PM) — 30분
2. **Slice 1 kick-off** — contract cleanup
3. **Slice 2, 3 병행 착수** — durable state + parser

Deadline 없음. Slice별 gate + kill criteria 있음.

---

## Document Status

| Doc | Status | Owner | Last Updated |
|---|---|---|---|
| 00 | canonical | CTO | 2026-04-25 |
| 01 | canonical | Engine | 2026-04-25 |
| 02 | canonical | Engine | 2026-04-25 |
| 03 | canonical | Research | 2026-04-25 |
| 04 | canonical | Research | 2026-04-25 |
| 05 | canonical | App | 2026-04-25 |
| 06 | canonical | Contract | 2026-04-25 |
| 07 | canonical | CTO | 2026-04-25 |

변경 시 semver bump + changelog 추가.
