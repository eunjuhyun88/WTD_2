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
12. Technical Appendix (Chainlink, Engine SDK, Vault weight algorithm)
13. References

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

## 12. Technical Appendix

이 섹션은 본문에서 간략히 다룬 기술 세부를 보강한다.
- 12.1: Chainlink Oracle Integration (attestation 세부)
- 12.2: Engine Interface Specification (third-party engine 연결)
- 12.3: Router Vault Weight Algorithm 수학

### 12.1 Chainlink Oracle Integration

#### 12.1.1 왜 Chainlink인가

**선택지 비교**:

| Oracle | Arbitrum coverage | Latency | Cost | Decentralization |
|--------|-------------------|---------|------|------------------|
| Chainlink Price Feeds | 넓음 (BTC/ETH/SOL 등 20+) | ~15min | 무료 (reader) | 높음 |
| Pyth Network | 중간 | <1sec (push) | 무료 | 중간 |
| Redstone | 좁음 | on-demand | 무료 | 중간 |
| API3 / dAPIs | 제한적 | 중간 | 유료 | 중간 |
| DIA | 제한적 | 중간 | 무료 | 중간 |

**선택**: Chainlink primary + Pyth fallback (Phase 2)

**이유**:
- Arbitrum 자산 coverage가 가장 넓음
- Reader용 무료 (protocol 수익 낮을 때 중요)
- 업계 표준, audit 친화적
- Pyth는 latency 장점이지만 push model로 staleness 리스크

#### 12.1.2 Signal 생명주기에서 Oracle 역할

```
시그널 lifecycle:
1. Engine commits (no oracle needed)
2. Engine reveals
   → Oracle called: get current price of asset
   → entry_price 기록 (signal metadata)
3. 시간 경과 (market moves)
4. Outcome resolution:
   → Oracle called: get current price again
   → TP/SL/timeout 판정
```

#### 12.1.3 Chainlink Reader Contract

```solidity
interface IChainlinkPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

contract ChainlinkOracleConsumer {
    mapping(string => address) public priceFeeds;  // "BTC" => 0x..., "ETH" => 0x...
    uint256 public constant MAX_STALENESS = 1 hours;
    
    event PriceFeedAdded(string asset, address feed);
    
    constructor(address governance_) {
        governance = governance_;
        // Arbitrum Mainnet price feeds
        priceFeeds["BTC"] = 0x6ce185860a4963106506C203335A2910413708e9;  // BTC/USD
        priceFeeds["ETH"] = 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612;  // ETH/USD
        // ... more assets
    }
    
    function getPrice(string calldata asset) external view returns (uint256) {
        address feed = priceFeeds[asset];
        require(feed != address(0), "unsupported asset");
        
        (, int256 answer, , uint256 updatedAt, ) = 
            IChainlinkPriceFeed(feed).latestRoundData();
        
        require(answer > 0, "invalid price");
        require(block.timestamp - updatedAt <= MAX_STALENESS, "stale price");
        
        // Normalize to 1e18 (Chainlink decimals vary: 8 for most)
        uint8 dec = IChainlinkPriceFeed(feed).decimals();
        return uint256(answer) * 10**(18 - dec);
    }
    
    function addPriceFeed(string calldata asset, address feed) 
        external 
        onlyGovernance 
    {
        require(priceFeeds[asset] == address(0), "exists");
        priceFeeds[asset] = feed;
        emit PriceFeedAdded(asset, feed);
    }
}
```

#### 12.1.4 Attestation Flow

**Signal reveal 시점 attestation**:
```
function revealSignal(...) external {
    // ... validation ...
    
    uint256 oraclePrice = oracle.getPrice(asset);
    
    reveals[commitId] = Reveal({
        ...
        entryPrice: oraclePrice,
        ...
    });
}
```

**Outcome resolution 시점 attestation**:
```
function resolveSignal(bytes32 commitId) external {
    Reveal memory r = commitReveal.reveals(commitId);
    uint256 currentPrice = oracle.getPrice(r.asset);
    
    int256 pnlBps;
    if (r.direction) {
        pnlBps = int256((currentPrice * 10000) / r.entryPrice) - 10000;
    } else {
        pnlBps = 10000 - int256((currentPrice * 10000) / r.entryPrice);
    }
    
    Outcome outcome;
    if (pnlBps >= int256(r.tpBps)) outcome = Outcome.Hit;
    else if (pnlBps <= -int256(r.slBps)) outcome = Outcome.Miss;
    else if (block.timestamp >= r.validUntil) outcome = Outcome.Timeout;
    else revert("pending");
    
    // ... store outcome ...
}
```

