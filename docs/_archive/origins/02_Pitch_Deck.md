# Cogochi Protocol — Pitch Deck v2

**Version**: 2.0
**Date**: 2026-04-23
**Format**: 14 slides, pre-seed/seed
**Duration**: 20-30분 + Q&A
**Revision**: Red Team 반영, Engine Marketplace 포지셔닝

---

## 사용 가이드

- 실제 deck은 Figma/Gamma로 제작. 이 파일은 내용 outline.
- 한 slide = 한 메시지.
- Speaker notes는 말할 것. Slide text는 visual anchor.
- **v1 Pitch와 차이**: "Registry" → "Marketplace" 포지셔닝, multi-engine 전략 강조, token utility 4개 포함.

---

## Slide 1 — Cover

**Headline**: Cogochi Protocol
**Subhead**: The marketplace for verified algorithmic trading engines
**Bottom**: Pre-seed · 2026.04

**Speaker notes**:
> "우리는 카피트레이딩을 하지 않는다. 우리는 **여러 algorithmic engine이 경쟁하는 marketplace**를 만든다. 오늘 이게 왜 카피트레이딩의 next wave인지 보여준다."

---

## Slide 2 — The Problem

**Headline**: 기존 카피트레이딩은 근본적으로 fragile하다

**3 bullets**:
- **Single-trader dependency** — 탑 트레이더 번아웃/잠수로 vault 붕괴
- **Zero verification** — 텔레그램 시그널방의 PnL은 조작 가능
- **$19B liquidated on 10/10** — 대부분 long-biased copy 포지션 [CoinGlass, 2025 report]

**Speaker notes**:
> "카피트레이딩 $37B+ 연간 볼륨 시장 (Bitget Q1 $9.2B × 4). 문제는 세 가지.
> 
> 첫째, 트레이더 한 명에 의존. 매니저 이탈 = 전체 붕괴. dHEDGE, Perpy 모두 겪은 문제.
> 
> 둘째, 오프체인 시그널방은 사후 스크린샷 조작 가능. 업계 신뢰 망가진 상태.
> 
> 셋째, 2025년 10월 10일 하루 $19B 청산 — 대부분 long-biased 카피 포지션. 단일 source 의존은 시스템 리스크."

---

## Slide 3 — Why Now

**Headline**: DEX perp 3.5배 성장, on-chain vault 시장 열렸다

**수치 스택**:
- DEX perp 2025 볼륨: **$6.7T** (+346% YoY) — CoinGecko 2025
- Hyperliquid: perp DEX **73%** 점유, HyperEVM 런칭
- On-chain vault TVL: ~$500M (CEX 대비 1/100)
- dHEDGE가 Chamber로 리브랜딩하며 Hyperliquid 이동 중

**Speaker notes**:
> "시장이 방금 열렸다. 2024년까지 on-chain 카피 TVL $100M 수준, 2025년 Hyperliquid 덕에 infra 준비 완료. CEX는 Bitget/Bybit/OKX 3강이라 들어갈 자리 없음. DEX는 지금 블루오션. dHEDGE 같은 기존 플레이어도 Hyperliquid로 포지션 변경 중. 우리는 이 wave에 marketplace layer를 만든다."

---

## Slide 4 — The Insight

**Headline**: Trader 대신 **multiple algorithmic engines**가 경쟁

**Before / After**:

| 기존 카피트레이딩 | Cogochi Marketplace |
|---|---|
| 한 트레이더 follow | 여러 엔진이 stake 걸고 경쟁 |
| 과거 성과 기반 선택 | 4-stage gate + on-chain PnL |
| 트레이더 잠수 리스크 | Multi-engine redundancy |
| Signal leak = alpha 소실 | Commit-reveal MEV defense |
| 시그널방 스크린샷 | 온체인 타임스탬프 + oracle |

**Speaker notes**:
> "핵심 insight: 한 트레이더도 아니고 한 알고리즘도 아니다. **여러 엔진이 경쟁하는 marketplace**. 엔진은 stake 걸고 참여, 성과 나쁘면 slash, 성과 좋으면 vault TVL 증가. Cogochi 엔진은 첫 참가자일 뿐 — marketplace 성공은 3rd party engine 유치가 결정."

---

## Slide 5 — Protocol Architecture

**Headline**: 3-layer stack. Engine Marketplace부터 빌드.

