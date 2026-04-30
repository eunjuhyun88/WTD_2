# W-0366 — Pattern Indicator Filters: 패턴 조건 레이어

> Wave: 5 | Priority: P1 | Effort: M (8-10d)
> Charter: In-Scope L3 (Pattern Object augment), L5 (Search filter)
> Status: 🟡 Design Draft
> Created: 2026-05-01
> Issue: #808
> Depends on: W-0365 (market-search API), W-0233 (ledger schema)

---

## Why (사용자 피드백)

> "우리도 인디케이터 룰도 넣어야 하는데. 자신이 본 구간을 좀더 구체화해서 선택하는 것"

현재 Cogochi 패턴 등록 흐름:

1. 트레이더가 차트 구간을 드래그
2. 12개 window feature 자동 추출 (`price_return`, `rsi_mean`, `bb_width_mean` 등) → "이 구간은 어땠다"는 **서술**
3. market-search 시 이 12 feature signature와의 코사인 유사도로 후보 매칭

**문제**: 서술과 조건이 분리되지 않았다.

- 현재: "이 패턴이 발생했을 때 RSI는 28이었다" (관찰)
- 필요: "이 패턴을 찾을 때는 RSI < 30인 구간만 봐라" (조건)

서술-기반 매칭은 조용히 자기와 비슷한 통계 분포의 구간을 가져오지만, 트레이더가 명시적으로 "내가 본 셋업의 본질은 RSI 과매도"라고 잠가둘 수단이 없다.

### mihara와의 차이 (positioning)

| 축 | mihara (예시) | Cogochi |
|---|---|---|
| 인디케이터 룰 의미 | 자동 실행 트리거 (조건 충족 → 봇이 진입) | 검색 필터 (내가 본 셋업을 정밀하게 기술) |
| 사용자 페르소나 | 바이브 트레이더, 전략 자동화 | 디스크리셔너리 트레이더, 패턴 학습/검증 |
| 결과물 | 체결 주문 | 후보 구간 리스트 + 백테스트 통계 |

→ Cogochi에서 인디케이터 필터는 **search-time pre-filter**이지 execution trigger가 아님. 이 차이가 D-1, D-3, T2 설계 전반을 지배함.

---

## Goal

트레이더가 PatternObject를 등록·편집할 때, 132개 이미 계산된 feature 중 user-facing 서브셋(~20개)을 골라 비교 연산자(`<`, `>`, `==`, `in`)와 임계값으로 검색 조건을 명시할 수 있게 한다. 이 조건은 `/research/market-search` 시 hard pre-filter로 작동해, 조건을 통과한 구간에서만 12-feature signature 유사도를 계산한다.

성공 정의:
- 동일 base pattern에 `rsi14 < 30` 필터를 추가/제거하면 candidates 결과 분포가 확연히 달라진다 (AC3).
- 기존 12 benchmark pack은 한 줄도 수정 없이 정상 동작한다 (AC5).

---

## Scope

### 포함 (In-Scope)

- `IndicatorFilter` dataclass + `PatternVariantSpec.indicator_filters: tuple[IndicatorFilter, ...]` 확장
- market-search pre-filter 로직 (조건 통과 → signature 비교)
- user-facing feature curated list (~20개) + per-feature UI hint (operator 후보, value 타입, range)
- PatternObject 편집 UI에 "Indicator Conditions" 패널 추가 (+ Add Condition / 리스트 / 삭제)
- `/research/market-search` request body에 `indicator_filters` 파라미터 (override 또는 augment)
- 기존 PatternVariantSpec JSON 직렬화 역호환 (필드 부재 시 `()` default)

### 제외 (Out-of-Scope)

- Soft filter (점수 보정형) — D-1에서 hard로 결정 (알파)
- 132개 전체 feature 노출 — 사용자가 이해할 수 있는 서브셋만
- 인디케이터 expression DSL (`a AND (b OR c)`) — v1은 AND-only flat list
- 자동 실행/알림 트리거 — Cogochi 도메인 외 (mihara 영역)
- 새 feature 계산 추가 — 기존 132개로만

