# 09 — Integration Spec (External APIs)

**버전**: v1.0 (2026-04-25)
**상태**: canonical (technical, supplements design 06_DATA_CONTRACTS.md)
**의도**: 외부 데이터 source / 알림 sink / 실행 deeplink를 어떻게 붙일지 기술 명세

---

## 0. 원칙

### 0.1 Buy data, don't build

Binance/Bybit primary feed는 직접 수집 (free), 나머지는 **API consume**:
- CoinGlass (cross-exchange aggregation, ETF, on-chain)
- Velo (CVD, basis, options) — optional Phase 2

### 0.2 외부 의존도 최소

각 외부 source는 **fallback**과 함께. Single point of failure 없음.

### 0.3 Cost 모니터링

Per-WAA cost를 항상 추적. Velo $199, CoinGlass $29, Anthropic $X 등.

### 0.4 비-목표

- 모든 거래소 100% 커버
- Tick-level data
- Real-time WebSocket for everything (배치로 충분)
- 자체 data center 구축

---

## 1. Integration 분류

```
┌─────────────────────────────────────────────────┐
│ INPUT (data source)                              │
│  - Binance Perp (WebSocket + REST)              │
│  - Bybit Perp (WebSocket + REST)                │
│  - OKX Perp (REST)                              │
│  - CoinGlass (REST API)                         │
│  - Velo Data API (optional, REST + WS)          │
│  - Velo News API (optional, WS)                 │
│  - Anthropic Claude (LLM parser)                │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ ENGINE (Cogochi internal)                        │
│  - Feature engine                                │
│  - State machine                                 │
│  - Search engine                                 │
│  - Ledger                                        │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ OUTPUT (sink + deeplink)                         │
│  - Telegram bot (push)                          │
│  - Discord webhook (push)                       │
│  - Email (Mailgun/SendGrid)                     │
│  - Push notification (Web Push, OneSignal)      │
│  - Velo deeplink (chart open)                   │
│  - TradingView deeplink                         │
│  - Stripe (billing)                             │
└─────────────────────────────────────────────────┘
```

각 박스에 **owner agent** 지정.

---

## 2. INPUT: Binance Perp

### 2.1 Primary feed (always)

- **WebSocket public streams** (free, unlimited)
- **REST API public** (rate limit 1200/min)
- **Endpoints used**:
  - `wss://fstream.binance.com/ws/!ticker@arr` — 모든 종목 ticker
  - `wss://fstream.binance.com/ws/<symbol>@kline_<interval>` — 분봉
  - `wss://fstream.binance.com/ws/<symbol>@aggTrade` — trades
  - `https://fapi.binance.com/fapi/v1/klines` — historical
  - `https://fapi.binance.com/fapi/v1/openInterest` — OI
  - `https://fapi.binance.com/fapi/v1/fundingRate` — funding
  - `https://fapi.binance.com/futures/data/topLongShortAccountRatio` — L/S

### 2.2 Architecture

```
binance_websocket_consumer (worker)
  → kafka topic 'binance.raw'
  → feature_calculator (consumer)
  → feature_windows table
```

### 2.3 Resilience

- Auto-reconnect on disconnect (backoff)
- 5sec without heartbeat → reconnect
- Buffer 5min on disconnect (catch up via REST)
- Multiple WS connections (per category) for redundancy

### 2.4 Cost

- $0 direct
- Compute: ~$50-150/mo (worker + buffer)

---

## 3. INPUT: Bybit + OKX Perp

### 3.1 Bybit

- **WebSocket** (free): `wss://stream.bybit.com/v5/public/linear`
- **REST**: rate limit 120/sec
- Endpoints similar to Binance

### 3.2 OKX

- **WebSocket**: `wss://ws.okx.com:8443/ws/v5/public`
- **REST**: rate limit varies
- Endpoints `api.okx.com/api/v5/public/instruments`

### 3.3 Priority

- Phase 1 (M0-M1): Binance only
- Phase 2 (M3-M6): + Bybit
- Phase 3 (M6+): + OKX
- Phase 4 (M12+): Hyperliquid (Velo는 이미 deep)

### 3.4 Cross-exchange aggregation

Tasks:
- Symbol normalization (BTCUSDT vs BTC-USDT vs BTC/USDT)
- OI sum across exchanges
- Funding weighted avg by OI
- Volume sum

각 exchange의 raw 데이터는 별도 보관, aggregated는 derived feature로.

---

## 4. INPUT: CoinGlass API

