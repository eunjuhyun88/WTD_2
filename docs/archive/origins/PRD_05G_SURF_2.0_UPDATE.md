# 05G — Surf 2.0 Update (Studio + Agent Stack 추가 분석)

**버전**: v1.0 (2026-04-25)
**상태**: canonical (supplements PRD_05F)
**데이터 소스**: docs.asksurf.ai (live fetch 2026-04-25), CoinDesk 2025-12-10, Bloomingbit 2026-03-24, Surf 2.0 launch posts
**의도**: PRD_05F의 Surf 분석 위에 **Surf 2.0 (2026-03 출시)** 신규 capability 추가. Studio + Agent Stack + Gallery + Plan Mode가 우리 위협 모델에 미치는 영향 재평가.

**전제**: 이 문서는 PRD_05F를 먼저 읽었다고 가정. 중복 부분 최소화하고 **새 발견과 위협 시나리오**에 집중한다.

---

## 0. 결론 먼저

이전 분석(PRD_05B)에서 Surf을 "chat-based AI research, scope different"로 봤다. **부분적으로 옳지만 위험을 underestimate했다**.

새 발견:
- **Surf 2.0 (2026-03 출시)** → **No-code crypto builder** + Agent Stack
- **Surf Studio** — 자연어로 crypto dashboard/tool 생성 (즉시 배포)
- **Surf Agent Stack** — 60+ API endpoints + MCP server, Claude Code 등 외부 환경 통합
- **Surf Enterprise** — SOC 2 compliance + dedicated infra
- **CAIA Benchmark** — junior analyst 작업에서 GPT/Grok 4x 우월 주장
- **이미 80% top exchanges 사용** (자칭)

이것이 의미하는 것: Surf은 **단순 chat AI**가 아니라 **crypto research workflow의 운영체제**로 자리 잡으려 한다. 우리 카테고리에 가장 가깝게 다가온 경쟁자.

다만 결정적 차이가 있다:
- Surf은 **broad horizontal** (모든 crypto research)
- Cogochi는 **narrow vertical** (derivatives pattern)
- Surf은 **chat + builder paradigm**
- Cogochi는 **capture + sequence search paradigm**

이 차이가 우리의 방어선이다.

---

## 1. Surf 제품 구조 (정확)

### 1.1 두 개의 다른 surface

| Surface | 대상 | URL |
|---|---|---|
| **asksurf.ai** | 일반 유저 (chat + dashboard) | https://asksurf.ai |
| **agents.asksurf.ai** | 개발자 (CLI + skill + API) | https://agents.asksurf.ai |
| **docs.asksurf.ai** | API 문서 | https://docs.asksurf.ai |

같은 회사, 다른 제품 라인. **양쪽이 결합되어 운영체제 효과**.

### 1.2 핵심 components (2026-04 현재)

```
┌──────────────────────────────────────────────────────┐
│  asksurf.ai (consumer-facing)                        │
│  ├── Ask mode (Q&A chat)                             │
│  ├── Research mode (deep reports)                    │
│  ├── Crypto Data Hub (dashboard tab)                 │
│  ├── Executor mode (DEX trade execution)             │
│  ├── Surf Studio (no-code builder, NEW Mar 2026)     │
│  ├── Studio Gallery (community builds)               │
│  └── Plan Mode (outline before spending credits)     │
├──────────────────────────────────────────────────────┤
│  agents.asksurf.ai (developer-facing)                │
│  ├── Surf Skill (one-line install for AI agents)     │
│  ├── CLI tool (terminal)                             │
│  ├── Chat API (natural language → structured)        │
│  ├── Data API (83 REST endpoints, 12 domains)        │
│  ├── Surf Agent Stack/SAS (MCP server)               │
│  └── Onchain SQL (58 ClickHouse tables)              │
└──────────────────────────────────────────────────────┘
```

### 1.3 가격 구조 (확정)

asksurf.ai 소비자 plans (2025-10 기준, [source: skywork.ai review citing official FAQ]):

| Plan | 가격 | Ask | Research | Execution | Studio | NFT |
|---|---|---|---|---|---|---|
| Free | $0 | Limited | Limited (2/wk) | ❌ | 1000 free credits | ❌ |
| Plus | **$19/mo** | Unlimited | 25/month | ❌ | (?) | ❌ |
| Pro | **$49/mo** | Unlimited | 100/2wk | 1/day | Full | annual only |
| Max | **$499/mo** | Unlimited | Unlimited | Unlimited | Full | annual only |

