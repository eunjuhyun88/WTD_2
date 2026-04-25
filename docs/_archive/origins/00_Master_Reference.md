# Cogochi Protocol — Master Reference Document

**Version**: 1.0
**Date**: 2026-04-25
**Status**: Internal master reference (합본)
**Sources**: Research Dossier (01) + Whitepaper v2 (03) + Indicator Viz Plan (app)

> 이 문서는 세 개의 문서를 하나로 합본한 내부 참조 문서다:
> - `01_Research_Dossier.md` — 시장/경쟁/규제/GTM 기반 리서치
> - `03_Whitepaper_Lite.md` — 프로토콜 기술 명세 (public-ready)
> - `indicator-viz-system-plan-2026-04-22.md` — 앱 프로덕트 서피스 구현 계획

---

## 목차

**Part I — 전략 & 시장**
1. Executive Summary
2. 시장 현황
3. 경쟁 분석
4. 문제 정의 (Problem-Solution Fit)
5. 규제 리서치
6. 시장 진입 전략 (GTM)
7. Open Questions

**Part II — 프로토콜 기술 명세**
8. Protocol Architecture Overview
9. Layer 1: Engine Marketplace
10. Layer 2: Router Vault
11. Layer 3: Vault Aggregator (Future)
12. Cogochi Engine (First Participant)
13. Commit-Reveal MEV Defense
14. Security & Audit Strategy
15. Governance & Decentralization Path
16. Roadmap

**Part III — 프로덕트 서피스**
17. Indicator Visualization System

**Part IV — 기술 부록**
18. Appendix A: Chainlink Oracle Integration
19. Appendix B: Engine Interface Specification & SDK
20. Appendix C: Router Vault Weight Algorithm
21. References & Sources

---

# Part I — 전략 & 시장

---

## 1. Executive Summary

**문제**: 카피트레이딩은 "트레이더의 과거 성과"에 베팅하는 구조다. 이 구조는 세 가지 근본적 결함이 있다.
1. 과거 성과 ≠ 미래 (대부분의 탑 트레이더는 평균회귀)
2. 트레이더는 잠수/사기/번아웃 리스크
3. 시그널 검증 불가능 (텔레그램 유료방 = 블랙박스)

**솔루션**: 시그널을 트레이더가 아니라 **검증된 알고리즘**에서 공급한다. Cogochi 패턴 엔진(LightGBM + 28-feature stack, 4-stage validation gate)이 이미 시그널을 만들고 있음. 이를 온체인에 publish → 검증 가능한 시그널 마켓플레이스 → (이후) Vault + 멀티엔진 생태계로 확장.

**왜 지금**: Perp DEX 2025 볼륨 $6.7T (+346% YoY). Hyperliquid가 perp DEX 73% 점유하면서 User Vault 구조 대중화. dHEDGE가 "Chamber"로 리브랜딩하며 Hyperliquid 기반 매니저 전략 시장 개척 중. 시장은 열렸고, 아직 **알고리즘 기반 시그널** 전용 프로토콜은 없음.

**핵심 가정**:
> **가정 A**: 재현 가능하고 검증 가능한 알고리즘 시그널은 인간 트레이더의 시그널보다 장기적으로 더 나은 risk-adjusted return을 제공할 수 있다.

> **가정 B**: 여러 엔진이 경쟁하는 marketplace 구조가 단일 엔진 구조보다 protocol-level sustainability가 높다.

**3-layer stack**:
- **Layer 1 Engine Marketplace** (MVP, 3개월): 온체인 시그널 발행 + 성과 검증 + Commit-Reveal MEV defense
- **Layer 2 Router Vault** (6개월+): ERC-4626 Vault가 멀티엔진 시그널을 aggregate, Hyperliquid 자동 실행
- **Layer 3 Vault Aggregator** (12개월+): 멀티볼트 risk-parity 포트폴리오, 기관 게이트웨이

**Non-Goals**:
- 새 Perp 엔진 빌드 안 함 (Hyperliquid / GMX 이용)
- 자체 L1 체인 안 함
- 한국 VASP 라이센스 직접 추진 안 함 (해외법인 + non-custodial 설계)
- AMM / 스테이킹 / 게임파이 기능 안 넣음

---

## 2. 시장 현황

### 2.1 전체 크립토 거래 시장

| 지표 | 2025 수치 | 출처 |
|------|----------|------|
| 전체 크립토 시총 (2025년말) | $3.0T (YoY -10.4%) | CoinGecko 2025 Annual Report |
| 평균 일일 거래량 (Q4 2025) | $161.8B | CoinGecko 2025 Annual Report |
| CEX perp 볼륨 (2025) | $86.2T (+47.4% YoY) | CoinGlass, CoinGecko |
| **DEX perp 볼륨 (2025)** | **$6.7T (+346% YoY)** | CoinGecko 2025 Annual Report |
| 전체 liquidation 2025 | ~$150B (10/10에만 $19B) | CoinGlass |

**해석**: DEX perp이 3.5배 성장. 이게 우리 playground다. CEX는 이미 Bitget이 지배, DEX는 아직 heterogeneous.

### 2.2 카피트레이딩 시장

**CEX side (벤치마크)**

| 지표 | Bitget | 출처 |
|------|--------|------|
| Copy trading followers (2025-07) | 1.1M | Bitget July 2025 Transparency Report |
| Net inflow to copy (월간) | $461.3M | Bitget July 2025 Report |
| Copy trading volume Q1 2025 | $9.2B (+36% QoQ) | CoinLaw Bitget Stats |
| 누적 successful trades | 100M+ | Bitget 공식 |

