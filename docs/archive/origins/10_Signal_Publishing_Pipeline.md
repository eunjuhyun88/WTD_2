# Cogochi — Signal Publishing Pipeline

**Version**: 1.0 (v4 series)
**Date**: 2026-04-24
**Status**: Build spec for Cogochi engine → X auto-posting
**Use**: 엔지니어(본인)가 직접 빌드. 1-2주 작업 목표.

---

## 0. Purpose

Cogochi 엔진에서 시그널이 생성되면 자동으로:
1. X에 즉시 post
2. Discord에 즉시 publish
3. 결과 (TP/SL) resolution 시 update post
4. 모든 데이터 자체 DB 보관 (backtesting 연속)

**Why auto?** Daily 10+ posts 수동 불가능. Scale 위해 automation 필수.

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Cogochi Engine (existing, Python)                        │
│  ├─ Feature computation (every 5min)                     │
│  ├─ LightGBM prediction                                  │
│  ├─ 4-stage gate                                         │
│  └─ Signal generation                                    │
└─────────────────┬────────────────────────────────────────┘
                  ↓ (new signal)
┌──────────────────────────────────────────────────────────┐
│ Signal Formatter                                         │
│  ├─ Format to X post (280 chars)                         │
│  ├─ Format to Discord embed                              │
│  └─ Log to DB                                            │
└─────────┬──────────────────────┬───────────────────────┘
          ↓                      ↓
┌─────────────────┐     ┌──────────────────┐
│ X API Client    │     │ Discord Webhook  │
│ (post signal)   │     │ (post signal)    │
└────────┬────────┘     └────────┬─────────┘
         ↓                       ↓
    Twitter                  Discord #signals
    
┌──────────────────────────────────────────────────────────┐
│ Outcome Resolver (every 5min cron)                       │
│  ├─ Fetch live prices (CCXT)                             │
│  ├─ Check TP/SL/timeout for each open signal             │
│  ├─ Update DB                                            │
│  └─ Post resolution update                               │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Base | Python 3.11 | Cogochi 엔진 기존 스택 |
| X API | tweepy v4 | Official Python X SDK |
| Discord | discord-webhook (package) | 단순, webhook만 사용 |
| Scheduling | APScheduler | Cogochi에 이미 통합 가능 |
| DB | SQLite (초기) → Postgres (scale 후) | 단순 시작 |
| Price feed | CCXT | 다중 거래소 통합 (Binance 기본) |
| Deployment | Systemd service (VPS) | Cogochi 엔진과 동일 서버 |

**비용**:
- X API Basic tier: **$100/mo** (필수. Free tier는 post 제한 심함)
- Discord webhook: 무료
- VPS: 기존 Cogochi 서버 활용
- DB: 무료 (SQLite)

---

## 3. X API Setup

### 3.1 Account Creation

1. X 계정 생성: @cogochi_agent
2. X Developer Portal 접근: https://developer.twitter.com
3. Apply for Developer account (24-48hr 승인)
4. Project + App 생성
5. App permissions: Read and Write (DM 불필요)
6. OAuth 1.0a User context 설정 (posting 용)

### 3.2 API Keys 획득

저장할 키:
```
API_KEY = "..."
API_SECRET = "..."
ACCESS_TOKEN = "..."
ACCESS_SECRET = "..."
BEARER_TOKEN = "..."  # read-only
```

**보안**: `.env` 파일. Git commit 금지. Environment variable.

### 3.3 Basic Tier 구매

**이유**: Free tier는 월 500 post 제한 + read API 제한. Basic $100/mo = 월 3,000 post + better rate limit.

Day 10+ post × 30일 = 300 post/mo. 여유 있음.

---

## 4. Discord Webhook Setup

### 4.1 Server + Channel

1. Discord server 생성 (Cogochi)
2. Channel 생성: #signals (auto-post 전용), #commentary (human)
3. Channel settings → Integrations → Webhooks → New Webhook
4. Webhook URL 복사 (예: `https://discord.com/api/webhooks/.../...`)
5. `.env`에 저장: `DISCORD_WEBHOOK_URL`

### 4.2 Python Integration

