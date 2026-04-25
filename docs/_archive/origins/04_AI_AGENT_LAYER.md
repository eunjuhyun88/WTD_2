# 04 — AI Agent Layer

**Owner:** AI Research
**Depends on:** `01_PATTERN_OBJECT_MODEL.md`, `03_SEARCH_ENGINE.md`

## 0. 근본 원칙

> **AI는 의미를 구조화하는 번역기다. 판단 권한자가 아니다.**

이 원칙 하나만 지켜도 제품의 80%는 건강하다. 위반 시 "그럴듯한 설명"만 하는 제품이 된다.

---

## 1. AI 역할 지도

```
Role            | Authority       | Determinism     | Day-1?
----------------|-----------------|-----------------|--------
Parser          | Low             | Strict schema   | YES
Query Transformer | Low           | Deterministic   | YES (rule-based, not LLM)
Reranker input  | Low             | Supervised ML   | Phase 2
LLM Judge       | Advisory only   | Non-deterministic | Phase 2 optional
Chart Interpreter | Advisory      | Post fine-tune  | Phase 3
Monitor Agent   | Operational tool | Deterministic  | Phase 2
Orchestrator    | Coordination    | Deterministic tool selection | Phase 2
```

Day-1은 **Parser 하나만**. 나머지는 증명된 데이터 누적 후.

---

## 2. Parser Agent (Day-1 필수)

### 2.1 Input / Output

```
Input:  자연어 메모, 텔레그램 포스트, 음성 메모 전사, 차트 annotation
Output: PatternDraft JSON (§ 01_PATTERN_OBJECT_MODEL.md §3)
```

### 2.2 LLM 선택

| 후보 | 장단점 |
|---|---|
| Claude Sonnet | Structured output 안정적, JSON mode 지원 [preferred] |
| GPT-4o / 4.1 | Tool use 강함, cost 유사 |
| Local Qwen 30B+ | Phase 3+, privacy 중요 유저용 |

Day-1은 Claude Sonnet. Fallback은 GPT-4 class.

### 2.3 System Prompt

```
You are a pattern parser for a crypto pattern research system.

STRICT RULES:
1. Output JSON only, no prose. Match the exact schema provided.
2. Use ONLY signal_ids from the provided vocabulary list.
3. Do NOT invent new signal names.
4. If a concept is unclear, add it to "ambiguities" with short explanation.
5. Do NOT estimate numeric thresholds unless user provided specific numbers.
6. Phase sequence_order must be 1-indexed and contiguous.
7. phases array and search_hints.phase_path MUST match in order.

AVAILABLE SIGNAL VOCABULARY:
{vocabulary_list}  # see §2.4

FEW-SHOT EXAMPLES:
{3-5 curated examples of input→output}

OUTPUT SCHEMA:
{PatternDraft JSON schema}
```

### 2.4 Vocabulary Injection

Runtime에 `signal_vocabulary` 테이블에서 current set을 prompt에 주입:

```python
def build_vocabulary_prompt():
    rows = db.query("select signal_id, category, description from signal_vocabulary")
    grouped = group_by_category(rows)
    return render_template("""
{% for cat, items in grouped.items() %}
## {{cat}}
{% for it in items %}
- `{{it.signal_id}}`: {{it.description}}
{% endfor %}
{% endfor %}
    """)
```

Vocabulary 확장 시 parser가 자동으로 인지.

### 2.5 Function Calling 강제

```python
PARSER_TOOLS = [{
    "type": "function",
    "function": {
        "name": "emit_pattern_draft",
        "description": "Emit the structured pattern draft",
        "parameters": PATTERN_DRAFT_JSON_SCHEMA,   # strict
    }
}]

response = anthropic.messages.create(
    model="claude-sonnet-4",
    tools=PARSER_TOOLS,
    tool_choice={"type": "tool", "name": "emit_pattern_draft"},
    messages=[...]
)
```

`tool_choice` forced → 자유 서술 불가.

### 2.6 Validation & Retry

```python
def parse_with_retry(source_text: str, max_attempts: int = 3) -> PatternDraft:
    for attempt in range(max_attempts):
        response = call_llm(source_text, attempt)
        try:
            draft = PatternDraft.from_json(response.tool_input)
            validate_draft(draft)   # vocabulary, structure, consistency
            return draft
        except ValidationError as e:
            # Return error to LLM for correction
            source_text = f"{source_text}\n\nPREVIOUS ERROR: {e}\nFix and retry."
    raise ParserFailed("Max retries exceeded")
```

3회 실패 시 candidate 생성하지 않고 user에게 "ambiguous, please clarify" 반환.

