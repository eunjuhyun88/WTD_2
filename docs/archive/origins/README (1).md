# COGOCHI — Product Requirements Document Set

**버전**: v1.2 (2026-04-25)
**상태**: canonical
**Owner**: PM / CEO
**기반**: `cogochi-design-v3/` 설계 문서 set

---

## 0. 이 문서의 위치

설계 문서(`cogochi-design-v3/`)는 "어떻게 만들 것인가"를 다룬다.
이 PRD set은 "누구를 위해, 무엇을, 언제 만들 것인가"를 다룬다.

두 set이 상호 참조한다.

---

## 1. 문서 구성

### Core PRD (필수)

| # | 파일 | 주제 | 분량 |
|---|---|---|---|
| 01 | `PRD_01_USER_PERSONA.md` | P0/P1/P2 페르소나, Anti-persona, size estimate | 10min |
| 02 | `PRD_02_USER_SCENARIOS.md` | Day in the life (P0 Jae, P1 Kim team, edge cases) | 12min |
| 03 | `PRD_03_FEATURE_PRIORITY.md` | 전 기능 P0/P1/P2 분류, sunset policy | 12min |
| 04 | `PRD_04_SUCCESS_METRICS.md` | NSM (WVPL), input metrics, guardrails | 10min |
| 05 | `PRD_05_COMPETITIVE_ANALYSIS.md` | 경쟁사 포지셔닝 큰 그림 | 12min |
| 06 | `PRD_06_LAUNCH_PLAN.md` | Alpha → Closed Beta → Open Beta → GA | 12min |

### Competitive Deep Dive

| # | 파일 | 주제 | 분량 |
|---|---|---|---|
| 05B | `PRD_05B_COMPETITIVE_DEEP_DIVE.md` | 기능 단위 대차 대조표 6사 + killer statements | 15min |
| 05C | `PRD_05C_VELO_DEEP_DIVE.md` | Velo.xyz 풀스택 (data + AI + trading + DeFi + HyperEVM) | 15min |
| 05D | `PRD_05D_COINGLASS_DEEP_DIVE.md` | CoinGlass tier별 정확한 기능 + Liquidation Heatmap 모델 | 10min |
| 05E | `PRD_05E_HYBLOCK_DEEP_DIVE.md` | Hyblock liquidation predictive levels + volume-based pricing | 12min |
| 05F | `PRD_05F_SURF_DEEP_DIVE.md` | Surf 3-product 통합 (Chat + API + Skill), Cyber AI | 14min |
| 05G | `PRD_05G_SURF_2.0_UPDATE.md` | Surf 2.0 Studio (no-code builder) + Agent Stack 위협 재평가 | 16min |

### Operational PRD

| # | 파일 | 주제 | 분량 |
|---|---|---|---|
| 07 | `PRD_07_ONBOARDING_FLOW.md` | First 7 days 유저 여정 + activation funnel | 13min |
| 08 | `PRD_08_PRICING_VALIDATION.md` | A/B test 세팅 + interview script + tier validation | 11min |
| 09 | `PRD_09_INTEGRATION_SPEC.md` | Velo/CoinGlass/Binance API 붙이기 기술 문서 | 14min |

총 ~165min 독서.

---

## 2. 핵심 합의 (v1.2)

### 2.1 Persona 확정

- **P0** = 복기하는 개인 프로 트레이더 (Jae 원형). ARPU $29-79/mo.
- **P1** = Trading desk/팀 (Kim team 원형). Phase 2 primary.
- **P2** = Quant/systematic researcher. Phase 3 API 접근.
- Anti-persona: 초보 카피트레이더, 인플루언서 팔로워, 장기 홀더.

### 2.2 NSM 단일 선정

> **Weekly Verified Pattern Loops (WVPL)**
> = capture → 72h outcome → user verdict 전체 사이클 수 (주간).

### 2.3 카테고리 포지셔닝

> **Not an AI chat. Not a data terminal. A pattern memory OS for crypto derivatives.**

### 2.4 4-Layer Stack 명확화 (v1.2)

P0 유저의 ideal stack:

```
Layer 1: Cogochi ($29-79)        ← Pattern memory + search
Layer 2: Surf ($19-49)           ← Research + tools (optional)
Layer 3: Velo / CoinGlass        ← Multi-exchange data
Layer 4: Exchange (Binance etc)  ← Actual positions
```

