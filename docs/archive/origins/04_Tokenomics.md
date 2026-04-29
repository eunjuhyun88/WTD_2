# Cogochi Protocol — Tokenomics & Economics v2

**Version**: 2.0
**Date**: 2026-04-23
**Status**: VC + internal reference, post Red Team revision
**Scope**: Fee model, unit economics, token design (ve-model + buy-back)
**Supersedes**: v1 Tokenomics (archived)

---

## 0. TL;DR

1. **Protocol fee**: Vault performance fee 15%, split 70% primary engine / 15% secondary engines / 15% protocol. Plus L1 subscription 1.2% TVL/year (optional signal feed access).
2. **Sustainability threshold**: TVL **$35M** (v1 claim $20M은 tax/reserve 빠진 계산).
3. **Token**: 1B $COGO, Community allocation **40%** (v1 25% → Hyperliquid 수준).
4. **TGE trigger**: L2 Vault TVL $5M + 3개월 fee $10k/mo + 3 engines + 2 audits + legal memo.
5. **Token utility**: (1) Engine mandatory stake (2) veCOGO fee rebate (3) Fee buy-back & burn (4) Governance.
6. **Raise**: $1.5M pre-seed (v1 $750k → realistic budget).

**Honest**: 모든 revenue 수치는 **가정 기반**. 엔진 live PnL이 없는 한 real economics는 [unknown]. 이 문서는 "If the engine works, this is the shape" 프레임.

---

## 1. Fee Model v2

### 1.1 Phase 1 (MVP, Month 1-6): Marketplace only

**L1 = Engine Marketplace**. Revenue sources:

| Fee Type | Rate | Who pays | Who receives |
|----------|------|----------|--------------|
| Engine stake | 10,000 $COGO equiv (pre-TGE USDC $5k) | Engine operator (lock) | Slash pool |
| Signal subscription (optional) | 1.2% TVL/year OR $49/month flat | Subscriber | 80% Engine / 20% Protocol |
| Slashing revenue | Variable | Misbehaving engine | 50% burned / 50% treasury |

**Phase 1 Protocol revenue**: Subscription은 optional이라 초기 minimal. Real revenue는 Phase 2 vault launch 시점부터.

### 1.2 Phase 2 (L2 Router Vault, Month 7-12): Main revenue

**Vault performance fee 15%**. Split:

| Recipient | Share of fee | Rationale |
|-----------|-------------|-----------|
| Primary engine | **70%** | Quality signal incentive |
| Secondary engines | **15%** | Multi-engine redundancy |
| Protocol treasury | **15%** | Infrastructure, R&D, buy-back |

**Plus**: Entry/exit/mgmt fee 0%. Performance-only.

**High-Water Mark (HWM)**: Fee는 share price가 historical peak 초과 시에만 청구. 손실 구간 fee 0. Reset: Never (perpetual, user-friendly).

### 1.3 Phase 3 (Copy DEX, Month 25+)

**Execution fee 레이어 추가**:
- Trading fee 0.05% maker / 0.10% taker
- Split: 50% LPs / 30% Primary engine / 20% Protocol
- Plus: Vault perf fee (L2 구조 동일)

**경쟁 참고**: Hyperliquid 0.01%/0.035%. 우리 추가 레이어 0.05%/0.10% → user 총 부담 0.06%/0.135%. Retail 기준 경쟁력 유지 (Bitget 0.02%/0.06%).

---

## 2. Unit Economics (재계산, Tax/Reserve 반영)

### 2.1 Revenue formula

```
Monthly Revenue = 
  (Subscription revenue) + 
  (Vault performance fee × Protocol share)

Subscription revenue = Subscribers × $49
                     (or TVL × 0.1% if TVL-based)

Vault perf fee revenue 
  = TVL × annual_return × 15% × 15% / 12
  = TVL × annual_return × 0.01563% per month
```

### 2.2 Net Revenue

