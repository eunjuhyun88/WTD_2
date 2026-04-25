# 05F — Surf.ai Deep Dive

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05B)
**데이터 소스**: asksurf.ai, docs.asksurf.ai, agents.asksurf.ai (live fetch 2026-04-25), skywork.ai review
**의도**: Surf의 정확한 제품 구조와 가격, agent architecture 파악. 가장 직접적 위협으로 재평가.

---

## 0. 핵심 발견

이전 PRD_05에서 Surf을 "$15-399 chat interface"로 봤다. **모자란 분석이었다**.

Surf은 사실 **3가지 제품**을 하나로 묶고 있다:

1. **Surf Chat** (asksurf.ai) — 자연어 crypto research
2. **Surf API** (docs.asksurf.ai) — 83 RESTful endpoints + 58 ClickHouse SQL tables
3. **Surf Skill** (agents.asksurf.ai) — AI agent integration framework

게다가:
- **40+ 블록체인 cover** (우리는 perp만)
- **200+ data sources**
- **Cyber AI** — proprietary crypto-specialized model
- **Trade execution beta** — DEX 직접 거래
- **Max plan $499/mo** — Pro 시장 검증
- **Pantera + Coinbase Ventures + DCG $15M Series A** (2025-12)
- **Millions in ARR within 5 months** of launch
- **80% of top exchanges** 사용

이건 **수십 명 이상의 엔지니어 + 자본 + 데이터 인프라 + 명확한 GTM**을 가진 회사다. 우리가 가장 두려워해야 하는 경쟁사.

---

## 1. 제품 구조 (3-product 통합)

### 1.1 사이트 구조

```
asksurf.ai (consumer chat)
├── /                    → 마케팅 + chat
├── /faq                 → FAQ
├── /enterprise          → enterprise tier
└── (paid tiers)         → Free / Plus / Pro / Max

docs.asksurf.ai (developer)
├── /overview            → 개요
├── /chat-completions    → Chat API
├── /data-api            → 83 REST endpoints
├── /data-catalog        → 58 ClickHouse tables (SQL access)
└── /cli/introduction    → CLI 도구

agents.asksurf.ai (agent)
└── /                    → "Crypto Intelligence for AI Agents"

agent.asksurf.ai (CLI)
└── /cli/releases/       → Surf CLI binary
```

### 1.2 가격 tier (5-tier)

| Tier | 가격 | 위치 |
|---|---|---|
| Free | $0 | 30 daily credits via CLI, limited chat |
| Plus | ~$20-30/mo [estimate] | 매월 chat queries |
| Pro | ~$99/mo [estimate] | More queries + research mode |
| **Max** | **$499/mo** ⭐ confirmed | 무제한, advanced features |
| Enterprise | Custom | Team workspace, SLA, security |

[estimate]: 정확한 Plus/Pro 가격은 sign-up wall로 가려져 있어 추정.

---

## 2. Cyber AI (proprietary model)

### 2.1 What is it

- Surf 자체 fine-tuned LLM
- Crypto-specialized
- Curated, real-time crypto data로 학습
- General-purpose (ChatGPT/Claude)와 다름
- Hallucination 감소 ("그래도 critical thinking 필요")

### 2.2 우리에게 의미

- LLM 자체를 비교하면 우리가 못 이김 (fine-tune 1년+ 필요)
- 우리는 **LLM이 핵심 아닌** product (parser로만 사용)
- 차별화는 **workflow + verdict + sequence**

---

## 3. 83 RESTful Endpoints — 12 Domains

Surf Data API는 매우 광범위하다.

### 3.1 12 Domain List

1. **Market** — prices, rankings, technical indicators, fear & greed, liquidations, futures, options, ETFs
2. **Exchange** — order books, candlesticks, funding rates, long/short ratios
3. **Wallet** — balances, transfers, DeFi positions, net worth, labels
4. **Social** — Twitter/X profiles, posts, followers, mindshare, sentiment
5. **Token** — holders, DEX trades, transfers, unlock schedules
6. **Project** — profiles, DeFi TVL, protocol metrics
7. **Prediction Markets** — Polymarket, Kalshi (markets, trades, prices, OI)
8. **On-chain** — transaction lookup, SQL queries, gas prices, bridge/yield rankings
9. **News & Search** — cross-domain entity search, news feed, web fetch
10-12. (그 외 카테고리 + 변종)

### 3.2 비교: 다른 곳

