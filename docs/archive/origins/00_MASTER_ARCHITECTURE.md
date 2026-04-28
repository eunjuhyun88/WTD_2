# COGOCHI — Master Architecture & Design Specification

**Version:** v3.0 (2026-04-25)
**Authors:** AI Researcher / CTO
**Status:** Canonical
**Supersedes:** 모든 `cogochi-unified-design*`, `architecture-v2-draft`, `pattern-engine-runtime` 개별 문서

---

## 0. 문서 구성

이 마스터 문서는 7개 하위 설계로 쪼개진다. 각 문서는 단일 책임이다.

| # | 문서 | 책임 |
|---|---|---|
| 00 | `00_MASTER_ARCHITECTURE.md` | 전체 합의, 용어, 아키텍처 원칙 (본 문서) |
| 01 | `01_PATTERN_OBJECT_MODEL.md` | Pattern / Phase / Signal / Feature 객체 계약 |
| 02 | `02_ENGINE_RUNTIME.md` | State Machine, Scanner, Ledger 실행 계층 |
| 03 | `03_SEARCH_ENGINE.md` | Candidate → Sequence → Rerank → Judge 4단 검색 |
| 04 | `04_AI_AGENT_LAYER.md` | Parser / Interpreter / Orchestrator 역할과 범위 |
| 05 | `05_VISUALIZATION_ENGINE.md` | Intent → Template → Highlight → Chart Config |
| 06 | `06_DATA_CONTRACTS.md` | API, DB 스키마, 라우트 계약 |
| 07 | `07_IMPLEMENTATION_ROADMAP.md` | 슬라이스 우선순위와 킬 기준 |

---

## 1. 제품 정의 (이게 전부다)

### 1.1 한 줄 정의

> **트레이더의 감각을 패턴 객체로 저장하고, 그 패턴을 시장 전체에서 상태기계로 추적하고, 결과 ledger로 검증해, 최종적으로 실행 가능한 시그널로 승격시키는 엔진.**

### 1.2 카테고리 확정

- ❌ AI 차트 분석 툴
- ❌ TradingView / CoinGlass 대체
- ❌ 범용 스크리너
- ✅ **Pattern Research Operating System (Trader Memory OS)**

### 1.3 Non-Goals

- 초보자용 "AI가 알려주는 매매"
- 대중형 소셜/카피트레이딩
- 뉴스/센티먼트 독립 제품
- 자동매매 실행 (Phase 2+ 별도 레인)
- TradingView 피쳐 parity

### 1.4 사업성 판단 (냉정)

- 대중형 SaaS: **약함** [evidence: CoinGlass/Hyblock/TrendSpider 이미 데이터 터미널 포화]
- 고급 개인 트레이더: **강함** (ARPU $30-$100, niche)
- 팀/데스크 워크스페이스: **가장 강함** (ARPU $200-$1000+, retention 우월)
- 엔진 marketplace upstream (Cogochi L1): **Phase 3 이상**

핵심 해자:
1. 유저 judgment ledger — 복제 불가
2. 팀 공용 pattern library — lock-in
3. 수동 레이블 → fine-tune 훈련 자산

---

## 2. 핵심 설계 원칙 (위반 시 망함)

### 2.1 의미와 검증을 분리한다

```
AI = 의미 번역기 (사람 문장 → 구조화 JSON)
엔진 = 시장 검증기 (구조 → 검색 → 결과 → 재학습)
```

AI는 parser 역할만. 점수 판단, phase 판정, 유사도 최종 결정은 엔진이 한다.
이 분리가 깨지면 "그럴듯한 설명"만 하는 제품이 된다.

### 2.2 Rule-first, ML-later

- 1차: rules + state machine + ledger (필수)
- 2차: sequence matcher (필수)
- 3차: LightGBM ranker (데이터 누적 후)
- 4차: LLM judge (선택적 검증)
- 5차: fine-tuning (100+ verdict 이후)

ML이 앞서면 해석 불가능한 블랙박스가 된다. 먼저 결정론적 파이프라인을 닫는다.

### 2.3 검색은 4단이다

```
User Query
  → Intent Classification           (WHY/STATE/COMPARE/SEARCH/FLOW/EXECUTION)
  → Candidate Generation (SQL filter)    top 100-500
  → Sequence Matching (phase path)       top 20-50
  → Reranker (LightGBM + rules)          top 5-10
  → [Optional] LLM Judge                 top 3-5
```

