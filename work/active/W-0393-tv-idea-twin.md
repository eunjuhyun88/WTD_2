# W-0393 — TradingView Idea Twin & Hypothesis Compiler

> Wave: 5 | Priority: P1 | Effort: L (7-8d)
> Charter: In-Scope (TV feature parity, Pine Script generator — 2026-05-01 Frozen 전면 해제)
> Status: 🟡 Design Draft
> Created: 2026-05-03
> Issue: #949
> Absorbs: W-0371 (TV Chart Import Gateway), W-0391-C (TV Import)

## Goal

TradingView URL(아이디어 / published chart) 하나를 붙여넣으면, 우리 엔진이 같은 가설을
컴파일 · 백테스트 · alpha quality 검증 후 통과 시 WatchlistRail 추가 + patterns 테이블 저장,
그리고 **작성자별 alpha 추적(Idea Twin Tracker + Author Reputation Index)으로 시간이 갈수록 강해지는 데이터 자산**을 축적한다.

## Moat Thesis

단순 "TV → 백테스트 import"는 commodity다. 진짜 moat은 시간이 갈수록 강해지는 두 데이터 자산에서 나온다.

1. **Idea Twin Tracker** — 매 import마다 (TV 작성자 예측 vs 우리 엔진 alpha score) 데이터포인트 1개 축적.
   일정 기간 뒤 `actual_outcome`(triple_barrier 결과)를 업데이트해 "아이디어 작성자의 예측이 실제로 얼마나 맞는지" 검증 가능.
2. **Author Reputation Index** — KOL별 누적 backtest로 `win_rate`, `avg_alpha`, `n_imported`를 materialized view로 관리.
   "이 작성자의 아이디어는 follow할 가치가 있는가"를 객관 수치로 보여주는 network effect 데이터 자산.

## Product Thesis — "Chart-to-Hypothesis Compiler"

이 기능을 특별하게 만드는 것은 "AI가 차트를 맞춘다"가 아니라, 트레이더가 본 아이디어를 다음 산출물로 바꾸는 것이다.

1. **Hypothesis Card**: 핵심 조건을 사람이 수정 가능한 형태로 정리
2. **Constraint Ladder**: strict/base/loose 3단계 자동 완화로 표본 수 확보
3. **Evidence Report**: 어떤 조건이 표본을 죽였는지, 어떤 조건이 edge를 만든 것처럼 보이는지 진단
4. **Replay Pack**: 비슷한 과거 구간 10~30개 (사용자가 "진짜 같은 셋업인지" 검수)
5. **Idea Twin Card**: import 후 일정 시간 뒤 "TV 예측 vs 엔진 결과" 자동 업데이트

UX 문구는 "차트를 분석해드립니다"가 아니라 **"이 아이디어를 백테스트 가능한 가설로 바꾸기"** 여야 한다.

## Scope

**포함:**
- TV 공개 아이디어 URL (`tradingview.com/ideas/`, `tradingview.com/chart/{symbol}/{id}/`)
- HTML fetch → `__NEXT_DATA__` JSON → symbol, timeframe, title, description, author, chart_id
- `s3.tradingview.com/x/{id}_mid.webp` 스냅샷 자동 추출
- **Multi-source parser cascade**: Pine Script > Idea 텍스트 LLM > Vision (이미지) 순서로 폴백
- 기존 `app/src/lib/server/pine/classifier.ts` + `engine.ts` 재활용 (Pine 파싱 가속)
- deterministic compiler: visible_atoms → CompiledHypothesisSpec → strict/base/loose PatternVariantSpec
- 사용자 확정 폼 (direction / timeframe / trigger block / confirmation blocks / IndicatorFilter)
- commit 전 estimate 필수 — `n_signals < 30`이면 base commit 차단
- `tv_imports` + `user_pattern_combos` DB 저장 (migration 049)
- **Idea Twin links**: import_id × author_id 매핑 + actual_outcome 업데이트 (30d cron)
- **Author Reputation Index**: materialized view (migration 049)
- Scanner dynamic combo: `LIBRARY_COMBOS + load_active_user_combos()` (1줄 수정)
- One-shot backtest kick + `GET /research/top-patterns?search_origin=tv_import` 노출
- WatchlistRail "Add from TV idea" CTA (alpha 통과 시)
- API: `POST /research/tv-import/preview`, `/estimate`, `/commit`
- UI: `/research/import` 3-column workbench

