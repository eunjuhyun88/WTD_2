# 05 — Competitive Analysis

**버전**: v1.0 (2026-04-25)
**상태**: canonical
**데이터 소스**: Web search 2026-04-25 + §vc_deep_dive_report
**의도**: 포지셔닝을 경쟁사와 혼동되지 않게 확정한다

---

## 0. 원칙

### 0.1 경쟁사는 3가지 유형이다

1. **직접 경쟁** — 같은 JTBD를 다른 방식으로 해결
2. **카테고리 경쟁** — 같은 유저 지갑에서 예산을 뽑음
3. **인접 위협** — 현재는 다르지만 확장 가능성

### 0.2 판단 기준

각 경쟁사에 대해:
- **제품 카테고리** (data terminal / AI research / charting / pattern scanner / pattern research)
- **핵심 JTBD 커버리지** (P0 페르소나의 3 JTBD 중 몇 개)
- **Moat 중복도** (우리 moat를 얼마나 복제 가능)
- **가격대** (ARPU 충돌 여부)
- **Defensibility against them** (우리가 갖는 비대칭 우위)

### 0.3 Vibes 아니라 Evidence

모든 주장에 sample size, source, date 명시.

---

## 1. 경쟁 구도 요약

| 경쟁사 | 카테고리 | P0 JTBD 커버 | Moat 중복도 | 위협도 |
|---|---|---|---|---|
| CoinGlass | Data terminal | 0/3 | Low | **Medium** (데이터 의존) |
| Hyblock Capital | Data terminal + Heatmap | 0/3 | Low | Medium |
| TrendSpider | AI charting (stock-first) | 1/3 | Medium | Low (crypto 비핵심) |
| Surf.ai | AI research copilot | 1/3 | Medium | **High** (AI framing) |
| TradingView | General charting | 0/3 | None | Low (no overlap) |
| TradeIdeas / Tickeron | AI pattern scanner (stock) | 1/3 | Low | Low |
| Bespoke Telegram bots | Alert scripts | 1/3 | Low | Low (quality) |

**P0 JTBD 3개**:
1. "Save the pattern I just saw with context"
2. "Find historical similar cases"
3. "Know if my pattern generalizes"

---

## 2. CoinGlass (직접 경쟁 — Data Terminal)

### 2.1 Facts

- **카테고리**: Crypto derivatives data aggregator including futures, spot, options, ETF, on-chain markets, with tick-level L2/L3 order books and liquidation heatmaps
- **가격**: Free tier 강력함. Premium $12/month, core features free. API $29-$29/mo+ 
- **본체**: Liquidation heatmaps, OI, funding rates, long/short ratios, 30+ exchange data
- **진화 방향**: CoinGlass Prime은 enhanced liquidation heatmap 경험 제공, Model 1/2/3 접근
- **추정 MRR** [estimate]: $500K+
- **사용자**: Binance, Reuters, Fidelity International이 데이터 의존 기업으로 명시

### 2.2 강점

- 데이터 폭/깊이 압도적
- 무료 tier의 관대함이 institutional까지 유입
- API 성숙, developer ecosystem
- Brand trust

### 2.3 약점 (우리가 파고들 지점)

- **검색 없음**: OI spike 있는 종목 필터는 해도 "이거랑 비슷한 패턴" 검색 없음
- **Sequence 이해 없음**: phase-based tracking 없음
- **판단 ledger 없음**: verdict 저장 개념 없음
- **해석 없음**: 데이터 tab만 늘어남, "이게 뭔데?" 답 안 줌
- **개인화 없음**: 개인별 pattern library 개념 없음

### 2.4 Our Asymmetric Advantage

- CoinGlass = "시장 지금 어떤가"
- Cogochi = "내가 본 그 패턴 지금 어디서 일어나나"
- 데이터 레이어를 소유할 의사 없음 → CoinGlass를 **복제하지 않고 upstream 소비**
- CoinGlass user는 Cogochi의 potential user

### 2.5 Defensibility

- CoinGlass가 pattern research OS로 확장할 인센티브 낮음 (institutional data 사업 집중)
- 만약 확장하면 2-3년 개발 + UX 재설계 필요
- 우리는 2년 data moat 확보 가능

### 2.6 위협 시나리오

- CoinGlass가 CoinGlass Labs 같은 sub-product 출시
- 가능성: Medium-low [estimate], institutional focus 유지할 듯
- 대응: Verdict ledger + team library로 데이터 이상의 가치 축적

---

## 3. Hyblock Capital (직접 경쟁 — Advanced Analytics)

### 3.1 Facts

