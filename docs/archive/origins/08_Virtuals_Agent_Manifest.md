# Cogochi — Virtuals Agent Manifest

**Version**: 1.0 (v4 series — Virtuals pivot)
**Date**: 2026-04-24
**Status**: Pre-launch prep document
**Use**: Virtuals 등록 시 input + X/Discord 브랜딩 consistency

---

## 0. 이 문서의 역할

Virtuals Protocol에 agent 등록할 때 필요한 모든 정보를 한 곳에. Launch Radar, Capital Formation 등 모듈 설정도 포함. **Launch 직전 이 문서를 복사해서 Virtuals dashboard에 입력**한다.

---

## 1. Agent Identity

### 1.1 Basic Info

- **Agent Name**: Cogochi
- **Ticker**: $COGOCHI (또는 $COGO — Virtuals에서 중복 확인 필요)
- **Chain**: Base (Virtuals 기본값) OR Solana (선택)
- **Category**: AI Trading Signal Agent
- **Tagline**: *"Algorithmic trading signals, verified on-chain. 28 features. 4-stage backtest gate. No sentiment theater."*

**Chain 선택**:
- **Base** 추천: Virtuals 기본 생태계, 유동성 깊음, AIXBT 등 경쟁자 동일 체인
- Solana는 volume 높지만 Virtuals ecosystem 상대적으로 작음 (tradeoff)

### 1.2 Bio (Virtuals profile)

**Short (280자)**:
> Cogochi is an algorithmic trading signal agent. It tracks 28 market features across spot/futures/on-chain data, uses LightGBM for win-probability prediction, and emits signals only after passing a 4-stage validation gate. No vibes. No influencer noise. Just numbers.

**Long (bio section)**:
> **Who we are**: Cogochi is an AI trading signal agent that removes the human bias from crypto market analysis. Built over 3 years by a solo founder with a quant background.
>
> **What we do**:
> - Track 28 real-time features from Binance spot/futures and on-chain data (CVD, OI, funding, whale flows)
> - Use LightGBM to predict win probability for pattern setups
> - Apply 29 pattern building blocks combined via Hill Climbing optimization
> - Publish signals only after 4-stage validation: backtest → walk-forward → paper → live
>
> **What makes us different**:
> - Not sentiment-based (unlike AIXBT)
> - Not KOL-aggregator (unlike most "AI" agents)
> - Numerical. Verifiable. Published on-chain with timestamp and oracle-confirmed entry price.
> - Backtest data fully public. No "trust me" claims.
>
> **What $COGOCHI holders get**:
> - Hold 60k+ $COGOCHI → Terminal access (detailed signal logs, historical PnL per pattern)
> - Community signal feed (X, Discord)
> - Governance on engine parameter changes
> - Buy-back-and-burn from signal subscription revenue

### 1.3 Visual Identity

- **Avatar**: [TBD — 2D illustration of an AI creature with trading screens]
- **Color palette**: Dark (bg) + Green (+PnL) + Red (-PnL) + Cyan accent
- **Font**: Monospace for signal posts, sans-serif for marketing

**DIY 옵션** (비용 절약):
- Midjourney/DALL-E로 avatar 생성 (~$10)
- Canva로 header image (~$0)
- Consistency만 유지하면 됨

---

## 2. Differentiation vs Competitors

Virtuals agent 생태계에서 차별화 포지셔닝. Launch 전 X bio, launch post, Discord에서 반복적으로 써야 하는 메시지.

### 2.1 AIXBT와의 차별화 (가장 중요)

| | AIXBT | Cogochi |
|---|-------|---------|
| Signal type | Sentiment (X posts, KOL) | Technical + ML (OHLCV, indicators) |
| Data sources | Social media 400+ KOL | Binance, Coinalyze, on-chain data |
| Validation | Self-reported 83% accuracy | **Public backtest + walk-forward + live track record** |
| Transparency | Black-box sentiment score | **Open feature weights, public Hill Climbing logs** |
| Signal format | "X is bullish" narrative | "$BTC LONG Entry 50000 TP +3% SL -1.5% Conf 72%" |
| Execution help | None (insight only) | Specific entry/TP/SL levels |

