# Market Engine Unit Tests 완료 (PR #14 + test commit f6ec01c, 2026-04-13)

## 상태
- Branch: `claude/youthful-banach`
- PR #14: https://github.com/eunjuhyun88/WTD_2/pull/14
- 커밋: c132e25 (엔진 구현) → f6ec01c (테스트 108개)

## PR #14 포함 내용 (c132e25)

### 새로 만든 파일
- `engine/market_engine/` — 전체 패키지 (22개 파일)
- `engine/sector_map.py` — 28-sector CMC 분류, base_symbol()
- `engine/market_engine/config.py` — 중앙 상수 파일

### 핵심 수정 내용 (15개 CTO 이슈 해결)
1. **config.py** — 매직넘버 제거, 단일 진실 소스
2. **sector_map.py** — base_symbol() 추가, FDUSD 우선 순서
3. **l0_context.py** — retry + exponential backoff (2회, 0.4s base)
4. **l2/wyckoff.py** — _ensure_dt_index() (DatetimeIndex/timestamp컬럼/RangeIndex 3케이스)
5. **l2/alpha.py** — Wilder RSI (TradingView 동일), verdict 우선순위 수정
6. **l2/cvd.py** — taker_buy_base_volume 없을 때 50/50 fallback
7. **l2/onchain_kimchi.py** — base_symbol() import, FDUSD/USDC 처리
8. **pipeline.py** — S-series 완전 연결, SniperGate 재설계, SignalHistory deque, compute_sector_scores()

## 테스트 (f6ec01c) — 108개 전부 통과

### test_market_engine_alpha.py (37개)
- `_rsi()`: Wilder smoothing 정확도 5케이스
- `s1/s2/s3`: 버킷/메타 assertions
- `s9_quick()`: positional args, 2-조건 게이트
- `compute_alpha()`: deflation 수식
  - raw=60 → score=50 (1밴드만)
  - raw=80 → score=72 (both bands: 70+(80-70)*0.2)
  - raw=90 → score=74
  - raw=100 → score=76
  - liq_ratio<0.05 → max 10
  - warn_count≥3 → ≤ 0
  - verdict 우선순위: ACCUMULATING < PRE-DUMP < PRE-PUMP < MEXC
- `compute_hunt_score()`: 3콤보+25, 2콤보+10, dump-25, soft-cap 60→×0.4
- `resolve_conflict()`: 동시 prepump+predump → EXTREME VOLATILITY

### test_market_engine_sniper.py (31개)
- dynamic threshold: floor 우선 (CVD_TARGET_MIN=15k, WHALE_MIN=20k)
- on_trade: CVD±delta, max_cvd 추적, WHALE buy/sell, 디바운스
- is_fakeout: price≥max×0.999 AND cvd<max_cvd×0.80
- check_breakout GOLDEN: 4/4 조건, 3조건 불충분, 디바운스
- SQUEEZE: 18틱 tight range(≤0.8%), _squeeze_alerted 게이트, SQUEEZE_RESET_S(300s) 후 재무장
- IMBALANCE: avg_imb≥3.0+rising, IMBALANCE_RESET_S(180s) 후 재무장
- SignalHistory: hot(≥5), fire(≥10), 30분 rolling prune (monkeypatch)
- compute_sector_scores: symbol dict → sector 평균

### test_market_engine_cvd_wyckoff.py (21개)
- l11_cvd: +/- CVD, 50/50 fallback(컬럼 없음), 다이버전스, 흡수, trend
- _ensure_dt_index: 3가지 입력 포맷
- l1_wyckoff: 데이터 부족, 범위 확인, SC 감지
- l10_mtf: score 범위, tf_results meta, 적은 데이터 graceful

### test_market_engine_sector.py (19개)
- base_symbol: 9개 suffix, FDUSD>USDT 순서 확인, self-suffix 보호, case 무관
- get_sector: BTC/ETH 직접, SOL→LAYER1, BNB→EXCHANGE, FDUSD/USDC suffix 동등, unknown→OTHER

## 알려진 경고
- wyckoff.py:167 `Pandas4Warning: Timestamp.utcnow deprecated` → 기능 문제 없음, 추후 `Timestamp.now('UTC')` 로 교체 필요

## 남은 작업
- wyckoff.py utcnow deprecation 수정 (minor, 별도 PR)
- PR #14 리뷰 후 merge
