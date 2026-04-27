# W-0213 — MM Microstructure Validation & Document Architecture

**Owner:** Research Core
**Status:** Design draft (2026-04-27)
**Type:** Research report + meta-design (어떤 문서를 만들지의 설계)
**Depends on:** `01_PATTERN_OBJECT_MODEL.md`, `03_SEARCH_ENGINE.md`, `09_RERANKER_TRAINING_SPEC.md`

> **이 문서의 목적**
>
> 1. 우리가 만든 phase machine 시스템이 학계의 어떤 이론에 닿아있는지 깊이 분석한다 (Kyle 1985 → MMR 2022).
> 2. 그 이론에 비추어 현 시스템의 갭을 진단한다 (검증 프레임 부재가 핵심).
> 3. 갭을 메우기 위해 만들어야 할 **새 문서들의 아키텍처**를 설계한다.
> 4. 가장 시급한 검증 프레임(Validation Framework)을 코드 수준까지 구체화한다.
>
> 이 문서는 그 자체로 이정표지만, **각 새 문서가 본격 작성되기 전의 상위 설계도**다. 이 문서가 통과되면 5개 sub-document로 분기 작성한다.

---

## 0. TL;DR (3줄)

1. 너 phase machine은 **묵시적으로 Kyle 1985 + Avellaneda-Stoikov 2008**을 코드화하고 있다 (의식 안 했어도).
2. 검증 프레임은 *retrieval quality* (NDCG)만 있고 *pattern correctness* (directional_belief 라벨이 통계적으로 옳은가)는 없다.
3. 5개 sub-doc + α/β/γ 코드 작업이 필요하다. 우선순위는 (α) phase-conditional return 측정 → (β) threshold 출처 점검 → (γ) library audit.

---

## Part 1 — Deep Research Report: Market Microstructure Theory

이 부분은 너 시스템이 닿아있는 이론을 학계 논문 수준으로 정리한 것. **새 문서 `14_MM_THEORY_GROUNDING.md`의 시드**가 된다.

### 1.1 왜 Microstructure인가

너 vocabulary (`funding_extreme_short`, `oi_spike`, `volume_dryup`, `higher_lows_sequence`)는 **모두 Market Microstructure 분야의 quantity와 1:1 매칭**된다. 이 분야의 주요 이론을 모르면 너 시스템의 신호가 *왜* 의미 있는지 정당화할 수 없다.

### 1.2 이론 계보 — 8개 핵심 논문

| 연도 | 논문 | 핵심 주장 | 너 시스템과의 연결 |
|---|---|---|---|
| 1900 | Bachelier, *Théorie de la Spéculation* | 가격을 random walk (산술 BM)로 모델링한 첫 시도 | z-score 사상의 원형. 1973 BSM의 직계 조상 |
| **1973** | **★ Black-Scholes-Merton** | **GBM 가정 + Itô calculus + 무차익 가격결정. 모든 후속 이론의 수학적 DNA** | **모든 z-score 신호의 통계적 근거** |
| 1985 | **Kyle, "Continuous Auctions and Insider Trading"** | informed trader / noise trader / market maker 3-actor 모델. price impact = λ × order flow | OI/funding 신호 = informed flow 추적 |
| 1985 | Glosten-Milgrom, "Bid, Ask and Transaction Prices..." | adverse selection이 spread를 자연 생성. 모든 trade에 정보 비용 | spread 변화 = 정보 비대칭 신호 |
| 1995 | Tishby, "Information Bottleneck" | 예측에 필요한 최소 feature subset T 찾기 | feature ablation의 이론적 근거 |
| 2002 | Easley-Kiefer-O'Hara, **"VPIN"** | toxic flow의 양적 측정. PIN의 high-frequency 버전 | volume_spike + oi_spike = VPIN 상승 |
| **2008** | **Avellaneda-Stoikov, "High-frequency trading in a limit order book"** ⭐ | 재고(inventory)와 변동성을 입력으로 받는 optimal MM quote. HFT 교과서 | quote 동작의 normative baseline |
| 2015 | Cartea-Jaimungal-Penalva (book), *Algorithmic and HFT* | optimal MM/execution을 stochastic control로 통합 | 너 thesis들의 수학적 표현 |
| 2022 | Milionis-Moallemi-Roughgarden, **"LVR"** | AMM LP의 손실 = informed flow에 노출된 시간 적분. constant-product의 수학적 한계 | prop-amm-challenge의 점수 함수 |

### 1.2.5 Black-Scholes-Merton 1973 — 공통 수학 뿌리 ★

**왜 별도 섹션인가:** A-S 2008과 MMR 2022가 "다른 이론"처럼 보이지만 **같은 수학 DNA**를 공유한다. BSM 1973이 그 뿌리다. 너 시스템의 모든 z-score 기반 신호도 같은 가정 위에 서 있다.

#### 핵심 가정 (3개)

```
가격 process:    dS = μ S dt + σ S dW       (Geometric Brownian Motion)
변동성 σ:        constant or local function
시장:           continuous trading + no arbitrage
```

이 세 가정에서 자동으로 도출되는 것:
- **log-return의 정규분포성** → z-score 의미 있음
- **σ²가 risk의 자연 단위** → 모든 후속 이론에 그대로 흘러감
- **Itô's lemma**로 path-dependent 함수 미분 가능 → optimal control 풀 수 있음

#### σ²의 후손 — 모든 후속 이론에 같은 위치로 등장

```
1973 BSM
  ├─ 가정: dS = μS dt + σS dW   (GBM)
  ├─ 결론: option price ∝ σ²
  │
  ├──→ 1985 Kyle
  │     λ (price impact) ∝ σ_v / σ_u
  │     ↑ σ가 informed/noise 분리 척도로 사용
  │
  ├──→ 2008 Avellaneda-Stoikov
  │     optimal spread:    δ ∝ γ · σ² · (T-t)
  │     reservation price: r = s − q · γ · σ² · (T-t)
  │     ↑ σ²가 spread 크기와 inventory penalty의 핵심
  │
  └──→ 2022 MMR (LVR)
        LVR = ∫ (σ²/2) · L dt
        ↑ σ²가 LP 손실의 dominant term
```