- **카테고리**: Crypto trading tools with customizable dashboards, heatmaps, liquidation levels, screeners, backtesters
- **가격 구조**: Basic / Advanced / Professional tiers, exchange volume $1M-$6M/mo 기준으로 upgrade 가능
- **특징**: Liquidation levels, liquidation map with 2-year lookback, filter by exchange and coin
- **추정 가격** [estimate]: $50-200/mo premium tier

### 3.2 강점

- Liquidation 관련 시각화 정교
- 고급 유저층 타겟팅 (CoinGlass보다 pro-centric)
- TradingView 통합
- Community trust (고급 트레이더 사이)

### 3.3 약점

- 여전히 데이터 terminal 본질
- Pattern sequence 개념 없음
- Backtester는 basic (custom rule 없음)
- 사용자 verdict ledger 없음
- AI layer 거의 없음

### 3.4 Our Asymmetric Advantage

- Hyblock = "청산 레벨 잘 보여준다"
- Cogochi = "그 레벨이 어떤 phase에서 유효했는지 검증"
- 데이터 시각화 경쟁 → 하지 않음
- 검색/기억 경쟁 → Hyblock 없음

### 3.5 위협 시나리오

- Hyblock이 AI layer + pattern library 추가
- 가능성: Medium
- 이미 complex UI → AI 추가가 쉽지 않음
- 우리가 시간 확보 가능 (12-18개월)

---

## 4. Surf.ai (직접 경쟁 — AI Research)

### 4.1 Facts

- **카테고리**: Crypto-specialized AI platform, alternative to ChatGPT/Perplexity for crypto research
- **가격**: $15 to $399 per month different tiers, free version with limited questions
- **Funding**: $15M from Pantera, Coinbase Ventures, DCG 2025-12
- **Traction**: Millions in ARR since July launch, 1M+ research reports, 50% MoM growth, used by 80% of top exchanges
- **Architecture**: Multi-agent setup analyzing social sentiment, on-chain activity, token/market behavior via chat interface
- **Next**: Surf 2.0 Feb 2026 with more advanced model + multi-step agent workflows
- **API surface**: 90+ endpoints covering market, exchange, wallet, social, token, project, prediction markets, on-chain

### 4.2 강점

- 강력한 VC backing → 빠른 제품 진화 자원
- Crypto-native LLM fine-tune (Cyber AI)
- 다양한 data source 통합
- 이미 brand recognition
- Enterprise tier 운영 중

### 4.3 약점 (우리가 파고들 지점)

- **요약 엔진이지 검색 엔진 아님**: "BTC 오늘 어때?" 답은 잘해도 "이거랑 비슷한 거" 검색 못 함
- **Sequence 이해 없음**: phase path 개념 없음
- **유저 ledger 없음**: 유저가 save/verdict 쌓는 구조 아님
- **Chat-only interaction**: 차트/패턴 저장/판정 같은 visual pattern workflow 없음
- **Derivatives deep dive 약함**: OI/funding/liq structural pattern analysis에 특화 안 됨
- **Hallucination risk 존재** — fine-tune해도 LLM 기반 한계

### 4.4 Our Asymmetric Advantage

- Surf = "설명해줘 / 답해줘" (대화형)
- Cogochi = "이거 저장해줘 / 비슷한 거 찾아줘" (pattern-workflow)
- Surf은 broad (prediction markets, social, on-chain) — Cogochi는 **perp derivatives pattern에 집중**
- Surf는 모든 유저에게 동일 — Cogochi는 **개인/팀 ledger로 고유화**

### 4.5 Defensibility

**가장 큰 위협**. 왜냐하면:
- VC 자금으로 빠르게 확장 가능
- "AI + crypto" 카테고리에서 인지
- 엔지니어링 bandwidth 우리보다 큼

하지만:
- Pattern research workflow는 근본적으로 다른 제품
- Surf이 이쪽으로 pivot하면 본업 약화 (chat query → pattern workflow는 UX 완전 다름)
- P0 페르소나의 JTBD는 chat으론 해결 안 됨

### 4.6 대응 전략

1. **Sequence matcher** 조기 launch → 구조적 차별화
2. **Verdict ledger** 6개월 내 500+ 축적 → 복제 비용 급등
3. **Team workspace** 12개월 내 → Surf가 못 건드리는 세그먼트
4. **API parity 추격하지 않음** → data API 경쟁 회피

### 4.7 Positioning Differentiation

| 축 | Surf | Cogochi |
|---|---|---|
| Primary interaction | Chat | Chart capture |
| Output | Research report | Pattern search result |
| Memory | Session-level | Cross-session ledger |
| Moat | Fine-tuned model | Verdict database |
| Target | Generalist crypto user | Derivatives pattern trader |

---

## 5. TrendSpider (인접 위협 — AI Charting)

### 5.1 Facts