#### 12.1.5 실패 모드 및 방어

**실패 시나리오 1: Oracle staleness**
- Chainlink feed가 1시간 이상 업데이트 없음
- `require(updatedAt > block.timestamp - 1 hours)` revert
- 결과: Signal reveal/resolve 못함, manual intervention 필요
- **방어**: Pyth fallback을 governance 승인 후 활성화 가능

**실패 시나리오 2: Oracle manipulation**
- 단일 large trade가 Chainlink 가격을 크게 움직임
- 영향: 한 signal의 TP/SL 판정 왜곡 가능
- **방어**: Chainlink의 multiple node aggregation이 1차 방어
- **추가 방어**: 15분 이상 spot price와 Chainlink 간 괴리 > 3% 시 flag + manual review

**실패 시나리오 3: Asset delisting**
- Chainlink이 특정 asset feed 중단
- **방어**: Governance가 해당 asset signal 중단, 기존 signal은 마지막 가격으로 force close

#### 12.1.6 Cost Analysis

Chainlink Reader (view function) 호출은 무료. 하지만:
- Signal reveal 시 1회 oracle read = ~5k gas
- Resolve 시 1회 read = ~5k gas
- 500 signals/mo × 2 reads = 1000 reads = 5M gas
- Arbitrum gas price 0.1 gwei → 5M × 0.1 × $2000 (ETH) / 1e9 = **$1/month**

무시 가능한 비용.

### 12.2 Engine Interface Specification

#### 12.2.1 Goal

Third-party engine operator가 Cogochi Marketplace에 손쉽게 engine을 launch할 수 있도록, **표준 interface와 SDK 제공**.

#### 12.2.2 Engine Requirements

**최소 요건 (필수)**:

1. **Signal generation capability**: Asset + direction + TP/SL/validity 포함한 신호 생성
2. **Signal publisher**: On-chain commit-reveal 실행 (Python SDK 제공)
3. **Heartbeat**: 최소 24시간마다 heartbeat transaction
4. **Performance history**: 최소 30일 off-chain backtest + 30일 paper trade 데이터 제공
5. **Metadata**: IPFS에 engine 설명 문서 저장 (engine type, strategy overview, risk profile, team)

**권장 요건 (optional, 가산점)**:
- Open-source strategy code (선택적, moat 감소 있음)
- Third-party audit of strategy (security)
- Public track record (Dune dashboard, Twitter bot 등)

#### 12.2.3 Signal Format Spec (v1)

```python
@dataclass
class CogochiSignal:
    # Required
    engine_id: bytes          # 32-byte engine identifier (registered on-chain)
    asset: str                # "BTC", "ETH", "SOL" (must be Chainlink-supported)
    direction: bool           # True = long, False = short
    tp_bps: int               # Take profit in basis points (e.g., 200 = 2%)
    sl_bps: int               # Stop loss in basis points (e.g., 100 = 1%)
    valid_until: int          # Unix timestamp, signal expires after
    
    # Optional metadata (off-chain only)
    confidence: float         # 0.0-1.0, engine's own confidence
    strategy_tag: str         # "momentum", "mean_reversion", etc.
    feature_snapshot: dict    # engine's internal features at signal time
    
    def compute_commit_hash(self, nonce: int) -> bytes:
        return keccak256(
            encode_packed(
                self.asset,
                self.direction,
                self.tp_bps,
                self.sl_bps,
                self.valid_until,
                nonce
            )
        )
```

#### 12.2.4 Cogochi Engine SDK (Python)

**Installation**:
```bash
pip install cogochi-engine-sdk
```

**Basic usage**:

```python
from cogochi_sdk import CogochiEngine, CogochiSignal
from web3 import Web3
import os

class MyCustomEngine:
    def __init__(self):
        self.engine = CogochiEngine(
            engine_id=os.environ["COGOCHI_ENGINE_ID"],
            operator_pk=os.environ["OPERATOR_PK"],
            rpc_url="https://arb1.arbitrum.io/rpc",
            contracts={
                "registry": "0x...",
                "commit_reveal": "0x...",
                "scoreboard": "0x...",
            }
        )
    
    async def generate_signal(self) -> Optional[CogochiSignal]:
        """Your strategy here"""
        # Your signal generation logic
        if self._should_long_btc():
            return CogochiSignal(
                engine_id=self.engine.engine_id,
                asset="BTC",
                direction=True,
                tp_bps=300,       # 3% TP
                sl_bps=150,       # 1.5% SL
                valid_until=int(time.time()) + 3600,  # 1 hour
                confidence=0.72,
            )
        return None
    
    async def run(self):
        """Main loop: generate + publish signals"""
        while True:
            try:
                # 1. Check heartbeat (every 24h)
                if self.engine.time_since_last_heartbeat() > 23 * 3600:
                    await self.engine.send_heartbeat()
                
                # 2. Generate signal
                signal = await self.generate_signal()
                
                if signal:
                    # 3. Publish via commit-reveal
                    result = await self.engine.publish(signal)
                    log.info(f"Published: {result['commit_id']}")
                
                # 4. Sleep
                await asyncio.sleep(300)  # 5 min cycle
                
            except Exception as e:
                log.error(f"Engine loop error: {e}")
                await asyncio.sleep(60)

if __name__ == "__main__":
    engine = MyCustomEngine()
    asyncio.run(engine.run())
```

**SDK 주요 기능**:
- Auto commit-reveal (`engine.publish(signal)` 단일 호출)
- Nonce 관리
- Gas estimation + retry logic
- Heartbeat automation
- Performance tracking (local mirror of on-chain stats)
- Slashing detection (alert if slashed)

#### 12.2.5 Engine Onboarding 절차

```
Step 1: Develop engine (off-chain)
  - Strategy code
  - Minimum 30 days paper trading
  - Performance report

Step 2: Apply (governance)
  - Submit metadata + performance proof
  - Community review period (7 days)
  - Multi-sig approval (Phase 2: team, Phase 3: DAO)

Step 3: Register on-chain
  - Lock 10,000 $COGO (or $5k USDC pre-TGE)
  - Receive engineId
  - Submit metadata to IPFS

Step 4: Begin signal emission
  - SDK setup
  - Signal generation 24/7
  - Build on-chain track record

Step 5: (After 30 days) Eligible for Router Vault
  - Performance review by governance
  - If Sharpe > 1.0, MDD < 25%, included in vault orchestrator
  - Earn vault performance fee share

Step 6: Ongoing
  - Monthly performance review
  - Weight adjustment by orchestrator
  - Maintain heartbeat, stake
```

#### 12.2.6 Engine Grant Program

Third-party engine operator를 유치하기 위한 grant.

**Grant structure**:
- **Tier 1 (Sharpe > 1.5, MDD < 15%)**: 2,000,000 $COGO grant over 12 months
- **Tier 2 (Sharpe 1.0-1.5)**: 800,000 $COGO over 12 months
- **Tier 3 (Sharpe 0.5-1.0)**: 200,000 $COGO over 6 months

**Conditions**:
- Grant vested monthly based on continued performance
- Drop below threshold → vesting pause
- Slashed → full grant clawback
- Minimum signal activity (10+ signals/mo)

**Goal**: Month 12에 3개 qualified engines.

### 12.3 Router Vault Weight Algorithm

#### 12.3.1 Problem Statement

Multi-engine Router Vault는 여러 engine의 signal을 어떻게 섞어야 하는가?

**Bad answers**:
- Equal weight: 나쁜 엔진도 동일 비중 → 성과 저하
- 최근 수익률 순위: Over-fit to recent luck
- 임의 governance 결정: Political, not meritocratic

**Good answer**: Quantitative, rolling performance-based, with risk adjustment.

#### 12.3.2 Sharpe-based Weighting (Phase 2 default)

**수식**:

```
For each engine i at time t:
  Return_history_i = [r_i(t-90), r_i(t-89), ..., r_i(t)]   (90-day)
  
  Mean return:
    μ_i = (1/N) × Σ r_i
  
  Standard deviation:
    σ_i = √[(1/N) × Σ (r_i - μ_i)²]
  
  Sharpe (annualized, daily returns):
    Sharpe_i = (μ_i / σ_i) × √252
  
  Raw weight:
    w_raw_i = max(0, Sharpe_i)   (negative Sharpe → 0)
  
  Normalized weight:
    w_i = w_raw_i / Σ w_raw_j
  
  Capped weight:
    w_i = min(w_i, 0.40)   (max 40% per engine)
  
  Re-normalized after cap:
    w_final_i = w_i / Σ w_j
```

**Python implementation**:

```python
import numpy as np
from typing import Dict, List

def compute_sharpe_weights(
    engine_returns: Dict[bytes, List[float]],
    max_weight: float = 0.40,
    min_sharpe: float = 0.5,
    min_signals: int = 30,
) -> Dict[bytes, float]:
    """
    Compute vault weights based on 90-day Sharpe ratio.
    
    Args:
        engine_returns: engine_id => list of daily returns (basis points)
        max_weight: cap per engine (0.40 = 40%)
        min_sharpe: exclude engines below this
        min_signals: exclude engines with fewer total signals
    
    Returns:
        engine_id => weight (0.0-1.0), sum = 1.0
    """
    sharpes = {}
    for eid, returns in engine_returns.items():
        if len(returns) < min_signals:
            sharpes[eid] = 0
            continue
        
        arr = np.array(returns) / 10000  # bps to decimal
        mu = np.mean(arr)
        sigma = np.std(arr)
        
        if sigma == 0:
            sharpes[eid] = 0
            continue
        
        sharpe = (mu / sigma) * np.sqrt(252)
        sharpes[eid] = max(0, sharpe) if sharpe >= min_sharpe else 0
    
    # Normalize
    total = sum(sharpes.values())
    if total == 0:
        return {eid: 0 for eid in engine_returns}
    
    weights = {eid: s / total for eid, s in sharpes.items()}
    
    # Apply cap
    weights = {eid: min(w, max_weight) for eid, w in weights.items()}
    
    # Re-normalize
    total = sum(weights.values())
    if total == 0:
        return weights
    weights = {eid: w / total for eid, w in weights.items()}
    
    return weights
```

#### 12.3.3 Risk-Parity Weighting (Phase 2.5+)

Sharpe-based는 높은 Sharpe 엔진에 과도 집중 가능. Risk-parity는 **각 엔진의 risk contribution을 균등화**.

**수식**:

```
Risk contribution of engine i to portfolio:
  RC_i = w_i × (Σ_j w_j × Cov(r_i, r_j)) / σ_portfolio

목표: 모든 engine의 RC_i가 동일
  RC_1 = RC_2 = ... = RC_n = σ_portfolio / n

Optimization:
  minimize Σ_i (RC_i - σ_portfolio/n)²
  subject to: Σ w_i = 1, 0 ≤ w_i ≤ 0.40
```

**Python (scipy.optimize)**:

```python
from scipy.optimize import minimize

def compute_risk_parity_weights(
    engine_returns: Dict[bytes, List[float]],
    max_weight: float = 0.40,
    min_signals: int = 30,
) -> Dict[bytes, float]:
    """Risk-parity weighting"""
    
    # Filter qualified engines
    qualified = {
        eid: rets for eid, rets in engine_returns.items() 
        if len(rets) >= min_signals
    }
    
    if len(qualified) < 2:
        # Not enough engines, equal weight
        return {eid: 1/len(qualified) for eid in qualified}
    
    eids = list(qualified.keys())
    returns_matrix = np.array([qualified[eid] for eid in eids]) / 10000
    
    # Covariance matrix
    cov = np.cov(returns_matrix)
    
    # Objective: minimize variance of risk contributions
    def objective(w):
        portfolio_var = w @ cov @ w
        if portfolio_var == 0:
            return float('inf')
        rc = w * (cov @ w) / np.sqrt(portfolio_var)
        target = 1.0 / len(w)
        return np.sum((rc - target)**2)
    
    # Constraints
    n = len(eids)
    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    bounds = [(0.0, max_weight) for _ in range(n)]
    x0 = [1/n] * n
    
    result = minimize(
        objective, x0, 
        method='SLSQP',
        bounds=bounds,
        constraints=constraints,
    )
    
    if not result.success:
        # Fallback to equal weight
        return {eid: 1/n for eid in eids}
    
    return {eid: float(w) for eid, w in zip(eids, result.x)}
```