### 4.1 Use case

다음 데이터는 **자체 수집보다 CoinGlass에서 받는 게 효율**:
- ETF flows
- On-chain macro indicators
- Hyperliquid whale tracking
- Cross-exchange CVD aggregation

### 4.2 Tier 선택

- **Standard tier $29/mo** (M3 시작)
- **Professional $99/mo** (필요 시 backfill용으로 1개월)
- **Enterprise는 No** (overkill)

### 4.3 Endpoints (planned use)

```
/openInterest/aggregated
/fundingRate/aggregated
/longShortRatio
/etfFlows
/whaleAlerts
/onchainIndicators (MVRV, NUPL, etc)
/liquidationHistory
/cvdAggregated
```

### 4.4 Architecture

```
coinglass_poller (worker)
  → REST every 1-15min depending on endpoint
  → kafka topic 'coinglass.raw'
  → feature merger
  → enriched_features table
```

### 4.5 Caching

- ETF flows: 1h cache
- Macro indicators: 6h cache
- OI/funding: 1min cache

Cache hit ratio 목표 > 80%.

---

## 5. INPUT: Velo Data API (Optional Phase 2)

### 5.1 Use case

Velo가 우리보다 잘하는 것:
- OI-Normalized CVD
- 3-Month Annualized Basis (BTC/ETH)
- Multi-exchange CVD aggregation
- Cumulative Return By Session

### 5.2 결정 기준

- Phase 2 (M6+): trial 후 결정
- 자체 구현 vs $199/mo Velo:
  - 만일 자체 구현 < 1주 → 직접
  - 만일 자체 구현 > 2주 → Velo

### 5.3 Endpoints (if subscribed)

```python
client.get_rows({
    'type': 'futures',
    'columns': ['oi_normalized_cvd', '3m_basis_ann'],
    'exchanges': ['binance-futures', 'bybit'],
    'products': ['BTCUSDT'],
    'resolution': '1m'
})
```

### 5.4 Cost trade-off

- Velo $199 vs in-house compute
- Per WAA cost: $0.50-1.00 보충 (만일 1000 WAA)
- 정당화: 정확도 ↑, time-to-launch ↓

---

## 6. INPUT: Velo News API (Optional Phase 2)

### 6.1 Use case

Crypto news가 패턴에 영향:
- High-priority news → 모든 active state pause
- Coin-tagged news → 그 coin phase reset
- News + setup 동시 → confidence boost or invalidation

### 6.2 Decision

- Phase 2: $129/mo trial 1개월
- 가치 충분하면 P1 feature
- 가치 부족하면 자체 RSS aggregator (free)

### 6.3 WebSocket schema

```json
{
  "id": 55,
  "time": 1704085200000,
  "headline": "...",
  "priority": 1,
  "coins": ["BTC"],
  "summary": "..."
}
```

Edit / delete events 지원 (rare).

### 6.4 Architecture

```
velo_news_consumer (worker)
  → real-time WebSocket
  → kafka 'news.events'
  → news_handler (per pattern_runtime_state)
```

---

## 7. INPUT: Anthropic Claude (Parser)

### 7.1 Use case

- Pattern parser (필수 day-1)
- LLM judge (Phase 2 optional)
- Chart interpreter (Phase 3)

### 7.2 Setup

```python
import anthropic

client = anthropic.Anthropic(api_key=...)

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=2048,
    tools=[{
        "type": "function",
        "function": {
            "name": "emit_pattern_draft",
            "parameters": PATTERN_DRAFT_SCHEMA,
        }
    }],
    tool_choice={"type": "tool", "name": "emit_pattern_draft"},
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": SYSTEM_PROMPT},
            {"type": "text", "text": user_text},
        ]
    }]
)
```

### 7.3 Cost

- Claude Sonnet 4.5: ~$3/M input, $15/M output [estimate]
- Per parse: ~$0.015 (1K in, 2K out)
- Per WAA: 100 parses/mo = $1.50

### 7.4 Caching

- Hash(text) → cached response 24h
- Hit ratio 목표 > 30% (사람들이 비슷한 메모 반복)

### 7.5 Failure mode

- 3 retry → 422 to user
- Cost spike → daily budget cap → throttle

---

## 8. OUTPUT: Telegram Bot

### 8.1 Use case (P1 feature)

- Phase transition alert
- Outcome notification
- Daily digest

### 8.2 Setup

- Bot via @BotFather (per user)
- 또는 Cogochi 공용 bot
- User token storage encrypted