**주의**: Bitget 자체 공개 수치. 93% 수익률은 sponsored content라 믿지 말 것. 실제로는 "copy trading is risk transfer, not risk removal"이 진실 (Coin Bureau).

**Social trading 시장 TAM**:
- 2021: $2.2B / 2028 예상: $3.77B (CAGR 7.8%)

### 2.3 On-chain Copy / Vault 시장

| 프로토콜 | TVL | 모델 |
|---------|-----|------|
| Hyperliquid HLP | $300-400M (2025-10) | Protocol vault (MM) |
| Hyperliquid User Vaults | 공개 집계 없음 | 10% performance fee |
| dHEDGE (→ Chamber) | ~$40M (2025-H1) | ERC-20 vault tokens |
| Toros Finance (dHEDGE 계열) | ~$19M (2025-H1 말) | Leveraged tokens |
| Enzyme | ~$25M | Asset mgmt vaults |
| Perpy Finance | dead | GMX 위 vault |

**핵심 관찰**:
1. On-chain 카피/vault는 CEX 대비 **100배 작다** (TVL 총합 ~$500M vs CEX copy volume $37B/yr).
2. **dHEDGE가 "Chamber"로 리브랜딩하며 Hyperliquid로 이동 중**. 즉 시장이 Hyperliquid 중심으로 재편됨.
3. Perpy처럼 "GMX 위 카피 vault"는 대부분 모멘텀 잃음. 다음 웨이브 = Hyperliquid 기반.

### 2.4 Signal 마켓플레이스 (blank space)

**현재 존재하는 것**: 텔레그램 유료 시그널방 (검증 불가), TradingView idea (실행 없음), 3commas/Cryptohopper (봇, bring-your-own 키), Numerai (퀀트 토너먼트, 주식 중심)

**없는 것**:
- 온체인 타임스탬프된 크립토 시그널 레지스트리 + 자동 PnL 검증
- 검증된 시그널을 구독/실행하는 스마트컨트랙트 레이어
- **이게 우리 wedge.**

---

## 3. 경쟁 분석

### 3.1 Competitor Matrix

| 프로토콜 | 시그널 소스 | 실행 | 검증 방식 | 체인 | TVL/유저 | Moat |
|---------|-----------|------|----------|------|---------|------|
| **Bitget Copy** | 인간 트레이더 | CEX orderbook | 플랫폼 자체 집계 | 중앙화 | 1.1M follower | 유저베이스, UX |
| **Bybit / OKX Copy** | 인간 트레이더 | CEX | 플랫폼 집계 | 중앙화 | [~Bitget 30-50%] | 브랜드 |
| **Hyperliquid User Vault** | 인간 vault manager | 온체인 perp | On-chain PnL | Hyperliquid L1 | 집계 없음 | 실행 속도, CLOB |
| **dHEDGE/Chamber** | 매니저 (알고 가능) | 다체인 → HL | On-chain | Arb/Op/Base → HL | $40M | SDK, 다체인 |
| **Numerai** | 퀀트 (오프체인) | 중앙 집계 | 토너먼트 점수 | - | $200M+ AUM | 커뮤니티 |
| **Cogochi Protocol** | **알고리즘 (검증된 패턴 엔진)** | Hyperliquid perp | **백테스트 + on-chain PnL 양쪽** | Arb MVP → HL | 0 | **알고리즘 검증 엔진 + 28-feature stack** |

### 3.2 경쟁 요약

1. **CEX 카피는 유저는 많지만 알고리즘 시그널 공급자 없음** — 인간 트레이더만 올릴 수 있음.
2. **On-chain 카피/vault는 알고리즘도 가능하지만 "시그널 검증 인프라"는 없음** — 매니저가 뭘 돌리는지 불투명.
3. **우리 자리**: "검증된 알고리즘 시그널만 올리는 마켓플레이스 + 그걸 실행하는 vault". 경쟁자가 아직 안 잡은 슬롯.

### 3.3 주의할 경쟁 위험

- **Hyperliquid가 자체 기능으로 싸먹을 가능성**: HyperEVM에 우리가 먼저 올려서 alpha 확보, Cogochi 엔진은 proprietary.
- **Chamber(dHEDGE)가 비슷한 방향으로 올 가능성**: 그들은 매니저 중심 구조를 유지, 우리는 알고리즘 중심으로 명확한 포지셔닝 분리.
- **Bitget이 "AI 카피" 마케팅**: bot은 블랙박스. 우리는 feature-level transparency로 차별화.

---

## 4. 문제 정의 (Problem-Solution Fit)

### 4.1 현재 카피트레이딩의 3대 Broken Loop

```
[Broken Loop 1: 트레이더 의존]
유저가 탑 트레이더 follow → 트레이더 번아웃/잠수/운빨회귀 → 유저 손절 →
신뢰 감소 → 플랫폼 이탈

[Broken Loop 2: 검증 불가능한 시그널]
유료 시그널방 구독 → 주최자가 스크린샷 조작 가능 →
실제 PnL은 손실 → 환불 없음 → 시장 전체 신뢰 하락

[Broken Loop 3: 실행 마찰]
시그널 받음 → 수동으로 오더 넣음 → 슬리피지/늦은 진입 →
카피 품질 저하 → "카피트레이딩도 의미 없네"
```

### 4.2 Cogochi 솔루션 맵

