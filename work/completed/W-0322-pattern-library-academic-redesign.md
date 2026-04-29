# W-0322 — Pattern Library 논문 수준 재설계 (Look-ahead Bias 제거)

> Wave: 5 | Priority: P0 | Effort: L
> Charter: engine — pattern research
> Status: 🟡 Design Draft
> Issue: #691
> Created: 2026-04-30
> Depends-on: W-0316 (derivatives data backfill — 6개 derivatives 패턴)

---

## Goal

`engine/patterns/library.py`의 12개 패턴을 **학술 문헌 + 실증 연구 기준**으로 재정의하여
(1) **look-ahead bias를 구조적으로 제거**하고
(2) `signals/symbol`을 통계적으로 의미있는 범위(5–50)로 압축하며
(3) **6/12 이상에서 in-sample Sharpe ≥ 0.3**, **8/12 이상에서 win_rate ≥ 0.50**을 달성한다.

핵심: `recent_rally`/`recent_decline`/`higher_lows_sequence` 세 block의 의미론을
"이미 일어난 사실"에서 "구조적 setup"으로 전환.

---

## 실측 데이터 (진단 근거)

```
higher_lows_sequence(window=8): 52-57% fire rate on BTC/ETH/APT
  → "현재 uptrend 중" = 이미 올라간 상태 = 패턴이 아님

wyckoff-spring-reversal:     256–1139 signals/symbol, Sharpe -0.01~-0.23
compression-breakout (BUG):  137–167 signals/symbol, Sharpe -0.12~-0.19
volatility-squeeze-breakout: 2–89 signals/symbol, Sharpe 0.22~0.28  ✓
liquidity-sweep-reversal:    2–6 signals/symbol, Sharpe 0.20~0.26   ✓
```

---

## Scope

### 신설 (NEW)
| 파일 | 내용 |
|---|---|
| `engine/building_blocks/structural/trading_range.py` | Wyckoff TR: ≥20 bars, range ≤8% |
| `engine/building_blocks/structural/spring_breach.py` | TR low 0.5–2% 이탈 후 즉각 회복 |
| `engine/building_blocks/structural/sign_of_strength.py` | vol ≥2× SMA20 + close top 25% + close > TR_high |
| `engine/building_blocks/confirmations/last_point_of_support.py` | SOS 후 pullback, low > spring_low |
| `engine/building_blocks/confirmations/bb_squeeze_adaptive.py` | rolling 20th percentile (6mo), ≥8 consecutive bars |
| `engine/building_blocks/confirmations/cvd_absorption.py` | taker_buy/vol ≥ 0.55 × 3+ bars, price flat ±2% |
| `engine/building_blocks/confirmations/oi_price_divergence_long.py` | OI +10%, price flat 6h |
| `engine/building_blocks/confirmations/funding_extreme_z.py` | funding < μ-2σ, 2+ intervals |
| `engine/building_blocks/triggers/range_break_with_oi.py` | close > range_high AND OI_24h ≥ +5% |
| `engine/building_blocks/triggers/oi_gap_fade.py` | OI +20%, price flat → OI 하락 시작 |
| `engine/research/validation/w0322_lookahead_audit.py` | block look-ahead 자동 검증 |

### 수정 (MOD)
| 파일 | 변경 |
|---|---|
| `engine/building_blocks/confirmations/higher_lows_sequence.py` | deprecated, cvd_absorption으로 치환 |
| `engine/building_blocks/triggers/recent_rally.py` | deprecated marker, required_blocks에서 제거 |
| `engine/building_blocks/triggers/recent_decline.py` | deprecated, optional_blocks으로 강등 |
| `engine/building_blocks/confirmations/post_dump_compression.py` | compression_ratio 0.75→0.55, baseline 8→16 |
| `engine/patterns/library.py` | 12개 패턴 phase 재구성 + D-0322-6 버그 수정 |
| `engine/research/pattern_scan/pattern_object_combos.py` | 신설 block 11개 registry 등록 |

### 테스트 (NEW)
| 파일 | 내용 |
|---|---|
| `engine/tests/patterns/test_library_lookahead.py` | 모든 block truncate-replay invariance |
| `engine/tests/building_blocks/test_trading_range.py` | detection accuracy ≥ 0.95 |
| `engine/tests/building_blocks/test_spring_breach.py` | recall 1.0, precision 1.0 |
| `engine/tests/patterns/test_signal_count_envelope.py` | 12×30 symbol envelope |
| `engine/tests/research/validation/test_w0322_in_sample.py` | walkforward Sharpe/win_rate gate |