| 항목 | Ratio |
|------|-------|
| Gross revenue | 100% |
| Corporate tax (Cayman) | 0% |
| Reserve (contract insurance, treasury) | -15% |
| Operational fees (bank, payment, bridge) | -3% |
| **Net operating** | **~82% of gross** |

### 2.3 Sensitivity Table

**가정**: annual return 10% (bootstrap, MEV-affected), subscribers 500

| TVL | Sub | Perf (gross) | Proto (gross) | Net 82% | Cover $25k/mo ops? |
|-----|-----|--------------|--------------|---------|---------------------|
| $1M | $294k | $15k | $2.25k | $243k | ✅ 81% |
| $5M | $294k | $75k | $11.25k | $250k | ✅ 83% |
| $10M | $294k | $150k | $22.5k | $260k | ✅ 87% |
| **$35M** | $294k | $525k | $78.75k | $306k | **✅ 102%** |
| $50M | $294k | $750k | $112.5k | $334k | ✅ 111% |
| $100M | $294k | $1.5M | $225k | $425k | ✅ 142% |

**Sustainability TVL**: **$35M** (subscription 500 유지 시).

### 2.4 Subscription 없을 때 (perf fee only)

| TVL | Net revenue | Cover? |
|-----|-------------|--------|
| $10M | $18.5k | ❌ 6% |
| $50M | $92k | ❌ 31% |
| $100M | $185k | ❌ 62% |
| **$200M** | $369k | **✅ 123%** |

**중요**: Subscription이 base line 역할. 엔진 0% 성과여도 subscription으로 운영 가능. 이게 v1 대비 핵심 개선.

### 2.5 Return Rate 민감도

**가정**: TVL $50M, subscription 500 유지

| Annual Return | Perf rev | + Sub | Total Net | Cover? |
|--------------|----------|-------|-----------|--------|
| -5% | $0 | $294k | $241k | ✅ 80% |
| 0% | $0 | $294k | $241k | ✅ 80% |
| 5% | $56k | $294k | $287k | ✅ 96% |
| **10%** | **$112.5k** | $294k | **$334k** | **✅ 111%** |
| 15% | $169k | $294k | $380k | ✅ 127% |
| 30% | $338k | $294k | $518k | ✅ 173% |

### 2.6 Cost Basis (Year 2, 5인팀)

```
팀 5명 × $12.5k/월 × 12 = $750,000
인프라 = $60,000
Audit (annual) = $30,000
Legal (ongoing) = $50,000
Marketing = $80,000
Treasury reserve = $50,000
Buffer = $30,000
────────────────────
Total = $1,050,000/year ($87.5k/mo)

Required TVL @ 10% return, 500 subs:
Remaining burn after subscription = $1.05M - $294k = $756k
Required perf revenue (gross) = $756k / 0.82 = $922k
TVL needed = $922k / (10% × 0.1875%) = $49M
```

**Year 2 target TVL**: $50M. Month 18 Series A 또는 organic 달성.

---

## 3. Token Design

### 3.1 Why Token

**Token 없이도 운영 가능** (Subscription + Perf fee).

**그럼 왜 토큰?**

1. **Crypto VC exit path**: SAFE-only = equity sale만 → 크립토 VC mandate 안 맞음
2. **Network effect 가속**: Airdrop/LM 없으면 cold start
3. **Engine operator alignment**: Stake + slash가 incentive 메커니즘
4. **Community ownership**: 장기 decentralization 경로

**Token 없는 시나리오** → 기존 Cogochi SaaS 확장. Equity-only. 크립토 VC 제외.
**Token 있는 시나리오** → Protocol 완전 전환. Token launch complexity + 규제 리스크.

**Recommendation**: Token 있는 쪽. 단 **TGE 조건부**.

### 3.2 TGE Trigger (명확화)

**5개 조건 모두 충족 시 TGE**:

1. [ ] L2 Router Vault TVL $5M+ (sustained 30 days)
2. [ ] Protocol monthly revenue $10k+ (3개월 연속)
3. [ ] Engine count 3+ (Cogochi + 2 third-party, each TVL contribution $500k+)
4. [ ] Smart contract audits 2회 complete (L1 + L2)
5. [ ] Legal memo: US Reg S pathway + Korean no-action letter attempted

**Estimated trigger timing**: Month 12-15.

**미충족 시**: TGE 연기. Pre-seed/Seed investor는 **token warrant**로 미래 TGE 권리 보호. Exit option은 Series A equity.

### 3.3 Supply & Distribution

**Total**: 1,000,000,000 $COGO (1B)

**Principle**: Hyperliquid scale, Community-heavy.

| Allocation | % | Tokens | Unlock |
|-----------|---|--------|--------|
| **Team** | 15% | 150M | 4yr linear, 1yr cliff |
| **Pre-seed investors** | 12% | 120M | 2yr linear, 6mo cliff |
| **Seed investors** | 6% | 60M | 2yr linear, 6mo cliff |
| **Treasury** | 15% | 150M | 4yr linear, DAO-governed |
| **Community Airdrop** | 10% | 100M | Immediate at TGE |
| **Liquidity Mining** | 15% | 150M | 3yr distribution |
| **Ongoing User Rewards** | 15% | 150M | 5yr distribution |
| **Ecosystem (Engine ops)** | 10% | 100M | Multi-year grants |
| **Public sale / IDO** | 2% | 20M | Day 1 unlock |

**Sum**: 100% ✓

**Totals**:
- Community (airdrop + LM + rewards): **40%**
- Insider (team + investors): **33%**
- Ecosystem + Treasury: **25%**
- Public: **2%**

**Comparison**:
| Project | Community | Team | Investors |
|---------|-----------|------|-----------|
| Hyperliquid | ~31% | ~23% | 0% |
| Jupiter | 50% | 20% | ~15% |
| dYdX | ~50% | ~28% | ~28% |
| **Cogochi v2** | **40%** | **15%** | **18%** |

### 3.4 Initial Circulating Supply

**TGE Day 1**:
- Public sale 2% (20M): Fully unlocked
- Airdrop 10% (100M): Unlock
- LM Week 1: ~1% (10M)
- **Total Day 1 circulating: ~13% (130M)**

**Launch market cap [estimate]**:
- IDO price $0.05: FDV $50M, Circ MC $6.5M
- IDO price $0.10: FDV $100M, Circ MC $13M

실제 price discovery는 market이 결정.

---

## 4. Token Utility (4 mechanisms)

### 4.1 Utility 1: Engine Mandatory Stake

```
Engine 등록 시 minimum stake: 10,000 $COGO

Pre-TGE: USDC equivalent ($5,000)
Post-TGE: $COGO required

Stake 용도:
- Slashing 담보
- Engine spam 방지
- Long-term commitment signal
```

**Slashing**:

| Offense | Slash % | Detection |
|---------|---------|-----------|
| False performance attestation | 50% | On-chain PnL mismatch |
| 30일 연속 signal 0 | 10% | Heartbeat monitoring |
| Malicious signal (rug attempt) | 100% | Governance vote |
| 3+ critical missed signals (60일) | 25% | Automated + governance |

**Slashed token**: 50% burned, 50% treasury.
**Unstaking**: 28-day cooldown (governance attack 방지).

### 4.2 Utility 2: veCOGO (Subscriber side)

**Curve ve-model 응용**.

```
User locks $COGO for X days (min 30, max 1460):
  veCOGO balance = amount × (lock_days / 1460)

Max lock (4yr): 1 COGO = 1 veCOGO
Min lock (30d): 1 COGO = 0.02 veCOGO
```

**Benefits**:

| Benefit | Formula |
|---------|---------|
| Vault perf fee rebate | Up to 50% based on veCOGO |
| Priority signal access | Top 10% veCOGO holders get signals 5초 먼저 |
| Airdrop boost | 2x multiplier for lock > 1yr |
| Governance voting | veCOGO-weighted |

**Rebate formula**:
```
User veCOGO / Total veCOGO = r
Rebate rate = min(0.5, r × 100)

Example:
- User: 10,000 veCOGO, Total: 1,000,000
- r = 0.01 (1%)
- Rebate = min(0.5, 1.0) = 50% (capped)
- User effective perf fee = 15% × 0.5 = 7.5%
```

Whale-friendly이지만 time-locked이라 sybil attack 비쌈.

### 4.3 Utility 3: Fee Buy-back & Burn

```
Monthly flow:
  1. Vault perf fee 15% of positive PnL
  2. Protocol take 15% of fee = 2.25% of profits
  3. Of protocol take:
     - 50% → Buy-back $COGO (open market)
     - 50% → Treasury (operational)

Bought-back $COGO:
  - Immediately burned
  - Deflationary pressure
  - On-chain transparent

Weekly automated execution.
```

**Projection (Year 2, TVL $50M, 10% return)**:
```
Annual revenue = $112.5k perf + $294k sub = $406.5k
Perf portion = $112.5k, protocol take $112.5k
50% buy-back = $56k/year

@ $COGO avg $0.10:
  Burned = 560k $COGO/year
  Deflation = 0.056%/yr (modest)

@ TVL $200M:
  Buy-back = $225k/yr
  Burned = 2.25M $COGO
  Deflation = 0.225%/yr
```

Scale 후 유의미한 deflation.

### 4.4 Utility 4: Governance

**Governable Parameters**:

| Parameter | Current | Range |
|-----------|---------|-------|
| Protocol fee share | 15% | 5-25% |
| Engine primary share | 70% | 50-80% |
| Engine minimum stake | 10k | 1k-100k |
| Buy-back allocation | 50% | 0-100% |
| Treasury spending | Multi-sig | DAO-override |
| Slashing severity | Per offense | DAO-revise |
| New chain deployment | DAO vote | - |

**Governance params**:
- Quorum: 10% of circulating veCOGO
- Proposal threshold: 1% of circulating veCOGO
- Voting period: 7일
- Execution delay: 2일 (timelock)

**Timeline**: TGE Day 1 - Month 3 = core team multi-sig + investor board. Post-Month 6 = full DAO.

---

## 5. Flywheel

### 5.1 Diagram

```
   ┌───────────────────────────────────────────┐
   │                                           │
   │  TVL ↑                                    │
   │    ↓                                      │
   │  Protocol Revenue ↑                       │
   │    ↓                                      │
   │  Buy-back ↑ + Treasury ↑                  │
   │    ↓                                      │
   │  $COGO supply ↓ (burn)                    │
   │    ↓                                      │
   │  $COGO price ↑ (demand constant)          │
   │    ↓                                      │
   │  veCOGO value ↑ + Engine stake value ↑   │
   │    ↓                                      │
   │  Engine 유입 (stake 가치)                 │
   │  Subscriber 유입 (rebate 가치)            │
   │    ↓                                      │
   │  TVL ↑ (again)                            │
   │                                           │
   └───────────────────────────────────────────┘
```

### 5.2 Breaking points

**A: TVL 정체** → Revenue 정체 → Buy-back 소규모 → Price 하락 → Engine 이탈
- 방어: Subscription revenue가 base line

**B: $COGO 가격 폭락** → Engine stake < 비용 → Engine 이탈
- 방어: Slash + 28일 cooldown

**C: Engine 성과 악화** → Perf fee 0 → Flywheel 정지
- 방어: Multi-engine 구조

---

## 6. Valuation Framework

### 6.1 Reference Metrics

**P/R multiple**:
- SaaS: 5-15x
- Crypto protocol 고성장: 20-50x
- Crypto protocol mature: 8-20x

