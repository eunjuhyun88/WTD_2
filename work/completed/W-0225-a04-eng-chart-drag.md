# W-0225 — A-04-eng Chart Drag PatternDraft engine

> **Source**: `docs/live/W-0220-product-prd-master.md` §8 P0 F-0a + `spec/PRIORITIES.md` P0
> **Owner candidate**: A-next (engine, M size, ~3-4일)
> **Base SHA**: ee2060f9 (origin/main)
> **Branch**: `feat/A04-chart-drag-engine` (PRIORITIES.md 명시)

---

## Goal

차트에서 드래그한 구간(symbol + timeframe + start_ts + end_ts)을 12-feature PatternDraft로 외화하는 **온보딩 입구 #2** — `POST /patterns/draft-from-range`. AI Parser와 동일한 PatternDraftBody 결과 → 같은 downstream(검색, watch).

## Owner

`engine` (range feature extraction, deterministic)

## Scope

### Engine
- `engine/api/routes/patterns.py` — `POST /patterns/draft-from-range` 신규
- `engine/features/range_extractor.py` (신규) — 12-feature 추출 로직
- `engine/api/schemas_pattern_draft.py` — `feature_snapshot: dict[str, float]` 필드가 이미 있는지 확인, 없으면 추가
- `engine/tests/test_patterns_draft_from_range.py` (신규) — 12 keys 검증 + 빈 range 422

### 12 Features (PRD §0.2 명시)
| Feature | Source | 단위 |
|---|---|---|
| `oi_change` | OI 마지막 - 첫 (range 동안) | % |
| `funding_rate` | range 평균 | bp |
| `cvd` | volume delta sum | float |
| `liquidation_volume` | range 합 | USD |
| `price_change` | close 마지막/첫 - 1 | % |
| `volume` | range 합 | USD |
| `btc_correlation` | BTC pearson 60-bar window | -1~1 |
| `higher_lows` | swing low > 직전 swing low (count) | int |
| `lower_highs` | swing high < 직전 swing high (count) | int |
| `compression_ratio` | range ATR / 전 30-bar ATR | float |
| `smart_money_flow` | (taker_buy - taker_sell) / volume | -1~1 |
| `venue_divergence` | binance vs coinbase 가격 spread | bp |

### Phase Path
- Range 안의 PatternState transitions 추출 (state_store.py에서 hydrate)
- `phases: [{phase_id, start_ts, end_ts}]` 자동 생성

## Non-Goals

- App UI 드래그 (별도 W-XXXX A-04-app, M-L size, P1)
- 12 feature 외 추가 feature (DESIGN_V3.1 features = 별도 F-12)
- realtime range update (정적 snapshot only)
- 4h 미만 range (의미 없는 노이즈, 422)
- multi-symbol range (단일 symbol)

## Exit Criteria

- [ ] `POST /patterns/draft-from-range {"symbol":"BTCUSDT","timeframe":"15m","start_ts":...,"end_ts":...}` → 200 + PatternDraftBody (feature_snapshot 12 keys)
- [ ] Range < 4시간 → 422 + 명확한 message
- [ ] 데이터 부족(빈 range) → 422
- [ ] 12 features 모두 None 아님 (1 unit test로 검증)
- [ ] Engine CI green
- [ ] OpenAPI route 등록 + Contract CI green

## Facts

1. **검증된 인프라** (PRD §0.1):
   - `engine/data_cache/` 27 modules — Binance/Bybit/Coinbase OHLCV/perp/onchain
   - `engine/features/canonical_pattern.py` — feature window snapshot
   - `engine/patterns/state_store.py` — phase state durable, hydrate 가능
   - `engine/api/routes/patterns.py` — 24 routes 패턴 명확
2. **downstream 자동 연결**: PatternDraft → `/{slug}/benchmark-search-from-capture` (line 533) 이미 있음.
3. **Q3 결정**: 실제 드래그 UI (PRD §0.2 권고). engine은 (start_ts, end_ts) 받기만 하면 됨.
4. **CVD/funding/oi**: `engine/data_cache/perp_*` modules 활용. 60-bar BTC correlation은 `numpy.corrcoef`.

## Assumptions

1. data_cache가 요청 시점에 해당 (symbol, timeframe, range)에 데이터 보유 — 없으면 422
2. timeframe ∈ {1m, 5m, 15m, 1h, 4h, 1d} (지원 목록 명시)
3. range 4시간 ≥ 16 bars (15m 기준) — 통계 신뢰성 최소선
4. 12 feature 추출은 deterministic, LLM 미사용 (속도 ≤500ms 목표)

## Canonical Files

- `engine/api/routes/patterns.py` (route 추가)
- `engine/features/range_extractor.py` (신규, 12 feature)
- `engine/features/canonical_pattern.py` (참조, 변경 가능성)
- `engine/api/schemas_pattern_draft.py` (feature_snapshot 필드 확인)
- `engine/patterns/state_store.py` (phase path hydrate, 변경 없음)
- `engine/tests/test_patterns_draft_from_range.py` (신규)
- `engine/tests/fixtures/range_extractor_*.json`
- `docs/live/feature-implementation-map.md` (A-04 BUILT)
- `spec/PRIORITIES.md` (A-04-eng done)

## CTO 설계 원칙 적용

### 성능
- 12 feature deterministic 계산, no LLM → ≤500ms 목표
- DB query: state_store hydrate는 SQLite WAL primary (이미 빠름)
- Bulk: 단건 처리, batch 불필요
- async: `asyncio.to_thread` for SQLite read (blocking)
- caching: (symbol, timeframe, exact_range) key cache 검토 (P2)

### 안정성
- 데이터 부족: 4h < range or bars < 16 → 422 명확
- BTC correlation: BTC 데이터 없으면 0.0 + warning, 422 X (graceful)
- venue_divergence: coinbase 데이터 없으면 None
- 멱등성: 같은 input → 같은 output (deterministic, conflict 없음)
- 헬스체크: feature extractor 단위 테스트

### 보안
- App route `requireAuth()` 필수 (다음 PR W-0228)
- Input validation: pydantic timestamp 범위 + symbol 화이트리스트
- 외부 API 호출 없음 (data_cache 내부) → key leak risk 0
- RLS: 결과 ledger 저장은 별도 (W-0223 verdict와 분리)

### 유지보수성
- 계층: routes → range_extractor.py(business) → data_cache(infra)
- feature 추가/제거 시 `range_extractor.py`만 수정 (single source)
- 테스트: 각 12 feature unit + 통합 1개
- 롤백: 신규 endpoint, 기존 영향 0

### Charter 정합성
- ✅ In-Scope: L3 PatternDraft 입구 (Mental model F-0a 명시)
- ✅ Non-Goal 미저촉: chart_polish X (engine만), 자동매매 X

## 다음 단계 (다음 에이전트 첫 30분)

1. `feat/A04-chart-drag-engine` 브랜치 from origin/main
2. `engine/features/range_extractor.py` 12 feature 함수 1개씩 작성 (테스트 동시에)
3. `engine/api/routes/patterns.py` POST /draft-from-range 추가
4. fixtures: 실제 BTC 4h range × 3 sample
5. PR 생성 base=main

## Status

PENDING — Q3 결정 (실제 드래그) lock-in 후 시작. PRD §0.2 권고 = 실제 드래그.
