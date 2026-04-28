# Cogochi Protocol — L2 Router Vault Spec

**Version**: 1.0 (draft)
**Date**: 2026-04-23
**Status**: Phase 2 design, Month 7-12 build scope
**Scope**: Layer 2 Router Vault (ERC-4626 + multi-engine + Hyperliquid execution)
**Reader**: 엔지니어, VC 기술파트너
**Prerequisite**: 05_Product_Spec_MVP.md (L1 완성 전제)

---

## 0. Scope

### 0.1 In Scope

- ERC-4626 compliant vault smart contract (Arbitrum)
- Multi-engine signal aggregation 로직 (L1 Scoreboard 기반)
- Hyperliquid builder code 연동 (execution layer)
- Performance fee 분배 (70/15/15)
- High-Water Mark 메커니즘
- Auto-rebalancing 트리거
- Emergency pause / circuit breaker
- L2 indexer (L1 인덱서 확장)
- L2 frontend (deposit/withdraw/stats)

### 0.2 Out of Scope (Phase 3/4로 연기)

- Cross-chain vault (Base, Solana)
- Multi-asset vault (BTC/ETH/SOL 동시)
- Leveraged vault (>3x)
- Aggregator (L3)
- Mobile app
- Options / structured products

### 0.3 Success Criteria (Month 12)

- [ ] L2 vault Arbitrum mainnet 배포 + verified
- [ ] Audit 2 complete (Critical/High 0)
- [ ] Hyperliquid builder code integration tested
- [ ] 2+ engines 활성화 with weight > 10%
- [ ] TVL $3M+ (sustained 30일)
- [ ] 50+ deposits from unique wallets
- [ ] HWM 메커니즘 정확 작동 (손실 구간 fee 0)
- [ ] Rebalancing weekly execution 무사고

### 0.4 Dependencies

- L1 contracts live (EngineRegistry, CommitReveal, Scoreboard, Slashing)
- Cogochi engine 60일+ live track record (Sharpe > 1.0)
- Chainlink oracle Arbitrum coverage
- Hyperliquid builder code enrollment (apply + approval)
- Audit 2 완료

---

## 1. Architecture

### 1.1 Component Diagram

```
                      ┌────────────────────────┐
                      │  User Wallet           │
                      │  (deposit USDC)        │
                      └──────────┬─────────────┘
                                 ↓
     ┌───────────────────────────────────────────────────┐
     │  RouterVault.sol (ERC-4626)                       │
     │  ├─ Deposit / Withdraw                            │
     │  ├─ Share accounting (HWM per user)               │
     │  ├─ Performance fee on positive PnL               │
     │  └─ Emergency pause                               │
     └────────────┬───────────────────────┬──────────────┘
                  ↓                       ↓
     ┌────────────────────┐  ┌────────────────────────┐
     │ EngineOrchestrator │  │ HyperliquidExecutor    │
     │ .sol               │  │ .sol                   │
     │ ├─ Read L1 Score   │  │ ├─ Builder code API    │
     │ ├─ Compute weights │  │ ├─ Position tracking   │
     │ └─ Trigger rebal   │  │ └─ Settlement          │
     └─────────┬──────────┘  └───────────┬────────────┘
               ↓                         ↓
     ┌────────────────────┐  ┌────────────────────────┐
     │ L1 Scoreboard      │  │ Hyperliquid Chain      │
     │ (existing)         │  │ (perp execution)       │
     └────────────────────┘  └────────────────────────┘
```

### 1.2 Value Flow

```
User USDC → RouterVault → vault shares issued
                       ↓
                   Engine signal (from L1)
                       ↓
              EngineOrchestrator computes allocation:
                weight[engine] × capacity_utilization × vault_balance
                       ↓
              HyperliquidExecutor opens position
                       ↓
              Position held until TP / SL / timeout
                       ↓
              Settlement → vault PnL update → share price update
                       ↓
              If share price > user HWM:
                perf fee 15% of gain
                ├─ 70% primary engine
                ├─ 15% secondary engines
                └─ 15% protocol
              User HWM reset to new share price
```

### 1.3 Key Design Decisions

**Decision 1: ERC-4626 compliance**
- DeFi composability (외부 protocol이 vault share 사용 가능)
- 표준 interface → audit 비용 감소
- 일부 vault-specific 기능은 extension으로

**Decision 2: Off-chain orchestrator vs on-chain**
- On-chain pure: gas 비쌈, Chainlink 의존
- Off-chain: gas 저렴, trust 리스크 (operator가 잘못된 weight 적용)
- **선택**: Hybrid. Weight 계산은 off-chain, 최종 execute는 on-chain verification
- Signature: Cogochi team multi-sig으로 weight 발표 → vault가 검증 → execute

**Decision 3: Hyperliquid builder code**
- 일반 유저처럼 wallet으로 직접 trading API 호출 가능
- 하지만 builder code는 더 유연: sub-account 관리, fee 할인
- **선택**: Builder code enrollment 시도, 거부되면 plain wallet

**Decision 4: User-level vs Vault-level HWM**
- Vault-level: 단순. 하지만 late entrant가 early investor의 손실 회복에 기여
- User-level: 공정. 하지만 구현 복잡
- **선택**: User-level HWM. 각 deposit 당 entry share price 기록, withdrawal 시 gain 계산

---

## 2. Smart Contracts

