# Cogochi Protocol — Research Dossier

**Prepared**: 2026-04-23
**Status**: Pre-seed research, not for external distribution yet
**Author**: Cogochi team (CEO/CPO/CTO unified)
**Purpose**: Foundation doc for whitepaper, pitch deck, tokenomics, product spec

---

## 0. Executive Summary (한 페이지)

**문제**: 카피트레이딩은 "트레이더의 과거 성과"에 베팅하는 구조다. 이 구조는 세 가지 근본적 결함이 있다.
1. 과거 성과 ≠ 미래 (대부분의 탑 트레이더는 평균회귀)
2. 트레이더는 잠수/사기/번아웃 리스크
3. 시그널 검증 불가능 (텔레그램 유료방 = 블랙박스)

**솔루션**: 시그널을 트레이더가 아니라 **검증된 알고리즘**에서 공급한다. Cogochi 패턴 엔진(LightGBM + 28-feature stack, 4-stage validation gate)이 이미 시그널을 만들고 있음. 이를 온체인에 publish → 검증 가능한 시그널 마켓플레이스 → (이후) Vault + Copy DEX로 확장.

**왜 지금**: Perp DEX 2025 볼륨 $6.7T (+346% YoY, CoinGecko)[1]. Hyperliquid가 perp DEX 73% 점유하면서 User Vault 구조 대중화[2]. dHEDGE가 "Chamber"로 리브랜딩하며 Hyperliquid 기반 매니저 전략 시장 개척 중[3]. 시장은 열렸고, 아직 **알고리즘 기반 시그널** 전용 프로토콜은 없음.

**접근**: 3-layer stack
- L1 Signal Registry (MVP, 3개월): 온체인 시그널 발행 + 성과 검증
- L2 Strategy Vaults (6개월+): ERC-4626 Vault가 L1 시그널을 자동 실행
- L3 Copy DEX (12개월+): 인간 트레이더까지 올림

**Non-Goals (이 문서에 명시)**:
- 새 Perp 엔진 빌드 안 함 (Hyperliquid / GMX 이용)
- 자체 L1 체인 안 함
- 한국 VASP 라이센스 직접 추진 안 함 (해외법인 + non-custodial 설계)
- AMM / 스테이킹 / 게임파이 기능 안 넣음

---

## 1. 시장 현황

### 1.1 전체 크립토 거래 시장

| 지표 | 2025 수치 | 출처 |
|------|----------|------|
| 전체 크립토 시총 (2025년말) | $3.0T (YoY -10.4%) | CoinGecko 2025 Annual Report[1] |
| 평균 일일 거래량 (Q4 2025) | $161.8B | CoinGecko 2025 Annual Report[1] |
| CEX perp 볼륨 (2025) | $86.2T (+47.4% YoY) | CoinGlass, CoinGecko[1][4] |
| **DEX perp 볼륨 (2025)** | **$6.7T (+346% YoY)** | CoinGecko 2025 Annual Report[1] |
| 전체 liquidation 2025 | ~$150B (10/10에만 $19B) | CoinGlass[4] |

**해석**: DEX perp이 3.5배 성장. 이게 우리 playground다. CEX는 이미 Bitget이 지배, DEX는 아직 heterogeneous.

### 1.2 카피트레이딩 시장 (세부)

**CEX side (벤치마크)**

| 지표 | Bitget | 출처 |
|------|--------|------|
| Copy trading followers (2025-07) | 1.1M | Bitget July 2025 Transparency Report[5] |
| Net inflow to copy (월간) | $461.3M | Bitget July 2025 Report[5] |
| Copy trading volume Q1 2025 | $9.2B (+36% QoQ) | CoinLaw Bitget Stats[6] |
| 누적 successful trades | 100M+ | Bitget 공식[7] |
| 누적 gains 발생 | $600M | CoinLaw[6] |
| Futures copy 수익률 (profitable rate) | 93% | CoinGecko sponsored article, 2024[8] ※광고성 주의 |
| Spot copy 수익률 | 82% | CoinGecko, 2024[8] ※광고성 |