```python
from discord_webhook import DiscordWebhook, DiscordEmbed

def post_discord_signal(signal):
    webhook = DiscordWebhook(url=DISCORD_WEBHOOK_URL)
    embed = DiscordEmbed(
        title=f"{signal.asset} {signal.direction.upper()}",
        description=f"Entry: ${signal.entry_price:,.2f}",
        color="00ff00" if signal.direction == "LONG" else "ff0000"
    )
    embed.add_embed_field(name="TP", value=f"+{signal.tp_pct}%", inline=True)
    embed.add_embed_field(name="SL", value=f"-{signal.sl_pct}%", inline=True)
    embed.add_embed_field(name="Confidence", value=f"{signal.confidence:.0%}", inline=True)
    embed.add_embed_field(name="Drivers", value=signal.drivers_text, inline=False)
    embed.add_embed_field(name="Valid Until", value=signal.valid_until_str, inline=False)
    embed.set_footer(text=f"Cogochi • Signal #{signal.id}")
    webhook.add_embed(embed)
    response = webhook.execute()
    return response.status_code == 200
```

---

## 5. Signal Data Schema

### 5.1 Python dataclass

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, List
from enum import Enum

class SignalStatus(Enum):
    OPEN = "open"
    TP_HIT = "tp_hit"
    SL_HIT = "sl_hit"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"

@dataclass
class CogochiSignal:
    # Identifiers
    id: int
    created_at: datetime
    
    # Signal core
    asset: str                    # "BTC", "ETH", "SOL"
    direction: Literal["LONG", "SHORT"]
    entry_price: float
    tp_pct: float                 # percentage, e.g., 3.0 for 3%
    sl_pct: float
    valid_until: datetime
    
    # Engine metadata
    confidence: float             # 0.0-1.0 from LightGBM
    feature_snapshot: dict        # {"funding_rate": -0.02, "cvd_divergence": 1.2, ...}
    triggered_patterns: List[str] # ["funding_cvd_divergence", "whale_accumulation"]
    drivers_text: str             # Human-readable: "Funding -0.02% + CVD divergence + 3 whale deposits"
    
    # Outcome (filled after resolution)
    status: SignalStatus = SignalStatus.OPEN
    closed_at: datetime = None
    exit_price: float = None
    pnl_pct: float = None
    
    # Social posting
    x_post_id: str = None         # Tweet ID
    discord_message_id: str = None
    
    # Metadata
    version: str = "1.0"          # Engine version
```

### 5.2 SQLite Schema

```sql
CREATE TABLE signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TIMESTAMP NOT NULL,
    asset TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    tp_pct REAL NOT NULL,
    sl_pct REAL NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    
    confidence REAL NOT NULL,
    feature_snapshot_json TEXT,
    triggered_patterns_json TEXT,
    drivers_text TEXT,
    
    status TEXT DEFAULT 'open',
    closed_at TIMESTAMP,
    exit_price REAL,
    pnl_pct REAL,
    
    x_post_id TEXT,
    discord_message_id TEXT,
    
    engine_version TEXT DEFAULT '1.0'
);

CREATE INDEX idx_status ON signals(status);
CREATE INDEX idx_created_at ON signals(created_at);
CREATE INDEX idx_asset_direction ON signals(asset, direction);
```

---

## 6. X Post Formatter

### 6.1 Template

```python
def format_x_signal_post(signal: CogochiSignal) -> str:
    """Format signal to X post (<= 280 chars)"""
    
    direction_emoji = "🟢" if signal.direction == "LONG" else "🔴"
    
    text = f"""${signal.asset} {signal.direction} | Entry ${signal.entry_price:,.0f} | TP +{signal.tp_pct:.1f}% | SL -{signal.sl_pct:.1f}% | Conf {signal.confidence:.0%}

Drivers: {signal.drivers_text}

Valid: {format_duration(signal.valid_until - datetime.utcnow())}"""
    
    # Ensure <= 280 chars
    if len(text) > 280:
        # Truncate drivers_text
        max_drivers_len = len(signal.drivers_text) - (len(text) - 278)
        drivers = signal.drivers_text[:max_drivers_len] + "..."
        text = f"""${signal.asset} {signal.direction} | Entry ${signal.entry_price:,.0f} | TP +{signal.tp_pct:.1f}% | SL -{signal.sl_pct:.1f}% | Conf {signal.confidence:.0%}

Drivers: {drivers}

Valid: {format_duration(signal.valid_until - datetime.utcnow())}"""
    
    return text

def format_duration(td):
    """24h -> '24h', 90min -> '1.5h', etc"""
    hours = td.total_seconds() / 3600
    if hours >= 24:
        return f"{hours/24:.0f}d"
    elif hours >= 1:
        return f"{hours:.1f}h" if hours != int(hours) else f"{int(hours)}h"
    else:
        return f"{td.total_seconds()/60:.0f}m"