**제외:**
- TV drawing 좌표 직접 추출 (비공개 API, ToS 위반 — 영구 금지)
- 비공개/로그인 필요 차트
- Vision이 추출한 가격 레벨을 직접 백테스트 조건으로 사용
- 신규 building_block 자동 합성
- AI 차트 분석 자동매매 (Frozen — 2026-05-01 기준 "자동매매" 계속 Frozen)

## Non-Goals

- "AI가 최적 전략을 추천해준다" 포지셔닝 → Vision은 prefill booster일 뿐
- TV private API 호출, drawing 데이터 (ToS 위반)
- 실시간 chart 동기화 (one-shot import만)
- Library 패턴 자동 수정 (user combo는 append-only)

---

## Source: TradingView URL 기술 사실 (검증됨)

| 항목 | 값 | 검증 |
|---|---|---|
| Published chart URL | `tradingview.com/chart/{SYMBOL}/{CHART_ID}-{slug}/` | 실측 |
| Idea URL | `tradingview.com/ideas/{slug}/` | 실측 |
| 스냅샷 이미지 | `s3.tradingview.com/x/{CHART_ID}_mid.webp` 공개, 인증 불필요 | `XrdJuMkf` 27.9KB fetch 성공 |
| `__NEXT_DATA__` | symbol, interval, title, description, author 포함 / drawing 좌표 없음 | 실측 |
| Drawing API | 비공개 + chart owner 인증 필요 → ToS 위반 | 접근 금지 확인 |
| Pine Script 공개 여부 | Published script 페이지에서 HTML 내 Pine 코드 포함 여부 — Q-3921 실측 필요 | 미검증 |

### Vision 추출 샘플 (실측: chart XrdJuMkf, BTCUSD 45min Ichimoku)

```json
{
  "symbol": "BTCUSD", "exchange": "BITSTAMP", "timeframe": "45",
  "indicator": "Ichimoku (9, 26, 52, 26)",
  "pattern_family": "range_breakdown_reversal", "direction": "long",
  "price_below_cloud": true,
  "key_annotations": ["Range Zone", "Break zone", "Dropping area"],
  "target_count": 2
}
```

---

## Multi-Source Parser Cascade

```
입력 URL
  │
  ├─► Pine Script 감지? ─── YES → Pine Parser (app/src/lib/server/pine/ 재활용)
  │                                    ↓
  │                              visible_atoms (고정밀)
  │
  ├─► Idea 텍스트 충분? ── YES → LLM text parser (Haiku-class)
  │                                    ↓
  │                              visible_atoms (중정밀)
  │
  └─► 나머지 ─────────────────── Vision (claude-sonnet-4-6, 이미지 기반)
                                        ↓
                                  visible_atoms (저정밀, 마지막 폴백)
```

| Source tier | 우선순위 | 정밀도 | 비용 |
|---|---|---|---|
| Pine Script (published) | 1st | 높음 (deterministic) | ~$0 |
| Idea text (LLM) | 2nd | 중간 | ~$0.001 |
| Vision (image) | 3rd (fallback) | 낮음 | ~$0.01 |

**Pine 파싱 전략**: `app/src/lib/server/pine/classifier.ts`의 keyword scoring 패턴을 엔진에서 재구현하지 않고,
`engine/integrations/tradingview/pine_parser.py`가 동일한 로직을 Python으로 포팅하되,
**지표 조건 추출**에 집중한다 (template matching이 아닌 indicator filter 추출).

---

## Accuracy Strategy (4-Layer)

| Layer | 질문 | 향상 방법 | 실패 시 동작 |
|---|---|---|---|
| Source | URL → symbol/timeframe/snapshot 안정적으로 추출? | `__NEXT_DATA__` + URL regex 교차검증 | manual form으로 degrade |
| Perception | Pine/text/image → 지표 조건이 보이나? | cascade: Pine > text > Vision | 빈 prefill로 계속 |
| Compilation | visible_atoms → 엔진 조건 변환됐나? | deterministic allowlist + feature_catalog | unsupported atom 표시 |
| Statistics | backtest 표본·결과 의미있나? | n≥30 gate + strict/base/loose | commit 차단 또는 loose 제안 |