### 파일 (예정)

- `engine/research/pattern_search.py` — `IndicatorFilter`, `PatternVariantSpec` 확장
- `engine/research/market_search.py` — pre-filter 로직 (`run_pattern_market_search`)
- `engine/research/feature_catalog.py` (신규) — user-facing 20개 feature 메타
- `engine/api/research_routes.py` (또는 해당 라우터) — `indicator_filters` body 파라미터
- `app/src/lib/components/pattern/IndicatorFilterPanel.svelte` (신규)
- `app/src/lib/stores/patternEditor.ts` — filters state
- `engine/tests/research/test_indicator_filters.py` (신규)

### API

```http
POST /research/market-search
{
  "pattern_id": "...",
  "variant_id": "...",
  "indicator_filters": [
    {"feature_name": "rsi14", "operator": "<", "value": 30, "filter_type": "hard"},
    {"feature_name": "ema_alignment", "operator": "==", "value": "bullish", "filter_type": "hard"}
  ]
}
```

`indicator_filters` 부재 시 PatternVariantSpec에 저장된 값을 사용. 명시 시 그것이 override.

---

## Non-Goals (이유)

- **Soft filter** — 알파에선 "걸리면 통과/탈락"이 사용자 멘탈모델에 직관적. weight tuning UX 부담이 너무 큼. v2에서 재논의.
- **Boolean expression** — `(rsi<30 AND obv_slope>0) OR (price_change_24h<-10%)` 같은 복잡 조건. 현 사용자 12명 규모에선 AND-only로 충분. 필요 시 별도 W로.
- **자동 trade execution** — Cogochi는 디스크리셔너리 학습 도구. 자동매매는 도메인 위반.
- **132 feature 전부 노출** — 인지 부하. 페르소나 페일.

---

## IndicatorFilter 데이터 모델

```python
# engine/research/pattern_search.py

from dataclasses import dataclass, field

@dataclass(frozen=True)
class IndicatorFilter:
    feature_name: str        # FEATURE_COLUMNS 중 하나 (예: 'rsi14', 'ema_alignment')
    operator: str            # '<' | '>' | '<=' | '>=' | '==' | '!=' | 'in' | 'between'
    value: float | str | list | tuple  # 비교값
    weight: float = 1.0      # 향후 soft filter 확장용 (v1은 항상 1.0)
    filter_type: str = 'hard'  # 'hard' (반드시 통과) | 'soft' (점수 보정, v2)

    def __post_init__(self) -> None:
        # 검증: feature_name ∈ FEATURE_COLUMNS, operator ∈ allowed set
        # 검증: value 타입이 operator와 호환 (e.g. 'in' → list/tuple)
        ...

    def evaluate(self, value: float | str) -> bool:
        """Hard filter: 통과면 True, 탈락이면 False."""
        ...


@dataclass(frozen=True)
class PatternVariantSpec:
    pattern_slug: str
    variant_slug: str
    timeframe: str
    phase_overrides: dict[str, dict] = field(default_factory=dict)
    search_origin: str = "manual"
    selection_bias: float = 0.0
    hypotheses: list[str] = field(default_factory=list)
    variant_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    duration_scale: float = 1.0
    indicator_filters: tuple[IndicatorFilter, ...] = field(default_factory=tuple)  # ⬅ 신규
```

### JSON 직렬화 (역호환)

```json
{
  "pattern_slug": "rsi-oversold-bounce",
  "variant_slug": "v1",
  "timeframe": "1h",
  "indicator_filters": [
    {"feature_name": "rsi14", "operator": "<", "value": 30.0, "weight": 1.0, "filter_type": "hard"}
  ]
}
```

기존 pack에 `indicator_filters` 필드가 없으면 `()` default → 회귀 없음.

---

## User-Facing Feature Catalog (~20개 초안)