단일 벡터검색이나 단일 LLM으로 끝내면 정확도 못 만든다.

### 2.4 상태는 durable해야 한다

현재 구현 문제:
- `engine/patterns/state_machine.py`가 in-memory singleton
- 프로세스 재시작 시 phase path 소실
- 멀티 인스턴스 시 divergence

해결: Postgres-backed state plane + scan cycle idempotent.

### 2.5 Save Setup은 canonical capture event다

버튼이 아니라 훈련 데이터 생산 장치다. 저장 순간:
- chart snapshot
- feature snapshot (92 columns)
- phase path
- user note + tags
- trade plan
전부 원자적으로 저장된다.

### 2.6 위계가 화면이다

```
차트      = market truth (raw 관측)
오른쪽    = decision HUD (state machine 요약)
하단      = evidence + compare + ledger + refinement (검증)
AI 패널   = research copilot (해석/비교/서사)
```

한 화면에 4개가 다 1순위처럼 소리치면 망한다.

### 2.7 Visualization은 intent 기반이다

데이터를 다 그리는 게 아니라, 유저 질문의 목적에 맞는 템플릿을 선택한다.

```
User Query → Intent Classifier → Visualization Template → Highlight Planner → Chart Config
```

6 intent × 6 template. 자세한 건 `05_VISUALIZATION_ENGINE.md`.

---

## 3. 7-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ L7. Human/AI Refinement Plane                                    │
│     verdict, threshold suggestion, personal variant, fine-tune   │
├─────────────────────────────────────────────────────────────────┤
│ L6. Result Ledger Plane                                          │
│     entry, score, outcome, verdict, training projection          │
├─────────────────────────────────────────────────────────────────┤
│ L5. Search / Research Plane                                      │
│     candidate gen → sequence match → rerank → judge              │
├─────────────────────────────────────────────────────────────────┤
│ L4. State Machine Plane (durable)                                │
│     phase tracking, phase_path, transition events                │
├─────────────────────────────────────────────────────────────────┤
│ L3. Pattern Object Plane                                         │
│     PatternObject, PhaseDef, SignalVocabulary, TradePlan         │
├─────────────────────────────────────────────────────────────────┤
│ L2. Feature Plane                                                │
│     92 columns × 300 symbols × multi-timeframe                   │
├─────────────────────────────────────────────────────────────────┤
│ L1. Market Data Plane                                            │
│     OHLCV, OI, funding, L/S, liquidation, CVD, on-chain          │
└─────────────────────────────────────────────────────────────────┘
```

각 플레인은 **단방향 데이터 흐름**을 지킨다. L4가 L6을 직접 변경하지 않고 event를 발행한다.

---

## 4. 현재 구현 상태 (솔직 평가)

| Plane | 구현 | 상태 | 주요 갭 |
|---|---|---|---|
| L1 Market Data | ✅ | done | multi-exchange 확장 필요 |
| L2 Feature | ✅ | done (28~92 cols) | 일부 feature 재계산 변동 |
| L3 Pattern Object | ⚠️ | hardcoded library | registry-backed 아님 |
| L4 State Machine | ⚠️ | in-memory only | **durable 필요** |
| L5 Search | ⚠️ | similarity + sequence 부분 | **reranker 미구현** |
| L6 Ledger | ⚠️ | JSON shadow | split (entry/score/outcome/verdict) 필요 |
| L7 Refinement | ❌ | ML shadow scoring만 | **verdict loop 미완성** |

추가 갭:
- AI parser 스키마는 문서상 있으나 실제 endpoint 없음
- Visualization intent routing 없음 (현재 차트가 모든 정보 동시 표시)
- Multi-agent orchestrator는 control plane만 존재 (research agent 실행 경로 없음)

---

## 5. 6 Intent × 6 Template 매트릭스

`05_VISUALIZATION_ENGINE.md`의 요약:

| Intent | Template | Primary highlight | Secondary |
|---|---|---|---|
| WHY | event_focus | dump candle | OI spike, funding flip |
| STATE | state_view | phase zone | higher lows, OI hold |
| COMPARE | compare_view | current vs reference | phase path diff |
| SEARCH | scan_grid | candidate tiles | similarity score |
| FLOW | flow_view | OI panel | funding, liq density |
| EXECUTION | execution_view | entry/stop/TP | breakout line |

Router rule: 한 화면 = 하나의 template. 강조 1개, 보조 2개까지.

---

## 6. AI Agent 역할 범위 (엄격)

`04_AI_AGENT_LAYER.md` 상세. 요약:

### 6.1 3개 AI 역할

1. **Parser** (필수, Day-1)
   - 자연어 → PatternDraft JSON
   - Strict schema + fixed vocabulary
   - Function calling / JSON mode 강제

2. **Reranker** (2차, data 누적 후)
   - Top 20 candidate → Top 5
   - feature + phase path + signal 동시 입력
   - Structured scoring output

3. **Chart Interpreter** (3차, 선택)
   - 차트 이미지 + feature → 태깅/설명
   - Fine-tuned 이후에만 신뢰

### 6.2 Orchestrator Agents (선택)

현재 spec의 Market/Risk/Macro/Monitor agent는 **operator tool**이지 판단 권한자가 아니다. 각 agent는 atomic tool만 호출한다. 최종 verdict는 엔진이 낸다.

### 6.3 AI가 하지 말아야 할 것

- Phase 판정 (엔진 state machine 권한)
- 최종 유사도 점수 결정 (reranker/ledger 권한)
- Entry/stop 숫자 생성 (rule-based 계산)
- Ledger verdict 직접 기록 (user or auto-eval)

---

## 7. 기술 스택 결정 (변경 금지 항목)

| 계층 | 선택 | 이유 |
|---|---|---|
| Storage | Postgres + ClickHouse (optional) | durable state, audit |
| Vector | pgvector (보조) | ANN은 candidate gen에서만 |
| Feature compute | Python + polars | vectorized, past-only |
| Sequence matcher | custom Python (DP edit distance) | DTW는 과함 |
| Ranker | LightGBM ranker | 적은 데이터로 학습 가능 |
| LLM | Claude (parser) / GPT-4 class (judge) | structured output 강한 것 |
| Frontend chart | TradingView Lightweight Charts + custom panes | 커스터마이징 자유 |
| Framework | FastAPI + SvelteKit | 현재 레포 일치 |

Future optional:
- GNN on phase transitions: 데이터 누적 후
- E2E deep learning on raw bars: **하지 마라**

---

## 8. 방어 가능한 해자 (moat)

### 8.1 Data moat

- 수동 레이블된 pattern object
- User verdict ledger (valid/invalid/too-early/too-late)
- Near-miss / failure cluster
- 팀 공용 pattern library

### 8.2 Sequence moat

Phase order는 벡터검색으로 복제 어렵다. 경쟁사(Surf, CoinGlass)는 요약/데이터만 제공하지 sequence matcher를 만들지 않는다.

### 8.3 Feedback loop moat

```
user judgment
  → reranker training data
  → better candidates
  → better judgment
  → ...