**핵심 제약**: Vision 추출 결과에서 **가격 레벨** (e.g., 77,200)은 일반화 불가 → 무시.
**지표 조건**만 (Ichimoku below cloud, RSI < 35 등) 컴파일 대상.

---

## Data Contracts

### TVImportDraft

```python
@dataclass(frozen=True)
class TVImportDraft:
    draft_id:               str
    source_url:             str
    chart_id:               str
    source_type:            str   # "tradingview_chart" | "tradingview_idea" | "image_upload"
    parser_tier:            str   # "pine" | "text" | "vision"
    symbol:                 str | None
    exchange:               str | None
    timeframe_raw:          str | None
    timeframe_engine:       str | None
    title:                  str | None
    description:            str | None
    author_username:        str | None
    author_display_name:    str | None
    snapshot_url:           str | None
    snapshot_storage_path:  str | None
    vision_spec:            VisionPatternSpec
    compiler_spec:          CompiledHypothesisSpec
    diagnostics:            ImportDiagnostics
    status:                 str   # "draft" | "committed" | "rejected" | "expired"
```

### VisionPatternSpec

```python
@dataclass(frozen=True)
class VisionPatternSpec:
    direction:                  str | None
    pattern_family:             str
    visible_indicators:         list[str]
    visible_annotations:        list[str]
    support_resistance_notes:   list[str]   # 설명용만, 백테스트 조건 금지
    visible_atoms:              list[dict]  # [{"kind": "rsi_oversold", "confidence": 0.74}]
    confidence:                 float
    evidence:                   list[dict]
    parser_tier:                str         # "pine" | "text" | "vision"
```

### CompiledHypothesisSpec

```python
@dataclass(frozen=True)
class CompiledHypothesisSpec:
    base_pattern_slug:          str
    variant_slug:               str
    direction:                  str
    timeframe:                  str
    trigger_block:              str
    confirmation_blocks:        list[str]
    indicator_filters:          list[IndicatorFilter]   # W-0366 계약 재사용
    unsupported_atoms:          list[dict]
    compiler_confidence:        float
    strictness_variants:        dict[str, PatternVariantSpec]   # strict/base/loose
```

### ImportDiagnostics

```python
@dataclass(frozen=True)
class ImportDiagnostics:
    estimated_signal_count: int
    filter_dropoff:         list[dict]    # [{"filter": "rsi14 < 35", "before": 920, "after": 188}]
    min_sample_pass:        bool
    leakage_risk:           str           # "low" | "medium" | "high"
    selection_bias:         float         # default 0.7 (사후 선택 편향 상수)
    warnings:               list[str]
    suggested_relaxations:  list[dict]
```

---

## Compiler Design

Vision/text/Pine output → deterministic compiler 통과 필수.
**LLM free-form output이 직접 엔진 조건이 되어서는 안 된다.**

### Atom → Engine Mapping (Allowlist)

| Visible atom | Engine representation | strict / base / loose |
|---|---|---|
| `rsi_oversold` | `IndicatorFilter("rsi14", "<", 35)` | 30 / 35 / 40 |
| `rsi_overbought` | `IndicatorFilter("rsi14", ">", 65)` | 70 / 65 / 60 |
| `volume_spike` | `IndicatorFilter("vol_ratio_3", ">", 1.5)` | 2.0 / 1.5 / 1.2 |
| `bb_squeeze` | `IndicatorFilter("bb_width", "<", pct_threshold)` | 현재 percentile 가용 시만 |
| `price_below_cloud` | unsupported V1 (Ichimoku feature 없으면) | unsupported atom 표시 |
| `breakout` | trigger block `breakout_above_high` | 기존 block |
| `range_breakdown` | `sweep_below_low` or `spring_breach` | direction-dependent |
| `liquidity_sweep` | trigger block `sweep_below_low` | long reversal only |
| `compression` | confirmation block `sideways_compression` | 기존 block |
| `reclaim_after_dump` | confirmation block `reclaim_after_dump` | 기존 block |
| `funding_extreme` | `IndicatorFilter("funding_rate", "<", x)` or block | direction-dependent |
| `oi_spike` | `IndicatorFilter("oi_change_24h", ">", x)` | feature 존재 시 |

