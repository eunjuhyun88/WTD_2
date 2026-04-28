# Cogochi Protocol — Whitepaper v2

**Version**: 2.0
**Date**: 2026-04-23
**Status**: Public-ready technical document
**Authors**: Cogochi team

> **Abstract** — Cogochi Protocol은 검증된 알고리즘 트레이딩 엔진이 시그널을 공급하고, 사용자가 이를 on-chain vault로 자동 실행하는 3-layer marketplace protocol이다. Layer 1 (Engine Marketplace)는 여러 엔진이 stake 걸고 참여하는 경쟁 시장으로, commit-reveal을 통해 MEV 노출을 방어하고 on-chain PnL로 성과를 검증한다. Layer 2 (Router Vault)는 ERC-4626 vault가 여러 엔진 시그널을 aggregate해 Hyperliquid에서 실행한다. Layer 3 (Aggregator)는 multiple vault를 risk-parity로 묶은 institutional gateway다. 첫 배포는 Arbitrum, Phase 2 이후 Hyperliquid 확장.

---

## Table of Contents

1. Motivation
2. Protocol Architecture Overview
3. Layer 1: Engine Marketplace
4. Layer 2: Router Vault
5. Layer 3: Vault Aggregator (Future)
6. Cogochi Engine (First Marketplace Participant)
7. Commit-Reveal MEV Defense
8. Security & Audit Strategy
9. Governance & Decentralization Path
10. Roadmap
11. Non-Goals
12. References

---

## 1. Motivation

### 1.1 기존 카피트레이딩의 구조적 한계

현재 카피트레이딩 (Bitget, Hyperliquid user vault, dHEDGE/Chamber, Perpy 등)은 세 가지 구조적 제약을 공유한다:

**제약 1. Trader-centric signal sourcing**
모든 시그널은 인간 트레이더에서 비롯된다. 트레이더는 번아웃, 잠수, 시장 regime 적응 실패에 노출된다. 과거 6개월 탑 퍼포머가 다음 6개월 탑 퍼포머일 확률은 통계적으로 유의미하게 낮다.

**제약 2. Opaque signal verification**
오프체인 시그널(텔레그램 방)은 PnL 조작 자유. 온체인 vault조차 strategy 실행 결과만 보이지 decision process는 블랙박스.

**제약 3. Single-source fragility**
기존 protocol은 매니저/트레이더 개인에 crit 의존. 매니저 이탈 시 vault 붕괴. 다변화된 시그널 소스 구조 없음.

### 1.2 Cogochi의 두 가지 핵심 가정

> **가정 A**: 재현 가능하고 검증 가능한 알고리즘 시그널은 인간 트레이더의 시그널보다 장기적으로 더 나은 risk-adjusted return을 제공할 수 있다.

> **가정 B**: 여러 엔진이 경쟁하는 marketplace 구조가 단일 엔진 구조보다 protocol-level sustainability가 높다.

가정 A가 참이면 "algorithmic signals, on-chain verified"가 카피트레이딩 next wave다.
가정 B가 참이면 protocol은 single-engine failure에 robust해진다.

**가정 검증 방식**: Phase 1에서 Cogochi 엔진 1개로 가정 A를 증명. Phase 2에서 3+ engines로 가정 B를 증명.

### 1.3 왜 Marketplace인가 (Registry 아닌 이유)

v1에서는 "Signal Registry" (passive storage)로 설계했으나 이는 protocol revenue 메커니즘 없이 기능에 그쳤다. v2에서는 **Marketplace** (active matching + staking + curation)로 재설계.

Marketplace의 이점:
- 여러 엔진 간 경쟁 → 성과 기반 ranking → natural Darwinism
- Stake/slash 메커니즘 → 품질 보장
- Protocol이 value capture (matching + curation 비용)
- Network effect 생성 (더 많은 엔진 ↔ 더 많은 구독자)

---

## 2. Protocol Architecture Overview

### 2.1 3-Layer Stack

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

### 2.2 Value Flow

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

### 2.3 Design Principles

1. **Engine-agnostic**: Protocol은 어떤 엔진도 수용. Cogochi 엔진은 첫 참가자일 뿐.
2. **Non-custodial**: Protocol이 유저 자금 직접 관리 안 함. Smart contract만.
3. **Verifiable**: 모든 시그널, 성과, 수수료 배분 on-chain 확인 가능.
4. **MEV-resistant**: Commit-reveal로 frontrun 방지.
5. **Composable**: ERC-4626 준수. Vault token이 다른 DeFi와 통합 가능.
6. **Multi-chain ready**: Arbitrum MVP, Hyperliquid expansion, future multi-chain.

