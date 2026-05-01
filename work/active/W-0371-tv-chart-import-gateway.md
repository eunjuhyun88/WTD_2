# W-0371 — TradingView Chart Import → Backtest Gateway

> Wave: 5 | Priority: P2 | Effort: M
> Charter: In-Scope (패턴 임포트 게이트웨이 — AI 차트 분석 툴 아님)
> Status: 🟡 Design Draft v2
> Created: 2026-05-01
> Issue: TBD
> Dependency: W-0366 `IndicatorFilter` contract (코드 존재 확인됨, 2026-05-01)

## Goal

사용자가 TradingView 공개 차트 URL을 붙여넣으면, 차트 스냅샷과 공개 메타데이터를 이용해
차트의 "아이디어"를 **검증 가능한 Pattern Hypothesis**로 컴파일한다. Vision은 차트에서 보이는
단서를 prefill하고, 시스템은 이를 W-0366 `IndicatorFilter[]` + 기존 `PatternObjectCombo` 조합으로
변환한 뒤, 사용자가 확정하면 기존 scanner → pipeline → `GET /research/top-patterns` 백테스트 결과로 노출한다.

**이것은 "AI 차트 분석 툴"이 아니다.** Vision은 사용자 폼 prefill booster일 뿐이며,
권위 있는 값은 항상 사용자가 확정한 IndicatorFilter 조건이다.

## Product Thesis — "Chart-to-Hypothesis Compiler"

이 기능을 특별하게 만드는 지점은 "AI가 차트를 맞춘다"가 아니라, 트레이더가 본 차트를
다음 4개 산출물로 바꾸는 것이다.

1. **Hypothesis Card**: "이 차트의 핵심 조건은 무엇인가"를 사람이 수정 가능한 형태로 정리
2. **Constraint Ladder**: 너무 빡빡한 조건을 strict/base/loose 3단계로 자동 완화해 표본 수 확보
3. **Evidence Report**: 어떤 조건이 표본을 죽였는지, 어떤 조건이 edge를 만든 것처럼 보이는지 진단
4. **Replay Pack**: 비슷한 과거 구간 10~30개를 보여줘 사용자가 "진짜 같은 셋업인지" 검수

즉 V1의 UX 문구는 "차트를 분석해드립니다"가 아니라 **"이 차트를 백테스트 가능한 가설로 바꾸기"**여야 한다.

## Accuracy Strategy

Vision 정확도만 끌어올리면 안 된다. 정확도는 4단계로 나눠 관리한다.

| Layer | 질문 | 정확도 향상 방법 | 실패 시 동작 |
|---|---|---|---|
| Source | URL에서 symbol/timeframe/snapshot을 안정적으로 얻었나 | 공개 HTML + snapshot URL + URL regex 교차검증 | manual form으로 degrade |
| Perception | 이미지에서 어떤 지표/주석/방향이 보이나 | Vision JSON schema + confidence + evidence boxes | prefill만 비우고 계속 |
| Compilation | 보이는 단서를 엔진 조건으로 옮겼나 | deterministic compiler + feature catalog allowlist | unsupported atom으로 표시 |
| Statistics | 백테스트 표본과 결과가 의미 있나 | estimate → strict/base/loose → n>=30 gate | commit 차단 또는 loose 제안 |

Vision 결과는 `visible_atoms`일 뿐이다. 실제 백테스트 조건은 compiler가 생성한 `compiled_filters`
그리고 사용자가 확정한 `user_filters`만 사용한다.

## 핵심 제약 (의미있는 백테스트 조건)

- 추출 대상: **지표 조건** (Ichimoku below cloud, RSI < 35, range breakdown depth 등)
  — 가격 레벨 (77,200) 아님. 가격 레벨은 일반화 불가, 통계적으로 무의미.
- 백테스트 시그널 ≥ 30개 이상 나와야 의미있음. Vision 추출 결과가 너무 specific하면
  사용자에게 경고 + 조건 완화 제안.

정정: 2026-05-01 실측 기준 `engine/research/pattern_search.py`에 `IndicatorFilter`와
`PatternVariantSpec.indicator_filters`가 있고, `engine/research/feature_catalog.py`에
user-facing feature catalog가 존재한다. 따라서 W-0371은 이 계약을 **새로 만들지 않고 재사용**한다.