**주의**: Bitget 자체 공개 수치. 93% 수익률은 sponsored content라 믿지 말 것. 실제로는 Coin Bureau가 지적하듯 "copy trading is risk transfer, not risk removal"이 진실[9].

**Social trading 시장 TAM**

- 2021: $2.2B (The Insight Partners, via Bitget Blog[10])
- 2028 예상: $3.77B (CAGR 7.8%)
- [estimate] 크립토 only 점유율은 공개된 수치 없음. Bitget 카피 $9.2B/Q × 4Q ≈ $37B/yr 볼륨 스케일이 참고치

### 1.3 On-chain Copy / Vault 시장

| 프로토콜 | TVL | 모델 | 출처 |
|---------|-----|------|------|
| Hyperliquid HLP | $300-400M (2025-10) | Protocol vault (MM) | 0xian.substack[2] |
| Hyperliquid User Vaults | 공개 집계 없음 | 10% performance fee | Hyperliquid docs[11] |
| dHEDGE (→ Chamber) | ~$40M (2025-H1) | ERC-20 vault tokens | dHEDGE H1 2025[3] |
| Toros Finance (dHEDGE 계열) | ~$19M (2025-H1 말) | Leveraged tokens | dHEDGE H1 2025[3] |
| Enzyme | ~$25M (기준: 2022-12 $62M에서 지속 하락) | Asset mgmt vaults | Messari[12] + DefiLlama |
| Perpy Finance | [unknown - 토큰 사실상 dead] | GMX 위 vault | CryptoTotem[13] |
| STFX | [unknown - 공식 제품 stop] | Single-trade vault | [legacy] |

**핵심 관찰**:
1. On-chain 카피/vault는 CEX 대비 **100배 작다** (TVL 총합 ~$500M vs CEX copy volume $37B/yr).
2. **dHEDGE가 "Chamber"로 리브랜딩하며 Hyperliquid로 이동 중**[3]. 즉 시장이 Hyperliquid 중심으로 재편됨.
3. Perpy처럼 "GMX 위 카피 vault"는 대부분 모멘텀 잃음. 다음 웨이브 = Hyperliquid 기반.

### 1.4 Signal 마켓플레이스 (blank space)

**현재 존재하는 것**:
- 텔레그램 유료 시그널방 (2019~): 완전 offchain, 검증 불가, 자기 PnL 조작 만연
- TradingView idea (2014~): publish는 있으나 auto-execution 없음
- 3commas / Cryptohopper: 봇 마켓플레이스, bring-your-own 키 필요
- Numerai / Rocket Capital: 퀀트 시그널 토너먼트이지만 주식/전통자산 중심

**없는 것**:
- 온체인 타임스탬프된 크립토 시그널 레지스트리 + 자동 PnL 검증
- 검증된 시그널을 구독/실행하는 스마트컨트랙트 레이어
- **이게 우리 wedge.**

---

## 2. 경쟁 분석

### 2.1 Competitor Matrix

| 프로토콜 | 시그널 소스 | 실행 | 검증 방식 | 체인 | 수수료 | TVL/유저 | Moat |
|---------|-----------|------|----------|------|-------|---------|------|
| **Bitget Copy** | 인간 트레이더 | CEX orderbook | 플랫폼 자체 집계 | 중앙화 | 마스터→10% | 1.1M follower | 유저베이스, UX |
| **Bybit / OKX Copy** | 인간 트레이더 | CEX | 플랫폼 집계 | 중앙화 | 유사 | [estimate] Bitget의 30-50% | 브랜드 |
| **Hyperliquid User Vault** | 인간 vault manager | 온체인 perp | On-chain PnL | Hyperliquid L1 | 10% perf | 집계 없음 | 실행 속도, CLOB |
| **dHEDGE/Chamber** | 매니저 (알고 가능) | 다체인 (이제 HL) | On-chain | Arb/Op/Base/Polygon → HL | manager-set | $40M | SDK, 다체인 |
| **Perpy** | 인간 (GMX 트레이더) | GMX | GMX PnL | Arbitrum | 10-50% perf + 20% to DAO | dead | - |
| **Numerai** | 퀀트 (오프체인) | 중앙 집계 | 토너먼트 점수 | - | 스테이킹 | $200M+ AUM 운용 | 커뮤니티 |
| **Cogochi Protocol (우리)** | **알고리즘 (검증된 패턴 엔진)** | Hyperliquid perp | **백테스트 + on-chain PnL 양쪽** | Arb MVP → HL | TBD | 0 | **알고리즘 검증 엔진 + 28-feature stack** |