### 8.3 API

```python
# python-telegram-bot
async def send_alert(user_chat_id, text, image_url):
    await bot.send_photo(
        chat_id=user_chat_id,
        photo=image_url,
        caption=text,
        parse_mode='Markdown'
    )
```

### 8.4 Rate limits

- 30 messages/sec global
- 1 message/sec per chat
- Bulk send queue 필요

### 8.5 Per-user setup flow

```
1. User clicks "Connect Telegram"
2. Cogochi shows: "Send /start to @cogochi_alert_bot from your Telegram"
3. Bot이 chat_id capture → DB
4. Verify connection
5. Done
```

### 8.6 Cost

- $0 (Telegram free)
- Compute: $20-50/mo

---

## 9. OUTPUT: Discord Webhook

### 9.1 Use case (P2)

- Community channel push
- Team workspace notifications

### 9.2 Setup

- User가 Discord webhook URL 제공
- Cogochi가 그 URL로 POST

### 9.3 Limits

- 30 messages/min per webhook
- 6000 chars per message

### 9.4 Cost

- $0

---

## 10. OUTPUT: Email (Mailgun)

### 10.1 Use case

- Onboarding sequence (PRD_07)
- Outcome notifications
- Marketing
- Receipts (via Stripe)

### 10.2 Provider

- **Mailgun** (primary)
- **SendGrid** (backup)

### 10.3 Cost

- Mailgun: $35/mo for 50K emails
- ~$0.001 per email

### 10.4 Templates

- React Email or MJML
- Brand consistency
- Plain text fallback

### 10.5 Compliance

- SPF, DKIM, DMARC
- Unsubscribe link 모든 marketing email
- GDPR / KISA 준수

---

## 11. OUTPUT: Web Push Notification

### 11.1 Use case

- Mobile/desktop browser push
- Pattern transition alert
- Outcome ready

### 11.2 Provider

- **OneSignal** (free up to 10K subscribers)
- **Web Push API** (직접 구현, free)

### 11.3 User flow

```
1. User opens Cogochi
2. Browser asks "Allow notifications?"
3. Permission granted → token stored
4. Server pushes via FCM/APNs
```

### 11.4 Cost

- OneSignal free: 10K MAU
- After: $9/mo per 10K extra

---

## 12. OUTPUT: Stripe (Billing)

### 12.1 Why Stripe

- Industry standard
- Subscription handling 정착
- Korea/Asia 지원
- Tax handling

### 12.2 Implementation

```python
# Pro tier signup
stripe.Subscription.create(
    customer=customer_id,
    items=[{"price": "price_pro_monthly_29"}],
    payment_behavior='default_incomplete',
    expand=['latest_invoice.payment_intent'],
)
```

### 12.3 Webhooks

```
checkout.session.completed → activate Pro
customer.subscription.deleted → downgrade to Free
invoice.payment_failed → notify + retry
```

### 12.4 Backup

- Lemon Squeezy (Merchant of Record, 세금 자동)
- Crypto payment (Coinbase Commerce, 옵션)

### 12.5 Cost

- Stripe: 2.9% + $0.30 per transaction
- 추가 1% (international cards)

---

## 13. OUTPUT: Velo Deeplink (P2)

### 13.1 Use case

Cogochi capture → Velo chart open

### 13.2 URL format (proposed)

```
https://velo.xyz/chart?symbol=BTCUSDT&exchange=binance&tf=1h&t=1714045200
```

### 13.3 Workflow

- Cogochi capture detail page
- "Open in Velo" button
- 새 탭으로 Velo open with same context

### 13.4 Mutual benefit

- Cogochi user → Velo로 trade
- Velo user 일부 → Cogochi 발견 가능

---

## 14. OUTPUT: TradingView Deeplink

### 14.1 URL format

```
https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT.P&interval=60
```

### 14.2 Workflow

- Capture에서 "Open in TradingView" 버튼
- 새 탭에서 차트 open

---

## 15. Architecture Overview

