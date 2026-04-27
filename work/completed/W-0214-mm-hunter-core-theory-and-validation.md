# W-0214 — MM Hunter Core Theory & Validation Design

**Version:** v1.3 (D1~D8 lock-in 반영, 2026-04-27)
**Status:** **LOCKED-IN.** D1~D8 confirmed. Week 1 V-00 작업 가능.
**Supersedes (partially):** W-0213 (validation-only design); W-0214 v1.0 / v1.1; merges with prd-master.md v2.2.
**Charter delta:** PRD vision "Pattern Research OS" → "MM Pattern Hunting OS for retail crypto perp traders".

**v1.3 Changelog (vs v1.2, 2026-04-27 lock-in 반영)**:
- **§3.6 G8 보강**: D4 결정 — "5개 측정 + 나머지 48 보존" 정책 명시. production_gates_passed=NULL 상태로 보존, 삭제 X
- **§5.5 Hunter UI 전면 개편**: D7 결정 — "전체 공개" 채택. raw 수치 (DSR, BH-corrected p, drop_pct, sequence rate, regime label) 모두 노출. Glossary toggle 추가 (P1)
- **§10 D1~D8 lock-in 결과 표 추가**: 모든 결정 confirmed
- **§14 Appendix C 신규**: D7 Hunter UI Glossary spec — 한국어 power user용 용어 사전

**v1.2 Changelog (vs v1.1)**:
- **§1.5 신규**: WVPL Mechanism — phase-conditional return → search corpus → verdict rate → WVPL chain 명시 (C3 fix)
- **§2.1 Lineage 보강**: Tishby 1995 Information Bottleneck를 Methodology 계보에 추가 (I1 fix, M2 ablation 이론 정당화)
- **§2.4 Wyckoff Mapping 추가**: OI Reversal 5-phase에 더해 **Wyckoff 4-phase canonical** A-S 매핑 추가 (C2 fix, telegram-refs §2.2 한국 시장 표준)
- **§2.6 Reading List 라벨 정정**: arxiv 2512.12924 / 2602.00776 [factual] → [unknown: 미직접확인] (C4 fix)
- **§3.4 Embargo 명시화**: `embargo_bars = max(label_horizon_bars, n × 0.005)` 정당화 (I3 fix, Lopez de Prado 2018 ch7 권장)
- **§3.8 신규**: Pattern Decay Monitoring — rolling 30d t-stat watching + auto-deprecate trigger (I2 fix)
- **§5.0 신규**: `engine/research/pattern_search.py` (3283줄) 통합 정책 — augment, no rebuild (C1 fix, W-0220 PRD §4 L5 [factual])
- **§13.2 References 라벨 정정**: arxiv 2개 [factual] → [unknown] (C4 fix)

**v1.1 Changelog (vs v1.0)**:
- §2.0 신규: BSM 1973 공통 수학 뿌리
- §2.5 신규: 23 signal × theory full mapping
- §2.6 Reading List 확장
- §3.7 신규: Cost Model 15 bps round-trip
- §5.2 보강: SQL materialized view
- §5.3 신규: M1~M4 Python 시그니처
- §6 신규: Threshold Audit Procedure (V-12 spec)

---

## 0. 읽는 법 / Non-Goals

### 0.1 이 문서가 답하는 질문 (5개, v1.2)
1. 우리 제품의 코어 이론은 무엇인가? (§1)
2. 그 이론이 NSM(WVPL)에 어떻게 기여하는가? (§1.5 v1.2 신규)
3. 그 이론은 어떤 학술 계보 위에 서 있는가? (§2)
4. 그 이론을 어떻게 falsifiable하게 검증하는가? (§3~§5)
5. 기존 코드 자산(163 built, `engine/research/pattern_search.py` 3283줄 포함)과 어떻게 합치되는가? (§5.0, §7)

### 0.2 Non-Goals (의도적으로 안 다룸)
- AMM LP / DEX 도메인 (MMR LVR 2022) — corpus가 CEX perp이므로 [out-of-scope]
- 실시간 quote 엔진 구현 (A-S formula로 quote하는 MM이 우리가 아님)
- Sub-microsecond HFT infra (P95 500ms 목표면 충분)
- 53 PatternObject 전부 즉시 검증 (P0는 5개)
- Marketplace UX 디테일 (별도 spec 필요, 본 문서는 gate 정의만)
- `engine/research/pattern_search.py` 재구현 (§5.0 augment-only 정책)

### 0.3 라벨 규칙 (User Preferences 준수)
- `[factual]` — 코드/문서/논문에서 직접 확인됨
- `[assumption]` — 합리적 추정, 검증 가능
- `[speculation]` — 검증 안 됨, 가정에 의존
- `[unknown]` — 측정/조사 안 됨
- `[estimate]` — 계산 근거와 함께 제시한 추정치

---

## 1. Core Theory — User as MM Hunter

### 1.1 한 줄 명제

> **Cogochi는 retail crypto perp 트레이더가 자신의 MM(market maker) 행동 가설을 PatternObject로 외화하고, microstructure 데이터로 falsifiable하게 검증·정련하는 인프라다.**

### 1.2 명제 분해

| 구성요소 | 의미 | 우리가 제공 |
|---|---|---|
| Hunter (유저) | MM 행동 가설을 세울 수 있는 retail trader | A-03/A-04 입력 도구 |
| MM (사냥감) | CEX perp orderbook의 liquidity provider 행동 | 23 signal vocabulary |
| 가설 (PatternDraft) | "MM이 X 상황에서 Y 행동을 한다"의 구조적 표현 | 92 Building Blocks |
| 외화 (PatternObject) | 가설을 코드/DB로 immutable하게 박는 행위 | versioned PatternObject |
| 검증 (Verdict + Statistical) | 두 종류의 evidence 동시 수집 | 5-cat verdict + phase-conditional return |
| 정련 (Refinement) | 데이터 기반으로 가설 보정 | Hill Climbing + LightGBM + Personal Variant |

### 1.3 왜 이 명제인가 (Evidence)

**갈래 A (Pattern Research OS)와 갈래 B (MM Microstructure Validation)는 옵션 4(User-as-Hunter)의 timing 변형이다 — 본질은 같다.**

| 기존 자산 | Hunter framing 하의 의미 |
|---|---|
| PatternDraft (A-03 AI Parser, A-04 Chart Drag) | 유저의 MM 행동 추측을 PatternObject로 외화하는 입력 도구 |
| 92 Building Blocks + 23 signal vocabulary | MM-relevant microstructure quantity (학술 매핑은 §2) |
| Phase machine (5-phase) | MM 행동의 시간 시퀀스 가설 |
| Verdict 5-cat | 유저의 가설 검증 결과 라벨 (subjective evidence) |
| Phase-conditional return (W-0213) | 시스템의 통계 검증 (objective evidence) |
| Personal Variant | 유저별 가설 정련 |
| Refinement (Hill Climbing + LightGBM) | 데이터로 유저 가설 보정 |

→ 9개 자산이 모두 한 명제 하에 일관됨. 다른 framing(broadcasting/journal/auto-trading)에서는 자산 정합성이 이만큼 안 나옴 [factual].

### 1.4 명제의 Falsifiable 조건 (Kill Criteria)

**이 명제는 다음 중 하나라도 참이면 falsified:**

- **F1**: 53 PatternObject 중 phase-conditional return t-stat ≥ 2.0 (multiple testing 보정 후) 통과 비율 = 0% — 유저 가설이 통계적으로 의미 없음 [unknown]
- **F2**: Verdict accuracy와 forward return t-stat 사이 correlation < 0.2 (Spearman) — subjective evidence와 objective evidence가 무관 [unknown]
- **F3**: 유저당 평균 PatternObject 생성 < 1개 / 30일 — 유저가 hunter 정체성 안 가짐 [unknown]
- **F4**: Personal Variant 적용 후 forward return이 base보다 통계적으로 우월하지 않음 (Welch p > 0.1) — 정련이 작동 안 함 [unknown]

**F1~F4 모두 [unknown]임을 인정**. Week 1~4에서 측정해야 함. 측정 전 명제 lock-in은 [speculation] 위에 서 있는 것.

### 1.5 ⭐ NSM Mechanism — Phase-conditional Return → WVPL [v1.2 신규, C3 fix]

**왜 이 섹션이 필요한가**: W-0220 PRD NSM = WVPL (Weekly Verified Pattern Loops per user, M3 ≥ 3) [factual]. Hunter framing의 통계 검증이 NSM에 어떻게 기여하는지 명시 안 하면 product 입장에서 "t-stat 4.0 = 좋음"이 의미 없음. 메커니즘 chain이 있어야 함.

#### Chain (5 link)

```
Link 1: Pattern statistical validation (G1~G7 통과)
   ↓ "이 패턴은 통계적으로 유의"
Link 2: Search corpus inclusion filter
   ↓ G1~G7 통과 패턴만 search corpus에 포함
Link 3: Search hit precision ↑
   ↓ 검증된 패턴만 매칭 → false positive ↓
Link 4: User capture rate ↑
   ↓ 더 신뢰할 수 있는 매칭 결과 → 유저가 watch/trade 결정
Link 5: Verdict rate ↑ → WVPL ↑
   ↓ trade 후 verdict 제출 → loop 완성 → WVPL 카운트
```

#### 각 Link 측정 가능성 [factual: 모두 측정 가능]

| Link | Metric | Source | Weekly tracking? |
|---|---|---|---|
| L1 | G1~G7 통과 패턴 수 | validation pipeline (V-08) | YES |
| L2 | Search corpus 크기 (검증 vs 미검증) | engine/search/similar.py log | YES |
| L3 | Search hit precision @ K (engineer side) | reranker_eval_log | YES |
| L4 | Capture rate per user per week | ledger_captures | YES (Dashboard 6-gate) |
| L5 | WVPL = verdict 완료 loop 수 | ledger_verdicts | YES (Dashboard 6-gate) |

#### Diagnostic — 어느 Link가 약한가

Weekly review 시 chain 어디가 끊겼는지 즉시 진단 가능:
- L1 = 0 → 가설 자체 falsified (F1) → 시스템 재설계
- L2 = small → 검증된 패턴 부족 → V-12 (threshold) 또는 V-02 측정 확대
- L3 OK / L4 low → 유저가 매칭 결과 안 신뢰 → UI 노출 방식 문제 (§5.5 Hunter UI 재설계)
- L4 OK / L5 low → 유저가 verdict 제출 안 함 → F-3 (Telegram → Verdict deep link) 효과 측정

#### 핵심 가설 [speculation, Week 1 측정 시작]

> "L1 통과 패턴 비율이 5% → WVPL은 random 대비 +0.5/week. 비율이 20% → WVPL은 +2.0/week."

데이터 fit이 아니라 hypothesis. Week 4까지 chain 측정하면 fit 가능.

→ 즉 **§3.6의 G1~G7 통과 = WVPL 가속의 시작점**. validation framework는 NSM에 직접 기여.

---

## 2. Theoretical Lineage — 학술 grounding

### 2.0 Black-Scholes-Merton 1973 — 공통 수학 뿌리 ★

**왜 별도 섹션인가** [factual]: Kyle 1985 / A-S 2008 / MMR 2022가 "다른 이론"처럼 보이지만 **같은 GBM/σ² 수학 DNA**를 공유한다. BSM 1973이 그 뿌리. 우리 시스템의 모든 z-score 신호도 이 가정 위에 서 있다.

#### BSM 핵심 가정 3개

```
가격 process:    dS = μ S dt + σ S dW    (Geometric Brownian Motion)
변동성 σ:        constant or local function
시장:           continuous trading + no arbitrage
```

자동 도출:
- **log-return의 정규분포성** → z-score 통계적 의미 있음
- **σ²가 risk의 자연 단위** → 모든 후속 이론에 그대로 흘러감
- **Itô lemma**로 path-dependent 함수 미분 가능 → optimal control 풀 수 있음