## UX — 3-Step Import Workbench

### Step 1. Import

- 입력: TradingView 공개 chart URL. V1.5에서 스크린샷 업로드, V2에서 idea URL 완전 지원.
- 출력: snapshot, symbol, timeframe, title, description, author, chart_id
- 안전장치: private/login/unsupported domain은 거부. `tradingview.com`과 `s3.tradingview.com`만 허용.

### Step 2. Hypothesis Builder

화면은 3열이 좋다.

| Left | Center | Right |
|---|---|---|
| 원본 차트 snapshot | Hypothesis Card 편집 | Evidence/Diagnostics |

Hypothesis Card 필드:
- `pattern_family`: breakout, breakdown_reversal, squeeze_breakout, liquidity_sweep, wyckoff_spring, trend_pullback, unknown
- `direction`: long/short
- `timeframe`: 원본 또는 엔진 지원 timeframe으로 정규화
- `trigger_block`: 기존 building block 중 하나
- `confirmation_blocks`: 0~3개
- `indicator_filters`: W-0366 catalog 기반 AND-only 조건
- `horizon_bars`: 결과 평가 기간
- `strictness`: strict/base/loose

### Step 3. Backtest Preview

Commit 전에 반드시 estimate를 보여준다.

| Metric | 의미 |
|---|---|
| estimated_signal_count | 현재 조건으로 잡히는 과거 신호 수 |
| dropoff_by_filter | 각 filter가 표본을 얼마나 줄였는지 |
| unsupported_atoms | Vision이 봤지만 엔진 조건으로 컴파일하지 못한 단서 |
| suggested_relaxations | 표본 수 확보용 조건 완화 제안 |
| replay_examples | 과거 유사 구간 샘플 |

`estimated_signal_count < 30`이면 기본 commit은 막고, 사용자는 loose variant를 선택하거나 수동으로 조건을 줄인다.

## Data Contracts

### TVImportDraft

```python
@dataclass(frozen=True)
class TVImportDraft:
    draft_id: str
    source_url: str
    chart_id: str
    source_type: str  # "tradingview_chart" | "tradingview_idea" | "image_upload"
    symbol: str | None
    exchange: str | None
    timeframe_raw: str | None
    timeframe_engine: str | None
    title: str | None
    description: str | None
    snapshot_url: str | None
    snapshot_storage_path: str | None
    vision_spec: VisionPatternSpec
    compiler_spec: CompiledHypothesisSpec
    diagnostics: ImportDiagnostics
    status: str  # "draft" | "committed" | "rejected" | "expired"
```

### VisionPatternSpec

```python
@dataclass(frozen=True)
class VisionPatternSpec:
    direction: str | None
    pattern_family: str
    visible_indicators: list[str]
    visible_annotations: list[str]
    support_resistance_notes: list[str]  # stored for explanation, not used as absolute levels
    visible_atoms: list[dict]            # e.g. {"kind": "rsi_oversold", "confidence": 0.74}
    confidence: float
    evidence: list[dict]                 # short text + optional image bbox if provider supports it
```

### CompiledHypothesisSpec

```python
@dataclass(frozen=True)
class CompiledHypothesisSpec:
    base_pattern_slug: str
    variant_slug: str
    direction: str
    timeframe: str
    trigger_block: str
    confirmation_blocks: list[str]
    indicator_filters: list[IndicatorFilter]
    unsupported_atoms: list[dict]
    compiler_confidence: float
    strictness_variants: dict[str, PatternVariantSpec]  # strict/base/loose
```

### ImportDiagnostics

```python
@dataclass(frozen=True)
class ImportDiagnostics:
    estimated_signal_count: int
    filter_dropoff: list[dict]       # [{"filter": "rsi14 < 35", "before": 920, "after": 188}]
    min_sample_pass: bool
    leakage_risk: str                # "low" | "medium" | "high"
    selection_bias: float
    warnings: list[str]
    suggested_relaxations: list[dict]
```

## Compiler Design

Vision output must go through a deterministic compiler. No free-form LLM output may directly become an engine condition.

### Atom → Engine Mapping