| Problem | Cogochi Layer | 해결 방식 |
|---------|--------------|----------|
| 트레이더 잠수 | L1 Marketplace | 인간 대신 알고리즘 엔진이 24/7 시그널 생성 |
| 시그널 검증 불가 | L1 + Oracle | 발행 즉시 온체인 타임스탬프 + Chainlink/Pyth 가격으로 자동 PnL 계산 |
| 과거 성과≠미래 | Cogochi 엔진 내부 | 4-stage gate (백테스트 → walk-forward → paper → live), weight hill-climbing으로 지속 업데이트 |
| 실행 마찰 | L2 Router Vault (Phase 2) | ERC-4626 vault가 시그널 자동 실행 |
| MEV 프론트런닝 | Commit-Reveal | hash 먼저, 30초 후 reveal — vault가 MEV bot보다 먼저 실행 |
| 멀티엔진 단일장애 | Engine Marketplace | Stake/slash + 성과 기반 weighting → natural Darwinism |

### 4.3 체인 선택 근거

**Arbitrum (MVP)**:
- TVL $13.62B, L2 점유율 32.2% (2025-02)
- Gas 비용 ~$0.01-0.10 per 컨트랙트 호출
- Chainlink + Pyth full coverage
- 감사 생태계 성숙 (OpenZeppelin, Trail of Bits, Consensys Diligence)

**Hyperliquid (Phase 2+)**:
- Perp DEX 점유율 73% (2025-mid)
- 일일 거래량 $2-7B
- HyperEVM 2025 런칭, custom contract 가능
- Sub-second, 100k+ orders/sec

**Solana 제외**: Rust/Anchor 학습 비용 + EVM 코드베이스 이원화.

---

## 5. 규제 리서치

### 5.1 한국

**가상자산이용자보호법 (2024.7.19 시행)**:
- 적용 대상: 가상자산사업자 (VASP) — 거래소, 지갑사업자, 수탁업자.
- Cogochi L1 Signal Registry는 "정보 publish"만 함 → VASP 아님 가능 (투자자문/일임이 아닌 정보 제공)
- L2 Vault가 유저 자금을 받으면 → **유사수신/투자일임 해당 리스크**. 회색지대.
- **대응**: 해외법인(BVI, Cayman, Panama, Marshall Islands 중 택일) + 스마트컨트랙트 non-custodial 설계 + 한국 유저 접근 제한 고지.
- 법률검토 예산: $15-30k

### 5.2 미국

- SEC Howey Test: 시그널 구독은 "타인의 노력으로 이익" 요소 있어 증권성 논란 가능.
- 대응: US 유저 차단 (geofencing + KYC), 혹은 "DeFi protocol infrastructure only" 포지션.

### 5.3 싱가포르 / 두바이

- Singapore MAS: 우리 구조는 DPT trading 아님 → 라이센스 필요성 낮음 [법률검토 필요].
- Dubai VARA: 비교적 우호적. Cayman + Dubai 조합이 다수 크립토 프로젝트 선택.

### 5.4 3개월 내 MVP 구간 권고

- 법인설립 (BVI or Cayman, ~$5-10k)
- Terms of Service / Risk Disclosure (간단한 drafting, $5k 이하)
- 복잡한 라이센스는 시드 이후

---

## 6. 시장 진입 전략 (GTM)

### 6.1 초기 유저 획득

**Phase 1 타겟**: 크립토 네이티브 퀀트 유저 500명 (3개월 내 목표)

| Channel | 방법 |
|---------|------|
| Crypto Twitter | 퀀트/DeFi KOL에게 엔진 성과 트윗, 주 2-3회 |
| Discord 2개 | Hyperliquid, Arbitrum 커뮤니티 |
| Dune dashboard | 엔진 시그널 on-chain PnL 실시간 추적 (공개) |
| Medium / Mirror | "Why algorithmic copy trading", "Inside Cogochi engine", "Live signal examples" 심층 글 3편 |
| 한국 트레이더 커뮤니티 | 텔레그램 방 베타 시드 |

**왜 500명이 충분한가**: 500 follower × 평균 deposit $500 = $250k TVL → 투자자한테 "real usage" 증명 가능

### 6.2 GTM KPI (3개월)

| # | 지표 | 목표 | Kill criteria |
|---|------|------|---------------|
| K1 | On-chain 시그널 발행 수 | 500+ | < 100 |
| K2 | Unique wallet 구독자 | 300+ | < 50 |
| K3 | 엔진 실제 win rate (out-of-sample) | 55%+ | < 45% |
| K4 | Dune dashboard 조회수 | 5k/mo | < 500 |
| K5 | VC meeting → follow-up 전환율 | 30%+ | < 10% |

---

## 7. Open Questions

1. **Cogochi 엔진의 out-of-sample live 성과가 Phase 1에 충분히 쌓일까?**
   - Phase 1 런칭 시점에 60일 live 데이터 정도가 현실적. 이게 VC한테 설득될지가 관건.

2. **규제 완벽 회피 가능한가?**
   - 현재 가정: "L1은 정보 publish → 세이프, L2 이후는 법인 구조로 해결". 법률 자문 미완료.

3. **토큰 발행 여부 및 시점**
   - 시드 단계 결정 아님. Phase 2에서 필요성 판단. 토큰 없이 performance fee만으로 sustainability 가능한지가 1차 테스트.

4. **Third-party 엔진이 Phase 2에 정말 들어올까?**
   - 퀀트 탑 유저는 자기 알파를 public하게 올리지 않으려는 성향 강함. Incentive 설계 난이도 높음.

---

# Part II — 프로토콜 기술 명세

> *(Source: Whitepaper v2 — Public-ready technical document)*

---

## 8. Protocol Architecture Overview

### 8.1 3-Layer Stack