### 2.2 경쟁 요약 (3문장)

1. **CEX 카피는 유저는 많지만 알고리즘 시그널 공급자 없음** — 인간 트레이더만 올릴 수 있음.
2. **On-chain 카피/vault는 알고리즘도 가능하지만 "시그널 검증 인프라"는 없음** — 매니저가 뭘 돌리는지 불투명.
3. **우리 자리**: "검증된 알고리즘 시그널만 올리는 레지스트리 + 그걸 실행하는 vault". 경쟁자가 아직 안 잡은 슬롯.

### 2.3 주의할 경쟁 위험

- **Hyperliquid가 자체 기능으로 싸먹을 가능성**: HIP로 native signal registry 올릴 수 있음. 대응: HyperEVM에 우리가 먼저 올려서 alpha 확보, Cogochi 엔진은 proprietary.
- **Chamber(dHEDGE)가 비슷한 방향으로 올 가능성**: 이미 Hyperliquid 옮기는 중. 대응: 그들은 매니저 중심 구조를 유지, 우리는 알고리즘 중심으로 명확한 포지셔닝 분리.
- **Bitget이 "AI 카피" 마케팅**: 이미 bot copy trading 있음. 하지만 bot은 블랙박스. 우리는 feature-level transparency로 차별화.

---

## 3. 문제 정의 (Problem-Solution Fit)

### 3.1 현재 카피트레이딩의 3대 Broken Loop

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

### 3.2 Cogochi 솔루션 맵

| Problem | Cogochi Layer | 해결 방식 |
|---------|--------------|----------|
| 트레이더 잠수 | L1 Signal Registry | 인간 대신 알고리즘 엔진이 24/7 시그널 생성 |
| 시그널 검증 불가 | L1 + Oracle | 발행 즉시 온체인 타임스탬프 + Pyth/Chainlink 가격으로 자동 PnL 계산 |
| 과거 성과≠미래 | Cogochi 엔진 내부 | 4-stage gate (백테스트 → walk-forward → paper → live), weight hill-climbing으로 지속 업데이트[14] |
| 실행 마찰 | L2 Vault (Phase 2) | ERC-4626 vault가 시그널 자동 실행 |
| 수수료/슬리피지 | L3 Copy DEX (Phase 3) | Hyperliquid native 실행 |

### 3.3 왜 Cogochi 엔진이 적합한가 (내부 근거)

**이미 동작하는 요소** (프로젝트 파일 기준):
- 28-feature 벡터 (현물/선물/온체인 통합)[14]
- LightGBM 모델 + Hill Climbing weight 최적화[14]
- 29개 building block + 4-stage 검증 게이트[14]
- Binance dynamic universe 실시간 스캐너[14]

**아직 없는 것**:
- 온체인 시그널 publish 메커니즘 (우리가 새로 만들 것)
- 시그널 구독 스마트컨트랙트
- Hyperliquid 실행 connector

---

## 4. 기술 리서치

### 4.1 체인 선택: Arbitrum (MVP) + Hyperliquid (Phase 2+)

**Arbitrum 선택 이유**

| 항목 | 내용 | 출처 |
|------|------|------|
| TVL | $13.62B, L2 점유율 32.2% (2025-02) | TradingView[11] |
| Gas 비용 | 컨트랙트 호출 대략 $0.01-0.10 | [estimate, L2BEAT 2025-Q4 기준 근사] |
| 오라클 | Chainlink + Pyth full coverage | Chainlink docs, Pyth docs |
| EVM 호환 | 100% Solidity 배포 가능 | Arbitrum docs |
| 감사 생태계 | Consensys Diligence, OpenZeppelin, Trail of Bits 경험 풍부 | 각 감사사 포트폴리오 |