```
┌────────────────────────────────────────────────────┐
│ EXTERNAL APIS                                       │
│ Binance / Bybit / OKX (free)                       │
│ CoinGlass ($29) / Velo ($199 opt)                  │
│ Anthropic Claude (LLM)                             │
└────────────────────────────────────────────────────┘
            │ ingestion workers
            ▼
┌────────────────────────────────────────────────────┐
│ KAFKA / NATS (event bus)                           │
│ topics: binance.raw, coinglass.enriched, news.evt  │
└────────────────────────────────────────────────────┘
            │ consumers
            ▼
┌────────────────────────────────────────────────────┐
│ FEATURE ENGINE (engine-api)                        │
│ - feature_calculator                               │
│ - state_machine                                    │
│ - scanner                                          │
│ - search_engine                                    │
│ - ledger                                           │
└────────────────────────────────────────────────────┘
            │ events
            ▼
┌────────────────────────────────────────────────────┐
│ NOTIFICATION DISPATCHER                            │
│ - telegram_sender                                  │
│ - discord_sender                                   │
│ - email_sender                                     │
│ - push_sender                                      │
└────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────┐
│ USER (mobile/desktop/email/messenger)              │
└────────────────────────────────────────────────────┘
```

---

## 16. Cost Model Summary (per WAA at 1000 users)

| Service | Monthly cost | Per WAA |
|---|---|---|
| Binance/Bybit/OKX feeds | $0 | $0 |
| CoinGlass Standard | $29 | $0.03 |
| Velo (optional) | $199 | $0.20 |
| Velo News (optional) | $129 | $0.13 |
| Anthropic Claude | $1500 (1500 parses) | $1.50 |
| Mailgun | $35 | $0.04 |
| OneSignal | $9 | $0.01 |
| Stripe (2.9% of MRR) | $290 (10% of $29 × 1000) | $0.29 |
| Postgres (managed) | $50 | $0.05 |
| Compute (workers + API) | $300-500 | $0.30-0.50 |
| **TOTAL** | **~$2,500-2,700** | **~$2.50-2.70** |

Pro $29 ARPU 가정:
- Margin: $26 → 90%

Pro Plus $79:
- Higher LLM/API usage but margin still > 85%

Team $199:
- Margin > 90% (multi-seat efficiency)

---

## 17. Failure & Resilience

### 17.1 Source down

| Source | Backup |
|---|---|
| Binance WS down | Switch to REST poll (5min lag) |
| CoinGlass down | Use last cached + Velo backup |
| Velo down | Skip optional features, log |
| Anthropic down | Queue parse requests, retry |
| Telegram down | Email fallback |
| Stripe down | Queue subscription changes |

### 17.2 Rate limit hit

- Exponential backoff
- Request queue
- User-facing degraded mode banner

### 17.3 Multi-region

Phase 3+ (M12):
- Asia (Korea/Singapore) primary
- US backup
- Europe → only after demand

---

## 18. Security & Compliance

### 18.1 API keys storage

- Encrypted at rest (AWS KMS / Vault)
- Per-environment isolated (dev/staging/prod)
- Rotation 90일 cycle

### 18.2 User data

- PII minimal (email, payment via Stripe)
- Trading data 본인 권한
- No exchange API key collection (we don't trade)

### 18.3 Compliance

- GDPR (EU users)
- KISA (Korea)
- CCPA (California)

---

## 19. Monitoring

### 19.1 Per-integration metrics

- Latency (p50, p95, p99)
- Error rate
- Cost spike
- Cache hit ratio

### 19.2 Alerts

- Latency p95 > 5s → page
- Error rate > 5% → page
- Cost > $X/day → email
- Cache hit < 20% → investigate

### 19.3 Dashboards

- Per-integration usage
- Per-WAA cost trend
- Source freshness (last data point time)

---

## 20. Implementation Priority

| Integration | Priority | Target |
|---|---|---|
| Binance feed | **P0** | M0 |
| Anthropic parser | **P0** | M1 (Slice 3) |
| Stripe billing | **P0** | M3 |
| Email | **P0** | M3 |
| CoinGlass API | **P0** | M3 (Slice 6) |
| Bybit feed | P1 | M6 |
| Telegram bot | P1 | M3 |
| Push notification | P1 | M3 |
| OKX feed | P1 | M6 |
| Velo Deeplink | P2 | M6 |
| TradingView Deeplink | P2 | M6 |
| Velo Data API | P2 | M9 |
| Velo News | P2 | M9 |
| Discord webhook | P2 | M9 |
| Hyperliquid | P3 | M12+ |

---

## 21. 한 줄 결론

> **외부 source 8개, sink 6개. Per-WAA 외부 비용 $2.50-2.70.**
> **Pro $29 → margin 90%. Pro Plus $79 → 85%+. Team $199 → 90%+.**
> **각 integration에 fallback 필수. SPOF 없음.**
