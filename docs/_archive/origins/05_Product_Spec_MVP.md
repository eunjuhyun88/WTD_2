# Cogochi Protocol — Product Spec (MVP) v2

**Version**: 2.0
**Date**: 2026-04-23
**Status**: Build-ready spec, Red Team revised
**Scope**: Layer 1 Engine Marketplace (3-6 month MVP)
**Reader**: 엔지니어 (Solidity + Python + TypeScript)

---

## 0. Scope

### 0.1 In Scope (MVP, 3-6 months)

- L1 Engine Marketplace smart contracts (Arbitrum Sepolia → mainnet)
- Cogochi 엔진 ↔ Arbitrum 연동 (commit-reveal)
- Self-hosted indexer
- 공개 Dune dashboard
- Frontend: read-only (Next.js)
- 1회 external audit
- Mainnet launch with 50 beta users

### 0.2 Out of Scope (MVP에서 안 함)

- Layer 2 Router Vault (Phase 2)
- Layer 3 Aggregator (Phase 4)
- Multi-engine support UI (Phase 2에서 본격화)
- Third-party engine onboarding (Phase 1.5+)
- Token (post-TGE)
- Mobile app
- 한국어 localization

### 0.3 Success Criteria (Month 6)

- [ ] L1 contracts Arbitrum mainnet 배포 + verified
- [ ] Audit 1회 complete (Critical/High findings 0)
- [ ] Cogochi 엔진 24/7 signal publish (commit-reveal)
- [ ] 500+ signals published on-chain
- [ ] Performance Scoreboard Dune dashboard 공개
- [ ] 300+ subscriber wallets
- [ ] Engine Sharpe > 1.0 (60-day OOS)
- [ ] Frontend: engine list + signal list + stats

---

## 1. System Architecture

### 1.1 High-Level Diagram

```
┌──────────────────────────────────────────────────┐
│ Off-chain (Python/Infra)                         │
│                                                  │
│  Cogochi Engine                                  │
│  ├─ feature_calc.py                              │
│  ├─ LightGBM predictor                           │
│  ├─ 4-stage gate                                 │
│  └─ Hill Climbing                                │
│         ↓                                        │
│  Signal Publisher (new)                          │
│  ├─ Commit phase: hash → on-chain                │
│  ├─ Reveal phase: plain → on-chain (30s later)   │
│  └─ Performance updater: on expiry               │
└──────────────────┬───────────────────────────────┘
                   ↓ JSON-RPC
┌──────────────────────────────────────────────────┐
│ On-chain (Arbitrum)                              │
│                                                  │
│  EngineRegistry.sol                              │
│  SignalCommitReveal.sol                          │
│  PerformanceScoreboard.sol                       │
│  SlashingEngine.sol                              │
│  SubscriptionPayment.sol                         │
│  ChainlinkOracleConsumer.sol                     │
└──────────────────┬───────────────────────────────┘
                   ↓ Event logs
┌──────────────────────────────────────────────────┐
│ Indexer (TypeScript, TheGraph or custom)         │
│  ├─ Listen to all protocol events                │
│  ├─ Index: signals, performance, subscriptions   │
│  └─ Serve REST/GraphQL API                       │
└──────────────────┬───────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────┐
│ Frontend (Next.js + Tailwind)                    │
│  ├─ Engine list page                             │
│  ├─ Signal feed                                  │
│  ├─ Engine detail + stats                        │
│  └─ Wallet connect                               │
└──────────────────────────────────────────────────┘
```

### 1.2 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Smart contracts | Solidity 0.8.24+ | Arbitrum-compatible |
| Dev framework | Foundry | Fast, testing-first |
| Off-chain engine | Python 3.11 | Cogochi existing stack |
| Signal publisher | Python + web3.py | Same process as engine |
| Indexer | TypeScript + Prisma | 또는 TheGraph (subgraph) |
| Frontend | Next.js 14 + Tailwind + wagmi | Standard Web3 stack |
| Oracle | Chainlink Price Feeds | Arbitrum coverage |
| RPC | Alchemy or Infura | Reliability |
| Deployment | GitHub Actions + Hardhat/Foundry | CI/CD |

---

## 2. Smart Contracts (detailed spec)