```
┌────────────────────────────────────────────────────────────┐
│ Layer 3: Vault Aggregator (Phase 4, 25mo+)                 │
│   - Multi-vault super aggregator                           │
│   - Risk-parity weighting across vaults                    │
│   - Institutional gateway (KYC/accredited)                 │
│   - Cross-chain execution                                  │
└──────────────────────────┬─────────────────────────────────┘
                           ↓ aggregates
┌────────────────────────────────────────────────────────────┐
│ Layer 2: Router Vault (Phase 2, 6-12mo)                    │
│   - ERC-4626 compliant                                     │
│   - Multi-engine signal aggregation                        │
│   - Hyperliquid execution (builder code)                   │
│   - Auto-rebalancing by performance                        │
│   - High-water mark, no mgmt fee                           │
└──────────────────────────┬─────────────────────────────────┘
                           ↓ subscribes to
┌────────────────────────────────────────────────────────────┐
│ Layer 1: Engine Marketplace (MVP, 3-6mo) ★                 │
│   - EngineRegistry: stake + metadata                       │
│   - SignalCommitReveal: MEV defense                        │
│   - PerformanceScoreboard: Sharpe/MDD/OOS                  │
│   - SlashingEngine: misbehavior enforcement                │
│   - SubscriptionPayment: optional direct access            │
└──────────────────────────┬─────────────────────────────────┘
                           ↓ populated by
┌────────────────────────────────────────────────────────────┐
│ Layer 0: Engines (Pluggable, off-chain)                    │
│   - Cogochi Engine (first participant, proprietary)        │
│   - Third-party engines (Phase 1.5+)                       │
│   - Common interface: signal attestation spec              │
└────────────────────────────────────────────────────────────┘
```

### 8.2 Value Flow

```
Subscriber Capital → Router Vault (L2)
                     ↓
                   Reads L1 Marketplace ranking
                     ↓
                   Weights engines by recent performance
                     ↓
                   Executes on Hyperliquid
                     ↓
                   Periodic settlement → HWM → Perf fee
                     ↓
         ┌───────────────┬──────────┐
         │               │          │
    Primary Engine   Secondary   Protocol
      (70%)            (15%)     (15%)
                                    ↓
                            50% Buy-back/Burn
                            50% Treasury
```

### 8.3 Design Principles

1. **Engine-agnostic**: Protocol은 어떤 엔진도 수용. Cogochi 엔진은 첫 참가자일 뿐.
2. **Non-custodial**: Protocol이 유저 자금 직접 관리 안 함. Smart contract만.
3. **Verifiable**: 모든 시그널, 성과, 수수료 배분 on-chain 확인 가능.
4. **MEV-resistant**: Commit-reveal로 frontrun 방지.
5. **Composable**: ERC-4626 준수. Vault token이 다른 DeFi와 통합 가능.
6. **Multi-chain ready**: Arbitrum MVP, Hyperliquid expansion, future multi-chain.

---

## 9. Layer 1: Engine Marketplace

### 9.1 Components

#### EngineRegistry

```solidity
contract EngineRegistry {
  struct Engine {
    address operator;        // who controls the engine
    bytes32 metadata;        // IPFS hash of engine description
    uint256 stakedAmount;    // $COGO (or USDC pre-TGE) locked
    uint256 registeredAt;    // timestamp
    EngineStatus status;     // Active / Paused / Slashed / Deactivated
  }

  mapping(bytes32 => Engine) public engines;  // engineId = hash(operator, salt)

  function registerEngine(bytes32 engineId, bytes32 metadata, uint256 stakeAmount) external;
  function pauseEngine(bytes32 engineId) external;  // operator-only
  function withdrawStake(bytes32 engineId) external;  // 28-day cooldown
}
```

- 엔진 등록 시 minimum stake: 10,000 $COGO / $5k USDC pre-TGE
- Unstaking 28-day cooldown period

#### SignalCommitReveal

```solidity
contract SignalCommitReveal {
  struct SignalCommit {
    bytes32 engineId;
    bytes32 commitHash;      // hash(asset, direction, entry, TP, SL, nonce)
    uint256 commitTime;
    uint256 revealDeadline;  // commitTime + 30 seconds
  }

  function commitSignal(bytes32 engineId, bytes32 commitHash) external;
  function revealSignal(bytes32 commitId, SignalReveal reveal) external;
  // On reveal: keccak256(reveal) == commitHash 검증
}
```

#### PerformanceScoreboard

```solidity
contract PerformanceScoreboard {
  struct Performance {
    uint256 totalSignals;
    uint256 hitSignals;       // TP reached
    uint256 missSignals;      // SL hit
    int256 cumulativePnL;     // in basis points
    uint256 rollingSharpe;    // 90-day rolling
    uint256 maxDrawdown;      // historical max DD
  }

  mapping(bytes32 => Performance) public engineStats;
}
```

#### SlashingEngine

| Offense | Slash % |
|---------|---------|
| False attestation | 50% |
| 30-day inactive | 10% |
| Malicious | 100% |
| 3+ critical misses | 25% |

**Slashed tokens**: 50% burn, 50% treasury.

#### SubscriptionPayment (optional direct access)

- Fee split: 80% engine, 20% protocol

### 9.2 Engine Performance Requirements (L2 inclusion)

| Metric | Minimum |
|--------|---------|
| Live performance history | 30 days |
| Number of signals | 50+ |
| Out-of-sample positive expectancy | Yes |
| 90-day rolling Sharpe | > 1.0 |
| Max drawdown | < 25% |
| Uptime (signal heartbeat) | > 95% |

### 9.3 Engine Onboarding Flow

```
Step 1: Engine operator develops strategy + 30-day paper trading
Step 2: Apply (metadata + performance proof, 7-day community review)
Step 3: Register on-chain (lock 10,000 $COGO / $5k USDC, receive engineId)
Step 4: Begin signal emission (commit-reveal 24/7)
Step 5: (After 30 days) Eligible for Router Vault — Sharpe > 1.0 → approved
Step 6: Ongoing — monthly performance review, weight adjustment
```

