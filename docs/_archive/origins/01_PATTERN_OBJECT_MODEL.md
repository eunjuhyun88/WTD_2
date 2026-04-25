# 01 — Pattern Object Model

**Owner:** Engine Core
**Depends on:** `00_MASTER_ARCHITECTURE.md`

## 0. 왜 이 문서가 필요한가

Pattern은 현재 `engine/patterns/library.py`에 **하드코딩**되어 있다. 이걸 registry-backed로 승격해야 한다. 동시에 AI parser가 만드는 `PatternDraft`와 엔진 런타임이 쓰는 `PatternObject`는 다른 형태다 — 둘을 잇는 계약이 필요하다.

---

## 1. 객체 계층

```
PatternDraft (AI 생성, mutable, JSON)
  ↓ validator
PatternCandidate (DB persisted, reviewable)
  ↓ promote(human approval)
PatternObject (runtime, immutable version)
  ↓ state machine uses
PatternRuntimeState (per symbol × pattern)
```

각 계층은 다른 lifecycle과 다른 신뢰 수준을 갖는다.

---

## 2. Signal Vocabulary (고정 목록)

AI도 엔진도 이 어휘만 쓴다. 새 signal 추가는 vocabulary migration이다.

### 2.1 Price/Structure

| signal_id | feature binding | 설명 |
|---|---|---|
| `price_dump` | `price_change_1h <= -0.05` | 급락 (threshold parametric) |
| `price_spike` | `price_change_1h >= 0.05` | 급등 |
| `fresh_low_break` | `dist_from_20d_low <= 0` | 신저점 갱신 |
| `higher_lows_sequence` | `higher_low_count >= 2` | 저점 상승 |
| `higher_highs_sequence` | `higher_high_count >= 1` | 고점 상승 |
| `sideways` | `range_width_pct <= 0.08` | 횡보 |
| `upward_sideways` | `range_width_pct <= 0.08 AND higher_low_count >= 2` | 우상향 횡보 |
| `arch_zone` | `compression_ratio >= 0.5 AND volume_dryup_flag` | 아치 압축 |
| `range_high_break` | `breakout_strength >= 0.01` | 고점 돌파 |
| `breakout` | `breakout_strength >= 0.01` | 브레이크아웃 |

### 2.2 OI

| signal_id | feature binding | 설명 |
|---|---|---|
| `oi_spike` | `oi_spike_flag = true OR oi_zscore >= 2.0` | OI 급등 |
| `oi_small_uptick` | `0 <= oi_change_pct <= 0.03` | 소폭 증가 |
| `oi_hold_after_spike` | `oi_hold_flag = true` | 스파이크 후 유지 |
| `oi_reexpansion` | `oi_reexpansion_flag = true` | 재확장 |
| `oi_unwind` | `oi_change_pct <= -0.05` | 해소 |

### 2.3 Funding

| signal_id | feature binding | 설명 |
|---|---|---|
| `funding_extreme_short` | `funding_rate_zscore <= -2.0` | 극단 음수 |
| `funding_positive` | `funding_rate > 0` | 양수 |
| `funding_flip_negative_to_positive` | `funding_flip_flag = true` | flip |

### 2.4 Volume / Flow

| signal_id | feature binding | 설명 |
|---|---|---|
| `low_volume` | `volume_zscore <= 1.0` | 저거래 |
| `volume_spike` | `volume_zscore >= 2.0` | 폭발 |
| `volume_dryup` | `volume_dryup_flag = true` | 고갈 |
| `short_build_up` | `long_short_ratio decreasing + funding negative` | 숏 누적 |
| `short_to_long_switch` | `funding_flip + oi_reexpansion` | 롱 스위칭 |

Vocabulary table은 `engine/patterns/vocabulary.py`에 단일 소스로 관리. DB mirror: `signal_vocabulary` 테이블.

---

## 3. PatternDraft (AI 출력 스키마)

