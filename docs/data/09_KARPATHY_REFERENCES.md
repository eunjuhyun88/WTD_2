# 09 — Karpathy References (AutoResearch + LLM Wiki Patterns)

> **⚠️ Verdict cardinality 주석 (2026-04-27 rebase 정합)**
> §1.5의 6-cat verdict는 Ryan Li 16-seed validation alternative proposal.
> Main canonical은 5-cat (`valid / invalid / missed / too_late / unclear`, PR #370 F-02).

**Status:** Reference · 2026-04-26
**Purpose:** Karpathy가 제시한 두 패턴(AutoResearch loop · LLM Wiki)이 우리 시스템에 어떻게 매핑되는지 정본 정리. `08_AUTORESEARCH_INTEGRATION.md`(8 repo 분석)와 `03_COMPLETE_ARCHITECTURE.md §18`(Wiki 구현 스펙) 통합.

---

## 0. 두 가지 핵심 패턴

| 패턴 | 출처 | 우리 시스템 매핑 | 상태 |
|---|---|---|---|
| **AutoResearch Loop** | Karpathy "bitter lesson" + Barnadrot program.md/iters.tsv 구현 | Phase D (12주 후) | ❌ 사전 작업 중 (R-01 ~ R-08) |
| **LLM Wiki** | Karpathy "ingest-time 정리" 패턴 | Phase 1-2 (Wiki Layer) | ❌ NOT BUILT — 계약만 있음 |

---

## 1. AutoResearch Loop (Karpathy bitter lesson)

### 1.1 핵심 인용

> **"The bitter lesson applies: scaling up search with occasional resets beat every clever hand-crafted idea."** — Ryan Li (paradigm-pm-challenge 1위 WRITEUP)

> **"When we were stuck at +$25, a fresh agent — with only domain knowledge and a target — independently discovered the arb-risk-weighted sizing formula that jumped us from +$25 to +$44."** — Ryan Li

> **"Constants like 39.9, 85, 0.08, and 2.8 were not derived analytically — they were found through systematic parameter sweeps across hundreds of simulations."** — Octavi (prediction-market-maker 2위)

### 1.2 Barnadrot의 직접 구현 (Karpathy loop 가장 구체적)

```
LOOP FOREVER:
1. Read iters.tsv to understand what has been tried
2. Read current submission to understand the kernel
3. Devise ONE targeted change
4. Edit submission
5. git commit -am "iter N: <short description>"
6. Run eval
7. Read eval.log. Extract score
8. If crashed: quick fix or git revert
9. If improved: keep, append to iters.tsv
10. If not improved: git revert, append to iters.tsv

NEVER STOP
Once the loop begins, do NOT pause. Do NOT ask "should I continue?"
```

**iters.tsv 결과 (Barnadrot 29 iters)**:
```
iter 1:  geomean 0.320ms (baseline)
iter 3:  geomean 0.114ms (-0.066ms) ← bf16 + diagonal special-case 첫 큰 개선
iter 10: 0.102ms ← 출력 버퍼 캐시
iter 17: 0.089ms ← Triton launcher 직접 호출
iter 29: 0.087ms (최종) ← 총 3.7x 개선
```

### 1.3 Cogochi 직역 (Phase D 진입 시 활용)

```
LOOP FOREVER:
1. iters.tsv 읽기 — 시도한 PatternObject variant, 결과, dead end
2. 현재 best PatternObject 읽기
3. ONE targeted change (hypothesis 1개)
4. PatternObject variant 생성 (parent_id 설정)
5. git commit "iter N: <description>"
6. backtest 실행 (verdict ledger eval set 기준)
7. multi-period accuracy 추출 (median W1/W2/W3)
8. improved → keep + iters.tsv append
9. not improved → discard + iters.tsv append

NEVER STOP
```

**iters.tsv 포맷 (Cogochi 채용)**:
```
iter  accuracy  delta  window1  window2  window3  status   params           description
1     0.52      -      0.50     0.54     0.53     keep     threshold=0.08   baseline oi_reversal_v1
2     0.55      +0.03  0.53     0.56     0.57     keep     threshold=0.12   early entry threshold 상향
3     0.51      -0.04  0.48     0.52     0.54     discard  threshold=0.06   too aggressive
```

### 1.4 Octavi의 evolution_chain (1 아이디어 > 100 파라미터 튜닝)

```
v01  foundation         : -$17.25 (multi-level quoting)
v10  asymmetric skew    :  +$4.18 (asymmetric inventory skew)
v50  z-score regimes    :  -$2.59 (volatility-adjusted filtering)
v74  monopoly discovery : +$40.64  ← BREAKTHROUGH (+$55 swing)
v97  retail optimization: +$37.41 (size=10 flat)
v99  retail matching    : +$42.95 (size=14/prob)
v109 final tuning       : +$46.70 (mono=85/prob, tiered z)
```

**v74 monopoly discovery = "regime change breakthrough"**:
이전 50+ variant가 -$15 ~ +$15에 묶여 있다가 완전히 다른 regime 발견 순간 +$40 점프.
**1개 새 아이디어 > 100개 parameter sweep.**

→ Cogochi PatternObject에 `parent_id`, `evolution_chain`, `derivation_note` 필드 (R-02, ★ 이번 세션 추가) 없으면 1,039 variant 실험해도 "어떤 게 breakthrough였는지" 잃는다.

### 1.5 Multi-Seed Validation (Karpathy bitter lesson 보조)

Ryan Li 평가 프로토콜 (원본 수치):
```
Leaderboard 1-seed eval:    $52.03  ← 과적합 가능
Final 3-seed median:         $42.32  ← 실제 성능 (1위)
16-seed validation average: $52.08  ← range $34~$70

교훈: single-period accuracy 0.60이 multi-period 0.45보다 나쁠 수 있다.
```

Kropiunig의 독립 검증 (동일 strategy 3회 제출):
```
attempt 1: $282.85
attempt 2: $259.38
attempt 3: $250.00
→ $32 variance on IDENTICAL CODE
```

> "The leaderboard is actually ranking argmax(strategy_quality × seed_luck), not strategy_quality alone." — Kropiunig

→ Cogochi multi-period gate (R-05): `median(W1, W2, W3) ≥ 0.55 AND min ≥ 0.40`

---

## 2. LLM Wiki Pattern (Karpathy ingest-time 정리)

### 2.1 핵심 차이

```
RAG:        query 시점에 raw에서 fragment 꺼냄
LLM Wiki:   ingest 시점에 LLM이 미리 정리해서 wiki page 저장 → query는 wiki 직접 조회
```

**왜 Wiki가 우월한가**:
- Query latency 압도적 (이미 정리됨)
- 문맥 일관성 높음 (한 번 정리된 게 재사용)
- 비용: ingest 1회 vs query N회 → N >> 1이면 wiki 승

### 2.2 Cogochi 매핑

| Karpathy 개념 | Cogochi |
|---|---|
| Raw Sources | capture_records, ledger_outcomes, pattern_objects, news_chunks |
| The Wiki | `wiki_pages` (DB canonical) + `cogochi/wiki/` (markdown export) |
| The Schema | `engine/wiki/schema.md` (NOT BUILT) |
| Ingest Operation | `engine/wiki/ingest.py` (NOT BUILT) — 이벤트 트리거 |
| Query Operation | `engine/wiki/query.py` (NOT BUILT) — slug 직접 조회 |
| Lint Operation | `engine/wiki/lint.py` (NOT BUILT) — 모순/stale 검출 |

### 2.3 Cogochi만의 차이 (corruption 방지)

| Karpathy | Cogochi 변형 |
|---|---|
| LLM이 page 전체 read+write | LLM은 `body_md`만, `frontmatter`(수치)는 stats_engine 전용 |
| (없음) | `wiki_change_log`로 모든 변경 추적 |
| (없음) | Lint agent는 read-only + human approval gate |
| (없음) | Storm 방지: 페이지당 60s debounce, ingest call당 max 10 page |

### 2.4 Wiki 페이지 종류 (Schema)

```
patterns/{pattern_id}.md           ← stats_engine + refinement_agent
users/{user_id}/index.md           ← judge_agent + stats_engine
users/{user_id}/captures/{id}.md   ← judge_agent (72h 후 1회, immutable)
indicators/{indicator_id}.md       ← 초기 seeding만
concepts/{topic}.md                ← refinement_agent (user 제안 승인 후)
weekly/{yyyy-Www}.md               ← weekly_synthesis_agent (월요일 0900 KST)
```

### 2.5 Ingest 트리거 (이벤트별)

```python
on_capture_created(capture_id)      → user_capture page + index 1줄
on_verdict_submitted(capture_id)    → capture page outcome 추가 + pattern page 1줄
on_pattern_stats_refreshed(pattern) → pattern page frontmatter (stats_engine 권한)
on_weekly_trigger()                 → weekly synthesis (월요일 0900 KST)
```

### 2.6 Query 라우팅

```
"BTC 패턴 분석해줘"    → wiki query (patterns/* + users/{id}/*)
"최근 BTC 뉴스 뭐야?"  → news RAG (news_chunks pgvector)
"내 성과 분석해줘"     → wiki query (users/{id}/index)
"자금조달비용 뭐야?"   → wiki query (indicators/funding_rate)
```

---

## 3. From-Scratch Agent Escape (Phase D 핵심)

Ryan Li WRITEUP §5: 정체기 탈출 메커니즘.

```
조건: 현재 best가 N iter 동안 개선 없음 (정체)

방법:
1. 새 agent 호출 — 기존 코드/lineage 참조 금지
2. 도메인 지식만 제공: "OI Reversal 패턴, target accuracy 0.55"
3. 기본 원리만 설명: OI divergence + liquidation
4. 새 agent는 처음부터 PatternObject 다시 작성

실증 결과 (Ryan Li):
  +$25 정체 → fresh agent → +$44 점프 (arb-risk-weighted sizing 독립 발견)
```

→ Cogochi Phase D `engine/autoresearch/orchestrator.py`에서:
- 정체 감지: 5 iter 동안 multi-period accuracy 개선 < 1%p
- 새 agent: parallel context fresh, parent_id=NULL로 신규 PatternObject 등록
- 비교: 새 lineage가 기존 best 초과 시 root pattern 변경

---

## 4. NEVER STOP 원칙 (Karpathy 명시 지시)

```
"Once the loop begins, do NOT pause. Do NOT ask 'should I continue?'"
```

**의미**: 자율 loop는 인간 confirmation을 기다리지 않는다.
**우리 안전장치 (Phase D 도입 시 필수)**:
- 비용 한도: 일일 LLM 호출 max $50
- 안전 한도: 한 번 commit으로 main 직접 push 금지 (variant branch만)
- 회로 차단: 5 iter 연속 crash 시 자동 정지 + alert

---

## 5. Cogochi 적용 우선순위

### Phase 1 (지금)
- ✅ R-01 user_verdict 6-cat — dead-end-confirmation table 행 라벨
- ✅ R-02 PatternObject evolution_chain — Octavi v01-v109 lineage
- ❌ R-04 1-click Watch — verdict 입력 가속
- ❌ R-05 multi-period gate — Ryan Li + Kropiunig 검증

### Phase 2 (Wiki + Stats)
- ❌ Wiki Layer 4 모듈 (`engine/wiki/{schema.md, ingest, query, lint}.py`)
- ❌ ContextAssembler — 모든 LLM call의 단일 진입점
- ❌ Stats Engine matview — Wiki frontmatter source

### Phase D (12주 후, AutoResearch loop)
- ❌ R-07 iters.tsv 포맷 (Barnadrot 직접 채용)
- ❌ R-08 from-scratch escape
- ❌ orchestrator.py (NEVER STOP loop + 안전장치)
- ❌ multi-agent parallel (Ryan Li 20 concurrent)

---

## 6. 출처

| 출처 | URL/Path | 인용 |
|---|---|---|
| Ryan Li WRITEUP | github.com/ryanli-me/paradigm-pm-challenge | bitter lesson, multi-seed, fresh agent |
| Octavi README | github.com/octavi42/prediction-market-maker | v01-v109 evolution log |
| Barnadrot program.md | github.com/Barnadrot/attention-kernel-research | iters.tsv 포맷, NEVER STOP, LOOP 형식 |
| Kropiunig analysis | github.com/Kropiunig/optimization-arena-exploits | $32 variance on identical code |
| Karpathy LLM Wiki concept | (X/Twitter, blog) | ingest-time 정리 vs RAG query-time |
| `08_AUTORESEARCH_INTEGRATION.md` | docs/data/ | 8 repo 통합 설계 (이번 세션) |
| `03_COMPLETE_ARCHITECTURE.md §18` | docs/data/ | LLM Wiki 구현 스펙 |

---

*Document version: v1.0 · Karpathy patterns reference · 2026-04-26*