→ **세 이론의 핵심 공식에 σ²이 동일한 위치**에 있다. 우연 아니라 GBM + Itô calculus 위에 가지가 뻗었기 때문.

#### 너 vocabulary와의 연결

너의 모든 z-score 신호:
- `oi_zscore ≥ 2.0`
- `funding_rate_zscore ≤ -2.0`
- `volume_zscore ≥ 2.0`

→ **z-score가 합리적인 이유 = 데이터의 *변화량*이 BSM-스타일 정규분포를 *근사*한다는 가정**.

이 가정이 깨지는 곳 = 너 신호도 깨지는 곳:

| BSM 가정 위반 | 너 신호 영향 |
|---|---|
| **Fat tail** (실제 log-return은 정규보다 꼬리 두꺼움) | z-score 2.0이 정규분포 가정 시 2.5% 빈도 → 실제는 5~8%. 임계값 재조정 필요. |
| **Jump** (이벤트 시 가격 점프) | z-score 무의미해짐. event window 따로 필터링 필요. |
| **Variance clustering** (GARCH 효과) | rolling window σ 계산 → window 크기에 따라 z-score 변동. window 정책 명시 필요 (16 doc). |
| **Non-stationarity (regime shift)** | bull regime에서 학습된 σ가 bear regime에서 무의미. → 17 regime taxonomy의 직접 동기. |

#### Arithmetic vs Geometric — 실수하기 쉬운 곳

너 vocabulary 검증 시 반드시 확인:
- `oi_change_pct` — arithmetic? geometric (`log(OI_t / OI_{t-1})`)? **차이 큼**.
- `volume_zscore` — raw volume z-score? log-volume z-score? log이 BSM 정합.

**권장:** 모든 z-score는 *log-차이* 기반으로 통일. 16 doc에서 audit 시 강제.

#### Bachelier 1900 — 한 줄 역사

Bachelier가 1900년 박사 논문에서 가격을 BM으로 모델링 (Einstein 1905의 BM 정의보다 먼저). 그러나 *산술 BM* (가격 음수 가능). BSM 1973이 이걸 *기하 BM*으로 고쳐서 가격이 양수만 갖도록 함. 너 시스템도 raw price 차이가 아닌 log-return을 쓰는 한 BSM 정합.

#### 실용적 결론 (16 doc로 가야 할 것)

1. 모든 z-score 신호의 underlying 변수가 log-차이인지 raw 차이인지 명시
2. Z-score window 크기 결정 시 GARCH-스타일 clustering 고려
3. Fat tail 보정: 정규분포 가정의 2σ가 아니라 **empirical quantile** (95th, 98th percentile)로 임계값 재계산 (선택)
4. Jump event는 별도 필터로 분리 (event_window 라벨)

---

### 1.3 Kyle 1985 — 너 시스템의 가장 깊은 뿌리

#### 모델 구조
세 actor:
- **Insider (informed)**: fundamental value `v`를 알고, 자신의 trade가 가격에 미칠 impact까지 고려해 거래량 `x` 결정.
- **Noise traders**: random 거래량 `u`. 정보 없음.
- **Market maker**: 총 order flow `y = x + u`만 관측. price `p = E[v|y]`로 set.

#### 핵심 결과
- `λ = price impact coefficient = (σ_v / σ_u) × 0.5` (continuous 한계).
- **순수 informed flow는 식별 불가**. MM은 noise와 섞인 총량만 본다.
- Insider의 trade는 **slow** (kelly-optimal): 한 번에 다 던지면 자기 정보가 가격에 다 반영되어 이익 0.

#### 너 시스템과의 연결 — funding_extreme_short
너의 `funding_extreme_short` = `funding_rate_zscore <= -2.0` 신호는 **숏 포지션 비대칭 = informed-direction 가설**.
- 펀딩이 음수로 극단 = 숏 측이 프리미엄 지불 = 숏이 강한 conviction
- Kyle식 해석: 숏이 informed라면 → 가격 하락 압력 (`v` 낮은 추정)
- 그러나 Kyle 핵심: **noise와 섞여있어 직접 식별 불가**. 그래서 너 시스템에서 `funding_extreme_short` 단독은 `avoid_entry`이지 `entry_short`이 아니다 — 똑똑함.

