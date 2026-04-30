# W-0340 — Pattern Research Operating System (PROS)

> Wave: 5 | Priority: P0 | Effort: XL (4주, 4 Phase)
> Issue: #714
> Status: 🟡 Design Draft
> Created: 2026-04-30

---

## Goal

트레이더가 발견한 패턴("세력 숏 누르기 → OI dump → 축적 → 롱 스위칭")을 기계가 전체 시장에서
추적·검증·승격하는 Research-to-Signal Compiler.

현재 12개 패턴 중 10개가 0 signal — 이 시스템이 완성되면 패턴이 생기고, 데이터가 쌓이고, 유저 피드백으로 보정된다.

---

## 정체성

> 이 시스템은 "지표 몇 개 더 붙인 스캐너"가 아니다.
> 트레이더의 감각을 패턴 객체로 저장하고, 상태기계로 시장 전체에서 추적하고,
> ledger로 검증하고, 피드백으로 보정하는 순환 엔진이다.

**최종 정의**:
A human-in-the-loop pattern discovery, state-tracking, and validation engine
that compiles trader intuition into machine-searchable, machine-verifiable,
and eventually on-chain-executable signals.

**Cogochi Protocol과의 관계**: W-0340은 L0/L1 아래의 Research-to-Signal Compiler.
검증 통과한 패턴만 marketplace/vault로 흘려보낸다.

---

## 7-Layer Architecture

```
L1  Market Data Plane     — 가격/OI/펀딩/CVD/온체인/차트이미지
L2  Feature Plane         — 정량 피처 + z-score primitives
L3  Pattern Object Plane  — thesis + features + annotations + labels + outcome
L4  State Machine Plane   — phase 전이 추적 (FAKE_DUMP→REAL_DUMP→BREAKOUT)
L5  Search/Research Plane — 유사 패턴 검색, near-miss, variant generation
L6  Result Ledger Plane   — 성과 검증, expectancy, regime-conditioned stats
L7  Human/AI Refinement   — 유저 판정 → threshold 보정 → 다음 cycle 반영
```

**Development 순서**: L1→L2 (Phase 1) → L3/L4 (Phase 2) → L5/L6 (Phase 3) → L7 (Phase 4)

**왜 단순 ML이면 안 되나**:
1. 이런 패턴은 phase order가 중요하다 — 모델은 FAKE_DUMP / REAL_DUMP를 혼동함
2. 설명 가능성이 필요 — 유저가 "왜 accumulation으로 봤는지" 알아야 refinement 가능
3. 학습 데이터가 처음엔 적다 — rule+state machine+ledger로 시작, ML은 나중

구조:
- 1차: rules + states + ledger (W-0340 Phase 1~2)
- 2차: sequence search (Phase 3)
- 3차: ML ranking (Phase 3+)
- 4차: LLM chart interpretation (Wave 6)
- 5차: feedback-driven fine-tuning (Wave 6+)

---

## Scope

### Phase 1 — z-score Calibration (L2 fix, ~1.5d)

*현재 0 signal 문제의 근본 원인 수정. 이것 없이는 나머지 Layer에 데이터가 없다.*

**진단된 문제 3개**:
1. `oi_spike_with_dump` 8% 절댓값 → BTC 99.5th pct = 3.05%, ARKUSDT >8% = 7/22371 bars
2. `funding_extreme` 10bps 절댓값 → FAKE_DUMP same-bar AND 공동발화 0.009%
3. `_DERIVATIVES_BLOCKED` 하드코딩 10개 패턴 → 데이터 있어도 항상 blocked 표시

**파일**:
- `engine/scanner/feature_calc.py` — z-score 5개 컬럼 추가
  - `oi_change_1h_zscore`, `oi_change_24h_zscore`
  - `vol_velocity_zscore`, `funding_change_zscore`, `cvd_change_zscore`
- `engine/building_blocks/confirmations/oi_spike_with_dump.py`
  - 8% abs → `oi_change_1h_zscore ≥ 2.5` OR `oi_change_1h ≥ 0.05`
- `engine/building_blocks/confirmations/funding_extreme.py`
  - 10bps abs → `funding_rate_zscore ≥ 2.0` OR `funding_rate ≥ 0.0005`
- `engine/patterns/library.py`
  - FAKE_DUMP: `co_occurrence_window_bars=6` (same-bar AND → 6h window)
  - OI_PRESURGE SOCIAL_IGNITION: kol_signal(영구오프라인) → OFI + vol_velocity_zscore fallback
- `engine/patterns/state_machine.py`
  - `PhaseCondition.co_occurrence_window_bars: int = 1` 필드 추가
- `engine/research/report.py`
  - `_DERIVATIVES_BLOCKED` 하드코딩 제거 → cycle 결과에서 동적 계산

