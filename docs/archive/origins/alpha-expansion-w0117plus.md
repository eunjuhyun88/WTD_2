# Alpha Expansion — W-0117 ~ W-0120

> 상위 설계: `/Users/ej/.claude/plans/noble-skipping-dewdrop.md` (W-0116 Cogochi Alpha Agent)
> 전제: W-0115 (Alpha 데이터 파이프라인) + W-0116 (Observation + Reasoning Agent) 완료
> Status: 설계 · 미구현

---

## Context

### 왜 이 문서가 있는가

W-0116 설계 시 `tmp/telegram_refs/`의 4개 HTML(ALPHA TERMINAL v3/v4, ALPHA HUNTER v3.6, 바이낸스 시그널 레이더 v3.0)을 엔진 현황과 gap 분석한 결과:

- ✅ 엔진화됨: ~55% (전략 로직 대부분)
- ⚠️ Phase 1.5로 병합: ~15% (VWAP, RS, OI accel — quick-win 블록 3개)
- ❌ Phase 2 확장 필요: ~30%

Phase 2 구멍이 서로 **독립적인 작업 단위**라서 하나의 work item에 묶으면 PR이 거대해지고 리뷰 불가능해진다. 4개 work item으로 분리한다.

### 분리 원칙

- **W-0117 HOT tier** = 인프라 변경이 크고(websocket, 5m 파이프라인) 단독 가치가 있음
- **W-0118 Cross-exchange** = 데이터 소스 추가만, 로직 단순
- **W-0119 Meta-classifier** = 기존 패턴 위에 얹는 상위 레이어, 데이터 변경 없음
- **W-0120 신규 데이터 소스** = 독립 fetcher + DataSource 등록, 기존 블록과 소통 최소

각 work item은 독립 브랜치 · 독립 PR · 독립 테스트.

---

## W-0117 · Realtime HOT Tier + 5m Bar 인프라

### 목표

W-0116 설계의 3-tier cadence (COLD 4h / WARM 30min / HOT realtime) 중 **HOT tier 구현**. 추가로 5-minute bar 파이프라인을 열어서 단기 모멘텀 블록들이 동작하게 만든다.

### 왜 중요한가

텔레그램 레퍼런스들의 최대 가치는 realtime — 1분 가속도, 고래 $50k+ 체결, 5초 매수벽, 청산 스트림. SQUEEZE_TRIGGER가 발사될 때 4h 주기로는 늦는다. SQUEEZE에 진입한 심볼만 realtime으로 끌어올리면 비용은 적고 가치는 크다.

### 구현 계획

**① 5-minute klines 파이프라인** (`engine/data_cache/loader.py` 확장)

- `load_klines(symbol, timeframe="5m", ...)` — 현재 1h만 디스크 저장, 다른 TF는 resample. 5m은 디스크 저장 필수 (60배 데이터량이라 1h resample 불가).
- 캐시 파일: `{symbol}_5m.csv` — rolling 7일치만 유지 (용량 관리)
- `compute_features_table(tf_minutes=5)` 경로는 이미 존재하므로 수정 불필요

**② 5m momentum composite 블록** (`building_blocks/confirmations/momentum_5m.py`, ~80줄)
```python
def momentum_5m(ctx) -> pd.Series:
    """F3의 L18 레이어 포트.
    
    조건 (ALL):
    - 30-min return (6×5m 바) > threshold (기본 +3%)
    - volume acceleration = recent-6 / prior-18 >= 3x
    - directional consistency = up-bars / 6 >= 0.8
    """
```
단, 이 블록은 5m ctx가 필요하므로 alpha-presurge-v1 기본 페이즈에 넣지 않고, HOT tier 스캔에서만 호출.

**③ Binance websocket 관리자** (`engine/scanner/streams/`, 신규 패키지)
```
streams/
  manager.py           # 심볼별 구독/해지 관리, auto-reconnect
  force_order_stream.py  # !forceOrder@arr → 5분 롤링 liq 집계
  mini_ticker_stream.py  # !miniTicker@arr → 1분 velocity 감지
  agg_trade_stream.py    # {symbol}@aggTrade → 고래 $50k+ 감지
  depth5_stream.py       # {symbol}@depth5@1000ms → 5초 벽 지속 감지
```