| 영역 | CoinGlass | Velo | Hyblock | Surf |
|---|---|---|---|---|
| Futures data | ✅ deep | ✅ deep | ✅ deep | ✅ |
| Options | ✅ basic | ✅ deep | ❌ | ✅ |
| Wallet/DeFi | ❌ | ❌ | ❌ | ✅ deep |
| Social | ❌ | ❌ | ❌ | ✅ deep |
| Prediction markets | ❌ | ❌ | ❌ | ✅ |
| News/search | ❌ | ✅ ($129) | ❌ | ✅ included |
| On-chain SQL | ❌ | ❌ | ❌ | ✅ |
| ETFs | ✅ deep | ❌ | ❌ | ✅ |

**Surf의 폭이 압도적**. 깊이는 specialist (CoinGlass for liquidation, Velo for options) 가 더 강할 수 있지만 **bredth는 Surf 압승**.

---

## 4. Surf Skill — Agent Integration

### 4.1 What is it

```bash
npx skills add asksurf-ai/surf-skills --skill surf
```

AI agent (Claude, GPT 등)에 자동으로 plug-in 되는 skill.

### 4.2 사용 방식

```
agent: "what's the price of ETH"
↓
Surf skill (auto-discover 적절한 endpoint)
↓
Data API call
↓
Result back to agent
```

Agent가 데이터 access를 자동화. Authentication, endpoint discovery, fetching 모두 transparent.

### 4.3 우리에게 의미

- Surf는 **agent ecosystem 전략**을 가짐
- 다른 회사가 Surf을 자기 agent에 plug-in 하게 함
- **Standard for crypto data in AI agents** 자리잡기 시도

이게 만약 성공하면:
- Cogochi가 자체 agent 만들 때도 Surf 사용 압박
- Cogochi 자체가 다른 agent의 plug-in 으로 흡수될 위험

대응:
- 우리도 **Cogochi MCP server** 제공 (P2-P3)
- Surf과 협력 (우리 verdict ledger를 Surf agent가 호출 가능하게?)
- 또는 직접 경쟁 (자체 agent ecosystem 구축)

---

## 5. CLI Tool (developer-friendly)

### 5.1 설치

```bash
curl -fsSL https://agent.asksurf.ai/cli/releases/install.sh | sh
surf market-price --symbol BTC
```

### 5.2 Free tier

- API key 없이 시작 가능
- 30 daily credits / day
- `surf auth`로 키 저장 후 unlimited

### 5.3 우리에게 의미

- **Developer adoption** 빠름
- ChatGPT-style은 retail, CLI는 quant + dev
- 우리도 Phase 3+ CLI 검토

---

## 6. ClickHouse SQL Access

### 6.1 What is it

- 58 analyst-ready tables
- Direct SQL query
- ClickHouse engine (analytical, fast)

### 6.2 의미

- Quant team이 자체 backtest, 분석 가능
- BigQuery / Snowflake 대안
- **Institutional 진입 path**

---

## 7. Funding Round (재정의 필요)

### 7.1 Series A (2025-12)

- **$15M Series A**
- Lead: Pantera Capital
- Participants: Coinbase Ventures, DCG, others
- Valuation [unknown, estimate $100-200M]

### 7.2 Implications

- 12-24개월 runway
- 30-50명 hire 가능
- Enterprise sales motion 펼칠 자원
- Marketing/PR 자본
- 우리보다 압도적 자원 차이

### 7.3 우리에게 의미

이건 우리가 **자본으로는 못 이김**. 다른 차원에서 차별화 필요:
- **Niche 깊이** (Surf은 broad, 우리는 deep on perp pattern)
- **Workflow 차별화** (chat ≠ pattern workflow)
- **Verdict moat** (Surf이 절대 만들지 않을)
- **Speed** (작은 팀의 advantage — 빠른 iteration)

---

## 8. Traction (검증된 수치)

skywork.ai review + 자체 fundraising press 기반:

- **1M+ research reports** 생성 (5개월 만에)
- **50% MoM growth**
- **Top exchanges 80% 사용**
- **"Millions in ARR"** (정확한 숫자 [unknown], 추정 $5M+ ARR by Q2 2026)
- Active user count [unknown]

이건 **product-market fit이 검증된 회사**. 우리가 무시할 수 없음.

---

## 9. Surf의 강점

### 9.1 Breadth

- 40+ blockchains
- 200+ data sources
- 12 domain coverage

### 9.2 AI quality

- Cyber AI (fine-tuned)
- 다른 일반 LLM보다 crypto context 정확
- Hallucination 줄임

### 9.3 Developer ecosystem

- CLI (curl-able)
- Skill (agent plug-in)
- 83 REST endpoints
- 58 SQL tables
- npx integration

### 9.4 Capital + team

- $15M raised
- VC connections (Pantera, Coinbase, DCG)
- Enterprise sales motion

### 9.5 Brand

- "Cyber AI" 브랜딩
- Crypto-native 정체성
- Top exchange 추천

---