---

## 3. Layer 1: Engine Marketplace

### 3.1 Components

#### 3.1.1 EngineRegistry

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
  
  function registerEngine(
    bytes32 engineId,
    bytes32 metadata,
    uint256 stakeAmount
  ) external;
  
  function pauseEngine(bytes32 engineId) external;  // operator-only
  function withdrawStake(bytes32 engineId) external;  // 28-day cooldown
}
```

**Functions**:
- 엔진 등록 시 minimum stake (10,000 $COGO / $5k USDC pre-TGE)
- Metadata는 IPFS hash로 off-chain 설명 (풀링 프라이버시 유지)
- Unstaking 28-day cooldown period

#### 3.1.2 SignalCommitReveal

```solidity
contract SignalCommitReveal {
  struct SignalCommit {
    bytes32 engineId;
    bytes32 commitHash;      // hash(asset, direction, entry, TP, SL, nonce)
    uint256 commitTime;
    uint256 revealDeadline;  // commitTime + 30 seconds
  }
  
  struct SignalReveal {
    bytes32 commitId;
    string asset;
    bool direction;          // true = long
    uint256 entryPrice;
    uint256 tp;              // take profit %
    uint256 sl;              // stop loss %
    uint256 nonce;
    uint256 revealTime;
  }
  
  function commitSignal(bytes32 engineId, bytes32 commitHash) external;
  function revealSignal(bytes32 commitId, SignalReveal reveal) external;
  
  // On reveal, auto-verify: keccak256(reveal) == commitHash
}
```

**MEV defense**:
1. Engine publishes hash of signal (commit phase, content hidden)
2. Subscribers / Vaults detect commit, prepare execution
3. Engine reveals (plain signal) within 30-sec window
4. Reveal verified on-chain (hash match)
5. Vaults execute within next block

**Why 30-sec window?**:
- Short enough: MEV bots can't build up significant position in 30s
- Long enough: Vault infrastructure has time to prepare

#### 3.1.3 PerformanceScoreboard

```solidity
contract PerformanceScoreboard {
  struct Performance {
    uint256 totalSignals;
    uint256 hitSignals;       // TP reached
    uint256 missSignals;      // SL hit
    int256 cumulativePnL;     // in basis points
    uint256 lastUpdate;
    uint256 rollingSharpe;    // 90-day rolling
    uint256 maxDrawdown;      // historical max DD
  }
  
  mapping(bytes32 => Performance) public engineStats;
  
  function updatePerformance(
    bytes32 engineId,
    bytes32 signalId
  ) external;  // callable by anyone after signal expiry
}
```

**Performance computation**:
- Chainlink oracle에서 signal expiry 시 가격 조회
- Signal의 TP/SL/timeout 기준 outcome 결정
- PnL 누적 기록
- Rolling Sharpe (90-day) 자동 계산

#### 3.1.4 SlashingEngine

```solidity
contract SlashingEngine {
  enum Offense { FalseAttestation, Inactive30d, Malicious, CriticalMiss }
  
  function reportOffense(
    bytes32 engineId,
    Offense offense,
    bytes proof
  ) external;
  
  function executeSlash(
    bytes32 engineId,
    uint256 slashAmount
  ) external onlyGovernance;
}
```

**Slash percentages**: (from Tokenomics v2)

| Offense | Slash % |
|---------|---------|
| False attestation | 50% |
| 30-day inactive | 10% |
| Malicious | 100% |
| 3+ critical misses | 25% |

**Slashed tokens**: 50% burn, 50% treasury.

#### 3.1.5 SubscriptionPayment (optional)

```solidity
contract SubscriptionPayment {
  struct Subscription {
    address subscriber;
    bytes32 engineId;
    uint256 expiresAt;
    uint256 paidUSDC;
  }
  
  function subscribe(
    bytes32 engineId,
    uint256 months,
    uint256 amountUSDC
  ) external;
  
  // Fee split: 80% to engine, 20% to protocol
}
```

**Optional direct access** to engine signals (vault-mediated 아님).

### 3.2 Engine Onboarding Flow

```
Step 1: Engine operator prepares engine
  - Develops signal generation logic
  - Prepares metadata (IPFS)
  - Acquires $COGO (or USDC pre-TGE)