API/Agent 가격:
- **30 free credits/day** (no key)
- **Unlimited API access** with paid key (가격 미공개, [estimate $50-200/mo])
- **Surf Enterprise** — 별도 협상 (SOC 2, dedicated infra)

연간 plan 가입 시 **NFT 보상** (potential airdrop hint).

---

## 2. Capability 깊이 분석

### 2.1 Ask Mode (Q&A chat)

자연어 질문 → 즉답 + 인용 source.

샘플 prompts:
- "Has Hype recently launched a trading pair on Binance?"
- "What's the price of ETH"
- "Show me the top Polymarket markets"

특징:
- **Cyber AI** (proprietary fine-tuned model)
- **CAIA benchmark**에서 GPT/Grok 대비 4x [Surf 자칭]
- **Citations 제공** (hallucination 방지)
- Real-time data integration

### 2.2 Research Mode (deep reports)

자연어 요청 → professional-grade research report.

샘플:
- "Story Protocol price outlook & token unlock impact"
- "Hype recent listings analysis"

출력:
- Multi-section report
- Charts + tables
- Saved to shared folders (team)
- 1M+ reports generated since 2025-07

### 2.3 Executor Mode (DEX execution, beta)

자연어 명령 → DEX 거래 실행 (human-in-the-loop confirmation).

샘플:
- "Swap 1.5 ETH for [token] on Base via Uniswap"

특징:
- **DEX only** (CEX 연결 없음 알려진 바)
- Pro tier: 1/day, Max tier: unlimited
- ProductHunt 리뷰: "best agentic flow I've seen for simple DeFi tasks"

### 2.4 Crypto Data Hub (dashboard)

Pre-built tab들:
- Social trending lists (사용자 평: "scarily accurate")
- 가격 charts
- Indicator heatmaps
- Wallet flows

### 2.5 Surf Studio (no-code builder, 2026-03 NEW)

**가장 위협적인 신기능**.

기능:
- 자연어로 crypto web app 생성
- 즉시 배포 (URL 발급)
- Real-time modification (follow-up prompt)
- Template library
- Native data integration (40+ blockchain, 200+ source)
- Sandboxed execution environment
- End-to-end encryption

샘플 use case:
> "Create a dashboard tracking Bitcoin volatility against traditional market indices."

→ Surf Studio가:
- Functional web application 생성
- Data feed 연결
- 시각화 + 계산
- 즉시 배포 (URL)

이건 **"Cogochi의 chart workspace를 사용자가 자기 맘대로 만들 수 있게"** 라는 의미. 우리 차별화에 직접 영향.

### 2.6 Surf Studio Gallery + Plan Mode

- **Gallery**: 커뮤니티 builds 발견 + remix
- **Plan Mode**: credit 사용 전 app outline (cost preview)
- 12K USD prizes (커뮤니티 active)

### 2.7 Surf Agent Stack (SAS)

개발자/AI agent용:
- **60+ API endpoints** (7 categories)
- **MCP server** 지원
- **Claude Code integration**
- 외부 프로젝트에 적용 가능

샘플:
```bash
npx skills add asksurf-ai/surf-skills --skill surf
```

→ AI agent가 자동으로 endpoint discover + auth + fetch.

### 2.8 Data 규모 (자칭)

- **40+ blockchains**
- **200+ data sources**
- **29.4 billion** cross-chain token transfer records
- **120 million** social data points
- **200,000** key accounts monitored
- **12,000** major wallets tracked

이 규모는 사실이라면 **dwarfs CoinGlass/Velo**.

---

## 3. 9 Domain Coverage (정확)

docs.asksurf.ai/overview에서 확인:

| Domain | Endpoints | 내용 |
|---|---|---|
| **Market** | ~15 | prices, rankings, technical indicators (RSI, MACD, Bollinger), fear & greed, liquidations, futures, options, ETFs |
| **Exchange** | ~10 | order books, candlesticks, funding rates, long/short ratios |
| **Wallet** | ~10 | balances, transfers, DeFi positions, net worth, labels |
| **Social** | ~10 | Twitter/X profiles, posts, followers, mindshare, sentiment |
| **Token** | ~10 | holders, DEX trades, transfers, unlock schedules |
| **Project** | ~8 | profiles, DeFi TVL, protocol metrics |
| **Prediction Markets** | ~8 | Polymarket, Kalshi (markets, trades, prices, OI) |
| **On-chain** | ~10 | tx lookup, SQL queries, gas, bridge, yield rankings |
| **News & Search** | ~5 | cross-domain entity search, news feed, web fetch |