### 2.1 RouterVault.sol (ERC-4626)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract RouterVault is ERC4626, ReentrancyGuard, Pausable {
    using FixedPointMathLib for uint256;
    
    struct UserEntry {
        uint256 shares;              // total shares held
        uint256 entryHWM;            // weighted avg share price on deposit
        uint256 lastInteraction;     // last deposit/withdraw timestamp
    }
    
    mapping(address => UserEntry) public userEntries;
    
    uint256 public constant PERF_FEE_BPS = 1500;        // 15%
    uint256 public constant PRIMARY_ENGINE_BPS = 7000;  // 70% of perf fee
    uint256 public constant SECONDARY_ENGINE_BPS = 1500; // 15%
    uint256 public constant PROTOCOL_BPS = 1500;         // 15%
    
    address public engineOrchestrator;
    address public hyperliquidExecutor;
    address public protocolTreasury;
    
    uint256 public maxTVL = 5_000_000 * 10**6;   // $5M initial cap
    uint256 public totalPnLBps;                   // cumulative PnL in bps
    uint256 public lastRebalanceAt;
    
    event Deposited(address indexed user, uint256 assets, uint256 shares, uint256 newHWM);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares, uint256 feeCharged);
    event PerformanceFeeCharged(
        address indexed user,
        uint256 gain,
        uint256 toPrimary,
        uint256 toSecondary,
        uint256 toProtocol
    );
    
    constructor(
        IERC20 asset_,                  // USDC
        string memory name_,            // "Cogochi Vault Share"
        string memory symbol_,          // "cgVAULT"
        address orchestrator_,
        address executor_,
        address treasury_
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        engineOrchestrator = orchestrator_;
        hyperliquidExecutor = executor_;
        protocolTreasury = treasury_;
    }
    
    // ---- Deposit ----
    
    function deposit(uint256 assets, address receiver) 
        public 
        override 
        whenNotPaused 
        nonReentrant 
        returns (uint256 shares) 
    {
        require(totalAssets() + assets <= maxTVL, "TVL cap exceeded");
        
        shares = previewDeposit(assets);
        _deposit(msg.sender, receiver, assets, shares);
        
        // Update user HWM (weighted avg)
        UserEntry storage entry = userEntries[receiver];
        uint256 currentSharePrice = _sharePrice();
        
        if (entry.shares == 0) {
            entry.entryHWM = currentSharePrice;
        } else {
            // Weighted average: new HWM based on share-weighted entry
            uint256 oldWeight = entry.shares * entry.entryHWM;
            uint256 newWeight = shares * currentSharePrice;
            entry.entryHWM = (oldWeight + newWeight) / (entry.shares + shares);
        }
        
        entry.shares += shares;
        entry.lastInteraction = block.timestamp;
        
        emit Deposited(receiver, assets, shares, entry.entryHWM);
    }
    
    // ---- Withdraw (with perf fee) ----
    
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        shares = previewWithdraw(assets);
        UserEntry storage entry = userEntries[owner];
        require(entry.shares >= shares, "insufficient shares");
        
        // Calculate perf fee on gain
        uint256 currentSharePrice = _sharePrice();
        uint256 feeCharged = 0;
        
        if (currentSharePrice > entry.entryHWM) {
            // Gain occurred
            uint256 gainPerShare = currentSharePrice - entry.entryHWM;
            uint256 totalGain = (gainPerShare * shares) / 1e18;
            feeCharged = (totalGain * PERF_FEE_BPS) / 10000;
            
            _distributePerfFee(feeCharged);
        }
        
        // Burn shares, transfer assets (minus fee)
        _withdraw(msg.sender, receiver, owner, assets - feeCharged, shares);
        
        entry.shares -= shares;
        entry.lastInteraction = block.timestamp;
        
        emit Withdrawn(receiver, assets - feeCharged, shares, feeCharged);
    }
    
    // ---- Performance fee distribution ----
    
    function _distributePerfFee(uint256 totalFee) internal {
        if (totalFee == 0) return;
        
        uint256 toPrimary = (totalFee * PRIMARY_ENGINE_BPS) / 10000;
        uint256 toSecondary = (totalFee * SECONDARY_ENGINE_BPS) / 10000;
        uint256 toProtocol = totalFee - toPrimary - toSecondary;
        
        address primaryEngine = IEngineOrchestrator(engineOrchestrator).primaryEngine();
        address[] memory secondaryEngines = IEngineOrchestrator(engineOrchestrator).secondaryEngines();
        
        IERC20(asset()).transfer(primaryEngine, toPrimary);
        
        // Split secondary among N engines proportional to weight
        if (secondaryEngines.length > 0) {
            uint256 perEngine = toSecondary / secondaryEngines.length;
            for (uint i = 0; i < secondaryEngines.length; i++) {
                IERC20(asset()).transfer(secondaryEngines[i], perEngine);
            }
        }
        
        IERC20(asset()).transfer(protocolTreasury, toProtocol);
        
        emit PerformanceFeeCharged(
            msg.sender, totalFee, toPrimary, toSecondary, toProtocol
        );
    }
    
    // ---- Share price ----
    
    function _sharePrice() internal view returns (uint256) {
        if (totalSupply() == 0) return 1e18;
        return (totalAssets() * 1e18) / totalSupply();
    }
    
    // ---- Total assets (includes Hyperliquid positions) ----
    
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 inHL = IHyperliquidExecutor(hyperliquidExecutor).totalPositionValue();
        return idle + inHL;
    }
    
    // ---- Admin ----
    
    function setMaxTVL(uint256 newCap) external onlyGovernance {
        maxTVL = newCap;
    }
    
    function pause() external onlyGovernance {
        _pause();
    }
    
    function emergencyWithdraw() external whenPaused {
        // Pro-rata withdraw, no fee (emergency mode)
        UserEntry storage entry = userEntries[msg.sender];
        require(entry.shares > 0, "no shares");
        
        uint256 userAssets = (totalAssets() * entry.shares) / totalSupply();
        uint256 shares = entry.shares;
        entry.shares = 0;
        
        _burn(msg.sender, shares);
        IERC20(asset()).transfer(msg.sender, userAssets);
    }
}
```

### 2.2 EngineOrchestrator.sol

```solidity
contract EngineOrchestrator {
    struct EngineAllocation {
        bytes32 engineId;
        uint256 weightBps;      // basis points, sum ≤ 10000
        uint256 lastSignalAt;
        bool active;
    }
    
    EngineAllocation[] public allocations;
    mapping(bytes32 => uint256) public engineIdToIndex;  // engineId => index in allocations
    
    PerformanceScoreboard public immutable scoreboard;
    EngineRegistry public immutable registry;
    
    address public primaryEngine;        // set by governance, can change based on perf
    address[] public secondaryEngines;
    
    uint256 public constant MAX_WEIGHT_PER_ENGINE_BPS = 4000;  // 40%
    uint256 public constant REBALANCE_INTERVAL = 7 days;
    uint256 public lastRebalance;
    
    event Rebalanced(bytes32[] engineIds, uint256[] newWeights);
    event PrimaryEngineChanged(address oldPrimary, address newPrimary);
    event EngineAdded(bytes32 indexed engineId, uint256 initialWeight);
    event EngineRemoved(bytes32 indexed engineId);
    
    // ---- Add engine (governance) ----
    
    function addEngine(bytes32 engineId, uint256 initialWeightBps) 
        external 
        onlyGovernance 
    {
        require(initialWeightBps <= MAX_WEIGHT_PER_ENGINE_BPS, "weight too high");
        require(_sumOfWeights() + initialWeightBps <= 10000, "total exceeds 100%");
        
        // Check engine qualifies (Sharpe > 1.0, MDD < 25%, 30+ days live)
        _validateEngineQualifies(engineId);
        
        allocations.push(EngineAllocation({
            engineId: engineId,
            weightBps: initialWeightBps,
            lastSignalAt: 0,
            active: true
        }));
        engineIdToIndex[engineId] = allocations.length - 1;
        
        emit EngineAdded(engineId, initialWeightBps);
    }
    
    // ---- Rebalance (permissioned rebalancer) ----
    
    function rebalance(
        uint256[] calldata newWeightsBps,
        bytes calldata signature  // signed by rebalancer multi-sig
    ) external {
        require(block.timestamp >= lastRebalance + REBALANCE_INTERVAL, "too soon");
        require(newWeightsBps.length == allocations.length, "length mismatch");
        
        // Verify signature (off-chain computation, on-chain verify)
        _verifyRebalanceSignature(newWeightsBps, signature);
        
        uint256 total = 0;
        for (uint i = 0; i < newWeightsBps.length; i++) {
            require(newWeightsBps[i] <= MAX_WEIGHT_PER_ENGINE_BPS, "weight cap");
            allocations[i].weightBps = newWeightsBps[i];
            total += newWeightsBps[i];
        }
        require(total <= 10000, "total > 100%");
        
        lastRebalance = block.timestamp;
        
        bytes32[] memory ids = new bytes32[](allocations.length);
        for (uint i = 0; i < allocations.length; i++) {
            ids[i] = allocations[i].engineId;
        }
        emit Rebalanced(ids, newWeightsBps);
    }
    
    // ---- Signal routing ----
    
    function getEngineWeight(bytes32 engineId) external view returns (uint256) {
        uint256 idx = engineIdToIndex[engineId];
        if (idx >= allocations.length) return 0;
        EngineAllocation memory alloc = allocations[idx];
        if (!alloc.active) return 0;
        return alloc.weightBps;
    }
    
    function totalActiveWeight() external view returns (uint256) {
        uint256 sum = 0;
        for (uint i = 0; i < allocations.length; i++) {
            if (allocations[i].active) {
                sum += allocations[i].weightBps;
            }
        }
        return sum;
    }
    
    // ---- Engine qualification ----
    
    function _validateEngineQualifies(bytes32 engineId) internal view {
        // 1. Engine active in registry
        EngineRegistry.Engine memory e = registry.engines(engineId);
        require(e.status == EngineRegistry.EngineStatus.Active, "engine inactive");
        
        // 2. Minimum signal history
        (uint256 total,,,,,uint256 lastAt,,,) = scoreboard.engineStats(engineId);
        require(total >= 50, "insufficient history");
        require(block.timestamp - lastAt < 7 days, "engine stale");
        
        // 3. Performance threshold (simplified — real implementation needs more)
        // In production, compute Sharpe off-chain and pass as governance proof
        // Here we enforce via governance review + on-chain cumulative check
        // (,,,,int256 cumPnL,,,,) = scoreboard.engineStats(engineId);
        // require(cumPnL > 0, "negative history");
    }
    
    function _sumOfWeights() internal view returns (uint256) {
        uint256 sum = 0;
        for (uint i = 0; i < allocations.length; i++) {
            sum += allocations[i].weightBps;
        }
        return sum;
    }
    
    function _verifyRebalanceSignature(
        uint256[] calldata weights,
        bytes calldata sig
    ) internal view {
        // EIP-712 style sig verification
        // Rebalancer = multi-sig (4/7) in Phase 2, DAO-voted in Phase 3
        // Implementation details ...
    }
}
```

### 2.3 HyperliquidExecutor.sol

**주의**: Hyperliquid는 **자체 L1 체인**. Arbitrum ↔ Hyperliquid 실행은 다음 중 한 방법:

**Option A**: Bridge USDC → Hyperliquid 계정 → HL API 직접 호출 (off-chain)
**Option B**: HyperEVM (Hyperliquid EVM) 사용 → vault가 HyperEVM에 배포됨
**Option C**: Hybrid — Arbitrum vault, off-chain executor가 HL API 호출

**권장**: Option C (Phase 2), 성숙 후 Option B로 이행 (Phase 3+).

```solidity
// Option C: Off-chain executor contract
contract HyperliquidExecutor {
    struct Position {
        bytes32 signalId;
        string asset;
        bool direction;
        uint256 entryPrice;
        uint256 size;
        uint256 openedAt;
        uint256 tpBps;
        uint256 slBps;
        uint256 validUntil;
        PositionStatus status;
    }
    
    enum PositionStatus { Open, Closed, Liquidated }
    
    mapping(bytes32 => Position) public positions;
    bytes32[] public openPositionIds;
    
    uint256 public totalDeployedValue;  // cached, updated by executor bot
    
    address public executorBot;          // off-chain bot address
    address public vault;
    
    event PositionOpened(bytes32 indexed positionId, string asset, uint256 size);
    event PositionClosed(bytes32 indexed positionId, int256 pnl);
    event ValueUpdated(uint256 newValue);
    
    modifier onlyExecutor() {
        require(msg.sender == executorBot, "not executor");
        _;
    }
    
    // ---- Called by executor bot (off-chain) ----
    
    function openPosition(
        bytes32 signalId,
        string calldata asset,
        bool direction,
        uint256 entryPrice,
        uint256 size,
        uint256 tpBps,
        uint256 slBps,
        uint256 validUntil
    ) external onlyExecutor returns (bytes32 positionId) {
        positionId = keccak256(
            abi.encodePacked(signalId, block.timestamp, msg.sender)
        );
        
        positions[positionId] = Position({
            signalId: signalId,
            asset: asset,
            direction: direction,
            entryPrice: entryPrice,
            size: size,
            openedAt: block.timestamp,
            tpBps: tpBps,
            slBps: slBps,
            validUntil: validUntil,
            status: PositionStatus.Open
        });
        openPositionIds.push(positionId);
        
        emit PositionOpened(positionId, asset, size);
    }
    
    function closePosition(
        bytes32 positionId,
        int256 realizedPnL,
        uint256 returnedCapital
    ) external onlyExecutor {
        Position storage pos = positions[positionId];
        require(pos.status == PositionStatus.Open, "not open");
        
        pos.status = PositionStatus.Closed;
        
        // Bridge back USDC from HL to Arbitrum (handled off-chain, this records)
        // Update vault balance
        
        emit PositionClosed(positionId, realizedPnL);
    }
    
    function updateTotalValue(uint256 newValue) external onlyExecutor {
        totalDeployedValue = newValue;
        emit ValueUpdated(newValue);
    }
    
    // ---- View (called by RouterVault) ----
    
    function totalPositionValue() external view returns (uint256) {
        // Returns cached value + idle USDC
        return totalDeployedValue;
    }
}
```

**Trust model**:
- Executor bot은 Cogochi team multi-sig. Single point of trust.
- Phase 3에서 decentralize (multiple executors, threshold signature).
- Mitigation: 
  - Bot의 action 모두 on-chain emit (transparent)
  - Anomaly 감지 시 governance emergency pause
  - Executor 한도 (single position max $X, daily max $Y)

---

## 3. Off-chain Executor Bot

### 3.1 Architecture

```python
# hyperliquid_executor_bot.py