- **카테고리**: AI-powered automated chart patterns, ML strategy building, trade alerts for stocks, ETFs, crypto, forex
- **가격**: Standard $89/mo ($59 annual), Premium $149/mo ($99 annual)
- **핵심 특징**: AI-powered automated chart pattern recognition, no-code backtesting with 50 years historical data, Sidekick AI chatbot
- **AI 진화**: AI trading bots, market scanners, AI Strategy Lab to train ML models without coding
- **크립토 커버리지**: US stocks, ETFs, forex, crypto 포함 65,000+ assets

### 5.2 강점

- 성숙한 AI charting 제품
- 다자산 커버 (stock primary)
- 20,000+ traders user base
- Backtest 엔진 정교

### 5.3 약점

- **Crypto는 secondary**: stock-first 제품, crypto perpetual derivatives 특화 안 됨
- **Chart pattern ≠ derivatives pattern**: OI/funding/liq를 읽는 pattern 없음
- **Sequence 이해 없음**: candlestick pattern만
- **복기/judgment 루프 없음**
- **Price point ($89-$149)**: entry 친화적이지만 crypto niche엔 과잉

### 5.4 Our Asymmetric Advantage

- TrendSpider = "AI가 chart pattern 찾아줌" (technical analysis 자동화)
- Cogochi = "Derivatives pattern을 사용자와 같이 학습" (domain + workflow)
- Crypto perp derivatives 특화 → TrendSpider가 못 따라옴 (코어가 stock)

### 5.5 위협 시나리오

- TrendSpider가 crypto-specific module 출시
- 가능성: Low-medium
- 이미 hybrid product → focus 약함
- 우리가 먼저 domain depth로 우위 확보

---

## 6. TradingView (카테고리 경쟁 — General Charting)

### 6.1 Facts

- 전 세계 표준 charting tool
- Free-to-premium, 다자산, social layer
- 개인 지갑 영역 침투

### 6.2 Overlap

- 없음. TradingView는 차트를 그리는 곳, Cogochi는 패턴을 기억/검색하는 곳
- 실제로 Cogochi 유저는 TradingView도 동시 사용 (대체재 아니라 보완)

### 6.3 Relationship

- Don't compete on charting features
- TradingView Lightweight Charts를 base로 사용 (이미 `indicator-visual-design.md`에 명시)
- 가능하면 Pine Script export / embed 지원 (P2)

---

## 7. TradeIdeas / Tickeron (인접 위협 — AI Pattern Scanner)

### 7.1 Facts

- Stock market AI pattern scanner
- Holly AI: 62.4% win rate on day trades with 1.5:1 reward-to-risk, Premium $228/month
- Crypto 지원 제한적

### 7.2 Overlap

- Crypto에서는 거의 없음
- 하지만 "AI가 트레이딩 패턴 찾아줌" 카테고리 선례

### 7.3 Learning

- Price point $228는 pro trader가 쓰는 곳 — 우리 ARPU 상한선 reference
- "AI가 scans → win rate 제시" 포맷이 시장에 받아들여짐

---

## 8. Telegram/Discord Bot Signals (ground-level 경쟁)

### 8.1 Facts

- 개인/팀이 만든 custom bot
- Private channel 기반
- 월 $20-200 구독
- Signal + 일부 결과 추적

### 8.2 Overlap

- P0 유저가 실제로 많이 씀
- "Alert → verdict" 워크플로 유사

### 8.3 약점

- **Accountability 없음**: hit rate 조작 가능
- **Reproducibility 없음**: rule이 bot operator 머릿속
- **검색 없음**: 같은 패턴 과거 사례 못 찾음

### 8.4 Our Advantage

- Cogochi는 bot이 아니라 **pattern research platform**
- 유저가 자기 rule을 만들고 share 가능
- Cogochi → Telegram push 통합 (bot을 replace할 필요 없음)

---

## 9. Competitor Grid (한눈에)

| 기능 | CoinGlass | Hyblock | TrendSpider | Surf | Cogochi |
|---|---|---|---|---|---|
| Derivatives data | ★★★★★ | ★★★★★ | ★★ | ★★★ | ★★★★ (consume) |
| Chart patterns | ★★ | ★★ | ★★★★★ | ★ | ★★★★★ (sequence) |
| AI research | ★ | ★ | ★★★ | ★★★★★ | ★★★ (parser) |
| Save & recall | ❌ | ❌ | ★★ (watchlist) | ❌ | ★★★★★ |
| Similar search | ❌ | ❌ | ★★ | ★★ | ★★★★★ |
| Verdict ledger | ❌ | ❌ | ❌ | ❌ | ★★★★★ |
| Team workspace | ❌ | ★ | ★★ | ★ | ★★★★ |
| Price point | $12 | $50-200 | $89-149 | $15-399 | $29-99 (target) |
| Primary persona | all | pro | systematic | generalist | **complex pattern pro** |