## 10. Surf의 약점 (우리가 파고들 곳)

### 10.1 Chat interface 한계

- Surf은 본질적으로 **Q&A**
- Pattern workflow는 Q&A로 표현 어려움
- "이 setup 저장하고 비슷한 거 찾아줘" 같은 multi-step workflow 약함
- Saved query 있지만 **structured pattern object 없음**

### 10.2 Memory 약함

- Session-based memory
- Cross-session pattern object 없음
- User verdict 없음
- "이 case를 valid로 판단했다" 같은 데이터 누적 없음

### 10.3 Sequence reasoning 없음

- Phase path 추적 없음
- "fake_dump → real_dump → accumulation" 같은 시계열 sequence search 없음
- LLM이 sequence를 "이해"한다는 가정 — 실제 검색 정확도는 낮을 가능성

### 10.4 Personalization 약함

- 모든 user에게 동일 model
- Personal threshold/variant 없음
- User-specific learning 없음

### 10.5 Derivatives depth 약함

- Breadth는 강하지만 perp derivatives 특화 안 됨
- OI/funding/liq의 **structural pattern analysis** 깊이 약함
- TRADOOR 패턴 같은 sequence 인식 어려움

### 10.6 Hallucination risk

- Cyber AI도 LLM 본질
- "Critical thinking 필요" 자기 인정
- High-stakes pattern judgment에 신뢰 어려움

---

## 11. Surf vs Cogochi 정확 차이

| 축 | Surf | Cogochi |
|---|---|---|
| **Primary value** | AI-powered research + execution | Pattern memory + sequence search |
| **Primary interaction** | Chat (Q&A) | Chart capture + workflow |
| **Output** | Research report | Verdict-tracked pattern + similar cases |
| **AI** | Cyber AI (proprietary fine-tune) | Parser (NL → schema) |
| **Memory** | Session-based, saved queries | Capture + verdict ledger + variants |
| **Personalization** | Limited | Personal variants core |
| **Sequence search** | ❌ (LLM-based 추정만) | ✅ moat |
| **Pattern library** | Saved chats | Pattern objects + sharing |
| **Team workspace** | Enterprise tier | P1 |
| **Free tier** | Limited (chat) + 30 CLI credits | Limited (5 captures) |
| **Pro entry** | $20-30 | $29 |
| **Top tier** | $499 (Max) / Enterprise | $199 (Team) |
| **Funding** | $15M Series A | bootstrap or seed |
| **API** | 83 REST + 58 SQL ✅ | P2-P3 |
| **Coverage** | 40+ chains, 200+ sources | Perp derivatives focus |
| **Trade execution** | DEX beta ✅ | ❌ (out of scope) |
| **Target user** | Generalist crypto user, agent dev | Derivatives pattern trader |

---

## 12. 위협 시나리오 (재평가)

이전 PRD_05B에서 Surf을 **High threat / 6-12개월**로 봤다. **유지**.

### 12.1 단기 (3-6개월)

- Surf 2.0 (Feb 2026 발표) — multi-step agent workflows
- 가능성: Pattern save / similar search 추가? **Medium-high**
- 우리 대응: sequence matcher 6개월 내 GA, verdict 500+ 축적

### 12.2 중기 (12-18개월)

- Surf이 verdict / personal variant 추가? **Medium**
- 가능성: chat → workflow 카테고리 확장
- 우리 대응: team workspace 시장 진입, P1 lock-in

### 12.3 장기 (24+개월)

- Surf이 derivatives-specific pattern engine 출시? **Medium-low**
- 이유: focus 분산 = 본업 약화
- 우리 대응: 그 시점에 verdict ledger 5,000+, team customer 50+ 확보

### 12.4 가장 큰 위험

**Surf이 자기 chat에 "Save this query as a pattern"** 같은 기능 추가하는 것.

이건 simple feature지만 user behavior를 변화시킴. 우리 P0가 "그냥 Surf에서 다 해"로 빠질 수 있음.

대응:
- **워크플로 차별화 강조**: chat ≠ pattern workflow
- **차트 capture 깊이**: Surf은 chart save 약함
- **Verdict ledger 데이터 깊이**: 첫 6-12개월 verdict 누적이 moat

---

## 13. Surf의 경쟁 전략 (우리가 따라할 것)

### 13.1 가져올 것

1. **CLI tool** (P2-P3)
2. **Agent skill / MCP server** (P2-P3) — Cogochi MCP 제공
3. **Cross-domain search** 개념 — 우리도 capture + ledger + variant 통합 search
4. **Free tier credit 시스템** — 30 daily 같은 sustainable 모델
5. **API endpoint 구조** — REST + SQL access 두 path

### 13.2 가져오지 않을 것

