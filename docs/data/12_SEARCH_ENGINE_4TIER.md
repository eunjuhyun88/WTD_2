# 12 — 4-Tier Search Engine 정본

**Status:** Reference · 2026-04-27 (사용자 dump 보존)
**Source:** 2026-04-27 세션 (CTO + 사용자 협업)
**Replaces / extends:** `docs/design/03_SEARCH_ENGINE.md`, `docs/design/09_RERANKER_TRAINING_SPEC.md`

> ⚠️ **현재 구현 상태 (2026-04-29 확인)**
> 현재 엔진은 4-tier 아닌 **3-layer 병렬 blend (A/B/C)** 를 동시 실행.
> - Layer A+B+C = `engine/search/similar.py` ✅ 동작 중
> - Layer D (LLM judge) = W-0148 미구현
> 참조: `docs/data/04_CTO_REALITY.md` §CTO Decision 1

---

## 0. 한 줄 결론

> Surf 같은 건 "데이터 + AI 요약 엔진"이다.
> 우리가 만들려는 건 **"패턴 검색 엔진"**이다.
>
> **검색 정확도 = 사업의 전부.**

---

## 1. 왜 4-tier인가 (LLM 하나로는 안 되는 이유)

### 1.1 벡터 검색만으로는 안 된다
- 의미는 비슷한데 실제 차트는 다름
- "OI 급등" 둘 다 있지만 시퀀스가 다름
- accumulation 없이 바로 반등한 케이스도 같이 나옴

### 1.2 룰만으로도 안 된다
- 사람의 서술적 패턴
- "아치형 번지대"
- "세력이 숏 쌓고 롱스위칭"
- 이런 걸 못 담는다

### 1.3 이미지 모델만으로도 안 된다
- OI / funding / liquidation 같은 구조적 feature 놓침
- 검색 재현성 떨어짐

**정답**: 셋을 **계층적으로 같이** 쓴다.

---

## 2. 전체 파이프라인

```
User note / query
→ AI parser (PatternDraft JSON)
→ Query transformer (SearchQuerySpec)
→ Layer A: Candidate generation (100~500)
→ Layer B: Sequence matcher (20~50)
→ Layer C: Ranker / Reranker (5~10)
→ Layer D: LLM judge (top 3~5, 선택)
→ 결과 + ledger stats + user judgment
```

LLM을 맨 앞에 크게 두면 느리고 흔들린다.
**LLM은 마지막 검증기로만**.

---

## 3. Layer A — Candidate Generation

### 역할
빠르게 많이 고른다. 전체 300+ 종목 × 과거 전 구간에서 100~500 후보.

### 기술
- SQL hard filter (가장 효과적)
- feature index
- pgvector는 보조
- MinHash / ANN은 선택

### 예시 필터
```sql
WHERE oi_spike_flag = TRUE
  AND price_dump_pct <= -0.05
  AND timeframe IN ('15m', '1h')
  AND higher_low_count >= 2
```

**핵심**: 정확한 hard filter가 ANN보다 훨씬 효과적.

---

## 4. Layer B — Sequence Matching (★ 본체)

### 역할
phase path를 비교한다. **가장 차별화되는 레이어**.

### 왜 이게 본체인가
패턴은 한 시점이 아니라 **순서**다.
- `FAKE_DUMP → ARCH_ZONE → REAL_DUMP → ACCUMULATION → BREAKOUT`

이 시간 순서를 vector embedding이 못 잡는다.

### 기술
- finite state machine
- dynamic programming sequence alignment
- DTW 계열 또는 custom phase-path similarity
- HMM은 과함 (처음엔 X)

### 가장 현실적인 방법
1. 각 윈도우마다 phase 판정
2. 각 종목/구간의 phase path 생성
3. query pattern의 phase path와 정렬 비교

### 점수 예시
```python
def sequence_similarity(query_path: list[str], runtime_path: list[str]) -> float:
    if not query_path or not runtime_path:
        return 0.0
    overlap = sum(
        1 for i, phase in enumerate(query_path)
        if i < len(runtime_path) and runtime_path[i] == phase
    )
    return overlap / max(len(query_path), len(runtime_path))
```

### 점수 가중치 예시
- phase path 일치: 0.4
- phase order 보존: 0.2
- phase duration 유사: 0.1
- missing phase 패널티: -0.2
- forbidden transition 패널티: -0.2

**이게 Surf류 제품과 제일 다른 지점이다.**

---

## 5. Layer C — Ranker / Reranker

### 역할
20개 후보 → 진짜 top 5.

### 기술
- LightGBM ranker (1차)
- XGBoost ranker
- 나중: cross-encoder reranker