#### σ²의 후손 — 세 이론에 동일 위치 등장

```
1973 BSM
  ├─ option price ∝ σ²
  │
  ├──→ 1985 Kyle:           λ ∝ σ_v / σ_u
  │                          (σ가 informed/noise 분리 척도)
  │
  ├──→ 2008 Avellaneda-Stoikov:
  │     optimal spread:    δ ∝ γ · σ² · (T−t)
  │     reservation price: r = s − q · γ · σ² · (T−t)
  │     (σ²가 spread 크기 + inventory penalty 핵심)
  │
  └──→ 2022 MMR (LVR):      LVR = ∫ (σ²/2) · L dt
                              (σ²가 LP 손실의 dominant term)
```

→ 세 이론 핵심 공식 σ² 위치가 동일. 우연 아니라 GBM + Itô calculus 위 가지.

#### 우리 z-score 신호의 통계 근거 [factual]

```
oi_zscore ≥ 2.0
funding_rate_zscore ≤ -2.0
volume_zscore ≥ 2.0
```

→ z-score가 합리적인 이유 = **데이터 변화량이 BSM-style 정규분포를 근사**한다는 가정.

#### BSM 가정 위반 4가지 → 우리 신호 영향 [factual: crypto perp empirical]

| BSM 가정 위반 | 우리 신호 영향 | 대응 |
|---|---|---|
| **Fat tail** (실제 log-return 꼬리 두꺼움) | z-score 2.0이 정규분포 가정 시 2.5% 빈도, 실제 5~8% | empirical quantile (95th/98th percentile) 사용 검토 |
| **Jump** (이벤트 가격 점프) | z-score 무의미 | event window 별도 필터링 |
| **Variance clustering** (GARCH 효과) | rolling σ가 window에 종속 | window 정책 명시 (§6.3) |
| **Non-stationarity** (regime shift) | bull regime σ가 bear regime에 무의미 | regime taxonomy (M4 §3.2) — 직접 동기 |

#### Arithmetic vs Geometric — 검증 필요 항목 [unknown]

V-12 audit 시 23 signal 전부 확인:
- `oi_change_pct` — arithmetic? geometric (`log(OI_t / OI_{t-1})`)? **차이 큼**
- `volume_zscore` — raw volume z-score? log-volume z-score?
- `price_change_1h` — arithmetic return? log return?

**권장 [speculation]**: 모든 z-score를 log-차이 기반으로 통일. 안 그러면 BSM 정합성 깨짐.

#### Bachelier 1900 한 줄 역사

Bachelier 1900 박사 논문: 가격을 BM으로 모델링 (Einstein 1905 BM 정의보다 먼저). 그러나 *산술 BM* (가격 음수 가능). BSM 1973이 *기하 BM*으로 고침. 우리 시스템도 raw price 차이가 아닌 log-return 쓰는 한 BSM 정합.

#### 실용 결론 → V-12 audit 작업 (§6) 시드

1. 23 signal 전부 underlying이 log-차이인지 raw 차이인지 명시
2. Z-score window 결정 시 GARCH-style clustering 고려
3. Fat tail 보정: empirical quantile vs parametric 2σ 비교 (선택)
4. Jump event 별도 필터 (event_window 라벨)

→ 이 4개가 §6 threshold audit에서 다룰 항목.

---

### 2.1 계보도 [v1.2: Tishby 1995 추가, I1 fix]

```
Black-Scholes-Merton 1973 (가격 GBM 가정) ★
   │
   ├─ Kyle 1985 (informed flow → price impact)
   │     └─ Glosten-Milgrom 1985 (adverse selection → spread)
   │           └─ Easley et al. PIN 1996 → VPIN 2012 (flow toxicity 측정)
   │                 └─ Easley-Lopez de Prado-O'Hara (Flash Crash 2011)
   ├─ Ho-Stoll 1981 (dealer pricing under inventory risk)
   │     └─ Avellaneda-Stoikov 2008 ⭐ (HJB optimal MM)
   │           └─ Gueant-Lehalle-Fernandez-Tapia 2013 (closed-form, inventory bound)
   │                 └─ Cartea-Jaimungal-Penalva 2015 (book, ch10 generalization)
   └─ Milionis-Moallemi-Roughgarden 2022 (LVR — AMM 도메인, 본 시스템 OUT-OF-SCOPE)

Methodology 계보 (검증 framework):
   Tishby-Pereira-Bialek 1995 (Information Bottleneck) ⭐ [v1.2 신규]
      └─ M2 Signal Ablation의 이론적 정당화
         "예측 정보 보존하면서 feature 압축의 minimal sufficient subset 식별"
   Harvey-Liu 2015 (multiple testing haircut)
   Bailey-Lopez de Prado 2014 (Deflated Sharpe Ratio)
   Lopez de Prado 2018 (Purged K-Fold CV + Embargo) ⭐
   Harvey-Liu-Zhu 2016 (Cross-Section, FDR control)
```

**Tishby 1995 IB의 우리 시스템 매핑** [factual]:
- IB objective: `min I(X; T) - β · I(T; Y)`
  - X = 전체 feature space (92 Building Blocks)
  - T = phase-defining signal subset (각 phase의 required signals)
  - Y = forward return outcome
- M2 Leave-one-out ablation = T에서 signal 제거 시 I(T; Y) 감소량 측정
- "drop ≥ 0.3%" criterion = signal이 Y에 대한 mutual info 기여가 충분
- → Tishby IB가 M2의 normative 기준을 제공

### 2.2 각 이론의 우리 시스템 내 역할

| 논문 | 우리에게 주는 것 | 검증 방식 |
|---|---|---|
| Black-Scholes 1973 | 가격 GBM 가정 — forward return distribution baseline | normality test로 GBM 가정 확인 |
| Kyle 1985 | informed flow 수학 — `oi_spike`, `volume_spike` 의미 | OI Δ + price Δ 동시성 측정 [factual] |
| Glosten-Milgrom 1985 | adverse selection — `phase 1 fake_dump`의 근거 | spread widening 동반 측정 [unknown: 우리 vocab에 spread 없음] |
| Easley et al. VPIN 2012 | flow toxicity — `volume_spike`, `taker_ratio_extreme` | bulk volume classification으로 측정 가능 [factual: API 데이터 있음] |
| **Avellaneda-Stoikov 2008** ⭐ | optimal MM behavior — hunter의 사냥감 모델 | 본 시스템의 reverse engineering 대상 |
| **Tishby 1995 IB** ⭐ [v1.2] | M2 ablation 정당화 — "minimal sufficient signal subset" | M2 leave-one-out drop 측정 |
| Cartea-Jaimungal 2015 | A-S 일반화 — phase 4 accumulation의 inventory mechanic | 추후 §5 detail |
| Lopez de Prado 2018 | Purged K-Fold CV + Embargo — 우리 backtest의 표준 | engine/research/validation/cv.py로 구현 (§5.4) |
| Harvey-Liu 2015 | Multiple testing haircut — 53 패턴 동시 검정 보정 | BHY method (§5.5) |
| Bailey-Lopez de Prado 2014 | Deflated Sharpe — selection bias 보정 | §5.5 |

### 2.3 VPIN 논쟁 (Caveat) [factual]

> Andersen-Bondarenko가 VPIN을 비판: "VPIN의 예측력은 underlying trading intensity와의 mechanical relation에서 옴" (sciencedirect S1386418113000189).

**우리 시스템 영향**: `volume_spike`, `taker_ratio_extreme` 등 VPIN-style signal을 쓸 때 **순수 trading intensity와 informed flow signal을 분리해야 함**. Week 1 작업에서 baseline B0 (random time)이 trading intensity 차이만으로 movement 발생하는 것을 잡아냄 → 자연스럽게 분리됨.

**대응**: §5.3 baseline 4종 중 B0이 이 critique 대응. 추가 corner case 측정 [unknown].

### 2.4 A-S 2008 → Phase Machine 매핑 (구체적, 두 taxonomy 동시) [v1.2: Wyckoff 추가, C2 fix]

A-S 2008의 핵심 결과 [factual]:
- Reservation price r(s, q, t) = s − qγσ²(T−t) — inventory q일 때 MM의 indifference price
- Optimal half-spread δ* = γσ²(T−t) + (1/γ)log(1 + γ/k) — volatility, risk aversion, market depth로 결정

#### A. OI Reversal v1 5-phase 매핑 (53 PatternObject 중 1개) [speculation, Week 1 검증 대상]

| Phase | A-S regime | hunter 가설 | 측정 가능한 signal |
|---|---|---|---|
| 1 fake_dump | High σ, MM이 quote 좁힐 수 없음 | "informed sell flow 진입, MM은 spread 넓혀 후퇴" | funding_extreme_short + low_volume + price_dump |
| 2 arch_zone | σ 감소, MM이 quote 다시 켬 | "uncertain regime, MM 관망" | compression + sideways |
| 3 real_dump | High σ 재발, q < 0 (MM short stuck) | "MM이 inventory 떠는 dump" | price_dump + oi_spike + volume_spike |
| 4 accumulation ⭐ | σ 감소 + q < 0 → r > s (MM이 long bias) | "MM이 ask-side 채우는 phase, hunter의 entry zone" | higher_lows + oi_hold + funding_flip |
| 5 breakout | q ≈ 0 회복, MM neutral | "MM 균형 회복, 새 informed flow가 가격 돌파" | range_high_break + oi_reexpansion |

#### B. Wyckoff 4-phase canonical 매핑 ⭐ [v1.2 신규, telegram-refs §2.2 한국 시장 표준]

**왜 Wyckoff가 canonical**: 4채널(Alpha Hunter / Alpha Terminal / 시그널레이더 / Alpha Flow) 모두 동일 phase 어휘 사용 [factual: telegram-refs.md §2.2]. 53 PatternObject 중 wyckoff-spring/accumulation/absorption 이미 존재.

```
ACCUMULATION → DISTRIBUTION → BREAKOUT → RETEST → [SQUEEZE 전조]
```

| Wyckoff Phase | A-S regime | hunter 가설 | 측정 가능한 signal |
|---|---|---|---|
| **ACCUMULATION** ⭐ | σ ↓ + q < 0 (MM이 short stuck) → reservation price > mid | "MM이 ask-side 적극 채우는 absorption 단계, hunter의 entry zone" | higher_lows + oi_hold + funding_flip + volume_dryup |
| **DISTRIBUTION** | σ ↓ + q > 0 (MM이 long stuck) → reservation price < mid | "MM이 bid-side 천천히 떠는 distribution 단계, hunter의 short entry zone" | higher_highs + oi_hold + funding_extreme_long + volume_dryup |
| **BREAKOUT** | σ ↑ + q 균형 → MM neutral, new flow가 가격 ratchet | "informed flow가 trigger, MM은 spread 넓혀 추적" | range_high_break (or range_low_break) + oi_reexpansion + volume_spike |
| **RETEST** | σ moderate + q 약간 비대칭 (참여자 포지션 정리 중) | "BREAKOUT 후 retest, 진짜인지 fake인지 결정 단계" | breakout 후 fresh_low_break? 또는 higher_lows? |
| **[SQUEEZE 전조]** (option) | σ ↓ extreme + bb_width minimum | "다음 폭발 직전, MM이 모든 quote 좁혀놓은 상태" | bb_squeeze + micro_volatility_low + arch_zone |

**핵심 차이 (5-phase OI Reversal vs 4-phase Wyckoff)**:
- 5-phase는 long-only directional sequence (fake_dump → real_dump → accumulation → breakout)
- 4-phase Wyckoff는 long/short 양방향 + 더 일반적 (accumulation/distribution dual)
- → **Wyckoff가 canonical, OI Reversal은 Wyckoff의 specific instance** (long entry path)