총 **83 REST endpoints + 58 ClickHouse SQL tables** = ~140+ data access points.

---

## 4. Cyber AI 모델 (proprietary)

### 4.1 주장

- **Crypto-native fine-tuned**
- General LLM (GPT, Grok)에서 흔한 hallucination 최소화
- Real-time data 연결
- **CAIA benchmark에서 GPT/Grok 4x 우월** [Surf 자칭, 검증 필요]

### 4.2 무엇 위에 빌드?

- 자체 base model 명시 안 함
- "trained on curated, real-time crypto data"
- Cyber Layer 2 (Ethereum L2 for Web3 social) 위에서 운영

### 4.3 한계

- **Memory between messages 없음** (VeloAI도 동일)
- 자기 user history 학습 안 함
- Pattern reasoning 약함 (chat-oriented)

---

## 5. 핵심 metric (자칭, 2025-12 시점)

| Metric | Value |
|---|---|
| Funding | **$15M** (Pantera, Coinbase Ventures, DCG) |
| Launch | 2025-07 invite-only, 2025-09 public |
| Reports generated | **1M+** since July |
| Growth | **50% MoM** |
| Adopted by | **80% of top exchanges** [Surf 자칭] |
| Surf 2.0 launch | 2026-02 (announced), 2026-03 actual |
| Surf 2.0 Studio | 2026-03 launch (12K prizes) |
| Surf Enterprise | 2026 announced (SOC 2 in progress) |

이 숫자들이 사실이라면 **이미 Surf은 standard tool**이 되었다는 뜻. 우리가 들어갈 때 brand awareness 차이가 크다.

---

## 6. Surf vs Cogochi — 정확 차이

| 축 | Surf | Cogochi |
|---|---|---|
| **Primary interaction** | Chat / natural language | Chart capture |
| **Output** | Research report / dashboard / app | Pattern search result |
| **Memory** | Session-level (per query) | Cross-session ledger |
| **Workflow** | Q&A or generate | Save → search → judge → refine |
| **Data scope** | Broad (40+ chains, 200+ sources) | Narrow (perp derivatives feature snapshot) |
| **AI role** | Generation + execution | Translation + advisory |
| **Personalization** | Saved research folders | Personal variants + verdict |
| **Sequence search** | ❌ | ✅ moat |
| **Pattern library** | ❌ | ✅ |
| **Verdict ledger** | ❌ | ✅ moat |
| **Phase tracking** | ❌ | ✅ moat |
| **Trade execution** | ✅ DEX (executor mode) | ❌ (out of scope) |
| **No-code builder** | ✅ Studio | ❌ (out of scope) |
| **Team workspace** | Limited (shared folders) | ✅ Phase 2 native |
| **Price** | $19-499 (consumer) | $29-199 (target) |
| **Target user** | Generalist crypto user | Derivatives pattern trader |
| **Funding** | $15M VC | (TBD) |
| **DeFi integration** | DEX execution | ❌ |

---

## 7. 위협 시나리오 (구체화)

### 7.1 가장 가능성 높은 위협 경로

**Surf은 derivatives pattern을 명시적으로 추가하지 않을 수 있다**. 이유:
- Generalist 포지셔닝이 자기 강점
- Studio가 "사용자가 만들도록" 권장 (Surf 자체가 안 만듦)
- Derivatives는 narrow vertical, ROI 낮음

**그러나 Surf 사용자가 Studio로 patterns workflow를 만들 수 있다**. 이게 진짜 위협:

```
Crypto trader → Surf Studio → "Create a pattern memory tool for OI reversals"
                            → Studio가 dashboard 생성
                            → 즉시 배포
                            → 다른 trader가 Gallery에서 발견 → remix
```

이게 **Cogochi의 raison d'être를 무력화**할 수 있다.

### 7.2 시간축

| Time | Surf 행동 | Cogochi 영향 |
|---|---|---|
| **3개월** | Studio gallery 확장, 새 templates | Pattern memory app 누군가 만들 수 있음 |
| **6개월** | Surf 2.0 정착, Pro tier 확장 | Brand awareness 격차 확대 |
| **12개월** | Enterprise (SOC2) 진입, 80% exchanges 영향력 | B2B segment에서 Surf 우선 채택 |
| **18개월** | Surf 3.0 (예상), agent ecosystem 성숙 | Cogochi가 niche로 squeeze 가능 |

### 7.3 우리 대응 옵션