```python
from dataclasses import dataclass, field
from typing import Literal

Importance = Literal["critical", "high", "medium", "low"]
Direction = Literal["long", "short", "both"]

@dataclass
class PhaseDraft:
    phase_id: str                          # snake_case, unique within pattern
    label: str                             # 사람 읽는 이름
    sequence_order: int                    # 1-indexed
    description: str
    signals_required: list[str]            # vocabulary IDs
    signals_preferred: list[str] = field(default_factory=list)
    signals_forbidden: list[str] = field(default_factory=list)
    directional_belief: str | None = None  # "avoid_entry" | "entry_zone" | ...
    time_hint: str | None = None           # "pre-event" | "event" | ...
    importance: Importance = "high"

@dataclass
class TradePlanDraft:
    entry_phase: str | None
    entry_trigger: list[str]
    stop_rule: str | None
    target_rule: str | None
    avoid_conditions: list[str] = field(default_factory=list)
    late_conditions: list[str] = field(default_factory=list)

@dataclass
class SearchHintsDraft:
    must_have_signals: list[str]
    nice_to_have_signals: list[str]
    phase_path: list[str]
    preferred_timeframes: list[str]
    exclude_patterns: list[str] = field(default_factory=list)
    similarity_focus: list[str] = field(default_factory=list)

@dataclass
class PatternDraft:
    pattern_family: str                    # e.g. "oi_reversal"
    pattern_label: str                     # e.g. "tradoor_ptb_style"
    source_type: Literal["manual_note", "telegram_post", "chart_annotation", "voice_memo"]
    source_text: str
    symbol_candidates: list[str]
    timeframe: str
    direction: Direction
    thesis: list[str]                      # 1-4 sentence main claims
    phases: list[PhaseDraft]
    trade_plan: TradePlanDraft
    search_hints: SearchHintsDraft
    confidence: float                      # parser's self-assessed 0-1
    ambiguities: list[str]                 # things parser couldn't resolve
```

### 3.1 Draft Validator

- 모든 signal_id가 vocabulary에 존재하는가
- phase sequence_order가 연속적인가 (gap 없음)
- phase_path와 phases가 일치하는가
- confidence < 0.5면 `review_required=true`

실패 시: reject with structured error. Parser는 자동 retry (최대 3회).

---

## 4. PatternCandidate (검토 대기)

```python
@dataclass
class PatternCandidate:
    candidate_id: str                      # UUID
    draft: PatternDraft
    submitted_by: str                      # user_id
    submitted_at: datetime
    review_status: Literal["pending", "approved", "rejected", "needs_edit"]
    review_notes: str | None
    linked_captures: list[str]             # capture_ids that seeded this
    similar_existing_patterns: list[str]   # 중복 검출 결과
```

Review는 human이 한다 (Day-1). Phase 2에서 auto-approve rule 추가 가능.

---

## 5. PatternObject (Runtime Immutable)

```python
@dataclass(frozen=True)
class PhaseCondition:
    signal_id: str
    required: bool                         # true=required, false=preferred
    forbidden: bool = False
    weight: float = 1.0
    # feature binding은 vocabulary lookup으로 resolve

@dataclass(frozen=True)
class PhaseDef:
    phase_id: str
    phase_index: int                       # 0-indexed for state machine
    label: str
    conditions: tuple[PhaseCondition, ...]
    timeout_bars: int                      # expire after N bars
    directional_belief: str | None
    importance: str

@dataclass(frozen=True)
class PatternObject:
    pattern_id: str                        # stable slug, e.g. "oi_reversal_v1"
    pattern_family: str
    version: int                           # bump on any change
    created_at: datetime
    deprecated_at: datetime | None
    phases: tuple[PhaseDef, ...]
    timeframe: str
    direction: Direction
    trade_plan: TradePlanDraft             # immutable copy
    thesis: tuple[str, ...]
    author: str                            # user_id or "system"
    lineage: list[str]                     # ancestor pattern_ids
```

### 5.1 불변성 규칙

- `PatternObject`는 DB에 저장되면 **수정 불가**
- Threshold 조정은 새 version 발행 (예: `oi_reversal_v1` → `oi_reversal_v2`)
- Phase 추가/삭제는 새 pattern_family_version
- 사용자별 variant는 `PersonalVariant`로 분리 (§7)

---

## 6. PatternRuntimeState

```python
@dataclass
class PatternRuntimeState:
    symbol: str
    pattern_id: str
    pattern_version: int
    current_phase_index: int               # 0 = idle, 1..N = active
    phase_entered_at: datetime
    phase_path: list[dict]                 # [{phase_id, entered_at, exited_at, feature_snapshot}]
    last_feature_snapshot: dict            # 92-column snapshot
    last_scan_at: datetime
    timeout_at: datetime                   # phase timeout
    state_checksum: str                    # for durability verification
```

Durable store: Postgres table `pattern_runtime_state`. (§ `02_ENGINE_RUNTIME.md`)

---

## 7. PersonalVariant (유저별 refinement)

```python
@dataclass
class PersonalVariant:
    variant_id: str
    user_id: str
    base_pattern_id: str
    base_pattern_version: int
    threshold_overrides: dict[str, float]  # {"oi_zscore": 2.5, "price_change_1h": -0.07}
    signal_additions: list[str]            # 추가 required signals
    signal_removals: list[str]             # 삭제된 signals
    created_at: datetime
    personal_stats: dict                   # hit_rate, sample_size 등
```

이게 moat이다. 유저가 refine 할수록 개인화된 운영체제가 된다.

---

## 8. Canonical Example — OI Reversal v1

