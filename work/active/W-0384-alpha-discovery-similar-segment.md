# W-0384 — Alpha Discovery + Similar Segment Foundation

> Wave: 5 | Priority: P1 | Effort: M (4-5d, 2 PR)
> Charter: In-Scope (코어 알파 루프)
> Status: 🟡 Design Draft
> Created: 2026-05-02
> Depends on: W-0377 (pipeline repair, must merge first)

## Owner

eunjuhyun88 — backend PR1 (engine) + PR2 (app + API).

---

## Goal

`(symbol, time_range)` 입력 → Alpha 합성 점수(OI/funding/buy%/김프/Binance Alpha 리스트 5-module) + 과거 유사구간 상위 10개 + forward P&L을 단일 API 응답으로 반환. 차트 스크롤 이벤트에서 트리거되어 오른쪽 drawer에 즉시 표시. W-0378 AI Agent의 `/scan` `/similar` 명령의 내부 엔진이 된다.

---

## Scope

```
engine/alpha/__init__.py
engine/alpha/composite_score.py       # Alpha 합성 점수 (Module A~F)
engine/alpha/universe_seed.py         # 3-source universe merge
engine/alpha/scroll_segment.py        # 구간 indicator snapshot + anomaly
engine/alpha/scroll_similar_compose.py # scroll → similar pipeline
engine/api/routes/alpha.py            # /alpha/scroll + /alpha/scan 엔드포인트 추가
engine/tests/test_alpha_composite.py  # Unit tests 8개
app/src/lib/components/scroll/ScrollAnalysisDrawer.svelte
app/src/lib/components/scroll/ScrollAnalysisCard.svelte
app/src/lib/stores/scrollAnalysis.ts
app/src/routes/api/alpha/scroll/+server.ts
```

---

## Non-Goals

- 새 similarity 엔진 작성 (기존 `engine/search/similar.py` 재사용)
- 실시간 WebSocket 스트리밍 (polling으로 충분)
- Upbit/Bithumb 장애 시 에러 반환 (Module D skip = score 0 처리)
- TradingView 공식 API 연동 (차트 스크롤 이벤트는 SvelteKit store 기반)

---

## Canonical Files

```
engine/alpha/composite_score.py       # 핵심 점수 계산 로직
engine/alpha/scroll_segment.py        # 구간 분석
engine/alpha/scroll_similar_compose.py # similar 파이프라인
engine/api/routes/alpha.py            # API 진입점
engine/search/similar.py              # 재사용 (수정 없음)
app/src/lib/components/scroll/ScrollAnalysisDrawer.svelte
```

---

## Facts

- `engine/search/similar.py` 3-Layer (feature L1 + LCS phase + ML p_win, 가중치 0.60/0.30/0.10) 이미 존재 — 재사용.
- `engine/api/routes/alpha.py` `/alpha/world-model`, `/alpha/token/{symbol}` 이미 존재 — 엔드포인트 2개 추가.
- Binance Alpha 공식 토큰 리스트 엔드포인트: `https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list` (HTML 레퍼런스 실측).
- `scan_signal_outcomes` 테이블에서 forward P&L 조회 (W-0377 Break B 수리 후 데이터 있음).
- Upbit REST: `GET /v1/ticker?markets=KRW-{base}` — 서버사이드 fetch, CORS 없음.
- 모든 외부 fetch는 `asyncio.gather` 병렬 실행 목표: cold ≤ 800ms, cache hit ≤ 80ms.

---

## 목적 (Why this exists)

현재 알파 탐색은 2단계(scan → outcome) 구조라 사용자가 차트를 스크롤해도 "지금 이 구간이 얼마나 이상한지"를 즉시 알 수 없다. 유사구간 검색도 AI Agent 명령어로만 호출 가능하고 응답이 느리다.

이 work item은 두 가지를 해결한다:

1. **Alpha Discovery** — "지금 이 심볼이 얼마나 알파스러운가"를 합성 점수 1개로 즉시 반환. 데이터소스: OI Δ + funding rate + buy volume % + Upbit/Bithumb 김프 + Binance Alpha 토큰 리스트 멤버십. HTML 레퍼런스 4종에서 실측 수집한 임계값 사용.