### Pattern Family → Base Combo

| pattern_family | default base pattern | fallback |
|---|---|---|
| `breakout` | `volatility_squeeze_breakout` | `COMPRESSION_BREAKOUT_REVERSAL` |
| `breakdown_reversal` | `wyckoff_spring_reversal` | `liquidity_sweep_reversal` |
| `liquidity_sweep` | `liquidity_sweep_reversal` | `wyckoff_spring_reversal` |
| `squeeze_breakout` | `volatility_squeeze_breakout` | `compression_breakout_reversal` |
| `trend_pullback` | `alpha_confluence` | RSI filters |
| `unknown` | no auto commit | raw Hypothesis Builder only |

### Strict/Base/Loose Variant Generation

```python
strict = PatternVariantSpec(..., variant_slug="tv-{chart_id}-strict", indicator_filters=[rsi14 < 30, vol_ratio_3 > 2.0])
base   = PatternVariantSpec(..., variant_slug="tv-{chart_id}-base",   indicator_filters=[rsi14 < 35, vol_ratio_3 > 1.5])
loose  = PatternVariantSpec(..., variant_slug="tv-{chart_id}-loose",  indicator_filters=[rsi14 < 40, vol_ratio_3 > 1.2])
```

`base.n_signals < 30` → UI가 `loose` 추천. `loose.n_signals < 30` → draft 저장만, scanner 등록 차단.

---

## Phase 5: Moat Layer — Idea Twin Tracker + Author Reputation

### Idea Twin Tracker

```
Import 시점:
  tv_imports 행 생성 + idea_twin_links(import_id, author_id, engine_alpha_score_at_import) 기록

30일 후 cron:
  triple_barrier_outcome 조회 → idea_twin_links.actual_outcome 업데이트
  "TV 예측이 맞았나?" 데이터포인트 1개 축적

누적 효과:
  n_imports 증가 → author별 실제 alpha decay 곡선 가시화
```

### Author Reputation Index (materialized view)

```sql
CREATE MATERIALIZED VIEW author_reputation_index AS
SELECT
    author_username,
    COUNT(*)                            AS n_imported,
    AVG(engine_alpha_score_at_import)   AS avg_alpha_score,
    AVG(CASE WHEN actual_outcome = 'WIN' THEN 1.0 ELSE 0.0 END)  AS win_rate,
    AVG(actual_outcome_pct)             AS avg_return,
    MAX(imported_at)                    AS last_import_at,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY engine_alpha_score_at_import) AS median_alpha
FROM idea_twin_links
WHERE actual_outcome IS NOT NULL  -- 결과가 확정된 것만
GROUP BY author_username;
```

데이터포인트 n < 5이면 `win_rate` 표시 차단 (통계적 유효성 보호).

---

## Database Schema (Migration 049)