**A-S regime에서 둘이 어떻게 만나나**:
- OI Reversal "phase 4 accumulation" = Wyckoff "ACCUMULATION"의 specific timing
- OI Reversal의 fake_dump + real_dump = Wyckoff ACCUMULATION 직전의 selling climax (SC) + automatic rally (AR)
- → 53 PatternObject 중 wyckoff-accumulation pattern이 더 일반화된 형태, oi-reversal-v1은 specialized

#### V-02 측정 시 적용

Week 1 phase-conditional return 측정 시:
- 각 PatternObject의 phase를 두 taxonomy(5-phase OI Reversal vs 4-phase Wyckoff)로 라벨링
- 같은 시점이 두 라벨 받음 (예: oi_reversal_v1.phase_4 + wyckoff_accumulation)
- M1 결과 dashboard에 두 taxonomy 동시 표시
- → "어느 taxonomy가 phase-conditional return을 더 잘 분리하나" 자체가 데이터 답

### 2.5 Vocabulary × Theory Full Mapping (23 signal) ⭐

이 표가 V-12 threshold audit (§6)의 시드. "출처 검증 필요" 컬럼에 [unknown] 명시된 것이 audit 대상 [factual: engine/patterns vocabulary 기준].

| Signal | MM Theory quantity | 출처 논문 | binding 식 | 출처 검증 필요 |
|---|---|---|---|---|
| `price_dump` | realized return | BSM (log-return) | `price_change_1h ≤ -0.05` | **임계 -5% 출처 [unknown]** |
| `price_spike` | realized return | BSM | `price_change_1h ≥ +0.05` | **임계 +5% 출처 [unknown]** |
| `fresh_low_break` | structural breakout | technical analysis | `dist_from_20d_low ≤ 0` | window 20d 출처 [unknown] |
| `higher_lows_sequence` | accumulation pattern | Wyckoff (technical) | `higher_low_count ≥ 2` | n=2 출처 [unknown] |
| `higher_highs_sequence` | trend continuation | Dow Theory | `higher_high_count ≥ 1` | n=1 출처 [unknown] |
| `sideways` | low-volatility regime | A-S σ↓ | `range_width_pct ≤ 0.08` | 8% 출처 [unknown] |
| `upward_sideways` | accumulation phase | Wyckoff phase B/C | sideways + higher_low ≥ 2 | — |
| `arch_zone` | volatility compression | A-S optimal MM env | `compression_ratio ≥ 0.5 AND volume_dryup` | 0.5 출처 [unknown] |
| `range_high_break` | breakout | technical | `breakout_strength ≥ 0.01` | 1% 출처 [unknown] |
| `oi_spike` | informed flow proxy | Kyle / VPIN | `oi_zscore ≥ 2.0` OR `oi_spike_flag` | **z-score window [unknown]** |
| `oi_small_uptick` | slow informed build | Kyle slow-trading | `0 ≤ oi_change_pct ≤ 0.03` | 3% 출처 [unknown], arithmetic? |
| `oi_hold_after_spike` | conviction persistence | — | `oi_hold_flag` | flag 정의 [unknown] |
| `oi_reexpansion` | new informed entry | Kyle | `oi_reexpansion_flag` | flag 정의 [unknown] |
| `oi_unwind` | informed exit | — | `oi_change_pct ≤ -0.05` | -5% 출처 [unknown] |
| `funding_extreme_short` | positioning asymmetry | Kyle informed | `funding_rate_zscore ≤ -2.0` | **8h cycle, window [unknown]** |
| `funding_positive` | positioning bias | — | `funding_rate > 0` | — |
| `funding_flip_negative_to_positive` | regime transition | — | `funding_flip_flag` | flag 정의 [unknown] |
| `low_volume` | low VPIN regime | EKO 2012 | `volume_zscore ≤ 1.0` | **window [unknown]** |
| `volume_spike` | high VPIN | EKO 2012 | `volume_zscore ≥ 2.0` | **window [unknown]** |
| `volume_dryup` | very low VPIN | EKO + A-S | `volume_dryup_flag` | flag 정의 [unknown] |
| `short_build_up` | positioning trend | Kyle slow-trade | LSR↓ + funding negative | 정량화 [unknown] |
| `short_to_long_switch` | positioning reversal | — | funding_flip + oi_reexpansion | — |
| `kimchi_premium_extreme` | regional informed asymmetry | — (telegram-refs §2) | `|premium| ≥ 2σ` | window [unknown], P0 Korea |

#### 발견된 갭 3가지 [factual]

1. **z-score window 명시 부재 (전부)**: `oi_zscore`, `funding_rate_zscore`, `volume_zscore` 모두 어떤 lookback인지 [unknown]. 동일 z=2가 7d rolling vs 30d vs all-time이 의미 다름.
2. **임계값 출처 부재 (전부)**: -5%, +5%, 8%, 0.5, 2.0 모두 [unknown]. 데이터 calibration인지 감인지 모름.
3. **`*_flag` 정의 부재 (5개)**: `oi_spike_flag`, `oi_hold_flag`, `oi_reexpansion_flag`, `volume_dryup_flag`, `funding_flip_flag` — feature_window 계산식 docs에 없음. 코드 봐야 확인 가능.

→ V-12 (β audit) 작업의 정확한 입력. §6 참조.

### 2.6 Reading List (지금 우선순위) [v1.2: arxiv 라벨 정정, C4 fix]

**필독 (Week 1 시작 전)**:
1. **Black-Scholes 1973 + Merton 1973** — z-score 신호의 통계 근거. 22p. 1일 [factual: 공통 GBM 뿌리, §2.0 참조]
2. Avellaneda-Stoikov 2008 — §3 reservation price + §4 optimal spread (16p) [factual: arxiv 0807.2243]
3. Lopez de Prado 2018, ch7 — Purged K-Fold CV [factual: book ch7]
4. Kyle 1985 — Continuous Auctions and Insider Trading. Econometrica. 25p. 1일

**1주차 중**:
5. Harvey-Liu 2015 "Backtesting" — multiple testing haircut [factual: cmegroup.com PDF]
6. Cartea-Jaimungal-Penalva 2015, ch10 — A-S 일반화 + inventory bound
7. Easley-Kiefer-O'Hara 2002 — VPIN. 30p. 1일
8. **Tishby-Pereira-Bialek 1995** — Information Bottleneck. arxiv physics/0004057. 16p. 1일 [factual: M2 ablation 정당화] [v1.2 추가]

**참고 (분기내)**:
9. Glosten-Milgrom 1985 — adverse selection
10. Andersen-Bondarenko 2014 — VPIN 비판 (counter-evidence)
11. Harvey-Liu-Zhu 2016 "...and the Cross-Section" — 316 factor 사례
12. Bailey-Lopez de Prado 2014 — Deflated Sharpe Ratio

**최근 (선례 검토)** [unknown: 미직접확인, agent context에서 인용된 자료] [v1.2 정정]:
13. arxiv 2512.12924 (Dec 2025?) — "Interpretable Hypothesis-Driven Trading Walk-Forward" [unknown: 문헌 검색으로 직접 확인 필요. 작성 시점 이전 논문이지만 우리가 직접 read 못함]
14. arxiv 2602.00776 (Jan 2026?) — "Explainable Patterns in Cryptocurrency Microstructure" [unknown: 동일]

→ Week 1 시작 전 위 2개 arxiv ID로 실제 검색 필요. 결과에 따라 [factual] 또는 폐기.

**비-논문 영감 (Hunter framing 참고)**:
15. prop-amm-challenge README + crates/ (Rust) — A-S 구현 사례 (우리는 reverse engineer)
16. prediction-market-challenge orderbook_pm_challenge/process.py — Kyle 1985 구현 사례

**중요한 negative result** [unknown until verified]: arxiv 2512.12924 인용대로면 5개 microstructure pattern, 100 US equity, 2015-2024 기간, **annualized return 0.55%, Sharpe 0.33, p=0.34 (insignificant)**. **이 인용 자체가 [unknown]이지만, 가정이 옳다면 우리도 honest reporting 채택. F1 falsified 가능성 진지하게 받아들임.**

---

## 3. Validation Framework — 검증 체계

### 3.1 두 종류의 Evidence 동시 수집

| Evidence type | 수집 방식 | 단위 | 한계 |
|---|---|---|---|
| Subjective (Verdict) | 유저가 trade 후 5-cat 라벨링 | per (user, capture) | 유저 bias, sample 작음 |
| Objective (Forward Return) | 시스템이 phase 진입 시점에서 forward return 측정 | per (pattern, phase, timestamp) | 우리가 정의한 phase가 옳다는 가정 |

**검증 명제**: 한 PatternObject가 production-grade라고 claim하려면 **두 evidence가 모두 random보다 유의하게 좋아야 함**. 한쪽만으로는 cherry-picking 위험.

### 3.2 4 Metrics

#### M1. Phase-conditional Forward Return ⭐ (가장 중요)

**가설**: phase k 진입 시점에서 forward return의 분포가 random과 유의하게 다르다.

**측정**:
```
for each (pattern, phase k, timestamp t in holdout):
    R(t, h) = (price[t+h] - price[t]) / price[t] - cost(t)
    where h ∈ {1h, 4h, 24h}, cost = fee + slippage estimate
collect: R_phase_k = {R(t, h) : phase k entered at t}
baseline: R_random = sample n=|R_phase_k| random timestamps from holdout
test: Welch's t-test (R_phase_k vs R_random) → t, p
report: mean, median, t-stat, p-value, BH-corrected p, bootstrap 95% CI
```

**Acceptance**: directional_belief = "long_entry" phase는 t ≥ 2.0 (BH 보정 후), p < 0.05. directional_belief = "avoid_entry" phase는 t ≤ −1.5 또는 mean ≤ 0.

#### M2. Signal Ablation (Leave-One-Out) — Tishby IB 정당화

**가설**: 각 signal이 phase-conditional return에 양의 contribution을 준다 (Tishby IB 관점: 각 signal이 I(T; Y)에 양의 기여).

**측정**: phase k의 N개 signal 중 i번째를 빼고 phase 정의 후 M1 재측정. drop = mean(R_with_i) − mean(R_without_i).

**Acceptance**: |drop| ≥ 0.3% / 4h horizon → critical signal로 분류. drop < 0.1% → marginal, vocabulary trim 후보 (Tishby IB 관점: I(T; Y) 기여 부족).

#### M3. Sequence Completion Rate

**가설**: phase 1→2→3→...→k 시퀀스 완성도가 outcome 품질과 monotonic 관계.

**측정**: phase 1 진입 시점에서 phase k까지 도달 비율 vs phase k에서 직접 진입한 시점 forward return 비교.

**Acceptance**: phase k 도달 (시퀀스 완성)한 진입의 forward return이 phase k 단독 진입보다 높음 (또는 변동성 낮음). monotonic violation 0.

#### M4. Regime-conditional Return

**가설**: 같은 패턴이 bull/bear/range regime에서 다르게 작동.

**측정**: BTC 30d return 기반 regime 라벨링 → regime별 M1 측정.

**Acceptance**: regime별 결과 dashboard에 노출. 한 regime에서 t < 0 + 다른 regime에서 t > 2이면 regime-conditional gate 강제 (해당 패턴은 그 regime에서만 활성).

### 3.3 4 Baselines (필수 정의)

| ID | Baseline | 답하는 질문 |
|---|---|---|
| B0 | Random time, same horizon | "trading intensity 외에 phase 자체에 정보가 있나?" (VPIN 비판 대응) |
| B1 | Buy & hold, same horizon | "패턴이 단순 long-only를 이기나?" |
| B2 | Phase 0 (no phase entered) | "phase 진입 자체가 의미 있나? aimless time과 다른가?" |
| B3 | Phase k−1 | "phase 진행이 monotonic 정보 있나?" |

**기본 baseline = B0** (Welch t-test). B1/B2/B3는 dashboard에 함께 표시.

### 3.4 Cross-Validation — Purged K-Fold + Embargo (Lopez de Prado 2018) [v1.2: embargo 정당화, I3 fix]