2. **Scroll Segment Analysis** — 사용자가 TradingView 차트를 특정 시간대에 멈추면(또는 time_range를 지정하면), 그 구간의 지표 스냅샷 + 이상점(anomaly)을 계산하고, similar search API를 wrap해 과거 유사 구간 상위 10개를 한 응답에 묶어 반환.

두 기능이 W-0378 AI Agent의 `/scan ETH` + `/similar ETH 2025-12-01 2025-12-05` 명령의 내부 엔진이 된다.

---

## 기존 인프라 재활용 (구현자가 반드시 읽어야 할 파일)

| 파일 | 역할 | 이번 변경 |
|---|---|---|
| `engine/search/similar.py` | 3-Layer 유사도 검색 (Feature L1 + LCS phase + ML p_win) | 재사용, 수정 없음 |
| `engine/scoring/similarity.py` | Cosine 기반 피처 유사도 + SimilarityResult | 재사용, 수정 없음 |
| `engine/research/similarity_ranker.py` | 3-Layer hybrid scorer (0.45/0.45/0.10) | 재사용, 수정 없음 |
| `engine/api/routes/alpha.py` | `/alpha/world-model` `/alpha/token/{symbol}` | 엔드포인트 2개 추가 |
| `engine/research/alpha_quality.py` | Welch t-test + BH-FDR + bootstrap_ci | 재사용, 수정 없음 |
| `engine/scanner/jobs/alpha_observer.py` | alpha_presurge-v1 패턴 관측자 | 재사용, 수정 없음 |
| `engine/data_cache/fetch_alpha_universe.py` | ALPHA_WATCHLIST + get_watchlist_symbols | universe seed 확장 |

---

## 신규 파일 (이번 work item에서 생성)

```
engine/alpha/
  __init__.py
  composite_score.py         # Alpha 합성 점수 계산기
  universe_seed.py           # Binance Alpha 토큰 리스트 + watchlist 합집합 갱신
  scroll_segment.py          # 시간대 구간 → indicator snapshot + anomaly flags
  scroll_similar_compose.py  # scroll_segment + similar search 파이프라인

app/src/lib/components/scroll/
  ScrollAnalysisDrawer.svelte   # 차트 오른쪽 서랍
  ScrollAnalysisCard.svelte     # 유사구간 1개 카드

app/src/lib/stores/
  scrollAnalysis.ts            # 요청/응답 상태 관리

app/src/routes/api/alpha/
  scroll/+server.ts            # GET /api/alpha/scroll
  scan/+server.ts              # GET /api/alpha/scan (existing 확장)
```

---

## 상세 설계

### 1. `engine/alpha/composite_score.py` — Alpha 합성 점수

#### 목적
심볼 + 시점 → 0~100 점수 + 세부 시그널 목록. HTML 레퍼런스에서 추출한 임계값 기반.

#### 입력
```python
@dataclass
class AlphaScoreRequest:
    symbol: str              # e.g. "ETHUSDT"
    timeframe: str = "1h"
    reference_ts: datetime | None = None  # None = now
```

#### 출력
```python
@dataclass
class AlphaScoreResult:
    symbol: str
    score: float             # 0~100
    verdict: str             # "STRONG_ALPHA" | "ALPHA" | "WATCH" | "NEUTRAL" | "AVOID"
    signals: list[AlphaSignal]  # 세부 기여 시그널 목록
    computed_at: datetime
    data_freshness_s: int    # 데이터 최신도(초) — stale 경고용

@dataclass
class AlphaSignal:
    dimension: str     # "oi_surge" | "funding_heat" | "buy_pressure" | "kimchi_premium" | "alpha_list"
    score_delta: float # 이 시그널이 합산 점수에 기여한 양 (양수=긍정, 음수=부정)
    label: str         # 사용자에게 보여줄 텍스트
    raw_value: float   # 원시 수치 (예: OI 변화율 0.37 = +37%)
    threshold_used: float  # 어떤 임계값과 비교했는지
```

#### 점수 계산 로직 (모듈별)