---

## Non-Goals

- 신규 패턴 추가 (12개 유지)
- Frontend(app/) 변경 없음 — slug 동일성 유지
- Out-of-sample 보장 (W-0298 V-PV-01에서 별도)
- Derivatives 데이터 backfill (W-0316 의존)

---

## CTO 관점

### 12개 패턴 현재 vs 논문 기준

| # | Pattern | 현재 문제 | 논문 기준 | 강도 |
|---|---|---|---|---|
| 1 | wyckoff-spring | `higher_lows_sequence` look-ahead, TR 미검증 | TR→Spring breach→SOS→LPS(entry) | Heavy |
| 2 | compression-breakout | **entry_phase="COILING" BUG** | entry_phase="BREAKOUT" | Critical |
| 3 | volatility-squeeze | 고정 BB width 4% | adaptive rolling 20th pct, ADX ≥20 | Medium |
| 4 | liquidity-sweep | entry too late (ACCUMULATION) | REVERSAL_SIGNAL = entry | Medium |
| 5 | whale-accumulation | `higher_lows_sequence` look-ahead | `cvd_absorption` + `oi_hold` | Heavy |
| 6 | tradoor-oi | same look-ahead | `cvd_absorption` + oi_hold + funding_flip | Heavy |
| 7 | funding-flip-reversal | 고정 funding threshold | `funding_extreme_z` (-2σ) | Medium |
| 8 | funding-flip-short | mirror of 7 | mirror | Medium |
| 9 | oi-presurge-long | `recent_rally` look-ahead | `oi_price_divergence_long` | Heavy |
| 10 | alpha-confluence | 0 signals | meta: 2-of-{1,4,9} co-fire 24h | New |
| 11 | gap-fade-short | `intraday_gap_up` 0 발화 | `oi_gap_fade` 재정의 | Heavy |
| 12 | alpha-presurge | 0 signals | `cvd_absorption + bb_squeeze + funding_extreme_z` | New |

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 신설 block에 새 look-ahead 도입 | Medium | High | audit harness CI gate |
| Signal count 과도 압축 → 0 sig | High | High | test_signal_count_envelope 하한 강제 |
| `higher_lows_sequence` deprecate → import error 9개 | Certain | Medium | legacy alias shim 유지 |
| `bollinger_squeeze` adaptive → 신규 상장 NaN | Medium | Medium | history <6mo → fallback fixed 4% |
| W-0316 미완 시 derivatives 6패턴 0 sig | High | Low | @requires_derivatives marker로 skip |

---

## AI Researcher 관점

### Look-ahead Bias 원인

세 block은 mechanically `shift()`/`rolling()`만 써서 future를 보지 않지만 **의미론적 look-ahead**:
- `higher_lows_sequence(window=8)`: t가 이미 상승추세 한가운데 → entry = "올라가는 걸 보고 진입"
- `recent_rally`: "지난 5일 +30%" → mean-reversion 환경에선 음의 forward Sharpe (Jegadeesh 1990)
- `recent_decline`: "이미 내렸다" = 원인 아닌 결과

**교체 원리**: 결과(가격 이동) → 원인(축적/불균형 구조)
| 제거 | 대체 |
|---|---|
| `recent_rally` | `oi_price_divergence_long` (OI 올랐는데 가격 flat) |
| `recent_decline` | `trading_range` (TR 진입 = selling climax 후) |
| `higher_lows_sequence` | `cvd_absorption` (taker buy 높은데 가격 flat) |

### Validation Plan (5 stage)

1. Look-ahead audit: truncate-replay invariance for 50+ blocks
2. Fire-rate: 30-symbol × 18mo, D-0322-4 envelope
3. In-sample Sharpe: walkforward 6 folds, ≥6/12 mean ≥0.30, t-stat ≥1.96
4. Multiple testing: BH FDR=0.10, ≥4/12 survive
5. Robustness: ±20% param perturbation, Sharpe_pert/base ≥0.5

---

## Decisions

### D-0322-1 — `higher_lows_sequence` 처리: deprecate + 단계적 교체
**Decision**: 5개 사용처를 `cvd_absorption + structural_higher_lows`로 치환. file 삭제 안 함 (legacy alias).