```yaml
pattern_id: oi_reversal_v1
pattern_family: oi_reversal
version: 1
timeframe: "1h"
direction: long

phases:
  - phase_id: fake_dump
    phase_index: 1
    label: "1차 경고 하락"
    timeout_bars: 24
    conditions:
      - {signal: price_dump, required: true, weight: 1.0}
      - {signal: funding_extreme_short, required: true, weight: 1.0}
      - {signal: oi_small_uptick, required: false, weight: 0.6}
      - {signal: low_volume, required: false, weight: 0.4}
      - {signal: oi_spike, forbidden: true}
      - {signal: volume_spike, forbidden: true}
    directional_belief: avoid_entry

  - phase_id: arch_zone
    phase_index: 2
    label: "아치 압축"
    timeout_bars: 48
    conditions:
      - {signal: arch_zone, required: true, weight: 1.0}
      - {signal: sideways, required: false, weight: 0.5}
    directional_belief: avoid_entry

  - phase_id: real_dump
    phase_index: 3
    label: "2차 진짜 dump"
    timeout_bars: 24
    conditions:
      - {signal: price_dump, required: true, weight: 1.0}
      - {signal: oi_spike, required: true, weight: 1.0}
      - {signal: volume_spike, required: true, weight: 1.0}
      - {signal: funding_extreme_short, required: false, weight: 0.6}
    directional_belief: event_confirmed

  - phase_id: accumulation
    phase_index: 4
    label: "우상향 횡보"
    timeout_bars: 72
    conditions:
      - {signal: higher_lows_sequence, required: true, weight: 1.0}
      - {signal: oi_hold_after_spike, required: true, weight: 1.0}
      - {signal: funding_flip_negative_to_positive, required: false, weight: 0.7}
      - {signal: upward_sideways, required: false, weight: 0.5}
      - {signal: fresh_low_break, forbidden: true}
    directional_belief: entry_zone

  - phase_id: breakout
    phase_index: 5
    label: "OI 재확장 급등"
    timeout_bars: 12
    conditions:
      - {signal: range_high_break, required: true, weight: 1.0}
      - {signal: oi_reexpansion, required: true, weight: 1.0}
      - {signal: funding_positive, required: false, weight: 0.4}
      - {signal: oi_unwind, forbidden: true}
    directional_belief: late_or_confirmed

trade_plan:
  entry_phase: accumulation
  entry_trigger: [higher_lows_sequence, oi_hold_after_spike]
  stop_rule: break_last_higher_low
  target_rule: beam_50_100_pct
  avoid_conditions: [fake_dump_only]
  late_conditions: [breakout_already_confirmed]

thesis:
  - "첫 dump는 경고 구간"
  - "두 번째 dump + OI 급등이 핵심"
  - "15분봉 우상향 횡보가 진입 구간"
  - "OI 재확장 breakout"
```

---

## 9. Registry / Storage

### 9.1 DB Tables

```sql
pattern_objects (
  pattern_id    text primary key,
  version       int not null,
  body          jsonb not null,    -- serialized PatternObject
  author        text,
  created_at    timestamptz,
  deprecated_at timestamptz
)

pattern_candidates (
  candidate_id      uuid primary key,
  draft             jsonb not null,
  submitted_by      text,
  submitted_at      timestamptz,
  review_status     text,
  review_notes      text,
  linked_captures   text[]
)

personal_variants (
  variant_id            uuid primary key,
  user_id               text,
  base_pattern_id       text,
  base_pattern_version  int,
  threshold_overrides   jsonb,
  signal_additions      text[],
  signal_removals       text[],
  personal_stats        jsonb,
  created_at            timestamptz
)

signal_vocabulary (
  signal_id        text primary key,
  category         text,             -- price / oi / funding / volume / flow
  feature_binding  jsonb,            -- rule expression
  description      text,
  added_at         timestamptz
)
```

### 9.2 Code Layout

```
engine/patterns/
  vocabulary.py          # signal vocabulary (single source)
  types.py               # PatternDraft, PatternObject, RuntimeState
  validators.py          # draft validation rules
  registry.py            # DB-backed pattern loader
  library.py             # (deprecated) hardcoded → seed migration
  personal_variants.py   # user-level overrides
```

---

## 10. Migration Plan

| Step | From | To | Blocker |
|---|---|---|---|
| 1 | `library.py` hardcoded | `pattern_objects` table seeded from code | 없음 |
| 2 | In-memory state | `pattern_runtime_state` table | `02_ENGINE_RUNTIME.md` slice |
| 3 | Candidate flow 없음 | `pattern_candidates` + review UI | AI parser endpoint |
| 4 | 개인화 없음 | `personal_variants` | 10+ verdict per user |

---

## 11. Non-Goals

- Phase condition을 자유 텍스트로 받기 (절대 금지)
- 새 signal vocabulary를 AI가 자동 생성 (migration 필요)
- Pattern versioning 없이 threshold mutate (immutability 깨짐)
- 5개 초과 phase의 pattern 초기 허용 (복잡도 폭발)