**논문 근거**:
- `.shift(1)` enforced everywhere — López de Prado (2018) 룩어헤드 방지
- rolling 90d + EWMA half-life 14d — Schmeling, Schrimpf, Todorov (2023) BIS WP 1064
- z-primary OR abs fallback — Park, Hahn, Lee (2023) BTC/ETH aggregate z>3 기준
- windowed co-occurrence 6h — Cont, Kukanov, Stoikov (2014) microstructure cascade
- deflated Sharpe — Bailey & López de Prado (2014)

**Tier-1 블록 (Phase 1 대상, 8개)**:

| 블록 | 패턴 | 문제 | Phase 1 수정 |
|---|---|---|---|
| `oi_spike_with_dump` | TRADOOR REAL_DUMP | 8% abs | z-score OR |
| `funding_extreme` | TRADOOR FAKE_DUMP | 10bps abs | z-score OR |
| `funding_extreme_short` | FUNDING_FLIP SHORT_OVERHEAT | 동일 | z-score OR |
| `funding_flip` | FUNDING_FLIP FLIP_SIGNAL | 확인 필요 | 임계값 검증 |
| `oi_price_lag_detect` | OI_PRESURGE QUIET_ACCUM | 임계값 | 검증 |
| `oi_price_lag_detect_strong` | OI_PRESURGE SOCIAL fallback | 유일 가동 경로 | 임계값 검증 |
| `relative_velocity_bull` | OI_PRESURGE SOCIAL fallback | 유일 가동 경로 | 확인 |
| (social blocks) | OI_PRESURGE SOCIAL group-1 | 영구 오프라인 | OFI 대체 |

---

### Phase 2 — Pattern Object Store (L3, ~2d)

*패턴이 thesis + features + annotations + labels + outcome을 갖는 1급 객체가 된다.*

**PatternObject 스키마 확장**:
```python
{
  "pattern_family": "tradoor_ptb_oi_reversal",
  "thesis": [
    "첫 dump는 경고 구간 (숏펀비 + 작은 OI)",
    "두 번째 dump + OI 급등이 핵심 이벤트",
    "15m higher lows가 진입 구간",
    "OI 재확장 시 breakout 확정"
  ],
  "raw_features": {...},           # 발화 당시 feature snapshot
  "phase_annotations": [...],      # 각 phase 전이 시각 + 근거 블록 목록
  "chart_images": [...],           # bar range 스냅샷 (Supabase Storage)
  "user_labels": [                 # 유저 판정 히스토리
    {"ts": "...", "label": "valid", "note": "OI spike 확실"},
    {"ts": "...", "label": "too_early", "note": "arch_zone 미완성"}
  ],
  "outcome": {
    "hit": True,
    "pnl_pct": 47.3,
    "bars_to_target": 18,
    "stop_hit": False,
    "regime": "bull"
  }
}
```

**파일**:
- `engine/patterns/types.py` — PatternObject 필드 확장 (thesis, phase_annotations, user_labels, outcome)
- `engine/research/ledger.py` — 신규: cycle 결과 + outcome 저장소
- `engine/experiments/pipeline/` — parquet schema 확장 (version field 추가)

---

### Phase 3 — Research Loop (L5/L6, ~2d)

*발화 패턴을 모아 통계적으로 검증. 현재 BH-FDR은 있지만 deflated Sharpe, near-miss, sequence similarity가 없다.*

**파일**:
- `engine/research/validation/stats.py` — `deflated_sharpe()` (Bailey-LdP 2014)
- `engine/research/validation/sequence.py` — phase sequence similarity (DTW or edit distance)
- `engine/pipeline.py` — Stage 3에 deflated Sharpe + near-miss clustering 추가
- cross-sectional rank normalization (Liu, Tsyvinski, Wu 2022 RFS) — alt vs BTC baseline 보정

**기능**:
- positive case 자동 수집
- near-miss 분류 (phase 2까지만 진행한 case)
- failure clustering
- threshold suggestion 자동 생성

---

### Phase 4 — Human/AI Refinement Loop (L7, ~3d)

*유저 판정이 다음 cycle의 threshold에 반영. 가장 중요한 해자.*

**파일**:
- `app/src/` — Save Setup → PatternObject + label + chart snapshot 저장
- `engine/research/refinement.py` — 신규: label 집계 → threshold suggestion
- `app/api/` — `POST /pattern-feedback` endpoint

**Save Setup 동작 변경**:
- 현재: UI 메모 저장
- Phase 4 후: pattern object + label + chart snapshot + feature snapshot → training data 생산

---

## Non-Goals (Phase 1~3 범위)