class HyperliquidExecutor:
    def __init__(
        self,
        arbitrum_rpc: str,
        hyperliquid_api_url: str,
        hl_wallet: HyperliquidAccount,
        arb_executor_contract: Contract,
        vault_contract: Contract,
    ):
        self.arb_w3 = Web3(Web3.HTTPProvider(arbitrum_rpc))
        self.hl_client = HyperliquidClient(hyperliquid_api_url, hl_wallet)
        self.executor = arb_executor_contract
        self.vault = vault_contract
    
    async def run(self):
        """Main loop: listen to L1 signals, execute on HL, report back to Arbitrum"""
        async for signal in self._listen_l1_signals():
            try:
                await self._execute_signal(signal)
            except Exception as e:
                log.error(f"execute failed: {e}")
                await self._emergency_report(signal, str(e))
    
    async def _listen_l1_signals(self):
        """Subscribe to SignalRevealed events on L1 Scoreboard"""
        filter = self.arb_w3.eth.filter({
            "address": L1_SCOREBOARD_ADDRESS,
            "topics": [SIGNAL_REVEALED_TOPIC],
        })
        while True:
            for event in filter.get_new_entries():
                yield self._parse_signal(event)
            await asyncio.sleep(5)
    
    async def _execute_signal(self, signal: Signal):
        """Convert signal to HL order, open position"""
        # 1. Get current vault balance
        vault_balance = self.vault.functions.totalAssets().call()
        
        # 2. Get engine weight from orchestrator
        orchestrator = self.vault.functions.engineOrchestrator().call()
        weight_bps = orchestrator.functions.getEngineWeight(signal.engine_id).call()
        
        if weight_bps == 0:
            log.info(f"engine {signal.engine_id.hex()} not allocated, skipping")
            return
        
        # 3. Compute position size
        allocation = (vault_balance * weight_bps) // 10000
        leverage = 1  # Phase 2 no leverage
        position_size_usdc = allocation
        
        # 4. Bridge USDC to HL (if not already deposited)
        hl_balance = await self.hl_client.get_balance()
        if hl_balance < position_size_usdc:
            await self._bridge_to_hl(position_size_usdc - hl_balance)
        
        # 5. Place order on HL
        order_result = await self.hl_client.place_order(
            asset=signal.asset,
            is_buy=signal.direction,
            size=position_size_usdc,
            limit_px=None,  # market order
            tp_px=signal.tp_price,
            sl_px=signal.sl_price,
        )
        
        # 6. Record position on Arbitrum executor contract
        tx = self.executor.functions.openPosition(
            signal.commit_id,
            signal.asset,
            signal.direction,
            int(order_result["fillPrice"] * 10**8),
            position_size_usdc,
            signal.tp_bps,
            signal.sl_bps,
            signal.valid_until,
        ).build_transaction(...)
        
        await self._send_tx(tx)
    
    async def _monitor_positions(self):
        """Periodic check of open positions, close on TP/SL/timeout"""
        while True:
            open_positions = self._get_open_positions()
            for pos in open_positions:
                hl_status = await self.hl_client.get_position_status(pos.asset)
                if self._should_close(pos, hl_status):
                    await self._close_position(pos)
            await asyncio.sleep(30)
    
    async def _bridge_to_hl(self, amount_usdc: int):
        """Bridge USDC from Arbitrum to Hyperliquid"""
        # Use official HL deposit bridge or custom solution
        # Implementation: depends on HL deposit flow
        pass