```sql
-- tv_imports: URL 수집 + 파서 결과
CREATE TABLE tv_imports (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url            text NOT NULL,
    source_type           text NOT NULL CHECK (source_type IN ('tradingview_chart','tradingview_idea','image_upload')),
    parser_tier           text NOT NULL CHECK (parser_tier IN ('pine','text','vision')),
    chart_id              text,
    snapshot_url          text,
    snapshot_storage_path text,
    symbol                text,
    exchange              text,
    timeframe_raw         text,
    timeframe_engine      text,
    title                 text,
    description           text,
    author_username       text,
    author_display_name   text,
    vision_spec           jsonb DEFAULT '{}',
    compiler_spec         jsonb DEFAULT '{}',
    diagnostics           jsonb DEFAULT '{}',
    status                text DEFAULT 'draft' CHECK (status IN ('draft','committed','rejected','expired')),
    created_by            text,
    created_at            timestamptz DEFAULT now(),
    expires_at            timestamptz DEFAULT (now() + interval '7 days')
);

-- user_pattern_combos: commit된 가설 → scanner 연결
CREATE TABLE user_pattern_combos (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id           uuid REFERENCES tv_imports(id),
    variant_id          uuid UNIQUE NOT NULL,
    source_url          text NOT NULL,
    chart_id            text NOT NULL,
    snapshot_url        text,
    symbol              text,
    timeframe           text,
    direction           text CHECK (direction IN ('long','short')),
    pattern_family      text,
    trigger_block       text,
    confirmation_blocks jsonb DEFAULT '[]',
    indicator_filters   jsonb DEFAULT '[]',   -- PatternVariantSpec.to_dict() 포맷
    phase_overrides     jsonb DEFAULT '{}',
    search_origin       text DEFAULT 'tv_import',
    strictness          text DEFAULT 'base' CHECK (strictness IN ('strict','base','loose')),
    diagnostics         jsonb DEFAULT '{}',
    status              text DEFAULT 'pending' CHECK (status IN ('pending','active','disabled','draft_only')),
    created_by          text,
    created_at          timestamptz DEFAULT now(),
    last_scan_at        timestamptz,
    max_active          int DEFAULT 10
);

-- idea_twin_links: Idea Twin Tracker 핵심 테이블
CREATE TABLE idea_twin_links (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id                   uuid REFERENCES tv_imports(id),
    combo_id                    uuid REFERENCES user_pattern_combos(id),
    author_username             text NOT NULL,
    author_display_name         text,
    engine_alpha_score_at_import float,           -- import 시점 엔진 alpha score
    actual_outcome              text,             -- NULL → 확정 전 | 'WIN' | 'LOSS' | 'NEUTRAL'
    actual_outcome_pct          float,            -- triple_barrier 결과 수익률
    outcome_resolved_at         timestamptz,
    horizon_bars                int DEFAULT 30,   -- triple_barrier horizon
    imported_at                 timestamptz DEFAULT now()
);
CREATE INDEX idea_twin_links_author_idx ON idea_twin_links(author_username);
CREATE INDEX idea_twin_links_unresolved_idx ON idea_twin_links(outcome_resolved_at) WHERE actual_outcome IS NULL;

-- author_reputation_index: materialized view (위 정의 참조)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY author_reputation_index; (import commit 시 trigger)
```

---

## API Endpoints

```
POST /research/tv-import/preview
  Body:     { url: string }
  Response: { draft_id, chart_meta, parser_tier, vision_spec, compiler_spec, diagnostics }

POST /research/tv-import/estimate
  Body:     { draft_id, edited_hypothesis }
  Response: { compiler_spec, diagnostics, strictness_variants }

POST /research/tv-import/commit
  Body:     { draft_id, selected_strictness, edited_hypothesis }
  Response: { variant_id, run_id, estimated_signal_count, diagnostics }
  Side effects: → idea_twin_links 행 생성, → one-shot backtest kick

GET /research/tv-import/author/{username}
  Response: { author_reputation | null, recent_imports: TVImportSummary[] }

GET /research/tv-import/twin/{import_id}
  Response: { twin_status, engine_alpha, actual_outcome | null, horizon_remaining_days }
```

---

## Implementation Plan

| Phase | 산출물 | 기간 | 파일 |
|---|---|---|---|
| P1 | Source ingestion: URL → meta + snapshot | 1d | `engine/integrations/tradingview/fetch.py` + tests |
| P2 | Multi-source parser cascade (Pine→Text→Vision) | 2d | `pine_parser.py`, `text_parser.py`, `vision_parser.py` |
| P3 | Compiler: atoms → IndicatorFilter[] + strict/base/loose | 1d | `compiler.py`, `estimate.py` |
| P4 | Migration 049 + API 3 endpoints + scanner combo loader | 1d | migration SQL, `user_combos.py`, route handlers |
| P5 | **MOAT**: Idea Twin Tracker + Author Reputation refresh | 2d | `idea_twin_store.py`, `author_reputation.py`, cron |
| P6 | UI: `/research/import` workbench + WatchlistRail CTA | 1d | `+page.svelte`, WatchlistRail 버튼 |