### 왜 LightGBM
- user judgments / ledger 결과를 supervised label로 활용
- "valid / invalid / too_late / unclear" 5-cat이 그대로 학습 데이터
- "수동 레이블링이 훈련 데이터가 된다"는 철학 실현

### Input feature (예시 17개)
- feature similarity
- sequence similarity
- timeframe match
- phase completeness
- forbidden signal 위반 여부
- outcome similarity
- BTC regime context
- recency bias
- pattern family match
- ...

---

## 6. Layer D — LLM Judge (선택, 마지막)

### 역할
top 5 중 진짜 비슷한지 최종 검증.

### 기술
- 멀티모달 LLM
- 차트 이미지 + feature snapshot 입력
- structured JSON 출력

### 출력 예시
```json
{
  "similarity": 0.82,
  "reason": "oi behavior + accumulation match",
  "difference": "breakout timing earlier"
}
```

**중요**: 이건 검색의 **시작점이 아니라 마지막 검증기**로 써야 한다.

---

## 7. 최종 점수 합산

```python
def final_similarity(
    feature_score: float,
    sequence_score: float,
    text_score: float = 0.0,
    outcome_score: float = 0.0,
) -> float:
    return (
        feature_score  * 0.45 +
        sequence_score * 0.40 +
        outcome_score  * 0.10 +
        text_score     * 0.05
    )
```

비율은 quality_ledger로 동적 조정 (현재 코드: A 0.45 / B 0.30 / C 0.25).

---

## 8. Negative Set (잘 찾기 위한 핵심)

진짜 잘 찾게 하려면 positive만 모으면 안 된다.

### 꼭 필요한 negative
- 비슷해 보이지만 실패한 케이스
- `fake_dump`에서 끝난 케이스
- `real_dump` 후 바로 더 밀린 케이스
- `accumulation`처럼 보였지만 breakout 없던 케이스

이 negative가 있어야 reranker가 강해진다.

### DB 테이블
```sql
create table ledger_negatives (
  neg_id          uuid primary key default gen_random_uuid(),
  entry_id        uuid references ledger_entries(entry_id),
  negative_type   text not null,   -- 'hard_negative' | 'near_miss' | 'fake_hit' | 'auto_miss'
  reason          text,
  curated_by      text,            -- user_id or 'auto_rule'
  curated_at      timestamptz default now()
);
```

### Verdict 5-cat과의 매핑
- `invalid` → `hard_negative`
- `near_miss` (alternative proposal) → `near_miss`
- `too_late` → 별도 카운터 (학습 noise 다름)
- `unclear` → 학습 제외

---

## 9. SearchQuerySpec (Layer A 입력)

```python
@dataclass
class NumericConstraint:
    feature: str
    op: str          # >, >=, <, <=, ==, between
    value: float | None = None
    value2: float | None = None
    weight: float = 1.0

@dataclass
class BooleanConstraint:
    feature: str
    expected: bool
    weight: float = 1.0

@dataclass
class PhaseQuery:
    phase_id: str
    required_numeric: list[NumericConstraint]
    required_boolean: list[BooleanConstraint]
    preferred_numeric: list[NumericConstraint]
    preferred_boolean: list[BooleanConstraint]
    forbidden_boolean: list[BooleanConstraint]

@dataclass
class SearchQuerySpec:
    pattern_family: str
    timeframe: str
    phase_path: list[str]
    phase_queries: list[PhaseQuery]
    must_have_signals: list[str]
    preferred_timeframes: list[str]
    exclude_patterns: list[str]
    similarity_focus: list[str]   # ["sequence", "oi_behavior", ...]
    symbol_scope: list[str]
```

---

## 10. QueryTransformer (PatternDraft → SearchQuerySpec)

```python
class QueryTransformer:
    def __init__(self, signal_to_rules: dict[str, list]):
        self.signal_to_rules = signal_to_rules

    def transform_phase(self, phase: PhaseDraft) -> PhaseQuery:
        q = PhaseQuery(phase_id=phase.phase_id)

        for signal in phase.signals_required:
            for rule in self.signal_to_rules.get(signal, []):
                if isinstance(rule, NumericConstraint):
                    q.required_numeric.append(rule)
                elif isinstance(rule, BooleanConstraint):
                    q.required_boolean.append(rule)

        for signal in phase.signals_preferred:
            for rule in self.signal_to_rules.get(signal, []):
                # ... preferred 측 추가
                pass

        for signal in phase.signals_forbidden:
            for rule in self.signal_to_rules.get(signal, []):
                if isinstance(rule, BooleanConstraint):
                    q.forbidden_boolean.append(rule)

        return q

    def transform(self, draft: PatternDraft) -> SearchQuerySpec:
        timeframe = draft.timeframe or "15m"
        phase_queries = [
            self.transform_phase(p)
            for p in sorted(draft.phases, key=lambda x: x.sequence_order)
        ]
        return SearchQuerySpec(
            pattern_family=draft.pattern_family,
            timeframe=timeframe,
            phase_path=[p.phase_id for p in sorted(draft.phases, key=lambda x: x.sequence_order)],
            phase_queries=phase_queries,
            must_have_signals=draft.search_hints.get("must_have_signals", []),
            preferred_timeframes=draft.search_hints.get("preferred_timeframes", [timeframe]),
            exclude_patterns=draft.search_hints.get("exclude_patterns", []),
            similarity_focus=draft.search_hints.get("similarity_focus", ["sequence"]),
            symbol_scope=draft.symbol_candidates,
        )
```