#### 12.3.4 Correlation-Adjusted Sharpe (Hybrid, Phase 3)

Pure Sharpe는 engine 간 correlation을 고려하지 않음. Hybrid:

```
1. Compute Sharpe for each engine
2. Compute pairwise correlation matrix
3. Engine diversity bonus:
   - High diversity (low correlation with others) → weight ×1.2
   - High correlation (>0.7 with another engine) → weight ×0.8
4. Apply standard normalization + cap
```

**Rationale**: 같은 regime-follower 엔진 10개보다 다양한 strategy 3개가 robust.

#### 12.3.5 Weight Update Frequency

| Option | Interval | Pros | Cons |
|--------|----------|------|------|
| Daily | 1 day | Responsive | 과도한 turnover, over-fit to noise |
| Weekly | 7 days | Balance | Miss regime changes |
| Monthly | 30 days | Stable | Slow response |

**선택**: **Weekly (Monday 00:00 UTC)**. 
- Noise 감소 충분
- Regime change에 1주 내 대응
- Gas cost 관리 가능

**Threshold 적용**:
- Weight change < 5% of current → skip update (reduce churn)
- Weight change > 20% → emergency review before apply

#### 12.3.6 Edge Cases

**Case 1: 엔진 개수 부족 (N < 2)**:
- 1 engine only → weight 100% to that engine (Router degenerates to single-engine vault)
- 0 engines → vault suspended, user can emergency withdraw

**Case 2: 모든 엔진 negative Sharpe**:
- Vault cash-only (no position)
- Alert governance for review
- Consider pause

**Case 3: 신규 engine 추가**:
- 최소 30일 + 50 signals 후에만 weight > 0
- Warm-up period: 30-60일간 weight cap 10%
- Full eligibility 후 algorithm 적용

**Case 4: Engine slashing 중**:
- 즉시 weight = 0 (weekly rebalance 기다리지 않음)
- Open position은 유지 (forced close는 유저 손실 가능)
- 30일 review 후 재영입 가능

#### 12.3.7 Simulation & Backtesting

Phase 2 런칭 전, 3가지 알고리즘을 Cogochi 엔진 historical data로 simulate:

**Simulation setup**:
- Historical period: Cogochi 엔진 60일 live (Phase 1 data)
- Synthetic "other engines": BTC-only strategy, ETH-only, mean-reversion variants
- Compare: Sharpe / Risk-parity / Hybrid on simulated portfolio

**Target metrics**:
- Portfolio Sharpe
- Max drawdown
- Turnover cost
- Correlation with buy-and-hold benchmark

**Decision criteria**: 가장 robust한 방법을 Phase 2 default로.

---

---

## 13. References

[1] CoinGecko 2025 Annual Crypto Industry Report
[2] Hyperliquid Docs — User Vaults, HyperEVM
[3] dHEDGE H1 2025 Update
[4] Chainlink Price Feeds Documentation. https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum
[5] ERC-4626 Tokenized Vault Standard
[6] Curve Finance veCRV Model
[7] Cogochi Internal: Pattern Engine Design Docs (private)
[8] Cogochi Research Dossier (01)
[9] Cogochi Tokenomics v2 (04)
[10] Pyth Network Documentation (fallback oracle reference)
[11] Qian, E. "Risk Parity Portfolios" (2005) — risk-parity 수학 참조
[12] Sharpe, W. "Capital Asset Prices" (1964) — Sharpe ratio 원론

---

## Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-23 | Initial Whitepaper (archived) |
| 2.0 | 2026-04-23 | Red Team revision: Marketplace, commit-reveal, multi-engine, governance |
| **2.1** | **2026-04-23** | **Added Technical Appendix: Chainlink oracle integration, Engine interface spec + SDK, Router Vault weight algorithms (Sharpe/risk-parity/hybrid)** |

---

**End of Whitepaper v2**