**선정 기준 (D-2)**:
1. 트레이더 멘탈모델에 직관적 (RSI, EMA alignment, MACD 같은 표준 지표)
2. 단위·범위가 자명 (rsi14: 0-100, atr_pct: %)
3. categorical은 enum 값이 명확 (ema_alignment: bullish/bearish/neutral)
4. 132 중 derived/raw 중복 시 derived 우선

| # | feature_name | type | UI hint | 권장 operator |
|---|---|---|---|---|
| 1 | `rsi14` | float (0-100) | RSI(14) | `<`, `>`, `between` |
| 2 | `rsi14_slope` | float | RSI slope | `<`, `>` |
| 3 | `ema_alignment` | enum | EMA20/50/200 정렬 | `==`, `in` |
| 4 | `ema20_slope` | float | EMA20 slope | `<`, `>` |
| 5 | `price_vs_ema50` | % | 가격-EMA50 갭 | `<`, `>`, `between` |
| 6 | `macd_hist` | float | MACD 히스토그램 | `<`, `>` |
| 7 | `bb_width` | float | BB 폭 (변동성) | `<`, `>` |
| 8 | `bb_position` | float (0-1) | BB 내 위치 | `<`, `>`, `between` |
| 9 | `atr_pct` | % | ATR% | `<`, `>` |
| 10 | `stoch_rsi` | float (0-1) | Stoch RSI | `<`, `>` |
| 11 | `roc_10` | % | 10-bar ROC | `<`, `>` |
| 12 | `dist_from_20d_high` | % | 20일 고점 거리 | `<`, `>` |
| 13 | `dist_from_20d_low` | % | 20일 저점 거리 | `<`, `>` |
| 14 | `obv_slope` | float | OBV slope | `<`, `>` |
| 15 | `vol_ratio_3` | float | 거래량 비 (3-bar) | `<`, `>` |
| 16 | `funding_rate` | % | 펀딩비 | `<`, `>` |
| 17 | `oi_change_24h` | % | OI 24h 변화 | `<`, `>` |
| 18 | `cvd_state` | enum | CVD 상태 | `==`, `in` |
| 19 | `taker_buy_ratio_1h` | float (0-1) | 1h taker buy 비율 | `<`, `>` |
| 20 | `htf_structure` | enum | HTF 구조 | `==`, `in` |

`engine/research/feature_catalog.py`에 메타 dict 형태로 정의.

---

## Sub-Tasks

| ID | 이름 | Effort | Blocker |
|---|---|---|---|
| T1 | `IndicatorFilter` dataclass + `PatternVariantSpec.indicator_filters` 확장 + JSON 역호환 | S | - |
| T2 | market-search pre-filter 로직 (`run_pattern_market_search`) | S | T1, W-0365 T2 |
| T3 | `feature_catalog.py` — user-facing 20개 메타 (operator/range/UI hint) | S | - |
| T4 | PatternObject 등록·편집 UI — IndicatorFilterPanel.svelte | M | T3 |
| T5 | `/research/market-search` body에 `indicator_filters` 파라미터 (override) | S | T2 |
| T6 | 단위 + 통합 테스트 + Playwright UI 흐름 | S | T1-T5 |

### T1 — Spec 확장 (S, ~1d)

- `IndicatorFilter` dataclass + `__post_init__` 검증 + `evaluate()` 메서드
- `PatternVariantSpec` 필드 추가 (default `()`)
- JSON serializer/deserializer 역호환 — 기존 12 pack fixture 재로드 PASS
- 단위 테스트: operator 6종 × type 3종 (float/str/enum)

### T2 — Pre-filter 로직 (S, ~1d)

`run_pattern_market_search`에서:

```python
def run_pattern_market_search(spec: PatternVariantSpec, df: pd.DataFrame, ...):
    if spec.indicator_filters:
        mask = pd.Series(True, index=df.index)
        for f in spec.indicator_filters:
            if f.filter_type == 'hard':
                mask &= _apply_filter(df[f.feature_name], f)
        df = df[mask]
    # 기존 signature 유사도 매칭
    return _match_by_signature(df, spec.feature_signature)
```