#### 너가 명시 안 한 가설
> H-Kyle: `funding_extreme_short` + `oi_small_uptick` + `low_volume` 조합은 **informed short build-up이지만 아직 trigger 안 됨** (Kyle's slow-trading 단계). 이후 `volume_spike + oi_spike` (Phase 3 real_dump)가 trigger.

이걸 명시적으로 검증해야 한다. → Validation Framework (Part 5)에서 다룸.

### 1.4 Glosten-Milgrom 1985 — Spread = 정보 비용

#### 모델 결과
- 모든 trade는 정보를 노출시키므로 MM은 **spread를 자기방어 비용으로 청구**.
- spread 크기 ∝ `Pr(informed)` × `|v_high - v_low|`.

#### 너 시스템과의 연결
너 vocabulary에는 spread 직접 측정이 없음. 그러나:
- `volume_dryup_flag` ≈ informed 비율 낮음 신호 (좋은 MM 환경)
- `volume_spike` ≈ informed 비율 높음 의심 (위험)
- `arch_zone (compression)` ≈ spread tight (정보 적음 → MM 활발)

→ **갭**: spread/depth 직접 측정이 vocabulary에 없다. Phase 2에서 추가 후보.

### 1.5 Easley-Kiefer-O'Hara 2002 — VPIN

#### 모델
**Volume-Synchronized Probability of Informed trading.** 시간이 아닌 **volume bucket**으로 샘플링해서 trade의 buy/sell imbalance를 측정.
```
VPIN(t) = (1/n) × Σ_{i=t-n+1..t} |V_buy_i - V_sell_i| / V_i
```
- VPIN > 0.5 → flow가 toxic (informed가 많음) → MM은 quote 끄거나 spread 확대.

#### 너 시스템과의 연결
너의 `volume_zscore >= 2.0` (volume_spike) + `oi_zscore >= 2.0` (oi_spike) 동시 발생 → **VPIN spike와 정확히 동일한 microstructure event**. OI 변화가 buy/sell side를 직간접 반영하므로.

→ Phase 3 real_dump의 `[price_dump + oi_spike + volume_spike]` 트리플은 학계 용어로 **"VPIN-confirmed informed dump"**. 학계 용어로 너 패턴을 *다시 쓰면* 같은 thing이다.

### 1.6 Avellaneda-Stoikov 2008 — Optimal MM (HFT 교과서) ⭐

#### 모델 구조 (Stochastic control)
MM은 inventory `q`, mid-price `s`, 시간 `t`를 가진 상태에서:
- **reservation price**: `r(s, q, t) = s − q × γ × σ² × (T−t)` — 재고 많으면 보수 낮춤 (팔고 싶음).
- **optimal spread**: `δ_a + δ_b = γ × σ² × (T−t) + (2/γ) × ln(1 + γ/k)`
  - `γ` = 위험회피
  - `σ` = 변동성
  - `k` = 거래 도착률
- bid = `r − δ_b`, ask = `r + δ_a`.

#### 핵심 직관
- **변동성 ↑ → spread ↑** (risk premium)
- **재고 비대칭 → reservation price 이동** (mean-reversion towards 0 inventory)
- **시간 줄어듦 → urgency 증가**

#### 너 시스템과의 연결 — 가장 깊음
너 phase machine은 **A-S optimal MM이 보는 환경 변수를 phase 라벨로 압축**한 것이다:

| A-S 변수 | 너 신호 |
|---|---|
| 변동성 σ ↑ | `volume_spike`, `price_dump`, `price_spike` |
| 변동성 σ ↓ (good MM env) | `volume_dryup`, `sideways`, `arch_zone` |
| inventory `q` 비대칭 | `funding_extreme_short` (시장 전체 비대칭), `oi_spike + price 방향` |
| trade rate `k` ↑ | `volume_spike` |
| 추세성 `μ ≠ 0` (extension) | `higher_lows_sequence`, `breakout` |

#### 명시적 가설 — 각 phase가 A-S optimal MM의 어떤 regime에 해당하는가

```
Phase 1 fake_dump:
  σ moderate↑, q 비대칭 (short heavy), k normal
  → A-S: spread widen, reservation price 약간 down
  → directional_belief = avoid_entry (추가 reversion 위험)

Phase 2 arch_zone:
  σ ↓, q balanced, k ↓
  → A-S: spread tight, optimal MM 환경
  → directional_belief = avoid_entry (정보 부족, 결정 미루기)

Phase 3 real_dump:
  σ spike, q skewed (forced short cover/long liquidation), k spike
  → A-S: spread blow up, MM이 quote 끄거나 inventory dump
  → directional_belief = event_confirmed (정보 release 이벤트)

Phase 4 accumulation:
  σ moderate, q rebalance중, k normal (MM 호가 회복)
  → A-S: spread normalize, MM이 ask side 채우는 영역
  → directional_belief = entry_zone (MM과 같은 방향 베팅)

Phase 5 breakout:
  σ ↑, q one-sided, k ↑
  → A-S: spread widen, MM이 늦게 들어옴
  → directional_belief = late (이미 늦음)
```

→ **이게 너 시스템의 진짜 이론적 골격**이다. 이걸 14_MM_THEORY_GROUNDING.md에 명시해야 한다.

### 1.7 Milionis-Moallemi-Roughgarden 2022 — LVR

#### 모델
AMM LP의 손실 = `LVR = ∫ (σ²/2) × x × y / (x+y) dt` (constant-product 기준).
- LP는 **시간이 지나면 무조건 loss** (informed arb가 항상 이김).
- 손실 크기 = 변동성² × pool size.
- AMM 설계의 수학적 한계.

#### 너 시스템과의 연결
너 시스템은 LP 아니지만, **prop-amm-challenge가 LVR을 점수화**한 것. 너가 prop-amm 영감 받은 이유 = LVR을 minimize하는 quote 전략 = informed flow 회피 전략.

너 phase machine의 `oi_unwind: forbidden=true`는 LVR 관점에서:
- "OI unwind 진행 중인데 entry = LVR-style 손실 예상"
- → LP에 비유하면 "변동성 낮은데 큰 swap 안 일어남, fee 못 벌고 손실 누적"

→ **LVR은 prop-amm 베이스라인이지 너 패턴매칭의 직접 이론 아님**. 그러나 점수 함수 설계 시 참조 가치.

### 1.8 종합 — 너 시스템의 정확한 이론적 정체

> **너 phase machine = "Avellaneda-Stoikov optimal MM이 보는 microstructure regime을 Kyle 1985-style informed/noise 분리 신호로 라벨링한 sequential state machine"**

이게 한 줄 요약이다. 학계 용어로 옮긴 것.

---

## Part 2 — 현 시스템 매핑 (Vocabulary ↔ Theory)

이 부분은 새 문서 `14_MM_THEORY_GROUNDING.md`의 §2의 시드.

### 2.1 16개 signal × 학계 quantity 매핑 표

| Signal | MM Theory quantity | 출처 논문 | 너 binding 식 | 출처 검증 필요 |
|---|---|---|---|---|
| `price_dump` | realized return | — | `price_change_1h ≤ -0.05` | **임계 -5% 출처 불명** |
| `price_spike` | realized return | — | `price_change_1h ≥ +0.05` | **임계 +5% 출처 불명** |
| `fresh_low_break` | structural breakout | technical analysis | `dist_from_20d_low ≤ 0` | 윈도우 20d 출처? |
| `higher_lows_sequence` | accumulation pattern | Wyckoff (technical) | `higher_low_count ≥ 2` | n=2 출처? |
| `higher_highs_sequence` | trend continuation | Dow Theory | `higher_high_count ≥ 1` | n=1 출처? |
| `sideways` | low-volatility regime | A-S σ↓ | `range_width_pct ≤ 0.08` | 8% 출처? |
| `upward_sideways` | accumulation phase | Wyckoff phase B/C | sideways + higher_low ≥ 2 | — |
| `arch_zone` | volatility compression | A-S optimal MM env | `compression_ratio ≥ 0.5 AND volume_dryup` | 0.5 출처? |
| `range_high_break` | breakout | — | `breakout_strength ≥ 0.01` | 1% 출처? |
| `oi_spike` | informed flow proxy | Kyle / VPIN | `oi_zscore ≥ 2.0` OR `oi_spike_flag` | **z-score 윈도우 미명시** |
| `oi_small_uptick` | slow informed build | Kyle slow-trading | `0 ≤ oi_change_pct ≤ 0.03` | 3% 출처? |
| `oi_hold_after_spike` | conviction persistence | — | `oi_hold_flag` | flag 정의? |
| `oi_reexpansion` | new informed entry | Kyle | `oi_reexpansion_flag` | flag 정의? |
| `oi_unwind` | informed exit | — | `oi_change_pct ≤ -0.05` | -5% 출처? |
| `funding_extreme_short` | positioning asymmetry | Kyle informed | `funding_rate_zscore ≤ -2.0` | **8h cycle, 윈도우?** |
| `funding_positive` | positioning bias | — | `funding_rate > 0` | — |
| `funding_flip_negative_to_positive` | regime transition | — | `funding_flip_flag` | flag 정의? |
| `low_volume` | low VPIN regime | EKO | `volume_zscore ≤ 1.0` | **윈도우?** |
| `volume_spike` | high VPIN | EKO | `volume_zscore ≥ 2.0` | **윈도우?** |
| `volume_dryup` | very low VPIN | EKO + A-S | `volume_dryup_flag` | flag 정의? |
| `short_build_up` | positioning trend | Kyle slow-trade | LSR↓ + funding negative | 정량화? |
| `short_to_long_switch` | positioning reversal | — | funding_flip + oi_reexpansion | — |

### 2.2 발견된 구체적 갭들

1. **z-score 윈도우 명시 부재 (전부)**: `oi_zscore`, `funding_rate_zscore`, `volume_zscore` 모두 어떤 lookback window인지 안 적혀있음. 동일 z-score = 2가 7-day rolling vs 30-day rolling vs all-time이 의미가 완전 다름.
2. **임계값 출처 부재 (전부)**: -5%, +5%, 8%, 0.5, 2.0 모두 출처 미명시. **데이터 calibration인지, 감인지** 알 수 없음.
3. **`*_flag` 정의 부재**: `oi_spike_flag`, `oi_hold_flag`, `oi_reexpansion_flag`, `volume_dryup_flag`, `funding_flip_flag` — feature_window에서 어떻게 계산되는지 docs/design에 없음. 코드 봐야 알 수 있음.

→ **β (threshold 점검) 작업이 가장 먼저 잡아야 할 것**.

### 2.3 Phase × MM regime 매핑 (이미 §1.6에서 했음)

이 표를 14_MM_THEORY_GROUNDING.md §3에 정식 보존.

---

## Part 3 — 갭 진단 (재진단)

03/09 docs 읽고 보강. 이전 진단(아키텍처 8/10, 검증 3/10)을 세분화.

### 3.1 검증 프레임 — 두 층으로 분리

| 층 | 정의 | 현 상태 |
|---|---|---|
| **Layer R: Retrieval Quality** | "비슷한 거 잘 찾아주는가" — NDCG, MRR, P@K | **9/10**. `03 §9 BenchmarkPack`, `09` reranker spec, promotion gate 다 있음. |
| **Layer P: Pattern Correctness** | "directional_belief 라벨이 통계적으로 옳은가" — phase-conditional return, ablation, regime-conditional | **2/10**. 아예 없음. |

→ 너 시스템의 진짜 갭은 **Layer P**. Retrieval은 잘 검증된다.

### 3.2 Layer P가 필요한 이유

> Layer R이 100점이어도 Pattern 자체가 틀리면 시스템은 무가치하다.

예: OI Reversal v1을 NDCG@5 = 0.95로 retrieval하지만, Phase 4에서 entry한 forward return이 random과 통계적으로 구분 안 되면 → "쓰레기를 잘 골라주는" 시스템.

→ **Layer P 검증 = phase-conditional return의 통계 검정**.

### 3.3 갭 9개 (재정리)

| # | 갭 | 영향 | 새 문서 책임 |
|---|---|---|---|
| 1 | Phase-conditional return 측정 부재 | Pattern correctness 알 수 없음 | **15** Validation Framework |
| 2 | Threshold 출처 불명 (z-score 등) | 임계값이 데이터/감 둘 중 뭔지 모름 | **16** Threshold Calibration |
| 3 | Z-score window 미명시 | 같은 z=2가 다른 의미 | **16** + 01 보강 |
| 4 | Regime concept 부재 | bull/bear/sideways 무시 | **17** Regime Taxonomy |
| 5 | 5-phase 상한 정당화 부재 | 임의 제약 | 01 §11 보강 |
| 6 | Phase timeout `bars` 단위 어색 | timeframe 종속, 의미 다름 | **17** + 01 보강 |
| 7 | Personal variant overfit guard 부재 | 유저가 풀어버리면 모든 시점 매칭 | **18** Variant Guardrails |
| 8 | Pattern-level random baseline 부재 | "phase 4 좋다"의 비교 대상 미명시 | **15** Validation Framework |
| 9 | Pattern lineage discovery process 부재 | v1→v2 evolution이 ad-hoc | **15** §discovery loop |

---

## Part 4 — Document Architecture (새 문서 5개)

이 부분이 **"어떤 문서를 만들지의 설계"**다. 5개 새 문서 + 2개 기존 문서 보강.

### 4.1 신규 문서 5개

#### 14_MM_THEORY_GROUNDING.md
**목적:** 너 시스템의 학계 이론 grounding 명시.
**입력:** Part 1, Part 2.
**구성:**
- §1. Theory lineage (Kyle, GM, EKO, A-S, Cartea, MMR)
- §2. Vocabulary × theory mapping (Part 2 표)
- §3. Phase × A-S regime mapping (§1.6)
- §4. 명시적 가설 (H-Kyle, H-VPIN, H-AS) — 각 phase의 이론적 근거
- §5. Reading order — 팀이 1주 안에 읽을 핵심 자료
- §6. Non-goals — 이론을 코드로 옮기는 건 다른 문서 책임

**길이 예상:** 800~1200줄.

**우선순위:** 중. 검증 프레임 다음에 작성.

#### 15_PATTERN_VALIDATION_FRAMEWORK.md ⭐ (가장 시급)
**목적:** Layer P 검증 프레임의 완전 spec.
**입력:** Part 5 (다음 섹션).
**구성:**
- §1. Validation 4 metrics (M1~M4 — Part 5에서 정의)
- §2. Baselines 4종 (B0~B3 — Part 5에서 정의)
- §3. Statistical tests (t-test, KS, bootstrap CI, multiple comparison)
- §4. Phase-conditional return — 데이터 추출 SQL + Python pipeline
- §5. Signal ablation — leave-one-out spec
- §6. Sequence completion analysis
- §7. Personal variant overfit detection
- §8. Acceptance gates per pattern (when does pattern enter prod?)
- §9. Reporting — dashboard 한 장 spec
- §10. Build tasks (코드 파일 단위)

**길이 예상:** 1000~1500줄.

**우선순위:** 최상. 다음 1주의 가장 중요한 작업.

#### 16_THRESHOLD_CALIBRATION_SPEC.md
**목적:** vocabulary 임계값들의 출처를 추적, 미정의된 것들 명시 + 데이터 기반 calibration 절차.
**구성:**
- §1. Audit — 23개 signal 임계값 출처 표 (Part 2 §2.2 이슈 다 해결)
- §2. Z-score window 정책 (oi: 7d, funding: 30d × 8h cycle, volume: 7d 등)
- §3. Calibration procedure — 한 임계값 결정 시 데이터 기반 방법
- §4. Sensitivity analysis — threshold ± 30% 흔들었을 때 phase frequency 변화
- §5. Migration — 기존 hardcoded 임계값을 calibrated 값으로 옮기는 절차
- §6. Vocabulary doc (01) 어디를 어떻게 보강할지

**길이 예상:** 600~900줄.

**우선순위:** 상. 15와 병렬 가능.

#### 17_REGIME_TAXONOMY.md
**목적:** Regime을 first-class concept으로 도입.
**구성:**
- §1. Regime 정의 — BTC bull/bear/sideways + volatility regime
- §2. Regime 라벨링 알고리즘 (Hidden Markov Model 후보 + 단순 rolling threshold 후보)
- §3. Regime × pattern conditional 평가 (15와 연동)
- §4. Regime transition events — 패턴 작동의 boundary
- §5. Phase timeout을 `bars` 대신 `volume bucket` 또는 `hours`로 옮기는 정당화
- §6. DB schema — `regime_labels` 테이블

**길이 예상:** 600~800줄.

**우선순위:** 중. 15 통과 후 시작.

#### 18_PERSONAL_VARIANT_GUARDRAILS.md
**목적:** 유저가 threshold 풀어 overfit 만드는 거 차단.
**구성:**
- §1. Variant promotion gate — 유저별 sample size, lift over base, statistical significance 필요
- §2. Lift measurement — variant vs base의 hit rate 차이 + bootstrap CI
- §3. Anti-loosening detection — threshold 풀기만 하면 reject
- §4. Cooling-off period — 새 variant 채택 후 N trade 동안 freeze
- §5. UI surface — 유저에게 "이 variant 통계적 유의 부족" 메시지

**길이 예상:** 400~600줄.

**우선순위:** 하. 다른 4개 통과 후.

### 4.2 기존 문서 보강

#### 01_PATTERN_OBJECT_MODEL.md 보강
- §2 vocabulary 표에 `feature_binding` + `window` 컬럼 명시 (Part 2 §2.1 매핑 결과 반영)
- §11 Non-Goals에 "5-phase 상한"의 정당화 추가 또는 제약 완화
- §6 PatternRuntimeState에 `regime_label` 필드 추가 (17와 연동)

#### 03_SEARCH_ENGINE.md 보강
- §9 BenchmarkPack에 "Pattern Correctness Pack" 종류 추가 (15 결과 통합)
- Reranker feature `regime_match`의 source = 17의 regime_labels로 명시

### 4.3 문서 의존 그래프

```
                        14 MM Theory Grounding
                                ↑
                     (이론적 근거 제공)
                                |
01 Pattern Object  →  15 Validation Framework  ⭐
                                ↓
                    16 Threshold Calibration
                                ↓
                    17 Regime Taxonomy
                                ↓
                    18 Variant Guardrails
                                ↓
                  03 Search Engine (보강)
                                ↓
                  09 Reranker Spec (보강)
```

15가 모든 것의 시작점. 14는 평행 작성 가능.

---

## Part 5 — Validation Framework Design (15의 본격 시드)

### 5.1 핵심 4 metrics

#### M1. Phase-conditional forward return

각 phase에 대해:
```
H_M1: phase k에서 entry했을 때의 forward return r_k의 분포가
      random entry baseline의 분포와 통계적으로 다르다.
```

**측정:**
```python
def measure_phase_conditional_return(
    pattern_id: str,
    corpus: FeatureWindowsView,
    holdout: TimeRange,
    horizon: timedelta = timedelta(hours=4),
    direction: str = "long",
) -> dict[int, ReturnDistribution]:
    """
    Returns: {phase_index: ReturnDistribution(mean, std, t_stat, p_value, n)}
    """
    pattern = registry.load(pattern_id)
    results = defaultdict(list)

    for ts in holdout.iter_timestamps():
        # Run phase machine up to ts
        state = run_phase_machine(pattern, corpus.up_to(ts))
        if state.current_phase_index == 0:
            continue

        # Forward return
        future_price = corpus.get_price(ts + horizon)
        current_price = corpus.get_price(ts)
        ret = (future_price - current_price) / current_price
        if direction == "short":
            ret = -ret

        results[state.current_phase_index].append(ret)

    # Compare each phase to random baseline
    return {
        phase: compute_distribution_vs_random(returns, random_baseline)
        for phase, returns in results.items()
    }
```

#### M2. Signal contribution (leave-one-out ablation)

```python
def measure_signal_contribution(
    pattern_id: str,
    target_phase: int,
    corpus, holdout, horizon,
) -> dict[str, float]:
    """
    각 signal을 1개씩 빼고 phase-conditional return 재측정.
    Return: {signal_id: drop_in_mean_return}
    """
    base = measure_phase_conditional_return(pattern_id, ...)
    base_mean = base[target_phase].mean

    contributions = {}
    pattern = registry.load(pattern_id)
    phase_def = pattern.phases[target_phase - 1]

    for signal in [c.signal_id for c in phase_def.conditions if c.required]:
        modified_pattern = remove_signal(pattern, target_phase, signal)
        modified_results = measure_phase_conditional_return(modified_pattern, ...)
        contributions[signal] = base_mean - modified_results[target_phase].mean

    return contributions
```

→ "이 signal 빼니 평균 return 0.4% 감소" → critical signal.
→ "이 signal 빼도 0.05% 차이" → noise candidate, vocab trim 후보.

#### M3. Sequence completion rate

```python
def measure_sequence_completion(pattern_id, corpus, holdout) -> dict[tuple[int,int], float]:
    """
    Phase i 진입 → phase i+1 도달 비율.
    Pattern이 진짜 시퀀스인가, 아니면 phase들이 독립 발생하나 검증.
    """
    pattern = registry.load(pattern_id)
    transitions = defaultdict(lambda: {'reached': 0, 'total': 0})

    for ts in holdout.iter_timestamps():
        state_path = run_phase_machine_full(pattern, corpus.up_to(ts))
        # state_path = [(phase_index, entered_at), ...]
        max_reached = max((p for p, _ in state_path), default=0)
        for entered_phase, _ in state_path:
            for next_phase in range(entered_phase + 1, len(pattern.phases) + 1):
                transitions[(entered_phase, next_phase)]['total'] += 1
                if next_phase <= max_reached:
                    transitions[(entered_phase, next_phase)]['reached'] += 1

    return {t: v['reached'] / v['total'] for t, v in transitions.items() if v['total'] > 5}
```

→ `(1, 2): 0.6, (2, 3): 0.4, (3, 4): 0.3, (4, 5): 0.5` 같은 표 나옴.
→ `(1, 2): 0.05` 면 phase 2 거의 안 도달 — 시퀀스 가설 약함.

#### M4. Regime-conditional performance

```python
def measure_regime_conditional(
    pattern_id, corpus, holdout, regime_labels: dict[datetime, str],
) -> dict[str, dict[int, ReturnDistribution]]:
    """
    Regime별로 M1을 분리 측정.
    Return: {regime_name: {phase_index: ReturnDistribution}}
    """
    by_regime = defaultdict(list)
    for ts in holdout.iter_timestamps():
        regime = regime_labels[ts]
        # ... M1 logic split by regime
```

→ "OI Reversal v1: bull regime에서 phase 4 t=4.2, bear regime에서 phase 4 t=0.8" 같은 결과 나오면 → bull-only pattern으로 deprecate or split.

### 5.2 Baselines 4종 (이전 토론 반영)

| 단계 | 베이스라인 | 측정 |
|---|---|---|
| **B0 — Random Time Entry** | 균등 무작위 시점에서 entry | forward return 분포의 자연 baseline |
| **B1 — Buy & Hold** | hold 기간 동안 그냥 보유 | 시장 평균 수익률 |
| **B2 — Phase 0 (idle)** | phase 0 (no pattern matched)에서 entry | "패턴 매칭 안 됨" 베이스라인 |
| **B3 — Phase k–1** | 직전 phase에서 entry | phase 진행이 의미있는지 — phase 4 vs phase 3 차이 |

각 phase의 결과는 **4개 baseline 모두 대비**로 보고. 그래야 어떤 의미에서 좋은지 명확.

### 5.3 Statistical tests

#### Welch's t-test (등분산 가정 안 함)
```python
from scipy import stats
t, p = stats.ttest_ind(phase_returns, baseline_returns, equal_var=False)
```

#### Bootstrap CI (분포 가정 없음)
```python
def bootstrap_ci(returns, n_iter=10000, alpha=0.05):
    means = [np.random.choice(returns, len(returns), replace=True).mean() for _ in range(n_iter)]
    return np.percentile(means, [100*alpha/2, 100*(1-alpha/2)])
```

#### Multiple comparison correction (필수)
N pattern × M phase × K regime = 매우 많은 test → False discovery rate 폭발.
**Benjamini-Hochberg procedure:**
```python
from statsmodels.stats.multitest import multipletests
reject, p_corrected, _, _ = multipletests(p_values, alpha=0.05, method='fdr_bh')
```

→ 이거 안 하면 "20개 pattern 중 1개 p < 0.05 = 우연" 함정에 빠짐.

#### Deflated Sharpe (참고용 — Lopez de Prado 2014)
복수 시도 후 best Sharpe를 발견했을 때 deflate:
```python
def deflated_sharpe(observed_sr, n_trials, T, skew=0, kurt=3):
    expected_max_sr_under_null = ...  # 공식
    return ...
```

논문/블로그 발표 수준 검증에 필요. 내부 첫 검증은 Welch + BH로 충분.

### 5.4 데이터 추출 SQL

```sql
-- Phase entry 시점 + forward return materialized view
create materialized view pattern_entry_outcomes as
with phase_entries as (
    select
        prs.symbol,
        prs.pattern_id,
        prs.pattern_version,
        prs.current_phase_index as phase_index,
        prs.phase_entered_at as entered_at,
        prs.last_feature_snapshot,
        -- get regime at entry time
        rl.regime_label
    from pattern_runtime_state_history prs
    left join regime_labels rl
        on rl.symbol = prs.symbol
        and rl.timestamp = date_trunc('hour', prs.phase_entered_at)
    where prs.current_phase_index > 0
),
forward_prices as (
    select
        pe.*,
        bars_at(pe.entered_at, '4h').close as price_4h,
        bars_at(pe.entered_at, '24h').close as price_24h,
        bars_at(pe.entered_at).close as price_at_entry
    from phase_entries pe
)
select
    *,
    (price_4h - price_at_entry) / price_at_entry as fwd_return_4h,
    (price_24h - price_at_entry) / price_at_entry as fwd_return_24h
from forward_prices;
```

### 5.5 Acceptance gates per pattern

새 pattern이 production 진입하려면:

```
[ ] Phase-conditional return measured on holdout (≥ 90 days)
[ ] At least one phase with directional_belief='entry_zone' has:
    [ ] t-stat ≥ 3.0 vs Random Time Entry (B0)
    [ ] t-stat ≥ 2.0 vs Buy & Hold (B1)
    [ ] mean return > 0.5% per 4h (cost-aware: > 2× round-trip fee)
[ ] Sequence completion (1→last_entry_phase) ≥ 5%
    (이상하면 phase가 시퀀스 아니고 독립)
[ ] Multiple comparison corrected p-value < 0.05 (BH-FDR)
[ ] Regime-conditional analysis: pattern works in ≥ 2 of 3 regimes
    OR explicitly labeled as regime-specific
[ ] Sample size n ≥ 30 entries on holdout for the entry phase
```

8개 통과해야 PatternObject가 `production_eligible=true`.

### 5.6 Build tasks (15 작성과 동시 코드 작업)

```
engine/research/validation/
  __init__.py
  baselines.py          # B0~B3 generators
  metrics.py            # M1~M4 implementations
  statistical_tests.py  # Welch, bootstrap, BH, Deflated SR
  reporters.py          # one-page dashboard
  cli.py                # python -m engine.research.validation evaluate <pattern_id>

scripts/research/
  validate_pattern.py   # CLI entry

sql/migrations/
  030_pattern_entry_outcomes_view.sql
  031_regime_labels_table.sql

tests/research/
  test_baselines.py
  test_metrics.py
  test_statistical_tests.py
```

### 5.7 첫 실행 — 1주 deliverable

**Day 1-2:** baselines.py + metrics.py M1 구현, OI Reversal v1로 첫 실행.
**Day 3:** SQL view + holdout split (90일 lock-in).
**Day 4:** statistical_tests.py + multi comparison correction.
**Day 5:** reporters.py — dashboard 한 장 (Part 6 참조).
**Day 6:** M2 (signal ablation) 추가.
**Day 7:** CLI + 결과 분석 + 문서 (15) draft.

---

## Part 6 — Threshold Provenance Audit (16의 본격 시드)

### 6.1 즉시 실행할 audit 절차

```python
# scripts/research/threshold_audit.py
def audit_threshold(signal_id: str, threshold: float):
    """
    각 signal threshold를 holdout 시간대 대비 frequency로 검증.
    Goal: threshold가 너무 빡빡하면 0건, 너무 느슨하면 100% — 둘 다 의심.
    """
    samples = feature_windows.frequency_above_threshold(signal_id, threshold)
    print(f"{signal_id} ≥ {threshold}: {samples.frequency:.2%}")

    # Check sensitivity
    for delta_pct in [-30, -15, +15, +30]:
        new_threshold = threshold * (1 + delta_pct / 100)
        new_freq = feature_windows.frequency_above_threshold(signal_id, new_threshold)
        print(f"  Δ{delta_pct:+d}%: {new_freq:.2%}")
```

→ 23개 signal × 5 sensitivity = 115 측정. 1시간 안에 끝남.

### 6.2 결과 표 양식

```
Signal             | Threshold | Frequency | Δ-30% | Δ-15% | Δ+15% | Δ+30% | 출처   | 권장
-------------------|-----------|-----------|-------|-------|-------|-------|--------|------
oi_zscore          | 2.0       | 4.2%      | 8.1%  | 5.7%  | 3.1%  | 2.2%  | 감     | 데이터로 calibrate
funding_z          | -2.0      | 1.8%      | 3.5%  | 2.4%  | 1.4%  | 0.9%  | 감     | 8h cycle 윈도우 명시 후 재측정
price_change_1h    | -0.05     | 0.7%      | 1.5%  | 1.0%  | 0.5%  | 0.3%  | 감     | OK (드물게 발생, sensitivity 합리적)
volume_zscore      | 2.0       | 4.5%      | 8.5%  | 6.0%  | 3.5%  | 2.5%  | 감     | OK
```

→ frequency가 5% 근처면 타당, 0.1% 또는 30% 면 재고.

### 6.3 Z-score window 정책 제안

| Signal | Cycle | 권장 window |
|---|---|---|
| `oi_zscore` | continuous | **7d rolling** (24h × 7 = 168 1h bars) |
| `funding_rate_zscore` | 8h discrete | **30d × 90 samples** (8h × 90 = 30d) |
| `volume_zscore` | continuous | **7d rolling** |

이 3개 결정만 박아도 vocabulary 신뢰도 크게 올라감.

---

## Part 7 — Pattern Library Audit (γ)

### 7.1 절차

```bash
# engine/patterns/library.py 까서 정의된 패턴 전부 추출
python -m engine.patterns.audit list-patterns

# 각 pattern의:
# - phase 수
# - 사용된 signal
# - 출처 (author, lineage)
# - 마지막 사용 (production hits)
```

### 7.2 우선순위 기준

```
P0 (즉시 검증): production에서 hit 발생한 pattern
P1 (다음 검증): 정의되었지만 hit 0인 pattern (의심)
P2 (보류): draft 단계 pattern
```

P0 pattern을 15의 framework로 먼저 검증 → "어느 게 진짜 작동하나" 빠른 답.

### 7.3 첫 후보

CURRENT.md 기준 + 메모리 기준:
- `oi_reversal_v1` (Part 1 §1.6에서 분석)
- 그 외 production registry에 있는 모든 pattern

→ γ 작업: 1일.

---

## Part 8 — α/β/γ 통합 실행 순서

### Week 1 — α 1차 실행 + γ audit

```
Day 1 (월): γ audit — engine/patterns 까서 P0 pattern 목록
Day 2 (화): 15의 baselines.py + metrics.py M1 (OI Reversal v1)
Day 3 (수): SQL view + holdout split + 첫 결과
Day 4 (목): Statistical tests + 결과 검토
Day 5 (금): Dashboard 한 장 + 1주 리뷰
```

**End of Week 1 deliverable:**
- 15 framework v0 코드
- OI Reversal v1의 phase-conditional return 표 + 통계
- "p < 0.05 통과 phase 수" 결론

### Week 2 — α 확장 + β audit

```
Day 1: M2 (signal ablation) — 어느 signal이 진짜 일하나
Day 2: M3 (sequence completion) + M4 (regime-conditional, regime은 임시 단순 라벨)
Day 3: 16 threshold audit — 23 signal × 5 sensitivity 측정
Day 4: Z-score window 정책 결정 + vocabulary 보강 제안
Day 5: 14 MM theory grounding 초안
```

### Week 3+ — sub-doc 작성

```
- 15 final spec
- 16 threshold calibration spec
- 17 regime taxonomy v1
- 14 theory grounding final
- 18 variant guardrails (낮은 우선순위)
```

---

## Part 9 — Open Questions (보류)

| 질문 | 결정 시점 |
|---|---|
| Forward return horizon: 1h, 4h, 24h 중 어느 게 default? | Week 1 결과 보고 |
| Cost model 포함 여부 (binance fee 0.04% × 2 = 8bps 차감)? | Week 1 결과 보고. 권장: 포함 |
| Pattern의 directional_belief가 통계적으로 유의 안 나오면 deprecate인가, refine인가? | 첫 falsify 발생 시 |
| Signal weight (PatternObject phase condition.weight)는 phase-conditional return contribution으로 자동 학습? | 15 v1 후 |
| Per-symbol vs cross-symbol 평가 — BTC만 좋고 SOL에서 안 됨이면? | M4 결과 후 |
| Outcome y로 quantile vs continuous return 둘 다? 또는 triple barrier? | 5.7 첫 실행 결과 후 |
| Reranker (09) 와 Pattern validation (15)의 metric 통합? | 둘 다 v1 후 |

---

## Part 10 — 결정해야 할 것 (사용자 입력 필요)

이 설계 문서가 통과되면 다음을 결정해야 한다.

### D1. 우선순위 확정
다음 중 어느 순서로 갈까?
- **(추천)** Week 1 = α (15 framework v0) + γ (pattern audit) 병렬
- 대안 1 = β (16 threshold audit) 먼저, α 다음
- 대안 2 = 14 (theory grounding) 먼저, 모두 나중

### D2. Forward return horizon
- 1h / 4h / 24h 중 default?
- 권장: **4h** — 너 phase machine timeframe (1h)의 4배. 너무 짧지도 길지도 않음.

### D3. Cost model 포함 여부
- 비용 모델 (binance round-trip 8bps + slippage 5bps = 13bps) 포함?
- 권장: **포함** — gross edge 무의미. net edge로 봐야 함.

### D4. 첫 검증 대상 pattern
- OI Reversal v1만? Production hit 있는 모든 pattern?
- 권장: **OI Reversal v1로 framework 검증 → 통과 시 전체 pattern audit**.

### D5. 새 work item 분리
이 W-0213을 5개 sub-doc work item으로 분기할 시점:
- 권장: **Week 1 끝**. 첫 결과 보고 framework 안정성 확인 후.

---

## Part 11 — Acceptance — 이 W-0213 통과 조건

```
[ ] Part 1~3 사용자 검토 — 이론/매핑/갭 진단 동의
[ ] Part 4 문서 아키텍처 동의 — 5개 신규 + 2개 보강
[ ] Part 5 validation framework spec 동의 — 4 metrics + 4 baselines + acceptance gate
[ ] D1~D5 결정 완료
[ ] Week 1 시작 가능
```

---

## Appendix A — 외부 자료 reading list (1주 안에 다 봐야 할 것)

### 핵심 (무조건)
0. **Black, Scholes (1973) + Merton (1973)** — "The Pricing of Options...". 공통 수학 뿌리. 22 pages. 1일.  *(z-score 신호의 통계 근거 이해)*
1. **Avellaneda & Stoikov (2008)** — "High-frequency trading in a limit order book". 16 pages. 2일.
2. **Kyle (1985)** — "Continuous Auctions and Insider Trading". Econometrica. 25 pages. 1일.
3. **Easley, Kiefer, O'Hara (2002)** — "VPIN" / "Information and the cost of capital". 30 pages. 1일.

### 권장 (이번 분기 안)
4. **Glosten & Milgrom (1985)** — "Bid, Ask and Transaction Prices...". 30 pages. 1일.
5. **Cartea, Jaimungal, Penalva (2015)** — *Algorithmic and HFT* book Chapter 1, 5, 10. 1주.
6. **Lopez de Prado (2018)** — *Advances in Financial ML* Chapter 7 (Cross-validation), Chapter 14 (Backtest stats). 3일.

### 참고 (도전)
7. **Milionis, Moallemi, Roughgarden (2022)** — LVR. arXiv:2208.06046. 1일.
8. **Bailey & Lopez de Prado (2014)** — Deflated Sharpe Ratio.

### 비-논문 (실용)
9. **prop-amm-challenge** README + crates/ 코드 (Rust) — Avellaneda-Stoikov 구현 사례
10. **prediction-market-challenge** orderbook_pm_challenge/process.py — Kyle 1985 구현 사례

---

## Appendix B — 약어

- **MM**: Market Maker
- **HFT**: High-Frequency Trading
- **VPIN**: Volume-synchronized PIN (Probability of Informed trading)
- **A-S**: Avellaneda-Stoikov
- **LVR**: Loss-Versus-Rebalancing (Milionis et al.)
- **GM**: Glosten-Milgrom
- **EKO**: Easley-Kiefer-O'Hara
- **MMR**: Milionis-Moallemi-Roughgarden
- **NDCG**: Normalized Discounted Cumulative Gain (retrieval metric)
- **BH-FDR**: Benjamini-Hochberg False Discovery Rate
- **ECE**: Expected Calibration Error
- **OFI**: Order Flow Imbalance

---

## Changelog

- 2026-04-27: Initial draft. Captures session conversation 2026-04-27 between user and agent regarding MM theory grounding + validation framework gap.
- 2026-04-27 (rev 2): Added §1.2.5 "Black-Scholes-Merton 1973 — 공통 수학 뿌리" — A-S 2008과 MMR 2022의 공통 GBM/σ² DNA 명시. Bachelier 1900 역사 footnote. 너 vocabulary z-score들의 BSM 가정 + arithmetic vs geometric 주의사항. Reading list에 BSM 추가.