```

### 3.2 Executor Bot Infrastructure

- **Hosting**: AWS EC2 (m5.large) or dedicated server, 99.9% uptime
- **Monitoring**: Datadog/Grafana, alerts on: failed tx, stale position, HL connection loss
- **Backup**: Hot standby bot in different region
- **Key management**: AWS KMS or Fireblocks for HL wallet
- **Replay protection**: Track processed signal IDs in DB

### 3.3 Trust Minimization Roadmap

**Phase 2 (Month 7-12)**: Single bot, Cogochi team operated. Single point of trust.
**Phase 2.5 (Month 12-18)**: Multi-bot quorum (2/3 signatures for action).
**Phase 3 (Month 18-24)**: Decentralized executor set (permissionless with stake).
**Phase 4 (Month 24+)**: On-chain execution via HyperEVM (no bot needed).

---

## 4. Rebalancing Algorithm

### 4.1 Weight Computation (Off-chain)

Off-chain rebalancer runs weekly:

```python
# rebalancer.py

def compute_weights(engine_ids: List[bytes], scoreboard: Contract) -> Dict[bytes, int]:
    """
    Compute engine weights based on 90-day performance.
    Simple Sharpe-based for Phase 2.
    """
    stats = {}
    for eid in engine_ids:
        raw = scoreboard.functions.engineStats(eid).call()
        total_signals = raw[0]
        hits = raw[1]
        misses = raw[2]
        cum_pnl_bps = raw[4]
        
        if total_signals < 30:
            stats[eid] = {"sharpe": 0, "include": False}
            continue
        
        # Approximation: Sharpe = mean_pnl / std_pnl
        # Real implementation needs time-series PnL (off-chain fetch from indexer)
        pnl_history = fetch_pnl_history_from_indexer(eid, days=90)
        if not pnl_history:
            stats[eid] = {"sharpe": 0, "include": False}
            continue
        
        mean_pnl = np.mean(pnl_history)
        std_pnl = np.std(pnl_history)
        sharpe = (mean_pnl / std_pnl) * np.sqrt(252) if std_pnl > 0 else 0
        
        stats[eid] = {
            "sharpe": sharpe,
            "include": sharpe > 0.5 and total_signals >= 30,
        }
    
    # Normalize weights
    included = {k: v for k, v in stats.items() if v["include"]}
    if not included:
        return {k: 0 for k in engine_ids}
    
    total_sharpe = sum(v["sharpe"] for v in included.values())
    weights = {}
    
    for eid, data in stats.items():
        if data["include"]:
            raw_weight = (data["sharpe"] / total_sharpe) * 10000
            # Apply max 40% cap
            weights[eid] = int(min(raw_weight, 4000))
        else:
            weights[eid] = 0
    
    # Re-normalize after cap
    total = sum(weights.values())
    if total > 10000:
        for k in weights:
            weights[k] = int(weights[k] * 10000 / total)
    
    return weights


