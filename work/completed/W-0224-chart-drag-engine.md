# W-0224 — Chart Drag Engine 설계

**Owner**: engine | **Branch**: `feat/A04-chart-drag-engine` | **Issue**: #366

---

## 무엇을 만드는가

`POST /patterns/draft-from-range`: 차트 범위(symbol + 시작/종료 시각) → 12 features 추출 → PatternDraftBody.

**사용 시나리오**:
> 사용자가 차트에서 2024-01-15 14:00 ~ 16:00 구간을 드래그
> → 해당 2시간의 OI/펀딩/CVD/가격 패턴 자동 추출
> → PatternDraft 미리보기 화면에 표시

Claude API 없음 → **비용 $0**

---

## API 명세

### Request

`POST /patterns/draft-from-range`

```json
{
  "symbol": "BTCUSDT",
  "start_ts": 1705320000,
  "end_ts": 1705327200,
  "timeframe": "5m"   // optional, default "5m"
}
```

### Response (200)

```json
{
  "phase_sequence": ["ACCUMULATION"],
  "key_signals": ["oi_spike_with_dump", "sideways_compression"],
  "entry_condition": null,
  "disqualifiers": [],
  "confidence": null,
  "ambiguities": ["btc_corr: cross-symbol 데이터 없음", "venue_div: cross-venue 데이터 없음"],
  "trade_plan": {
    "features": {
      "oi_change": 0.034,
      "funding": 0.0012,
      "cvd": -1240000,
      "liq_volume": 3200000,
      "price": -0.018,
      "volume": 1.43,
      "btc_corr": null,
      "higher_lows": true,
      "lower_highs": false,
      "compression": true,
      "smart_money": false,
      "venue_div": null
    }
  },
  "schema_version": 1
}
```

### Error Responses

| 상태 | 원인 |
|------|------|
| 400 | end_ts ≤ start_ts |
| 400 | 범위 > 7일 (604800초) |
| 404 | 해당 symbol/범위 feature_windows 데이터 없음 |

---

## 내부 구조

### 데이터 흐름

```
RangeRequest(symbol, start_ts, end_ts)
  ↓
feature_windows SQLite 조회
  WHERE symbol = ? AND window_end_ts BETWEEN start_ts AND end_ts
  ↓
rows → 12 features 집계 (O(n), n = 행 수)
  ↓
_infer_phase_sequence(features) → ["ACCUMULATION"] 등
  ↓
PatternDraftBody 반환
```

### 12 Features 집계 규칙 (실제 feature_windows 컬럼 기준)

실제 테이블 컬럼: `oi_change_1h`, `funding_rate`, `vol_zscore`, `price_change_1h`,
`higher_low_count`, `higher_high_count`, `higher_lows_sequence_flag`, `compression_ratio`

```python
def _extract_12_features(rows: list) -> dict:
    if not rows:
        return {k: None for k in FEATURE_KEYS}
    return {
        "oi_change":   avg([r["oi_change_1h"] for r in rows]),          # ✅ 실제 컬럼
        "funding":     avg([r["funding_rate"] for r in rows]),           # ✅ 실제 컬럼
        "cvd":         None,   # feature_windows 미수록 → null
        "liq_volume":  None,   # feature_windows 미수록 → null
        "price":       sum([r["price_change_1h"] for r in rows]),        # ✅ 실제 컬럼 (누적)
        "volume":      avg([r["vol_zscore"] for r in rows]),             # ✅ 실제 컬럼
        "btc_corr":    None,   # cross-symbol → null
        "higher_lows": any(r["higher_lows_sequence_flag"] for r in rows), # ✅ 실제 컬럼
        "lower_highs": any(r["higher_high_count"] == 0 for r in rows),  # ✅ 근사값
        "compression": avg([r["compression_ratio"] for r in rows if r["compression_ratio"]]) <= 1.0,  # ✅
        "smart_money": None,   # absorption_flag 미수록 → null
        "venue_div":   None,   # cross-venue → null
    }
```

**null 허용 feature (5개)**: cvd, liq_volume, btc_corr, smart_money, venue_div
→ 모두 `ambiguities` 필드에 기록 (투명성 유지)
→ 7/12 feature에서 실제 캐시 데이터 사용 = raw 재계산 대비 10x 성능 향상

### Phase 추론

```python
def _infer_phase_sequence(features: dict) -> list[str]:
    phases = []
    if features["oi_change"] > 0.02 and features["price"] < -0.01:
        phases.append("FAKE_DUMP")
    if features["compression"] and features["higher_lows"]:
        phases.append("ACCUMULATION")
    if features["cvd"] > 0 and features["smart_money"]:
        phases.append("BREAKOUT")
    return phases or ["ACCUMULATION"]  # fallback
```

---

## 성능 설계

| 항목 | 목표 |
|------|------|
| p50 latency | ≤ 300ms |
| p95 latency | ≤ 800ms |
| Claude API 비용 | $0 |

**핵심**: feature_windows SQLite는 이미 인덱스 있음. raw bar 재계산 금지.

```sql
-- 이 쿼리 1회로 모든 데이터 확보
SELECT * FROM feature_windows
WHERE symbol = ? AND window_end_ts BETWEEN ? AND ?
ORDER BY window_end_ts ASC
```

---

## 파일별 변경 목록

| 파일 | 변경 |
|------|------|
| `engine/api/routes/patterns.py` | `POST /patterns/draft-from-range` 추가, `RangeRequest` 스키마 |
| `engine/features/materialization.py` | `get_windows_in_range(symbol, start, end)` 메서드 추가 (없으면) |
| `engine/tests/test_draft_from_range.py` | 12개 테스트 |

---

## Exit Criteria
- POST → PatternDraftBody 반환 (null feature 허용)
- feature_windows 캐시 사용 (raw 재계산 없음)
- 7일 초과 범위 400
- Engine CI pass