**Hyperliquid 선택 이유 (Phase 2+)**

| 항목 | 내용 | 출처 |
|------|------|------|
| Perp DEX 점유율 | 73% (2025-mid) | 0xian.substack[2] |
| 일일 거래량 | $2-7B | BitMEX Blog[15] |
| HLP TVL | $300-400M | 0xian.substack[2] |
| HyperEVM | 2025 런칭, custom contract 가능 | BitMEX Blog[15] |
| Funding rate 환경 | 더 변동성 큼 (BitMEX 2025 report)[15] | - |
| 실행 속도 | Sub-second, 100k+ orders/sec | 0xian.substack[2] |

**Solana는 제외**: 
- Rust/Anchor 학습 비용 (2명 팀에 부담)
- EVM 코드베이스 이원화
- Solana 기반 카피트레이딩 경쟁자 미약 (우리 차별화 포인트 아님)

### 4.2 Signal Attestation 설계

**Requirement**:
1. 시그널 발행 시점이 위변조 불가능해야 함
2. 시그널 내용(asset, direction, size, TP/SL, timestamp)이 공개 or 암호화된 채 verifiable
3. 성과 계산이 자동화 가능해야 함

**3가지 설계 옵션 비교**

| 옵션 | Pros | Cons | 추천 |
|------|------|------|------|
| A. 전체 공개 publish | 구현 단순, 신뢰 높음 | 시그널 copycat 문제 (offchain 스니핑) | MVP에 적합 |
| B. Commit-reveal (hash 먼저, 시간 뒤 reveal) | 프론트러닝 방지 | 실행 지연 | Phase 2 |
| C. TEE 기반 (Arbitrum의 BOLD/Oasis) | 완전 프라이버시 | 복잡도 폭발 | 안 함 |

**MVP 결정: A로 간다.** 이유: 우리 시그널 소스는 1000개 코인 전체 스캔이라 카피캣이 따라가려면 같은 인프라 필요. 단기적 프론트러닝 리스크는 있으나, 그 리스크가 제품 증명보다 크지 않음.

### 4.3 Oracle 선택

| 옵션 | 장점 | 단점 |
|------|------|------|
| Chainlink | Arbitrum 풀 커버리지, 보안 검증됨 | 업데이트 지연 (heartbeat 기반) |
| Pyth | 고빈도 업데이트, Perpy가 이미 사용[16] | Arbitrum push model 한계 |
| Hybrid (MVP = Chainlink, later = Pyth) | 안정+속도 | 복잡도 |

**MVP 결정**: Chainlink. 시그널 성과 검증은 분 단위로 충분 (intra-minute arbitrage를 타겟하지 않음).

### 4.4 Smart Contract 구조 (MVP)

```
SignalRegistry.sol
  - publishSignal(asset, direction, entryTarget, sl, tp, validUntil, engineHash)
  - signals[signalId] = Signal struct
  - emits SignalPublished event

SignalResolver.sol
  - resolve(signalId) reads Chainlink oracle → computes PnL
  - stores outcome on-chain
  - called after validUntil OR TP/SL hit

EngineRegistry.sol (Cogochi 엔진만 publish 가능 initial)
  - authorizedEngines mapping
  - only DAO/admin can add (Phase 1)
  - Phase 2: stake-based, slashing 가능

(Phase 2에서 추가)
StrategyVault.sol (ERC-4626)
  - subscribes to a signal stream from an engine
  - executes on Hyperliquid via builder code
  - 10-15% performance fee, split: 60% strategy creator / 40% protocol
```

**보안 체크리스트**:
- ReentrancyGuard, Ownable, Pausable
- 감사 2개: 주 (OpenZeppelin or ConsenSys), 부 (Trail of Bits or Zellic)
- 감사 예산 [estimate] $60-120k (2-month scope, 3-4 contracts)

---

## 5. Cogochi 엔진 적합성 분석

### 5.1 엔진이 산출하는 것

프로젝트 내부 문서 기준[14]:

```
입력: 실시간 시장 데이터 (현물 OHLCV, 선물 OI/펀딩/L&S, 온체인 고래/거래소 흐름)
  ↓
feature_calc.py → 28-feature 벡터
  ↓
LightGBM: P(win) 확률 출력
  ↓
4-Stage Gate:
  1. Backtest (Expectancy > 0, MDD < 20%, PF > 1.2)
  2. Walk-forward (72 months, 75%+ quarters positive)
  3. Paper trade (30일, backtest와 괴리 < 30%)
  4. Live small-size (60일, net PnL > 0)
  ↓
Gate 통과한 시그널만 실시간 시그널러에 투입
```

### 5.2 시그널 소스로서의 장점

1. **블랙박스가 아님**: 28 feature + building block 조합이 공개 가능한 구조. "왜 이 시그널인가"를 설명 가능.
2. **재현 가능**: 같은 input → 같은 output (인간 트레이더와 다름).
3. **지속 학습**: Hill Climbing + 피드백으로 weight 자동 업데이트[14]. 즉 "엔진이 시간이 지날수록 더 좋아진다" 스토리 가능.
4. **이미 검증 루프 있음**: 4-stage gate를 프로토콜 레벨로 올리면 됨.

### 5.3 한계 (정직하게)

- **아직 live 트랙 레코드 부족**: 프로젝트 문서 기준 W1~W8 타임라인으로 "첫 시그널"을 만들고 있는 단계[14]. 진짜 out-of-sample PnL 데이터가 얇다.
- **LightGBM이 regime change에 약함**: 불장/약장 전환기에 정확도 급락 가능. Regime Filter 대응 필요[14].
- **시그널 1개당 커버리지**: 현재 Binance 중심, on-chain 데이터는 Surf AI / alternative.me 의존. API 의존성 높음.

**→ Research Dossier에 명시하고, Whitepaper에서도 Non-Goals로 드러낼 것. 투자자는 과장을 싫어한다.**

---

## 6. 규제 리서치

### 6.1 한국 (가장 중요 — 우리가 한국 팀이므로)

**가상자산이용자보호법 (2024.7.19 시행)**[17][18]
- 적용 대상: **가상자산사업자 (VASP)**. 즉 거래소, 지갑사업자, 수탁업자.
- 의무: 예치금 분리보관, 보험/준비금, 거래기록 15년 보관, 이상거래 감시, 미공개정보/시세조종/부정거래 금지.

**Cogochi Protocol의 포지션 분석**:
- L1 Signal Registry는 "정보 publish"만 함 → VASP 아님 가능 (투자자문/일임이 아닌 정보 제공)
- L2 Vault가 유저 자금을 받으면 → **유사수신/투자일임 해당 리스크**. 이 부분이 회색지대.
- 대응: 해외법인(BVI, Cayman, Panama, Marshall Islands 중 택일) + 스마트컨트랙트 non-custodial 설계 + 한국 유저 접근 제한 고지.
- **결정 사항**: 법률검토 필요. [unknown — 법무법인 미팅 후 확정] 예산 [estimate] $15-30k (김앤장/세종/율촌 레벨 한정, 월스트리트식은 $100k+).

### 6.2 미국

- SEC Howey Test: 투자계약증권 해당 여부. 시그널 구독은 "타인의 노력으로 이익" 요소 있어 증권성 논란 가능.
- 대응: US 유저 차단 (geofencing + KYC), 혹은 "DeFi protocol infrastructure only" 포지션.

### 6.3 싱가포르 / 두바이

- Singapore MAS: Payment Services Act 하에서 DPT(Digital Payment Token) 서비스 라이센스. 우리 구조는 DPT trading이 아니라 signal infrastructure → 라이센스 필요성 낮음 [법률검토 필요].
- Dubai VARA: 비교적 우호적. Cayman + Dubai 조합이 다수 크립토 프로젝트 선택.

### 6.4 권고

**3개월 내 MVP 구간**:
- 법인설립 (BVI or Cayman, 약 $5-10k)
- Terms of Service / Risk Disclosure (간단한 drafting, $5k 이하)
- 복잡한 라이센스는 시드 이후