**구현 순서 원칙**: P1 → P3 먼저 (Vision 환각이 엔진 조건으로 새는 것을 allowlist로 막기). P5는 P4 완료 후.

---

## Engine Module Structure

```
engine/integrations/tradingview/
  __init__.py
  fetch.py          # URL → TVChartMeta (HTML + snapshot + __NEXT_DATA__)
  pine_parser.py    # Pine Script → visible_atoms (app/pine/classifier.ts 로직 Python 포팅)
  text_parser.py    # Idea 텍스트 → visible_atoms (Haiku LLM)
  vision_parser.py  # 이미지 → VisionPatternSpec (claude-sonnet-4-6)
  compiler.py       # visible_atoms → CompiledHypothesisSpec (deterministic)
  estimate.py       # variant → ImportDiagnostics (fast preflight)
  idea_twin_store.py  # idea_twin_links CRUD
  author_reputation.py  # matview refresh + reputation query

engine/research/pattern_scan/
  user_combos.py    # load_active_user_combos() → list[PatternCombo]

engine/research/autoresearch_loop.py
  # 1줄 수정: LIBRARY_COMBOS → load_research_combos()
```

**`load_research_combos()` helper (autoresearch_loop.py에 추가):**

```python
def load_research_combos() -> list[PatternCombo]:
    return LIBRARY_COMBOS + load_active_user_combos()
```

---

## App Module Structure

```
app/src/routes/
  api/research/tv-import/
    preview/+server.ts
    estimate/+server.ts
    commit/+server.ts
    author/[username]/+server.ts
    twin/[importId]/+server.ts
  research/import/
    +page.svelte          # 3-column workbench

app/src/lib/components/
  TVImportWorkbench/
    HypothesisCard.svelte
    ConstraintLadder.svelte
    ReplayPack.svelte
    IdeaTwinCard.svelte   # 30d 후 결과 표시
```

---

## Accuracy Evaluation Fixtures

```
engine/tests/fixtures/tradingview_import/
  urls.jsonl                  # 10 공개 TV URL + expected loose labels
  snapshots/{chart_id}.webp   # 캐시된 이미지 (결정론적 테스트)
  expected_atoms.jsonl        # 수동 레이블링된 atoms
```

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| TV ToS 위반 (비공개 API) | 높음 | 치명 | 공개 HTML + s3 스냅샷만. drawing API 영구 금지 |
| Vision 환각 → 잘못된 family | 중 | 중 | compiler allowlist 필수 통과. Vision은 prefill only |
| n_signals < 30 (통계 무의미) | 중 | 고 | commit 전 estimate 필수. < 30 → 차단 |
| LIBRARY_COMBOS 회귀 | 낮음 | 고 | load_active_user_combos() 기본값 = [] 보장 |
| user combo 폭증 → scan 느려짐 | 중 | 중 | 사용자당 active 한도 10개. 30일 미실행 auto-disable |
| snapshot URL 만료 | 낮음 | 낮음 | commit 시 image bytes → Supabase Storage 미러링 |
| Pine Script 커버리지 미지수 | 중 | 중 | P1에서 50-sample 측정, 낮으면 text tier 우선 |
| Author reputation 통계 부족 | 낮음 | 낮음 | n < 5이면 win_rate 표시 차단 |
| SPA idea 페이지 (JS 필요) | 중 | 중 | WebFetch 먼저, HTML fallback 실패 시 agent-browser CLI |

### Dependencies

- W-0366 `IndicatorFilter`, `PatternVariantSpec`, `feature_catalog` — 코드 존재 확인됨
- `app/src/lib/server/pine/` classifier + engine — 이미 존재, Pine 파싱 가속에 재활용
- `LIBRARY_COMBOS` 12개 (`pattern_object_combos.py:275-304`) — 불변 유지
- `autoresearch_loop.py` — 1줄만 수정 (`load_research_combos()`)

### Rollback Plan

1. `user_pattern_combos` status → 'disabled' 일괄 (scanner 즉시 제외)
2. `load_active_user_combos()` 기본값 [] → 코드 변경 없이 빈 리스트 반환 가능
3. migration 049 rollback: CASCADE DROP tv_imports, user_pattern_combos, idea_twin_links