def submit_rebalance(weights: Dict[bytes, int], orchestrator: Contract):
    """Sign and submit rebalance tx"""
    engine_ids = list(weights.keys())
    weight_list = [weights[eid] for eid in engine_ids]
    
    # Sign with rebalancer multi-sig (EIP-712)
    signature = sign_rebalance(engine_ids, weight_list, REBALANCER_PK)
    
    tx = orchestrator.functions.rebalance(
        weight_list, signature
    ).build_transaction(...)
    
    send_tx(tx)
```

### 4.2 Advanced: Risk-Parity (Phase 2.5+)

```python
def compute_weights_risk_parity(engine_ids, days=90):
    """
    Risk-parity: equal risk contribution from each engine.
    More stable than Sharpe-based in low-sample regimes.
    """
    # 1. Build returns matrix (N engines × T days)
    returns_matrix = build_returns_matrix(engine_ids, days)
    
    # 2. Covariance matrix
    cov = np.cov(returns_matrix)
    
    # 3. Optimize: minimize variance of risk contributions
    n = len(engine_ids)
    
    def risk_contribution(weights, cov):
        portfolio_var = weights @ cov @ weights
        marginal = cov @ weights
        risk_contrib = weights * marginal / np.sqrt(portfolio_var)
        return risk_contrib
    
    def objective(weights):
        rc = risk_contribution(weights, cov)
        return np.sum((rc - np.mean(rc))**2)  # equal RC target
    
    # 4. Constraint: sum to 1, max 40% per engine
    constraints = [
        {"type": "eq", "fun": lambda w: np.sum(w) - 1},
    ]
    bounds = [(0.0, 0.4) for _ in range(n)]
    
    result = minimize(
        objective,
        x0=[1/n] * n,
        bounds=bounds,
        constraints=constraints,
    )
    
    return {eid: int(w * 10000) for eid, w in zip(engine_ids, result.x)}