**Non-Goal**: 3개월 안에 한국 VASP 신고 안 함. 해외법인으로 offshore 포지션.

---

## 7. 시장 진입 전략

### 7.1 초기 유저 획득 (MVP 런칭 시점)

**Phase 1 타겟**: 크립토 네이티브 퀀트 유저 500명 (3개월 내 목표)
- 서브셋: Hyperliquid 이미 사용 중 + Vault나 bot에 이미 자금 쓰는 유저 + 영문/한글 가능
- Channel:
  1. Crypto Twitter (퀀트/DeFi KOL에게 엔진 성과 트윗, 주 2-3회)
  2. Discord 2개 (Hyperliquid, Arbitrum 커뮤니티)
  3. Dune dashboard 공개 (엔진 시그널 on-chain PnL 실시간 추적)
  4. Medium / Mirror 심층 글 (3편: "Why algorithmic copy trading", "Inside Cogochi engine", "Live signal examples")
  5. 한국 트레이더 커뮤니티 (텔레그램 방) — 베타 시드

**왜 500명이 충분한가 (계산)**
- 500 follower × 평균 deposit (추후 vault) $500 = $250k TVL [estimate]
- 이 정도면 투자자한테 "real usage" 증명 가능
- Hyperliquid user vault top 10 중 $250k 수준이 많음[11]

### 7.2 시그널 Creator (engine operator) 모집

Phase 1에서는 Cogochi 엔진만 등록 (우리 자체).
Phase 2에서 third-party 퀀트도 등록 가능 (stake + slashing).

### 7.3 GTM KPI (3개월)

| # | 지표 | 목표 | Kill criteria |
|---|------|------|---------------|
| K1 | On-chain 시그널 발행 수 | 500+ | < 100 |
| K2 | Unique wallet 구독자 | 300+ | < 50 |
| K3 | 엔진 실제 win rate (out-of-sample) | 55%+ | < 45% |
| K4 | Dune dashboard 조회수 | 5k/mo | < 500 |
| K5 | VC meeting → follow-up 전환율 | 30%+ | < 10% |

---

## 8. 리스크 & Non-Goals

### 8.1 주요 리스크

| 리스크 | 가능성 | 영향 | 대응 |
|-------|--------|------|------|
| Cogochi 엔진 live PnL이 negative | 중 | 치명 | Phase 1은 "시그널 발행 인프라"로 포지션, 엔진 성과는 별도 트랙 레코드로 |
| Hyperliquid 자체 기능으로 카피해버림 | 중 | 높음 | HyperEVM 위에 먼저 올려 lock-in + 엔진 proprietary |
| 규제 (한국 VASP, 미국 SEC) | 중 | 높음 | 해외법인 + non-custodial + geofencing |
| 스마트컨트랙트 취약점 | 중 | 치명 | 감사 2개 + bug bounty + 초기 TVL 캡 |
| 카피캣 (시그널 sniffing) | 높음 | 중 | MVP 수용, Phase 2 commit-reveal |
| 팀 번아웃 (2명) | 높음 | 높음 | 3개월 스코프 축소 (L1만), 나머지는 로드맵 |

### 8.2 Non-Goals (이 프로토콜이 **안 하는 것**)

- 자체 perp 엔진 빌드
- 자체 L1/L2 체인
- AMM / LP 기능
- 브리지 / swap 기능
- 런치패드 / IDO
- 전통자산(주식, 원자재) 시그널 — 크립토만
- Social feed / 채팅 기능 — Discord/TG로 충분
- 스테이킹 기능 (Phase 3 이전)
- Mobile app (Phase 3 이전, MVP는 web만)

---

## 9. Open Questions (해결 안 된 것들 — 투자자한테 미리 말할 것)

1. **Cogochi 엔진의 out-of-sample live 성과가 Phase 1에 충분히 쌓일까?**
   - 프로젝트 문서 기준 W1~W8 엔진 연결 중[14]. Phase 1 런칭 시점에 60일 live 데이터 정도가 현실적. 이게 VC한테 설득될지가 관건.