### 2.7 Cost & Latency

- Claude Sonnet: 1K tokens in, 2K tokens out ≈ $0.015/call
- Latency: 1.5-3s
- 캐싱: 같은 text hash → 24h cache

Budget: 유저당 월 100회 parsing. Pro tier 무제한.

### 2.8 Eval

- **Schema compliance**: 99%+ 목표 (validation 실패율)
- **Vocabulary adherence**: 100% (강제)
- **Phase ordering correctness**: human review on 50 sample, 90%+
- **Thesis coherence**: human review, 80%+

Offline eval set: 실제 텔레그램 복기 글 200개 수집 → ground truth draft → parser output diff.

---

## 3. Query Transformer (Deterministic, NOT LLM)

### 3.1 역할

`PatternDraft` → `SearchQuerySpec` (§ 03_SEARCH_ENGINE.md §3.2)

이건 **pure function**. LLM이 아님. 이유:
- 재현성 (같은 input → 같은 output)
- 디버깅 가능
- Cost 0

### 3.2 구현

```python
class QueryTransformer:
    def __init__(self, vocabulary: dict[str, SignalBinding]):
        self.vocab = vocabulary
    
    def transform(self, draft: PatternDraft) -> SearchQuerySpec:
        phase_queries = [
            self._transform_phase(p) for p in sorted(draft.phases, key=lambda x: x.sequence_order)
        ]
        return SearchQuerySpec(
            pattern_family=draft.pattern_family,
            timeframe=draft.timeframe,
            phase_path=[p.phase_id for p in sorted(draft.phases, key=lambda x: x.sequence_order)],
            phase_queries=phase_queries,
            must_have_signals=draft.search_hints.must_have_signals,
            preferred_timeframes=draft.search_hints.preferred_timeframes,
            exclude_patterns=draft.search_hints.exclude_patterns,
            similarity_focus=draft.search_hints.similarity_focus,
        )
    
    def _transform_phase(self, phase: PhaseDraft) -> PhaseQuery:
        q = PhaseQuery(phase_id=phase.phase_id)
        for s in phase.signals_required:
            for rule in self.vocab[s].rules:
                # append to required_numeric or required_boolean
                ...
        return q
```

엔진 코드: `engine/search/query_transformer.py`.

---

## 4. LLM Judge (Phase 2, optional)

### 4.1 언제 활성화되나

- Reranker 성능이 plateau
- 유저가 "왜 이게 비슷해?"를 자주 물음
- Top 5 결과의 rerank score 차이가 < 0.1

### 4.2 입력/출력은 § 03 §6 참조

### 4.3 Prompt 템플릿

```
You are a pattern similarity judge.

Compare the query pattern to the candidate pattern. Focus on:
1. Phase sequence structure
2. Signal behavior (OI, funding, volume)
3. Market context (regime)

Return JSON:
{
  "similarity": float 0-1,
  "reason": "1 sentence",
  "main_difference": "1 sentence",
  "confidence": float 0-1
}

DO NOT:
- Add financial advice
- Predict future prices
- Generate new signals

QUERY:
{query_summary}

CANDIDATE:
{candidate_summary}
```

### 4.4 Non-determinism mitigation

- `temperature=0`
- Seed cached per (query_hash, candidate_id)
- Disagreement with reranker → log, do not override

---

## 5. Chart Interpreter (Phase 3)

### 5.1 언제

- Fine-tuned multimodal model 확보 후 (Sonnet Vision 등)
- 유저가 chart annotation 요청
- Auto-discovery (§6)

### 5.2 입력

- Chart PNG (800×600 or 1200×800)
- Feature snapshot (28 cols)
- Phase path context

### 5.3 출력

Structured annotations:
```json
{
  "detected_phases": [
    {"phase_id": "real_dump", "bar_range": [150, 152], "confidence": 0.82},
    ...
  ],
  "key_candles": [
    {"bar_index": 151, "reason": "OI spike + funding flip"},
    ...
  ],
  "thesis_alignment": 0.78
}
```

### 5.4 Risk

차트 이미지 해석은 **재현성 약함**. Judge와 동일하게 advisory only.

---

## 6. Auto-Discovery Agent (Phase 3+)

### 6.1 Trigger

- 특정 심볼이 ≥10% 4h 이내 움직임
- 기존 pattern library와 matching 안 됨

### 6.2 Pipeline

```
Event detected
  → Capture 48h feature timeline
  → Chart Interpreter describes structure
  → Parser structures into PatternDraft (candidate)
  → Search engine looks for historical matches
  → If hit_rate > threshold → propose as new pattern_family
  → Human review → PatternCandidate
```