```

### 6.2 Resolution Post (TP/SL/Timeout hit)

```python
def format_resolution_post(signal: CogochiSignal) -> str:
    """Post when signal closes"""
    
    if signal.status == SignalStatus.TP_HIT:
        emoji = "✅"
        outcome = "TP hit"
        pnl_text = f"+{signal.pnl_pct:.1f}%"
    elif signal.status == SignalStatus.SL_HIT:
        emoji = "❌"
        outcome = "SL hit"
        pnl_text = f"{signal.pnl_pct:.1f}%"
    else:
        emoji = "⏱️"
        outcome = "Timeout"
        pnl_text = f"{signal.pnl_pct:.1f}% (unrealized)"
    
    duration = signal.closed_at - signal.created_at
    
    text = f"""{emoji} Closed ${signal.asset} {signal.direction}

{outcome} at ${signal.exit_price:,.0f} | {pnl_text} | Held {format_duration(duration)}

Patterns: {', '.join(signal.triggered_patterns[:2])}"""
    
    return text
```

### 6.3 Batch posting rules

- **Single signal per post**: 여러 시그널 combine 금지 (each gets own tweet)
- **Thread for multi-signal**: 동시 3+ signal이면 thread
- **Resolution은 original tweet reply**: Thread 연결

---

## 7. Publishing Engine

### 7.1 Main Loop

```python
import asyncio
import tweepy
from datetime import datetime

class CogochiPublisher:
    def __init__(self, x_client, discord_webhook, db):
        self.x = x_client
        self.discord_url = discord_webhook
        self.db = db
    
    async def publish_signal(self, signal: CogochiSignal):
        """Publish new signal to X + Discord"""
        try:
            # 1. X post
            x_text = format_x_signal_post(signal)
            tweet = self.x.create_tweet(text=x_text)
            signal.x_post_id = tweet.data['id']
            
            # 2. Discord
            discord_result = post_discord_signal(signal)
            
            # 3. Save to DB
            self.db.save_signal(signal)
            
            # 4. Log
            log.info(f"Signal {signal.id} published. X: {tweet.data['id']}")
            
            return True
        except Exception as e:
            log.error(f"Publish failed for signal {signal.id}: {e}")
            # Send alert (email/Telegram) for critical failures
            return False
    
    async def publish_resolution(self, signal: CogochiSignal):
        """Post resolution as reply to original tweet"""
        try:
            x_text = format_resolution_post(signal)
            
            # Reply to original signal tweet
            reply = self.x.create_tweet(
                text=x_text,
                in_reply_to_tweet_id=signal.x_post_id
            )
            
            # Discord update (edit original embed or new message)
            post_discord_resolution(signal)
            
            # DB update
            self.db.update_signal(signal)
            
            return True
        except Exception as e:
            log.error(f"Resolution publish failed for signal {signal.id}: {e}")
            return False
```

### 7.2 Integration with Cogochi Engine

기존 Cogochi engine signal generation 지점에 hook 추가:

```python
# In cogochi_engine.py (existing)
def on_signal_generated(self, signal_data):
    """Hook called when 4-stage gate passes"""
    # Existing logic...
    
    # NEW: Publish to social
    cogochi_signal = CogochiSignal(
        id=self.next_signal_id(),
        created_at=datetime.utcnow(),
        asset=signal_data['asset'],
        direction=signal_data['direction'],
        entry_price=signal_data['entry_price'],
        tp_pct=signal_data['tp_pct'],
        sl_pct=signal_data['sl_pct'],
        valid_until=datetime.utcnow() + timedelta(hours=signal_data['duration_hours']),
        confidence=signal_data['confidence'],
        feature_snapshot=signal_data['features'],
        triggered_patterns=signal_data['patterns'],
        drivers_text=self._format_drivers(signal_data['patterns'], signal_data['features']),
    )
    
    # Fire and forget async publish
    asyncio.create_task(self.publisher.publish_signal(cogochi_signal))
```

---

## 8. Outcome Resolver

### 8.1 Cron Job

5분마다 실행. Open signal 중 TP/SL/timeout 도달 것들 resolve.

```python
import schedule
import time

