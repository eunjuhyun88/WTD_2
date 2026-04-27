# W-0238 — F-12: DESIGN_V3.1 Feature Gap — kimchi_premium / session / oi_normalized_cvd

> Wave 4 P1 | Owner: engine | Branch: `feat/F12-design-v31-features`
> **병렬 Stream A — W-0233(F-30 backfill)과 동시 진행 가능**

---

## Goal

Korea persona 직결 3개 feature group을 `feature_windows`에 추가:
1. `kimchi_premium` — 김치 프리미엄 (Upbit vs Binance BTC 가격 차이 %)
2. `session_apac/us/eu` — 거래소 세션별 가격 변화율 (Asia/US/EU 시간대)
3. `oi_normalized_cvd` — OI 정규화 CVD (Open Interest 기준 CVD 비율)

현재 `columns.py`에 없음 → 패턴 엔진이 Korea 시장 특성 반영 불가.

## Owner

engine

## CTO 설계 결정

### kimchi_premium

**정의**: `(upbit_btc_krw / (binance_btc_usdt × usd_krw_rate) - 1) × 100`

**데이터 소스**:
- Upbit BTC/KRW: `https://api.upbit.com/v1/ticker?markets=KRW-BTC` (무료)
- USD/KRW 환율: Yahoo Finance `KRW=X` (무료, 15분 지연 허용)
- Binance BTC/USDT: 이미 수집 중

**수집 주기**: 5분 (Binance candle 주기에 맞춤)

**Feature column**:
- `kimchi_premium_pct` — 현재 프리미엄 (%)
- `kimchi_premium_7d_mean` — 7일 평균 프리미엄
- `kimchi_premium_zscore` — z-score (이상 감지)

**임계치 기준** (Telegram 채널 분석):
- `kimchi_premium_extreme` 빌딩 블록: `kimchi_premium_zscore > 2.0` 또는 `< -2.0`

### session_apac/us/eu

**정의**: 각 세션 시간대 내 가격 변화율
- APAC: 00:00~08:00 UTC
- EU: 07:00~15:00 UTC
- US: 13:00~21:00 UTC

**계산**:
```python
def calc_session_return(ohlcv: pd.DataFrame, session: str) -> float:
    session_hours = SESSION_HOURS[session]
    mask = ohlcv.index.hour.isin(session_hours)
    session_data = ohlcv[mask].tail(48)  # 최근 48h 중 해당 세션
    if len(session_data) < 2:
        return 0.0
    return (session_data["close"].iloc[-1] / session_data["open"].iloc[0] - 1) * 100
```

**Feature columns**:
- `session_return_apac` — APAC 세션 수익률 (%)
- `session_return_us` — US 세션 수익률 (%)
- `session_return_eu` — EU 세션 수익률 (%)
- `session_dominance` — 최근 강세 세션 ("apac"/"us"/"eu")

### oi_normalized_cvd

**정의**: CVD를 OI로 정규화 → 실제 buying pressure 강도 (OI 대비)

```python
def calc_oi_normalized_cvd(cvd: float, oi: float) -> float:
    """CVD / OI = OI 대비 순매수 비율"""
    if oi <= 0:
        return 0.0
    return cvd / oi  # -1.0 ~ +1.0 범위
```

**Feature columns**:
- `oi_normalized_cvd` — CVD/OI 비율
- `oi_normalized_cvd_1h` — 1h 변화량

**왜 중요**: 절대 CVD가 높아도 OI 폭증 시 실질 압력은 낮을 수 있음. Korea 알트코인에서 특히 유효.

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/data_cache/fetch_upbit.py` | 신규 — Upbit BTC/KRW + USD/KRW 수집 |
| `engine/features/columns.py` | 변경 — 신규 6개 컬럼 추가 |
| `engine/features/compute.py` | 변경 — kimchi/session/oi_cvd 계산 로직 |
| `engine/features/materialization.py` | 변경 — 신규 feature 재계산 등록 |
| `app/supabase/migrations/026_feature_v31.sql` | 신규 — `feature_windows` 컬럼 추가 |
| `engine/tests/test_feature_v31.py` | 신규 — 3개 feature group 유닛 테스트 |

## Non-Goals

- 김치 프리미엄 기반 자동 매매 신호 (frozen)
- 세션 기반 자동 전략 최적화
- Upbit 전체 종목 수집 (BTC만)

## Exit Criteria

- [ ] `feature_windows` 6개 신규 컬럼 추가 (migration 026)
- [ ] Upbit BTC/KRW 5분 수집 작동
- [ ] `kimchi_premium_pct` / `session_dominance` / `oi_normalized_cvd` 값 검증 (spot-check)
- [ ] `engine/building_blocks/` 에 `kimchi_premium_extreme` 블록 추가
- [ ] Engine Tests ✅

## Facts

1. `engine/features/columns.py` — `_CORE_FEATURE_COLUMNS` tuple. `cvd_state` 존재, `oi_normalized_cvd` 없음.
2. `engine/features/compute.py` — feature 계산 함수 모음.
3. `app/supabase/migrations/021_feature_windows.sql` — 현재 40+ 컬럼. `kimchi_premium_pct` 없음.
4. Upbit public API — 인증 불필요, rate limit 넉넉 (1req/sec).
5. Yahoo Finance `KRW=X` — USD/KRW 환율, 15분 캐시 충분.

## Assumptions

1. Upbit API 무료 공개 사용 허용.
2. migration 026은 `ALTER TABLE feature_windows ADD COLUMN IF NOT EXISTS ...` — non-destructive.
3. 기존 feature_windows row는 신규 컬럼 NULL → 다음 재계산 시 채워짐.

## Canonical Files

- `engine/data_cache/fetch_upbit.py`
- `engine/features/columns.py`
- `engine/features/compute.py`
- `engine/features/materialization.py`
- `app/supabase/migrations/026_feature_v31.sql`
- `engine/tests/test_feature_v31.py`

## Decisions

- **Upbit 수집**: 독립 fetcher (fetch_upbit.py) — 기존 Binance fetcher와 분리
- **환율**: Yahoo Finance KRW=X, 15분 TTL 캐시 (rate limit 안전)
- **Session 경계**: UTC 기준 (한국 시간 KST = UTC+9 → APAC = KST 09:00~17:00)
- **oi_normalized_cvd 범위**: clamp(-5.0, 5.0) — 극단값 방지

## Next Steps

1. `fetch_upbit.py` 작성 + 스케줄러 등록
2. `columns.py` 컬럼 추가
3. `compute.py` 계산 함수 3개 작성
4. migration 026 SQL 작성
5. `kimchi_premium_extreme` 빌딩 블록 등록
6. Engine Tests

## Handoff Checklist

- [ ] `engine/features/columns.py` `_CORE_FEATURE_COLUMNS` 확인
- [ ] `engine/features/compute.py` 기존 계산 패턴 파악
- [ ] `engine/scanner/scheduler.py` 스케줄러 등록 방법 확인
- [ ] `app/supabase/migrations/021_feature_windows.sql` 컬럼 목록 확인 (중복 방지)