- vectorized pandas op (per-row Python loop 금지)
- 누락 feature는 `pass-through` (False mask)로 처리, log warning
- 단위 테스트: filter 적용 전후 candidates 수 비교

### T3 — Feature Catalog (S, ~1d)

```python
# engine/research/feature_catalog.py
USER_FACING_FEATURES: dict[str, FeatureMeta] = {
    'rsi14': FeatureMeta(
        label='RSI(14)',
        unit='0-100',
        operators=('<', '>', '<=', '>=', 'between'),
        value_type='float',
        range=(0, 100),
        category='momentum',
    ),
    'ema_alignment': FeatureMeta(
        label='EMA Alignment',
        unit=None,
        operators=('==', '!=', 'in'),
        value_type='enum',
        enum_values=('bullish', 'bearish', 'neutral'),
        category='trend',
    ),
    # ... 18개 더
}
```

UI는 이 dict를 그대로 소비 → operator 드롭다운, value input 위젯 자동 결정.

### T4 — UI Panel (M, ~3d)

`app/src/lib/components/pattern/IndicatorFilterPanel.svelte`:

- 기존 PatternObject 편집 화면에 "Indicator Conditions" 섹션 추가
- 빈 상태: "+ Add Condition" 버튼만
- 추가: feature 검색/카테고리 필터(momentum/trend/volume/derivatives) → operator → value 위젯 (number input / enum dropdown / between range)
- 리스트: 추가된 조건 카드 (label + op + value + 삭제 버튼)
- 변경 시 즉시 patternEditor store 업데이트 + (선택) live preview candidates count

### T5 — API param (S, ~0.5d)

`/research/market-search` request body에 `indicator_filters?: IndicatorFilter[]`. 명시 시 spec의 값을 override (마운트된 시점에 사용자가 임시로 조건 바꿔보기).

### T6 — Tests (S, ~1.5d)

- 단위: T1, T2 cover
- 통합: fixture pattern + 1년 OHLCV → filter on/off 결과 다름 확인 (AC3)
- 회귀: 12 benchmark pack 전체 정상 로드 + market-search 동작 (AC5)
- Playwright: filter 추가 → 즉시 search 재실행 → candidates 변화 (AC4)

---

## CTO 관점

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 기존 pack 회귀 (역호환 깨짐) | M | H | T1에서 default `()`, fixture 재로드 테스트 강제 (AC5) |
| 누락 feature로 인한 silent fail | M | M | `__post_init__`에서 `feature_name ∈ FEATURE_COLUMNS` 검증, market-search에서 missing column log warning |
| filter 너무 빡세서 candidates=0 → UX 패닉 | H | M | UI에 live count + "0건" 명시 표시; 도움말 "조건을 완화해보세요" |
| feature_signature와 indicator_filters 의미 중복 (D-3) | H | M | D-3에서 명시: signature는 형태 유사도, filter는 binary 게이트. 보완 관계 |
| user-facing 목록 선정 편향 | M | L | T3에서 momentum/trend/volume/derivatives 4 카테고리 균형, beta 사용자 피드백 후 v2 |
| pandas pre-filter 성능 (1년 1m bar = 525k row) | L | M | vectorized; 측정 후 필요시 Polars 마이그레이션 (별도 W) |

### Dependencies

- W-0365 (market-search API surface) — `run_pattern_market_search` signature 변경 지점
- W-0233 (ledger 4-table) — variant 저장 스키마에 indicator_filters JSON column 추가 (마이그레이션 필요할 수 있음, T1 포함 검토)
- W-0350 (pattern object store) — pack 직렬화 포맷의 source of truth

### Rollback

- Phase 별 revert 가능: T1 dataclass만 추가하고 default empty면 T2 미적용 시에도 무해
- 마이그레이션 column 추가는 nullable JSON → 단순 drop column으로 롤백
- UI 패널은 feature flag `INDICATOR_FILTERS_ENABLED`로 비활성 가능