**Module A — OI Surge** (최대 ±18점)
```
sf = oi_current / oi_1h_ago   # surge factor
if sf > 5.0:   score = dir * +18  label = "OI EXTREME SURGE"
if sf > 3.0:   score = dir * +13  label = "OI STRONG SURGE"
if sf > 1.8:   score = dir * +8   label = "OI SURGE"
if sf > 1.3:   score = dir * +4   label = "OI MODERATE"
if sf < 0.35:  score = +3         label = "ULTRA LOW VOL (contrarian)"
dir = +1 if price_delta > 0 else -1
# 설명: OI 급증 + 가격 상승 = 롱 신규 진입(강세), OI 급증 + 가격 하락 = 숏 진입(약세 신호)
```

**Module B — Funding Rate Heat** (최대 ±12점)
```
fr   = funding_rate_pct        # 8h funding, 예: 0.08 = 0.08%
oiPct = oi_change_pct_1h

if fr > 0.08 and oiPct > 4:  score = -12  label = "롱 과밀 — 강제청산 하방 위험"
if fr > 0.05 and oiPct > 2:  score = -8   label = "롱 축적 — 하락 시 청산 가속"
if fr < -0.08 and oiPct > 4: score = +12  label = "숏 과밀 — 상방 스퀴즈 대기"
if fr < -0.05 and oiPct > 2: score = +8   label = "숏 축적 — 스퀴즈 가능성"
if fr > 0.03:                score = -4   label = "롱 우세 — 청산존 하방"
if fr < -0.03:               score = +4   label = "숏 우세 — 스퀴즈 가능성"
# 설명: 극단적 funding은 역방향 스퀴즈 신호이므로 점수가 반전됨
```

**Module C — Buy Pressure / Taker CVD** (최대 +18점)
```
buyPct = buy_volume / total_volume * 100   # 최근 1h taker buy %

if buyPct >= 75: score = +18  label = "매수 주도 75%+ — 강한 축적"
if buyPct >= 65: score = +12  label = "매수 주도 65%+ — 매수 압력"
if buyPct >= 55: score = +6   label = "매수 우세"
if buyPct <= 35: score = -12  label = "매도 주도 — 분산 진행 중"
if buyPct <= 45: score = -4   label = "매도 우세"
# 연속 매수 체결 8회+ && buyPct > 50: bonus +4 "조직적 축적 가능"
```

**Module D — Kimchi Premium** (최대 ±10점, 한국 사용자 우선 시그널)
```
kimchi_pct = (upbit_price_krw / 1300 - binance_price_usdt) / binance_price_usdt * 100
# 1300은 USD/KRW 근사치 — 실제는 fetch_krw_rate() 사용

if kimchi_pct > 3.0:  score = +10  label = "김프 +3%+ — 한국 수요 선행"
if kimchi_pct > 1.5:  score = +5   label = "김프 양호"
if kimchi_pct < -1.0: score = -5   label = "역프 — 한국 이탈"
if kimchi_pct < -2.5: score = -10  label = "역프 심각"
# 데이터: Upbit REST GET /v1/ticker?markets=KRW-{base}
#         Bithumb REST /public/ticker/{base}_KRW
# fallback: Bithumb 실패 시 Upbit만 사용, 둘 다 실패 시 score=0 (module skip)
```

**Module E — Binance Alpha 토큰 리스트 멤버십** (+5점 플랫)
```
url = "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list"
alpha_set = {t["symbol"].upper() for t in response["data"]["tokens"]}

if symbol.replace("USDT","") in alpha_set:
    score = +5  label = "Binance Alpha 공식 목록"
# 이 리스트는 1h 주기로 캐시. 바이낸스가 공식적으로 "관심 있는" 토큰이므로 선행 신호
```

**Module F — Orderbook Imbalance** (최대 ±12점)
```
bid_vol = sum(bid sizes in top 10 levels)
ask_vol = sum(ask sizes in top 10 levels)
ratio = bid_vol / ask_vol

if ratio > 3.5: score = +12  label = "EXTREME BID"
if ratio > 2.0: score = +8   label = "STRONG BID"
if ratio > 1.3: score = +4   label = "BID LEAN"
if ratio < 0.3: score = -12  label = "EXTREME ASK"
if ratio < 0.5: score = -8   label = "STRONG ASK"
if ratio < 0.8: score = -4   label = "ASK LEAN"
# L2 snapshot: Binance fapi /fapi/v1/depth?symbol=...&limit=20
```