#### Option A: 빠른 narrow vertical 우위 확보

- 6개월 내 Sequence Matcher GA
- 9개월 내 Verdict ledger 1000+ verdicts
- 12개월 내 Personal variant 사용 패턴 검증
- Studio가 못 만드는 **"sequence-based search"** 명확한 moat 구축

#### Option B: Surf와 협력

- Surf Studio에서 Cogochi 부르는 integration
- "Add pattern memory to your Surf workflow" 마케팅
- Surf의 distribution 활용

위험: 협력은 acquisition target으로 만들 수 있음.

#### Option C: API-first 접근

- Cogochi API를 Surf Skill처럼 distribute
- AI agent ecosystem에서 "the pattern memory tool"
- Surf과 같은 layer에서 작동 (대체 X, 보완 O)

---

## 8. Cogochi의 결정적 차별화 (재확인)

Surf이 절대 만들기 어려운 4가지:

### 8.1 Verdict Ledger (가장 강함)

이유:
- Verdict 데이터는 **사용자별 시간 누적** 필요
- Surf의 chat paradigm으론 자연스럽게 안 쌓임
- Surf Studio도 "유저가 만든 도구"이지 데이터 자산은 사용자 소유 (Surf 통합 ledger 없음)

### 8.2 Sequence Matcher

이유:
- Phase path 비교는 algorithmic depth 필요
- Surf의 generalist position과 conflict
- Studio로 사용자가 만들기엔 너무 복잡

### 8.3 Phase Overlay on Chart

이유:
- 차트 위 phase zone는 derivatives 특화
- Surf은 chart 영역 약함 (data display만)
- Pattern engine + visualization 결합 필요

### 8.4 Personal Variant (threshold override)

이유:
- 사용자 verdict 누적이 prerequisite
- Surf은 사용자별 personalization 모델 없음
- "내 personal threshold"는 Surf paradigm에 안 맞음

---

## 9. 마케팅 메시지 (Surf 대비)

### 9.1 정확한 차별화

**❌ 하지 말 것**: "Surf보다 좋다" — 직접 비교는 brand awareness 부족 시 위험

**✅ 할 것**: "Surf does X, we do Y" — 카테고리 분리

### 9.2 Killer statements

- **"Surf gives you research. Cogochi gives you memory."**
- **"Surf answers 'what's happening now.' Cogochi answers 'have I seen this before?'"**
- **"Surf is for asking. Cogochi is for remembering."**
- **"Use Surf to research. Use Cogochi to verify your patterns work."**
- **"Surf builds tools. Cogochi builds verdict history."**

### 9.3 Co-existence narrative

P0 유저 stack:
```
Surf ($19-49)         → Research + tools
Cogochi ($29-79)      → Pattern memory
Velo (free)           → Data
Exchange              → Execution
```

4-layer 명확화. **각자 자기 강점만**.

---

## 10. 가격 영향 (재계산)

Surf의 가격 구조:
- Plus $19, Pro $49, Max $499

이게 의미하는 것:
- $19 → 입문자 entry
- $49 → mid-tier sweet spot (research-active)
- $499 → enterprise/heavy user

Cogochi 가격 적정선:
- Free → Save Setup 5개 (Surf의 "Limited"와 비슷)
- **Pro $29** → Surf Plus ($19)와 Pro ($49) 사이. Surf 사용자가 "추가" 부담 가능
- **Pro Plus $79** → Velo API 절반, Surf Pro 1.6x. Niche power user
- **Team $199** → Surf Enterprise 대비 affordable

**Surf과 동시에 쓰일 가격 범위**가 핵심. $29는 Surf Plus 유저에게도 부담 없음.

---

## 11. Cogochi가 차용 가능한 것

### 11.1 Data 다양성

- 40+ blockchains, 200+ sources는 우리 scope 밖
- 하지만 **Velo + CoinGlass 데이터 consume** 정도면 P0 segment에 충분

### 11.2 Skill protocol (MCP)

- Surf Skill 같은 MCP server 우리도 가능
- "Cogochi Skill for Claude Code/Cursor"
- 우리 패턴 검색 capability를 AI agent ecosystem에 노출
- **P3 idea**, but viable

### 11.3 Plan Mode (cost preview)

- Studio의 Plan Mode 좋은 UX 패턴
- 우리 Search/Research 호출 전에도 비용 preview 가능
- Pro tier 한도 관리에 유용

### 11.4 Citations

