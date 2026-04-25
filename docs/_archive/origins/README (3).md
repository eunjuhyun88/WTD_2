# COGOCHI — Product Requirements Document Set

**버전**: v1.3 (2026-04-25)
**상태**: canonical
**Owner**: PM / CEO
**기반**: `cogochi-design-v3/` 설계 문서 set

---

## 0. 이 문서의 위치

설계 문서(`cogochi-design-v3/`)는 "어떻게 만들 것인가"를 다룬다.
이 PRD set은 "누구를 위해, 무엇을, 언제 만들 것인가"를 다룬다.

두 set이 상호 참조한다.

---

## 1. 문서 구성 (총 22 docs)

### Core PRD (필수)

| # | 파일 | 주제 |
|---|---|---|
| 01 | `PRD_01_USER_PERSONA.md` | P0/P1/P2 페르소나 |
| 02 | `PRD_02_USER_SCENARIOS.md` | Day in the life |
| 03 | `PRD_03_FEATURE_PRIORITY.md` | P0/P1/P2 분류 |
| 04 | `PRD_04_SUCCESS_METRICS.md` | NSM (WVPL) |
| 05 | `PRD_05_COMPETITIVE_ANALYSIS.md` | 경쟁 큰 그림 |
| 06 | `PRD_06_LAUNCH_PLAN.md` | 4-phase launch |

### Competitive Deep Dive (12 docs)

| # | 파일 | 주제 |
|---|---|---|
| 05B | `PRD_05B_COMPETITIVE_DEEP_DIVE.md` | 6사 기능 대차 대조표 |
| 05C | `PRD_05C_VELO_DEEP_DIVE.md` | Velo 풀스택 (data + AI + trading + DeFi + HyperEVM) |
| 05D | `PRD_05D_COINGLASS_DEEP_DIVE.md` | CoinGlass tier별 기능 |
| 05E | `PRD_05E_HYBLOCK_DEEP_DIVE.md` | Hyblock liquidation predictive levels |
| 05F | `PRD_05F_SURF_DEEP_DIVE.md` | Surf 3-product 통합 (1.0) |
| 05G | `PRD_05G_SURF_2.0_UPDATE.md` | Surf 2.0 Studio + Agent Stack |
| 05H | `PRD_05H_INSILICO_TERMINAL.md` | Insilico Terminal (free execution) |
| 05I | `PRD_05I_COINALYZE_LAEVITAS.md` | Coinalyze + Laevitas (니치) |
| 05J | `PRD_05J_TRENDSPIDER.md` | TrendSpider (stock-first) |
| 05K | `PRD_05K_TICKERON_TRADEIDEAS.md` | Stock pattern AI 참고 |
| 05L | `PRD_05L_TELEGRAM_ECOSYSTEM.md` | Telegram bot + signal channels |
| 05M | `PRD_05M_HYPERLIQUID_ECOSYSTEM.md` | Hyperliquid 110+ tools |
| 05N | `PRD_05N_KOREA_MARKET.md` | 한국 시장 (CryptoQuant + 김프 + Naver/Telegram) |

### Operational PRD

| # | 파일 | 주제 |
|---|---|---|
| 07 | `PRD_07_ONBOARDING_FLOW.md` | First 7 days |
| 08 | `PRD_08_PRICING_VALIDATION.md` | A/B test |
| 09 | `PRD_09_INTEGRATION_SPEC.md` | API 통합 |

총 ~270min 독서.

---

## 2. v1.3 핵심 합의

### 2.1 4-Layer Stack 명확화

```
Layer 1: Cogochi ($29-79)        ← Pattern memory + search
Layer 2: Surf ($19-49)           ← Research (optional)
Layer 3: 데이터
   - Velo (free)                  ← Multi-exchange + CME
   - CoinGlass ($12)              ← Liquidation heatmap
   - CryptoQuant (한국 회사)        ← On-chain + 김프
   - Coinalyze (free)             ← Custom metric
Layer 4: Execution
   - Insilico Terminal (free)     ← Multi-exchange terminal
   - Velo Trading                 ← Bybit + Hyperliquid
   - Exchange native              ← Binance/Bybit/Hyperliquid
```