Step 2: Register on EngineRegistry
  - Lock 10,000 $COGO stake
  - Submit metadata
  - Receive engineId

Step 3: Begin signal emission
  - Commit-reveal cycle
  - Build performance history

Step 4: (After 30 days) Eligible for Router Vault inclusion
  - Protocol governance reviews performance
  - If Sharpe > 1.0 and OOS > 30 days, approved

Step 5: Earn fees
  - Vault perf fee revenue
  - Direct subscription (optional)
```

### 3.3 Engine Performance Requirements (for L2 inclusion)

| Metric | Minimum |
|--------|---------|
| Live performance history | 30 days |
| Number of signals | 50+ |
| Out-of-sample positive expectancy | Yes |
| 90-day rolling Sharpe | > 1.0 |
| Max drawdown | < 25% |
| Uptime (signal heartbeat) | > 95% |

---

## 4. Layer 2: Router Vault

### 4.1 Core Concept

**Router Vault = Multi-engine ERC-4626 vault** that aggregates signals from multiple L1 engines and executes on Hyperliquid.

```solidity
contract RouterVault is ERC4626 {
  struct EngineAllocation {
    bytes32 engineId;
    uint256 weight;          // basis points, sum = 10000
    uint256 lastRebalance;
  }
  
  EngineAllocation[] public engines;
  
  function deposit(uint256 assets, address receiver) 
    external returns (uint256 shares);
  
  function executeSignal(bytes32 signalId) external;
  function rebalance() external;  // weekly, gov-permissioned
}
```

### 4.2 Vault Mechanics

**Deposit flow**:
1. User deposits USDC
2. Receives vault shares (ERC-20, transferable)
3. Shares represent pro-rata ownership

**Execution flow**:
1. Engine commits signal (L1)
2. Engine reveals signal (L1)
3. Vault reads reveal
4. Vault computes allocation: weight[engine] × vault_balance
5. Vault opens position on Hyperliquid
6. Position managed until TP/SL/timeout

**Withdrawal flow**:
1. User redeems shares
2. Vault pro-rata liquidates positions (or cash on hand)
3. USDC returned minus perf fee (on positive PnL only)

### 4.3 Engine Weighting Algorithm

**Initial version (Phase 2)**: Simple Sharpe-based

```
for each engine in vault:
  weight[engine] = sharpe[engine] / Σ sharpe[all engines]

Rebalance weekly.
```

**Advanced version (Phase 2.5+)**: Risk-parity + correlation

```
1. Compute 90-day return matrix
2. Compute covariance matrix
3. Optimize weights for equal risk contribution
4. Apply min/max constraint (no single engine > 40%)
```

### 4.4 Fee Structure

| Component | Rate | Frequency |
|-----------|------|-----------|
| Entry fee | 0% | Per deposit |
| Exit fee | 0% | Per withdrawal |
| Management fee | 0% | Annual |
| Performance fee | 15% of positive PnL | Per signal settlement |

**Performance fee split**:
- 70% → Primary engine (signal 제공자)
- 15% → Secondary engines (currently in vault)
- 15% → Protocol treasury

**High-Water Mark (HWM)**:
- User별 개별 HWM 추적
- Share price가 user의 HWM 초과 시에만 fee 청구
- HWM reset 없음 (perpetual)

### 4.5 Risk Controls

**Protocol-level caps** (initial):
- Max TVL per vault: $5M (Phase 2 초기)
- Max position size per signal: 10% of vault
- Max leverage: 3x (Hyperliquid isolated margin)
- Circuit breaker: 5% vault daily loss → pause

**Engine-level caps**:
- Max weight per engine: 40%
- Engine performance rolling 90-day Sharpe must remain > 0.5 (else auto-reduce weight)
- Engine inactive 7일+ → weight = 0

---

## 5. Layer 3: Vault Aggregator (Future)

### 5.1 Concept (Phase 4)

**Vault Aggregator = Multi-vault portfolio**. Aggregates multiple Router Vaults into a single position for:

1. **Risk diversification**: 여러 vault 간 성과 분산
2. **Institutional gateway**: Accredited investors only, KYC 가능
3. **Cross-chain**: Arbitrum + Hyperliquid + Base 등 동시 운영

### 5.2 Target Use Cases

- Crypto hedge funds (주체) → Cogochi 전략에 exposure
- Family offices
- DAOs (treasury diversification)
- 각국 regulated funds

### 5.3 Status

**Phase 4 roadmap**. Not in pre-seed scope. 참고용 섹션.

---

## 6. Cogochi Engine (First Marketplace Participant)

### 6.1 Engine Overview

**Cogochi 엔진은 proprietary, off-chain Python stack**.

**구성**:
```
┌──────────────────────────────────────────────┐
│ Data Layer (multi-source)                    │
│  - Spot: Binance WebSocket OHLCV/CVD         │
│  - Futures: OI, funding, L/S (Binance, Coinalyze) │
│  - On-chain: Whale flows (Surf AI API)       │
└────────────────┬─────────────────────────────┘
                 ↓