이건 모든 하위 컴포넌트가 성숙한 뒤에만 의미 있음. Day-1 스코프에서 제외.

---

## 7. Orchestrator / Multi-Agent (Phase 2+)

### 7.1 참조 아키텍처

```
User Goal
  → Orchestrator Agent
     → Market Agent (feature calc, pattern detect)
     → Risk Agent (correlation, liquidation)
     → Macro Agent (regime, on-chain)
     → Search Agent (§03 pipeline)
  → Synthesized response
```

### 7.2 중요한 제약

- 각 sub-agent는 **atomic tool만** 호출
- 최종 verdict는 엔진 state machine / ledger가 낸다
- LLM orchestrator는 도구 선택과 결과 종합만
- Tool trace는 전부 `agent_trace_log`에 기록

### 7.3 Tool Library (Phase 2 target)

```python
TOOLS = [
    scan_market(criteria, limit),
    compute_features(symbol, tf),
    fetch_orderbook(symbol),
    fetch_liquidations(symbol, window),
    fetch_news(symbol, limit),
    check_correlation(sym_a, sym_b, tf),
    check_regime(macro_window),
    search_similar_patterns(capture_id_or_query),
    synthesize_verdict(evidences),
    set_alert(symbol, condition),
]
```

10 atomic tools. 새 tool 추가는 review process.

### 7.4 Memory 계층

```
Working memory  → in-context (현재 세션)
Episodic        → ledger_entries + ledger_outcomes
Semantic        → user preferences table
Procedural      → learned rules table (threshold 조정 이력)
```

### 7.5 Control Plane 연결

`multi-agent-execution-control-plane.md`의 `agent_session`, `work_claim`, `branch_lease` 규칙을 그대로 따른다. Research agent가 코드 변경까지 가는 경우 (refinement promotion 등) 해당 control plane 필수.

---

## 8. Fine-tuning Roadmap

### Phase A (0-3 months)
- **No fine-tuning**
- Base LLM + strict schema + vocabulary
- 200+ parsed drafts 수집

### Phase B (3-6 months)
- Parser fine-tune on domain: 200 noisy user inputs + ground-truth drafts
- LoRA, small model (Qwen 7B 또는 Llama 3 8B)
- Target: inference cost ↓ 90%, schema compliance 99%+

### Phase C (6-12 months)
- KTO on 500+ verdicts for reranker adjunct
- Personal adapter per-user (Pro tier만)

### Phase D (12+ months)
- ORPO / DPO on preference pairs
- Multimodal chart fine-tune

각 phase는 evidence 누적 후 진입. 순서 건너뛰면 ROI 음수.

---

## 9. Failure Modes & Mitigations

| Failure | Mitigation |
|---|---|
| Parser invents signal | Validation reject, retry with error feedback |
| LLM outputs narrative instead of JSON | Function calling forced, temperature 0 |
| Judge contradicts reranker systematically | Log, use as training signal, don't override |
| Auto-discovery generates spam patterns | Human review gate + rate limit (5/day) |
| Orchestrator infinite loop | Step budget (max 8 tool calls) + timeout 30s |
| Hallucinated threshold numbers | Schema rejects numeric fields unless user provided |

---

## 10. Cost Model

Per-user monthly:

| Role | Calls | Cost | Notes |
|---|---|---|---|
| Parser | 100 | $1.50 | Claude Sonnet |
| Judge | 20 | $1.20 | optional |
| Chart Interpreter | 5 | $0.50 | Phase 3+ |
| Orchestrator | 10 | $2.00 | Phase 2+ |
| **Total** | — | **~$5/user** | Pro $29 plan → 83% margin |

Free tier: parser only, 10 calls/month.

---

## 11. Non-Goals

- Unified single LLM doing everything ("just prompt Claude to trade")
- Live trading execution from LLM output
- Open-ended conversation mode (scope creep)
- Fine-tuning before 200+ labeled examples
- Generating new vocabulary signals without human approval
- Judge that can override reranker silently

---

## 12. 연결 다이어그램

```
User input
  │
  ▼
Parser (LLM) ────────┐
  │                  │
  ▼                  │
PatternDraft         │
  │                  │
  ▼                  │
Query Transformer    │ (deterministic)
  │                  │
  ▼                  │
SearchQuerySpec      │
  │                  │
  ▼                  │
Search Pipeline §03  │
  │                  │
  ├── Stage 4 ◄──────┘ (LLM Judge, optional)
  │
  ▼
Ranked Candidates
  │
  ▼
UI (§05 Visualization)
```

각 화살표는 **단방향 데이터 흐름**. LLM이 state machine을 역으로 수정하지 않음.