P0 평균 monthly: **$60-100/mo** for full stack.

### 2.2 Persona 확정

- **P0** = 복기하는 개인 프로 트레이더 (Jae 한국 버전 우선). ARPU $29-79.
- **P1** = Trading desk/팀. ARPU $199-499.
- **P2** = Quant/systematic. API access.

### 2.3 NSM 단일 선정

> **Weekly Verified Pattern Loops (WVPL)**

### 2.4 카테고리 포지셔닝

> **Not an AI chat. Not a data terminal. A pattern memory OS for crypto derivatives.**

### 2.5 4가지 unique moat

1. **Phase overlay on chart**
2. **Sequence-based similar search**
3. **Verdict ledger**
4. **Personal variant with threshold override**

### 2.6 Launch gate

```
M1 Closed Alpha (10-20명, NPS +30)
M3 Closed Beta (200 paid, conversion 10%)
M6 Open Beta (1000+ paid, MRR $12K+)
M9 GA
M12 Scale review → $80K MRR / $1M ARR
```

### 2.7 한국 시장 우선 (v1.3 NEW)

- 한국어 UI 동시 출시
- 김프 indicator + CryptoQuant 데이터 통합
- Naver/Telegram ambassador 마케팅
- M9+ KBW 참가, 한국 거래소 파트너십

---

## 3. 위협 등급 종합 (v1.3 final)

| 경쟁사 | 위협도 | 시점 | 대응 |
|---|---|---|---|
| **Surf 2.0 Studio** | **Critical** | 3-9개월 | Sequence Matcher GA 가속 |
| **YC clone** | **High** | 6-12개월 | 첫 200 P0 lock-in |
| Surf 1.0 base | High | 6-12개월 | Verdict ledger 1000+ |
| Velo (재평가) | Medium | 12-24개월 | 3-layer 메시지, deeplink |
| CoinGlass | Medium-low | 24+개월 | 데이터 소비 |
| Hyblock | Low | 12-18개월 | 차트 영역 분리 |
| Tickeron crypto | Low-medium | 6-12개월 | Algorithm-only 차별화 |
| TrendSpider | Low | 12+개월 | 무시 가능 |
| Coinalyze | Very low | — | Free + custom metric, 보완재 |
| Laevitas | Very low | — | Options 전문, 영역 다름 |
| Insilico | Very low | — | Execution layer, 카테고리 다름 |
| Telegram signals | Low | — | sequence/verdict 차별화 |
| CryptoQuant | Low | — | 협력 가능, partner 추진 |
| Hyperliquid 자체 | None | — | 거래소, M6+ 데이터 통합 |

---

## 4. 경쟁사별 한 줄 전략

| 경쟁사 | 우리 전략 |
|---|---|
| Surf | "Surf for research, Cogochi for memory" — 카테고리 분리 |
| Velo | 데이터 consumer + deeplink, trading 영역 침범 X |
| CoinGlass | 데이터 source, 무료 tier 비교 anchor |
| Hyblock | 차트 영역 분리, P0 일부 둘 다 사용 |
| TrendSpider | Stock-first, crypto 영역 안 함 |
| Tickeron | Algorithm-only 한계, 우리 verdict ledger 차별화 |
| Insilico | Execution partner, deeplink 가능 |
| Coinalyze | Free 데이터 fallback, 영역 다름 |
| Laevitas | Options 영역 분리, 영원히 추격 X |
| Telegram | Alert push out 통합, "verified by ledger not trust" |
| Hyperliquid | M6+ 데이터 primary 통합, P3 builder code 검토 |
| **CryptoQuant** | **한국 partner 추진**, 한국 distribution 협력 |

---

## 5. v1.3 핵심 액션 항목

### 즉시 (Week 1-2)

- [ ] Persona interview 15-25명 (한국 P0 우선)
- [ ] 경쟁사 유료 결제: Surf Plus/Pro, Velo $199 API, CoinGlass Premium $12, Tickeron RTP, CryptoQuant Advanced
- [ ] Landing page draft (한국어 + 영어, 4-layer stack 메시지)
- [ ] Twitter @cogochi 시작 (한국어 + 영어)