각 레이어가 자기 강점만 한다. 우리는 Layer 1만.

### 2.5 Feature 수량

- P0: 39개 (M0-M1, 6주)
- P1: 24개 (M3-M6)
- P2: 20+개 (M6+)
- Never: 3개 (자동매매, wallet connect, 초보 튜토리얼)

### 2.6 4가지 unique moat

경쟁사 0-1★, 우리만 5★:

1. **Phase overlay on chart**
2. **Sequence-based similar search**
3. **Verdict ledger**
4. **Personal variant with threshold override**

### 2.7 Launch gate

```
M1 Closed Alpha (10-20명, NPS +30)
M3 Closed Beta (200 paid, conversion 10%)
M6 Open Beta (1000+ paid, MRR $12K+)
M9 GA (with team tier)
M12 Scale review → $80K MRR / $1M ARR
```

---

## 3. 경쟁 환경 — 한 페이지 요약 (v1.2)

### 3.1 Layer별 경쟁사

```
┌─────────────────────────────────────────────┐
│ DATA AGGREGATION                            │
│  CoinGlass ($12+), Velo ($0/$199),          │
│  Coinalyze, Laevitas (options)              │
├─────────────────────────────────────────────┤
│ ADVANCED VISUALIZATION                       │
│  Hyblock ($50-200, volume-based free),      │
│  CoinGlass Prime                            │
├─────────────────────────────────────────────┤
│ CHARTING                                     │
│  TradingView ($15-60), Velo, TrendSpider    │
├─────────────────────────────────────────────┤
│ AI RESEARCH + BUILDER                        │
│  Surf 2.0 ($19-499), VeloAI (free beta)     │
├─────────────────────────────────────────────┤
│ TRADING TERMINAL                            │
│  Velo Trading, Insilico Terminal            │
├─────────────────────────────────────────────┤
│ PATTERN / ALERT                             │
│  TrendSpider (stock), Telegram bots         │
├─────────────────────────────────────────────┤
│ PATTERN RESEARCH OS ← Cogochi               │
└─────────────────────────────────────────────┘
```

### 3.2 위협 등급 (v1.2 재평가)

| 경쟁사 | 위협도 | 시점 | 대응 |
|---|---|---|---|
| **Surf 2.0 Studio** | **Critical** | 3-9개월 | Sequence Matcher GA 가속, Gallery 모니터 |
| Surf 1.0 base | High | 6-12개월 | Verdict ledger 1000+ 축적 |
| Velo | Medium | 12-24개월 | 3-layer stack 메시지, deeplink 협력 |
| CoinGlass | Medium-low | 24+개월 | 데이터 소비 |
| Hyblock | Low | 12-18개월 | 차트 영역 분리 |
| YC clone | High | 6-12개월 | 첫 200 P0 lock-in |
| TrendSpider | Low | 12+개월 | 무시 가능 |

**v1.2 신규 위협 시나리오**: Surf Studio Gallery에 누군가 "pattern memory app" 만들어 올림 → derivatives traders 사이 viral → Cogochi 차별화 약화.

대응: Sequence Matcher + Verdict Ledger를 Studio가 generate 못하는 깊이로 6개월 내 구축.

---

## 4. PRD → Design 매핑

| PRD 문서 | 참조하는 Design 문서 |
|---|---|
| 01 Persona | — (product-first 정의) |
| 02 Scenarios | 05 Visualization, 04 AI Agent |
| 03 Feature Priority | 00 Master, 07 Roadmap |
| 04 Metrics | 07 Roadmap (kill criteria) |
| 05 Competitive | 00 Master (moat 설계) |
| 05B Deep Dive | 03 Search Engine (sequence matcher) |
| 05C Velo | 06 Data Contracts (feature additions) |
| 05D CoinGlass | 06 Data Contracts (data integration) |
| 05E Hyblock | (v.s. liquidation 영역 분리) |
| 05F Surf | 04 AI Agent (parser scope) |
| 05G Surf 2.0 | 03 Search Engine, 04 AI Agent (positioning 강화) |
| 06 Launch | 07 Roadmap (slice ordering) |
| 07 Onboarding | (UX 설계, app 레이어) |
| 08 Pricing | (운영 결정) |
| 09 Integration | 06 Data Contracts (외부 API 통합) |