| Visible atom | Engine representation | Notes |
|---|---|---|
| `rsi_oversold` | `IndicatorFilter("rsi14", "<", 35)` | strict=30, base=35, loose=40 |
| `rsi_overbought` | `IndicatorFilter("rsi14", ">", 65)` | strict=70, base=65, loose=60 |
| `volume_spike` | `IndicatorFilter("vol_ratio_3", ">", 1.5)` | strict=2.0, base=1.5, loose=1.2 |
| `bb_squeeze` | `IndicatorFilter("bb_width", "<", percentile_threshold)` | if percentile unavailable, use existing block only |
| `price_below_cloud` | unsupported V1 unless Ichimoku features exist | show as unsupported atom |
| `breakout` | trigger block `breakout_above_high` | existing building block |
| `range_breakdown` | trigger block `sweep_below_low` or `spring_breach` | direction-dependent |
| `liquidity_sweep` | trigger block `sweep_below_low` | long reversal only in V1 |
| `compression` | confirmation block `sideways_compression` | existing block |
| `reclaim_after_dump` | confirmation block `reclaim_after_dump` | existing block |
| `funding_extreme` | `IndicatorFilter("funding_rate", "<", x)` or existing block | direction-dependent |
| `oi_spike` | `IndicatorFilter("oi_change_24h", ">", x)` | V1 if feature exists |

### Pattern Family → Base Combo

| pattern_family | default base pattern | fallback |
|---|---|---|
| `breakout` | `volatility_squeeze_breakout` | `COMPRESSION_BREAKOUT_REVERSAL` if compression visible |
| `breakdown_reversal` | `wyckoff_spring_reversal` | `liquidity_sweep_reversal` |
| `liquidity_sweep` | `liquidity_sweep_reversal` | `wyckoff_spring_reversal` |
| `squeeze_breakout` | `volatility_squeeze_breakout` | `compression_breakout_reversal` |
| `trend_pullback` | `alpha_confluence` | `rsi_oversold` / `rsi_overbought` filters |
| `unknown` | no auto commit | raw Hypothesis Builder only |

### Strict/Base/Loose Variant Generation

The compiler should create three sibling variants before commit:

```python
strict = PatternVariantSpec(..., variant_slug="tv-{chart_id}-strict", indicator_filters=[rsi14 < 30, vol_ratio_3 > 2.0])
base   = PatternVariantSpec(..., variant_slug="tv-{chart_id}-base",   indicator_filters=[rsi14 < 35, vol_ratio_3 > 1.5])
loose  = PatternVariantSpec(..., variant_slug="tv-{chart_id}-loose",  indicator_filters=[rsi14 < 40, vol_ratio_3 > 1.2])
```

Preview picks `base` by default. If `base.n_signals < 30`, UI recommends `loose`. If `loose.n_signals < 30`,
the chart is stored as a draft but not committed to scanner.

## Accuracy Evaluation Dataset

Before implementation is considered done, create a small fixture set:

```text
engine/tests/fixtures/tradingview_import/
  urls.jsonl                 # 10 public TV URLs + expected loose labels
  snapshots/{chart_id}.webp  # cached images for deterministic tests
  expected_atoms.jsonl       # manually labeled atoms
```

Metrics:
- `meta_parse_success >= 90%`
- `snapshot_fetch_success >= 90%`
- `family_top1_accuracy >= 60%` before user correction
- `atom_precision >= 70%` for supported atoms
- `unsupported_atom_false_commit = 0` (unsupported visible atoms must never become silent filters)
- `compiled_variant_validity = 100%` (`PatternVariantSpec.from_dict(to_dict())` round trip)

## Differentiators

- **Not drawing extraction**: avoids TV private APIs and ToS risk.
- **Not black-box AI calls**: Vision only proposes atoms; compiler owns engine conditions.
- **Not single-shot backtest**: strict/base/loose ladder makes "too specific" charts usable.
- **Not leaderboard pollution**: `search_origin="tv_import"` keeps user-imported hypotheses separate from library alpha.
- **Replay-first trust**: result page must show similar historical windows, not only Sharpe/win rate.

## Scope