**핵심 설계**: 전역 stream 2개(`!forceOrder@arr`, `!miniTicker@arr`)는 항상 열려 있고, 심볼별 stream 4개(`aggTrade`, `depth5`)는 **SQUEEZE_TRIGGER 진입 시에만** 구독, max_bars 소진 시 해지. 동시 구독 상한 8개.

**④ HOT tier 잡** (`engine/scanner/jobs/alpha_hot.py`, ~150줄)
```python
async def alpha_hot_loop():
    # SQUEEZE_TRIGGER 상태 심볼 감시 → 4개 stream 구독
    # 스트림 이벤트 큐 → 매 이벤트마다 블록 재평가:
    #   - whale_block_trade_live ($50k aggTrade 발생)
    #   - velocity_breakout_1m (1분 velocity ≥ 2.5x)
    #   - wall_persist_5s (bid/ask ratio ≥ 3x 지속 5s)
    # 페이즈 재평가 + 진입 신호 발사 시 Cogochi 즉시 푸시
```

**⑤ 신규 블록 4개** (`building_blocks/confirmations/`)

| 블록 | 데이터 소스 | 조건 |
|------|-------------|------|
| `whale_block_trade_live` | aggTrade stream | 단일 체결 ≥ $50k (testside=buy/sell) |
| `velocity_breakout_1m` | miniTicker 1분 집계 | vol1m / avg_vol_18min ≥ 2.5 AND vol1m > $20k |
| `wall_persist_5s` | depth5@1000ms | bid/ask depth ratio ≥ 3 AND 5초 이상 지속 |
| `cvd_streaming_breakout` | aggTrade stream | 누적 CVD > $20k 돌파 |

### 파일 변경

**신규:**
- `engine/data_cache/loader.py` — 5m 저장 브랜치 (+40줄)
- `engine/scanner/streams/` (신규 패키지, ~400줄)
- `engine/scanner/jobs/alpha_hot.py` (~150줄)
- `engine/building_blocks/confirmations/whale_block_trade_live.py` (~40줄)
- `engine/building_blocks/confirmations/velocity_breakout_1m.py` (~50줄)
- `engine/building_blocks/confirmations/wall_persist_5s.py` (~40줄)
- `engine/building_blocks/confirmations/cvd_streaming_breakout.py` (~40줄)
- `engine/building_blocks/confirmations/momentum_5m.py` (~80줄)

**수정:**
- `engine/building_blocks/confirmations/__init__.py` — 5개 블록 등록
- `engine/scanner/scheduler.py` — alpha_hot_loop 시작/종료 훅

**총 LOC**: ~900줄 (인프라 비중 높음)

### 검증

- **유닛**: 각 stream 핸들러를 mocked websocket message로 테스트
- **통합**: 로컬 Binance testnet 연결해서 5분간 돌려보고 블록 발화 확인
- **부하**: 8 심볼 동시 구독 시 평균 CPU/메모리 측정 (목표: <5% CPU, <100MB)

### Out of Scope

- DEX 거래소 websocket (DexScreener는 polling only)
- BSC chain event stream (alchemy/moralis 필요 — 별도 W-01XX)

---

## W-0118 · Cross-Exchange Intelligence

### 목표

MEXC와 Bitget 퍼펀딩/볼륨을 Binance와 비교하여 "어느 거래소가 먼저 움직이는지" 감지. 실제 edge는 MEXC 선행 케이스.

### 왜 중요한가

ALPHA HUNTER V3.6의 S15 volCompare 레이어 핵심 발견: **MEXC에서 2배+ 볼륨 터지고 Binance는 아직 조용하면, 1-5분 후 Binance도 따라온다.** 이건 Binance만 보는 우리 엔진에서는 구조적으로 놓친다.

### 구현 계획

**① Cross-exchange fetcher** (`engine/data_cache/fetch_cross_exchange.py`, ~150줄)
```python
def fetch_mexc_ticker(symbol: str) -> dict | None:
    """GET api.mexc.com/api/v3/ticker/24hr"""

def fetch_mexc_funding(symbol: str) -> float | None:
    """GET contract.mexc.com/api/v1/contract/funding_rate/{symbol}"""

def fetch_bitget_ticker(symbol: str) -> dict | None:
    """GET api.bitget.com/api/v2/spot/market/tickers"""

def fetch_bitget_funding(symbol: str) -> float | None:
    """GET api.bitget.com/api/v2/mix/market/current-fund-rate"""
```