**Key message**: *"AIXBT tells you what the tape is saying. Cogochi tells you what to do about it."*

### 2.2 Other Virtuals Agents

- **G.A.M.E. framework agents**: 엔터테인먼트/게임 agent들 — Cogochi와 다른 용도
- **Luna**: 라이브스트리머 agent — 엔터테인먼트
- **Prefrontal Cortex**: 리서치/분석 agent — 부분 겹침

**Cogochi 고유 자리**: "The only Virtuals agent that gives actionable trade setups with verifiable backtest."

### 2.3 비-Virtuals 경쟁

- **Trading Discord groups ($29-99/mo)**: 인간 운영, 바이어스 있음
- **TradingView 시그널 indicators**: 정적, 적응 안 함
- **Binance auto-trading bots**: 전략 옵션만, 시그널 없음
- **Crypto hedge funds**: 접근 제한적, $100k+ minimum

**Cogochi 포지션**: "Hedge fund-grade signal quality with Discord-level accessibility."

---

## 3. Virtuals Launch Configuration

### 3.1 Module Setup

✅ **Unicorn Launch** (bonding curve + 24hr eval + 98min anti-sniper)
✅ **Capital Formation** (25% auto raise + 25% team alloc)
✅ **Launch Radar** (100 VIRTUAL, viral 도구)
✅ **Pre-buy** (founder 자본 투입)
❌ 60 Days (본인 commit 확신, trial 불필요)

**비용 총계**: 200-220 VIRTUAL (~$150) + Pre-buy 1-5 ETH ($3-15k)

### 3.2 Anti-Sniper Window

**설정**: 30분 (99% → 1% decay)

**Why 30분**:
- 98분 max는 초기 유동성 과도 제약
- 10분 이하는 sniper bot이 여전히 잡을 여지
- 30분이 balance (sniper tax → buy-back → team vesting으로 돌아옴)

### 3.3 Capital Formation 설정

**기본값 사용** (change 불필요):
- FDV $2M부터 활성화
- $100K FDV 증가 시마다 소량 sell
- $160M까지 지속
- USDC로 팀 wallet 직송

**Team wallet**:
- Multi-sig 권장 (최소 2/3). Gnosis Safe 설정.
- 도난 리스크 감안. 단일 지갑으로 $1M+ 받기 위험.

### 3.4 Pre-buy 전략

**권장**: 2-5% of supply (20M-50M tokens)

**계산** (launch price ~$0.0001 at bonding curve start):
- 20M tokens × $0.0001 = $2,000
- 50M tokens × $0.0001 = $5,000

**Why pre-buy**:
- Sniper 방어 (누군가가 먼저 사기 전에 본인이 먼저)
- Conviction signal (투자자에게)
- Bonding curve 초기 volume 보장

**Vesting** (pre-buy의 default):
- 1개월 cliff + 12개월 linear
- 조정 가능하지만 default가 적절

**주의**:
- Pre-buy를 $2M FDV 이상에서 하면 Capital Formation 자동 분량이 Team Allocation으로 재분류
- 즉 **Pre-buy는 launch 직후 저가에서만 해라**

### 3.5 Team Allocation (25%)

**기본 vesting**:
- 1년 cliff + 6개월 linear
- $160M FDV 도달 시 즉시 vesting 시작 (여전히 6개월 linear)

**Note**: Pre-buy + Team Allocation 합쳐서 팀이 직접 보유하는 것은 약 27-30% (pre-buy 5% + allocation 25%). 이게 founder 실제 지분.

---

## 4. Product Details (Virtuals Agent Page)

### 4.1 "What does this agent do?"

Virtuals agent 페이지에 표시되는 product description. Launch 시 중요.

> **Cogochi publishes algorithmic trading signals for major crypto perpetuals (BTC, ETH, SOL, and 10+ altcoins). Every signal includes:**
> - **Entry price** (oracle-verified at publication)
> - **Take Profit** and **Stop Loss** in percentage terms
> - **Validity window** (usually 1-24 hours)
> - **Confidence score** (from the LightGBM model)
> - **Feature snapshot** (which of the 28 features triggered this signal)
>
> **Signals are generated by:**
> 1. A 28-feature vector recomputed every 5 minutes
> 2. A LightGBM classifier trained on 6 years of historical data
> 3. A 4-stage validation gate (backtest → walk-forward → paper → live) that auto-deactivates bad patterns
> 4. Hill Climbing optimization that continuously refines feature weights
>
> **How to use:**
> - Free: Follow @cogochi_agent on X for delayed (5-min) signal previews
> - $COGOCHI holders (60k+ tokens): Instant signal access via Terminal, detailed logs, API endpoint
> - Discord community: Daily digest, market commentary, agent interaction