### 2.1 EngineRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EngineRegistry {
  enum EngineStatus { None, Active, Paused, Slashed, Deactivated }
  
  struct Engine {
    address operator;
    bytes32 metadataHash;      // IPFS
    uint256 stakedAmount;
    uint256 registeredAt;
    EngineStatus status;
    uint256 unstakeRequestedAt;  // 0 = no request
  }
  
  mapping(bytes32 => Engine) public engines;
  mapping(address => bytes32[]) public operatorEngines;
  
  IERC20 public immutable stakingToken;  // USDC pre-TGE, $COGO post-TGE
  uint256 public constant MIN_STAKE = 5000 * 10**6;  // $5k USDC, 6 decimals
  uint256 public constant UNSTAKE_COOLDOWN = 28 days;
  
  address public governance;  // multi-sig initially
  
  event EngineRegistered(bytes32 indexed engineId, address indexed operator);
  event EngineStatusChanged(bytes32 indexed engineId, EngineStatus status);
  event StakeDeposited(bytes32 indexed engineId, uint256 amount);
  event UnstakeRequested(bytes32 indexed engineId);
  event StakeWithdrawn(bytes32 indexed engineId, uint256 amount);
  
  function registerEngine(
    bytes32 engineId,
    bytes32 metadataHash,
    uint256 stakeAmount
  ) external {
    require(engines[engineId].operator == address(0), "exists");
    require(stakeAmount >= MIN_STAKE, "insufficient stake");
    
    stakingToken.transferFrom(msg.sender, address(this), stakeAmount);
    
    engines[engineId] = Engine({
      operator: msg.sender,
      metadataHash: metadataHash,
      stakedAmount: stakeAmount,
      registeredAt: block.timestamp,
      status: EngineStatus.Active,
      unstakeRequestedAt: 0
    });
    operatorEngines[msg.sender].push(engineId);
    
    emit EngineRegistered(engineId, msg.sender);
    emit StakeDeposited(engineId, stakeAmount);
  }
  
  function requestUnstake(bytes32 engineId) external {
    Engine storage e = engines[engineId];
    require(e.operator == msg.sender, "not operator");
    require(e.unstakeRequestedAt == 0, "already requested");
    
    e.status = EngineStatus.Paused;
    e.unstakeRequestedAt = block.timestamp;
    emit UnstakeRequested(engineId);
  }
  
  function withdrawStake(bytes32 engineId) external {
    Engine storage e = engines[engineId];
    require(e.operator == msg.sender, "not operator");
    require(e.unstakeRequestedAt > 0, "not requested");
    require(
      block.timestamp >= e.unstakeRequestedAt + UNSTAKE_COOLDOWN, 
      "cooldown"
    );
    
    uint256 amount = e.stakedAmount;
    e.stakedAmount = 0;
    e.status = EngineStatus.Deactivated;
    
    stakingToken.transfer(e.operator, amount);
    emit StakeWithdrawn(engineId, amount);
  }
  
  // Governance functions
  function slash(bytes32 engineId, uint256 amount) external onlyGovernance {
    Engine storage e = engines[engineId];
    require(amount <= e.stakedAmount, "over-slash");
    
    e.stakedAmount -= amount;
    e.status = EngineStatus.Slashed;
    
    // 50% burn, 50% treasury (implementation in SlashingEngine)
    // ...
  }
}
```

### 2.2 SignalCommitReveal.sol

```solidity
contract SignalCommitReveal {
  struct Commit {
    bytes32 engineId;
    bytes32 commitHash;
    uint256 commitTime;
    bool revealed;
  }
  
  struct Reveal {
    bytes32 commitId;
    string asset;        // "BTC", "ETH", ...
    bool direction;      // true = long
    uint256 entryPrice;  // price when signal emitted (from oracle)
    uint256 tpBps;       // TP in basis points (e.g., 200 = 2%)
    uint256 slBps;       // SL in basis points
    uint256 validUntil;  // timestamp of expiry
    uint256 nonce;
    uint256 revealTime;
  }
  
  mapping(bytes32 => Commit) public commits;         // commitId => Commit
  mapping(bytes32 => Reveal) public reveals;         // commitId => Reveal
  bytes32[] public commitIds;                        // for enumeration
  
  uint256 public constant REVEAL_WINDOW = 30 seconds;
  uint256 public constant REVEAL_DEADLINE = 60 seconds;  // after which commit is dead
  
  EngineRegistry public immutable registry;
  IChainlinkOracle public immutable oracle;
  
  event SignalCommitted(bytes32 indexed commitId, bytes32 indexed engineId);
  event SignalRevealed(bytes32 indexed commitId, string asset, bool direction);
  
  function commitSignal(bytes32 engineId, bytes32 commitHash) 
    external returns (bytes32 commitId) 
  {
    require(
      registry.engines(engineId).status == EngineRegistry.EngineStatus.Active, 
      "engine inactive"
    );
    require(
      registry.engines(engineId).operator == msg.sender, 
      "not operator"
    );
    
    commitId = keccak256(abi.encodePacked(engineId, commitHash, block.timestamp));
    
    commits[commitId] = Commit({
      engineId: engineId,
      commitHash: commitHash,
      commitTime: block.timestamp,
      revealed: false
    });
    commitIds.push(commitId);
    
    emit SignalCommitted(commitId, engineId);
  }
  
  function revealSignal(
    bytes32 commitId,
    string calldata asset,
    bool direction,
    uint256 tpBps,
    uint256 slBps,
    uint256 validUntil,
    uint256 nonce
  ) external {
    Commit storage c = commits[commitId];
    require(!c.revealed, "already revealed");
    require(block.timestamp <= c.commitTime + REVEAL_DEADLINE, "too late");
    require(
      registry.engines(c.engineId).operator == msg.sender, 
      "not operator"
    );
    
    // Verify hash
    bytes32 computedHash = keccak256(
      abi.encodePacked(asset, direction, tpBps, slBps, validUntil, nonce)
    );
    require(computedHash == c.commitHash, "hash mismatch");
    
    // Get entry price from oracle
    uint256 entryPrice = oracle.getPrice(asset);
    
    reveals[commitId] = Reveal({
      commitId: commitId,
      asset: asset,
      direction: direction,
      entryPrice: entryPrice,
      tpBps: tpBps,
      slBps: slBps,
      validUntil: validUntil,
      nonce: nonce,
      revealTime: block.timestamp
    });
    c.revealed = true;
    
    emit SignalRevealed(commitId, asset, direction);
  }
}
```

### 2.3 PerformanceScoreboard.sol

```solidity
contract PerformanceScoreboard {
  enum Outcome { Pending, Hit, Miss, Timeout }
  
  struct SignalOutcome {
    bytes32 commitId;
    Outcome outcome;
    int256 pnlBps;            // positive = profit
    uint256 resolvedAt;
    uint256 finalPrice;
  }
  
  struct EngineStats {
    uint256 totalSignals;
    uint256 hits;
    uint256 misses;
    uint256 timeouts;
    int256 cumulativePnLBps;
    uint256 lastSignalAt;
    // Rolling 90-day metrics (updated on each outcome)
    uint256 rolling90DaySignalCount;
    int256 rolling90DayPnL;
    uint256 rolling90DayWins;
  }
  
  mapping(bytes32 => SignalOutcome) public outcomes;
  mapping(bytes32 => EngineStats) public engineStats;  // engineId => stats
  
  SignalCommitReveal public immutable commitReveal;
  IChainlinkOracle public immutable oracle;
  
  event SignalResolved(
    bytes32 indexed commitId,
    bytes32 indexed engineId,
    Outcome outcome,
    int256 pnlBps
  );
  
  function resolveSignal(bytes32 commitId) external {
    SignalCommitReveal.Reveal memory r = commitReveal.reveals(commitId);
    require(r.revealTime > 0, "not revealed");
    require(outcomes[commitId].resolvedAt == 0, "already resolved");
    require(
      block.timestamp >= r.validUntil ||
      _checkTPorSL(r) != Outcome.Pending,
      "not resolvable"
    );
    
    (Outcome outcome, int256 pnlBps, uint256 finalPrice) = _computeOutcome(r);
    
    outcomes[commitId] = SignalOutcome({
      commitId: commitId,
      outcome: outcome,
      pnlBps: pnlBps,
      resolvedAt: block.timestamp,
      finalPrice: finalPrice
    });
    
    // Update engine stats
    SignalCommitReveal.Commit memory c = commitReveal.commits(commitId);
    EngineStats storage s = engineStats[c.engineId];
    s.totalSignals++;
    if (outcome == Outcome.Hit) s.hits++;
    else if (outcome == Outcome.Miss) s.misses++;
    else s.timeouts++;
    s.cumulativePnLBps += pnlBps;
    
    // (Rolling metrics updated off-chain or via more complex on-chain logic)
    
    emit SignalResolved(commitId, c.engineId, outcome, pnlBps);
  }
  
  function _computeOutcome(SignalCommitReveal.Reveal memory r) 
    internal 
    view 
    returns (Outcome, int256, uint256) 
  {
    uint256 currentPrice = oracle.getPrice(r.asset);
    int256 pnlBps;
    Outcome outcome;
    
    if (r.direction) {  // long
      pnlBps = int256((currentPrice * 10000) / r.entryPrice) - 10000;
    } else {  // short
      pnlBps = 10000 - int256((currentPrice * 10000) / r.entryPrice);
    }
    
    if (pnlBps >= int256(r.tpBps)) outcome = Outcome.Hit;
    else if (pnlBps <= -int256(r.slBps)) outcome = Outcome.Miss;
    else if (block.timestamp >= r.validUntil) outcome = Outcome.Timeout;
    else return (Outcome.Pending, 0, 0);
    
    return (outcome, pnlBps, currentPrice);
  }
  
  function _checkTPorSL(SignalCommitReveal.Reveal memory r) 
    internal 
    view 
    returns (Outcome) 
  {
    (Outcome outcome,,) = _computeOutcome(r);
    return outcome;
  }
}
```

### 2.4 SlashingEngine.sol

```solidity
contract SlashingEngine {
  enum Offense { 
    FalseAttestation,      // 50%
    Inactive30d,           // 10%
    Malicious,             // 100%
    CriticalMiss           // 25%
  }
  
  mapping(Offense => uint256) public slashPct;  // basis points
  
  EngineRegistry public immutable registry;
  address public governance;
  address public treasury;
  
  constructor() {
    slashPct[Offense.FalseAttestation] = 5000;  // 50%
    slashPct[Offense.Inactive30d] = 1000;       // 10%
    slashPct[Offense.Malicious] = 10000;        // 100%
    slashPct[Offense.CriticalMiss] = 2500;      // 25%
  }
  
  event OffenseReported(bytes32 indexed engineId, Offense offense, address reporter);
  event SlashExecuted(bytes32 indexed engineId, uint256 amount);
  
  function reportOffense(
    bytes32 engineId,
    Offense offense,
    bytes calldata proof
  ) external {
    emit OffenseReported(engineId, offense, msg.sender);
    // Governance reviews proof, then executes
  }
  
  function executeSlash(
    bytes32 engineId, 
    Offense offense
  ) external onlyGovernance {
    EngineRegistry.Engine memory e = registry.engines(engineId);
    uint256 slashAmount = (e.stakedAmount * slashPct[offense]) / 10000;
    
    // 50% burn, 50% treasury
    uint256 burnAmount = slashAmount / 2;
    uint256 treasuryAmount = slashAmount - burnAmount;
    
    registry.slash(engineId, slashAmount);
    // Burn: send to dead address or implement burn()
    // Transfer to treasury
    
    emit SlashExecuted(engineId, slashAmount);
  }
}
```

### 2.5 SubscriptionPayment.sol

```solidity
contract SubscriptionPayment {
  struct Subscription {
    address subscriber;
    bytes32 engineId;
    uint256 expiresAt;
  }
  
  mapping(address => mapping(bytes32 => uint256)) public expiryOf;  // subscriber=>engine=>expiry
  
  IERC20 public immutable paymentToken;  // USDC
  uint256 public constant MONTHLY_FEE = 49 * 10**6;  // $49 USDC
  uint16 public constant ENGINE_SHARE_BPS = 8000;    // 80%
  uint16 public constant PROTOCOL_SHARE_BPS = 2000;  // 20%
  
  EngineRegistry public immutable registry;
  address public treasury;
  
  event Subscribed(
    address indexed subscriber, 
    bytes32 indexed engineId, 
    uint256 expiry
  );
  
  function subscribe(bytes32 engineId, uint256 months) external {
    require(months > 0 && months <= 12, "invalid duration");
    uint256 total = MONTHLY_FEE * months;
    
    paymentToken.transferFrom(msg.sender, address(this), total);
    
    // Split fee
    uint256 engineAmt = (total * ENGINE_SHARE_BPS) / 10000;
    uint256 protoAmt = total - engineAmt;
    
    address operator = registry.engines(engineId).operator;
    paymentToken.transfer(operator, engineAmt);
    paymentToken.transfer(treasury, protoAmt);
    
    uint256 currentExpiry = expiryOf[msg.sender][engineId];
    uint256 newExpiry = (currentExpiry > block.timestamp ? currentExpiry : block.timestamp) 
                     + (months * 30 days);
    expiryOf[msg.sender][engineId] = newExpiry;
    
    emit Subscribed(msg.sender, engineId, newExpiry);
  }
  
  function isSubscribed(address user, bytes32 engineId) 
    external 
    view 
    returns (bool) 
  {
    return expiryOf[user][engineId] > block.timestamp;
  }
}
```

---

## 3. Off-chain Python Components

### 3.1 Signal Publisher

**Location**: Cogochi engine repo, new module `signal_publisher.py`

```python
# signal_publisher.py