---

## 11. Layer A 매칭 함수

```python
def match_feature_window(spec: SearchQuerySpec, feature_row: dict) -> float:
    score = 0.0
    max_score = 0.0

    for phase in spec.phase_queries:
        for rule in phase.required_numeric:
            max_score += rule.weight
            if eval_numeric(rule, feature_row):
                score += rule.weight

        for rule in phase.required_boolean:
            max_score += rule.weight
            if eval_boolean(rule, feature_row):
                score += rule.weight

        for rule in phase.preferred_numeric:
            max_score += rule.weight
            if eval_numeric(rule, feature_row):
                score += rule.weight * 0.7

        for rule in phase.preferred_boolean:
            max_score += rule.weight
            if eval_boolean(rule, feature_row):
                score += rule.weight * 0.7

        for rule in phase.forbidden_boolean:
            if eval_boolean(rule, feature_row):
                score -= rule.weight

    return max(0.0, score / max_score) if max_score else 0.0
```

---

## 12. Surf와 차별화

| Surf | 우리 |
|---|---|
| "데이터 + AI 요약" | "패턴 검색 엔진" |
| 데이터 → AI → 설명 | 사람 경험 → 패턴 → 과거 데이터 검색 → 유사 사례 |
| 검색 X (요약 O) | 검색 ★ |
| 패턴 DB 없음 | 패턴 객체 DB ★ |
| sequence 비교 안 함 | sequence matching ★ |

→ Surf는 우리 못 따라온다. 검색 정확도가 핵심이기 때문.

---

## 13. 잘 찾는다를 만드는 운영 루프

이게 제일 중요하다.

### Step 1. founder pattern 1개 고정
TRADOOR류 1개만.

### Step 2. 수동 라벨 50~100개
- positive
- near-miss
- invalid

### Step 3. hard filter + sequence matcher 먼저
top 20 정확도 확보.

### Step 4. reranker 학습
judgment + ledger로 supervised learning.

### Step 5. 멀티모달 judge 추가
top 5 검증용.

**LLM보다 먼저 sequence matcher와 ledger를 붙인다.**

---

## 14. 지금 안 붙여도 되는 기술

초기에 불필요:
- graph neural network
- end-to-end deep learning on raw candles
- huge multimodal fine-tuning
- full RL
- fancy vector DB first architecture

**처음엔 오히려**:
- 좋은 feature
- 좋은 phase model
- 좋은 negative set
- 좋은 reranker

이 4개가 훨씬 중요하다.

---

## 15. 추천 스택 (가장 빠르고 강함)

- **Storage**: Postgres + optional ClickHouse
- **Feature compute**: Python + polars
- **API**: FastAPI
- **Candidate filters**: SQL
- **Sequence matcher**: custom Python
- **Reranker**: LightGBM
- **LLM parser/judge**: structured JSON output
- **Frontend**: TradingView-lightweight 기반 custom panes

---

## 16. 한 줄 정리

잘 찾게 하려면:
1. LLM을 **parser**로 쓴다 (자유 텍스트 X, structured output)
2. **feature store**를 만든다 (92 cols)
3. **state machine**으로 phase path를 만든다
4. **sequence matcher**로 구조를 비교한다 (★ 본체)
5. **reranker**가 user judgment + ledger로 계속 배운다

즉, AI 하나 붙이는 게 아니라 **의미분석 + 시계열 검색 + 상태 전이 비교 + 결과 학습**을 묶는다.

---

## 17. 출처 / 관련

- 사용자 원문: 2026-04-27 세션
- [11_AI_ROLES.md](11_AI_ROLES.md) — Parser/Reranker (Layer C/D)
- [09_KARPATHY_REFERENCES.md](09_KARPATHY_REFERENCES.md) — bitter lesson (search > clever)
- [01_ARCHITECTURE.md](01_ARCHITECTURE.md) §2 L5b — 현재 3-layer blend (Layer A+B+C)
- 현재 코드: `engine/search/similar.py` (3-layer blend), `engine/research/similarity_ranker.py` (LCS)

---

*v1.0 · 2026-04-27 · 사용자 dump 보존*