**포함:**
- TV 공개 chart URL 입력 (URL 패턴: `tradingview.com/chart/{symbol}/{id}/`)
- V1.5: 스크린샷 업로드 입력. TradingView idea URL은 메타 구조가 달라 별도 fallback으로만 처리.
- HTML fetch → `s3.tradingview.com/x/{id}_mid.webp` 스냅샷 이미지 자동 추출
- Claude/OpenAI Vision: 이미지 분석 → `VisionPatternSpec.visible_atoms` JSON
- deterministic compiler: `visible_atoms` → `CompiledHypothesisSpec` → strict/base/loose `PatternVariantSpec`
- 사용자 확정 폼: direction, timeframe, trigger block, confirmation blocks, IndicatorFilter 조건
- `tv_import_drafts` + `user_pattern_combos` DB 저장
- Scanner dynamic combo: `LIBRARY_COMBOS + load_active_user_combos()`
- One-shot backtest kick + `GET /research/top-patterns?search_origin=tv_import` 결과 노출

**제외:**
- TV drawing 좌표 직접 추출 (비공개 API, ToS 위반)
- Pine Script 자동 파싱 (V2+)
- 신규 building_block 자동 합성
- 비공개/로그인 필요 차트
- TradingView Ideas URL 완전 지원 (V2)
- Vision이 추출한 가격 레벨을 그대로 백테스트 조건으로 사용하는 것

## TradingView URL 기술 사실

- 공개 published chart URL: `tradingview.com/chart/{SYMBOL}/{CHART_ID}-{slug}/`
- 스냅샷 이미지: `s3.tradingview.com/x/{CHART_ID}_mid.webp` — 공개, 인증 불필요
- `__NEXT_DATA__` JSON: symbol, interval, title, description, author 포함. drawing 좌표 없음.
- Drawing 데이터: 비공개 chart_storage API + owner 인증 필요 → 접근 금지 (ToS)
- **검증됨**: `XrdJuMkf` chart ID로 실제 이미지 fetch 성공 (2026-05-01)

### Vision 추출 가능 정보 (실제 테스트 기반)

차트 `XrdJuMkf` (BTCUSD 45min Ichimoku range breakdown)에서 추출됨:
```json
{
  "symbol": "BTCUSD",
  "exchange": "BITSTAMP",
  "timeframe": "45",
  "indicator": "Ichimoku (9, 26, 52, 26)",
  "pattern_family": "range_breakdown_reversal",
  "direction": "long",
  "price_below_cloud": true,
  "key_annotations": ["Range Zone", "Break zone", "Dropping area"],
  "target_count": 2
}
```

indicator 조건 (일반화 가능한 것):
- `ichimoku_below_cloud = true`
- `range_breakdown_depth > X%` (break zone 이탈 깊이)
- 방향: long (breakdown 후 바운스)

## Technical Approach

### Phase 1 — Chart Data 추출

```python
# engine/integrations/tradingview/fetch.py
def fetch_chart_meta(url: str) -> TVChartMeta:
    """
    1. requests.get(url) → HTML
    2. BeautifulSoup → __NEXT_DATA__ JSON → symbol, interval, title, description
    3. chart_id = re.search(r'/chart/[^/]+/([A-Za-z0-9]+)', url).group(1)
    4. snapshot_url = f"https://s3.tradingview.com/x/{chart_id}_mid.webp"
    5. requests.get(snapshot_url) → image bytes
    Returns: TVChartMeta(symbol, interval, title, description, snapshot_bytes, chart_id)
    """
```

### Phase 2 — Vision 추출

```python
# engine/integrations/tradingview/vision.py
VISION_SCHEMA = {
    "direction": "long|short|neutral",
    "timeframe": "str (e.g. '45', '1h', '4h')",
    "pattern_family": "breakout|breakdown_reversal|squeeze_breakout|liquidity_sweep|trend_pullback|unknown",
    "visible_indicators": ["list of detected indicators"],
    "visible_annotations": ["list of text labels visible"],
    "visible_atoms": [{"kind": "rsi_oversold", "confidence": 0.0}],
    "support_resistance_notes": ["stored for explanation only"],
    "confidence": "0.0-1.0"
}

def extract_pattern_spec(meta: TVChartMeta) -> VisionPatternSpec:
    """
    Claude Vision API 호출.
    Prompt: "이 차트에서 패턴 조건을 추출하라. 가격 레벨이 아닌 지표 조건만.
             JSON schema: {VISION_SCHEMA}"
    반환: VisionPatternSpec (prefill용, 권위 없음)
    """
```

### Phase 3 — Compiler + Estimate