#### Verdict 매핑
```
score >= 60: STRONG_ALPHA   (즉시 관심)
score >= 35: ALPHA          (관심 후보)
score >= 15: WATCH          (모니터링)
score >= -10: NEUTRAL
score < -10:  AVOID
```

#### 데이터 수집 전략
- Module A/B: `fapi.binance.com/fapi/v1/openInterest`, `/premiumIndex` — 캐시 5분
- Module C: `fapi.binance.com/fapi/v1/klines?interval=1h&limit=2` + aggTrades 합산
- Module D: Upbit/Bithumb — 캐시 3분, allorigins 프록시 불필요(서버사이드 fetch)
- Module E: Binance Alpha 리스트 — 캐시 1h
- Module F: fapi depth — 캐시 30초

캐시는 `engine/data_cache/` 의 기존 `_primary_cache_dir()` 패턴 재사용.
모든 외부 fetch는 `asyncio.gather` 병렬 실행 → 전체 ≤ 800ms cold, ≤ 80ms cache hit.

---

### 2. `engine/alpha/universe_seed.py` — Universe 씨드 관리

#### 목적
알파 탐색 대상 심볼 집합을 3개 소스의 합집합으로 유지한다.

```python
async def get_alpha_universe() -> list[str]:
    """세 소스의 합집합. 중복 제거, 대문자 USDT 심볼 형식.

    소스 1: 기존 ALPHA_WATCHLIST (data_cache/fetch_alpha_universe.py)
    소스 2: Binance Alpha 공식 토큰 리스트 (1h 캐시)
    소스 3: 사용자 Watchlist (user_watchlist Supabase, migration 043)
    """
```

이 함수 결과가 `/alpha/world-model` 엔드포인트와 AI Agent `/scan all` 명령의 universe가 된다. W-0378이 이 함수를 직접 import해 사용하므로 인터페이스 변경 금지.

---

### 3. `engine/alpha/scroll_segment.py` — 스크롤 구간 분석

#### 목적
`(symbol, from_ts, to_ts)` → 구간 지표 스냅샷 + 이상점. AI Agent `/similar ETH 2025-12 2026-01` 명령과 차트 스크롤 이벤트 모두가 이 함수를 호출한다.

#### 입력
```python
@dataclass
class ScrollSegmentRequest:
    symbol: str
    from_ts: datetime
    to_ts: datetime
    timeframe: str = "1h"
```

#### 출력
```python
@dataclass
class ScrollSegmentResult:
    symbol: str
    from_ts: datetime
    to_ts: datetime
    n_bars: int
    indicator_snapshot: dict[str, float]   # 구간 평균/종합 지표
    anomaly_flags: list[AnomalyFlag]       # 이상점 목록
    alpha_score: AlphaScoreResult          # 구간 끝 시점 기준 합성 점수

@dataclass
class AnomalyFlag:
    ts: datetime               # 이상점 발생 시각
    dimension: str             # "volume_spike" | "oi_jump" | "funding_extreme" | "candle_pattern"
    severity: str              # "high" | "medium" | "low"
    description: str           # 퀀트 트레이더가 읽을 1줄 설명
    z_score: float             # 표준편차 기준 이상도
```

#### indicator_snapshot 포함 지표
```
OHLCV 통계:  avg_volume_ratio (vs 20bar MA), max_wick_pct, body_ratio
OI 지표:     oi_change_pct, oi_direction ("accumulating" | "unwinding")
Funding:     avg_funding_rate, funding_extreme_flag (bool)
Buy pressure: avg_buy_pct, max_buy_pct
RSI:         rsi_at_open, rsi_at_close (구간 시작/종료)
BB 위치:     price_vs_bb_upper_pct (구간 끝)
ATR:         atr_normalized (구간 내 변동성 / ATR 기준선 비율)
```