**Diagram**:
```
Layer 3: Vault Aggregator        [Phase 4, 25mo+]
Layer 2: Router Vault            [Phase 2, 6-12mo]
Layer 1: Engine Marketplace      [MVP, 3-6mo] ★
Layer 0: Engines (pluggable)     [Cogochi first]
```

**L1 components (MVP scope)**:
- EngineRegistry (stake + metadata)
- SignalCommitReveal (MEV defense)
- PerformanceScoreboard (Sharpe, MDD, OOS)
- SlashingEngine (misbehavior enforcement)
- SubscriptionPayment (optional)

**Speaker notes**:
> "투자 대상은 Layer 1 + Layer 0. Layer 2는 6-12개월, Layer 3은 2-3년. 순차 빌드. L1만으로도 protocol이 돌아간다 — subscription revenue. L2 추가 시 vault perf fee. L3는 institutional."

---

## Slide 6 — Cogochi Engine (First Participant)

**Headline**: 이미 동작하는 28-feature stack, 4-stage gate

**좌측 — 데이터 레이어**:
- 현물: OHLCV, CVD (Binance WS)
- 선물: OI, 펀딩비, L/S (Binance/Coinalyze)
- 온체인: 거래소 in/out, 고래 (Surf AI)

**우측 — 엔진 산출물**:
- 28-feature vector
- LightGBM P(win) prediction
- 4-stage gate (Backtest → WF → Paper → Live)
- Hill Climbing auto-tuning

**Speaker notes**:
> "Cogochi 엔진은 이미 돌아간다. 3년 빌드. 현물/선물/온체인 통합 28 features. LightGBM 기반. 4단계 검증 게이트 통과한 패턴만 시그널 발행. Hill Climbing으로 자동 개선. 근데 — 이게 우리만의 엔진이 아니라 marketplace 첫 참가자다. Cogochi 실패해도 marketplace는 돌아간다."

---

## Slide 7 — MEV Defense (Critical)

**Headline**: Commit-reveal로 alpha leak 방지

**Timeline**:
```
t=0    Engine commits (hash only, 내용 hidden)
t=0+5s Vaults prepare
t=0+15s Engine reveals (plain signal)
t=0+15~20s Vaults execute
t=0+35s MEV bots see reveal (too late)
```

**Why critical**: Plain publish 시 MEV sniff으로 vault 성과 20-40% 저하 [estimate, MEV 경험적]

**Speaker notes**:
> "이게 v1 대비 v2 결정적 개선. On-chain publish는 MEV bot한테 잡힌다. Commit-reveal로 content 숨기고, vault는 prepare 시간 번다. 30초 창 안에 공격자는 position 못 쌓는다. 이게 없으면 Phase 1 60일 live track record 자체가 invalid."

---

## Slide 8 — Moat

**Headline**: Protocol moat = multi-engine ecosystem

| | 경쟁자 |
|---|---|
| CEX copy (Bitget) | 인간 트레이더만 |
| HL User Vault | 매니저 중심 |
| dHEDGE/Chamber | 매니저 중심 |
| **Cogochi Marketplace** | **Multi-engine, stake-based, commit-reveal** |

**Moat는 어디서 오는가**:
1. Engine operator staking → protocol 이탈 비쌈
2. Multi-engine network effect (더 많은 엔진 ↔ 더 많은 TVL)
3. Commit-reveal 인프라 (복제 비용 높음)
4. Cogochi 엔진 alpha (첫 참가자 advantage)

**Speaker notes**:
> "솔직히 말한다. Cogochi 엔진 자체는 moat가 아니다. 엔진은 누구나 만들 수 있고 복제도 가능. 진짜 moat는 **여러 엔진이 쌓인 marketplace**. 엔진 5개 있는 marketplace와 1개 있는 경쟁자는 다르다. 우리 바운더리는 ecosystem이다."

---

## Slide 9 — Business Model

**Headline**: Subscription + Performance fee

**Fee 구조 (Phase 2)**:
```
Vault perf fee 15% of positive PnL
  70% → Primary engine
  15% → Secondary engines
  15% → Protocol treasury
    (50% → Buy-back & burn $COGO)
    (50% → Treasury ops)

Subscription: $49/mo (optional direct signal access)
  80% → Engine
  20% → Protocol
```

**Unit Economics (TVL $35M, 10% return, 500 subs)**:
```
Subscription revenue: $294k/yr
Perf fee (protocol): $78.75k/yr (gross)
Net 82% (after reserve/fees): $306k/yr
vs Operating cost $300k/yr → 102% cover
```

