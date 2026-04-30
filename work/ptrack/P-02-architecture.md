# PropFirm MVP — System Architecture v1.1

> Status: 🟡 Design Draft
> Created: 2026-04-30 (v1.0) / Revised 2026-04-30 (v1.1)
> Author: ej + Claude
> Related: P-01-prd.md, P-03-phases.md
> Index: [P-00-master.md](P-00-master.md)
>
> **v1.1 변경점**: WTD 기존 구조(`ScanSignal`, `engine/ledger_records/*`, migration 030)에 정합화.
> GAP-1 (스키마 이중화) / GAP-2 (신호모델 이중화) / GAP-3 (실행기 명칭) / GAP-4 (한국 법무) 4개 갭 해소.
> 자세한 통합 모델은 §11 참조.

---

## 가정 (override 가능)

| # | 항목 | 값 | 이유 |
|---|---|---|---|
| A0 | 리포 위치 | WTD v2 모노레포: `engine/propfirm/` + `app/propfirm/` | WTD 패턴 엔진 import 필요 |
| A1 | AUTO 어뷰징 | `strategy_id` 바인딩 계정은 copy detection whitelist | 시스템 신호는 사용자 행동 아님 |
| A2 | AUTO 통과 의미 | Funded 가능 + `funded_mode=STRATEGY_LOCKED` 별도 트랙 | 사용자 실력 ≠ 전략 실력 분리 |
| A3 | WTD 연동 | 인프로세스 import, `engine/propfirm/router.py` 가 `ScanSignal` 단일 진입점 | MVP 단순성 |
| A4 | HL 사용 범위 | Paper = 가격피드만 (내부 시뮬) / Funded = HL 실거래 | 페이퍼 단계 자금 안전 |
| A5 | 자산 | BTC, ETH, SOL perp | 유동성 + HL 메이저 |
| A6 | 통화 | USDC | HL 정산통화 |

---