2500ms 타임아웃, graceful None, 연결 실패 = 거래소 미지원 처리.

**② Cross-exchange DataSource** (`engine/data_cache/registry.py`)

새 `CROSS_EXCHANGE_SOURCES` 리스트:
```python
DataSource(
    name="cross_exchange",
    fetcher=fetch_cross_exchange_snapshot,
    columns=[
        "mexc_vol_ratio",       # MEXC/Binance 24h vol
        "bitget_vol_ratio",     # Bitget/Binance 24h vol
        "mexc_price_lead_pct",  # (MEXC % − Binance %) 24h
        "mexc_fr",              # MEXC funding rate
        "bitget_fr",            # Bitget funding rate
        "fr_spread_max",        # max(mexc, bitget) − binance_fr
    ],
    defaults={"mexc_vol_ratio": 1.0, ...},
    scope="per_symbol",
    cache_file="src_{symbol}_xcx.csv",
)
```

기존 macro/onchain/dex/chain 패턴 그대로 복제.

**③ Cross-exchange 블록 3개**

| 블록 | 조건 | 의미 |
|------|------|------|
| `mexc_lead_signal` | mexc_vol_ratio ≥ 2 AND mexc_price_lead_pct > 1 | "MEXC 선행 ★ 따라오기" |
| `cross_exchange_fr_arb` | abs(fr_spread_max) > 0.0005 | 거래소 간 펀딩 괴리 → 아비트러지 |
| `all_exchange_aligned` | 3개 거래소 모두 동방향 상승/하락 | 전체 일관 흐름 |

**④ `compute_features_table` 파라미터 추가** (`engine/scanner/feature_calc.py`)
```python
def compute_features_table(..., cross_exchange=None):
    cross_ex_arrays = _align_bundle(
        cross_exchange, CROSS_EXCHANGE_SOURCES, cross_exchange_defaults()
    )
```

**⑤ Observation Engine 통합** (W-0116의 `alpha_observer.py` 수정)
- 각 Alpha 심볼마다 `load_cross_exchange_bundle(symbol, refresh=True)` 추가 호출
- 4h 주기라 MEXC/Bitget 요청 빈도 낮음 (37개 × 2 exchanges × 6 times/day = 444 요청/일, rate limit 여유)

### 파일 변경

**신규:**
- `engine/data_cache/fetch_cross_exchange.py` (~150줄)
- `engine/data_cache/loader.py` — `load_cross_exchange_bundle()` 추가 (~30줄)
- `engine/building_blocks/confirmations/mexc_lead_signal.py` (~30줄)
- `engine/building_blocks/confirmations/cross_exchange_fr_arb.py` (~25줄)
- `engine/building_blocks/confirmations/all_exchange_aligned.py` (~25줄)

**수정:**
- `engine/data_cache/registry.py` — `CROSS_EXCHANGE_SOURCES` 추가
- `engine/scanner/feature_calc.py` — cross_exchange 파라미터
- `engine/building_blocks/confirmations/__init__.py`

**총 LOC**: ~350줄

### 검증

- 유닛: mocked exchange responses로 블록 3개 테스트
- 통합: 실제 MEXC/Bitget API 호출해서 VIX/BTCUSDT 값 비교
- 회귀: 기존 `test_alpha_pipeline.py` 패스 유지

### Out of Scope

- Gate.io, Bybit, OKX 추가 (3개 넘으면 noisy)
- Cross-exchange CVD 집계 (orderbook 필요 — W-0117로)

---

## W-0119 · Setup-Tag Meta-Classifier

### 목표

ALPHA TERMINAL v4의 3-stage 파이프라인 포트. 우리 엔진의 15개 패턴이 동시에 여러 개 발화할 때, 어느 방향이 우세한지 / 휩쏘인지 판단하는 메타-레이어.

### 왜 중요한가

현재 엔진은 패턴 독립적이다. `alpha-presurge-v1`과 `institutional-distribution-v1`이 같은 심볼에서 동시에 발화하면 양쪽 다 UI에 뜨고 유저가 혼란스럽다. ALPHA TERMINAL v4는 이걸 "휩쏘" 플래그로 감지하고 약한 쪽 가중치를 `× 0.3` 떨어뜨린다. 이게 "딸깍 판별기"의 진짜 본질.