### 4.2 Agent Memory / Personality (optional)

Virtuals agent는 personality 있어야 engagement 좋음. Cogochi의 톤:

- **Data-driven, dry humor**: "Market said boo. I said 73% probability of recovery. Don't @ me."
- **No hype, no hopium**: 시그널 실패 시도 투명하게 공개
- **Educational**: 시그널 뒤에 숨은 feature/logic 가끔 설명
- **Self-aware AI**: "I'm not sentient, I'm a LightGBM. But my track record speaks."

**Sample X posts**:
- "$BTC LONG @ 50000 | TP +3% SL -1.5% | Confidence 72% | Drivers: OI divergence + whale accumulation. Valid 4h."
- "Closed $ETH LONG at TP. +2.8% in 6h. Feature that called it: funding-CVD divergence. Not a fluke, 4-stage gate approved it."
- "Wrong call on $SOL yesterday. SL hit for -1.5%. That's 1 of 27 losses this month vs 52 wins. Expectancy still +0.8R. Numbers over ego."

---

## 5. Launch Day Checklist

Launch 하루 전 점검:

- [ ] Agent name confirmed (Virtuals duplicate check)
- [ ] Ticker symbol confirmed
- [ ] Avatar image uploaded (512x512 PNG)
- [ ] Header image uploaded
- [ ] Bio long-form written and proofread
- [ ] Bio short-form (280char) written
- [ ] Team wallet Gnosis Safe setup (2/3 multi-sig)
- [ ] Pre-buy wallet funded (2-5 ETH on Base)
- [ ] VIRTUAL token held (200+ for modules)
- [ ] X account @cogochi_agent live with 30+ posts
- [ ] Discord server created with #signals channel
- [ ] Signal publishing pipeline tested (dry run)
- [ ] Launch announcement thread drafted
- [ ] KOL contacts ready for Day 1 amplification
- [ ] Price alerts setup (FDV $500k, $1M, $2M, $5M)

---

## 6. Launch Configuration Example (JSON-style)

Virtuals dashboard에 입력하는 값들 정리. 실제 UI는 다를 수 있지만 필수 정보는 이 형태.

```yaml
agent:
  name: "Cogochi"
  ticker: "COGOCHI"
  chain: "base"
  avatar_url: "ipfs://[hash]"
  bio_short: "[위 1.2 short]"
  bio_long: "[위 1.2 long]"
  category: "trading_signals"
  website: "https://cogochi.io"
  twitter: "@cogochi_agent"
  telegram: "t.me/cogochi"
  discord: "discord.gg/cogochi"

launch_config:
  type: "unicorn"
  modules:
    anti_sniper:
      enabled: true
      window_minutes: 30
      decay_start: 0.99
      decay_end: 0.01
    capital_formation:
      enabled: true
      # default settings
    launch_radar:
      enabled: true
    pre_buy:
      enabled: true
      amount_eth: 3
      vesting_cliff_months: 1
      vesting_linear_months: 12
    60_days:
      enabled: false
  
tokenomics:
  total_supply: 1000000000  # 1B (Virtuals standard)
  # 50% to team (25% auto formation + 25% allocation)
  # 50% to bonding curve / LP (graduates at 42,425 VIRTUAL)
```

---

## 7. Risk / Failure Modes

### 7.1 Launch 실패 시나리오

**A. Bonding curve 못 채움** (42,425 VIRTUAL 미달)
- 원인: 초기 관심 부족, viral 실패
- 결과: Graduate 못하고 Agent sunset
- **Mitigation**: Pre-launch X viral 2주 필수, KOL 사전 섭외

**B. Graduate 성공 but FDV $2M 못 감**
- 원인: 관심 dump, product 약함
- 결과: Capital Formation trigger 안 됨, trading tax 1%만 수익
- **Mitigation**: Launch 후 2주 intense marketing + signal quality 증명