---

## 5. 경쟁사별 전략 요약

### 5.1 CoinGlass

**관계**: 데이터 source. 경쟁 아님.
**전략**: Premium $12 plan API access. Liquidation heatmap만 보고 derivative pattern은 우리가.
**상세**: PRD_05D

### 5.2 Hyblock

**관계**: liquidation 영역 분리. 보완재.
**전략**: P0 사용자 중 일부는 둘 다 사용. 우리는 phase 패턴, Hyblock는 liquidation level.
**상세**: PRD_05E

### 5.3 Velo

**관계**: Data + execution. 우리 layer 2-3.
**전략**: Velo deeplink (P2). 우리는 Layer 1 patron memory.
**메시지**: "Velo gives you data. Cogochi gives you pattern memory."
**상세**: PRD_05C

### 5.4 Surf (가장 위험)

**관계**: AI research + builder. 가장 인접한 위협.
**전략**: 1) Sequence Matcher 6개월 내 GA. 2) Verdict ledger 1000+ 축적. 3) Studio Gallery monthly 모니터. 4) "Surf for research, Cogochi for memory" 메시지.
**메시지**: "Use Surf to research. Use Cogochi to verify your patterns work."
**상세**: PRD_05F + PRD_05G

### 5.5 TradingView

**관계**: 보완재. 차트 base.
**전략**: Lightweight Charts library 사용. Pine Script export (P3).

### 5.6 Telegram bots

**관계**: 대체 + 통합.
**전략**: Telegram alert push out 기능. Bot 운영자를 power user로.

---

## 6. v1.2에서 새로 추가된 인사이트

### 6.1 Surf 2.0 Studio가 의미하는 것

Surf 2.0 (2026-03 출시)은 **사용자가 자연어로 crypto dashboard/tool을 만드는 no-code builder**.

샘플:
> "Create a dashboard tracking Bitcoin volatility against traditional market indices."
> → Studio가 functional web app 생성 + 즉시 배포

이게 의미하는 것: 누군가 Studio로 "pattern memory app" 만들 가능성. Gallery에서 viral 가능.

**우리 대응**: Sequence Matcher + Verdict Ledger의 algorithmic depth는 Studio가 자동 생성하기 어려움. 이게 우리 진짜 moat.

### 6.2 Cyber AI fine-tune 효과

Surf 자칭: CAIA benchmark에서 GPT/Grok 대비 4x. 외부 검증 필요하지만, **crypto-specialized fine-tune이 generalist LLM보다 강하다는 증거**.

우리 함의: Phase 3+ 우리 자체 fine-tune 검토 가치 있음 (Cogochi parser specialist model).

### 6.3 80% top exchanges 사용 (자칭)

Surf 자칭이지만 사실이라면 B2B segment에서 brand awareness 격차 큼.

대응: P1 (team) tier 진입할 때 Surf와 직접 충돌 피함. **"전문 패턴 리서치 데스크"** 포지션 (Surf은 generalist research).

---

## 7. v1.2 추가 액션 항목

### 7.1 즉시 (Week 1)

- [x] PRD set v1.2 완성 (이 README 포함 16 docs)
- [ ] Persona interview 15-25명 섭외
- [ ] **Surf 유료 결제** (Plus $19, Pro $49) — 실제 capability 직접 검증
- [ ] **Velo Data API trial $199** 신청 — feature integration 평가
- [ ] **CoinGlass Premium $12** 결제
- [ ] Landing page draft (P0 + 3-layer stack 메시지)

### 7.2 Week 2-4

- [ ] Design Slice 1 kick-off (Contract cleanup)
- [ ] Beta waitlist signup open
- [ ] Twitter/X 계정 (@cogochi)
- [ ] Surf Studio Gallery weekly check 시작 (pattern memory app 등장 모니터)

### 7.3 Month 2-3

- [ ] Slice 2-5 병행 개발
- [ ] 10-20명 Alpha user 선별
- [ ] Pricing interview 5명 ($29 / $79 / $199 anchoring)

### 7.4 Month 3-6 (Critical)