### 구현 계획

**① 패턴 score 집계 레이어** (`engine/scoring/pattern_ensemble.py`, 신규 ~200줄)

각 심볼에 대해 현재 활성 패턴들의 score를 구조/플로우 2개 그룹으로 분류:

```python
STRUCTURE_PATTERNS = {
    "wyckoff-spring-reversal-v1", "liquidity-sweep-reversal-v1",
    "institutional-distribution-v1", "volatility-squeeze-breakout-v1",
    # ...
}

FLOW_PATTERNS = {
    "funding-flip-reversal-v1", "whale-accumulation-reversal-v1",
    "oi-presurge-long-v1", "alpha-presurge-v1",
    # ...
}

def compute_ensemble_verdict(symbol: str) -> EnsembleVerdict:
    """
    1. 활성 패턴별 phase_confidence 조회
    2. structure 그룹 스코어, flow 그룹 스코어 계산
    3. conflict 감지: |struct - flow| > 15 → whipsaw flag
    4. conditional: BTC RS < 0 이면 flow × 0.6
    5. synergy bonus: SHORT_SQUEEZE / BOTTOM_ABSORPTION / BREAKOUT_MOMENTUM / VWAP_BREAK 태그
    """
```

**② Setup tag 정의** (`engine/scoring/setup_tags.py`, 신규 ~120줄)

F3 HTML에서 포트:
```python
@dataclass
class SetupTag:
    slug: str       # "short_squeeze" | "bottom_absorption" | ...
    label_ko: str   # "🔥 숏스퀴즈"
    bonus: int      # +25 / +20 / +22 / +15
    conditions: Callable[[EnsembleContext], bool]

SETUP_TAGS = [
    SetupTag(
        slug="short_squeeze",
        label_ko="🔥 숏스퀴즈",
        bonus=25,
        conditions=lambda ctx: (
            ctx.funding_rate < -0.0005
            and (ctx.real_liq_short > 5 or ctx.ws_score > 5)
            and ctx.bb_squeeze_score >= 4
        ),
    ),
    SetupTag(slug="bottom_absorption", ...),
    SetupTag(slug="breakout_momentum", ...),
    SetupTag(slug="vwap_break", ...),
]
```

**③ PRE_PUMP / PRE_DUMP compound 감지** (`engine/scoring/compound_triggers.py`, ~150줄)

ALPHA HUNTER S10/S11 포트:
```python
def detect_pre_pump(features: pd.Series) -> PrePumpResult:
    """6 triggers, 3+ fires = pre-pump"""
    triggers = []
    if _5m_lead(features): triggers.append("5m_lead")
    if _volume_explosion(features): triggers.append("vol_exp")
    if _rsi_exit(features): triggers.append("rsi_exit")
    if _bull_divergence(features): triggers.append("bull_div")
    if _dex_extreme_buy(features): triggers.append("dex_extreme")
    if _spring_from_low(features): triggers.append("spring")
    return PrePumpResult(is_pre_pump=len(triggers) >= 3, triggers=triggers)
```

**④ Sector 2-pass averaging** (`engine/scanner/jobs/alpha_observer.py` 수정)

1-pass: 모든 심볼 score 계산
2-pass: 섹터별 평균 → 각 심볼에 sector_bonus 적용 (±5)

기존 `alpha-confluence-v1` 패턴이 섹터 로직을 일부 쓰고 있어서 충돌 없게 조정 필요.

**⑤ Ensemble verdict 저장**

새 테이블 `pattern_ensemble_snapshots`:
```sql
CREATE TABLE pattern_ensemble_snapshots (
  id uuid PRIMARY KEY,
  symbol text,
  observed_at timestamptz,
  structure_score float,
  flow_score float,
  whipsaw_flag bool,
  setup_tag text,           -- nullable
  setup_bonus int,
  active_patterns jsonb,    -- [{slug, phase, confidence}, ...]
  final_score float,
  verdict_label text        -- "SHORT_SQUEEZE" | "WHIPSAW" | "NEUTRAL"
);
```