```

이 루프가 90일 돌면 신규 경쟁사는 따라올 수 없다.

---

## 9. Kill Criteria (약한 판단은 피함)

이 제품이 **실패한다고 판단해야 할 지표**:

| 지표 | 임계 | 조치 |
|---|---|---|
| Save Setup 전환율 | M3까지 30% 미만 | 온보딩/캡처 UX 재설계 |
| Weekly sessions/user | M3까지 2.5 미만 | NSM 재정의 |
| Feedback rate (alert→verdict) | 30% 미만 | scanner 정밀도/알림 UX 재검토 |
| Hit rate delta (autoresearch 전후) | +5%p 미달 | refinement 루프 중단 |
| Reranker validation gain | baseline 대비 +2%p 미만 | 자동 rollback |

약한 verdict 언어 금지. 위 기준 달성 못 하면 해당 슬라이스 중단.

---

## 10. 다음 문서로

- Pattern object 상세 계약: `01_PATTERN_OBJECT_MODEL.md`
- Engine runtime/durable state: `02_ENGINE_RUNTIME.md`
- 4단 검색 파이프라인: `03_SEARCH_ENGINE.md`
- AI agent spec + prompt 규칙: `04_AI_AGENT_LAYER.md`
- Visualization intent/template: `05_VISUALIZATION_ENGINE.md`
- DB + API schema: `06_DATA_CONTRACTS.md`
- 구현 순서 / 슬라이스: `07_IMPLEMENTATION_ROADMAP.md`