```python
# engine/integrations/tradingview/compiler.py
def compile_hypothesis(spec: VisionPatternSpec, meta: TVChartMeta) -> CompiledHypothesisSpec:
    """
    1. Map supported visible_atoms through fixed allowlist.
    2. Select base PatternObjectCombo from pattern_family.
    3. Generate strict/base/loose PatternVariantSpec siblings.
    4. Preserve unsupported atoms for UI diagnostics; never silently drop into filters.
    """
```

```python
# engine/integrations/tradingview/estimate.py
def estimate_import_variant(variant: PatternVariantSpec) -> ImportDiagnostics:
    """
    Fast preflight over local parquet feature windows.
    Returns signal count, per-filter dropoff, warnings, and relaxation proposals.
    This runs before Supabase commit.
    """
```

### Phase 4 — DB + Dynamic Combos

```sql
-- Migration: tv_import_drafts
CREATE TABLE tv_import_drafts (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url            text NOT NULL,
    source_type           text NOT NULL CHECK (source_type IN ('tradingview_chart','tradingview_idea','image_upload')),
    chart_id              text,
    snapshot_url          text,
    snapshot_storage_path text,
    symbol                text,
    exchange              text,
    timeframe_raw         text,
    timeframe_engine      text,
    title                 text,
    description           text,
    vision_spec           jsonb DEFAULT '{}',
    compiler_spec         jsonb DEFAULT '{}',
    diagnostics           jsonb DEFAULT '{}',
    status                text DEFAULT 'draft' CHECK (status IN ('draft','committed','rejected','expired')),
    created_by            text,
    created_at            timestamptz DEFAULT now(),
    expires_at            timestamptz DEFAULT (now() + interval '7 days')
);

-- Migration: user_pattern_combos
CREATE TABLE user_pattern_combos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        uuid REFERENCES tv_import_drafts(id),
    variant_id      uuid UNIQUE NOT NULL,
    source_url      text NOT NULL,
    chart_id        text NOT NULL,
    snapshot_url    text,
    symbol          text,
    timeframe       text,
    direction       text CHECK (direction IN ('long', 'short')),
    pattern_family  text,
    trigger_block    text,
    confirmation_blocks jsonb DEFAULT '[]',
    indicator_filters jsonb DEFAULT '[]',  -- W-0366 IndicatorFilter 직렬화
    phase_overrides jsonb DEFAULT '{}',
    search_origin   text DEFAULT 'tv_import',
    strictness      text DEFAULT 'base' CHECK (strictness IN ('strict','base','loose')),
    diagnostics     jsonb DEFAULT '{}',
    status          text DEFAULT 'pending' CHECK (status IN ('pending','active','disabled','draft_only')),
    created_by      text,
    created_at      timestamptz DEFAULT now(),
    last_scan_at    timestamptz,
    max_active      int DEFAULT 10  -- 사용자당 active 한도
);
```

```python
# engine/research/pattern_scan/user_combos.py
def load_active_user_combos() -> list[PatternCombo]:
    """Supabase에서 status='active' 행 조회 → PatternCombo 변환."""
    ...
```

`autoresearch_loop.py:39` 변경 (1줄):
```python
# 기존
combos = LIBRARY_COMBOS
# 변경
combos = LIBRARY_COMBOS + load_active_user_combos()
```

Implementation detail: `AutoResearchLoop.__init__`와 report의 `n_combos` 모두 같은 combo list를 써야 한다.
현재 코드는 scanner 생성과 report에서 각각 `LIBRARY_COMBOS`를 직접 참조하므로, helper로 묶는다.

```python
def load_research_combos() -> list[PatternCombo]:
    return LIBRARY_COMBOS + load_active_user_combos()
```

### Phase 5 — API

```
POST /research/tv-import/preview
  Body: { url: string }
  Response: { draft_id, chart_meta, vision_spec, compiler_spec, diagnostics }

POST /research/tv-import/estimate
  Body: { draft_id, edited_hypothesis }
  Response: { compiler_spec, diagnostics, strictness_variants }

POST /research/tv-import/commit
  Body: { draft_id, selected_strictness, edited_hypothesis }
  Response: { variant_id, run_id, estimated_signal_count, diagnostics }
  → one-shot backtest kick
```

### Phase 6 — UI