**FDV/TVL ratio**:
- dHEDGE: 0.2x (mature, 낮음)
- Hyperliquid HYPE: ~19x (native chain outlier)
- Aave: ~0.05x (매우 mature)
- Perpy peak: ~3x
- **Cogochi target: 1-3x**

### 6.2 Target FDV Scenarios

**Year 1 (post-TGE)**: TVL $10M, Rev $300k/yr → Target FDV $30M-$100M (3-10x FDV/TVL)
**Year 2**: TVL $30M, Rev $800k/yr → Target FDV $60M-$200M (2-7x)
**Year 3 (mature)**: TVL $100M+, Rev $2M+/yr → Target FDV $200M-$500M (2-5x)

**주의**: 위는 **success scenario**. 실패 시 FDV는 0 수렴.

### 6.3 Token Price (not a prediction)

**가격 예측 안 함**. 가격 결정 요인만 공개:

```
Price = f(
  Protocol revenue,
  Supply dynamics (burn - unlocks),
  veCOGO lock ratio,
  Market sentiment (beta to ETH),
  Chain ecosystem (HL/Arb growth)
)
```

---

## 7. Runway & Raise

### 7.1 Pre-seed

**Target**: $1.5M
**Instrument**: SAFE + token warrant
**Valuation cap**: $8M post-money (equity)
**Token warrant**: 200% of investment equivalent at TGE FDV
**Runway**: 18 months

**Dilution**:
- Equity: $1.5M / $8M = 18.75%
- Token: 12% allocation at TGE

### 7.2 Use of Funds

| Category | Amount | % | Timeline |
|---------|--------|---|----------|
| Team salaries (4인 × 18mo) | $900k | 60% | Month 1-18 |
| Audits (2회) | $150k | 10% | Month 3, 9 |
| Infrastructure | $75k | 5% | Ongoing |
| Legal | $100k | 7% | Front-loaded |
| GTM | $100k | 7% | Ongoing |
| Security bounty | $50k | 3% | Pre-launch |
| Treasury buffer | $125k | 8% | Reserve |
| **Total** | **$1.5M** | 100% | |

### 7.3 Seed (Month 15-18)

**Pre-conditions**: L1+L2 mainnet, TVL $5M+, 3+ engines, 2 audits
**Target**: $5M + $1M strategic
**Valuation cap**: $25M post-money

### 7.4 Series A (Month 18-24)

**Pre-conditions**: TVL $30M+, Monthly rev $80k+, Token listed 2+ Tier-2
**Target**: $15-25M

---

## 8. Risk to Economics

### 8.1 Engine Underperformance (biggest)

**Scenario**: Cogochi 엔진 live PnL -5%/yr

**Impact**: HWM 때문에 perf fee 0 → subscribers 이탈 → TVL drain

**Mitigation**:
- Subscription revenue base line (엔진 무관)
- Multi-engine 구조
- Kill switch (30일 연속 음수 → auto-pause)
- Hill Climbing auto-retraining

### 8.2 TVL Stagnation

**Scenario**: TVL $2M 정체

**Mitigation**:
- Aggregator (Phase 3) 조기 launch
- Engine 마케팅
- Protocol share 15% → 10% 유도
- Series A 조기

### 8.3 Token Dump

**Scenario**: TGE 후 3개월 -80%

**Mitigation**:
- Circulating 초기 13% (slow unlock)
- Buy-back 자동화
- Treasury emergency support (도덕적 해이 주의)

### 8.4 Regulatory

**Scenario**: SEC가 $COGO 증권 분류

**Mitigation**:
- US geofence
- Reg S offering
- Utility-first design
- Pre-TGE legal memo

---

## 9. Key Metrics

### 9.1 North Star: PAR

**Protocol Annualized Revenue**
```
PAR = (Subs × Sub fee × 12) + 
      (TVL × Return × Perf_fee × Protocol_share)
```