```

### 4.3 Rebalance Decision Tree

```
매주 월요일 00:00 UTC:
  1. Fetch 90-day PnL history from indexer (all engines)
  2. Filter: Sharpe > 0.5, signal count > 30, max DD < 25%
  3. Compute weights (Sharpe-based or risk-parity)
  4. Apply caps (max 40% per engine)
  5. Normalize to sum ≤ 100%
  6. If weight change > 10% for any engine:
     → Submit rebalance tx
     → Else: skip (reduce churn)
  7. Log decision + reasoning (public dashboard)

예외 시나리오:
  - Engine slashed: weight = 0 immediately (not weekly)
  - Engine inactive 7d+: weight = 0 immediately
  - Emergency (single engine PnL -15% in 24h): pause that engine
```

---

## 5. HWM (High-Water Mark) Deep Dive

### 5.1 User-level HWM 왜?

**Vault-level HWM 문제**:
- 유저 A: t=0 deposit at share price 1.0
- 유저 B: t=1 deposit at share price 0.8 (vault lost 20%)
- Share price 1.0 회복 → Vault-level HWM 기준으로 아직 수익 없음 → fee 0
- But 유저 B는 0.8 → 1.0 = 25% gain 실제 경험. 수익에 대한 perf fee 미징수 = protocol 손실.

**User-level HWM**:
- 각 deposit의 share price 기록
- Withdrawal 시 weighted avg entry와 비교
- 공정한 fee 징수

### 5.2 Weighted Average HWM 로직

```
유저 초기 상태: shares=0, HWM=0

1st deposit: 
  assets = 1000 USDC
  share price = 1.0
  shares_received = 1000
  new_HWM = 1.0

2nd deposit (vault가 10% up = share price 1.1):
  assets = 500 USDC
  share price = 1.1
  shares_received = 500 / 1.1 ≈ 454.5
  
  weighted_HWM = (1000 × 1.0 + 454.5 × 1.1) / (1000 + 454.5)
              = (1000 + 500) / 1454.5
              = 1.031

유저 총 shares = 1454.5, HWM = 1.031

Withdrawal (share price = 1.2):
  user gain per share = 1.2 - 1.031 = 0.169
  total gain = 0.169 × shares_being_withdrawn
  perf fee = total_gain × 15%