**⑥ API 엔드포인트**
- `GET /alpha/ensemble/{symbol}` — 현재 ensemble verdict
- `GET /alpha/ensemble/top?limit=10` — 최고 setup_bonus 심볼들

**⑦ UI 통합**
- ScanGrid: 심볼 cell에 setup_tag 배지 표시 (🔥숏스퀴즈 / 💎바닥매집 / 🚀모멘텀 / ⚡VWAP돌파)
- Whipsaw flag 시 작은 경고 아이콘 (⚠️ 휩쏘)

### 파일 변경

**신규:**
- `engine/scoring/pattern_ensemble.py` (~200줄)
- `engine/scoring/setup_tags.py` (~120줄)
- `engine/scoring/compound_triggers.py` (~150줄)
- `engine/api/routes/alpha.py` — ensemble 엔드포인트 추가 (~40줄)
- `engine/migrations/pattern_ensemble_snapshots.sql`

**수정:**
- `engine/scanner/jobs/alpha_observer.py` — 2-pass sector averaging (+40줄)
- `app/src/components/terminal/.../ScanGrid.svelte` — setup_tag 배지 (+60줄)

**총 LOC**: ~650줄

### 검증

- 유닛: 각 SetupTag condition에 대해 positive/negative 케이스
- 시나리오: 휩쏘 케이스 (alpha-presurge + institutional-distribution 동시 활성) → 둘 다 score 감소 확인
- 엔드투엔드: 실제 historical data로 sector 2-pass 후 sector_bonus 스냅샷 비교

### Out of Scope

- LLM-driven setup 제안 (이건 Pattern Author Agent, 별도 work item)
- Setup 자동 튜닝 (historical 성과 기반 bonus 조정)

---

## W-0120 · 신규 데이터 소스 확장

### 목표

현재 엔진이 모르는 3가지 외부 시그널 추가:
1. Mempool (BTC 네트워크 혼잡도)
2. BTC whale flow (avg_tx_value 기반)
3. Binance Alpha 토큰 목록 자동 동기화

### 왜 중요한가

ALPHA TERMINAL L6 온체인 레이어의 핵심은 Mempool pending Tx + BTC avg_tx_value. 이건 macro 레벨의 수요 프록시로 BTC dominance만큼 중요하다. 현재 W-0115에서 `get_watchlist_symbols()`는 **수동 37개 리스트**인데 Binance Alpha는 매주 5-10개 토큰이 추가/제거된다. 자동 동기화 없으면 watchlist가 금세 stale해진다.

### 구현 계획

**① Mempool fetcher** (`engine/data_cache/fetch_mempool.py`, ~80줄)
```python
def fetch_mempool_snapshot() -> dict | None:
    """GET mempool.space/api/mempool + /api/v1/fees/recommended"""
    # Returns: {
    #   pending_tx_count,
    #   pending_vsize_mb,
    #   sat_per_vbyte_fast,
    #   sat_per_vbyte_hour,
    #   sat_per_vbyte_day,
    # }
```

Global scope (BTC 네트워크 전체), daily cadence.

**② BTC whale flow fetcher** (`engine/data_cache/fetch_btc_onchain.py`, ~100줄)
```python
def fetch_btc_activity() -> dict | None:
    """GET api.blockchain.info/stats"""
    # Compute:
    #   n_tx                        # blocks last 24h
    #   total_btc_sent              # BTC sent last 24h
    #   avg_tx_value_btc            # total / n_tx
    #   whale_flow_flag             # avg_tx > 2.0 BTC
```

**③ MACRO_SOURCES 확장** (`engine/data_cache/registry.py`)

기존 `MACRO_SOURCES`에 2개 DataSource 추가. global scope이라 `scope="global"` 사용.

**④ 신규 블록 3개**

| 블록 | 조건 |
|------|------|
| `mempool_congestion_high` | sat_per_vbyte_fast > 50 (수수료 비쌈 = 활발한 수요) |
| `btc_whale_flow_active` | avg_tx_value_btc > 2.0 |
| `macro_risk_on_combo` | fear_greed > 55 AND btc_whale_flow_active AND kimchi_premium > 0.5 |

**⑤ Binance Alpha token list 자동 동기화** (`engine/data_cache/fetch_alpha_universe.py` 확장)