**왜 필요한가** [factual]: 우리의 forward return label은 t+h까지의 미래 정보에 의존. 단순 K-fold는 train/test 사이에 정보 누설 발생.

**Embargo 정당화** [factual: Lopez de Prado 2018 ch7]:
- Lopez de Prado 권장: **embargo ≥ label horizon** (label 기간 동안의 정보 누설 방지)
- 추가 권장: 데이터 길이의 **0.5~1%** 만큼 추가 buffer (autocorrelation 방지)
- **명시적 식**: `embargo_bars = max(label_horizon_bars, n_total_bars × 0.005)`

**예시 계산**:
- 1년 1h bar 데이터 = 8,760 bars
- 4h horizon = 4 bars
- n × 0.005 = 44 bars
- → embargo = max(4, 44) = **44 bars (≈ 1.8 days)**

→ 이 식을 코드에 박으면 horizon이 짧을 때도 안전 buffer 유지.

**구현**:
```python
engine/research/validation/cv.py:

class PurgedKFold:
    def __init__(self, n_splits=5, label_horizon_hours=4, embargo_floor_pct=0.005):
        self.n_splits = n_splits
        self.horizon = label_horizon_hours
        self.embargo_floor_pct = embargo_floor_pct

    def _compute_embargo_bars(self, n_total: int, bar_size_hours: int) -> int:
        horizon_bars = max(1, int(self.horizon / bar_size_hours))
        floor_bars = int(n_total * self.embargo_floor_pct)
        return max(horizon_bars, floor_bars)

    def split(self, timestamps, bar_size_hours: int = 1):
        n_total = len(timestamps)
        embargo_bars = self._compute_embargo_bars(n_total, bar_size_hours)
        # 1. Standard K-fold split by time
        # 2. Purge: train set에서 test의 label horizon과 겹치는 sample 제거
        # 3. Embargo: test set 끝나고 embargo_bars만큼 train 시작 지연
        ...
```

**적용**: 모든 M1~M4 측정에서 5-fold purged CV 결과 평균 + std 보고.

### 3.5 Multiple Testing Correction — Harvey-Liu 2015 + BH

**문제** [factual]: 53 PatternObject × 5 phase × 3 horizon = 795 hypothesis. 단일 p-value < 0.05 기준이면 expected false discoveries ≈ 40개.

**대응 (3가지 동시 적용)**:
1. **Benjamini-Hochberg (BH/FDR)**: 795개 p-value를 FDR < 0.10 기준으로 필터
2. **Harvey-Liu haircut**: t-stat 3.0이 단일 검정 기준 highly significant이지만, 795 검정에서는 t-stat 약 4.0 필요 [estimate, paper Exhibit 4 참조]
3. **Deflated Sharpe Ratio (Bailey-Lopez de Prado 2014)**: trial 수 N과 returns의 skew/kurtosis 보정

**Acceptance gate (수정)**: t-stat ≥ 2.0이 아니라 **BH-corrected p < 0.05 AND DSR > 0** 둘 다 통과.

### 3.6 Acceptance Gates — Production 진입 조건

PatternObject가 search corpus + marketplace에 실리려면 8개 gate 모두 통과:

| Gate | 조건 | 출처 |
|---|---|---|
| G1 | M1 phase k (entry phase) BH-corrected p < 0.05 | §3.5 |
| G2 | M1 phase k mean return > cost (fee + slippage estimate) | §3.7 |
| G3 | M2 signal ablation: 모든 signal drop ≥ 0.1% (vocabulary trim 통과) | §3.2 |
| G4 | M3 sequence monotonic violation 0 | §3.2 |
| G5 | DSR > 0 (Bailey-Lopez de Prado) | §3.5 |
| G6 | Purged 5-fold CV: 5 fold 중 ≥ 4에서 mean return > 0 | §3.4 |
| G7 | M4 regime-conditional: 모든 regime에서 t > 0 (또는 regime gate 명시) | §3.2 |
| G8 | Verdict ≥ 30건 (per pattern) AND verdict accuracy > 0.55 (subjective evidence) | §3.1 |

**G1~G7 = objective evidence (시스템 측정).**
**G8 = subjective evidence (유저 verdict).**
**둘 다 통과해야 production.**

#### 53 PatternObject 보존 정책 [v1.3, D4 결정]

**Week 1 측정 = 5개 P0 패턴**. 나머지 48개는 다음과 같이 처리:

| 상태 컬럼 | 의미 | 영향 |
|---|---|---|
| `production_gates_passed = TRUE` | 8 gate 모두 통과 | search corpus 포함 + marketplace publish 가능 |
| `production_gates_passed = FALSE` | 측정했으나 불통과 | search corpus 제외 + decay log 기록 |
| `production_gates_passed = NULL` | **미측정 (Week 1 P0 5개 외 48개)** | search corpus 제외, 그러나 **삭제 X** |
| `deprecated_at IS NOT NULL` | decay 감지로 폐기 | search corpus 제외, archive |

**원칙**:
- 53 PatternObject **삭제 금지**. registry에서 보존
- 측정 안 된 48개는 NULL 상태로 catalog에 남음 (UI에 "Unmeasured" 표시)
- Phase 2/3 점진 측정 (monthly batch 가능)
- Hunter가 자기 PatternDraft 만들 때 NULL 상태 패턴도 reference로 볼 수 있음
- 삭제는 **decay 감지 시에만** (`deprecated_at` 채움) — 그것도 manual review 거침

[unknown]: 실제 측정 시 8 gate 통과 패턴 비율. Week 1 측정 결과 0%일 가능성 진지하게 고려.

### 3.7 Cost Model — Net Edge Required [factual: Binance perp]

**왜 cost 차감 필수**: gross return으로 측정하면 fee + slippage가 모든 alpha 잠식하는 패턴도 통과. 의미 없음.

**Binance perp standard cost** [factual: binance.com fee tier]:
- Maker fee: 0.02%
- Taker fee: 0.05%
- Round-trip taker: **2 × 0.05% = 10 bps** (가장 보수적, 시장가 entry/exit 가정)
- Slippage estimate (depth 기반): **+5 bps** (P0 P1 패턴은 BTC/ETH/대형 alt 한정)

**Total cost per round-trip** [estimate]: **15 bps = 0.15%**

**G2 명시 (재서술)**:
- horizon = 4h → mean(R_phase_k − cost) > 0 (필수)
- horizon = 1h → mean × 4 (annualized 비교용) > 0.6% per day (참고)
- horizon = 24h → mean(R_phase_k − cost) > 0 + funding cost 추가 차감

**Cost 모델 한계** [unknown]:
- Slippage 5bps는 BTC/ETH 기준 [estimate], small-cap alt는 30~50bps 가능
- Funding cost (24h horizon): 평균 1bp/8h → 24h horizon은 추가 3bps 차감 필요
- Maker fill rate 가정 안 함 (보수적). 실제 hunter는 maker entry로 cost 절감 가능 → 이건 [user-side optimization], 시스템 측정에는 taker 가정 유지

**구현**: `engine/research/validation/cost.py`에 `cost_bps_per_horizon(horizon, symbol_class)` 함수. P0에서는 `15 bps fixed`로 시작.

### 3.8 ⭐ Pattern Decay Monitoring [v1.2 신규, I2 fix]

**왜 필요한가**: PatternObject는 immutable + versioned. 그러나 한 패턴이 regime 변화로 작동 멈춤 시 자동 감지 + production 제외 필요. 그렇지 않으면 deprecate된 패턴이 search corpus에 남아 false positive 양산.

#### Decay 정의

> **Pattern decay = 동일 PatternObject의 phase-conditional return이 시간이 지나며 통계적으로 유의하게 악화**

#### 측정 방법 — Rolling 30d t-stat Watching

```python
# engine/research/validation/decay.py [v1.2 신규]

@dataclass
class DecaySignal:
    pattern_id: str
    pattern_version: int
    phase_index: int
    rolling_window_days: int
    current_t_stat: float
    historical_t_stat: float
    decay_severity: str  # "stable" / "warning" / "critical"
    deprecate_recommended: bool

def measure_pattern_decay(
    pattern_id: str,
    pattern_version: int,
    target_phase: int,
    rolling_window_days: int = 30,
    historical_window_days: int = 90,
) -> DecaySignal:
    """
    Rolling window의 phase-conditional return t-stat을 historical과 비교.
    """
    recent_t = measure_phase_conditional_return(
        pattern_id, pattern_version,
        holdout_range=last_n_days(rolling_window_days),
        horizon_hours=4,
    )[target_phase].t_stat

    historical_t = measure_phase_conditional_return(
        pattern_id, pattern_version,
        holdout_range=last_n_days(historical_window_days, exclude_recent=rolling_window_days),
        horizon_hours=4,
    )[target_phase].t_stat

    delta = recent_t - historical_t
    severity = (
        "critical" if delta < -1.5 else
        "warning"  if delta < -0.8 else
        "stable"
    )
    return DecaySignal(
        pattern_id=pattern_id,
        pattern_version=pattern_version,
        phase_index=target_phase,
        rolling_window_days=rolling_window_days,
        current_t_stat=recent_t,
        historical_t_stat=historical_t,
        decay_severity=severity,
        deprecate_recommended=(severity == "critical" and recent_t < 1.5),
    )
```

#### Decay Trigger Actions

| Severity | Action | 누가 결정 |
|---|---|---|
| **stable** (Δt ≥ -0.8) | 아무것도 안 함 | — |
| **warning** (Δt -0.8 ~ -1.5) | Dashboard alert + Slack 알림 + 30일 후 재평가 | system |
| **critical** (Δt < -1.5 AND recent_t < 1.5) | search corpus에서 자동 제외 + new version 작성 권고 | system + human review |

#### Auto-deprecate vs Manual Review

**Auto-deprecate**: critical severity + recent t-stat < 1.5 + holdout n ≥ 30
- → 자동으로 PatternObject.deprecated_at 채워짐
- → search corpus filter가 deprecated_at IS NULL 조건 자동 적용
- → 새 version (v2) 제안 메시지 hunter에게 발송

**Manual review** (대안):
- Human review queue에 등록
- 1주일 내 사람이 결정
- decay 원인 (regime change vs 패턴 결함) 분류

→ P0에서는 **manual review only** (auto-deprecate는 위험). P2에서 auto-deprecate 도입.

#### Weekly Job (V-09 보강)

```python
# engine/scanner/jobs/pattern_decay_check.py [신규]
@scheduled(cron="0 4 * * MON")  # 월요일 04:00
def pattern_decay_check_job():
    for pattern in registry.list_active_patterns():
        for phase_idx in pattern.entry_phase_indices:
            signal = measure_pattern_decay(
                pattern.pattern_id,
                pattern.version,
                phase_idx,
            )
            if signal.decay_severity != "stable":
                emit_alert(signal)
                save_to_decay_log(signal)
```

#### Decay vs Personal Variant Overfit (구분)

| 현상 | 원인 | 대응 |
|---|---|---|
| Pattern decay | regime change, market structure shift | 새 version 제안 + 기존 deprecate |
| Personal Variant overfit | 유저가 threshold 풀어 모든 시점 매칭 | Variant promotion에 통계 유의 검정 (별도 spec, 18 doc 후속) |

→ 둘은 서로 다른 메커니즘. Pattern decay는 시스템 책임, overfit은 유저별 가드.

---

## 4. F-60 Marketplace Gate — 재정의

### 4.1 기존 정의 (prd-master.md v2.2)
> verdict_count ≥ 200 AND accuracy ≥ 0.55 [factual]
> threshold 0.55는 "권고, 90일 후 조정" → 통계 근거 [unknown]

### 4.2 Hunter framing 하의 재정의

F-60 gate는 **두 layer**로 분리:

**Layer A — Pattern-level objective gate** (시스템이 검증):
- 해당 PatternObject가 §3.6의 G1~G7 통과 [factual: 측정 가능]