2. **규제 완벽 회피 가능한가?**
   - [unknown — 법률 자문 필요]. 현재 가정은 "L1은 정보 publish → 세이프, L2 이후는 법인 구조로 해결".

3. **토큰 발행 여부 및 시점**
   - 시드 단계 결정 아님. Phase 2에서 필요성 판단. 토큰 없이 performance fee만으로 sustainability 가능한지가 1차 테스트.

4. **Cogochi 엔진 이외의 third-party 엔진은 Phase 2에 정말 들어올까?**
   - 퀀트 탑 유저는 자기 알파를 public하게 올리지 않으려는 성향 강함. Incentive 설계 난이도 높음.

---

## 10. Sources

[1] CoinGecko. "2025 Annual Crypto Industry Report." 2026-01-15. https://www.coingecko.com/research/publications/2025-annual-crypto-report

[2] 0xian. "Understanding Hyperliquid's HLP Vault." 2025-10-16. https://0xian.substack.com/p/understanding-hyperliquids-hlp-vault

[3] dHEDGE. "dHEDGE 2025 Update (H1)." 2025-07-29. https://blog.dhedge.org/dhedge-2025-update/

[4] TradingView/Cointelegraph. "Crypto derivatives volume explode to $86T in 2025." 2025-12-25. https://www.tradingview.com/news/cointelegraph:ec8d04aa6094b:0-crypto-derivatives-volume-explode-to-86t-in-2025/

[5] Bitget. "July 2025 Transparency Report." 2025-08-18. https://www.globenewswire.com/news-release/2025/08/18/3134737/0/en/Bitget-s-July-Report-Shows-461M-Net-Inflows-and-100K-New-Copy-Trading-Users.html

[6] CoinLaw. "Bitget Statistics 2026." 2025-09-05. https://coinlaw.io/bitget-statistics/

[7] Bitget. "Copy Trading Overview." https://www.bitget.com/copy-trading/overview

[8] CoinGecko (sponsored). "Bitget Copy Trading: All it Takes is Just A Few Clicks." 2024-04-22. https://www.coingecko.com/learn/bitget-copy-trading-all-it-takes-is-just-a-few-clicks

[9] Coin Bureau. "Bitget Copy Trading Review: Is It Worth Copying Traders In 2026?" 2026-02-27. https://coinbureau.com/review/bitget-copy-trading-review

[10] Bitget. "Bitget Copy Trading Report: Almost Half Of Copy Traders Are Gen Z." https://www.bitget.com/blog/articles/bitget-copy-trading-report

[11] TradingView/Cointelegraph. "What is Hyperliquid (HLP), and how does it work?" 2025-02-21. https://www.tradingview.com/news/cointelegraph:beef14d21094b:0-what-is-hyperliquid-hlp-and-how-does-it-work/

[12] Messari. "Enzyme: On-chain Asset Management." 2022-12-28. https://messari.io/report/enzyme-on-chain-asset-management (※ 2022 기준, 최신 TVL은 DefiLlama 참조)

[13] CryptoTotem. "Perpy Finance (PRY)." https://cryptototem.com/perpy-finance-pry/

[14] Cogochi internal project files (WTD_Cogochi_Final_Design_v1.md, cogochi-unified-design.md, 06_autoresearch_ml.md, core-loop.md). Private, as of 2026-04-11.

[15] BitMEX Blog. "What is Hyperliquid? The Complete 2026 Guide." 2026-02-05. https://www.bitmex.com/blog/what-is-hyperliquid

[16] Perpy Finance Docs. "Protocol Technical Description." https://docs.perpy.finance/perpy-finance/perpy/protocol-technical-description

[17] 금융위원회. "7.19일부터 가상자산이용자보호법 시행." 2024-07. https://www.fsc.go.kr/no010101/82682

[18] 김·장 법률사무소. "가상자산 이용자 보호 등에 관한 법률안의 주요 내용." https://www.kimchang.com/ko/insights/detail.kc?sch_section=4&idx=27420

---

**Next document**: 02_Pitch_Deck_Outline.md (10-15 slides, VC 1차 미팅용)