**Speaker notes**:
> "Revenue 이중 구조. Subscription은 엔진 성과 무관하게 나오는 base line. Perf fee는 엔진 성과 연동. 이 조합이 엔진 실패해도 protocol이 buffer 두는 이유.
> 
> TVL $35M이 sustainability threshold. v1 문서는 $20M이라 했는데 tax/reserve 빠졌었음. 실제 $35M이 정직한 숫자."

---

## Slide 10 — Roadmap

**Headline**: Month 6 L1, Month 12 L2, Month 15+ TGE

| Month | Milestone |
|-------|-----------|
| 3 | L1 MVP testnet |
| 6 | L1 mainnet, 500 subs, Cogochi live |
| 9 | L2 testnet, 2nd engine 유치 |
| 12 | L2 mainnet, TVL $3M |
| 15 | TGE (조건부), 3 engines |
| 18 | Series A, TVL $10M |
| 24 | TVL $30M, 10+ engines |

**TGE trigger (5-criteria)**:
- L2 TVL $5M+
- 3개월 revenue $10k/mo+
- 3+ engines live
- 2 audits complete
- Legal memo (US/KR)

**Speaker notes**:
> "타임라인 공격적이지만 conservative 가능한 지점에 kill criteria 설정. Month 6에 TVL $100k 미만이면 재검토. Month 12에 $1M 미만이면 피벗. TGE는 조건부, 5개 기준 모두 충족해야 함."

---

## Slide 11 — Token Design

**Headline**: veCOGO + buy-back flywheel

**Supply**: 1B $COGO

**Distribution**:
- Community 40% (airdrop 10 + LM 15 + rewards 15)
- Team 15% (4yr vest, 1yr cliff)
- Investors 18% (pre-seed 12 + seed 6)
- Treasury 15%
- Ecosystem 10%
- Public 2%

**4 Utilities**:
1. **Engine stake** (mandatory, 10k $COGO)
2. **veCOGO** (lock → perf fee rebate up to 50%)
3. **Fee buy-back & burn** (50% of protocol revenue)
4. **Governance** (parameters, slashing, treasury)

**Speaker notes**:
> "Community 40%는 Jupiter/Hyperliquid 표준. 인사이더 중심 distribution 아니다. veCOGO는 Curve 모델 응용 — 길게 lock할수록 rebate 큼. Buy-back flywheel이 token 가치 drive. 토큰은 TGE 조건부, Pre-seed/Seed investor는 warrant로 보호."

---

## Slide 12 — Team & Ask

**Headline**: 2명 현재, 5명 18개월 내, $1.5M pre-seed

**Current**:
- **Founder** — CEO/CTO/CPO. Cogochi 엔진 3년 빌드. 28-feature stack 설계.
- **Engineer** — [TBD / in hiring]

**Must-hire (post-seed, 3mo 내)**:
- Tech CTO (Solidity senior, ex-Uniswap/GMX preferred)
- Lead Backend (Python + Rust)
- Head of Growth (token + DeFi)

**Advisors (targeting)**:
- Audit firm veteran
- Hyperliquid ecosystem builder
- 크립토 규제 변호사
- Tokenomics designer (Delphi/Messari)

**Ask**:
- **$1.5M pre-seed** @ $8M post-money cap
- SAFE + token warrant (200% at TGE)
- 18mo runway
- Use: 60% team / 10% audit / 17% ops & legal / 13% marketing & buffer

**Speaker notes**:
> "2명 시작이 약점 맞다. 그래서 Must-hire 3명 명확히 공개. Raise $1.5M은 realistic budget 기반 — tax, audit, legal 모두 반영. v1에서 $750k는 부족. 크립토 VC는 token warrant로 exit path 보호됨."

---

## Slide 13 — Risks (선제 방어)

**Headline**: 솔직한 리스크 5개 — 우리 대응

| Risk | 대응 |
|------|------|
| Engine underperform | Subscription base line + multi-engine + kill switch |
| Hyperliquid 복제 | HyperEVM 선점 + multi-chain 전략 |
| 규제 (한국/미국) | Offshore + geofence + Reg S pathway |
| 2-인팀 역량 부족 | Must-hire 3명 명확, 시드 후 4인 |
| Cogochi 엔진 key-person | Engine operator open (3rd party 유입) → multi-engine |