---

## AI Researcher 관점

**핵심 편향 문제**: 사용자가 이미 "눈에 띈" 차트를 골라 import → 사후 선택 편향(selection_bias = 0.7 상수).
결과 UI는 library alpha와 같은 신뢰도로 표시하면 안 됨. 별도 섹션, 별도 배지 필수.

**BH-FDR 보호**: `search_origin="tv_import"` 태그로 LIBRARY_COMBOS 결과와 multiple-testing 보정 풀 분리.

**Idea Twin 통계적 유효성**:
- author당 n < 5 → win_rate 미표시
- n ≥ 30 → Welch t-test로 "이 작성자의 아이디어가 유의미하게 수익성 있는가" 검증 가능
- alpha decay 곡선: import 후 1주/2주/4주 시점 outcome 비교로 아이디어 유효 기간 측정

**Pine 파서 한계**: Pine v5/v6 indicator 함수 매핑은 deterministic하지만, 커스텀 함수 / 복잡한 조건식은
text parser로 fallback. `unsupported_atom`으로 표시, silent compile 금지.

---

## Decisions

- [D-3921] **WebFetch first, agent-browser CLI fallback** — TV idea 페이지 SPA 여부에 따라 전환. Playwright 항상 사용은 오버킬.
- [D-3922] **Pine > Text > Vision cascade** — 가장 정확한 source부터. Vision-first는 비용 대비 낮은 정확도.
- [D-3923] **W-0366 IndicatorFilter 재사용** — 신규 DSL 금지. divergence risk.
- [D-3924] **Constraint Ladder** — 단일 threshold 거절: 너무 rigid, 표본 수 확보 불가.
- [D-3925] **Phase 5 (Moat) 같은 W에 포함** — split 거절: moat이 늦게 ship되면 의미 없음. 경쟁우위는 일찍 축적할수록 가치.
- [D-3926] **matview refresh on commit** — cron 거절: import 즉시 author reputation 반영이 UX상 중요.
- [D-3927] **`app/src/lib/server/pine/` 재활용** — 신규 Python Pine 파서 단독 구현 거절: 이미 10개 템플릿 + classifier + engine 존재. Python 포팅만으로 충분.

---

## Open Questions

- [ ] [Q-3921] Pine Script 공개 커버리지 — published TV idea 중 Pine 코드 포함 비율 (P1 50-sample 실측)
- [ ] [Q-3922] TV idea 페이지 SPA 여부 — `__NEXT_DATA__` 동작 확인 필요 (chart vs idea URL 차이)
- [ ] [Q-3923] Author Reputation 가중치 — recency bias vs sample size balance (첫 구현은 단순 평균)
- [ ] [Q-3924] Vision parser 비용 제어 — import 50회/월 × $0.01 = $0.50/user. tier gate 필요?
- [ ] [Q-3925] Pine→IndicatorFilter 매핑 미커버 case fallback 전략 (text tier vs unsupported atom)
- [ ] [Q-3926] WatchlistRail "Add" 후 alert 트리거 정책 (alpha 통과 즉시 vs 사용자 확인 후)
- [ ] [Q-3927] 동일 chart_id 재import → 덮어쓰기 vs 신규 variant_id 생성
- [ ] [Q-3928] one-shot backtest run → synchronous vs background job + run table

---

## Exit Criteria

- [ ] AC1: 공개 TV URL 10개 → 스냅샷 fetch 성공률 ≥ 90%
- [ ] AC2: `__NEXT_DATA__` symbol / timeframe 파싱 성공률 ≥ 95%
- [ ] AC3: Vision family 분류 정확도 ≥ 60% (10개 수동 평가)
- [ ] AC4: `PatternVariantSpec.to_dict/from_dict` round trip 100% (indicator_filters 포함)
- [ ] AC5: estimated_signal_count < 30 → commit 차단 (경고 표시)
- [ ] AC6: `GET /research/top-patterns?search_origin=tv_import` 필터로 결과 노출
- [ ] AC7: `LIBRARY_COMBOS` diff 0줄 (기존 12패턴 회귀 없음)
- [ ] AC8: user_combo 0개 → scanner 정상 동작 (기존 결과 동일)
- [ ] AC9: 호출 URL 모두 `tradingview.com`, `s3.tradingview.com` 한정
- [ ] AC10: unsupported atom이 commit payload의 indicator_filters/blocks에 들어가지 않음
- [ ] AC11: `idea_twin_links` 행이 commit 시 생성되고, 30d cron이 actual_outcome 업데이트
- [ ] AC12: author_reputation_index matview가 commit 시 refresh되고, n < 5이면 win_rate null 반환