**Layer B — User-level subjective gate** (유저 trade record):
- 해당 유저가 그 PatternObject로 verdict ≥ N건 (N = 30 잠정)
- 해당 유저의 verdict accuracy ≥ X% (X = 0.55 잠정, power analysis로 확정 §4.3)

**둘 다 통과해야 marketplace publish 가능**.

### 4.3 N과 X의 통계 근거 (Power Analysis)

**과제**: 0.55 baseline 대비 0.65 진짜 accuracy 검출 (effect size)을 power 0.8, alpha 0.05로 확보하려면 n은?

**계산** [estimate, two-proportion z-test 표준 공식]:
- p1 = 0.55, p2 = 0.65, alpha = 0.05, power = 0.8
- n ≈ 388 per group (검출 대상 group + 비교 group)
- 비교 group은 random baseline (이미 풍부) → 단일 group 기준 **n ≈ 200**

→ **N = 200이 우연이 아니라 effect 0.10 검출에 필요한 sample size와 일치** [estimate]. 이전 prd-master.md v2.2의 200은 우연한 일치였을 가능성. 이 계산을 doc에 명시하면 통계 근거 확보.

**X = 0.55의 출처**: 마찬가지로 [unknown]. 권고: Week 1 α 측정 후 53 패턴의 random baseline accuracy 분포 측정 → upper 25% 기준으로 X 결정. 데이터 기반 calibration.

### 4.4 Layer A 추가 효과

**Broadcasting 채널 (Alpha Hunter / Alpha Terminal / 시그널 레이더 / Alpha Flow)과의 차별화 강화** [factual: telegram-refs.md §5]:
- 4채널은 사후 ranking만 → 통계 검증 layer A 없음
- 우리는 layer A + layer B 둘 다 → "통계적으로 검증된 패턴을 검증된 유저가 구사"

이게 marketplace의 진짜 moat. broadcasting 모방 금지(prd-master.md Non-Goal)와 정합 [factual].

---

## 5. Implementation — 구체적 작업 분해

### 5.0 ⭐ `engine/research/pattern_search.py` 통합 정책 [v1.2 신규, C1 fix]

**[factual]**: W-0220 PRD §4 L5는 다음을 명시한다.
> "engine/research/pattern_search.py:3283줄 — 벤치마크 팩, 변형 평가, MTF 검색, 가설 테스트"

→ **3283줄짜리 hypothesis testing 인프라가 이미 존재**. 새 `engine/research/validation/` 모듈을 만들 때 이 기존 코드와의 관계를 명확히 해야 한다.

#### 정책: Augment, No Rebuild

**원칙**: `pattern_search.py`의 hypothesis test / benchmark pack / variant evaluation 함수를 **재구현하지 않는다**. 새 `validation/` 모듈은 **기존 코드 위에 얇은 layer로 구축한다**.

#### 구체적 통합 룰