## 1. 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js / Svelte)                  │
│   /landing  /dashboard  /trade  /verify  /funded  /payout       │
│   /admin/*  /scanner (기존 WTD + PaperTradeOverlay)             │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST + WS
┌────────────────────────────▼────────────────────────────────────┐
│                  API Gateway (FastAPI)                          │
│   auth · billing · trading · evaluation · payout · admin        │
└──┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
   │          │          │          │          │
┌──▼──┐   ┌──▼──┐   ┌──▼──┐   ┌──▼──────┐  ┌──▼─────┐
│ PG  │   │Redis│   │BullMQ│  │ WTD     │  │Hyper-  │
│  DB │   │Cache│   │Queue │  │ Engine  │  │liquid  │
└─────┘   └─────┘   └──────┘  └──┬──────┘  └────────┘
                                 │
                    engine/propfirm/router.py
                    (ScanSignal → pattern_fires + fan-out)

Workers (v1.1):
  hl_market_feed_worker     HL WS → Redis price tick stream
  limit_matcher_worker      price tick → OPEN limit orders fill (시뮬, INTERNAL_RUN/PAPER)
  mark_price_worker         Redis tick → DB position mark/UPnL
  risk_monitor_worker       equity → MLL 위반 시 즉시 청산
  exit_monitor_worker       TP/SL/TTL 평가 → exit order
  eod_aggregator_worker     UTC 00:00 daily_performance snapshot
  ttl_expirer_worker        pattern_fires.status NEW + ttl 경과 → EXPIRED
  hl_live_executor_worker   Funded acct → HL real order
  payout_worker             admin approval → on-chain USDC payout
```

---

## 2. Hyperliquid 연동

### 2.1 사용 엔드포인트

| 용도 | 엔드포인트 | 메서드 |
|---|---|---|
| 메타정보 (asset, decimals) | `POST /info { type: "meta" }` | REST |
| 실시간 mid/L2 book | WS `subscribe { type: "l2Book", coin }` | WS |
| 실시간 trade tape | WS `subscribe { type: "trades", coin }` | WS |
| 실시간 candle | WS `subscribe { type: "candle", coin, interval }` | WS |
| Funded 발주 | `POST /exchange { action: "order", ... }` (서명) | REST |
| Funded 청산 | `POST /exchange { action: "cancel", ... }` | REST |
| 잔고/포지션 조회 | `POST /info { type: "clearinghouseState", user }` | REST |

### 2.2 HL Market Feed Worker

```python
# engine/propfirm/hl/market_feed.py
class HyperliquidFeed:
    WS_URL = "wss://api.hyperliquid.xyz/ws"
    SYMBOLS = ["BTC", "ETH", "SOL"]

    async def run(self):
        async with websockets.connect(self.WS_URL) as ws:
            for sym in self.SYMBOLS:
                await ws.send(json.dumps({
                    "method": "subscribe",
                    "subscription": {"type": "l2Book", "coin": sym}
                }))
                await ws.send(json.dumps({
                    "method": "subscribe",
                    "subscription": {"type": "trades", "coin": sym}
                }))
            async for msg in ws:
                evt = json.loads(msg)
                await self.redis.xadd(f"hl:l2:{coin}", {...}, maxlen=1000)
                await self.redis.xadd(f"hl:trades:{coin}", {...}, maxlen=5000)
                await self.redis.set(f"hl:mid:{coin}", mid_price, ex=60)
```

Redis keys:
- `hl:mid:{COIN}` — 최신 mid price (TTL 60s)
- `hl:l2:{COIN}` — L2 book stream
- `hl:trades:{COIN}` — trade tape stream
- `hl:candle:{COIN}:{interval}` — closed candle stream

### 2.3 LimitMatcher (슬리피지 시뮬, v1.1)

INTERNAL_RUN/PAPER 계정의 시뮬 체결 엔진. account_type='FUNDED' 인 경우는 `LiveExecutor` (§2.4) 가 처리.

```python
# engine/propfirm/match.py
class LimitMatcher:
    SLIPPAGE_BPS_BASE = 2.0       # 2 bps 기본
    SLIPPAGE_BPS_PER_1K = 0.5    # +0.5 bps per $1k notional above $5k

    async def on_tick(self, coin, mid, best_bid, best_ask):
        for order in await self._open_limit_orders(coin):
            if order.side == "BUY" and best_ask <= order.price:
                await self._fill(order, exec_price=min(order.price, best_ask))
            elif order.side == "SELL" and best_bid >= order.price:
                await self._fill(order, exec_price=max(order.price, best_bid))

    def _market_fill_price(self, side, size_usd, best_bid, best_ask):
        ref = best_ask if side == "BUY" else best_bid
        slip = self.SLIPPAGE_BPS_BASE + max(0, (size_usd-5000)/1000) * self.SLIPPAGE_BPS_PER_1K
        return ref * (1 + slip/10000) if side == "BUY" else ref * (1 - slip/10000)
```

### 2.4 Funded → HL Live Executor

```python
# engine/propfirm/hl/live_executor.py
class HyperliquidLiveExecutor:
    async def place_order(self, funded_acct_id, coin, side, size, order_type, price=None):
        self._risk_check(funded_acct_id, coin, side, size)  # MLL, whitelist
        resp = await self.hl.order(
            coin=coin, is_buy=(side=="BUY"), sz=size,
            limit_px=price or 0,
            order_type={"limit": {"tif": "Gtc"}} if order_type=="LIMIT" else {"market": {}},
        )
        await self.ledger.record(resp["response"]["data"]["statuses"][0], funded_acct_id)
        return resp
```

### 2.5 Sub-account 격리 전략

**결정: 사용자당 HL sub-account 1개 발급** (옵션 X).

이유: 단일 계정 + internal netting layer는 동일 코인 반대 포지션 시 HL netting 처리가 복잡.
Sub-account per user → PnL 격리 자연스럽고 회계 단순.

```sql
CREATE TABLE hl_order_ledger (
  hl_oid          BIGINT PRIMARY KEY,
  funded_acct_id  UUID NOT NULL,
  coin            TEXT,
  side            TEXT,
  requested_sz    NUMERIC,
  filled_sz       NUMERIC,
  avg_fill_px     NUMERIC,
  fee_paid        NUMERIC,
  realized_pnl    NUMERIC,
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ
);
```

---

## 3. 데이터 모델 (PostgreSQL 전체)

```sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE,
  wallet_addr         TEXT,
  nickname            TEXT,
  country             TEXT,
  status              TEXT DEFAULT 'ACTIVE',  -- ACTIVE/BANNED/FROZEN
  kyc_status          TEXT DEFAULT 'PENDING',
  risk_score          INT DEFAULT 0,
  device_fingerprint  TEXT,
  last_ip             INET,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users,
  plan_code        TEXT DEFAULT 'STANDARD',
  status           TEXT,  -- ACTIVE/PAST_DUE/EXPIRED/CANCELED/CHARGEBACK/BANNED
  amount_cents     INT,
  currency         TEXT DEFAULT 'USD',
  payment_provider TEXT,  -- stripe | usdc_manual
  payment_ref      TEXT,
  started_at       TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  canceled_at      TIMESTAMPTZ
);

CREATE TABLE trading_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users,                  -- NULL 허용 (INTERNAL_RUN)
  account_type          TEXT NOT NULL,  -- INTERNAL_RUN | PAPER | FUNDED
  label                 TEXT,           -- INTERNAL_RUN 식별용 (예: "2026-04-30 dual_ob")
  mode                  TEXT NOT NULL DEFAULT 'MANUAL',  -- MANUAL | AUTO | ASSISTED
  strategy_id           TEXT,           -- WTD strategy ref (AUTO/ASSISTED/INTERNAL_RUN 시 채움)
  symbols               TEXT[],         -- INTERNAL_RUN 의 대상 코인 화이트리스트
  exit_policy           JSONB,          -- {tp_bps, sl_bps, ttl_min} — INTERNAL_RUN/AUTO
  sizing_pct            NUMERIC DEFAULT 0.05,  -- equity 대비 진입 비중
  funded_mode           TEXT,           -- null | DISCRETIONARY | STRATEGY_LOCKED
  hl_subaccount_addr    TEXT,           -- FUNDED only
  status                TEXT,
  initial_balance       NUMERIC DEFAULT 10000,
  current_equity        NUMERIC DEFAULT 10000,
  realized_pnl          NUMERIC DEFAULT 0,
  unrealized_pnl        NUMERIC DEFAULT 0,
  mll_level             NUMERIC,        -- computed: initial_balance - max_loss_limit
  max_loss_limit        NUMERIC DEFAULT 1000,
  profit_goal           NUMERIC DEFAULT 3000,
  best_day_realized_pnl NUMERIC DEFAULT 0,
  total_realized_pnl    NUMERIC DEFAULT 0,
  trading_days_count    INT DEFAULT 0,
  winning_days_count    INT DEFAULT 0,
  failed_at             TIMESTAMPTZ,
  failure_code          TEXT,
  passed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID REFERENCES trading_accounts,
  user_id          UUID REFERENCES users,                  -- NULL 허용 (INTERNAL_RUN)
  source           TEXT,  -- USER | AUTO_STRATEGY | ASSISTED_USER | INTERNAL_RUN
  pattern_fire_id  UUID REFERENCES pattern_fires,           -- v1.1: signal_event_id → pattern_fire_id
  intent           TEXT,  -- ENTRY | EXIT_TP | EXIT_SL | EXIT_TTL | EXIT_MLL | EXIT_USER
  parent_position_id UUID,
  coin             TEXT,
  side             TEXT,  -- BUY | SELL
  order_type       TEXT,  -- MARKET | LIMIT | CLOSE
  qty              NUMERIC,
  price            NUMERIC,
  status           TEXT,  -- OPEN/FILLED/PARTIAL/CANCELED/REJECTED
  hl_oid           BIGINT,
  filled_qty       NUMERIC DEFAULT 0,
  avg_fill_px      NUMERIC,
  fee              NUMERIC DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  filled_at        TIMESTAMPTZ
);

CREATE TABLE positions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID REFERENCES trading_accounts,
  coin             TEXT,
  side             TEXT,
  qty              NUMERIC,
  entry_px         NUMERIC,
  mark_px          NUMERIC,
  leverage         NUMERIC DEFAULT 1,
  margin           NUMERIC,
  unrealized_pnl   NUMERIC DEFAULT 0,
  liquidation_px   NUMERIC,
  status           TEXT DEFAULT 'OPEN',  -- OPEN | CLOSED
  opened_at        TIMESTAMPTZ DEFAULT NOW(),
  closed_at        TIMESTAMPTZ
);

CREATE TABLE daily_performance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID REFERENCES trading_accounts,
  date_utc       DATE NOT NULL,
  realized_pnl   NUMERIC DEFAULT 0,
  fees           NUMERIC DEFAULT 0,
  net_pnl        NUMERIC DEFAULT 0,
  trade_count    INT DEFAULT 0,
  is_trading_day BOOL DEFAULT FALSE,
  is_winning_day BOOL DEFAULT FALSE,
  UNIQUE (account_id, date_utc)
);

-- v1.1: signal_events 폐기 → pattern_fires 로 대체
-- 기존 ScanSignal (engine/scanner/realtime.py:60) 가 producer.
-- ScanSignal 이 emit 될 때마다 1행 INSERT.
CREATE TABLE pattern_fires (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id       UUID,                                     -- ScanResult batch
  fired_at          TIMESTAMPTZ DEFAULT NOW(),                -- ScanSignal.timestamp
  symbol            TEXT NOT NULL,                            -- ScanSignal.symbol
  price             NUMERIC,                                  -- ScanSignal.price
  direction         TEXT,                                     -- strong_long/long/short/strong_short
  ensemble_score    NUMERIC,
  p_win             NUMERIC,
  blocks_triggered  TEXT[],                                   -- ScanSignal.blocks_triggered
  confidence        TEXT,                                     -- low/medium/high
  reason            TEXT,
  regime            TEXT,
  strategy_id       TEXT,                                     -- 'wtd.{ledger_record}' (router가 매핑)
  status            TEXT DEFAULT 'NEW',                       -- NEW/CONSUMED/SKIPPED/EXPIRED
  ttl_sec           INT DEFAULT 60,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pattern_fires_status ON pattern_fires (status, fired_at);
CREATE INDEX idx_pattern_fires_strategy ON pattern_fires (strategy_id, fired_at);

CREATE TABLE evaluations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               UUID REFERENCES trading_accounts,
  user_id                  UUID REFERENCES users,
  profit_goal_passed       BOOL,
  mll_passed               BOOL,
  consistency_passed       BOOL,
  min_trading_days_passed  BOOL,
  open_positions_closed    BOOL,
  abuse_check_passed       BOOL,
  final_status             TEXT,  -- PENDING/PASSED/FAILED
  review_status            TEXT,  -- PENDING/APPROVED/REJECTED
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE verifications (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES users,
  evaluation_id            UUID REFERENCES evaluations,
  full_name                TEXT,
  country                  TEXT,
  date_of_birth            DATE,
  strategy_description     TEXT,
  uses_bot                 BOOL,
  uses_copy_trading        BOOL,
  wallet_address           TEXT,
  status                   TEXT DEFAULT 'REVIEW_PENDING',
  admin_note               TEXT,
  submitted_at             TIMESTAMPTZ,
  reviewed_at              TIMESTAMPTZ
);

CREATE TABLE payouts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES users,
  funded_account_id        UUID REFERENCES trading_accounts,
  realized_pnl             NUMERIC,
  total_pnl                NUMERIC,
  safety_net               NUMERIC,
  withdrawable_balance     NUMERIC,
  adjusted_payout_balance  NUMERIC,
  profit_split             NUMERIC DEFAULT 0.80,
  trader_payout            NUMERIC,
  company_share            NUMERIC,
  status                   TEXT DEFAULT 'NOT_ELIGIBLE',
  wallet_address           TEXT,
  requested_at             TIMESTAMPTZ,
  reviewed_at              TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  tx_hash                  TEXT,
  admin_note               TEXT
);

CREATE TABLE risk_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID REFERENCES trading_accounts,
  code        TEXT,   -- BREACH_MLL, BREACH_UNLISTED_ASSET, ...
  severity    TEXT,   -- LOW/MEDIUM/HIGH/CRITICAL
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type   TEXT,  -- USER | ADMIN | SYSTEM
  actor_id     UUID,
  action       TEXT,
  target_type  TEXT,
  target_id    UUID,
  before_val   JSONB,
  after_val    JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Trading Mode 통합 흐름 (v1.1)

공통 진입점: `engine/patterns/scanner.py` 의 `_on_entry_signal(transition)` → `PatternFireRouter` → `pattern_fires.INSERT(status='NEW')`.

이후 **mode 별로 라우터가 분기**.

### 4.1 INTERNAL_RUN (P1)

```
PhaseTransition(entry_phase) → PatternFireRouter
  → pattern_fires INSERT
  → 매칭 계정 (account_type='INTERNAL_RUN', strategy_id 일치, symbol ∈ symbols) fan-out
  → EntryDecider: orders.insert(source='INTERNAL_RUN', intent='ENTRY')
  → LimitMatcher (LIMIT) or 즉시 시뮬 fill (MARKET)
  → Position 생성
  → ExitMonitor가 tick마다 TP/SL/TTL 평가 → exit order
```

### 4.2 MANUAL (P2)

```
User → POST /orders {coin, side, type, qty, price?}
  → account.mode == MANUAL 검증
  → orders.insert(source='USER')
  → account_type==PAPER → LimitMatcher / FUNDED → LiveExecutor
  → Position 갱신 → DailyPerformance upsert → RiskMonitor
```

### 4.3 AUTO (P2 user / P3 funded)

```
PhaseTransition(entry_phase) → PatternFireRouter
  → pattern_fires INSERT
  → mode==AUTO && strategy_id 일치 계정 fan-out
  → sizing = account.current_equity × account.sizing_pct
  → EntryDecider: orders.insert(source='AUTO_STRATEGY', pattern_fire_id=…)
  → 체결 흐름 = MANUAL과 동일
  → pattern_fires.status = 'CONSUMED' (마지막 fan-out 후)
```

**AUTO sizing**: 각 계정이 자기 equity 기준 동일 % 노출.

### 4.4 ASSISTED (P2)

```
PhaseTransition(entry_phase) → PatternFireRouter
  → pattern_fires INSERT (status=NEW)
  → WS push → ASSISTED 계정 사용자 UI 카드
  → "BTC LONG @ 65,200 conf=high  [Execute] [Ignore]"
  → Execute 클릭 → POST /orders/from-fire {pattern_fire_id}
       → orders.insert(source='ASSISTED_USER', pattern_fire_id=…)
       → 체결 흐름 = MANUAL
  → TTL 경과 후 NEW 인 row → status='EXPIRED' (ttl_worker)
```

---

## 5. PatternFireRouter (v1.3 — hook 위치 수정)

> **v1.3**: hook을 `scanner/realtime.py ScanSignal` → `patterns/scanner.py _on_entry_signal(transition)` 으로 변경.
>
> **이유**: `ScanSignal`에는 `pattern_slug` 없음. `PhaseTransition`에는 `transition.pattern_slug` 바로 있음.
> **Q-PF-001 ✅**: `library.py` 53개 패턴 전부 지원 (사용자 추가 예정).
> **Q-PF-004 ✅**: `blocks_triggered → strategy_id` 매핑 불필요. `strategy_id = f"wtd.{transition.pattern_slug}"` 직접 사용.

```python
# engine/propfirm/router.py
from patterns.types import PhaseTransition

SYMBOLS_WHITELIST = {"BTC", "ETH", "SOL"}

class PatternFireRouter:
    """PhaseTransition(entry_phase) → pattern_fires INSERT → mode별 fan-out.

    Hook: patterns/scanner.py _on_entry_signal() 콜백에 등록.
    strategy_id = "wtd.{transition.pattern_slug}" — 매핑 없이 직접.
    """

    async def on_entry_signal(self, transition: PhaseTransition) -> str | None:
        # 1) 코인 필터 (BTCUSDT → BTC)
        symbol = transition.symbol.replace("USDT", "").replace("PERP", "")
        if symbol not in SYMBOLS_WHITELIST:
            return None

        strategy_id = f"wtd.{transition.pattern_slug}"
        blocks = list((transition.block_scores or {}).keys())
        entry_price = (transition.feature_snapshot or {}).get("close")

        # 2) pattern_fires 영속화
        fire_id = await self.db.fetch_val("""
            INSERT INTO pattern_fires
              (scan_run_id, fired_at, symbol, price, p_win,
               blocks_triggered, confidence, strategy_id, status, ttl_sec)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NEW',$9)
            RETURNING id
        """, transition.scan_id, transition.timestamp, symbol, entry_price,
             getattr(transition, 'entry_p_win', None), blocks,
             str(getattr(transition, 'confidence', '')),
             strategy_id, 120)

        # 3) Mode별 fan-out
        accounts = await self.db.fetch_all("""
            SELECT id, account_type, mode, current_equity, sizing_pct, exit_policy
              FROM trading_accounts
             WHERE status = 'ACTIVE'
               AND strategy_id = $1
               AND mode IN ('AUTO', 'INTERNAL_RUN', 'ASSISTED')
        """, strategy_id)

        for acct in accounts:
            if acct.mode in ('AUTO', 'INTERNAL_RUN'):
                await self.entry_decider.on_fire(acct, fire_id, transition)
            elif acct.mode == 'ASSISTED':
                await self.notify.push_signal_card(acct.user_id, fire_id)

        await self.db.execute(
            "UPDATE pattern_fires SET status='CONSUMED' WHERE id=$1", fire_id
        )
        return fire_id
```

**hook 등록** (`patterns/scanner.py` 수정 — `_on_entry_signal()` 끝에 추가):

```python
# patterns/scanner.py
from propfirm.router import get_router   # lazy singleton

def _on_entry_signal(transition: PhaseTransition) -> None:
    # ... 기존 코드 유지 (LEDGER_STORE.save, CAPTURE 등) ...

    # PropFirm hook (fire-and-forget, 기존 스캐너 성능 영향 없음)
    import asyncio
    try:
        asyncio.get_event_loop().create_task(
            get_router().on_entry_signal(transition)
        )
    except RuntimeError:
        pass  # no running loop (test env)
```

**strategy_id 컨벤션**: `wtd.{pattern_slug}` — `library.py` 53개 slug 전부 대응.
`trading_accounts.strategy_id = 'wtd.tradoor-oi-reversal-v1'` 설정 시 해당 패턴 entry phase에서 자동 진입.

---

## 6. 리스크 엔진

### 6.1 트리거 빈도

| 이벤트 | 업데이트 항목 |
|---|---|
| 가격 틱 | mark_px, unrealized_pnl, current_equity, MLL 체크 |
| 체결 | realized_pnl, daily_performance, consistency_ratio |
| EOD (UTC 00:00) | trading_day, winning_day, best_day |

### 6.2 MLL 위반 처리

```python
async def check_mll(account):
    if account.current_equity <= account.mll_level:
        await close_all_positions(account)   # Paper: 시뮬 / Funded: HL reduce-only
        account.status = 'FAILED'
        account.failure_code = 'BREACH_MLL'
        await create_risk_event(account, 'BREACH_MLL', severity='HIGH')
        await notify_user(account, 'mll_breached')
```

### 6.3 Consistency + Profit Goal (EOD)

```python
trading_days = count(dp WHERE is_trading_day AND account_id)
total_realized = sum(dp.realized_pnl WHERE account_id)
best_day = max(dp.realized_pnl WHERE account_id)
consistency_ratio = best_day / total_realized if total_realized > 0 else None

eligible = (
    total_realized >= 3000
    and current_equity > mll_level
    and trading_days >= 5
    and (consistency_ratio is None or consistency_ratio <= 0.5)
    and open_positions == 0
    and subscription.status == 'ACTIVE'
)
```

---

## 7. Funded Account 운영

### 7.1 Verification 통과 → Sub-account 생성

```python
async def activate_funded(verification_id):
    sub_addr, sub_pk = await hl.create_subaccount(name=f"funded_{user.id}")
    await kms.store_secret(sub_addr, sub_pk)
    await hl.usdc_transfer(from=master, to=sub_addr, amount=10_000)
    return TradingAccount(
        account_type='FUNDED',
        hl_subaccount_addr=sub_addr,
        initial_balance=10_000,
        max_loss_limit=600,
        mll_level=9_400,
        funded_mode='STRATEGY_LOCKED' if user.passed_via_auto else 'DISCRETIONARY',
    )
```

### 7.2 STRATEGY_LOCKED vs DISCRETIONARY

| 트랙 | 진입 조건 | 모드 제한 |
|---|---|---|
| STRATEGY_LOCKED | AUTO 모드로 평가 통과 | mode=AUTO 고정, strategy_id 변경 불가 |
| DISCRETIONARY | MANUAL/ASSISTED로 통과 | MANUAL ↔ ASSISTED 자유, AUTO 전환 시 재평가 |

### 7.3 Payout 계산

```python
def calc_payout(funded_acct):
    realized = db.sum("realized_pnl FROM hl_order_ledger WHERE funded_acct_id=?")
    total = realized + db.sum("unrealized_pnl FROM positions WHERE account_id=?")
    safety_net = funded_acct.max_loss_limit + 200   # 600 + 200 = 800
    withdrawable = hl.get_withdrawable(funded_acct.hl_subaccount_addr)

    base = min(realized, total)
    original = base - safety_net
    adjusted = min(original, withdrawable)
    return adjusted * 0.80, adjusted * 0.20, adjusted
```

---

## 8. API 명세

### 기본 (PRD 15절)

```
POST /auth/signup, /auth/login, /auth/logout
GET  /auth/me
GET  /plans
POST /subscriptions/checkout, /subscriptions/cancel
GET  /accounts/me, /accounts/{id}/summary
POST /orders
GET  /orders, /positions, /trades, /daily-performance
POST /positions/{id}/close
GET  /evaluation/status, /evaluation/checklist
POST /evaluation/request-review
GET  /verification/status
POST /verification/form
GET  /funded/status, /funded/summary
GET  /payout/eligibility, /payout/estimate
POST /payout/request
GET  /payout/history
```

### 추가 (Mode + Signal)

```
GET  /accounts/me/mode
POST /accounts/me/mode         {mode, strategy_id?}
GET  /signals/feed?status=PENDING
POST /orders/from-signal       {signal_event_id}
GET  /strategies
GET  /strategies/{id}/performance
GET  /hl/health
GET  /hl/markets
POST /funded/strategy-change-request
```

### Admin

```
GET  /admin/users, /admin/users/{id}
GET  /admin/evaluations
POST /admin/evaluations/{id}/approve, /reject
GET  /admin/verifications
POST /admin/verifications/{id}/approve, /reject
GET  /admin/payouts
POST /admin/payouts/{id}/approve, /reject, /mark-paid
GET  /admin/risk-flags
POST /admin/users/{id}/ban
```

---

## 9. 파일 구조 (v1.1)

```
engine/
  propfirm/
    __init__.py
    models.py               # SQLAlchemy/Pydantic 모델
    router.py               # PatternFireRouter — ScanSignal → pattern_fires
    entry.py                # EntryDecider — fire+account → ENTRY order
    match.py                # LimitMatcher — INTERNAL_RUN/PAPER 시뮬 체결
    exit.py                 # ExitMonitor — TP/SL/TTL 청산
    risk_engine.py          # MLL/Consistency/ProfitGoal (P2+)
    eod.py                  # daily_performance 스냅샷 (P2+)
    payout.py               # 계산 + 신청/승인 워커 (P3)
    hl/
      market_feed.py        # HL WS → Redis
      live.py               # LiveExecutor — HL 실거래 (P3)
      sub_account.py        # HL sub-account 생성/관리 (P3)
  api/routes/
    propfirm_paper.py       # /api/propfirm/runs (P1)
    propfirm_trading.py     # /orders, /positions (P2)
    propfirm_eval.py        # /evaluation (P2)
    propfirm_payout.py      # /payout (P3)
    propfirm_admin.py       # /admin/... (P2+)

app/
  propfirm/                 # 신규 Next.js surface
    app/
      layout.tsx
      page.tsx              # landing
      dashboard/
      trade/
      verify/
      funded/
      payout/
      admin/
  src/components/
    chart/overlays/
      PaperTradeOverlay.svelte  # 기존 chart에 마커 overlay
    paper/
      EquityCurve.svelte

app/supabase/migrations/
  03X_propfirm_base.sql
  03Y_propfirm_funded.sql
  03Z_propfirm_payout.sql
```

---

## 11. v1.1 통합 모델 (GAP 해소 결정)

### 11.1 단일 trading_accounts (GAP-1 해소)

P1 의 별도 `paper_*` 테이블 폐기. 모든 Phase가 동일 스키마 사용:

```
trading_accounts.account_type:
  INTERNAL_RUN  — P1 우리 검증용. user_id NULL. label 로 식별.
  PAPER         — P2 사용자 평가 계정. user_id NOT NULL.
  FUNDED        — P3 실거래 계정. hl_subaccount_addr NOT NULL.

orders, positions, fills, daily_performance:
  account_id 만 보면 됨. account_type 무관 동일 흐름.
```

**효과**: P1 → P2 마이그레이션 불요. P1 코드를 P2 가 그대로 사용.

### 11.2 ScanSignal → pattern_fires 단일 신호 모델 (GAP-2 해소)

```
[INPUT 92 features per bar]   SignalSnapshot (engine/models/signal.py)
                                    ↓ scanner 가 score
[EMIT in-memory event]         ScanSignal (engine/scanner/realtime.py:60)
                                    ↓ PatternFireRouter
[PERSIST single source-of-truth] pattern_fires table
                                    ↓ orders.pattern_fire_id FK
[USER ACTION linkage]           orders → positions → fills
```

기존 `signal_events` 테이블은 **존재하지 않음**. 모든 후속 컴포넌트는 `pattern_fires` 만 참조.

### 11.3 5-컴포넌트 분리 (GAP-3 해소)

| 컴포넌트 | 파일 | 책임 | 트리거 |
|---|---|---|---|
| **PatternFireRouter** | `engine/propfirm/router.py` | ScanSignal 수신 → pattern_fires 영속화 → 계정 fan-out | scanner emit |
| **EntryDecider** | `engine/propfirm/entry.py` | (account, fire) → 진입 주문 생성 (sizing/예산 검증) | router 호출 |
| **LimitMatcher** | `engine/propfirm/match.py` | OPEN limit 주문을 가격 틱마다 매칭 (Paper/Internal) | hl mid tick |
| **LiveExecutor** | `engine/propfirm/hl/live.py` | HL 실거래 발주 (Funded only) | EntryDecider 호출 |
| **ExitMonitor** | `engine/propfirm/exit.py` | TP/SL/TTL/MLL 평가 → 청산 주문 | mid tick + EOD |

3 단계 모두 동일 인터페이스 사용:

```python
class TradeExecutor(Protocol):
    async def submit(self, account, coin, side, qty, order_type, price=None) -> Order
    async def close(self, position) -> Order
```

라우팅:
- `account_type ∈ {INTERNAL_RUN, PAPER}` → `LimitMatcher` (시뮬)
- `account_type == FUNDED` → `LiveExecutor` (HL 실거래)

### 11.4 한국 법무 P3 Entry Gate (GAP-4 해소)

P3 (실거래) **착수 전 차단 조건**:

- [ ] 가상자산이용자보호법 적용 범위 검토 완료
- [ ] FX마진/유사수신 규제 위배 여부 확인
- [ ] 한국 사용자 차단 vs 허용 정책 결정
- [ ] 약관·위험고지 한글 버전 법무 검토 완료

**미충족 시 P3 work item (W-PF-301~305) 생성·착수 금지.** P2 까지는 영향 없음 (실거래 아님).

### 11.5 마이그레이션 순서

| 파일 | Phase | 내용 |
|---|---|---|
| `031_propfirm_p1_core.sql` | P1 | trading_accounts, orders, positions, fills, daily_performance, pattern_fires |
| `032_propfirm_p2_eval.sql` | P2 | users.* 확장, subscriptions, evaluations, verifications, risk_events |
| `033_propfirm_p3_funded.sql` | P3 | hl_order_ledger, payouts, audit_logs |

각 파일은 이전 phase 객체를 건드리지 않음 (additive only).

### 11.6 strategy_id 카탈로그

`engine/ledger_records/` 디렉터리명을 그대로 사용:

```
wtd.compression-breakout-reversal-v1
wtd.funding-flip-reversal-v1
wtd.funding-flip-short-v1
wtd.gap-fade-short-v1
wtd.institutional-distribution-v1
wtd.radar-golden-entry-v1
wtd.tradoor-oi-reversal-v1
wtd.volume-absorption-reversal-v1
wtd.whale-accumulation-reversal-v1
wtd.wyckoff-spring-reversal-v1
```

`library.py` 의 53개 slug 전부 지원. `trading_accounts.strategy_id` 에 `wtd.{slug}` 로 설정하면 해당 패턴 entry phase 시 자동 진입. (**Q-PF-001 ✅ / Q-PF-004 ✅**)

---

## 12. 관련 문서

- [P-01-prd.md](P-01-prd.md) — 제품 요구사항
- [P-03-phases.md](P-03-phases.md) — Phase 1/2/3 구현 로드맵
