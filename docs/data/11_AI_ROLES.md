# 11 — AI Roles & Signal Vocabulary 정본

**Status:** Reference · 2026-04-27 (사용자 dump 보존)
**Source:** 2026-04-27 세션 (CTO + 사용자 협업)
**Replaces / extends:** `docs/design/04_AI_AGENT_LAYER.md`

---

## 0. 한 줄 결론

> ❌ "AI 잘 쓰면 된다" / "AI = 핵심"
> ✅ **이 프로젝트의 핵심 엔지니어링은 "AI 모델 자체"가 아니라 "AI를 끼워 넣은 검색/패턴 엔진 시스템"이다.**
>
> **AI = 20%, 엔진 = 80%.**

---

## 1. AI는 정확히 3 역할만

### ① Parser (문장 → 구조화 JSON)

**역할**: 사람 문장을 PatternDraft JSON으로 번역.

**예**:
- 입력: "OI 급등 후 저갱하고 횡보하다가 다시 올림"
- 출력:
```json
{
  "phases": [
    {"phase": "real_dump",  "signals": ["price_dump", "oi_spike"]},
    {"phase": "accumulation", "signals": ["higher_lows", "sideways"]},
    {"phase": "breakout",   "signals": ["oi_reexpansion"]}
  ]
}
```

**필요한 엔지니어링**:

#### 1. Structured Output 강제
- JSON schema 정의
- function calling / tool use
- strict validation
- **자유 텍스트 출력 금지**

#### 2. Vocabulary 제한
- `oi_spike`, `funding_flip`, `higher_lows` 등
- **이 리스트 밖 단어 못 쓰게**

#### 3. Few-shot 설계
- 실제 트레이더 문장 20~50개 예시
- 잘못된 예시도 포함

#### 4. Retry + Validation loop
- JSON 파싱 실패 시 재요청
- 잘못된 signal → reject

**핵심**: 모델을 똑똑하게 만드는 게 아니라 **출력을 "틀 안에 가두는 엔지니어링"**.

---

### ② Reranker / Judge (유사도 판단 보정)

**역할**: 후보 20개 중 "진짜 비슷한 5개" 선택.

**필요한 엔지니어링**:

#### 1. Input 구성
LLM에 차트만 주면 안 된다. 반드시 같이 넣어야 함:
- feature snapshot
- phase path
- key signals

#### 2. Structured scoring 출력
```json
{
  "similarity": 0.82,
  "reason": "oi behavior + accumulation match",
  "difference": "breakout timing earlier"
}
```

#### 3. Batch + 비용 제어
- top 20만 LLM
- 나머지는 rule

**핵심**: LLM은 **최종 심판만** 한다 (전체 검색 아님).

---

### ③ Chart Interpreter (선택, 나중)

**역할**: 차트 보고 설명 + 패턴 태깅.

**필요한 엔지니어링**:

#### 1. 이미지 + 수치 같이 입력
- screenshot만 ❌
- feature 같이 넣어야 정확도 ↑

#### 2. consistent labeling
- 항상 같은 tag 쓰게
- 자유 설명 금지

**이건 나중 단계.**

---

## 2. AI보다 더 중요한 엔지니어링 (80%)

### ① Feature Engineering (제일 중요)

이걸 잘못하면 AI 아무리 좋아도 못 찾는다.

```
oi_change_pct
oi_zscore
funding_flip_flag
higher_low_count
breakout_strength
volume_spike_flag
compression_ratio
cvd_divergence_price
liq_nearby_density
```

→ "사람이 말하는 개념"을 숫자로 바꾸는 작업.

### ② State Machine (패턴 구조)

5단계:
- `FAKE_DUMP`
- `ARCH_ZONE`
- `REAL_DUMP`
- `ACCUMULATION`
- `BREAKOUT`

필요:
- phase detection 함수
- phase transition logic
- phase path 저장

→ **이게 없으면 그냥 데이터 툴이다.**

### ③ Sequence Matching (핵심 알고리즘)

이건 AI가 아니라 **알고리즘**이다.

필요:
- phase path 비교
- 순서 유지 여부
- 빠진 단계 패널티
- duration 비교

### ④ Candidate Filtering

빠르게 줄이는 부분.
- SQL hard filter
- feature filter
- timeframe filter