```

### 5.3 Edge cases

**Case 1: Vault 손실 상태에서 deposit**:
- Share price 0.8 (vault -20%)
- User HWM = 0.8 (새 진입자 기준)
- Vault가 0.8 → 0.9 회복 시: user는 gain 0.1 per share → perf fee 징수
- 이전 유저 (HWM 1.0)는 여전히 HWM 이하 → fee 0

**Case 2: Partial withdrawal**:
- User has 1000 shares at HWM 1.0
- Withdraw 500 shares at price 1.2 → gain 0.2 × 500 = 100 USDC, fee 15
- Remaining 500 shares, HWM 1.0 (unchanged)

**Case 3: HWM reset on full withdrawal**:
- User fully withdraws → UserEntry 삭제
- Next deposit: fresh start, new HWM

### 5.4 Gas 최적화

HWM 계산은 매 deposit/withdraw에 실행 → gas 비쌈. 최적화:

- Fixed-point math (1e18 scaling)
- Struct packing (lastInteraction uint96 대신 uint256)
- View function으로 HWM 노출 (off-chain prepare)

**예상 gas**:
- Deposit: 120-150k
- Withdraw with fee: 180-230k (3-5 transfer + share burn)

---

## 6. Circuit Breakers & Risk Controls

### 6.1 Vault-level Protections

```solidity
contract VaultRiskModule {
    uint256 public dailyLossCapBps = 500;     // 5%
    uint256 public weeklyLossCapBps = 1500;   // 15%
    uint256 public maxPositionBps = 1000;     // 10% per position
    uint256 public maxLeverage = 300;         // 3x (in bps of 100)
    
    function checkPositionLimit(uint256 positionSize) external view {
        uint256 vaultTotal = vault.totalAssets();
        require(
            positionSize * 10000 <= vaultTotal * maxPositionBps,
            "position too large"
        );
    }
    
    function checkDailyLoss() external view {
        int256 dailyPnL = _computeDailyPnL();
        require(
            dailyPnL >= -int256(vault.totalAssets() * dailyLossCapBps / 10000),
            "daily loss cap"
        );
    }
    
    function triggerEmergencyPause() external {
        // Automatic pause if daily loss cap hit
        // Callable by anyone (permissionless safety)
        require(_dailyLossExceeded(), "no breach");
        vault.pause();
        emit EmergencyPauseTriggered();
    }
}
```

### 6.2 Engine-level Protections

- **Weight auto-reduction**: Engine 90일 Sharpe < 0.5 → orchestrator가 weight cap 20%로 강제
- **Inactivity**: 7일 무신호 → weight 0
- **Slash cascade**: Engine slashed → weight 0 즉시, 재진입 governance 승인 필요

### 6.3 Execution-level Protections

- Slippage cap: Market order slippage > 1% → reject
- Oracle validation: Chainlink price와 HL price 괴리 > 2% → pause
- Position timeout: validUntil 경과해도 open이면 force close

### 6.4 Governance Emergency Powers

- **Pause vault**: 4/7 multi-sig → 즉시 deposit/withdraw 중단
- **Emergency withdraw**: Pause 상태에서 사용자가 pro-rata 인출 가능 (no fee)
- **Force close positions**: Multi-sig이 모든 HL position close 명령
- **Recovery**: Post-incident, DAO vote로 re-open

---

## 7. Integration with L1

### 7.1 Read Flow

```
L2 Vault needs:
  - Engine status (active/paused/slashed) → EngineRegistry
  - Signal commits → SignalCommitReveal
  - Signal reveals → SignalCommitReveal
  - Signal outcomes → PerformanceScoreboard
  - Engine stats → PerformanceScoreboard
```

### 7.2 Write Flow (L2 → L1)

```
L2 does NOT write to L1 directly (separation of concerns).

Exception: Engine slashing trigger
  - If L2 detects false attestation (signal claimed success but actual loss):
    → Emit event → Watcher sees → Governance proposal → Slash execution on L1
```

### 7.3 Event Subscription

```typescript
// L2 executor subscribes to L1 events
const l1Client = createPublicClient({ chain: arbitrum, transport: http() });