def resolve_open_signals(db, publisher, price_feed):
    open_signals = db.get_open_signals()
    
    for signal in open_signals:
        current_price = price_feed.get_price(signal.asset)
        
        # Calculate PnL
        if signal.direction == "LONG":
            pnl_pct = ((current_price - signal.entry_price) / signal.entry_price) * 100
        else:  # SHORT
            pnl_pct = ((signal.entry_price - current_price) / signal.entry_price) * 100
        
        # Check TP
        if pnl_pct >= signal.tp_pct:
            signal.status = SignalStatus.TP_HIT
            signal.closed_at = datetime.utcnow()
            signal.exit_price = current_price
            signal.pnl_pct = pnl_pct
            asyncio.run(publisher.publish_resolution(signal))
            continue
        
        # Check SL
        if pnl_pct <= -signal.sl_pct:
            signal.status = SignalStatus.SL_HIT
            signal.closed_at = datetime.utcnow()
            signal.exit_price = current_price
            signal.pnl_pct = pnl_pct
            asyncio.run(publisher.publish_resolution(signal))
            continue
        
        # Check timeout
        if datetime.utcnow() >= signal.valid_until:
            signal.status = SignalStatus.TIMEOUT
            signal.closed_at = datetime.utcnow()
            signal.exit_price = current_price
            signal.pnl_pct = pnl_pct
            asyncio.run(publisher.publish_resolution(signal))

# Schedule
schedule.every(5).minutes.do(resolve_open_signals, db, publisher, price_feed)

while True:
    schedule.run_pending()
    time.sleep(1)
```

### 8.2 Price feed (CCXT)

```python
import ccxt

class BinancePriceFeed:
    def __init__(self):
        self.exchange = ccxt.binance()
    
    def get_price(self, asset: str) -> float:
        """Get current mark price from Binance perp"""
        symbol = f"{asset}/USDT"
        ticker = self.exchange.fetch_ticker(symbol)
        return ticker['last']
```

**Fallback**: Binance API down 시 Coinbase / OKX 이용.

---

## 9. Rate Limiting & Queue

### 9.1 X API Rate Limits

Basic tier:
- User context (posting): **300 tweets per 15분**
- Bearer context (reading): **450 requests per 15분**

Daily 10-15 tweets = **분당 평균 0.01 tweet**. 여유 많음.

### 9.2 Queue (안전 장치)

버스트 시그널 발생 시 (예: 동시 5개) 분산 post:

```python
from collections import deque
import asyncio

class PostQueue:
    def __init__(self, min_interval_seconds=10):
        self.queue = deque()
        self.min_interval = min_interval_seconds
        self.last_post_time = None
    
    async def add(self, signal):
        self.queue.append(signal)
    
    async def process(self, publisher):
        while True:
            if self.queue:
                signal = self.queue.popleft()
                
                # Respect min interval
                if self.last_post_time:
                    elapsed = time.time() - self.last_post_time
                    if elapsed < self.min_interval:
                        await asyncio.sleep(self.min_interval - elapsed)
                
                await publisher.publish_signal(signal)
                self.last_post_time = time.time()
            
            await asyncio.sleep(1)
```

이것으로 X spam 방지 + 10초 간격 보장.

---

## 10. Monitoring & Alerts

### 10.1 Critical Failures

다음 상황 시 즉시 알림 (Telegram bot 또는 email):

- X API 인증 실패 (token 만료 등)
- Discord webhook 실패
- Cogochi engine signal 생성 후 15분 내 publish 안 됨
- Resolution loop crash

### 10.2 Daily Health Check

```python
def daily_health_check():
    stats = db.get_24h_stats()
    message = f"""
📊 Cogochi Daily Stats (Last 24h)

Signals published: {stats['signals_published']}
Signals resolved: {stats['signals_resolved']}
  - TP: {stats['tp_count']} ({stats['tp_count']/stats['signals_resolved']*100:.0f}%)
  - SL: {stats['sl_count']}
  - Timeout: {stats['timeout_count']}

Avg PnL per signal: {stats['avg_pnl']:.2f}%
Cumulative PnL: {stats['cumulative_pnl']:.2f}%

X API usage: {stats['x_post_count']} / 300 (per 15min window)
Errors: {stats['error_count']}
"""
    send_telegram_alert(message)