#### 이상점 탐지 로직
각 지표의 Z-score를 20bar 롤링 윈도우 기준 계산:
```python
z = (value - rolling_mean_20) / rolling_std_20
if |z| >= 2.5: severity = "high"
if |z| >= 1.8: severity = "medium"
if |z| >= 1.3: severity = "low"
```
캔들 패턴 이상점은 별도: hammer/shooting_star/engulfing 감지 (단순 OHLC 비율 규칙).

---

### 4. `engine/alpha/scroll_similar_compose.py` — 유사구간 파이프라인

#### 목적
ScrollSegmentResult → 기존 `engine/search/similar.py::run_similar_search` 호출 → 유사 구간 상위 10개 + 각 구간의 forward P&L (from `scan_signal_outcomes`).

```python
async def find_similar_segments(
    segment: ScrollSegmentResult,
    top_k: int = 10,
    min_similarity: float = 0.65,
) -> SimilarSegmentResponse:
    """
    1. indicator_snapshot을 SearchQuerySpec 형식으로 변환
    2. engine/research/candidate_search.search_similar_patterns() 호출
    3. 각 후보에 대해 scan_signal_outcomes에서 forward P&L 조회
    4. 결과 조합하여 반환
    """
```

#### 출력
```python
@dataclass
class SimilarSegment:
    symbol: str
    from_ts: datetime
    to_ts: datetime
    similarity_score: float          # 0~1
    layer_scores: dict[str, float]   # {"feature": 0.72, "sequence": 0.68, "ml": 0.55}
    forward_pnl_1h: float | None     # scan_signal_outcomes에서 조회, 없으면 None
    forward_pnl_4h: float | None
    forward_pnl_24h: float | None
    outcome: str | None              # "TP" | "SL" | "TIMEOUT" | None
    explanation: str                 # "OI surge pattern + buy pressure spike, similar to BTCUSDT 2025-08-14"

@dataclass
class SimilarSegmentResponse:
    query_symbol: str
    query_segment: ScrollSegmentResult
    similar_segments: list[SimilarSegment]
    win_rate: float | None           # labelled cases 기준
    avg_pnl: float | None
    confidence: str                  # "high" (n≥15) | "medium" (n≥5) | "low"
    run_id: str                      # engine/search/similar.py similar_runs SQLite ID
```

---

### 5. API 엔드포인트 (`engine/api/routes/alpha.py` 확장)

#### `GET /alpha/scroll`
```
Query params:
  symbol: str (required)
  from_ts: ISO8601 (required)
  to_ts:   ISO8601 (required)
  timeframe: "1h" | "4h" | "1d" (default "1h")
  top_k: int (default 10, max 20)

Response:
  {
    "segment": ScrollSegmentResult,        # 구간 분석
    "alpha_score": AlphaScoreResult,       # 합성 점수
    "similar_segments": SimilarSegmentResponse  # 유사구간
  }

Cache: 5분 (같은 symbol+from+to+tf 요청은 캐시 반환)
Timeout: 3s (이후 504 — 프론트에서 재시도)
```

#### `GET /alpha/scan`
기존 엔드포인트 확장. `?symbols=ETH,BTC,SOL` 또는 `?universe=all` 파라미터 추가.
```
Response:
  {
    "scores": [AlphaScoreResult, ...],   # 점수 내림차순 정렬
    "universe_size": 42,
    "computed_at": "..."
  }
```

---

### 6. 앱 컴포넌트

#### `ScrollAnalysisDrawer.svelte`
- 트리거: 차트에서 `scrollAnalysis.trigger(symbol, from_ts, to_ts)` 호출 시 오른쪽에서 슬라이드인
- 상태: loading → `GET /api/alpha/scroll` → 결과 표시
- 섹션:
  1. **Alpha Score**: 숫자 + verdict badge + 세부 시그널 아코디언
  2. **Anomaly Flags**: 타임라인 형태, severity 색상 코딩
  3. **Similar Segments**: SimilarSegmentCard × top_k 개

#### `ScrollAnalysisCard.svelte`
유사 구간 1개 카드:
```
[ETHUSDT]  2025-08-14  sim: 0.74
F:0.72  S:0.68  ML:0.55
+4.2% 4h | TP ✅
"OI surge + buy pressure, led to breakout"
```
클릭 → 차트가 해당 구간으로 이동 (TradingView setVisibleRange).