l1Client.watchEvent({
  address: L1_SIGNAL_REVEAL_ADDR,
  event: parseAbiItem('event SignalRevealed(bytes32 indexed commitId, string asset, bool direction)'),
  onLogs: async (logs) => {
    for (const log of logs) {
      // Process signal for L2 execution
      await processSignalForVault(log);
    }
  }
});
```

---

## 8. Testing Strategy (L2)

### 8.1 Unit Tests

- ERC-4626 compliance (OpenZeppelin test suite 재사용)
- HWM calculation edge cases
- Fee distribution splits (70/15/15) - fuzz
- Deposit/withdraw flows (happy + revert paths)
- TVL cap enforcement

### 8.2 Integration Tests

- Full lifecycle: deposit → signal → position → settlement → withdraw with fee
- Multi-engine scenario: 3 engines with different signals same day
- Rebalancing: weight change → position adjustment
- Emergency pause → emergency withdraw

### 8.3 Simulation Tests

**필수**: Historical signal data로 vault simulator 돌려서:
- 90일 backtest on mainnet fork
- Expected vault return vs actual (Cogochi 엔진 live data 필요)
- Slippage model (Hyperliquid order book 기반)
- Cost model (gas + fees)

**Tool**: Foundry fork testing + Python simulator for non-EVM (HL API).

### 8.4 Hyperliquid-specific Tests

- HL mainnet integration (testnet 없음, small amount live)
- Bridge flow (USDC Arbitrum ↔ HL)
- Order book depth testing
- Funding rate handling
- Liquidation simulation

### 8.5 Audit Scope (Audit 2)

**In scope**:
- RouterVault, EngineOrchestrator, HyperliquidExecutor (all Solidity)
- ERC-4626 compliance
- Performance fee math, HWM logic
- Access control
- Reentrancy on all external calls

**Special focus** (auditor에게 요청):
- HWM edge cases (partial withdraw, multi-deposit)
- Oracle manipulation resistance
- Executor bot failure scenarios (bot malicious)
- Engine slashing cascade effects

**Budget**: $90k, 8 weeks. OpenZeppelin 또는 Trail of Bits.

---

## 9. Deployment Sequence

### 9.1 Pre-Launch (Month 7-10)

1. Contract 개발 (Month 7-8)
2. Unit + integration tests (Month 8)
3. Testnet deployment (Sepolia, Month 9)
4. E2E test with testnet Hyperliquid (Month 9-10)
5. Audit 2 submission (Month 10)

### 9.2 Audit Remediation (Month 10-11)

6. Audit findings 수정
7. Re-audit verification
8. Bug bounty 활성화

### 9.3 Mainnet Launch (Month 12)

9. Arbitrum mainnet deployment
10. Hyperliquid builder code enrollment 확인
11. Initial TVL cap $500k (monitored)
12. First 30일: Cogochi engine only
13. Month 13+: 2nd engine 유치 시작
14. Month 15: TVL cap $2M, 3 engines target

---

## 10. Operations Runbook

### 10.1 Daily Operations

- Morning (00:00 UTC): Rebalancer bot runs, no-op if no change
- Continuous: Executor bot monitors signals, executes on HL
- EOD: Daily PnL report, alert if losses exceed threshold
- Monitoring: Grafana dashboard 24/7

### 10.2 Weekly Operations

- Monday 00:00 UTC: Mandatory rebalance check
- Tuesday: Engine performance review (manual)
- Thursday: Governance meeting (multi-sig signers)
- Friday: Weekly metrics report publish

### 10.3 Monthly Operations

- Performance review (all engines, TVL trend)
- Fee revenue report
- Engine allocation adjustment (if needed)
- Community update post

### 10.4 Incident Response

**P0 (funds at risk)**:
- Immediate pause via multi-sig
- Emergency withdraw activated
- Communication: Discord, Twitter, Telegram within 15분
- Investigation → patch → audit → resume

**P1 (engine anomaly)**:
- Weight → 0 for anomalous engine
- Governance review within 24시간
- If confirmed, slash

**P2 (UX/monitoring)**:
- Fix within 48시간
- No user-facing impact

---

## 11. Open Questions

1. **Hyperliquid builder code approval timing?**
   - Apply Month 5, expect approval Month 7-9 [estimate]
   - Backup: plain wallet (no builder code benefits, slightly worse fees)

2. **HyperEVM 성숙도는 언제 Phase 3 migration 가능?**
   - 2026 현재 early stage. 
   - Phase 3 (Month 18-24) 시점 재평가
   - If stable, Option B (on-chain execution) 고려

3. **Bridge 선택**: 
   - Official HL bridge (Arbitrum → HL 공식)
   - Stargate, Axelar, LayerZero 등 3rd party
   - Decision: Official first, fallback 3rd party

4. **HL API rate limit**:
   - Public API 200 req/min
   - Builder code API ?
   - Need: 확인 후 bot architecture 결정

5. **User-level HWM gas cost 너무 비싸면?**
   - Alternative: Vault-level HWM + rebate for new entrants
   - Decision: First try user-level, if >300k gas per withdraw, reconsider

6. **Rebalance signature authority**:
   - Phase 2: Cogochi multi-sig (4/7)
   - Phase 3: DAO vote
   - 중간 단계 (hybrid) 필요?

---

## 12. Cost Projection (L2 Build)

| Item | Estimate | Notes |
|------|----------|-------|
| 개발 (4 devs × 5 months) | $250k | Solidity + Python + TS |
| Audit 2 | $90k | OpenZeppelin target |
| Infrastructure (executor bot, monitoring) | $10k | AWS, Datadog, Fireblocks |
| HL builder code application | $0 | Free, but time cost |
| Bug bounty launch | $50k | Immunefi |
| Legal review (L2 specific) | $20k | Vault structure legal |
| Testing (Hyperliquid small live) | $5k | Small position real HL test |
| **Total** | **$425k** | Approximate, Phase 2 budget |

---

## 13. Risks Specific to L2

### 13.1 Hyperliquid Platform Risk

- HL 자체 다운 → vault 실행 정지
- Mitigation: Multi-chain 준비 (Base, dYdX 등), Phase 3+ priority

### 13.2 Bridge Risk

- USDC bridge hack/delay → vault 자금 stuck
- Mitigation: Limit cross-chain exposure, official bridge 우선

### 13.3 Executor Bot Risk

- Bot compromise → vault 자금 위험
- Mitigation: KMS, Fireblocks, hot/cold key separation, circuit breaker

### 13.4 Oracle / HL Price Deviation

- Chainlink vs HL price 괴리 → unfair settlement
- Mitigation: Deviation cap, pause if > 2%

### 13.5 Slippage / Liquidity

- Large position size > HL order book depth → bad fill
- Mitigation: Position size cap (10% vault), TWAP execution for large orders

### 13.6 Regulatory

- Vault가 "collective investment scheme" 분류 가능
- Mitigation: Offshore SPV, geofence, legal memo (Phase 2 시작 전 필수)

---

## 14. References

[1] ERC-4626 Tokenized Vault Standard
[2] OpenZeppelin ERC4626 Implementation
[3] Hyperliquid Docs — Builder Codes
[4] Hyperliquid API Reference
[5] Curve finance veCRV (ve-model 참고)
[6] Yearn V3 vault architecture (multi-strategy 참고)
[7] Cogochi Whitepaper v2 (03)
[8] Cogochi Product Spec MVP L1 (05)
[9] Cogochi Tokenomics v2 (04)

---

## Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-23 | Initial L2 Router Vault spec |

---

**End of L2 Router Vault Spec**