┌──────────────────────────────────────────────┐
│ Feature Engineering                          │
│  - 28-feature vector                         │
│  - Real-time computation                     │
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

### 6.2 4-Stage Validation Gate

| Stage | Test | Pass Criteria |
|-------|------|---------------|
| 1. Backtest | 6-year historical data | Expectancy > 0, MDD < 20%, PF > 1.2 |
| 2. Walk-forward | 72-month OOS | 75% of quarters positive |
| 3. Paper trade | 30일 real-time (no money) | Actual vs backtest diff < 30% |
| 4. Live small | 60일 with minimal capital | Net PnL > 0 (after fees) |

**Only Stage-4-passed patterns emit on-chain signals**.

### 6.3 Engine Limitations (Honest)

**Strengths**:
- Reproducible (same input → same output)
- Explainable (feature-level transparency)
- Self-improving (Hill Climbing loop)

**Weaknesses**:
- Regime change susceptible (LightGBM 한계)
- Live track record 짧음 (pre-MVP)
- On-chain data API 의존 (Surf AI)
- Binance 중심 (Hyperliquid native universe 미커버)

**Planned mitigations**:
- Regime filter 레이어 추가 (Phase 1.5)
- Live track record 축적 (Phase 1)
- API 다중화 (Glassnode 백업)
- Hyperliquid universe 직접 indexing (Phase 2)

---

## 7. Commit-Reveal MEV Defense

### 7.1 Problem

Plain signal publish 시:
1. MEV bot이 mempool에서 signal sniff
2. Bot이 먼저 entry (1 block 빠름)
3. Vault가 뒤이어 entry (worst fill)
4. Bot exit → vault bag holds
5. 결과: Vault 성과 저하 [estimate: 20-40%, MEV 경험적]

### 7.2 Solution: Commit-Reveal

```
t=0    Engine computes signal: (BTC, long, entry=50000, TP=2%, SL=1%)
       Engine computes nonce (random)
       Engine commits: hash(signal || nonce) → on-chain
       [mempool visible: hash only, content hidden]

t=0+5s Subscribers / vaults observe commit
       Vault starts preparing (caching)
       
t=0+15s Engine reveals: (signal, nonce)
        Contract verifies: keccak256(signal || nonce) == committed_hash
        
t=0+15~20s Vault executes on Hyperliquid
           (ahead of MEV bot's 15s reveal → execute window)

t=0+35s  MEV bot potentially sees plain signal (reveal public)
         But vault has already executed
         Bot fill < vault fill (slippage)
```

### 7.3 Why 30-second window

- 짧으면 vault 준비 불충분 (RPC latency, gas estimation)
- 길면 MEV bot이 reveal 후 catch-up 가능
- 30초가 empirical sweet spot [Phase 1 tunable]

### 7.4 Limitations

**Commit-reveal는 완전 방어 아님**:
- Subscriber 자체가 악의적이면 signal leak 가능
- Multi-subscriber coordination attack (rare)
- Real-time L2 latency만큼의 최소 delay 있음

**Phase 2 추가 방어**:
- TEE (trusted execution environment) 기반 signal computation
- zk-SNARK 기반 proof of valid signal without revealing
- [Phase 2 이후 research]

---

## 8. Security & Audit Strategy

### 8.1 Audit Plan

**Audit 1 (Month 3, pre-mainnet)**:
- Scope: L1 contracts (EngineRegistry, SignalCommitReveal, Performance, Slashing, Subscription)
- Auditor candidates: OpenZeppelin, Consensys Diligence, Trail of Bits
- Budget: $60k
- Duration: 4-6 weeks