- Surf의 "citation 제공"이 trust 만듦
- 우리 verdict/ledger도 비슷하게 source 표시
- "Pattern X has 47 verified cases (12 user verdicts)" 같은 explicit count

### 11.5 Gallery (community builds)

- P3에서 검토 가능
- "사용자가 만든 pattern" 공유 community
- 단, moderation cost + spam risk

---

## 12. 단기 (6개월) 액션 항목

### 12.1 Defense

- [ ] **Sequence Matcher GA** 우선순위 1
- [ ] Verdict ledger 빠른 증가 (incentive 추가)
- [ ] Phase overlay 데모 video → Twitter 확산
- [ ] "We do what Surf can't (and vice versa)" 메시지 정착

### 12.2 Watch

- [ ] Surf Studio Gallery monthly check (pattern memory tool 등장 여부)
- [ ] Surf 2.0 release notes 추적
- [ ] Surf Enterprise customer list 모니터 (top exchanges 우리도 접근 가능?)
- [ ] CAIA benchmark validation (외부 검증 자료)

### 12.3 Opportunity

- [ ] Surf Skill ecosystem과 호환 (P3, Cogochi Skill)
- [ ] Surf 사용자에게 Cogochi 마케팅 (Twitter targeting)
- [ ] Surf 사용 후 "limitation" 느끼는 Pro/Max 사용자가 우리 target

---

## 13. 중장기 (12-24개월) 시나리오

### 13.1 Scenario A: Surf이 generalist 유지

- Surf은 broad horizontal 잠재 우위
- Cogochi는 narrow vertical에서 lock-in
- Co-existence, 양자 모두 성장
- **확률 50%**

### 13.2 Scenario B: Surf이 vertical 진입 시도

- Surf Studio → derivatives pattern app 출시
- 또는 Surf 자체가 derivatives module 추가
- Cogochi는 verdict ledger + team workspace로 차별화
- **확률 30%**

### 13.3 Scenario C: Surf acquisition offer

- Cogochi가 명확한 traction 있을 때
- Surf $50M-100M offer 가능성
- 의사결정: 독립 vs acquisition
- **확률 10%**

### 13.4 Scenario D: Surf 내부 분열 / pivot

- VC 압력으로 다른 카테고리 pivot
- Cogochi에 기회 확대
- **확률 10%**

대비: A,B만 plan으로 가져감. C,D는 react.

---

## 14. 지표 비교 (자기 진단)

Cogochi가 Surf 대비 어디 서 있어야 하는가:

| 지표 | Surf 현재 | Cogochi M3 target | Cogochi M12 target |
|---|---|---|---|
| WAA | [unknown, 추정 50K+] | 200 | 5,000 |
| MRR | $1M+ ARR/12 ≈ $80K+ | $1.5K | $80K |
| 데이터 sources | 200+ | 5-10 | 20-30 |
| Endpoints | 83 | (internal only) | 30 (P2 API) |
| Funding | $15M | (TBD) | (TBD) |
| Team size | [unknown 추정 30+] | 2-3 | 8-12 |
| Brand awareness | 80% top exchanges | <1% | 5-10% niche |

이 격차는 **funding 또는 niche depth로** 메워야 한다.

---

## 15. 한 줄 결론

> **Surf은 generalist crypto AI의 운영체제로 자리 잡으려 한다. $15M funding + Studio + Agent Stack + 80% exchanges 채택 (자칭)으로 우리에게 가장 큰 위협.**
>
> **하지만 Surf의 chat + builder paradigm은 sequence matcher, verdict ledger, personal variant를 자연스럽게 만들지 못한다. 이게 Cogochi의 결정적 4-moat.**
>
> **포지션: "Use Surf to research. Use Cogochi to verify your patterns work." 4-layer architecture (Surf + Cogochi + Velo + Exchange).**
>
> **단기 우선순위: Sequence Matcher GA + Verdict ledger 1000+ + Surf Studio Gallery 모니터링.**

---

## 16. Open Questions (추적 필요)

- [ ] Surf 실제 paid user 수 (자칭 외)
- [ ] CAIA benchmark 외부 검증
- [ ] Surf 2.0 데이터 정확도 vs 자칭 4x
- [ ] Surf Enterprise 첫 large customer
- [ ] Surf token launch 가능성 (현재 "no plans")
- [ ] Surf 한국 시장 진입 시점 (한글 지원, 한국 마케팅)
- [ ] Surf Studio에서 derivatives pattern app 등장 시점

이 항목들은 monthly competitive scan에서 추적.