---

## 10. Layer 2: Router Vault

### 10.1 Core Concept

**Router Vault = Multi-engine ERC-4626 vault** that aggregates signals from L1 engines and executes on Hyperliquid.

### 10.2 Vault Mechanics

**Deposit → shares → pro-rata ownership → position execution → withdrawal → perf fee**

### 10.3 Engine Weighting Algorithm

**Phase 2 default (Sharpe-based)**:
```
weight[engine] = max(0, Sharpe_i) / Σ max(0, Sharpe_j)
min(weight[engine], 0.40)  # 40% cap
Re-normalized weekly (Monday 00:00 UTC)
```

**Phase 2.5+ (Risk-Parity)**: Equal risk contribution via covariance optimization (see Appendix C).

### 10.4 Fee Structure

| Component | Rate |
|-----------|------|
| Entry fee | 0% |
| Exit fee | 0% |
| Management fee | 0% |
| Performance fee | 15% of positive PnL |

**Performance fee split**: 70% Primary engine / 15% Secondary engines / 15% Protocol treasury

**High-Water Mark**: User별 개별 HWM 추적. Share price가 HWM 초과 시에만 fee 청구.

### 10.5 Risk Controls

- Max TVL per vault: $5M (Phase 2 초기)
- Max position size per signal: 10% of vault
- Max leverage: 3x (Hyperliquid isolated margin)
- Circuit breaker: 5% vault daily loss → pause
- Max weight per engine: 40%
- Engine inactive 7일+ → weight = 0

---

## 11. Layer 3: Vault Aggregator (Future)

**Phase 4 (Month 25+)**. Multi-vault super aggregator.

**Target use cases**: Crypto hedge funds, family offices, DAOs (treasury diversification), regulated funds.

**Features**: Risk-parity across vaults, institutional KYC gateway, cross-chain (Arbitrum + Hyperliquid + Base).

---

## 12. Cogochi Engine (First Marketplace Participant)

### 12.1 Engine Architecture

```
┌──────────────────────────────────────────────┐
│ Data Layer (multi-source)                    │
│  - Spot: Binance WebSocket OHLCV/CVD         │
│  - Futures: OI, funding, L/S (Binance, Coinalyze) │
│  - On-chain: Whale flows (Surf AI API)       │
└────────────────┬─────────────────────────────┘
                 ↓
┌──────────────────────────────────────────────┐
│ Feature Engineering: 28-feature vector       │
└────────────────┬─────────────────────────────┘
                 ↓
┌──────────────────────────────────────────────┐
│ Signal Generation                            │
│  - LightGBM P(win) prediction                │
│  - 29 pattern building blocks                │
│  - 4-stage validation gate                   │
└────────────────┬─────────────────────────────┘
                 ↓
┌──────────────────────────────────────────────┐
│ Auto-Learning Loop                           │
│  - Hill Climbing weight optimization          │
│  - KTO fine-tuning (Phase B)                 │
│  - Feedback-driven refinement                │
└────────────────┬─────────────────────────────┘
                 ↓ commits to L1 marketplace
```

### 12.2 4-Stage Validation Gate

| Stage | Test | Pass Criteria |
|-------|------|---------------|
| 1. Backtest | 6-year historical data | Expectancy > 0, MDD < 20%, PF > 1.2 |
| 2. Walk-forward | 72-month OOS | 75% of quarters positive |
| 3. Paper trade | 30일 real-time | Actual vs backtest diff < 30% |
| 4. Live small | 60일 with minimal capital | Net PnL > 0 (after fees) |

**Only Stage-4-passed patterns emit on-chain signals.**

### 12.3 Honest Assessment

**Strengths**: Reproducible, explainable (feature-level transparency), self-improving (Hill Climbing).

**Weaknesses**: Regime change susceptible (LightGBM 한계), live track record 짧음 (pre-MVP), Binance 중심.

**Planned mitigations**: Regime filter 레이어 (Phase 1.5), Hyperliquid universe 직접 indexing (Phase 2), API 다중화 (Glassnode 백업).

---

## 13. Commit-Reveal MEV Defense

### 13.1 Problem

Plain signal publish 시: MEV bot이 mempool에서 signal sniff → bot이 먼저 entry → vault bag holds. **추정 영향: vault 성과 20-40% 저하.**

### 13.2 Solution

```
t=0      Engine computes signal: (BTC, long, entry=50000, TP=2%, SL=1%)
         Engine commits: hash(signal || nonce) → on-chain
         [mempool: hash only, content hidden]

t=0+15s  Engine reveals: (signal, nonce)
         Contract verifies: keccak256(signal || nonce) == committed_hash

t=0+15~20s  Vault executes on Hyperliquid
            (ahead of MEV bot's catch-up window)

t=0+35s  MEV bot potentially sees plain signal — vault has already executed
```

### 13.3 Why 30-second window

- 짧으면 vault 준비 불충분 (RPC latency, gas estimation)
- 길면 MEV bot이 reveal 후 catch-up 가능
- 30초가 empirical sweet spot [Phase 1 tunable]

### 13.4 Phase 2 추가 방어

- TEE (trusted execution environment) 기반 signal computation
- zk-SNARK 기반 proof of valid signal without revealing

---

## 14. Security & Audit Strategy

### 14.1 Audit Plan

**Audit 1 (Month 3, pre-mainnet)**:
- Scope: L1 contracts (EngineRegistry, SignalCommitReveal, Performance, Slashing, Subscription)
- Auditor candidates: OpenZeppelin, Consensys Diligence, Trail of Bits
- Budget: $60k / Duration: 4-6 weeks