#### `scrollAnalysis.ts` 스토어
```typescript
interface ScrollAnalysisState {
  isOpen: boolean
  isLoading: boolean
  request: { symbol: string; fromTs: string; toTs: string } | null
  result: ScrollAnalysisResponse | null
  error: string | null
}

function trigger(symbol: string, fromTs: string, toTs: string): void
function close(): void
```

---

## Implementation Plan

**PR1 — engine (2-3d)**
1. `engine/alpha/__init__.py` + `composite_score.py` (모듈 A~F + AlphaScoreResult)
2. `engine/alpha/universe_seed.py` (3-source merge)
3. `engine/alpha/scroll_segment.py` (indicator snapshot + anomaly detection)
4. `engine/alpha/scroll_similar_compose.py` (유사구간 파이프라인)
5. `/alpha/scroll` 엔드포인트 + `/alpha/scan` 확장 (`engine/api/routes/alpha.py`)
6. `engine/tests/test_alpha_composite.py` — 모듈 A~F 각 1 unit test + 전체 smoke test

**PR2 — app (1-2d)**
1. `app/src/lib/components/scroll/ScrollAnalysisDrawer.svelte`
2. `app/src/lib/components/scroll/ScrollAnalysisCard.svelte`
3. `app/src/lib/stores/scrollAnalysis.ts`
4. `app/src/routes/api/alpha/scroll/+server.ts`
5. chart에 scroll 이벤트 → `scrollAnalysis.trigger()` 연결 (ChartPane 또는 MultiPaneChart 내)

---

## Exit Criteria

- [ ] AC1: `GET /alpha/scan?symbols=ETHUSDT` → AlphaScoreResult JSON 200ms 이내 (cache hit)
- [ ] AC2: `GET /alpha/scroll?symbol=ETHUSDT&from_ts=...&to_ts=...` → SimilarSegmentResponse, similar_segments ≥ 1개
- [ ] AC3: Module D (김프) — Upbit 데이터 없을 때 module skip (score=0), 전체 API 200 유지
- [ ] AC4: Module E (Binance Alpha 리스트) — 리스트 fetch 실패 시 module skip, 캐시 만료 1h
- [ ] AC5: ScrollAnalysisDrawer가 차트 스크롤 멈춤 → 3s 이내 로딩 완료
- [ ] AC6: `engine/tests/test_alpha_composite.py` 8/8 PASS
- [ ] AC7: `uv run pytest engine/tests/ -x -q` PASS (regression 없음)
- [ ] CI green + PR merged

---

## Assumptions

- Binance fapi가 서버사이드에서 직접 접근 가능 (no CORS issue)
- Upbit/Bithumb REST는 한국 IP에서 접근 가능; Cloud Run 해외 region 배포 시 VPN/프록시 필요할 수 있음 → Module D fallback은 score=0 skip으로 처리
- `engine/search/similar.py` 인터페이스 변경 없음 (W-0384는 wrapper만 추가)
- `scan_signal_outcomes` 테이블에 데이터가 있어야 forward P&L 조회 가능 (W-0377 break B 수리가 선행)

## Open Questions

- 없음 — Upbit 접근 불가 시 Module D skip 처리로 결정.

## Decisions

- D1: Kim프 계산 시 USD/KRW는 runtime에 `api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw` 캐시(1h) 사용.
- D2: 유사구간 파이프라인은 `engine/search/similar.py` 직접 재사용 — 새 엔진 작성 금지.
- D3: Alpha 합성 점수 모듈은 독립 함수(pure function) — IO 없음, mock 없이 unit test 가능.

## Next Steps

1. W-0378 Phase 1에서 `/alpha/scan` + `/alpha/scroll`을 AI Agent 명령 라우터에 연결
2. 김프 시그널을 scan_signal_events에 feature column으로 추가 (W-0385 이후)

## Handoff Checklist

- [ ] AC1~AC7 전부 체크
- [ ] `engine/alpha/` 디렉토리 존재 및 `__init__.py` 작성
- [ ] PR1 + PR2 모두 merged
- [ ] CURRENT.md W-0384 active row 추가