---

## Owner

engine + app

## Canonical Files

**Engine (신규)**
- `engine/integrations/tradingview/fetch.py`
- `engine/integrations/tradingview/pine_parser.py`
- `engine/integrations/tradingview/text_parser.py`
- `engine/integrations/tradingview/vision_parser.py`
- `engine/integrations/tradingview/compiler.py`
- `engine/integrations/tradingview/estimate.py`
- `engine/integrations/tradingview/idea_twin_store.py`
- `engine/integrations/tradingview/author_reputation.py`
- `engine/research/pattern_scan/user_combos.py`

**Engine (수정)**
- `engine/research/autoresearch_loop.py` (1줄: load_research_combos())

**App (신규)**
- `app/src/routes/api/research/tv-import/preview/+server.ts`
- `app/src/routes/api/research/tv-import/estimate/+server.ts`
- `app/src/routes/api/research/tv-import/commit/+server.ts`
- `app/src/routes/api/research/tv-import/author/[username]/+server.ts`
- `app/src/routes/api/research/tv-import/twin/[importId]/+server.ts`
- `app/src/routes/research/import/+page.svelte`
- `app/src/lib/components/TVImportWorkbench/*.svelte`

**DB**
- `app/supabase/migrations/049_tv_imports.sql`

## Facts

- `s3.tradingview.com/x/{chart_id}_mid.webp` 공개 이미지 접근 검증됨 (`XrdJuMkf`, 27.9KB, 2026-05-01)
- `__NEXT_DATA__` symbol/interval/title/description/author 포함, drawing 좌표 없음 (검증됨)
- TV drawing API 비공개 + owner 인증 필요 (ToS 위반, 접근 금지 확인)
- `LIBRARY_COMBOS` 12개 하드코딩 (`pattern_object_combos.py:275-304`)
- `autoresearch_loop.py`가 scanner 생성과 report에서 `LIBRARY_COMBOS`를 직접 참조 → user combos 도입 시 두 지점 모두 `load_research_combos()` 써야 함
- `IndicatorFilter` (`pattern_search.py:191`), `PatternVariantSpec` (`:226`), `feature_catalog.USER_FACING_FEATURES` — 코드 존재 확인됨
- `app/src/lib/server/pine/` — classifier.ts + engine.ts + registry.ts + 10개 템플릿 존재 (2026-05-03 확인)
- 최신 migration: `048_formula_evidence.sql` → 신규는 `049`

## Assumptions

- Vision API (claude-sonnet-4-6) 1회 호출 < $0.01/chart
- TV 스냅샷 이미지 ≤ 100KB (실측 27.9KB)
- 사용자당 monthly import ≤ 50회
- author_reputation matview REFRESH CONCURRENTLY ≤ 500ms (import 0.5s budget 내)

## Next Steps

1. Q-3927 (동일 chart_id 재import) + Q-3928 (sync vs bg run) 결정
2. P1: `fetch.py` + TV URL 10개 캐시 fixture 수집
3. P2 Pine coverage 실측: published TV idea 50개 샘플에서 Pine 코드 포함 비율 측정
4. P3: compiler allowlist 먼저 (Vision 환각 엔진 조건 유입 차단)

## Handoff Checklist

- [x] W-0366 계약 코드 존재 확인
- [x] app/src/lib/server/pine/ 기존 인프라 확인
- [x] 최신 migration 번호 확인 (048 → 049)
- [ ] Q-3927~3928 결정
- [ ] GitHub Issue 생성
- [ ] 구현 + PR + CI green