**Audit 2 (Month 9, pre-L2 mainnet)**:
- Scope: L2 Router Vault + Hyperliquid integration
- Budget: $90k / Duration: 6-8 weeks

### 14.2 Additional Measures

- **Bug bounty**: Immunefi 또는 Code4rena, budget $50k
- **Formal verification**: Critical functions (deposit, withdraw, slash) Certora 검증 [optional, Phase 2]
- **Timelock**: Admin functions 2-day timelock
- **Multi-sig**: Treasury 4/7 multi-sig (pre-DAO)
- **Emergency pause**: Circuit breaker, governance-trigger

### 14.3 Risk Caps

- Max TVL per vault: $5M (gradually raised post-audit)
- Max total protocol TVL: $50M (Phase 2)
- Emergency pause threshold: 5% vault daily loss OR 15% weekly

---

## 15. Governance & Decentralization Path

| Phase | Timeline | Structure |
|-------|---------|-----------|
| **A: Team governance** | Month 0-6 | Core team multi-sig (4/7), no token, no DAO |
| **B: Hybrid** | Month 6-12 (post-TGE) | Token holders vote on parameters, core team retains emergency pause |
| **C: Full DAO** | Month 12+ | veCOGO-based voting, core team reduces to 2/7 (emergency only) |

**Governable (Phase B-C)**: Protocol fee rate, engine fee split, engine min stake, buy-back %, slashing severity, treasury allocation, new chain deployment.

**NOT governable**: Smart contract logic changes, user fund access.

---

## 16. Roadmap

| Phase | Timeline | Milestone | Success Criteria |
|-------|---------|-----------|----------------|
| **1: Engine Marketplace MVP** | Month 1-6 | L1 contracts + Arbitrum mainnet | 500+ signals, 300+ subscribers, OOS Sharpe > 1.0 |
| **2: Router Vault** | Month 7-12 | L2 vault + 2nd engine | TVL $3M, 3 engines, revenue $30k/mo |
| **3: Token + Scale** | Month 13-24 | TGE (조건 충족 시) + Series A | TVL $30M, 10+ engines, multi-chain |
| **4: Aggregator + Institutional** | Month 25-36 | Vault Aggregator (L3) + regulated jurisdictions | Institutional AUM $100M+ |

---

# Part III — 프로덕트 서피스

---

## 17. Indicator Visualization System

> *(Source: indicator-viz-system-plan-2026-04-22.md — App implementation plan)*

### 17.1 Context & Motivation

Cogochi 앱의 indicator visualization 시스템(W-0123)의 완전 수리 + C/D 레이아웃 병합.

현재 상태:
- Archetype G/H/I/J 컴포넌트 없음
- AI 탭 인디케이터 검색 미연결
- Sub-pane 시스템이 `<slot>` 플레이스홀더만 있음
- 레이아웃 탭 C SIDEBAR와 D PEEK가 중복 역할 → 하나로 합쳐야 함

### 17.2 우선순위 실행 순서

```
P1 → C+D 레이아웃 병합       (즉시 보이는 UX 개선)
P2 → AI 탭 인디케이터 검색   (가장 자주 클릭되는 broken 기능)
P3 → 인디케이터 토글 UI      (pill 클릭으로 on/off)
P4 → G/H/I/J archetype       (타입 확장 + 4개 컴포넌트)
P5 → Mobile 반응형 보완      (sidebar → peek 자동 전환)
```

### 17.3 P1: C+D 레이아웃 병합 (4탭 → 3탭)

**의도**:
- 현재: A STACK | B DRAWER | C SIDEBAR | D PEEK (new)
- 변경: A STACK | B DRAWER | C (sidebar + peek 통합)
- C = 차트 왼쪽 + 우측 사이드바 + 하단 PEEK bar
- 모바일(≤860px)에서는 사이드바 자동 숨김, peek만 표시

**변경 파일**:
- `app/src/lib/cogochi/shell.store.ts` — `layoutMode: 'A' | 'B' | 'C'` (D 제거), 기본값 `'C'`
- `app/src/lib/cogochi/AppShell.svelte` — 모바일 기본값 `'D'→'C'`
- `app/src/lib/cogochi/modes/TradeMode.svelte` — C+D 블록 병합, 레이아웃 strip 3개, CSS

### 17.4 P2: AI 탭 인디케이터 검색 연결

**의도**: "funding 보여줘" → AIPanel이 intent 감지 → 해당 indicator pill 강조 + 자동 활성화

**새 파일**: `app/src/lib/indicators/search.ts` — 28개 인디케이터 키워드 매핑 (한국어/영어)

**연동**: `AIPanel.svelte`의 `convertPromptToSetup()`에서 `searchIndicators(prompt)` 호출 → `dispatch('focus_indicator', { ids })` → TradeMode에서 해당 pill scrollIntoView + 2초 pulse 클래스

### 17.5 P3: 인디케이터 토글 pill UI

**상태**: 현재 OI/Funding/CVD 3개만 하드코딩. 나머지 15개 인디케이터는 토글 불가.

**변경**:
- `shell.store.ts`에 `visibleIndicators: string[]` 필드 추가
- `+ 더보기` 버튼 → `IndicatorSettingsSheet.svelte` (새 바텀시트 컴포넌트)
- Sheet에서 registry 기반 전체 인디케이터 toggle

### 17.6 P4: Archetype G/H/I/J 4개 컴포넌트