`app/src/routes/research/import/+page.svelte`:
1. URL 입력 → Preview 버튼 → 스냅샷 이미지 표시 + Hypothesis Card
2. Hypothesis Card: direction/timeframe/family/trigger/confirmations/IndicatorFilter 편집
3. Estimate: strict/base/loose signal count + filter dropoff + unsupported atoms 표시
4. "Register & Backtest" → run_id 반환 → 결과는 TopPatternsPanel에서 확인

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| TV ToS 위반 (비공개 API) | 높음 | 치명 | 공개 HTML + s3 스냅샷만 사용. drawing API 호출 금지 |
| Vision 환각 → 잘못된 family 매핑 | 중 | 중 | 사용자 폼 confirm 강제. Vision은 prefill only |
| 시그널 수 < 30 (통계 무의미) | 중 | 고 | commit 전 estimated_signal_count 표시. < 30이면 warning |
| LIBRARY_COMBOS 회귀 | 낮음 | 고 | load_active_user_combos() 기본값 = [] 보장 |
| user combo 폭증 → scan 느려짐 | 중 | 중 | 사용자당 active 한도 10개. 30일 미실행 자동 disable |
| snapshot URL 만료 | 낮음 | 낮음 | commit 시 image bytes를 Supabase Storage에 미러링 |

### 아키텍처 결정

- [D-0371-01] Vision은 advisory, 권위는 사용자 확정 폼 — "AI 차트 분석 툴" Frozen 회피
- [D-0371-02] LIBRARY_COMBOS 코드 불변 — dynamic combo는 append-only
- [D-0371-03] W-0366 `IndicatorFilter`/`feature_catalog` 계약 재사용 — 신규 조건 DSL 금지
- [D-0371-04] one-shot backtest는 고정 lookback/window 정책 — chart 이후 구간 cherry-picking 차단
- [D-0371-05] search_origin="tv_import" 태그로 library 패턴과 통계 분리
- [D-0371-06] unsupported atom은 UI에 노출만 하고 silent filter로 변환 금지
- [D-0371-07] commit 전 estimate 필수. `n_signals < 30`이면 base commit 차단

## AI Researcher 관점

**핵심 문제: 가격 레벨 vs 지표 조건**

- Vision 추출 결과에서 **가격 레벨** (77,200)은 일반화 불가 → 백테스트 매치 < 5개 → 버려야 함
- **지표 조건** (Ichimoku below cloud + range breakdown depth > 3%) → 180일 데이터에서 30~100개 시그널 → 의미있음
- Vision 프롬프트는 "가격 레벨이 아닌 지표 조건만" 을 명시적으로 지시해야 함

**통계적 유효성:**
- estimated_signal_count < 30 → commit 차단 + "조건을 완화하세요" 안내
- 결과는 `search_origin="tv_import"` 태그로 LIBRARY_COMBOS 결과와 분리 (multiple-testing 보정 풀 오염 방지)
- selection_bias는 기본 `0.7`로 기록한다. 사용자가 이미 눈에 띈 차트를 골라 가져오는 흐름이므로
  사후 선택 편향이 높다. 결과 UI는 library alpha와 같은 신뢰도로 보여주면 안 된다.

## Implementation Plan

| Step | 산출물 | 의존 | 난이도 |
|---|---|---|---|
| 0 | W-0366 `IndicatorFilter`/`feature_catalog` 계약 확인 | 완료 실측 | — |
| 1 | `engine/integrations/tradingview/fetch.py` + 단위 테스트 | 없음 | S |
| 2 | `engine/integrations/tradingview/vision.py` + Vision 프롬프트 검증 | Step 1 | M |
| 3 | `compiler.py` atom allowlist + strict/base/loose 생성 | Step 2 | M |
| 4 | `estimate.py` signal count + filter dropoff | Step 3 | M |
| 5 | Migration `tv_import_drafts`, `user_pattern_combos` + `user_combos.py` | Step 3 | S |
| 6 | `POST /research/tv-import/preview`, `estimate`, `commit` | Step 1-5 | M |
| 7 | Scanner combo loader 통합 + one-shot pipeline trigger | Step 5 | S |
| 8 | UI `/research/import` 3-column workbench | Step 6 | M |
| 9 | fixture 10개 + 통합 테스트 | 전부 | S |

## Exit Criteria