---

## AI Researcher 관점

### 가설

H1: 인디케이터 hard filter를 추가하면, 같은 base pattern에 대해 매칭된 후보 구간의 forward-return 분산이 줄어든다 (selection이 더 정밀).

H2: filter가 너무 specific하면 sample size 부족 → 통계적 검정력 손실. 따라서 UI는 즉시 candidates count 노출 필요.

H3: ema_alignment, rsi14, price_vs_ema50 3개가 사용자 첫 선택의 80%를 차지할 것 (베타 12명 관찰).

### 측정 지표

- candidates count (filter 전후)
- forward 24h return std (filter 전후) — H1 검증
- recall@10 (가설 마킹된 known similar 중 회수율) — filter가 noise 제거 효과 있는지
- "0 candidates" 발생률 (UX 보호)

### Lookahead 방지

- IndicatorFilter는 **각 시점에서의 동시점 feature 값**으로 평가 (이미 `engine/features/compute.py`가 shift(1) 적용)
- `__post_init__`에서 어떤 future-leaking feature_name도 거부 (catalog에 lookahead-safe만 등재)

---

## Decisions

### D-1: hard filter vs soft filter (점수 보정) — 알파 결정

**선택**: hard filter only (v1).

**근거**:
- 사용자 멘탈모델: "RSI < 30이어야 한다"는 **요구 조건**이지 가중치가 아니다
- soft filter는 weight tuning UX가 무겁고, 결과 해석("왜 이게 통과됐지?") 어렵다
- v2에서 weight UI/시각화 갖춰지면 재도입 — 데이터 모델은 미리 `weight`, `filter_type` 필드로 확장 여지 남김

### D-2: user-facing feature 20개 선정 기준

**선택**: 트레이더 표준 인디케이터 우선 + 4 카테고리 균형 (momentum/trend/volume/derivatives).

**근거**: 위 catalog 표 4개 기준 (직관성, 자명한 단위, enum 명확성, derived 우선). 132개 raw → 20개로 95% 인지부하 컷.

### D-3: 기존 12 feature signature와 indicator_filters 관계

**선택**: **보완 관계, 직교 축**.

| 축 | 의미 | 매칭 방식 |
|---|---|---|
| feature signature (12개) | 패턴의 "모양" 통계 | 코사인 유사도 (continuous score) |
| indicator_filters | 패턴의 "환경 조건" | binary gate (pass/fail) |

market-search 흐름:
1. **Filter** (binary): indicator_filters 통과 구간만 남김
2. **Match** (similarity): 남은 구간 중 signature 코사인 유사도 top-k

→ 중복이 아니라 **2-stage retrieval**. signature가 "RSI=28일 때의 통계"를 코사인으로 잡는다면, filter는 "RSI<30이라는 hard boundary"를 강제한다.

### D-4: filter UI — 텍스트 입력 vs 드롭다운 vs 슬라이더

**선택**: feature_catalog의 `value_type`별 분기.

- `float` (range 명확): **slider + number input** 병행 (e.g. RSI 0-100 슬라이더)
- `float` (range 비명확, %): **number input only** (e.g. funding_rate)
- `enum`: **dropdown / multiselect** (operator `==` vs `in`)
- `between`: **dual slider** (e.g. RSI 25~35)

근거: 인지부하 최소화 + 잘못된 값 입력 방지 (-50 같은 무의미 값 거부).

---

## Open Questions

- Q1: indicator_filters를 PatternVariantSpec에 저장 vs 별도 store로? — 일단 spec 내부 (직렬화 일관성). 추후 versioning 필요해지면 분리.
- Q2: filter 위반 시 ledger에 "filter_failed_count"를 기록해서 추후 hypothesis tracking에 쓸 것인가? — v2 검토.
- Q3: 한 변수에 여러 조건 (e.g. `rsi14 > 25 AND rsi14 < 35`) — 현재 모델로 두 IndicatorFilter 추가하면 자연스럽게 AND. 명시.
- Q4: derived feature (e.g. `rsi14 - rsi14[t-3]`) 표현 필요한가? — v1 NO. v2 제한적 expression DSL 검토.
- Q5: 마이그레이션 — 기존 PatternVariantSpec 직렬화된 pack/DB row에 `indicator_filters` 컬럼 추가 시 backfill 전략? (default `'[]'`로 OK)