| 기존 함수 (pattern_search.py) | 새 함수 (validation/*) | 관계 |
|---|---|---|
| `hypothesis_test(pattern, holdout, ...)` | `phase_eval.py:measure_phase_conditional_return()` | 새 함수가 기존 호출. wrapper 역할 |
| `BenchmarkPack` class | `validation/baselines.py` | 새 baseline 4종을 BenchmarkPack 형태로 등록 |
| `variant_evaluation(pattern_id, ...)` | `validation/decay.py:measure_pattern_decay()` | rolling window mode로 variant_evaluation 호출 |
| `mtf_search(pattern, ...)` | (사용 안 함, V-08 horizon=1h/4h/24h가 별도 처리) | 미통합, 향후 mtf_search 활용 가능 |

#### 코드 작성 시 강제 규칙

1. **`validation/*` 어떤 모듈도 자체 hypothesis testing 함수 새로 작성 금지** — pattern_search.py에서 import
2. **신규 함수는 wrapper / orchestrator만** — 기존 함수에 Cost model, BH correction 등 layer 추가
3. **PR 시 reviewer는 pattern_search.py와 새 코드의 중복 검사 강제**
4. **테스트는 기존 pattern_search.py 테스트와 호환 유지** (regression 방지)

#### 첫 V-01 작업 시 audit

V-01 (PurgedKFold) 구현 전:
1. `engine/research/pattern_search.py` 3283줄 **전체 read**
2. 기존 hypothesis test 함수 inventory 작성 (이름 + 시그니처)
3. 어떤 함수가 wrapping 가능한지 매핑 표 작성
4. 매핑 표를 W-0214 Appendix B로 추가 (현재 [unknown])
5. 그 후에야 `validation/cv.py` 작성 시작

→ V-01 effort 추정 1일 → **2일로 상향** (audit 1일 추가)

### 5.1 모듈 구조

```
engine/research/
├── pattern_search.py        # 기존 3283줄 — augment 대상, 재구현 금지 (§5.0)
└── validation/              # 신규, pattern_search.py를 wrapping
    ├── __init__.py
    ├── cv.py               # PurgedKFold + Embargo (Lopez de Prado 2018)
    ├── cost.py             # cost_bps_per_horizon(horizon, symbol_class) — §3.7
    ├── baselines.py        # B0/B1/B2/B3 sampling (BenchmarkPack 호환)
    ├── stats.py            # Welch t-test + bootstrap CI + BH/BHY + DSR
    ├── phase_eval.py       # M1 phase-conditional return (pattern_search.hypothesis_test wrapping)
    ├── ablation.py         # M2 signal leave-one-out
    ├── sequence.py         # M3 sequence completion
    ├── regime.py           # M4 regime labels (BTC 30d)
    ├── decay.py            # ⭐ §3.8 Pattern decay monitoring [v1.2 신규]
    ├── pipeline.py         # 전체 결합 + dashboard JSON 출력
    └── tests/
        └── test_*.py       # 각 모듈 unit test
```

### 5.2 SQL Materialized View [factual: W-0213 §5.4 차용]

```sql
-- engine/migrations/0XX_phase_eval_view.sql
create materialized view pattern_entry_outcomes as
with phase_entries as (
    select
        pts.pattern_id,
        pts.pattern_version,
        pts.symbol,
        pts.timeframe,
        pts.bar_timestamp as t0,
        pts.current_phase_index as phase_k,
        pts.current_phase_id as phase_id,
        pts.directional_belief,
        pts.last_feature_snapshot,
        rl.regime_label
    from phase_transition_events pts
    left join regime_labels rl
        on rl.symbol = pts.symbol
        and rl.timestamp = date_trunc('hour', pts.bar_timestamp)
    where pts.transition_type = 'advance'
),
forward_prices as (
    select
        pe.*,
        bars_at(pe.t0, '1h').close  as p_t1h,
        bars_at(pe.t0, '4h').close  as p_t4h,
        bars_at(pe.t0, '24h').close as p_t24h,
        bars_at(pe.t0).close         as p_t0
    from phase_entries pe
)
select
    *,
    (p_t1h  - p_t0) / p_t0  as fwd_return_1h_gross,
    (p_t4h  - p_t0) / p_t0  as fwd_return_4h_gross,
    (p_t24h - p_t0) / p_t0  as fwd_return_24h_gross
from forward_prices;

-- refresh: 일 1회 또는 V-09 weekly job에서 트리거
```

`pattern_entry_outcomes` 위에서 phase_eval.py가 cost 차감 후 net return 계산.

### 5.3 Python 시그니처 — M1~M4 [factual: W-0213 §5.1 차용 + cost-aware patch]

(이전 v1.1과 동일 — M1~M4 Python signatures. label_btc_regime() 포함)

[v1.1과 동일하므로 생략. 코드 시그니처는 v1.1 본문 참조]

### 5.4 Dashboard 출력 (예시 JSON)

(v1.1과 동일. production_gates에 G7+regime + G8+verdict 포함된 JSON 예시)

### 5.5 유저 노출 (Hunter UI) [v1.3 전면 개편, D7 결정 = 전체 공개]

**원칙**: power user / full transparency. raw 수치 모두 노출. dashboard = "trader-friendly 문구"가 아닌 **"research-grade dashboard"**.

#### 노출 항목 전체 표

| 항목 | 노출 형식 | 예시 |
|---|---|---|
| Phase별 mean return | 정확한 % | "Phase 4 accumulation: +2.7%" |
| Phase별 median return | 정확한 % | "median +1.9%" |
| Phase별 t-stat (raw) | 수치 + 양/음 색상 | "t = +4.1" (녹색) |
| Phase별 t-stat (BH-corrected) | 수치 + significance star | "t_BH = +3.5 ★★" |
| p-value (raw) | scientific notation | "p = 0.0001" |
| p-value (BH-corrected) | scientific notation | "p_BH = 0.0008" |
| **DSR (Deflated Sharpe Ratio)** | 수치 | "DSR = 1.42" |
| Bootstrap 95% CI | range | "[+1.8%, +3.6%]" |
| Sample size n | 정확한 수 | "n = 41" |
| Signal ablation drop_pct | 정확한 % | "higher_lows: -1.8%" |
| Signal ablation rank | 순위 + label | "#1 critical / #2 critical / #3 marginal / #4 trim" |
| Sequence completion rate | % + raw counts | "12% (17/142)" |
| Phase 1→k transitions | 매 transition 수치 | "1→2: 60% / 2→3: 40% / 3→4: 30%" |
| Regime-conditional results | bull/bear/range 분리 + 각각 t-stat | "bull t=3.8 / bear t=1.1 / range t=2.5" |
| Regime label thresholds | 정의 공개 | "bull = BTC 30d > +10%" |
| 8 gate 통과 상세 | 각 gate threshold + 통과/실패 + 측정값 | "G1 (BH p < 0.05): PASS, p=0.0008" |
| Cost model used | 명시 | "15 bps round-trip (10 fee + 5 slippage)" |
| Holdout window | 시작/끝 timestamp | "2026-01-01 ~ 2026-04-15" |
| Purged CV folds | 5 fold 각각 결과 | "fold 1 mean +2.5% / fold 2 mean +3.1% / ..." |

#### Glossary Toggle (필수)

dashboard 우측 상단에 **"용어 사전"** toggle. 한국어 power user 위해. 노출되는 raw 수치를 다 이해 못해도 클릭하면 설명. P1 작업.

용어 사전 항목 (§14 Appendix C 참조):
- DSR (Deflated Sharpe Ratio)
- BH-corrected p-value
- Bootstrap CI
- Purged K-Fold CV
- Welch t-test
- Embargo
- 등 13개 통계 용어

#### 효과

- **Hunter 정체성 극대화**: "내가 발견한 패턴이 통계적으로 진짜인지" 모든 수치로 확인
- **Power user 친화**: 한국 retail crypto perp trader는 power user 비율 높음 [speculation]
- **Trust 증가**: "왜 통과했는가/탈락했는가" 추론 가능
- **Marketplace publish 자신감**: hunter가 자기 패턴 통계를 보고 publish 결정

#### 위험 mitigation

- **정보 과부하 위험**: Glossary + "Summary view / Detail view" toggle (Detail view에 raw 수치)
- **p-value 함정**: BH-corrected가 default 표시, raw p-value는 fold-out
- **Cherry-picking 유도 위험**: "이 pattern이 왜 fail했는가" 같이 표시 (강조 X)

---

## 6. Threshold Audit Procedure (V-12 Spec) [factual: W-0213 §6 차용]

(v1.1과 동일. 23 signal × 5 sensitivity audit, z-score window 정책, log vs raw 통일, V-12 effort 3일)

---

## 7. 기존 자산 매핑 — 호환성 audit

### 7.1 코드 자산 (163 built) 영향도

| 자산 | 영향 | 변경 필요? |
|---|---|---|
| L1 Market Data (33) | 무영향 | 없음 |
| L2 Feature Window (5) | 무영향 | 없음 |
| L3 PatternObject (53) | **G1~G7 측정 대상** + decay monitoring (§3.8) | 측정 후 production list filter 추가 |
| L4 State Machine | 무영향 | 없음 |
| L5 Search 3-layer | **검증된 패턴만 corpus 포함하는 filter 추가** | search corpus query에 production_gates_passed 조건 |
| L6 Ledger | 무영향 | 없음 |
| L7 AutoResearch (Hill Climbing + LightGBM) | **F4 (Personal Variant 효과) 측정 추가** | refinement_trigger에 통계 검증 step 추가 |
| **engine/research/pattern_search.py (3283줄)** | **§5.0 augment-only** | wrapper layer 추가, 본체 변경 없음 |
| Scheduler 4 jobs | **신규 5번째 job: validation 매주 1회** + decay check (월요일) | scheduler config 추가 |
| Auth/Branding/Profile/etc | 무영향 | 없음 |

→ 163 built 중 **0개 폐기**, 5개 자산 augment.

### 7.2 9 NOT BUILT 항목 영향도

(v1.1과 동일)

### 7.3 새로 필요한 작업 (W-0214 신규)

| ID | 항목 | Effort | 선행 | 우선순위 |
|---|---|---|---|---|
| **V-00** | **`engine/research/pattern_search.py` audit (§5.0)** | **S (1d)** | — | **P0 [v1.2 신규]** |
| V-01 | engine/research/validation/cv.py (Purged K-Fold) | S (1d) | V-00 | P0 |
| V-02 | engine/research/validation/phase_eval.py (M1) | M (2d) | V-01 | P0 |
| V-03 | engine/research/validation/ablation.py (M2) | M (2d) | V-02 | P0 |
| V-04 | engine/research/validation/sequence.py (M3) | S (1d) | V-02 | P1 |
| V-05 | engine/research/validation/regime.py (M4) | M (2d) | V-02 | P1 |
| V-06 | engine/research/validation/stats.py (BH + DSR) | S (1d) | — | P0 |
| V-07 | SQL view + migration | S (0.5d) | — | P0 |
| V-08 | Validation pipeline + JSON dashboard | M (2d) | V-01~V-06 | P0 |
| V-09 | Validation scheduler job (weekly) | S (0.5d) | V-08 | P1 |
| V-10 | Pattern dashboard UI (hunter-facing) | M (3d) | V-08 | P1 |
| V-11 | F-60 gate logic 재구현 (layer A + B) | M (2d) | V-08, F-02 | P1 |
| V-12 | Threshold calibration audit (β) — spec §6 | M (3d) | V-02 | P1 |
| **V-13** | **engine/research/validation/decay.py + scheduler job (§3.8)** | **M (1.5d)** | **V-02** | **P1 [v1.2 신규]** |

**Total P0**: V-00, V-01, V-02, V-03, V-06, V-07, V-08 = 약 9 일 (1 agent).

---

## 8. Roadmap — 이 framing의 일정

### 8.1 Week 1 — 검증 backbone 구축 + 첫 측정

| Day | 작업 | 산출물 |
|---|---|---|
| D1 | V-00 (pattern_search.py audit) + Library audit (γ) | inventory 표 + priority_list.md |
| D2 | V-01 (PurgedKFold with embargo §3.4) + V-06 (stats) + V-07 (SQL view) | code |
| D3-D4 | V-02 (phase_eval, pattern_search wrapping) + V-08 (pipeline) | code |
| D5 | 5개 P0 패턴 측정 1회 + dashboard JSON 생성 | results/week1/ |
| D5 | Decision gate: F1 falsified? (5개 모두 t-stat < 2.0?) | go/no-go |

### 8.2 Week 2 — 확장 + threshold calibration + decay infra

| Day | 작업 |
|---|---|
| D6-D7 | V-03 (ablation) — vocabulary trim 후보 식별 |
| D8 | V-13 (decay monitoring) — 30d/90d rolling 측정 코드 |
| D8-D10 | V-12 — threshold audit. price_change_1h 5%, oi_zscore 2.0 등의 출처 확인 + sensitivity test |

### 8.3 Week 3-4 — F-60 재구현 + UI + WVPL chain 측정

| Week | 작업 |
|---|---|
| W3 | V-11 (F-60 layer A + B), V-04 (sequence), V-05 (regime), WVPL chain L1-L5 측정 (§1.5) |
| W4 | V-10 (hunter dashboard UI) + V-09 (weekly scheduler) + decay scheduler job |

### 8.4 P0 Roadmap (W-0220)에 미치는 영향

기존 PRD W-0220 P0 7주에 +2주 추가 → **9주 P0** (V-00 audit 포함):
- W1 (W-0214): 검증 backbone + V-00 audit
- W2 (W-0214): threshold audit + decay infra
- W3-W7: 기존 W-0220 P0 (A-03/A-04/D-03/F-02/F-2/F-3/F-4/F-5)
- W8: V-11 F-60 재구현 + V-10 hunter dashboard UI
- W9: 통합 테스트 + WVPL chain 측정 + launch prep

→ **launch까지 9주**. 추가 2주 비용 vs broadcasting과 차별화 + falsifiability 확보 + decay 자동 감지. 결정 필요 (D6).

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| F1 falsified (53패턴 0개 통과) | [unknown, 진지하게 고려] | High | Week 1에서 즉시 발견 → 5개 → 53개 확장하지 않고 가설 재설계 |
| Verdict와 forward return correlation 약함 (F2) | Medium [speculation] | Medium | Layer A + Layer B 분리 운영, 약한 correlation도 정보로 활용 |
| Hunter persona가 retail에 충분히 크지 않음 (F3) | Medium [unknown] | High | persona research 별도 (본 문서 out-of-scope), 4채널 구독자수 [estimate]로 lower bound |
| arxiv 2512.12924처럼 Sharpe 0.33만 나옴 | Medium [unknown: 인용 미확인] | Medium | regime-conditional gate (G7)로 일부 regime에서만 활성화 |
| Multiple testing으로 t-stat 4.0 필요하지만 sample 부족 | High [factual: 53 × 5 × 3 = 795 hypothesis] | High | P0 5 패턴만 먼저 → 5 × 5 × 3 = 75 hypothesis로 축소 |
| Transaction cost가 모든 alpha 잠식 | Medium [unknown for crypto perp] | High | G2에서 cost 차감 강제. cost model: §3.7 |
| Personal Variant overfit (가드 없음) | High [factual: W-0213 갭] | Medium | V-04 sequence + Variant promotion 시 통계 검증 (별도 spec) |
| Black-Scholes GBM 가정이 crypto perp에 안 맞음 | High [factual: fat tails 잘 알려짐] | Medium | bootstrap CI로 normality 가정 회피, parametric test 보완 |
| **`pattern_search.py` 재구현 위험** | High [factual: §5.0] | High | **§5.0 augment-only 정책 + V-00 audit 강제 + PR review 중복 검사** [v1.2 신규] |
| **Pattern decay 미감지로 deprecated 패턴이 corpus에 남음** | Medium [unknown] | Medium | **§3.8 decay monitoring + weekly job + manual review queue** [v1.2 신규] |

---

## 10. Decision Requests (D1~D8) [v1.2: D8 추가]

본 문서가 lock-in 되려면 8개 결정 필요:

| ID | 질문 | 권고 |
|---|---|---|
| D1 | Hunter framing lock-in? (PRD vision 변경) | YES — §1.3 evidence 기반 |
| D2 | Forward horizon 기본값? (1h / 4h / 24h) | 4h primary, 1h + 24h 보조 표시 |
| D3 | Cost model? (fee + slippage 차감) | §3.7 — 15 bps round-trip default |
| D4 | P0 패턴 수? (5 / 10 / 53) | 5 (Week 1), 통과 시 점진 확장 |
| D5 | F-60 gate 재정의 채택? (layer A + layer B) | YES — §4.2 |
| D6 | P0 일정 7주 → 9주 OK? | YES (V-00 audit + decay infra 포함) |
| D7 | Hunter dashboard UI 노출 범위 (§5.5 표) | 권고대로 — DSR/drop_pct 등 raw 수치는 비공개 |
| **D8** | **Phase taxonomy: 5-phase OI Reversal vs 4-phase Wyckoff 우선?** | **둘 다 측정 (§2.4), Week 1 결과로 결정. Default = Wyckoff (canonical)** [v1.2 신규] |

---

## 11. Open Questions (검증 후 답할 것)

다음은 **본 문서가 lock-in 되어도 [unknown]으로 남는** 질문. Week 1~4 측정 후 답:

1. 53 PatternObject 중 G1~G7 통과 비율은 몇 %인가? — Week 1 결정 gate
2. Forward horizon 1h vs 4h vs 24h 중 어느 것이 most informative한가? — Week 1 측정
3. Threshold (oi_zscore 2.0, price_change 5%, funding_zscore -2.0)는 데이터 fit인가 감인가? — Week 2 audit
4. Z-score window (oi: 7d? funding: 30d? volume: 7d?)는 어떤 게 optimal인가? — Week 2 sensitivity
5. Personal Variant 효과의 통계적 유의성은? (F4) — Week 6+ (verdict 누적 후)
6. Verdict accuracy와 forward return correlation은 얼마인가? (F2) — Week 8+ (verdict 100건+ 후)
7. Hunter persona의 actual TAM은? — 별도 user research
8. **Pattern decay rate: 작동→안작동 transition의 평균 시간은?** [v1.2 추가] — V-13 6개월 운영 후 측정
9. **Cross-pattern interaction: 여러 패턴 동시 fire 시 신호 합성?** [v1.2 추가] — verdict 1k+ 후
10. **arxiv 2512.12924 / 2602.00776 실제 존재 여부 + 결과 정확성** [v1.2 추가] — Week 1 시작 전 검색

---

## 12. Appendix A — User as MM Hunter 명제의 한 줄 정리

> **Cogochi는 retail crypto perp 트레이더가 자신의 MM 행동 가설을 PatternObject로 외화하고, microstructure 데이터(Avellaneda-Stoikov 2008 + Easley VPIN 2012 + Tishby IB 1995 매핑)와 통계 검증(Lopez de Prado purged CV + Harvey-Liu BH correction + decay monitoring)으로 falsifiable하게 검증·정련하는 인프라다. 검증된 패턴은 WVPL chain (§1.5)을 통해 NSM에 직접 기여한다.**

---

## 13. References (검증 가능한 출처만)

### 13.1 학술 논문 [factual: 검색으로 확인됨]
- Avellaneda, M. & Stoikov, S. (2008). "High-frequency trading in a limit order book." Quantitative Finance 8(3), 217-224. arxiv 0807.2243
- Easley, D., Lopez de Prado, M., O'Hara, M. (2012). "Flow Toxicity and Liquidity in a High Frequency World." SSRN 1695596.
- Andersen, T.G. & Bondarenko, O. (2014). "VPIN and the flash crash." J. Financial Markets. (counter-evidence)
- Lopez de Prado, M. (2018). "Advances in Financial Machine Learning." Wiley. ch7 Purged K-Fold CV.
- Harvey, C.R. & Liu, Y. (2015). "Backtesting." Journal of Portfolio Management.
- Bailey, D.H. & Lopez de Prado, M. (2014). "The Deflated Sharpe Ratio." J. Portfolio Management 40(5), 94-107.
- Harvey, C.R., Liu, Y., Zhu, H. (2016). "...and the Cross-Section of Expected Returns." RFS 29(1), 5-68.
- **Tishby, N., Pereira, F.C., Bialek, W. (1999/2000). "The Information Bottleneck Method." arxiv physics/0004057.** [v1.2 추가]

### 13.2 최근 선례 [unknown: 미직접확인] [v1.2 정정]
- arxiv 2512.12924 — "Interpretable Hypothesis-Driven Trading: A Rigorous Walk-Forward Validation Framework." [unknown: 작성 시점 인용된 선례, 직접 read 안 됨]
- arxiv 2602.00776 — "Explainable Patterns in Cryptocurrency Microstructure." [unknown: 동일]

→ Week 1 시작 전 두 ID 실제 검색 필요. 결과에 따라 [factual] 또는 폐기.

### 13.3 내부 문서 [factual]
- prd-master.md v2.2 (2026-04-26) — W-0220 PRD master
- feature-impl-map.md v3.0 (2026-04-26)
- W-0220-telegram-refs-analysis.md (2026-04-26) — 4채널 분석
- W-0213 design (이전 버전, 본 문서가 부분 supersede)
- 92 Building Blocks + 23 signal vocabulary (engine/patterns/library.py)
- **engine/research/pattern_search.py:3283줄** — V-00 audit 대상 [v1.2 추가]

### 13.4 우리가 검증 못한 것 [unknown]
- 23 signal vocabulary의 실제 threshold 출처 — Week 2 V-12에서 audit
- 53 PatternObject의 production hit count 분포 — Week 1 D1 library audit
- Crypto perp의 transaction cost 정확값 — D3 결정 후 confirmed
- arxiv 2512.12924 / 2602.00776 정확성 — Week 1 시작 전 검색

---

## 14. Appendix B — V-00 Inventory: pattern_search.py 함수 매핑 [v1.3 — A033 audit 2026-04-27]

> **상태**: ✅ V-00 audit 완료 (Agent A033, 2026-04-27, PR #415).
> Source: `engine/research/pattern_search.py` (3283줄, 139KB, 82 def/class).
> Method: read-only, augment-only (1줄 수정 X).

### 14.0 Single Responsibility (한 줄)

`engine/research/pattern_search.py` = **Replay-based benchmark-pack search for pattern variants**. PatternObject 변형(variant)을 historical benchmark case에 replay하여 promotion gate 통과 여부 판정.

### 14.1 Module Imports & Dependencies

```python
import pandas as pd                                          # data
from data_cache.loader import CacheMiss, load_klines, load_perp
from data_cache.resample import tf_string_to_minutes
from ledger.store import LEDGER_RECORD_STORE, LedgerRecordStore
from ledger.types import PatternLedgerRecord
from patterns.{definitions, library, replay, state_machine, types}
from features.canonical_pattern import score_canonical_feature_snapshot
from scanner.feature_calc import MIN_HISTORY_BARS, compute_features_table
from .state_store import ResearchRun
from .worker_control import ResearchJobResult, ResearchJobSpec, ResearchMemoryInput,
                             ResearchWorkerController, SelectionDecisionInput
```

→ scipy / statsmodels / sklearn **부재**. mean / pstdev (statistics 표준 lib만).

### 14.2 Table 1 — Function Inventory (82 entries → 8 categories)

| # | Category | Count | Range | 대표 함수 |
|---|---|---|---|---|
| 1 | Helper utilities | 8 | L43-L120 | `_utcnow_iso`, `_phase_path_in_order`, `_phase_depth_progress` |
| 2 | Dataclasses (frozen) | 20 | L125-L679 | `BenchmarkCase`, `ReplayBenchmarkPack`, `PatternVariantSpec`, `VariantCaseResult`, `VariantSearchResult`, `PromotionGatePolicy`, `PromotionReport`, `PatternSearchRunArtifact` |
| 3 | Stores (file I/O) | 3 | L552-L678 | `BenchmarkPackStore`, `PatternSearchArtifactStore`, `NegativeSearchMemoryStore` |
| 4 | Variant operations | 14 | L685-L1099 | `build_variant_pattern`, `build_seed_variants`, `expand_variants_across_durations`, `expand_variants_across_timeframes`, `summarize_phase_attempt_records` |
| 5 | Insight builders | 9 | L1099-L1748 | `build_variant_delta_insights`, `build_search_family_insights`, `_promotion_metrics_from_cases`, `build_promotion_report` |
| 6 | Family selection | 12 | L1749-L1983 | `select_active_family_insight`, `should_use_reset_lane`, `branch_is_unhealthy`, `select_mutation_anchor_*` |
| 7 | Variant generation | 5 | L1984-L2695 | `generate_auto_variants`, `generate_reset_variants`, `generate_active_family_variants`, `generate_mutation_variants`, `build_search_variants` |
| 8 | Evaluation core ⭐ | 6 | L2696-L3283 | **`_measure_forward_peak_return`**, `_slice_case_frames`, **`evaluate_variant_on_case`**, **`evaluate_variant_against_pack`**, **`run_pattern_benchmark_search`** |

→ Total = 77 categorized + 5 small helpers; grep `def\|class` count = **82** (검증).

### 14.3 Table 2 — Wrapping Map → V-01~V-13 Modules

| pattern_search.py 함수 | 매핑 모듈 | V-XX | 방식 | 비고 |
|---|---|---|---|---|
| `_measure_forward_peak_return` | `validation/phase_eval.py` | V-02 | **extension** | peak return → mean at horizon h 추가 |
| `evaluate_variant_on_case` | `validation/phase_eval.py` | V-02 | **composition** | per-case M1 wrapper |
| `evaluate_variant_against_pack` | `validation/phase_eval.py` | V-02 | **composition** | weighted (0.7 ref + 0.3 hold) → PurgedKFold split로 교체 |
| `run_pattern_benchmark_search` | `validation/pipeline.py` | V-08 | **composition** | 전체 orchestrator |
| `_promotion_metrics_from_cases` | `validation/gates.py` | V-11 | **extension** | 7 metric 이미 존재. t-stat/DSR/BH/bootstrap 추가 |
| `build_promotion_report` | `validation/gates.py` | V-11 | **extension** | gate report → G1~G7 확장 |
| `PromotionGatePolicy` | `validation/gates.py` | V-11 | **extension** | 신규 G1~G7 threshold 추가 |
| `BenchmarkPackStore` | `validation/baselines.py` | V-08 | **composition** | B0~B3 baseline 추가 |
| `summarize_phase_attempt_records` | `validation/sequence.py` | V-04 | **thin wrapper** | M3 sequence completion |
| `_phase_path_in_order` / `_phase_depth_progress` | `validation/sequence.py` | V-04 | **thin wrapper** | M3 phase 진행 |
| `build_*_recommendations` | `validation/regime.py` | V-05 | **composition** | M4 부분 (timeframe regime) |
| `select_*` family 함수 | `validation/family.py` | V-13 | **composition** | decay monitoring과 연결 |
| `generate_*_variants` (4종) | (no mapping) | — | — | search corpus 생성 전용 |
| utility helpers (`_strip_*`, `_clone_*`) | (no mapping) | — | — | 유지 |

### 14.4 Table 3 — 4 Metrics × Existing Functions

| Metric | 활용 가능 함수 | 부족분 (신규) |
|---|---|---|
| **M1** Phase-conditional return | `_measure_forward_peak_return` (peak), `evaluate_variant_on_case` | mean at horizon h, BH/FDR, bootstrap CI, scipy.stats |
| **M2** Signal ablation | (없음) | 100% 신규 (`validation/ablation.py`) |
| **M3** Sequence completion | `_phase_path_in_order`, `_phase_depth_progress`, `summarize_phase_attempt_records` | monotonic violation count |
| **M4** Regime-conditional | `build_timeframe_recommendations`, `build_duration_recommendations` (부분) | BTC 30d return regime, regime split |

→ **M3 가장 wrapping 친화적**. **M2는 100% 신규**.

### 14.5 Table 4 — 4 Baselines × Existing Functions

| Baseline | 기존 구현 | 위치 |
|---|---|---|
| **B0** Random time | ❌ 부재 | [신규 `validation/baselines.py`] |
| **B1** Buy & hold | ❌ 부재 | [신규] |
| **B2** Phase 0 | ⚠️ 부분 — `entry_hit=False` 케이스에서 추출 | extension |
| **B3** Phase k-1 | ⚠️ 부분 — `summarize_phase_attempt_records`로 추출 | extension |

→ **B0/B1 100% 신규**. B2/B3는 hooks 활용 가능.

### 14.6 Table 5 — 8 Acceptance Gates (G1~G7) × Existing Tests

| Gate | 기존 함수 | 신규 (V-06 stats.py) |
|---|---|---|
| **G1** t-stat ≥ 2 (BH) | ❌ (mean만) | scipy.stats.ttest_ind + statsmodels.multipletests |
| **G2** DSR > 0 | ❌ | López de Prado 2014 deflated_sharpe |
| **G3** PurgedKFold pass | ❌ (ref/hold split만) | `validation/cv.py` 신규 |
| **G4** Bootstrap CI excludes 0 | ❌ | numpy.random.choice + percentile |
| **G5** Ablation drop ≥ 0.3% | ❌ | M2 ablation 루프 |
| **G6** Sequence monotonic | ⚠️ phase_fidelity 비슷 | extension |
| **G7** Regime gate | ❌ | regime split 후 per-regime t-stat |

**기존 PromotionGatePolicy 7 threshold (별개로 존재)**:
- `min_reference_recall: 0.5`
- `min_phase_fidelity: 0.5`
- `min_lead_time_bars: 0.0`
- `max_false_discovery_rate: 0.4` ← FDR (G1과 다른 의미: entry→target 미도달률)
- `max_robustness_spread: 0.3`
- `require_holdout_passed: True`
- `min_entry_profit_pct: 5.0` + `min_entry_profitable_rate: 0.5`

→ 기존 7 threshold + 신규 G1~G7 = **gate v2**: V-11에서 통합 (`gate_v2 = (existing_7_pass) AND (new_G1_to_G7_pass)`).

### 14.7 Table 6 — Quant Coverage Matrix (W-0215 §17 기준)

| Quant 영역 | 기존 함수 | 위치 | V-XX | 평가 |
|---|---|---|---|---|
| **Cost** (fee + slip + funding) | `entry_slippage_pct=0.1` (10bps one-way only, fee 부재) | L2702, L2780 | V-08 | ⚠️ slippage만. **W-0214 D3 (15bps round-trip) 위반 가능**. fee + funding 명시 필요 |
| **Risk-adj return** (Sharpe/Sortino/Calmar) | ❌ | — | V-06 | ❌ 100% 신규 |
| **Walk-forward** | reference/holdout split (시간 분리 X) | L2916 | V-01 cv.py | ❌ walk-forward 부재 |
| **Regime extension** | timeframe/duration recommendation (vol regime X) | `build_*_recommendations` | V-05 | ⚠️ 부분 |
| **Capacity** (orderbook depth) | ❌ | — | W-0226 | ❌ 신규 |
| **Alpha attribution** (factor regression) | ❌ | — | V-06 | ❌ 신규 |
| **Drawdown / tail (VaR/CVaR)** | ❌ | — | V-06 | ❌ 신규 |
| **Position sizing** (Kelly / risk parity) | ❌ | — | W-0227 | ❌ 신규 |

**Coverage**: 8 영역 중 **존재 1 / 부분 2 / 부재 5**. → W-0215 §17.9 임계 (5개 미만) **충족 불가** → **W-0217 Quant Realism Protocol 가속화 필요**.

### 14.8 재구현 금지 리스트 (Augment-only enforcement)

```
재구현 금지 (composition / extension만 허용):
├ _measure_forward_peak_return           # extend (peak → mean at h)
├ evaluate_variant_on_case               # compose
├ evaluate_variant_against_pack          # compose (PurgedKFold split만 교체)
├ run_pattern_benchmark_search           # compose
├ _promotion_metrics_from_cases          # extend (+ t-stat/DSR/BH)
├ build_promotion_report                 # extend (+ G1~G7)
├ PromotionGatePolicy / PromotionReport  # 신규 field 추가
├ BenchmarkPackStore                     # wrap with B0~B3
├ summarize_phase_attempt_records        # thin wrapper
├ _phase_path_in_order / _phase_depth_progress
└ build_*_recommendations

신규 작성 OK (기존 부재):
├ M2 ablation (leave-one-out)
├ B0 random / B1 buy&hold baseline
├ G1 t-stat (scipy.stats.ttest_ind)
├ G2 DSR (López de Prado 2014)
├ G3 PurgedKFold (López de Prado 2018)
├ G4 Bootstrap CI
├ G7 Regime gate (BTC 30d return)
├ Sharpe / Sortino / Calmar
├ Capacity (orderbook depth, retail 100K USD slippage)
├ Alpha attribution (factor regression: BTC + funding + OI)
├ Drawdown / VaR / CVaR
└ Position sizing (Kelly + risk parity)
```

### 14.9 Prose Section — 5 Questions

**Q1. 단일 책임?**
→ Replay-based benchmark-pack search for pattern variants. **Search + Evaluation orchestrator**.

**Q2. 데이터 source?**
→ ① `data_cache.loader.load_klines/load_perp` (offline kline + perp 캐시), ② `scanner.feature_calc.compute_features_table` (in-memory feature DataFrame), ③ `ledger.store` (PatternLedgerRecord persist), ④ Filesystem stores (`engine/research/pattern_search/{benchmark_packs, search_runs, negative_memory}/`, `feature_windows.sqlite` 32MB).

**Q3. Test coverage 추정**
→ 본 audit 범위 외. `engine/tests/test_pattern_search*.py` 별도 측정 권장. 본 파일 자체에 doctest/inline assert 없음.

**Q4. 가장 큰 hidden risk 1개**
→ **Implicit cost model**. `entry_slippage_pct=0.1` (10bps one-way) 하드코딩 + fee/funding 부재. W-0214 D3 (15bps round-trip = 10 fee + 5 slip) 정의와 정합 X. → V-08 wrapping 시 **명시적 cost injection** 강제. 현재 `min_entry_profit_pct=5.0`이 cost 차감 후 5%인지 불명확.

**Q5. augment-only 정책에서 가장 위험한 함수?**
→ `evaluate_variant_against_pack` (L2901). 가중 평균 0.7 ref + 0.3 hold이 PurgedKFold + Embargo로 **교체** 유혹. 룰: composition으로만 wrap. 새 PurgedKFold runner가 case_results 위에서 split 재구성. 함수 자체는 그대로. → **ADR 작성 권장** (PurgedKFold 적용 시점 + composition 방식).

### 14.10 Audit Conclusion (3-Perspective Sign-off)

**CTO**:
- 82 함수 / 8 카테고리 / 단일 책임 명확. ✅
- Augment-only 가능 (12 함수 wrap + 5 함수 no-mapping). ✅
- Hidden risk 1개 (Q4). 명시적 cost injection으로 mitigation.

**AI Researcher**:
- M1~M4 중 M3 거의 ready (3 thin wrapper). M1 extension. M2/M4 신규 100%.
- B0~B3 중 B2/B3 hook 존재. B0/B1 신규.
- G1~G7 중 G6만 부분. 나머지 6 신규 (`stats.py`, `cv.py`).

**Quant Trader**:
- Coverage **1/8 (cost only, 부분만)** — W-0215 §17.9 임계 (5개 미만) **위반** → **W-0217 Quant Realism Protocol 가속화 필요**.
- 우선순위: ① cost 명시 (V-08 0순위) ② Sharpe/DSR (V-06 1순위) ③ PurgedKFold (V-01 1순위) ④ Quant 4종 (W-0226/W-0227 Wave 4+).

### 14.11 Next Work Items (V-00 audit 결과 기반)

```
즉시 (P0 critical, 순차):
W-0217  V-01 PurgedKFold + Embargo (validation/cv.py 신규)
W-0218  V-02 phase_eval (M1 — _measure_forward_peak_return extend)

병렬 가능 (V-01 / V-02 후 시작):
W-0219  V-03 ablation (M2 100% 신규)
W-0220  V-06 stats.py (Sharpe/DSR/BH/bootstrap)
W-0221  V-08 pipeline (cost 명시 + B0~B3 baseline)
W-0222  V-11 gate v2 (G1~G7 + 기존 7 통합)

병렬 (Quant Wave 4+):
W-0226  Capacity
W-0227  Position sizing
W-0228  Alpha attribution
W-0229  Drawdown / VaR / CVaR
```

### 14.12 Audit Acceptance (PRD §16.6 검증)

```bash
# 1. Inventory completeness — grep count
grep -cE "^(class |def |async def )" engine/research/pattern_search.py
# → 82 (Table 1 row sum 77 + 5 small helpers ≈ 82, ±2 이내) ✅

# 2. Augment-only enforcement
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines (수정 0) ✅

# 3. W-0214 §14 통합
grep -A5 "## 14. Appendix B" work/active/W-0214-mm-hunter-core-theory-and-validation.md
# → "[unknown]" placeholder 제거 + 5 tables + Quant Coverage + Prose ✅

# 4. Cross-reference
grep -rln "W-0215\|V-00 audit" work/active/ memory/decisions/
# → ≥3 files ✅
```

---

*v1.3 Appendix B integrated 2026-04-27 by Agent A033 — V-00 audit complete (PR #415).*

---

## Goal

W-0214 정의 — User as MM Hunter framing의 Core Theory + Validation Framework + Implementation roadmap. 53 PatternObject library 기반 P0 5 패턴 검증 + 4 metric × 4 baseline × 8 gate.

(상세: §1 Core Theory, §3 Validation Framework, §5 Implementation, §10 Decision lock-in)

## Owner

research

## Scope

- Core Theory framing (D1~D8 LOCKED-IN)
- Validation framework spec (M1~M4, B0~B3, G1~G7)
- Implementation roadmap (V-00 ~ V-13)
- Hunter UI glossary spec (§15)
- Augment-only policy enforcement

## Non-Goals

§0.2 참조. 핵심:
- ❌ AI 차트 분석 툴 / 범용 스크리너
- ❌ 자동매매 / 카피트레이딩 / 마켓플레이스
- ❌ 53 PatternObject library 재정의 (기존 augment only)

## Canonical Files

- `engine/research/pattern_search.py` (V-00 audit 대상)
- `engine/research/validation/` (V-01~V-13 신규 모듈)
- `work/active/W-0215~W-0221-*.md` (후속 work items)
- `memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md`

## Facts

§13 References + §14 Appendix B 참조. 핵심:
- pattern_search.py 3283줄, 82 def/class (V-00 audit 결과)
- López de Prado (2018) Ch 7 PurgedKFold + Embargo
- Bailey & López de Prado (2014) Deflated Sharpe Ratio
- Welch (1947), Benjamini & Hochberg (1995) statistical basis

## Assumptions

§9 Risks 참조. 핵심:
- 53 PatternObject library 안정 (Hill Climbing + LightGBM ready)
- Binance perp 1h bar 1년 holdout 데이터 사용 가능
- W-0220 PRD v2.2 정합 유지

## Open Questions

§11 Open Questions (V-00~V-04 측정 후 답변):
- Q1: 5 P0 패턴 선정 기준
- Q2: F2 verdict ordinal encoding
- Q3: F3 active_user 정의
- Q4: variant_active period
- Q5: F1 PASS threshold (5 중 1 vs 3)

## Decisions

§10 Decision Requests D1~D8 LOCKED-IN (PR #396):
- D1 Hunter framing | D2 4h horizon | D3 15bps cost | D4 5+48 P0
- D5 F-60 = Layer A AND B | D6 9주 일정 | D7 전체 공개 UI | D8 Wyckoff default

## Next Steps

§14.11 후속 work items + W-0217~W-0224 (V-01~V-11) PRD 진행 중.

## Exit Criteria

§5.1 Phase Exit Criteria 참조. P0 통과 조건:
- 5 P0 패턴 ≥1개 F1 통과 (W-0216)
- F1~F7 KILL 발생 0
- §3.7 G1~G7 acceptance 통과

## Handoff Checklist

- [x] D1~D8 LOCKED-IN (PR #396)
- [x] §14 Appendix B V-00 audit 통합 (PR #415)
- [ ] PR #415 머지
- [ ] V-01~V-08 implementation tracks 시작 (W-0217~W-0221)

---

## 15. Appendix C — Hunter UI Glossary Spec [v1.3 신규, D7 결정]

power user 한국어 dashboard에 노출되는 통계 용어 사전. P1 UI 작업으로 구현. JSON or markdown 형식으로 dashboard glossary toggle에서 lazy load.

| 용어 | 한국어 표현 | 한 줄 설명 |
|---|---|---|
| **t-stat (Welch)** | Welch t-검정 통계량 | 두 분포 평균 차이의 유의성. \|t\| > 2 = 표본 수에 따라 통계적으로 유의 |
| **BH-corrected p** | BH 보정 p-값 | 다중 검정(795개)에서 false discovery 방지. < 0.05이면 진짜 신호일 가능성 높음 |
| **DSR (Deflated Sharpe)** | 보정 Sharpe 비율 | selection bias 보정한 Sharpe. > 0이면 random보다 일관되게 높은 risk-adjusted return |
| **Bootstrap CI 95%** | 부트스트랩 95% 신뢰구간 | 평균값의 분포 가정 없는 신뢰구간. CI가 0을 포함 안 하면 통계적으로 유의 |
| **Purged K-Fold CV** | 정제 K-fold 교차검증 | 시계열 데이터의 미래 누설 방지 검증법. Lopez de Prado 2018 표준 |
| **Embargo** | 엠바고 (검증 격리 구간) | train과 test 사이 buffer. label horizon 이상 + 데이터의 0.5% |
| **Phase-conditional return** | 단계별 조건부 수익률 | 특정 phase 진입 시점에서 측정한 forward return |
| **Random baseline (B0)** | 무작위 시점 베이스라인 | 같은 horizon에서 random 시점 진입의 수익률 분포 |
| **Buy & Hold (B1)** | 단순 보유 | 같은 기간 보유의 수익률 |
| **Phase 0 baseline (B2)** | 미진입 베이스라인 | 어떤 phase에도 안 들어간 시점 |
| **Phase k-1 baseline (B3)** | 직전 phase 베이스라인 | phase 진행이 의미있는지 검증 |
| **Signal ablation drop** | 신호 제거 효과 | leave-one-out으로 한 signal 빼고 측정. drop ≥ 0.3% = critical signal |
| **Sequence completion rate** | 시퀀스 완성률 | phase 1 → phase k 도달 비율. 시퀀스 가설의 강도 |
| **Regime gate** | 시장 국면 게이트 | bull/bear/range 중 어느 국면에서 패턴이 작동하는지 |
| **F-60 Layer A** | F-60 객관 게이트 | 시스템 통계 검증 (G1~G7 통과) |
| **F-60 Layer B** | F-60 주관 게이트 | 유저 verdict 검증 (G8: 200건 + accuracy 0.55) |

각 용어 클릭 시 inline expand로 더 긴 설명 (1~2 문단). Glossary는 P1 작업의 일부, V-10 (Pattern dashboard UI)에 포함.

---

## 16. Lock-in Status — D1~D8 결정 결과 (2026-04-27)

| ID | 질문 | 결정 | 비고 |
|---|---|---|---|
| **D1** | Hunter framing lock-in? | **YES** | 옵션 4 명제 채택. PRD vision 변경 |
| **D2** | Forward horizon | **4h primary, 1h+24h 보조** | dashboard 3-tier 표시 |
| **D3** | Cost model | **15 bps (10 fee + 5 slippage)** | Binance perp standard, BTC/ETH 기준 |
| **D4** | P0 패턴 수 | **5개 측정 + 나머지 48개 보존** | 삭제 X, NULL 상태로 catalog 유지 |
| **D5** | F-60 gate | **Layer A AND Layer B 둘 다** | broadcasting 차별화 핵심 |
| **D6** | P0 일정 | **9주 (7주 → 9주)** | V-00 audit + V-13 decay 포함 |
| **D7** | Hunter UI 노출 | **전체 공개 — raw 수치 포함** | Glossary toggle 필수 (P1) |
| **D8** | Phase taxonomy | **둘 다 측정, default Wyckoff** | dashboard 두 라벨 동시 표시 |

→ Week 1 V-00 작업 즉시 시작 가능.

---

**End of W-0214 v1.3.**