1. ❌ Chat-first interface — 우리는 workflow-first
2. ❌ 40+ chain breadth — perp focus 유지
3. ❌ Trade execution — out of scope
4. ❌ Social/sentiment data — Surf 영역
5. ❌ Prediction markets — 별도 product
6. ❌ On-chain SQL — Surf/Dune 영역
7. ❌ Cyber AI 같은 자체 fine-tune — Phase 3+

---

## 14. Killer Comparison Statements

Surf 대비 마케팅 메시지:

- **"Surf answers 'what's happening now.' Cogochi answers 'have I seen this before — and did it work?'"**
- **"Chat is for asking. Cogochi is for remembering."**
- **"Surf's Cyber AI hallucinates less. Cogochi's verdict ledger doesn't hallucinate at all — it's your data."**
- **"83 endpoints, 40 chains, 200 sources — and zero memory of what you've actually traded. Cogochi adds the only domain that matters: you."**
- **"Both Surf and Cogochi save your queries. Only Cogochi tells you 72 hours later if it actually worked."**

---

## 15. 우리가 차용할 것

### 15.1 즉시 가져올 것 (P0-P1)

1. **API key 모델** — 30 free daily credits 같은 grading
2. **CLI distribution** (P2-P3, agent ecosystem 진입)
3. **Cross-search UX** — Surf의 unified search 패턴
4. **Freemium balance** — chat은 무료 풍부, advanced는 paid

### 15.2 중장기 (P2)

1. **MCP server** — Cogochi의 capture/verdict/search를 다른 agent가 호출 가능
2. **CLI tool** — power user retention
3. **Documentation 깊이** — Surf docs 수준 따라가기

### 15.3 가져오지 않을 것

1. ❌ Cyber AI 같은 자체 fine-tune (cost, time)
2. ❌ Chat as primary UX
3. ❌ 비-derivatives 영역
4. ❌ Trade execution

---

## 16. 추적 우선순위 (weekly check)

Surf은 가장 active monitor 필요한 경쟁사:

- [ ] **Surf 2.0 release** — multi-step workflow capability
- [ ] **Pattern save / library** 기능 추가 시점
- [ ] **Verdict / judgment** 비슷한 기능 추가
- [ ] **Personal model** / variant 기능
- [ ] **Pricing 변경**
- [ ] **신규 partnership** (특히 거래소)
- [ ] **Funding 후속 round**
- [ ] **Talent hire** (LinkedIn alerts)
- [ ] **Top customers 발표**

월 1회 review.

---

## 17. 즉시 적용 액션

### Design 측면

- [ ] 우리 Save Setup이 Surf "save query"보다 deep하게 — chart + feature + phase + verdict 묶음
- [ ] Sequence matcher 6개월 내 production GA (Slice 6 우선)
- [ ] Verdict ledger 500+ 축적 (Slice 8)
- [ ] MCP server spec 검토 (P2)

### Product 측면

- [ ] "Pattern workflow vs chat" messaging 명확화
- [ ] Comparison page (/compare/surf)
- [ ] Surf 사용자 대상 onboarding ("Surf에선 못 하는 것")

### Marketing 측면

- [ ] "Cogochi: where Surf stops" 포지셔닝
- [ ] Verdict ledger를 marketing 무기로 — "Surf에는 없는 것"
- [ ] Twitter/X에 Surf 사용자 engage (직접 비교 X, 우리 가치 보여주기)

### 전략 측면

- [ ] **Funding 검토 timing** — Surf 자본 격차 줄이려면 seed/Series A 필요할 수도
  - M6+ 검증 데이터 갖고 fundraise
  - 또는 bootstrap + 작은 lean team으로 niche 우위 유지
- [ ] **YC W26 application** — Surf 같은 traction이면 가능

---

## 18. 가장 중요한 single insight

Surf은 **breadth + chat + capital** 강자.
우리는 **depth + workflow + verdict** 강자.

이 둘은 **다른 게임**이다.

만약 우리가 chat으로 가면 → 진다 (Surf $15M).
만약 Surf이 workflow로 오면 → 우리가 6-12개월 lead.
그 lead 기간 안에 verdict ledger와 team plan으로 **switching cost를 만들어야** 함.

---

## 19. 한 줄 결론

> **Surf = $15M Series A로 무장한 AI-powered crypto research + agent ecosystem 회사. 83 endpoints, 40 chains, 200 sources, Cyber AI, $499 Max tier 검증.**
>
> **가장 직접적인 위협. 6-12개월 내 sequence matcher + verdict ledger 방어선 구축 필수.**
>
> **차별화: Surf = chat-first, broad. Cogochi = workflow-first, deep on perp pattern. Verdict ledger가 우리 절대 우위.**