---

## Implementation Plan

| Day | Tasks |
|---|---|
| D1 | T1 dataclass + JSON 역호환 + 단위 테스트 |
| D2 | T2 pre-filter 로직 + 단위 테스트 |
| D3 | T3 feature_catalog 20개 + 메타 |
| D4-D6 | T4 IndicatorFilterPanel.svelte (Svelte 5 컴포넌트 + store wiring + live count) |
| D7 | T5 API param + override 의미 검증 |
| D8 | T6 통합 + Playwright + 회귀 |
| D9 | 베타 사용자 1명 dogfood + UX 미세조정 |
| D10 | PR · CI green · merge |

---

## Exit Criteria

- **AC1**: `IndicatorFilter` dataclass 정의 + `PatternVariantSpec.indicator_filters` 필드 추가. 기존 12 benchmark pack JSON (필드 부재) 정상 로드 — 회귀 없음
- **AC2**: `rsi14 < 30` 단일 hard filter 적용 시, 결과 candidates 중 rsi14 ≥ 30 인 row가 0% (단위 테스트, fixture OHLCV 1000-bar)
- **AC3**: 동일 fixture pattern에 대해 filter 없음 vs `rsi14 < 30` 적용 — candidates 수 차이 |Δ| > 0 (integration test, 통계적으로 다른 분포)
- **AC4**: UI에서 condition 추가/삭제 시 1초 이내 candidates count 갱신 (Playwright)
- **AC5**: 기존 12 benchmark pack — 모두 `indicator_filters=()` 상태로 정상 동작, market-search 회귀 없음 (snapshot test)
- **AC6**: feature_catalog 20개 모두 operator 검증 통과 (단위 테스트 parametrize)
- **CI**: pytest green, svelte-check 0 errors, contract CI pass

---

## References

- W-0350 — Pattern Object Store (직렬화 포맷)
- W-0365 — Market Search API Surface (호출 지점)
- `engine/features/columns.py:FEATURE_COLUMNS` — 132 feature source of truth
- `engine/features/compute.py` — feature 계산 (lookahead-safe shift(1))
- `engine/research/pattern_search.py:PatternVariantSpec` — 확장 대상
- mihara Edit Indicators 화면 — UI 방향 참조 (Cogochi는 ~20개로 축소)

## Non-Goals
- indicator 계산 로직 변경 (feature_calc.py는 그대로)
- 백테스트 결과 재산출 — 필터는 scanner 단계에서만 적용
- ML 모델 재학습 — 기존 LightGBM 그대로

## Owner
engine+app

## Canonical Files
- `engine/research/pattern_search.py`
- `engine/features/columns.py`
- `app/src/components/research/IndicatorFilterPanel.svelte`

## Facts
- `engine/features/columns.py:FEATURE_COLUMNS` 132개 feature 확인
- W-0350 Pattern Object Store (PR #756) 머지됨 — PatternVariantSpec 직렬화 포맷 존재
- 12 benchmark pack JSON 현재 `indicator_filters` 필드 없음

## Assumptions
- `PatternVariantSpec` dataclass 확장 가능 (backward-compat: 기본값 `()`)
- UI 1초 이내 갱신 = REST polling 방식 (WebSocket 불필요)

## Next Steps
1. `IndicatorFilter` dataclass + `PatternVariantSpec.indicator_filters` 추가
2. scanner filter 로직 구현
3. UI IndicatorFilterPanel 구현
4. AC1~AC6 pytest + Playwright 검증

## Handoff Checklist
- [ ] AC1~AC6 구현 + CI green
- [ ] PR merged + CURRENT.md 갱신