---

## 10. Positioning Statement

### 10.1 우리가 뭐 **하지** 않는가

- 데이터 terminal 안 함 (CoinGlass가 잘함)
- General AI chat 안 함 (Surf이 잘함)
- Chart pattern recognition 안 함 (TrendSpider가 잘함)
- General charting 안 함 (TradingView)
- Signal service 안 함 (bot들)

### 10.2 우리가 뭐 **하는가**

**"Crypto derivatives pattern을 저장 · 검색 · 판정하는 연구 운영체제."**

세그먼트:
- P0 (개인 프로) — 복기 습관 + derivatives 이해 + $30-80/mo
- P1 (팀/데스크) — 공용 pattern library + onboarding compression

Defensibility:
- Verdict ledger (복제 불가 데이터)
- Sequence matcher (경쟁사 미구현 기술)
- Personal variants (유저별 fine-tune 자산)

### 10.3 한 줄 포지션

> **Not an AI chat. Not a data terminal. A pattern memory OS for crypto derivatives.**

---

## 11. SWOT

### Strengths

- Sequence matcher (technical moat)
- Verdict ledger (data moat)
- Niche focus = UX clarity
- Low infra cost (consume external data)

### Weaknesses

- Small team vs Surf $15M funding
- No brand recognition
- No enterprise sales team
- Korean/Asian-centric launch market (scale limit)

### Opportunities

- AI 카테고리 over-valuation → fundraising 유리
- Crypto institutional demand growing
- No direct "pattern research OS" competitor
- Team workspace tier 미개척

### Threats

- Surf이 pattern workflow로 확장
- CoinGlass가 AI layer 추가
- Regulatory changes (crypto advisory laws)
- Funding winter

---

## 12. Competitive Responses (pre-planned)

### Scenario A: Surf이 "pattern save" 기능 출시

**Probability**: Medium (12-18 months)
**Response**:
- 즉시 differentiate: "Save는 Surf에서도 하지만, 우리는 sequence matcher로 찾는다"
- Verdict ledger 깊이 강조
- Team plan launch 가속

### Scenario B: CoinGlass가 pattern library 추가

**Probability**: Low-medium (24+ months)
**Response**:
- Data is their moat, not ours → 우리는 workflow
- Team workspace로 차별화
- Affiliate with CoinGlass data consumption (partnership)

### Scenario C: 신규 YC 스타트업이 직접 경쟁

**Probability**: High (6-12 months)
**Response**:
- 첫 100 P0 유저 lock-in (6 month contract discount)
- Pattern library portability로 switching cost 만들기
- Community/content moat (복기 공유 community)

### Scenario D: TrendSpider가 crypto-specific 확장

**Probability**: Low
**Response**:
- Derivatives 특화로 vertical depth 유지
- Integration 역으로 제안 (TrendSpider stock data + Cogochi crypto)

---

## 13. Pricing Comparison

| Service | Free tier | Paid entry | Pro tier | Max/enterprise |
|---|---|---|---|---|
| CoinGlass | Strong | $12 | $29 (API) | Custom |
| Hyblock | Limited | $50 | $100 | $200+ |
| TrendSpider | No | $89 | $149 | $197+ |
| Surf | Limited | $15 | $99 | $399 |
| Cogochi (target) | Limited | $29 | $49 | $199 (team) |

Cogochi Free tier는 **sample use 가능하되 Save Setup 5개 상한**. Verdict loop 1회 경험 가능 → conversion 유발.

---

## 14. What Data Tells Us

### 14.1 Market validation signals

- Surf $15M raise → AI + crypto research 카테고리 검증됨
- Surf 1M+ reports in 5 months → demand는 실재
- CoinGlass $500K+ MRR [estimate] → data 소비 demand 지속
- TrendSpider 20K paid users → individual pro tier viable

### 14.2 Warning signals

- Surf pricing $15-$399 range → price discovery still happening
- Free tier 강력한 제품들 → willingness to pay 불안정
- "AI" buzzword fatigue 가능성 (2026+)

### 14.3 Market gap we fill

- Pattern research OS 카테고리 비어 있음
- Verdict ledger 같은 accountability tool 없음
- Team workspace for traders 검증된 제품 없음
- Derivatives-specific pattern workflow 없음

---

## 15. 한 줄 요약

> **직접 경쟁: CoinGlass + Hyblock (data), Surf (AI research). 우리는 이 사이에 pattern research OS 카테고리를 만든다.**
> **가장 큰 위협은 Surf의 $15M + pattern workflow 확장 가능성. 대응: sequence matcher + verdict ledger 6개월 내 방어선 구축.**