- [ ] **Sequence Matcher GA** (Surf 방어선 1)
- [ ] **Verdict ledger 500+ verdicts** 축적 (Surf 방어선 2)
- [ ] Closed Beta 200 paid

---

## 8. 자주 묻는 질문

### Q: Surf 2.0 Studio가 derivatives pattern app을 만들면 우리는?

Sequence matcher와 verdict ledger의 algorithmic depth는 no-code generator가 만들기 어렵다. 다만 단순 dashboard/visualization은 만들 수 있음. 우리는 **데이터 레이어가 아니라 알고리즘 + 검증 데이터 레이어**.

### Q: Surf과 partnership 또는 acquisition 가능한가?

[unknown] 현재 추적 정보 없음. 가능하다면 traction 명확해진 후 (M6+) 검토.

### Q: 왜 P0 페르소나가 "개인 프로"인가, 팀이 ARPU 더 높은데?

P1 (팀) moat가 장기적으로 더 강하다. 하지만 팀 sales cycle 길고, 개인 validate 없이 팀 pitch 어렵다. P0 → P1 순서.

### Q: 11개월 GA까지 너무 긴 것 아닌가?

각 phase에 validation gate. Surf 2.0이 3-6개월 내 어떻게 진화하는지 보면서 조정 가능.

### Q: 가격 $29가 Surf Plus $19와 어떻게 다른가?

Surf은 generalist research. Cogochi는 specialist pattern memory. P0 유저는 둘 다 부담 없이 쓸 수 있음 ($19 + $29 = $48). Velo (free) + CoinGlass ($12) + Cogochi ($29) + Surf Plus ($19) = $60/mo로 4-layer stack 완성.

### Q: 한국 시장 vs 글로벌?

한국/아시아 P0 복기 문화 우선. M12 이후 영어권 확장. Surf은 영어권 dominant.

---

## 9. 변경 이력

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-04-25 | Initial 6 docs |
| v1.1 | 2026-04-25 | Velo deep dive 추가, 3-layer stack 명확화 |
| v1.2 | 2026-04-25 | CoinGlass + Hyblock + Surf deep dives, Surf 2.0 update, Onboarding/Pricing/Integration PRDs |

---

## 10. Document Status

| Doc | Status | Owner | Last Updated |
|---|---|---|---|
| 01 Persona | canonical | PM | 2026-04-25 |
| 02 Scenarios | canonical | PM | 2026-04-25 |
| 03 Feature | canonical | PM | 2026-04-25 |
| 04 Metrics | canonical | PM / CEO | 2026-04-25 |
| 05 Competitive | canonical | PM / CEO | 2026-04-25 |
| 05B Deep Dive | canonical | PM | 2026-04-25 |
| 05C Velo | canonical | PM / CTO | 2026-04-25 |
| 05D CoinGlass | canonical | PM | 2026-04-25 |
| 05E Hyblock | canonical | PM | 2026-04-25 |
| 05F Surf | canonical | PM / CEO | 2026-04-25 |
| 05G Surf 2.0 | canonical | PM / CEO | 2026-04-25 |
| 06 Launch | canonical | CEO | 2026-04-25 |
| 07 Onboarding | canonical | PM | 2026-04-25 |
| 08 Pricing | canonical | PM / CEO | 2026-04-25 |
| 09 Integration | canonical | CTO | 2026-04-25 |

---

## 11. Non-Goals (PRD 레벨)

- 완벽한 GTM strategy document
- 세부 funnel copy (product marketer 역할)
- 법률 자문 대체
- 정확한 재무 모델 (당장은 ballpark)
- Sales playbook (enterprise 진입 시 작성)
- Trading execution 직접 (Velo와 분리 유지)
- Multi-asset (perp focus 유지)

---

## 12. 한 줄 요약 (v1.2)

> **P0 = 복기하는 프로 개인 트레이더. NSM = 주간 verdict loop 수.**
> **Stack = Cogochi (memory) + Surf (research) + Velo/CG (data) + Exchange (execution). 4-layer.**
> **Moat 4: Phase overlay · Sequence search · Verdict ledger · Personal variant.**
> **가장 큰 위협 = Surf 2.0 Studio. 대응 = Sequence Matcher + Verdict Ledger 6개월 내 깊이 구축.**
> **Launch = 4-phase gated, M9 GA, kill criteria 사전 정의.**