### ⑤ Ranking (품질 결정)

- 기술: LightGBM / XGBoost ranker
- 데이터: user judgment / success-failure / near miss

→ **이게 진짜 "잘 찾는 엔진"**.

### ⑥ Result Ledger (없으면 망함)

저장:
- 패턴
- 결과
- 수익률
- 실패 케이스

역할: "이 패턴이 실제로 먹히냐" 검증.

---

## 3. 전체 구조 (정리)

```
AI (parser)
    ↓
Pattern JSON
    ↓
Query Transformer
    ↓
Feature Engine
    ↓
Candidate Filter
    ↓
Sequence Matcher
    ↓
Ranker (LightGBM)
    ↓
(선택) AI Judge
    ↓
Result + Ledger
```

---

## 4. Signal Vocabulary (고정 ~30개)

AI가 제멋대로 쓰면 망한다. 반드시 이 리스트만 사용.

### 4.1 가격/구조 (10)
- `price_dump` — 급락
- `price_spike` — 급등
- `fresh_low_break` — 직전 저점 이탈
- `higher_lows_sequence` — 저점 상승 sequence
- `higher_highs_sequence` — 고점 상승 sequence
- `sideways` — 횡보
- `upward_sideways` — 우상향 횡보
- `arch_zone` — 아치형 저점 구간
- `bungee_zone` — 번지점프 패턴
- `range_high_break` / `breakout` — range 돌파

### 4.2 OI (5)
- `oi_spike` — OI 급등
- `oi_small_uptick` — OI 소폭 증가
- `oi_hold_after_spike` — spike 후 OI 유지
- `oi_reexpansion` — OI 재확장
- `oi_unwind` — OI 청산

### 4.3 Funding (3)
- `funding_extreme_short` — 극단적 숏 펀딩
- `funding_positive` — 양의 펀딩
- `funding_flip_negative_to_positive` — funding flip

### 4.4 Volume (3)
- `low_volume`
- `volume_spike`
- `volume_dryup`

### 4.5 Flow / Positioning (3)
- `short_build_up`
- `long_build_up`
- `short_to_long_switch`

**총 ~24개 (확장 가능 ~30개)**.

---

## 5. Signal → Feature Rule 매핑

변환기의 핵심. 문장 안의 signal을 실제 feature 조건으로 바꾼다.

```python
SIGNAL_TO_RULES = {
    "price_dump": [
        NumericConstraint(feature="price_dump_pct", op="<=", value=-0.05, weight=1.0),
    ],
    "oi_spike": [
        BooleanConstraint(feature="oi_spike_flag", expected=True, weight=1.0),
        NumericConstraint(feature="oi_zscore", op=">=", value=2.0, weight=0.8),
    ],
    "oi_hold_after_spike": [
        BooleanConstraint(feature="oi_hold_flag", expected=True, weight=1.0),
    ],
    "oi_reexpansion": [
        BooleanConstraint(feature="oi_reexpansion_flag", expected=True, weight=1.0),
    ],
    "funding_extreme_short": [
        BooleanConstraint(feature="funding_extreme_short_flag", expected=True, weight=1.0),
        NumericConstraint(feature="funding_rate_zscore", op="<=", value=-2.0, weight=0.8),
    ],
    "funding_flip_negative_to_positive": [
        BooleanConstraint(feature="funding_flip_flag", expected=True, weight=1.0),
    ],
    "higher_lows_sequence": [
        NumericConstraint(feature="higher_low_count", op=">=", value=2, weight=1.0),
    ],
    "upward_sideways": [
        NumericConstraint(feature="range_width_pct", op="<=", value=0.08, weight=0.5),
        NumericConstraint(feature="higher_low_count", op=">=", value=2, weight=1.0),
    ],
    "arch_zone": [
        NumericConstraint(feature="compression_ratio", op=">=", value=0.5, weight=1.0),
        BooleanConstraint(feature="volume_dryup_flag", expected=True, weight=0.6),
    ],
    "breakout": [
        NumericConstraint(feature="breakout_strength", op=">=", value=0.01, weight=1.0),
    ],
    # ... (전체 24개)
}
```

threshold는 고정 진리가 아니라 **초기값**. ledger와 judgments로 조정.

---

## 6. PatternDraft JSON Schema