| Archetype | Component | 시각화 스타일 |
|-----------|-----------|-------------|
| **G** | `IndicatorCurve.svelte` | Term-Structure Curve (Laevitas IV tenor 스타일) |
| **H** | `IndicatorSankey.svelte` | Flow Sankey (Arkham netflow 스타일) |
| **I** | `IndicatorHistogram.svelte` | Distribution Histogram (Coinglass OI-by-strike 스타일) |
| **J** | `IndicatorTimeline.svelte` | Event Timeline (Arkham activity feed 스타일) |

### 17.7 P5: Mobile 반응형 보완

- C 레이아웃에서 `@media (max-width: 860px) { .lc-sidebar { display: none } }`
- IndicatorPane layout prop을 mobile에서 `'stack'`으로 강제

### 17.8 변경 파일 목록

| 파일 | 변경 규모 | 내용 |
|---|---|---|
| `app/src/lib/cogochi/shell.store.ts` | 소 | layoutMode 타입 + 기본값 + visibleIndicators 필드 |
| `app/src/lib/cogochi/AppShell.svelte` | 미세 | 모바일 기본 'D'→'C' |
| `app/src/lib/cogochi/modes/TradeMode.svelte` | 대 | C+D 블록 병합, 레이아웃 strip, CSS |
| `app/src/lib/indicators/types.ts` | 미세 | archetype 타입 G-J 추가 |
| `app/src/lib/indicators/registry.ts` | 소 | 7개 미등록 인디케이터 추가 |
| `app/src/lib/indicators/search.ts` | 신규 | fuzzy search 함수 |
| `app/src/lib/components/indicators/IndicatorRenderer.svelte` | 소 | G-J 케이스 추가 |
| `app/src/lib/components/indicators/IndicatorCurve.svelte` | 신규 | G archetype |
| `app/src/lib/components/indicators/IndicatorSankey.svelte` | 신규 | H archetype |
| `app/src/lib/components/indicators/IndicatorHistogram.svelte` | 신규 | I archetype |
| `app/src/lib/components/indicators/IndicatorTimeline.svelte` | 신규 | J archetype |
| `app/src/lib/components/indicators/IndicatorSettingsSheet.svelte` | 신규 | 토글 sheet |
| `app/src/lib/cogochi/AIPanel.svelte` | 소 | searchIndicators 연결 |

### 17.9 Non-Goals (이번 범위 밖)

- Drag-to-reorder panes → W-0124
- Workspace presets → W-0125
- 실 데이터 (Deribit IV tenor, Arkham flow) → W-0122 Phase 4
- G/H/I/J를 실제 데이터에 연결 (이번엔 mock/stub 데이터로만 렌더 확인)

---

# Part IV — 기술 부록

---

## 18. Appendix A: Chainlink Oracle Integration

### A.1 Oracle 선택

| Oracle | Arbitrum coverage | Latency | Cost | Decentralization |
|--------|-------------------|---------|------|------------------|
| **Chainlink** | 넓음 (BTC/ETH/SOL 등 20+) | ~15min | 무료 (reader) | 높음 |
| Pyth Network | 중간 | <1sec (push) | 무료 | 중간 |
| Redstone | 좁음 | on-demand | 무료 | 중간 |

**선택**: Chainlink primary + Pyth fallback (Phase 2)

### A.2 ChainlinkOracleConsumer 컨트랙트

```solidity
contract ChainlinkOracleConsumer {
    mapping(string => address) public priceFeeds;
    uint256 public constant MAX_STALENESS = 1 hours;

    function getPrice(string calldata asset) external view returns (uint256) {
        address feed = priceFeeds[asset];
        require(feed != address(0), "unsupported asset");
        (, int256 answer, , uint256 updatedAt, ) =
            IChainlinkPriceFeed(feed).latestRoundData();
        require(answer > 0, "invalid price");
        require(block.timestamp - updatedAt <= MAX_STALENESS, "stale price");
        uint8 dec = IChainlinkPriceFeed(feed).decimals();
        return uint256(answer) * 10**(18 - dec);
    }
}
```

**Signal lifecycle oracle 역할**:
- Reveal 시점: `entryPrice` 기록
- Outcome resolution 시점: `currentPrice` 조회 → TP/SL/timeout 판정

### A.3 실패 모드 & 방어

| 실패 | 방어 |
|------|------|
| Oracle staleness (>1h) | `require(updatedAt > block.timestamp - 1 hours)` revert + Pyth fallback |
| Oracle manipulation | Chainlink multiple node aggregation + 15분 괴리 > 3% flag |
| Asset delisting | Governance가 해당 asset signal 중단 |

**Cost analysis**: 500 signals/mo × 2 oracle reads ≈ **$1/month** on Arbitrum.

---

## 19. Appendix B: Engine Interface Specification & SDK

### B.1 Signal Format Spec (v1)

```python
@dataclass
class CogochiSignal:
    engine_id: bytes          # 32-byte engine identifier
    asset: str                # "BTC", "ETH", "SOL" (Chainlink-supported)
    direction: bool           # True = long, False = short
    tp_bps: int               # Take profit in basis points
    sl_bps: int               # Stop loss in basis points
    valid_until: int          # Unix timestamp

    # Optional metadata (off-chain)
    confidence: float         # 0.0-1.0
    strategy_tag: str         # "momentum", "mean_reversion", etc.
    feature_snapshot: dict    # engine's internal features at signal time
```

### B.2 Cogochi Engine SDK (Python)

```python
from cogochi_sdk import CogochiEngine, CogochiSignal

class MyCustomEngine:
    async def generate_signal(self) -> Optional[CogochiSignal]:
        """Your strategy here"""
        if self._should_long_btc():
            return CogochiSignal(
                asset="BTC", direction=True, tp_bps=300, sl_bps=150,
                valid_until=int(time.time()) + 3600, confidence=0.72
            )
        return None

    async def run(self):
        while True:
            if self.engine.time_since_last_heartbeat() > 23 * 3600:
                await self.engine.send_heartbeat()
            signal = await self.generate_signal()
            if signal:
                result = await self.engine.publish(signal)  # auto commit-reveal
            await asyncio.sleep(300)  # 5 min cycle
```