### Week 2-4

- [ ] Design Slice 1 kick-off (Contract cleanup)
- [ ] Beta waitlist signup open (한국 + 영어)
- [ ] Velo News API trial $129
- [ ] CryptoQuant API trial 신청 (협력 가능성 explore)

### Month 2-3

- [ ] Slice 2-5 병행 개발
- [ ] 10-20명 Alpha user (한국 50% / 글로벌 50%)
- [ ] Pricing interview 5명 (한국 + 영어)
- [ ] **김프 indicator P0 feature** 추가
- [ ] **OI-Normalized CVD + session features** 추가 (Velo 차용)

### Month 3-6 (Critical)

- [ ] **Sequence Matcher GA** (Surf 방어선 1)
- [ ] **Verdict ledger 500+ verdicts** (Surf 방어선 2)
- [ ] Closed Beta 200 paid (한국 100 + 글로벌 100)
- [ ] **CryptoQuant partnership 본격 협의**
- [ ] Hyperliquid 데이터 통합 시작

### Month 6-9

- [ ] Open Beta launch
- [ ] KBW 참가 검토
- [ ] Velo deeplink 구현
- [ ] Insilico Terminal 협업

---

## 6. 자주 묻는 질문 (v1.3)

### Q: Surf 2.0 Studio가 derivatives pattern app을 만들면?

Sequence matcher + verdict ledger의 algorithmic depth는 no-code generator가 만들기 어렵다. 우리는 **데이터 레이어가 아니라 알고리즘 + 검증 데이터 레이어**.

### Q: Velo가 trading + DeFi까지 풀스택으로 가는데?

우리는 trading 절대 안 함. "Velo for data + execution, Cogochi for pattern memory" 4-layer 명확화.

### Q: CryptoQuant이 한국 시장 dominance인데?

협력. 카테고리 다름 (data vs pattern memory). M3-M6 partnership 추진.

### Q: 가격이 다른 도구 대비 적당한가?

Velo $199 API + Surf $49 Pro + CoinGlass $12 Premium = **$200-260 paying user 시장 검증**. Cogochi $29 (entry) / $79 (Pro Plus) / $199 (Team) sweet spot.

### Q: Hyperliquid 진입 시점?

M6+ Open Beta. 현재 70% perp DEX market share. P0 페르소나 일부 primary venue.

### Q: 김프 indicator가 정말 unique한가?

전 세계 도구 중 derivatives pattern 안에 김프 통합한 곳 없음. 한국 P0에 강력한 hook + 글로벌에서도 retail FOMO indicator.

---

## 7. 변경 이력

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-04-25 | Initial 6 docs |
| v1.1 | 2026-04-25 | Velo deep dive + 3-layer stack |
| v1.2 | 2026-04-25 | CoinGlass + Hyblock + Surf + Surf 2.0 (10 docs total) |
| v1.3 | 2026-04-25 | Insilico + Coinalyze/Laevitas + TrendSpider + Tickeron/TradeIdeas + Telegram + Hyperliquid + 한국 (16 deep dives total + 3 operational + 6 core = **22 docs**) |

---

## 8. 한 줄 요약 (v1.3)

> **P0 = 복기하는 한국 프로 개인 트레이더 우선. NSM = WVPL.**
>
> **Stack = 4-layer (Cogochi memory + Surf research + Velo/CG/CQ data + Insilico/exchange execution).**
>
> **Moat 4: Phase overlay · Sequence search · Verdict ledger · Personal variant.**
>
> **가장 큰 위협 = Surf 2.0 Studio (3-9개월). 대응 = Sequence Matcher + Verdict Ledger 6개월 내 깊이 구축.**
>
> **한국 우선: 김프 indicator + CryptoQuant partnership + Naver/Telegram 마케팅 + KBW.**
>
> **Launch = 4-phase gated, M9 GA, kill criteria 사전 정의. 목표 M12 $80K MRR / $1M ARR.**