from web3 import Web3
from eth_account import Account
import hashlib
import secrets
import time

class SignalPublisher:
    def __init__(
        self, 
        rpc_url: str, 
        engine_id: bytes, 
        operator_pk: str,
        commit_reveal_address: str,
        commit_reveal_abi: list
    ):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.account = Account.from_key(operator_pk)
        self.engine_id = engine_id
        self.contract = self.w3.eth.contract(
            address=commit_reveal_address,
            abi=commit_reveal_abi
        )
    
    def publish_signal(
        self, 
        asset: str, 
        direction: bool,
        tp_bps: int,
        sl_bps: int,
        valid_until: int
    ):
        # Generate random nonce
        nonce = int.from_bytes(secrets.token_bytes(32), "big")
        
        # Compute commit hash
        commit_hash = Web3.solidity_keccak(
            ["string", "bool", "uint256", "uint256", "uint256", "uint256"],
            [asset, direction, tp_bps, sl_bps, valid_until, nonce]
        )
        
        # Commit phase
        tx = self.contract.functions.commitSignal(
            self.engine_id, commit_hash
        ).build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address),
            "gas": 200000,
            "maxFeePerGas": self.w3.eth.gas_price,
        })
        
        signed = self.account.sign_transaction(tx)
        commit_tx = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(commit_tx)
        
        # Extract commitId from event
        commit_id = self._parse_commit_event(receipt)
        
        # Wait 15 seconds (within reveal window)
        time.sleep(15)
        
        # Reveal phase
        reveal_tx = self.contract.functions.revealSignal(
            commit_id, asset, direction, tp_bps, sl_bps, valid_until, nonce
        ).build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address),
            "gas": 300000,
            "maxFeePerGas": self.w3.eth.gas_price,
        })
        
        signed_reveal = self.account.sign_transaction(reveal_tx)
        reveal_receipt = self.w3.eth.send_raw_transaction(signed_reveal.raw_transaction)
        
        return {
            "commit_id": commit_id.hex(),
            "commit_tx": commit_tx.hex(),
            "reveal_tx": reveal_receipt.hex(),
            "asset": asset,
            "direction": direction,
            "timestamp": int(time.time()),
        }
    
    def _parse_commit_event(self, receipt) -> bytes:
        # Parse SignalCommitted event from receipt logs
        event_filter = self.contract.events.SignalCommitted.process_receipt(receipt)
        return event_filter[0]["args"]["commitId"]