**SDK 주요 기능**: Auto commit-reveal (단일 호출), nonce 관리, gas estimation + retry, heartbeat automation, performance tracking, slashing detection.

### B.3 Engine Grant Program

| Tier | Criteria | Grant |
|------|----------|-------|
| Tier 1 | Sharpe > 1.5, MDD < 15% | 2,000,000 $COGO over 12 months |
| Tier 2 | Sharpe 1.0-1.5 | 800,000 $COGO over 12 months |
| Tier 3 | Sharpe 0.5-1.0 | 200,000 $COGO over 6 months |

Grant vested monthly based on continued performance. Slashing → full grant clawback.

---

## 20. Appendix C: Router Vault Weight Algorithm

### C.1 Sharpe-based Weighting (Phase 2 default)

```python
def compute_sharpe_weights(
    engine_returns: Dict[bytes, List[float]],
    max_weight: float = 0.40,
    min_sharpe: float = 0.5,
    min_signals: int = 30,
) -> Dict[bytes, float]:
    """Compute vault weights based on 90-day Sharpe ratio."""
    sharpes = {}
    for eid, returns in engine_returns.items():
        if len(returns) < min_signals:
            sharpes[eid] = 0; continue
        arr = np.array(returns) / 10000  # bps to decimal
        mu, sigma = np.mean(arr), np.std(arr)
        if sigma == 0: sharpes[eid] = 0; continue
        sharpe = (mu / sigma) * np.sqrt(252)
        sharpes[eid] = max(0, sharpe) if sharpe >= min_sharpe else 0

    total = sum(sharpes.values())
    if total == 0: return {eid: 0 for eid in engine_returns}

    weights = {eid: min(s / total, max_weight) for eid, s in sharpes.items()}
    total = sum(weights.values())
    return {eid: w / total for eid, w in weights.items()}
```

### C.2 Risk-Parity Weighting (Phase 2.5+)

**목표**: 각 엔진의 risk contribution을 균등화 (RC_1 = RC_2 = ... = σ_portfolio / n)

```python
from scipy.optimize import minimize

def compute_risk_parity_weights(engine_returns, max_weight=0.40, min_signals=30):
    """Risk-parity weighting via scipy optimization."""
    qualified = {eid: rets for eid, rets in engine_returns.items() if len(rets) >= min_signals}
    if len(qualified) < 2:
        return {eid: 1/len(qualified) for eid in qualified}

    eids = list(qualified.keys())
    returns_matrix = np.array([qualified[eid] for eid in eids]) / 10000
    cov = np.cov(returns_matrix)

    def objective(w):
        pv = w @ cov @ w
        if pv == 0: return float('inf')
        rc = w * (cov @ w) / np.sqrt(pv)
        return np.sum((rc - 1.0/len(w))**2)

    n = len(eids)
    result = minimize(
        objective, [1/n]*n, method='SLSQP',
        bounds=[(0.0, max_weight)] * n,
        constraints=[{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    )
    if not result.success:
        return {eid: 1/n for eid in eids}
    return {eid: float(w) for eid, w in zip(eids, result.x)}
```

### C.3 Weight Update Rules

- **Frequency**: Weekly (Monday 00:00 UTC)
- **Threshold**: Weight change < 5% → skip update (reduce churn)
- **Alert**: Weight change > 20% → emergency review before apply

### C.4 Edge Cases

| Case | Handling |
|------|----------|
| N < 2 engines | 1 engine → 100% weight; 0 engines → vault suspended |
| All engines negative Sharpe | Vault cash-only, alert governance |
| New engine warm-up | First 30-60일 weight cap 10%, then full algorithm |
| Engine being slashed | Immediately weight = 0 (no waiting for weekly rebalance) |

---

## 21. References & Sources

### Protocol Sources
[1] CoinGecko. "2025 Annual Crypto Industry Report." 2026-01-15.
[2] 0xian. "Understanding Hyperliquid's HLP Vault." 2025-10-16.
[3] dHEDGE. "dHEDGE 2025 Update (H1)." 2025-07-29.
[4] TradingView/Cointelegraph. "Crypto derivatives volume explode to $86T in 2025." 2025-12-25.
[5] Bitget. "July 2025 Transparency Report." 2025-08-18.
[6] CoinLaw. "Bitget Statistics 2026." 2025-09-05.
[7] BitMEX Blog. "What is Hyperliquid? The Complete 2026 Guide." 2026-02-05.
[8] Chainlink Price Feeds Documentation. https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum
[9] ERC-4626 Tokenized Vault Standard.
[10] Pyth Network Documentation.
[11] Qian, E. "Risk Parity Portfolios" (2005).
[12] Sharpe, W. "Capital Asset Prices" (1964).

### Regulatory Sources
[13] 금융위원회. "7.19일부터 가상자산이용자보호법 시행." 2024-07.
[14] 김·장 법률사무소. "가상자산 이용자 보호 등에 관한 법률안의 주요 내용."

### Internal Sources
[15] Cogochi internal project files (WTD_Cogochi_Final_Design_v1.md, cogochi-unified-design.md, 06_autoresearch_ml.md, core-loop.md). Private, as of 2026-04-11.

---

## Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-25 | Initial merge: Research Dossier (01) + Whitepaper v2 (03) + Indicator Viz Plan |

---

**End of Master Reference Document**