```python
def fetch_binance_alpha_list_live() -> list[AlphaToken] | None:
    """GET binance.com/bapi/defi/v1/public/.../alpha/all/token/list"""
    # undocumented endpoint, fallback to ALPHA_WATCHLIST 하드코딩
```

**⑥ 워치리스트 업데이트 잡** (`engine/scanner/jobs/alpha_watchlist_sync.py`, ~60줄)

Daily APScheduler 잡:
1. 라이브 Alpha 리스트 fetch
2. 새 토큰 감지 → `ALPHA_WATCHLIST` dict 업데이트
3. 제거된 토큰 감지 → `archived` 플래그
4. Cogochi에 "새 토큰 등록됨" 알림

### 파일 변경

**신규:**
- `engine/data_cache/fetch_mempool.py` (~80줄)
- `engine/data_cache/fetch_btc_onchain.py` (~100줄)
- `engine/building_blocks/confirmations/mempool_congestion_high.py` (~25줄)
- `engine/building_blocks/confirmations/btc_whale_flow_active.py` (~25줄)
- `engine/building_blocks/confirmations/macro_risk_on_combo.py` (~30줄)
- `engine/scanner/jobs/alpha_watchlist_sync.py` (~60줄)

**수정:**
- `engine/data_cache/registry.py` — MACRO_SOURCES 확장
- `engine/data_cache/fetch_alpha_universe.py` — live fetch + 자동 동기화 (+80줄)
- `engine/building_blocks/confirmations/__init__.py`
- `engine/scanner/scheduler.py` — 일일 sync 잡 등록

**총 LOC**: ~450줄

### 검증

- 유닛: mocked mempool.space/blockchain.info 응답으로 fetcher 테스트
- 통합: 실제 API 응답 확인 (수동)
- 회귀: 기존 macro bundle tests 통과

### Out of Scope

- Ethereum / BSC / Base mempool (각 체인 전용 RPC 필요)
- BSCScan transaction-level 분석 (이미 holder 분석은 W-0115에서 처리)
- CFTC COT 데이터 — 별도 메모리에 있지만 독립 work item

---

## 우선순위 / 의존성

```
W-0116 (완료/진행중, Phase 1+1.5)
    ↓
    ├─→ W-0117 HOT tier       (인프라 중) — SQUEEZE 심볼 realtime
    ├─→ W-0118 Cross-exchange (작음, 독립) — MEXC 선행 신호
    ├─→ W-0119 Meta-classifier (중간, W-0116 의존) — 패턴 간 충돌 해결
    └─→ W-0120 신규 데이터      (작음, 독립) — mempool, BTC whale, auto-sync
```

**추천 순서**:

1. **W-0120** 먼저 (작고 독립적, 데이터 풍부해짐)
2. **W-0118** (MEXC 선행은 단독 가치, cross-exchange DataSource 패턴 확립)
3. **W-0119** (W-0116 안정화 후, 기존 패턴들 튜닝 인사이트 필요)
4. **W-0117** 마지막 (인프라 가장 크고 부하 테스트 필요)

각각 1 스프린트 (1-2주) 분량.

---

## 공통 검증 체크리스트

각 work item 완료 전:

- [ ] `pytest engine/tests/` 전체 통과
- [ ] `pattern_states` 쿼리로 실제 신호 발화 확인
- [ ] 기존 W-0115/W-0116 회귀 없음 (38+N tests pass)
- [ ] 로컬 alpha_observer 1회 실행 후 새 컬럼 present
- [ ] Cogochi UI에서 신규 신호 배지/오버레이 확인
- [ ] CHANGELOG.md 업데이트
- [ ] 메모리 기록 (`project_w0117_*.md` 등)

---

## Out of Scope (전체 Phase 2에서 제외)

- **Pattern Author Agent** (유저 자연어 → 새 PatternObject 컴파일) — 별도 work item
- **5초 매수벽 ML 학습** (ALPHA HUNTER의 패턴 학습 기능) — 현재 리서치 우선순위 낮음
- **텔레그램 WebApp 통합** (MainButton + HapticFeedback) — 현재 surface는 Cogochi 웹
- **오디오 비프 알림** (F4 UX) — 유저 피드백 받고 결정
- **UX 애니메이션** (시그널 카드 슬라이드인) — Cogochi 디자인 시스템 기존 패턴 유지