```

**Integration point**: Cogochi 엔진의 signal generation loop에서 4-stage gate 통과 시마다 호출.

```python
# In engine main loop
if signal.passed_all_gates():
    publisher.publish_signal(
        asset=signal.asset,
        direction=signal.is_long,
        tp_bps=signal.tp_bps,
        sl_bps=signal.sl_bps,
        valid_until=int(time.time()) + signal.duration_seconds
    )
```

### 3.2 Outcome Resolver Bot

**Purpose**: 주기적으로 revealed signal 중 validUntil 지난 것이나 TP/SL 도달 것을 on-chain resolve.

```python
# outcome_resolver.py

class OutcomeResolver:
    def __init__(self, indexer_api, performance_contract):
        self.indexer = indexer_api
        self.contract = performance_contract
    
    def run_loop(self):
        while True:
            # Get all revealed but unresolved signals
            pending = self.indexer.get_pending_signals()
            
            for signal in pending:
                if self._is_resolvable(signal):
                    try:
                        self.contract.functions.resolveSignal(
                            signal["commit_id"]
                        ).transact()
                    except Exception as e:
                        log.error(f"resolve failed: {e}")
            
            time.sleep(60)  # 1-min cadence
    
    def _is_resolvable(self, signal) -> bool:
        now = int(time.time())
        if now >= signal["valid_until"]:
            return True
        # Check TP/SL via oracle
        current_price = self._get_oracle_price(signal["asset"])
        if signal["direction"]:  # long
            pnl_bps = ((current_price * 10000) // signal["entry_price"]) - 10000
        else:
            pnl_bps = 10000 - ((current_price * 10000) // signal["entry_price"])
        
        if pnl_bps >= signal["tp_bps"] or pnl_bps <= -signal["sl_bps"]:
            return True
        return False
```

---

## 4. Indexer

### 4.1 Schema

```typescript
// Prisma schema
model Engine {
  engineId        String    @id
  operator        String
  metadataHash    String
  stakedAmount    BigInt
  registeredAt    DateTime
  status          String
  
  commits         Commit[]
  stats           EngineStats?
}

model Commit {
  commitId        String    @id
  engineId        String
  engine          Engine    @relation(fields: [engineId], references: [engineId])
  commitHash      String
  commitTime      DateTime
  revealed        Boolean
  
  reveal          Reveal?
}

model Reveal {
  commitId        String    @id
  commit          Commit    @relation(fields: [commitId], references: [commitId])
  asset           String
  direction       Boolean
  entryPrice      BigInt
  tpBps           Int
  slBps           Int
  validUntil      DateTime
  nonce           BigInt
  revealTime      DateTime
  
  outcome         Outcome?
}

model Outcome {
  commitId        String    @id
  reveal          Reveal    @relation(fields: [commitId], references: [commitId])
  outcomeType     String    // "Hit" | "Miss" | "Timeout"
  pnlBps          Int
  resolvedAt      DateTime
  finalPrice      BigInt
}

model EngineStats {
  engineId        String    @id
  engine          Engine    @relation(fields: [engineId], references: [engineId])
  totalSignals    Int
  hits            Int
  misses          Int
  timeouts        Int
  cumulativePnLBps Int
  rolling90DayPnL Int
  rolling90DaySharpe Float
  maxDrawdownBps  Int
  updatedAt       DateTime
}

model Subscription {
  id              String    @id @default(uuid())
  subscriber      String
  engineId        String
  expiresAt       DateTime
  createdAt       DateTime
}
```

### 4.2 Event Listener

```typescript
import { createPublicClient, webSocket, parseAbiItem } from 'viem';
import { arbitrum } from 'viem/chains';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const client = createPublicClient({
  chain: arbitrum,
  transport: webSocket(process.env.WS_RPC_URL!),
});

async function startIndexer() {
  // Listen to EngineRegistered
  client.watchEvent({
    address: ENGINE_REGISTRY_ADDR,
    event: parseAbiItem('event EngineRegistered(bytes32 indexed engineId, address indexed operator)'),
    onLogs: async (logs) => {
      for (const log of logs) {
        await prisma.engine.create({
          data: {
            engineId: log.args.engineId!,
            operator: log.args.operator!,
            metadataHash: await fetchMetadata(log.args.engineId!),
            stakedAmount: BigInt(5000 * 10**6),  // fetched from contract
            registeredAt: new Date(),
            status: 'Active',
          }
        });
      }
    },
  });
  
  // Similar for SignalCommitted, SignalRevealed, SignalResolved, Subscribed
  // ...
}
```

### 4.3 REST/GraphQL API

**Endpoints**:
```
GET /api/engines                      # List all engines
GET /api/engines/:id                  # Engine detail
GET /api/engines/:id/signals          # Engine signals
GET /api/engines/:id/stats            # Performance stats
GET /api/signals                      # All signals (paginated)
GET /api/signals/:commitId            # Signal detail
GET /api/subscriptions/:wallet        # User subscriptions
```

---

## 5. Frontend (Next.js)

### 5.1 Pages

**Primary pages** (MVP):
1. `/` — Landing (hero, live signal count, top engine)
2. `/engines` — Engine list with filter (Sharpe, 30d PnL)
3. `/engines/[id]` — Engine detail (stats, recent signals)
4. `/signals` — Live signal feed (all engines)
5. `/signals/[commitId]` — Signal detail (commit, reveal, outcome)
6. `/my-subscriptions` — Wallet-connected user's active subs

**Secondary** (Phase 2 preview):
- `/vault` — "Coming soon" landing page

### 5.2 Tech

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "wagmi": "^2.5.0",
    "viem": "^2.7.0",
    "@rainbow-me/rainbowkit": "^2.0.0",
    "swr": "^2.2.0",
    "recharts": "^2.12.0"
  }
}
```

### 5.3 Key Components

```typescript
// components/EngineCard.tsx
interface EngineCardProps {
  engine: Engine;
  stats: EngineStats;
}

// components/SignalFeed.tsx - real-time signal stream
// components/PerformanceChart.tsx - Sharpe/PnL over time
// components/SubscribeButton.tsx - USDC approve + subscribe flow
// components/WalletConnect.tsx - RainbowKit integration
```

---

## 6. Deployment & Testing

### 6.1 Development Milestones

| Week | Milestone |
|------|-----------|
| 1-2 | Contracts written + unit tests |
| 3-4 | Integration tests + local deployment |
| 5-6 | Arbitrum Sepolia testnet deployment |
| 7-8 | Off-chain components (publisher, resolver) |
| 9-10 | Indexer + frontend |
| 11-12 | E2E testing on testnet |
| 13-14 | Audit submission |
| 15-18 | Audit remediation |
| 19-20 | Arbitrum mainnet deployment |
| 21-24 | Beta launch + monitoring |

### 6.2 Testing Strategy

**목표**: Audit submission 시점까지 Critical/High 0개. Audit는 sanity check이지 bug 찾는 곳 아님.

#### 6.2.1 Unit Test 요건 (Foundry)

**Coverage target**:
- State-changing functions: 100%
- View functions: 95%+
- Error paths: 100% (모든 `require`, `revert` branch)

**Test file 구조** (per contract):
```
test/
├── EngineRegistry.t.sol
│   ├── Happy path tests        (register, unstake, withdraw)
│   ├── Revert path tests        (double register, under-stake, ...)
│   ├── Access control tests     (only operator, only governance)
│   ├── State transition tests   (Active → Paused → Slashed)
│   └── Fuzz tests               (random stake amounts)
├── SignalCommitReveal.t.sol
├── PerformanceScoreboard.t.sol
├── SlashingEngine.t.sol
└── SubscriptionPayment.t.sol
```

**필수 Unit test 예시** (EngineRegistry):

```solidity
// test/EngineRegistry.t.sol
contract EngineRegistryTest is Test {
    EngineRegistry registry;
    MockERC20 token;
    address operator = address(0x1);
    address governance = address(0x2);
    
    function setUp() public {
        token = new MockERC20();
        registry = new EngineRegistry(address(token), governance);
        token.mint(operator, 100_000 * 10**6);
    }
    
    // Happy path
    function test_Register_Success() public {
        bytes32 engineId = keccak256("engine1");
        vm.startPrank(operator);
        token.approve(address(registry), 5000 * 10**6);
        registry.registerEngine(engineId, bytes32(0), 5000 * 10**6);
        vm.stopPrank();
        
        (address op,, uint256 stake,, EngineRegistry.EngineStatus status,) 
            = registry.engines(engineId);
        assertEq(op, operator);
        assertEq(stake, 5000 * 10**6);
        assertEq(uint(status), uint(EngineRegistry.EngineStatus.Active));
    }
    
    // Revert path
    function test_Register_RevertsUnderMinStake() public {
        vm.startPrank(operator);
        token.approve(address(registry), 4999 * 10**6);
        vm.expectRevert("insufficient stake");
        registry.registerEngine(bytes32("x"), bytes32(0), 4999 * 10**6);
        vm.stopPrank();
    }
    
    function test_Register_RevertsDuplicateId() public {
        _register(operator, bytes32("dup"), 5000 * 10**6);
        vm.startPrank(operator);
        token.approve(address(registry), 5000 * 10**6);
        vm.expectRevert("exists");
        registry.registerEngine(bytes32("dup"), bytes32(0), 5000 * 10**6);
        vm.stopPrank();
    }
    
    // State transition
    function test_UnstakeFlow_RespectsCooldown() public {
        bytes32 id = bytes32("flow");
        _register(operator, id, 5000 * 10**6);
        
        vm.prank(operator);
        registry.requestUnstake(id);
        
        // Cooldown not elapsed
        vm.prank(operator);
        vm.expectRevert("cooldown");
        registry.withdrawStake(id);
        
        // Fast-forward 28 days
        vm.warp(block.timestamp + 28 days);
        
        vm.prank(operator);
        registry.withdrawStake(id);
        assertEq(token.balanceOf(operator), 100_000 * 10**6);
    }
    
    // Access control
    function test_Slash_OnlyGovernance() public {
        bytes32 id = bytes32("slash");
        _register(operator, id, 5000 * 10**6);
        
        vm.prank(operator);
        vm.expectRevert("not governance");
        registry.slash(id, 1000 * 10**6);
    }
    
    // Fuzz
    function testFuzz_Register_AnyValidStake(uint256 amount) public {
        amount = bound(amount, 5000 * 10**6, 1_000_000 * 10**6);
        token.mint(operator, amount);
        
        vm.startPrank(operator);
        token.approve(address(registry), amount);
        registry.registerEngine(keccak256(abi.encode(amount)), bytes32(0), amount);
        vm.stopPrank();
    }
}
```

**Fuzz test 대상**:
- PnL calculation (direction × price 다양한 입력)
- Slash amount (stakedAmount × pct / 10000 overflow 체크)
- Subscription duration (1~12개월)
- Reveal window 경계 (29, 30, 31, 60, 61초)

#### 6.2.2 Invariant Tests

**Foundry invariant fuzzing**. 모든 state transition 후 유지되어야 할 속성.

```solidity
// test/invariants/EngineRegistryInvariants.t.sol
contract EngineRegistryInvariantTest is Test {
    EngineRegistry registry;
    EngineRegistryHandler handler;
    
    function setUp() public {
        registry = new EngineRegistry(...);
        handler = new EngineRegistryHandler(registry);
        targetContract(address(handler));
    }
    
    // Invariant 1: Token balance >= sum of stakes
    function invariant_TokenBalanceCoversStakes() public {
        uint256 totalStaked = handler.sumOfAllStakes();
        assertGe(token.balanceOf(address(registry)), totalStaked);
    }
    
    // Invariant 2: Slashed engine cannot publish signals
    function invariant_SlashedCannotPublish() public {
        bytes32[] memory slashed = handler.slashedEngines();
        for (uint i = 0; i < slashed.length; i++) {
            vm.expectRevert();
            commitReveal.commitSignal(slashed[i], bytes32(0));
        }
    }
    
    // Invariant 3: Cooldown period cannot be bypassed
    function invariant_CooldownRespected() public {
        // ...
    }
}
```

**Invariants per contract**:

| Contract | Invariants |
|----------|-----------|
| EngineRegistry | Token balance ≥ Σ stakes; Slashed engine inactive; Cooldown respected |
| SignalCommitReveal | commitId uniqueness; Reveal only after commit; Hash matches |
| PerformanceScoreboard | totalSignals = hits + misses + timeouts; Cumulative PnL = Σ individual PnLs |
| SlashingEngine | Slashed amount ≤ staked amount; Burn + treasury = total slashed |
| SubscriptionPayment | Expiry only extends, never shortens; Split sums to 100% |

#### 6.2.3 Integration Tests

**Multi-contract flow tests**. 컨트랙트 간 상호작용이 맞는지.

```solidity
// test/integration/FullSignalLifecycle.t.sol
function test_FullSignalLifecycle_HitScenario() public {
    // 1. Register engine
    bytes32 engineId = _registerEngine(operator, 5000 * 10**6);
    
    // 2. Commit signal
    bytes32 nonce = keccak256("nonce1");
    bytes32 commitHash = keccak256(
        abi.encodePacked("BTC", true, uint256(200), uint256(100), block.timestamp + 1 hours, nonce)
    );
    
    vm.prank(operator);
    bytes32 commitId = commitReveal.commitSignal(engineId, commitHash);
    
    // 3. Wait + Reveal
    vm.warp(block.timestamp + 15);
    vm.prank(operator);
    commitReveal.revealSignal(commitId, "BTC", true, 200, 100, block.timestamp + 1 hours, uint256(nonce));
    
    // 4. Simulate price movement (oracle mock)
    vm.warp(block.timestamp + 30 minutes);
    oracle.setPrice("BTC", 50000 * 10**8);  // entry was at 49000
    
    // 5. Resolve (should be Hit)
    scoreboard.resolveSignal(commitId);
    
    // 6. Verify stats updated
    (uint256 total, uint256 hits,,,int256 cumPnL,,,,) = scoreboard.engineStats(engineId);
    assertEq(total, 1);
    assertEq(hits, 1);
    assertGt(cumPnL, 0);
}

function test_FullSignalLifecycle_MissScenario() public { /* ... */ }
function test_FullSignalLifecycle_TimeoutScenario() public { /* ... */ }
function test_FullSignalLifecycle_RevealTooLate() public { /* ... */ }
function test_FullSignalLifecycle_HashMismatch() public { /* ... */ }
```

**필수 Integration 시나리오**:
- Signal lifecycle: Hit / Miss / Timeout / 취소 / Late reveal / Hash mismatch
- Subscription payment: 정상 / 갱신 / 만료 / Engine slash 후 환불 정책
- Slashing: False attestation detection → governance vote → execute
- Multi-engine competition: 동일 asset, 반대 signal, 결과 비교
- Reentrancy attacks: Mock malicious token/oracle로 reentrancy 시도

#### 6.2.4 E2E Test (Arbitrum Sepolia)

**Cogochi engine + full stack 연동 테스트**. Sepolia 배포 후 실제 트래픽 생성.

**Test scenario (30일 지속)**:

```
Day 1-3: 
  - Deploy all contracts to Sepolia
  - Register Cogochi engine
  - Deploy indexer, connect to RPC
  - Deploy frontend, connect to indexer

Day 4-14 (Signal generation):
  - Cogochi engine 24/7 run
  - 100+ signals publish
  - Commit-reveal cycle 모든 signal 완료 확인
  - Oracle resolution 모든 signal 대해 확인

Day 15-20 (Subscription flow):
  - 10 test wallets subscribe
  - USDC payment 흐름 확인
  - Engine vs protocol share 분배 확인

Day 21-25 (Failure scenario):
  - Intentional reveal fail (commit 후 30초 넘김)
  - Hash mismatch 시도
  - Engine pause/unstake flow
  - Slash scenario (manual governance)

Day 26-30 (Performance validation):
  - Dune dashboard 데이터 정합성 확인
  - Frontend render 정합성 확인
  - Gas 실측 + optimization 검토
```

**E2E Pass criteria**:
- 0 unresolved signals (모든 signal이 Hit/Miss/Timeout 중 하나로 종결)
- 100% commit-reveal 성공률 (Network failure 제외)
- Indexer lag < 30초
- Frontend display 정확도 100%

#### 6.2.5 Gas Benchmarks

**목표**: Arbitrum 기준 reasonable gas. 각 function 측정:

| Function | Target Gas (Arbitrum) | Acceptable | 비고 |
|----------|----------------------|-----------|------|
| registerEngine | < 150k | < 200k | Storage slot 3개 |
| commitSignal | < 80k | < 120k | Storage 1개 + event |
| revealSignal | < 120k | < 180k | Hash compute + oracle read |
| resolveSignal | < 200k | < 280k | Oracle + stats update |
| subscribe | < 100k | < 150k | Transfer × 3 |
| slash (governance) | < 180k | < 250k | Multiple transfer + burn |

**Gas 최적화 원칙**:
- Storage packing (uint256를 uint128 × 2로 합칠 수 있는지 검토)
- Events로 off-chain 데이터 push (storage 대신)
- Calldata > memory > storage
- 단 readability 희생은 minimum

**Benchmarking script**:
```bash
# foundry.toml
[profile.default]
gas_reports = ["EngineRegistry", "SignalCommitReveal", ...]

# 실행
forge test --gas-report
```

#### 6.2.6 Security-Specific Tests

**Reentrancy**:
- External call 있는 function마다 `nonReentrant` modifier
- Test: Mock malicious contract가 callback으로 다시 호출 시도

**Oracle manipulation**:
- Chainlink price feed의 `latestRoundData()` stale 체크
- `updatedAt < block.timestamp - 1 hour` 시 reject
- Test: Mock oracle로 stale data 리턴 시 revert 확인

**Signature / hash validation**:
- `ecrecover` 쓰는 곳 (없으면 skip, commit-reveal은 hash만)
- Replay attack: nonce 검증

**Access control**:
- `onlyGovernance`, `onlyOperator` modifier 모든 write function 감싸기
- Test: 권한 없는 address가 호출 시 revert

**Overflow/Underflow**:
- Solidity 0.8.24는 기본 safe. But `unchecked` block은 명시적 검토
- Fuzz test with boundary values (0, type(uint256).max)

#### 6.2.7 Pre-Audit Checklist

Audit 제출 전 내부 확인:

- [ ] Unit test coverage 100% (state-changing) / 95%+ (view)
- [ ] Invariant test 실행 (-fuzz-runs=10000 이상 통과)
- [ ] Integration test 모든 lifecycle scenario 통과
- [ ] E2E test 30일 Sepolia 무사고
- [ ] Gas benchmark target 범위 내
- [ ] Slither static analysis 0 Critical/High
- [ ] Mythril 분석 0 Critical/High
- [ ] Surya 호출 그래프 검토 (circular dependency 없음)
- [ ] 모든 external function NatSpec docstring 작성
- [ ] README + ARCHITECTURE.md 작성 (auditor용)
- [ ] Threat model document 작성

#### 6.2.8 Post-Audit Remediation

**기대되는 typical findings**:
- Gas optimization suggestions (Low/Informational) — ~5-10건
- Code quality issues (Informational) — ~3-5건
- Medium findings — ~1-3건 (보통 edge case)
- Critical/High — **0건이 목표**. 1건이라도 나오면 근본 수정

**Remediation 후**:
- Re-audit or fix verification (auditor)
- Final report 공개
- Bug bounty 동시 시작 (Immunefi)

### 6.3 Audit Scope

**Scope for Audit 1**:
- All 5 L1 contracts
- Storage patterns, access control
- Reentrancy, integer overflow
- Oracle manipulation resistance
- Gas optimization review (secondary)

**Out of scope**:
- Off-chain components
- Frontend
- Indexer

**Target auditors**:
- OpenZeppelin (premium, $80-120k)
- Consensys Diligence ($60-100k)
- Trail of Bits ($60-100k)
- Zellic ($50-80k, newer)
- Spearbit ($40-80k, competitive contest model)

**Budget**: $60k target.

### 6.4 Deployment Checklist

**Before mainnet**:
- [ ] All audit findings addressed
- [ ] Governance multi-sig (4/7) 구성
- [ ] Treasury multi-sig 분리
- [ ] Emergency pause 테스트
- [ ] Chainlink oracle 연동 검증
- [ ] Gas 추정 + budget reserve
- [ ] Documentation 공개
- [ ] Bug bounty program launched
- [ ] Insurance consideration (Nexus Mutual)

**Post-mainnet**:
- Daily monitoring (Grafana / Prometheus)
- Weekly metrics report
- Monthly engine performance review
- Quarterly community update

---

## 7. Monitoring & Operations

### 7.1 Critical Metrics

**Protocol health**:
- Active engines count
- Signals per day
- Signal resolution lag (reveal → outcome)
- Oracle uptime

**Engine health**:
- Uptime (heartbeat)
- Signal latency
- Stake balance
- Performance trend

**User health**:
- New wallet count
- Active subscriptions
- Subscription churn

### 7.2 Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| Engine inactive | > 24h no signal | Notify operator |
| Oracle stale | > 1h no update | Emergency pause option |
| Chainlink deviation | > 5% vs CEX | Investigate |
| Subscriber complaint | any | Triage |
| Contract event anomaly | reentrancy-like | Emergency pause |

### 7.3 Incident Response Plan

**Severity levels**:
- P0: Funds at risk → immediate pause
- P1: Performance degraded → investigate within 4h
- P2: Minor UX issue → fix in next deploy
- P3: Cosmetic → backlog

**Runbook** (post-mainnet 작성):
- Smart contract pause procedure
- Key rotation procedure
- Governance emergency vote
- Communications (Discord, Twitter)

---

## 8. Non-Goals (재확인)

**MVP에서 안 함**:
- Layer 2 Vault (Phase 2)
- Token TGE (conditional)
- Third-party engine onboarding UX (Phase 1.5)
- Mobile app
- Multi-chain (Arbitrum only)
- 한국어 UI
- KYC flow
- Advanced engine analytics (heat map, correlation)
- Backtesting as a service

---

## 9. Open Questions

1. **Engine stake denomination**: Pre-TGE USDC vs USDT vs DAI?
   - Recommendation: USDC (widest support, regulatory clarity)

2. **Reveal window optimal**: 30초 vs 60초?
   - Start 30초, monitor MEV behavior

3. **Oracle primary**: Chainlink vs Pyth?
   - Chainlink for MVP (Arbitrum coverage). Pyth fallback post-launch.

4. **Indexer: Custom vs TheGraph?**
   - Custom for faster iteration (TheGraph setup 시간 들어감)

5. **Frontend hosting**: Vercel vs own infra?
   - Vercel for MVP speed

---

## 10. References

[1] Cogochi Whitepaper v2 (03_Whitepaper_Lite.md)
[2] Cogochi Tokenomics v2 (04_Tokenomics.md)
[3] ERC-4626 Tokenized Vault Standard
[4] Chainlink Price Feeds — Arbitrum
[5] Foundry Book
[6] OpenZeppelin Contracts 5.0
[7] wagmi + viem docs

---

## Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-23 | Initial Registry-based spec (archived) |
| 2.0 | 2026-04-23 | Marketplace rewrite: commit-reveal, staking, slashing |
| **2.1** | **2026-04-23** | **Testing strategy 전면 확장 (unit/invariant/integration/E2E/gas/security), pre-audit checklist** |

---

**End of Product Spec v2**