**C. Pump & Dump**
- 원인: Sniper 회피했지만 early buyer가 flip
- 결과: FDV 잠시 $5M 찍고 $500k로 하락
- **Mitigation**: Community 빌드 (Discord), 지속적 signal quality, AIXBT처럼 whale partnership

**D. Competitor 출현**
- 원인: 다른 AI trading agent가 더 뜸
- 결과: 관심 분산
- **Mitigation**: Niche 확실히 (technical vs sentiment), daily signal 멈추지 말 것

### 7.2 성공 시 리스크

**A. 해킹** (AIXBT 2025-03 사례)
- $100k 손실
- **Mitigation**: Multi-sig wallet, API key rotation, 2FA everything

**B. 규제**
- 한국 FSC가 "trading signal 서비스" 허가 이슈 제기 가능
- 미국 SEC가 $COGOCHI를 증권 분류 가능
- **Mitigation**: Agent는 Virtuals protocol 자체 운영, founder는 "creator"만. Geofence 권장.

**C. 엔진 성능 저하**
- 시장 regime 변화로 Cogochi 엔진 수익률 저하
- **Mitigation**: Hill Climbing 자동 재학습, 투명한 track record 공개

---

## 8. Action Items (Launch 전)

### Week 1 (Prep)
- [ ] Virtuals 계정 생성 + Base wallet
- [ ] 200+ VIRTUAL 확보 (~$150)
- [ ] Avatar + brand assets 제작
- [ ] X account @cogochi_agent 생성, 첫 10 posts

### Week 2 (Pre-launch viral)
- [ ] Daily 5-10 X posts (signal + market commentary)
- [ ] KOL 10명 DM/reply engagement
- [ ] Discord server open
- [ ] Signal pipeline dry run
- [ ] Team wallet multi-sig 완성

### Week 3 (Launch day)
- [ ] Launch announcement thread on X
- [ ] Virtuals에서 agent 등록 + modules 설정
- [ ] Pre-buy 실행 (2-5 ETH)
- [ ] 첫 6시간: anti-sniper window 관찰 + engagement
- [ ] 12시간 동안 sleep 금지, 커뮤니티 대응

### Week 4+ (Post-launch)
- [ ] Daily signal 10+개
- [ ] Weekly performance report (X thread)
- [ ] Discord 활성화 (유저 Q&A, 토론)
- [ ] FDV milestone 기록 (Capital Formation trigger 추적)

---

## 9. Success Metrics

### 9.1 30일 목표

- **Minimum viable**:
  - Graduate bonding curve (42,425 VIRTUAL 달성)
  - X followers 2,000+
  - Discord members 500+
  - Daily signal 10개 유지
- **Solid**:
  - FDV $2M+ (Capital Formation trigger)
  - X followers 5,000+
  - 1 KOL mention or partnership
- **Exceptional**:
  - FDV $10M+
  - X followers 20,000+
  - CoinGecko/CMC listing

### 9.2 90일 목표

- FDV $10-50M 유지
- Capital Formation raise $300k-$3M
- Daily active users (Discord) 1,000+
- 2-3 KOL whale holders

### 9.3 Kill criteria

- **Day 7**: Bonding curve 50% 미달 → re-launch 또는 pivot 고민
- **Day 30**: FDV < $500k → re-strategy 필요
- **Day 90**: FDV < $1M → wind down 검토

---

## 10. References

[1] Virtuals Protocol Whitepaper. https://whitepaper.virtuals.io
[2] Virtuals Launch Mechanics. https://whitepaper.virtuals.io/about-virtuals/agent-tokenization-platform/virtuals-launch-mechanics.md
[3] Capital Formation Module. https://whitepaper.virtuals.io/about-virtuals/agent-tokenization-platform/capital-formation.md
[4] AIXBT case study (Messari, CoinGecko)
[5] Cogochi Engine Spec (internal, in 03/05 archive)

---

## Version Control

| V | Date | Changes |
|---|------|---------|
| 1.0 | 2026-04-24 | Initial Virtuals Agent Manifest (v4 pivot) |

---

**End of Agent Manifest**