- [ ] AC1: 공개 TV URL 10개 → 스냅샷 이미지 fetch 성공률 ≥ 90%
- [ ] AC2: Vision family 분류 수동 평가 정확도 ≥ 60% (10개 샘플)
- [ ] AC3: `PatternVariantSpec.to_dict/from_dict` round trip 100% (`indicator_filters` 포함)
- [ ] AC4: estimated_signal_count < 30 → commit 차단 (경고 표시)
- [ ] AC5: `GET /research/top-patterns?search_origin=tv_import` 필터로 결과 노출
- [ ] AC6: `LIBRARY_COMBOS` diff 0줄 (기존 12패턴 회귀 없음)
- [ ] AC7: user_combo 0개 상태 → scanner 정상 동작 (기존 결과 동일)
- [ ] AC8: 호출 URL이 모두 공개 도메인 (`tradingview.com`, `s3.tradingview.com`) 한정
- [ ] AC9: unsupported atom이 commit payload의 `indicator_filters`/blocks로 들어가지 않음
- [ ] AC10: strict/base/loose 중 최소 1개가 `n_signals >= 30`이면 UI가 추천 strictness를 표시

## Open Questions

- [ ] [Q-0371-01] Tier gate: Free 사용자 import 가능? Pro+ 한정?
- [ ] [Q-0371-02] 사용자당 active combo 한도: 10개? (현재 가정)
- [ ] [Q-0371-03] Vision unknown (분류 실패) → raw 폼 보여주기 vs 거부?
- [ ] [Q-0371-04] 동일 chart_id 재import → 덮어쓰기 vs 새 variant_id?
- [x] [Q-0371-05] W-0366 IndicatorFilter 직렬화 포맷과 user_pattern_combos.indicator_filters 스키마 정합성 — `PatternVariantSpec.to_dict/from_dict` 포맷 재사용
- [ ] [Q-0371-06] one-shot run을 synchronous API로 둘지 background job/run table로 둘지
- [ ] [Q-0371-07] TradingView idea URL은 V1에서 raw fallback만 둘지 완전 제외할지

## Owner

engine+app

## Canonical Files

- `engine/integrations/tradingview/fetch.py` (신규)
- `engine/integrations/tradingview/vision.py` (신규)
- `engine/integrations/tradingview/compiler.py` (신규)
- `engine/integrations/tradingview/estimate.py` (신규)
- `engine/research/pattern_scan/user_combos.py` (신규)
- `engine/research/autoresearch_loop.py` (1줄 수정)
- `app/src/routes/api/research/tv-import/` (신규)
- `app/src/routes/research/import/+page.svelte` (신규)
- `app/supabase/migrations/` (`tv_import_drafts`, `user_pattern_combos` 테이블)

## Facts

- `s3.tradingview.com/x/{chart_id}_mid.webp` 공개 이미지 접근 검증됨 (XrdJuMkf, 2026-05-01)
- `__NEXT_DATA__` symbol, interval, title, description 포함 / drawing 좌표 없음 (검증됨)
- TV drawing API는 비공개 + chart owner 인증 필요 (ToS 위반, 사용 금지)
- LIBRARY_COMBOS는 12개 PatternObject 하드코딩 (`pattern_object_combos.py:275-304`)
- `autoresearch_loop.py`는 scanner 생성과 report에서 `LIBRARY_COMBOS`를 직접 참조한다. user combos 도입 시 두 지점 모두 같은 combo list를 써야 한다.
- W-0366 `IndicatorFilter`, `PatternVariantSpec.indicator_filters`, `feature_catalog.USER_FACING_FEATURES` 코드 존재 확인됨 (2026-05-01)

## Assumptions

- Vision API (claude-sonnet-4-x) 1회 호출 비용 < $0.01 per chart
- TV 스냅샷 이미지 크기 ≤ 100KB (실측: 27.9KB)
- 사용자당 monthly import ≤ 50회

## Next Steps

1. Q-0371-01/02/06 결정: tier gate, active limit, one-shot run 방식
2. Step 1: `fetch.py` + cached fixture 10개 수집
3. Step 3: compiler allowlist 먼저 구현해 Vision 환각이 engine 조건으로 새지 않게 막기

## Handoff Checklist

- [x] W-0366 계약 코드 존재 확인
- [ ] Q-0371-01~07 결정
- [ ] 구현 + PR + CI green