**Audit 2 (Month 9, pre-L2 mainnet)**:
- Scope: L2 Router Vault + Hyperliquid integration
- Auditor: different firm (cross-check)
- Budget: $90k
- Duration: 6-8 weeks

### 8.2 Additional Security Measures

- **Bug bounty**: Immunefi 또는 Code4rena, budget $50k
- **Formal verification**: Critical functions (deposit, withdraw, slash) Certora 검증 [optional, Phase 2]
- **Timelock**: Admin functions 2-day timelock
- **Multi-sig**: Treasury 4/7 multi-sig (pre-DAO)
- **Emergency pause**: Circuit breaker, governance-trigger

### 8.3 Risk Caps (initial)

- Max TVL per vault: $5M (gradually raised post-audit)
- Max total protocol TVL: $50M (Phase 2)
- Emergency pause threshold: 5% vault daily loss OR 15% weekly

---

## 9. Governance & Decentralization Path

### 9.1 Phases

**Phase A (Month 0-6): Team governance**
- Core team multi-sig (4/7) controls all protocol parameters
- No token, no DAO
- Transparency: All decisions public

**Phase B (Month 6-12, post-TGE): Hybrid**
- Token holders vote on parameter changes
- Core team retains emergency pause + fee parameter initial range
- Investor board has oversight (VC protection)

**Phase C (Month 12+): Full DAO**
- veCOGO-based voting
- Core team reduces to 2/7 multi-sig (emergency only)
- Treasury fully DAO-governed
- Protocol upgrades via timelocked proposals

### 9.2 Governance Scope

**Phase B-C governable**:
- Protocol fee rate (5-25% range)
- Engine fee split (50-80%)
- Engine min stake (1k-100k $COGO)
- Buy-back %
- Slashing severity
- Treasury allocation
- New chain deployment

**NOT governable (emergency only)**:
- Smart contract logic changes (upgradability limited)
- User fund access (always non-custodial)

---

## 10. Roadmap

### 10.1 Phase 1: Engine Marketplace MVP (Month 1-6)

- Month 1-3: Smart contract 개발 (L1)
- Month 4: Arbitrum testnet + 1st engine (Cogochi)
- Month 5: Audit 1
- Month 6: Mainnet launch
  - Cogochi engine live
  - 500 subscriber wallets target
  - First month revenue: $0 (subscription free bootstrap)

**Success criteria**: 500+ signals published, 300+ subscribers, out-of-sample Sharpe > 1.0.

### 10.2 Phase 2: Router Vault (Month 7-12)

- Month 7-9: L2 vault 개발
- Month 10: Testnet + 2nd engine 유치
- Month 11: Audit 2
- Month 12: L2 mainnet
  - TVL $3M target
  - 3 engines
  - Revenue $30k/mo

### 10.3 Phase 3: Token + Scale (Month 13-24)

- Month 13-15: TGE 준비 (조건 충족 시)
- Month 16: TGE + airdrop
- Month 18: Series A
- Month 24: TVL $30M, 10+ engines, multi-chain

### 10.4 Phase 4: Aggregator + Institutional (Month 25-36)

- Month 25-30: Vault Aggregator (L3)
- Month 31-36: Institutional gateway, regulated jurisdictions

---

## 11. Non-Goals

**Cogochi Protocol이 하지 않는 것**:

- 자체 perp 엔진 빌드 (Hyperliquid 이용)
- 자체 L1/L2 체인
- AMM / LP 기능
- Lending / borrowing
- Stablecoin 발행
- 전통자산 (주식, 원자재) 시그널
- Social feed / 채팅 (Discord로 충분)
- Mobile app (Phase 3 이전)
- 한국 VASP 신고 (offshore operation)

---

## 12. References

[1] CoinGecko 2025 Annual Crypto Industry Report
[2] Hyperliquid Docs — User Vaults, HyperEVM
[3] dHEDGE H1 2025 Update
[4] Chainlink Price Feeds Documentation
[5] ERC-4626 Tokenized Vault Standard
[6] Curve Finance veCRV Model
[7] Cogochi Internal: Pattern Engine Design Docs (private)
[8] Cogochi Research Dossier (01)
[9] Cogochi Tokenomics v2 (04)

---

## Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-23 | Initial Whitepaper (archived) |
| **2.0** | **2026-04-23** | **Red Team revision: Marketplace structure, commit-reveal MEV defense, multi-engine vault, governance phases** |

---

**End of Whitepaper v2**