- LLM chart interpretation (Phase 5 이후, Wave 6)
- On-chain signal execution (Cogochi L1 → Wave 6+)
- Multi-user label aggregation (Phase 4 완성 후)
- Real-time streaming (batch pipeline 먼저)
- ORPO/DPO fine-tuning (GPU 필요, Frozen)

---

## Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| z-score false positive 폭증 | High | High | BH-FDR + deflated Sharpe + walkforward |
| 룩어헤드 `.shift(1)` 누락 | High | Critical | Phase 1 CI grep + leak unit test |
| Phase 1 회귀 (101 블록 영향) | Med | High | Tier-1 8블록만 Phase 1, Tier-2+ 이후 |
| PatternObject schema migration | Med | Med | parquet backward-compat + version field |
| OI_PRESURGE social 대체 부정확 | Med | Med | OFI 대체 효과 Cycle 7에서 검증 |

---

## CTO 결정

- **D-340-01**: Phase 1 먼저 독립 PR — 회귀 bisect 단순화, Phase 2+ rollback 깨끗
- **D-340-02**: z-primary OR abs fallback — 신규 심볼 cold-start 0-signal 방지
- **D-340-03**: rolling 90d + EWMA half-life 14d — carry signal stability (Schmeling 2023)
- **D-340-04**: `co_occurrence_window_bars=6` — same-bar AND 0.009% → ~5% 추정
- **D-340-05**: PatternObject = immutable result + mutable label 분리 — label 변경이 결과 오염 방지

---

## Exit Criteria

### Phase 1 (z-score Calibration)
- [ ] **AC1**: Tier-1 패턴 ≥1 signal/symbol on **≥30/571** symbols (현재 10/12 패턴이 0/571)
- [ ] **AC2**: walk-forward Sharpe ≥ **0.30**, hit_rate ≥ **0.55**, BH-FDR α=0.05 통과 ≥1 패턴
- [ ] **AC3**: deflated Sharpe ≥ **0.10** (Bailey-LdP 2014)
- [ ] **AC4**: z-score primitive 전체에 leak detection unit test PASS (`.shift(1)` enforced)
- [ ] **AC5**: 1829+ 기존 테스트 green
- [ ] **AC6**: `_DERIVATIVES_BLOCKED` 하드코딩 제거 + dynamic snapshot test

### Phase 2 (Pattern Object Store)
- [ ] **AC7**: 10 cycle 이상 누적 후 PatternObject에 phase_annotations 자동 저장
- [ ] **AC8**: outcome(hit/pnl_pct) 자동 계산 + ledger parquet 저장

### Phase 3 (Research Loop)
- [ ] **AC9**: deflated Sharpe ≥ 0.10 on ≥1 패턴, Cycle 7+에서
- [ ] **AC10**: near-miss rate < 50% (false trigger 비율)

---

## AI Researcher 리스크

- **훈련 데이터 영향**: user_labels가 쌓이기 전까지 threshold는 heuristic — Phase 4 이전에는 ML 승격 금지
- **통계 유효성**: BH-FDR m=2 (현재)에서는 threshold tight (p*(1/2)*0.05=0.025) → 500+ 심볼 필요
- **regime bias**: 2024-2026 bull market 데이터만 있음 → bear regime 성과 미검증

---

## Open Questions

- [ ] **Q-340-01**: cross-sectional rank Phase 1 포함? (+1d effort, Liu-Tsyvinski-Wu 2022 핵심 — alt vs BTC baseline 보정)
- [ ] **Q-340-02**: PatternObject chart_images — S3 직접 vs Supabase Storage?
- [ ] **Q-340-03**: Phase 4 (Human Refinement) — Wave 5 안에? 아니면 Wave 6?
- [ ] **Q-340-04**: deflated Sharpe 위치 — `multiple_testing.py` 확장 vs `stats.py` 신규?
- [ ] **Q-340-05**: `co_occurrence_window_bars` semantic — rolling window vs sliding?

---

## Implementation Plan

1. **Phase 1-A**: `feature_calc.py`에 z-score 5 컬럼 추가 + `.shift(1)` + leak unit test
2. **Phase 1-B**: Tier-1 8 블록 z-score 마이그레이션 (oi_spike_with_dump, funding_extreme 우선)
3. **Phase 1-C**: `state_machine.py` `co_occurrence_window_bars` 필드 + library.py FAKE_DUMP/OI_PRESURGE 패치
4. **Phase 1-D**: `report.py` `_DERIVATIVES_BLOCKED` 동적화
5. **Phase 1 PR**: Cycle 7 돌려서 AC1~AC6 검증
6. **Phase 2**: PatternObject 스키마 + ledger.py 신규
7. **Phase 3**: deflated Sharpe + sequence similarity
8. **Phase 4**: Save Setup → data production pipeline