### 6.1 최상위
```json
{
  "pattern_family": "",
  "pattern_label": "",
  "source_type": "manual_note | telegram_post | chart_annotation | voice_memo",
  "source_text": "",
  "symbol_candidates": [],
  "timeframe": "",
  "thesis": [],
  "phases": [],
  "trade_plan": {},
  "search_hints": {},
  "confidence": 0.0,
  "ambiguities": []
}
```

### 6.2 phases[i] 구조
```json
{
  "phase_id": "",
  "label": "",
  "sequence_order": 1,
  "description": "",
  "signals_required": [],
  "signals_preferred": [],
  "signals_forbidden": [],
  "directional_belief": "",
  "evidence_text": "",
  "time_hint": "",
  "importance": "high"
}
```

### 6.3 trade_plan
```json
{
  "entry_phase": "",
  "entry_trigger": [],
  "stop_rule": "",
  "target_rule": "",
  "avoid_conditions": [],
  "late_conditions": []
}
```

### 6.4 search_hints
```json
{
  "must_have_signals": [],
  "nice_to_have_signals": [],
  "phase_path": [],
  "preferred_timeframes": [],
  "exclude_patterns": [],
  "similarity_focus": []
}
```

---

## 7. AI 시스템 프롬프트 (Parser)

```text
주어진 트레이더 메모를 pattern parser로 해석하라.
반드시 지정된 JSON schema로만 출력하라.
signals는 허용된 vocabulary만 사용하라.
새로운 signal 이름을 만들지 마라.
애매한 부분은 ambiguities에 기록하라.
자유 서술 문장은 source_text와 evidence_text 외에는 금지한다.
숫자가 없으면 threshold를 추정하지 말고 비워두기.
```

---

## 8. 파인튜닝 시점

### 지금 당장 필요한 것
- 파인튜닝 ❌
- structured parser ✅
- query transformer ✅
- sequence matcher ✅
- reranker ✅
- ledger ✅

### 데이터 쌓인 뒤 (Phase B 이후)
- parser fine-tuning ⭕ — 한국어 트레이더 메모 일관성
- chart interpretation fine-tuning ⭕ — 멀티모달
- preference/ranking tuning ⭕ — verdict 누적 후

### 추천 순서
1. 기본 LLM + JSON schema로 파서 만든다
2. 사람이 50~200개 정도 pattern note를 저장한다
3. parser error를 모은다
4. search 결과 + user judgment + ledger를 쌓는다
5. **그 다음에야** parser/reranker/chart 파인튜닝

---

## 9. 진짜 중요한 착각

| ❌ 착각 | ✅ 현실 |
|---|---|
| "AI 잘 쓰면 된다" | 데이터 + 구조 + 검색이 핵심 |
| "AI = 핵심" | AI 20%, 엔진 80% |
| "LLM 하나로 검색" | 4-tier engine 필요 |
| "fine-tuning이 답" | parser/reranker/ledger가 먼저 |
| "차트만 LLM에 주면 됨" | feature snapshot 필수 |

---

## 10. 한 줄 결론

이건 "AI 프로젝트"가 아니라 **"시계열 패턴 검색 엔진 + AI 보조" 프로젝트**다.

AI 역할:
- **Parser** = 의미를 구조화하는 번역기
- **Reranker** = 후보 중 진짜 5개 골라내는 심판
- **Chart Interpreter** = 시각 + 수치 묶어 설명 (선택)

엔진 역할:
- 그 구조를 시장 데이터에서 찾고 검증하는 기계

---

## 11. 출처 / 관련

- 사용자 원문: 2026-04-27 세션
- [12_SEARCH_ENGINE_4TIER.md](12_SEARCH_ENGINE_4TIER.md) — 4-tier 검색 엔진 (AI는 Layer D)
- [10_VISUALIZATION_ENGINE.md](10_VISUALIZATION_ENGINE.md) — Parser가 query → intent
- [09_KARPATHY_REFERENCES.md](09_KARPATHY_REFERENCES.md) — bitter lesson (search > clever)
- [04_CTO_REALITY.md](04_CTO_REALITY.md) §9 ContextAssembler — 모든 LLM call 단일 진입점

---

*v1.0 · 2026-04-27 · 사용자 dump 보존*