schedule.every().day.at("00:00").do(daily_health_check)
```

### 10.3 Dashboard (optional, Week 2+)

간단 web dashboard (Flask):
- 오늘/이번주/이번달 signal count
- Win rate by asset
- Feature importance (which patterns 가장 수익)
- X metrics (followers growth, engagement)

---

## 11. Deployment

### 11.1 VPS Setup

- **Existing Cogochi server 이용** (별도 서버 불필요)
- Requirements: Python 3.11+, 2GB RAM 여유분

### 11.2 Systemd Service

```ini
# /etc/systemd/system/cogochi-publisher.service

[Unit]
Description=Cogochi Signal Publisher
After=network.target cogochi-engine.service

[Service]
Type=simple
User=cogochi
WorkingDirectory=/opt/cogochi
Environment="PYTHONPATH=/opt/cogochi"
EnvironmentFile=/opt/cogochi/.env
ExecStart=/opt/cogochi/venv/bin/python -m cogochi.publisher
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

### 11.3 Deployment checklist

- [ ] Python venv 생성
- [ ] `pip install tweepy discord-webhook apscheduler ccxt python-dotenv`
- [ ] `.env` 파일 생성 (API keys)
- [ ] SQLite DB 초기화
- [ ] Systemd service 등록
- [ ] Dry run test (testnet X account 사용)
- [ ] Mainnet X account로 전환
- [ ] 첫 24시간 모니터링 (logs 확인)

---

## 12. Timeline (1-2 weeks build)

### Day 1-2: Setup

- [ ] X Developer account apply
- [ ] Discord server + webhook
- [ ] Python env + dependencies
- [ ] DB schema

### Day 3-4: Core Publisher

- [ ] `CogochiSignal` dataclass
- [ ] X post formatter
- [ ] Discord embed formatter
- [ ] Basic publish function

### Day 5-6: Integration

- [ ] Cogochi engine hook
- [ ] Signal → publisher 연결 테스트
- [ ] Dry run signals (testnet X)

### Day 7-8: Resolver

- [ ] Outcome resolver cron
- [ ] Price feed (CCXT)
- [ ] Resolution posting

### Day 9-10: Production

- [ ] Systemd service
- [ ] Monitoring + alerts
- [ ] First live signals (low volume)

### Day 11-14: Polish

- [ ] Rate limiting + queue
- [ ] Error recovery
- [ ] Daily stats
- [ ] Dashboard (optional)

**Total**: 10-14일 본인 빌드. Engineer 있으면 1주일 단축.

---

## 13. Post-Launch Iteration

### 13.1 Week 1 (Launch week)

- 실시간 모니터링 (X post 성공률, Discord post 성공률)
- Rate limit 이슈 없는지 (300/15min)
- Engagement 데이터 수집

### 13.2 Month 1

- Signal format A/B test
  - Variant A: 현재 format
  - Variant B: emoji 많음
  - Variant C: data 적음 + narrative
- Best performing variant로 default 전환

### 13.3 Month 2+

- Premium signal feed (60k+ $COGOCHI stake 전용)
- API endpoint 제공 (월 $99)
- Terminal web app

---

## 14. Cost Summary

**Monthly**:
- X API Basic: $100
- VPS (existing): $0 (기존 서버)
- Domain: $1 (이미 있음 가정)
- Monitoring (Grafana free tier): $0
- **Total: ~$100/month**

**One-time**:
- Dev 인건비: 본인 시간 (10-14일)
- Testing: $10-30 VIRTUAL (시그널 dry run)
- **Total: $0 if solo**

---

## 15. Open Questions

1. **X Developer 승인 얼마나 걸림?**
   - 보통 24-48시간, 가끔 1주
   - Launch 최소 2주 전 apply 권장

2. **Rate limit 진짜 문제 없음?**
   - Daily 15 tweet는 300/15min 대비 여유
   - 단 reply, retweet까지 합치면 주의

3. **Discord bot token 권장?**
   - Webhook만으로 충분 (post only). Bot token은 interaction 필요 시.
   - Week 4 이후 bot 도입 고려 (slash commands, role 관리)

4. **Signal format 변경 시 기존 post 영향?**
   - 변경 시 Day N부터 new format
   - Historical data는 그대로 (format 외엔)

5. **X account 정지되면?**
   - AIXBT도 여러 번 정지됨
   - Backup account 준비 권장 (@cogochi_agent_2)
   - Discord는 independent라 생존

---

## Version Control

| V | Date | Changes |
|---|------|---------|
| 1.0 | 2026-04-24 | Initial Pipeline spec (v4 pivot) |

---

**End of Signal Publishing Pipeline**
