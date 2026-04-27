# W-0242 — A-04-eng: Chart Drag Engine `POST /patterns/draft-from-range`

> Wave 4 P0 | Owner: engine | Branch: `feat/A04-chart-drag-engine`
> **독립 실행 가능 — A-04-app(UI)은 이미 Wave 2에서 완료됨. engine만 남음**

---

## Goal

차트 시간 범위 선택 → 12개 feature 자동 추출 → `PatternDraftBody` 반환. Core Loop 입구 #2.

## Owner

engine

---

## CTO 설계

### 현재 상태 (코드 실측)

- `engine/api/routes/patterns.py` — `/draft-from-range` route 없음
- `engine/features/compute.py` — feature 계산 함수들 존재
- `engine/features/columns.py` — `_CORE_FEATURE_COLUMNS` tuple (40+ col)
- `engine/data_cache/` — OHLCV, OI, CVD 수집 모듈 존재
- A-04-app UI — Wave 2 완료 (PR #386)

### 12개 추출 Features (PRD §12.1 확정)

```python
RANGE_FEATURES = [
    "oi_change",          # OI Δ% in range
    "funding_rate",       # avg funding in range
    "cvd",                # cumulative delta
    "liquidation_volume", # total liq in range
    "price_change",       # price Δ% open→close
    "volume",             # total volume
    "btc_correlation",    # corr with BTC in range
    "higher_lows",        # bool: ascending lows
    "lower_highs",        # bool: descending highs
    "compression_ratio",  # high-low range compression
    "smart_money_flow",   # large trade CVD
    "venue_divergence",   # Binance vs Bybit delta
]
```

### API 계약

```
POST /patterns/draft-from-range
  → require_auth()
  → body: {
      symbol: str,
      timeframe: str,   # "1h" | "4h" | "1d"
      start_ts: int,    # Unix ms
      end_ts: int,
    }
  ← PatternDraftBody + feature_snapshot (12 keys)
  ← 422 if: range < 4h / data unavailable / symbol unknown
```

### 보안/안정성

- `require_auth()` 필수
- range < 4h → 422 `{ "error": "range_too_short" }`
- feature 계산 실패 → 422, partial 반환 금지 (12개 전부 필요)
- 외부 데이터 조회: `asyncio.to_thread()` 래핑 (blocking I/O)

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/features/range_extractor.py` | 신규 — range → 12 feature 추출 |
| `engine/api/routes/patterns.py` | 변경 — `POST /patterns/draft-from-range` route 추가 |
| `app/src/routes/api/patterns/draft-from-range/+server.ts` | 신규 — app proxy route |
| `engine/tests/test_draft_from_range.py` | 변경 — 기존 stub → 실 구현 테스트 |

## Non-Goals

- 실시간 드래그 중 미리보기 (확정 후 1회 추출)
- 12개 초과 feature 추출 (확장은 별도 work item)
- 멀티 심볼 비교

## Exit Criteria

- [ ] `POST /patterns/draft-from-range { symbol, timeframe, start_ts, end_ts }` → 200
- [ ] 응답 `feature_snapshot`에 12개 키 모두 포함
- [ ] range < 4h → 422 `{ "error": "range_too_short" }`
- [ ] 데이터 없는 range → 422
- [ ] Engine CI ✅

## Facts

1. `engine/tests/test_draft_from_range.py` — 이미 파일 존재 (stub). 실 구현으로 교체 필요.
2. `engine/features/compute.py` — feature 계산 함수 모음. `range_extractor.py`에서 재사용.
3. `engine/data_cache/` — `binance_cache.py`, `bybit_cache.py` 등. 과거 데이터 조회 가능.
4. Q3 lock-in: **실제 드래그 UI** (form fallback). engine은 ts 기반이라 무관.

## Assumptions

1. start_ts, end_ts는 Unix milliseconds.
2. 심볼은 `engine/data_cache/` 지원 종목 (BTCUSDT 등 derivatives).
3. `feature_snapshot`은 `PatternDraftBody.feature_snapshot` 필드로 포함.

## Canonical Files

- `engine/features/range_extractor.py` (신규)
- `engine/api/routes/patterns.py` (변경)
- `app/src/routes/api/patterns/draft-from-range/+server.ts` (신규)
- `engine/tests/test_draft_from_range.py` (변경)

## Decisions

- **12개 feature 고정** (PRD §3 Chart Selection 기준)
- **range 최소값**: 4h (충분한 feature 추출 보장)
- **blocking I/O**: `asyncio.to_thread()` 래핑

## Next Steps

1. `engine/features/compute.py` 기존 feature 계산 함수 목록 파악
2. `engine/data_cache/` 과거 데이터 조회 API 확인
3. `range_extractor.py` 작성
4. route 추가 + proxy
5. test 작성

## Handoff Checklist

- [ ] `engine/features/compute.py` 재사용 가능한 함수 목록 파악
- [ ] `engine/data_cache/` 과거 OHLCV + OI + CVD 조회 인터페이스 확인
- [ ] `engine/tests/test_draft_from_range.py` 현재 stub 내용 파악