### 9.2 Secondary

| Metric | Month 6 | Month 12 | Month 18 | Month 24 |
|--------|---------|----------|----------|----------|
| TVL | $500k | $3M | $10M | $30M |
| Active engines | 1 | 3 | 5 | 10+ |
| Subscribers | 100 | 800 | 2,500 | 10,000 |
| Monthly PAR | $2.5k | $30k | $80k | $250k |
| Engine avg Sharpe | N/A | >1.0 | >1.3 | >1.5 |
| Token circulating | 0% | 13% | 25% | 45% |

### 9.3 Kill Criteria

- **Month 6**: TVL < $100k OR engine PnL < -10% 3개월 → 재검토
- **Month 12**: TVL < $1M → 피벗 / 추가 펀딩
- **Month 18**: PAR < $30k/yr → wind-down 검토

---

## 10. v1 vs v2 Summary

| Aspect | v1 | v2 | Rationale |
|--------|----|----|-----------|
| Perf fee | 12% | 15% | 경쟁 + protocol 측 유지 |
| Protocol take | 40% of fee | 15% of fee | Engine 유치 |
| Engine take | 60% | 70% + 15% to secondary | Multi-engine |
| Subscription | "TBD" | $49/mo or 1.2% TVL | 명확화, base revenue |
| Supply | 100M | 1B | Industry standard |
| Community | 25% | 40% | Sybil 방지 |
| Utility | 3 (weak) | 4 (+ ve + burn) | Flywheel |
| TGE | "판단" | 5-criteria | VC 보호 |
| Raise | $750k | $1.5M | Real budget |
| Sustainability TVL | $20M (틀림) | $35M | Tax/reserve 반영 |

---

## 11. Decision Points

**이 문서에서 결정 완료**:
- [x] Perf fee 15%, split 70/15/15
- [x] Subscription 1.2% TVL or $49/mo
- [x] Supply 1B
- [x] Community 40%
- [x] ve-model
- [x] Buy-back 50%
- [x] TGE 5-criteria

**Phase 2 진입 시**:
- Subscription final price
- HWM frequency
- Multi-engine weight algorithm

**Phase 3 진입 시**:
- Trading fee final
- LP incentive
- Cross-chain bridge

---

## 12. Open Questions

1. **veCOGO rebate 50% cap optimal?**
   - Curve 2.5x boost, Convex 2.5x
   - 50% rebate aggressive. Phase 2 모니터링

2. **Engine stake 10k $COGO 적절?**
   - Pre-TGE $5k-50k depending price
   - Phase 1 경험 후 조정

3. **Third-party engine 유치 realistic?**
   - Month 12에 3개 목표
   - Risk: Cogochi 외 안 올 수도
   - Backup: Cogochi 내부 multiple variant

4. **Public sale 2% liquidity 충분?**
   - $2M liquidity → Tier-2 exchange listing 충분

5. **HWM perpetual vs quarterly?**
   - Perpetual = user-friendly
   - Quarterly = manager-friendly
   - [TBD] user research

---

## 13. References

[1] Hyperliquid Tokenomics. https://hyperliquid.gitbook.io/hyperliquid-docs
[2] Curve Finance ve-model. https://resources.curve.fi/reward-gauges/voting-escrow-veCRV/
[3] Jupiter Token Distribution. https://station.jup.ag/docs/token/distribution
[4] dHEDGE H1 2025. https://blog.dhedge.org/dhedge-2025-update/
[5] Cogochi Research Dossier (01)
[6] Cogochi Red Team Critique (06)
[7] Cogochi v2 Revised Design (07)

---

## Version Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-23 | Initial draft (archived) |
| **2.0** | **2026-04-23** | **Red Team informed: Marketplace structure, ve-model, buy-back, TGE triggers, 1B supply, 40% community, realistic financials** |

---

**End of Tokenomics v2**