### D-0322-2 — Wyckoff entry: LPS (SOS 아님)
**Decision**: SOS는 추격 매수, LPS = first higher-low after SOS. LPS에서 진입. (Pruden 2007 §3)

### D-0322-3 — `bollinger_squeeze` adaptive
**Decision**: rolling 6-month 20th percentile, fallback fixed 4% for history <6mo.

### D-0322-4 — 패턴별 min/max signal count
| Pattern | min | max |
|---|---|---|
| wyckoff-spring | 1 | 8 |
| compression-breakout | 5 | 30 |
| volatility-squeeze | 2 | 15 |
| liquidity-sweep | 3 | 20 |
| whale-accumulation | 1 | 10 |
| tradoor-oi / oi-presurge / alpha-confluence | 0* | 5 |
| funding-flip-{long,short} | 1 | 8 |
| gap-fade-short | 1 | 12 |
| alpha-presurge | 1 | 10 |

### D-0322-5 — gap-fade-short 재정의: OI gap
**Decision**: `oi_gap_fade` (OI ≥+20% in 6h, price flat → OI 하락). CVD gap 거부 (venue classification 품질 < 90%).

### D-0322-6 — COMPRESSION_BREAKOUT entry_phase 버그
**Decision**: `library.py:585` `entry_phase="COILING"` → `"BREAKOUT"`. 첫 commit으로 분리.

---

## Implementation Plan

| Phase | 내용 | 일수 |
|---|---|---|
| 0 | Audit harness + baseline 기록 | 1d |
| 1 | CBR entry_phase 버그 수정 (단독 PR) | 0.5d |
| 2 | Structural blocks 신설 (trading_range, spring_breach, SOS, LPS) | 2d |
| 3 | Replacement blocks 신설 (bb_adaptive, cvd_absorption, oi_divergence, funding_z, range_break, oi_gap_fade) | 2d |
| 4 | 12 patterns phase graph 재구성 (pattern당 1 commit) | 3d |
| 5 | Legacy deprecation (3 blocks) | 1d |
| 6 | Validation (5 stage) | 2d |
| **Total** | | **11.5d** |

---

## Exit Criteria

- [ ] AC1: `test_library_lookahead.py` PASS — 50+ block truncate-replay invariance
- [ ] AC2: CBR `entry_phase="BREAKOUT"` + entry timestamp = BREAKOUT transition ±0 bars
- [ ] AC3: Signal count envelope PASS — wyckoff < 30/symbol (현재 256–1139)
- [ ] AC4: Sharpe ≥ 0.30, t-stat ≥ 1.96 for ≥6/12 patterns (walkforward)
- [ ] AC5: win_rate ≥ 0.50 for ≥8/12 patterns
- [ ] AC6: `cvd_absorption` fire rate < 15% on BTC/ETH (현재 `higher_lows_sequence` 52–57%)
- [ ] AC7: BH FDR=0.10 survival ≥4/12 patterns
- [ ] AC8: ±20% perturbation, Sharpe_pert/base ≥ 0.5
- [ ] AC9: W-0316 후 derivatives 6패턴 ≥1 sig/symbol on ≥7/30 symbols
- [ ] AC10: 기존 W-0290 65 tests GREEN (no regression)
- [ ] AC11: `experiment_log.jsonl` 12 patterns × {pre, post} = 24 entries

## Facts (실측)

```
higher_lows_sequence fire rate: 52–57% (BTC/ETH/APT, ~30K-51K bars)
wyckoff signals: 256-1139/symbol → 목표 ≤8
volume_dryup fire rate: 10-18% ✓
bollinger_squeeze fire rate: 23-61% → adaptive로 10-20% 목표
CBR entry_phase bug: library.py:585
```

## Canonical Files

```
engine/patterns/library.py:585                          # CBR bug
engine/building_blocks/confirmations/higher_lows_sequence.py  # deprecate
engine/building_blocks/triggers/recent_rally.py         # deprecate
engine/building_blocks/triggers/recent_decline.py       # downgrade to optional
engine/building_blocks/structural/                      # NEW DIR
engine/building_blocks/confirmations/bb_squeeze_adaptive.py
engine/building_blocks/confirmations/cvd_absorption.py
engine/research/pattern_scan/pattern_object_combos.py   # registry
engine/research/validation/w0322_lookahead_audit.py     # NEW
```