**Speaker notes**:
> "VC 실사에서 나올 질문을 미리 답한다. 가장 큰 리스크는 엔진 failure. Subscription revenue가 base line 역할. Multi-engine 구조로 single point 제거. Key-person risk는 시간이 걸리는 문제라 솔직히 말한다."

---

## Slide 14 — Close

**Headline**: 카피트레이딩의 next wave는 marketplace다

**3-line recap**:
- DEX perp +346%, 카피 infra 재편 중
- Multi-engine marketplace가 single-source fragility 해결
- 3개월 L1 MVP → 12개월 L2 → 18개월 Series A

**Elevator pitch**:
> "크립토 카피트레이딩의 next wave는 인간 트레이더가 아니라 검증된 algorithm이다. Cogochi Protocol은 여러 quant 엔진이 stake 걸고 경쟁하는 decentralized marketplace. 엔진은 성과 나쁘면 slash되고, 성과 좋으면 vault TVL 증가. Cogochi 엔진이 첫 참가자이고, 3년 쌓인 28-feature stack이 있다. MVP는 3개월, L1 Engine Marketplace."

**Contact**: [email, telegram, twitter]

---

## Deck 제작 체크리스트

### 비주얼
- [ ] Figma/Gamma 14장 템플릿
- [ ] Cogochi 로고 확정
- [ ] 다크 팔레트 (crypto VC 친숙)
- [ ] Slide 5 3-layer 다이어그램
- [ ] Slide 7 commit-reveal timeline
- [ ] Slide 9 unit economics 차트
- [ ] Slide 11 token distribution pie

### 사전 리허설
- [ ] 20분 버전 스크립트
- [ ] 5분 엘리베이터 (Slide 1-4)
- [ ] Q&A 50개 예상 질문

### VC별 커스터마이즈
- **a16z crypto, Paradigm, Dragonfly**: Slide 7 (MEV), 8 (moat), 11 (tokenomics) 강조
- **1kx, Delphi, Variant**: L1 tech depth + ecosystem 전략
- **Korean VCs (Hashed, Signum)**: 시장 규모, 한국 규제 전략, GTM
- **Angels**: 팀 + vision + demo

---

## Q&A Top 12 (준비용)

1. **"엔진 live 성과 얼마나 있나?"** → [정직] "60일치, Sharpe X. 더 쌓이는 중."

2. **"Hyperliquid가 이 기능 해버리면?"** → "그들은 execution infra 집중. Marketplace는 아예 다른 layer. 해도 우리는 multi-chain."

3. **"Cogochi 엔진만 marketplace면 single engine과 뭐가 다름?"** → "Phase 1은 그렇다. Phase 1.5부터 3rd party open. Incentive (70% take)로 유치."

4. **"카피트레이딩 규제는?"** → "offshore 법인 + non-custodial + geofence + Reg S pathway. Legal memo 진행 중."

5. **"토큰 찍나?"** → "Conditional TGE, 5 criteria. SAFE에 warrant 포함해서 VC 보호."

6. **"왜 Solana 아님?"** → "팀 EVM 스킬셋 + 경쟁자 적음 + Arbitrum/HL 생태계 집중."

7. **"트레이더 리스크 없는데 왜 알고리즘 카피?"** → "트레이더 10-50% fee vs 우리 15%. Multi-engine redundancy. 24/7 no drift."

8. **"Cogochi 엔진 진짜 alpha 있나?"** → "Dune dashboard 공개, 숨길 수 없음. 실패하면 바로 드러남."

9. **"Bitget AI 카피 나오면?"** → "Black box bot vs feature-level transparency + on-chain verification. 다른 시장."

10. **"한국 유저 넣을 건가?"** → "Phase 1 베타 only. 본격 진입은 규제 스탠스 확정 후. 한국어 UI 없음."

11. **"Exit 전략?"** → "L3까지 Series A. Token 가치가 fee flywheel로 증가. Hyperliquid ecosystem top-3 marketplace 목표."

12. **"Engine 3rd party 못 모으면?"** → "Cogochi 내부에서 multiple engine variant로 시작. Multi-strategy 구조. Backup plan."

---

## Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-23 | Initial pitch (archived) |
| **2.0** | **2026-04-23** | **Marketplace 포지셔닝, commit-reveal slide 추가, token utility slide 추가, risks 확장** |

---

**End of Pitch Deck v2**
