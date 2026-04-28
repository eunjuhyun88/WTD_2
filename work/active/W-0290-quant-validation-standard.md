# W-0290 — 패턴 검증 파이프라인 퀀트 표준화

> Wave: MM Hunter | Priority: P1 | Effort: L
> Charter: In-Scope — L3 Pattern Object 검증 인프라 (CHARTER §In-Scope L3/L4)
> Status: 🟡 Design Draft v2 (설계 문서 통합 반영, 사용자 검토 대기)
> Created: 2026-04-29 by Agent A078
> Issue: #568
>
> **Source design docs (canonical):**
> - `docs/live/W-0214-quant-researcher-revision.md` — 공식 퀀트 개선 명세
> - `docs/design/14_MM_HUNTER_VALIDATION_DESIGN.md` — MM Hunter 아키텍처 설계

---

## Goal

53개 PatternObject의 "진짜 작동하는지" 여부를 퀀트 데스크 표준(7단계)으로 측정할 수 있게 한다.
구체적으로: **패턴별 보고서 1장** = `(n, labels 4종, cost-net edge, baselines B0-B5, stats, 5-regime, gates 8개, 4-level promotion verdict)`.

현재 코드의 핵심 구조 문제 3개 → 이 작업으로 해결.

---

## 핵심 구조 문제 — 설계 문서 기반 진단

### P0-Critical (즉시 수정)

**① phase entry proxy 문제** (`pipeline.py:367`)

현재 코드:
```python
timestamps.append(case.start_at)  # BenchmarkCase.start_at을 phase entry로 씀
```

설계 문서 명시 (`14_MM_HUNTER_VALIDATION_DESIGN.md §7`):
> No production report may rely only on BenchmarkCase.start_at.

수정: `entries.py` — 실제 phase transition ledger에서 `entered_at` 추출.
미수정 시: 검증 단위 자체가 오염 → 모든 통계 무효.

**② 라벨이 1종 (fixed horizon return)뿐**

현재: fixed horizon return만 계산.
설계 문서 명시 (`W-0214-quant-researcher-revision.md §3.2`):
```
return_exact_h   — 이벤트 스터디 클린 라벨
mfe_h            — 목표가 도달 가능했는지 (max favorable excursion)
mae_h            — 손절 위험 (max adverse excursion)
triple_barrier   — 실전 매매 결과 (TP/SL/timeout)
```
수정: `labels.py` — 4종 라벨 동시 계산.

**③ cost model이 magic constant**

현재: `cost_bps: float = 15.0` (하드코딩, 보고서에 기록 안 됨).
설계 문서 명시: "Promotion gates must run on net returns. Cost model must be versioned and present in every report."
수정: `costs.py` — `cost_model_id: "binance_perp_taker_15bps_v1"` 버전 객체.

### P1 (Phase 1 함께 수정)

**④ baselines B4/B5 없음**

현재: B0-B3만 구현 (`baselines.py`).
설계 문서 (`W-0214-quant-researcher-revision.md §5`):
- B4: shuffled phase path (sequence order 의미 있나?)
- B5: volatility-matched random (edge가 단순 high-vol beta 아닌가?)
B5 특히 중요: MM Hunter 패턴이 변동성 환경에서만 작동하는지 분리.

**⑤ regime이 3개 (bull/bear/range)뿐**

현재 `regime.py`: bull/bear/chop 3개.
설계 문서: `bull / bear / chop / high_vol / low_vol` 5개 필수.
high_vol/low_vol이 없으면 패턴이 "변동성 체제 의존"인지 모름.

**⑥ 4단계 프로모션 없음**

현재: 단일 pass/fail gate.
설계 문서: `catalog → research_candidate → validated → f60_publishable`.
각 단계별 조건이 다르며 UI에서 다르게 표시.

---

## 갭 분석 표 (최종)

| 모듈 | 설계 문서 요구 | 현재 상태 | 갭 |
|---|---|---|---|
| `entries.py` | phase transition에서 entered_at 추출 | ❌ 없음 — start_at proxy 사용 | **P0-Critical** |
| `labels.py` | 4종 (return / MFE / MAE / triple_barrier) | ❌ 없음 — fixed horizon 1종만 | **P0-Critical** |
| `costs.py` | 버전 객체 + cost_model_id | ❌ 없음 (15bps 하드코딩) | P0 |
| `data_hygiene.py` | look-ahead / survivorship / UTC / warmup | ❌ 없음 | P0 |
| `baselines.py` | B0-B5 (B4 shuffled, B5 vol-matched) | ⚠️ B0-B3만 | P1 |
| `regime.py` | bull/bear/chop/high_vol/low_vol 5개 | ⚠️ 3개 (bull/bear/chop) | P1 |
| `reporters.py` | per-pattern 1장 (4-level promotion verdict) | ❌ 없음 | P1 |
| `decay.py` | rolling 30/60/90d deprecation | ❌ 없음 | P2 |
| `cv.py` | PurgedKFold + embargo | ✅ 구현됨 | — |
| `stats.py` | Welch / BH-FDR / DSR / bootstrap CI | ✅ 구현됨 (Mann-Whitney 없음) | 소규모 추가 |
| `gates.py` | G1-G7 | ✅ 구현됨 (G8 data hygiene 없음) | 소규모 추가 |
| `pipeline.py` | 7단계 오케스트레이션 | ⚠️ start_at proxy + labels 1종 | Phase 1 wiring |
| `walkforward.py` | 6mo walk-forward | ❌ 없음 | Phase 2 |
| `robustness.py` | 시간·심볼(cap group)·변동성 분할 | ❌ 없음 | Phase 2 |
| `multiple_testing.py` | preregistry + 계층적 BH-FDR | ❌ 없음 | Phase 3 |

---

## Scope

### Phase 1 (1주차) — "패턴이 진짜로 무작위 대비 유의한가"

Phase 1 단일 목표: **p0-critical 수정 + 보고서 1장 생성 + go/no-go 판정**.

포함:
- `entries.py` (신규, ~150줄) — Phase entry extraction from ledger/state transitions
- `labels.py` (신규, ~200줄) — 4종 라벨 (return_exact_h, MFE, MAE, triple_barrier)
- `costs.py` (신규, ~120줄) — versioned cost model (3-tier + funding policy)
- `data_hygiene.py` (신규, ~150줄) — look-ahead / survivorship / UTC / warmup
- `baselines.py` 수정 — B4 (shuffled) + B5 (vol-matched) 추가
- `regime.py` 수정 — high_vol / low_vol 추가 → 5개
- `reporters.py` (신규, ~250줄) — per-pattern 1장 보고서 + 4-level promotion verdict
- `stats.py` 수정 — Mann-Whitney U 추가, median_net_bps / payoff_ratio / mfe_mae_ratio
- `gates.py` 수정 — G8 data hygiene gate 추가
- `pipeline.py` 수정 — entries.py / labels.py / costs.py 연결
- 테스트: test_entries.py, test_labels.py, test_costs.py, test_data_hygiene.py, test_reporters.py

### Phase 2 (2~3주차) — 강건성

- `walkforward.py` — 6mo walk-forward simulation
- `robustness.py` — 시간·심볼(cap group)·변동성 4축 분할
- `decay.py` — rolling 30/60/90d deprecation monitor

### Phase 3 (3~4주차) — 사전 등록

- `multiple_testing.py` — preregistry YAML + 계층적 BH-FDR (~20K 검정 추적)

---

## Non-Goals

- `engine/research/pattern_search.py` 수정 — augment-only 정책 (W-0252 §5.0)
- 실시간 스트리밍 검증 (배치 연구용만)
- HTTP API 노출 (연구 모듈 내부 전용)
- Copy trading, leaderboard — CHARTER §Frozen

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| entries.py가 실제 phase transition ledger와 미연결 (ledger 아직 sparse) | 고 | 고 | fallback: start_at proxy 유지 + entries.py 플래그 `use_ledger=False` → Phase 1에서 Q-05로 결정 |
| labels.py의 MFE/MAE 계산에 가격 데이터 gap | 중 | 중 | OHLCV bar-level approximation 명시 (실제 tick 없음) |
| baselines.py B5 vol-matched 구현 복잡도 | 중 | 저 | Phase 1에서 B4만 추가, B5는 Phase 2로 이동 가능 |
| regime.py high_vol/low_vol 기준 BTC perp realized vol percentile 계산 비용 | 저 | 저 | rolling 30d std → percentile, 캐시 가능 |

### Dependencies

- 선행: W-0286 (8-axis quant hardening) ✅ 완료 (PR #560)
- 선행: W-0284 (GateV2DecisionStore) — Phase 2 decay 결과 저장 시 필요
- **entries.py**: `engine/ledger/` + `engine/patterns/supabase_state_sync.py` 구조 확인 필요 (Q-05)

### Rollback Plan

- entries.py, labels.py, costs.py, reporters.py 모두 독립 신규 파일
- baselines.py / regime.py / stats.py 수정은 기존 함수 시그니처 유지 (append-only)
- pipeline.py는 `label_mode` / `use_ledger` 파라미터로 기존 동작 보존 가능

### Files Touched (Phase 1)

| 파일 | 상태 | 주요 변경 |
|---|---|---|
| `engine/research/validation/entries.py` | 신규 | PhaseEntryEvent 추출 from ledger / fallback to start_at |
| `engine/research/validation/labels.py` | 신규 | ReturnLabel(return_exact_h, mfe_bps, mae_bps, triple_barrier) |
| `engine/research/validation/costs.py` | 신규 | CostModel + cost_model_id versioning |
| `engine/research/validation/data_hygiene.py` | 신규 | HygieneCheckResult (look-ahead, survivorship, UTC, warmup) |
| `engine/research/validation/reporters.py` | 신규 | PatternValidationReport + 4-level promotion verdict |
| `engine/research/validation/baselines.py` | 수정 | B4(shuffled) + B5(vol-matched) 추가 |
| `engine/research/validation/regime.py` | 수정 | high_vol / low_vol 추가 → 5 labels |
| `engine/research/validation/stats.py` | 수정 | mann_whitney_u(), median_net_bps, payoff_ratio, mfe_mae_ratio |
| `engine/research/validation/gates.py` | 수정 | G8 data hygiene gate |
| `engine/research/validation/pipeline.py` | 수정 | entries.py / labels.py / costs.py 파라미터 연결 |
| `engine/research/validation/test_entries.py` | 신규 | |
| `engine/research/validation/test_labels.py` | 신규 | |
| `engine/research/validation/test_costs.py` | 신규 | |
| `engine/research/validation/test_data_hygiene.py` | 신규 | |
| `engine/research/validation/test_reporters.py` | 신규 | |

---

## AI Researcher 관점

### 단계 1 — entries.py (Phase Entry Extraction)

설계 문서 정의 (`14_MM_HUNTER_VALIDATION_DESIGN.md §5 R1`):

```python
@dataclass
class PhaseEntryEvent:
    id: str
    pattern_slug: str
    pattern_version: str
    symbol: str
    timeframe: str
    taxonomy_id: str
    phase_name: str
    phase_index: int
    entered_at: datetime       # phase transition timestamp — NOT start_at
    detected_at: datetime
    entry_price: float         # executable next-open or next-mid after entered_at
    side: Literal["long", "short"]
    feature_snapshot: dict
    regime_label: str | None
    source_run_id: str | None

def extract_phase_entries(
    pattern_slug: str,
    use_ledger: bool = False,    # True: ledger에서 추출, False: start_at fallback
    symbol: str | None = None,
    since: datetime | None = None,
) -> list[PhaseEntryEvent]: ...
```

**핵심**: `entry_price`는 `entered_at` 이후 다음 봉 시가 (open). 같은 봉 종가 아님.

### 단계 2 — labels.py (4종 라벨)

설계 문서 정의 (`W-0214-quant-researcher-revision.md §3.2`):

```python
@dataclass
class ReturnLabel:
    horizon_hours: int
    return_exact_h_bps_raw: float      # gross
    return_exact_h_bps_net: float      # net of cost + funding
    mfe_bps: float                     # max favorable excursion
    mae_bps: float                     # max adverse excursion
    triple_barrier_outcome: Literal["profit_take", "stop_loss", "timeout"]
    time_to_mfe_bars: int | None

def label_entry(
    price_series: pd.Series,
    entry_idx: int,
    horizon_hours: int,
    cost_model: "CostModel",
    side: Literal["long", "short"],
    triple_barrier_config: TripleBarrierConfig | None = None,
) -> ReturnLabel: ...
```

net return 계산:
```
long:  return_net_bps = 10000 × (exit - entry) / entry - cost_bps - funding_bps
short: return_net_bps = 10000 × (entry - exit) / entry - cost_bps - funding_bps
funding_bps: 0 for 1h/4h, required for 24h/72h
```

### 단계 3 — costs.py (Versioned Cost Model)

설계 문서 요구 (`W-0214-quant-researcher-revision.md §4`):

```python
@dataclass
class CostModel:
    cost_model_id: str = "binance_perp_taker_15bps_v1"
    taker_roundtrip_bps: float = 10.0   # 5bps × 2
    slippage_bps: float = 5.0           # BTC/ETH depth 기반
    funding_policy: Literal["exclude", "include_24h_plus"] = "include_24h_plus"
    borrow_bps: float = 0.0             # perp — 무관

    def round_trip_bps(self, symbol: str, horizon_hours: int) -> float: ...
    def net_edge_threshold_bps(self) -> float:
        """2× cost threshold (mean이 cost 위이면 분산으로 손실 50%)"""
        return 2.0 * (self.taker_roundtrip_bps + self.slippage_bps)

BINANCE_PERP_TAKER_15BPS_V1 = CostModel()
BINANCE_PERP_ALT_45BPS_V1 = CostModel(
    cost_model_id="binance_perp_alt_45bps_v1",
    slippage_bps=30.0,
)
```

### 단계 4 — data_hygiene.py

```python
@dataclass
class HygieneCheckResult:
    look_ahead_ok: bool
    survivorship_flag: bool   # corpus에 상장폐지 포함 여부 (없으면 True = WARNING)
    timezone_ok: bool
    warmup_ok: bool
    overall_pass: bool
    violations: list[str]

def check_data_hygiene(
    signal_timestamps: pd.DatetimeIndex,
    entry_timestamps: pd.DatetimeIndex,
    bar_size_hours: int = 4,
    warmup_bars: int = 42,     # 7일 × 6봉 for 4h
    strict: bool = False,      # True: FAIL = exception, False = warning
) -> HygieneCheckResult: ...
```

### 산출물 — reporters.py 보고서 포맷

```
Pattern: {pattern_slug} v{version}
Cost model: {cost_model_id}
──────────────────────────────────────────────────────────────
Data hygiene         {PASS/WARN/FAIL}
  look-ahead         {ok}  survivorship  {ok/WARN}
  UTC timezone       {ok}  warmup        {ok}

Sample              n = {n_entries} phase-entry events
  Source            {ledger/benchmark_proxy}  ← entries.py 소스 표기
  Holdout period    {date_from} ~ {date_to}
──────────────────────────────────────────────────────────────
Label = fixed {horizon}h (primary event study)
  mean net           {mean_net:+.1f} bps
  median net         {median_net:+.1f} bps
  hit rate           {hit_rate:.0%}
  payoff ratio       {payoff:.2f}
  MFE / MAE          {mfe:+.1f} / {mae:+.1f} bps
  vs B0 random:      t = {t_b0:.2f}, p = {p_b0:.4f}, BH q = {q_b0:.4f}
  vs B1 hold:        t = {t_b1:.2f}
  vs B2 phase-zero:  t = {t_b2:.2f}
  Bootstrap CI       [{ci_lo:+.1f}, {ci_hi:+.1f}] bps  Mann-Whitney p = {mw_p:.4f}

Label = triple barrier ({pt_mult}σ / -{sl_mult}σ / {horizon}h)
  TP rate            {tp:.0%}   SL rate  {sl:.0%}   timeout  {to:.0%}
  expected value     {ev_tb:+.1f} bps

Net edge ({cost_model_id})    {net_edge:+.1f} bps   threshold = {threshold:+.1f} bps   {PASS/FAIL}
──────────────────────────────────────────────────────────────
Regime (5-label)
  bull   n={n_bull}  mean={m_bull:+.1f} bps  t={t_bull:.1f}
  bear   n={n_bear}  mean={m_bear:+.1f} bps  t={t_bear:.1f}
  chop   n={n_chop}  mean={m_chop:+.1f} bps  t={t_chop:.1f}
  high_vol n={n_hv}  mean={m_hv:+.1f} bps    t={t_hv:.1f}
  low_vol  n={n_lv}  mean={m_lv:+.1f} bps    t={t_lv:.1f}
[Phase 2: Time · Symbol · Volatility splits]
[Phase 2: Walk-forward 6mo cumulative net edge]
──────────────────────────────────────────────────────────────
BH-FDR (family)     adjusted q = {bh_q:.4f}  {PASS/FAIL}
Deflated Sharpe     DSR = {dsr:.3f}  {PASS/FAIL}

Gates               {pass_count}/{total} PASS
  G1 t ≥ 2.0 vs B0         {g1}
  G2 DSR > 0                {g2}
  G3 hit_rate ≥ 0.55        {g3}
  G4 bootstrap CI_lo > 0    {g4}
  G5 profit_factor ≥ 1.2    {g5}
  G6 4/5 CV folds positive  {g6}
  G7 regime (bull/bear OK)  {g7}
  G8 data hygiene PASS      {g8}
──────────────────────────────────────────────────────────────
Promotion level: {catalog|research_candidate|validated|f60_publishable}

  catalog:            schema valid + replay OK                ← 현재
  research_candidate: n≥30 dev, mean_net>0, B0 beaten        ← 이 보고서 목표
  validated:          n≥30 holdout, 4/5 CV, B1+B2 beaten     ← Phase 2 이후
  f60_publishable:    validated + decay OK + live events      ← Phase 2+

Verdict: {production_eligible}  reason: {reason}
```

### Statistical Validation Plan

1. **Phase 1 go/no-go**: 5개 P0 패턴 실측
   - G1+G2+G8 동시 통과 패턴 **0개이면 STOP** → 데이터/구조 재점검
   - 1개 이상 통과 → Phase 2 진행
2. 판정 우선순위: `mean_net_bps` > bootstrap CI > DSR (annualized Sharpe는 secondary)

---

## Decisions

| ID | 결정 | 선택 | 거절 |
|---|---|---|---|
| D-01 | Work item 번호 | **W-0290** | W-0287 (A076이 BH FDR P2로 예약) |
| D-02 | Phase 1 scope | entries + labels + costs + hygiene + reporters | walkforward/robustness (go 판정 후) |
| D-03 | entries.py fallback | `use_ledger=False` → start_at proxy 유지 | 즉시 ledger 강제 (ledger sparse → n=0 위험) |
| D-04 | labels.py | augment-only — `label_mode` 파라미터, 기존 pipeline 보존 | fixed horizon 제거 (기존 V-track 테스트 전면 수정) |
| D-05 | costs.py | 3-tier versioned object (15/45bps), net threshold = 2× | 1× cost (mean=cost → 분산으로 손실 50%) |
| D-06 | B5 baseline | Phase 1에서 B4만 추가, B5는 Phase 2 | B5 즉시 (vol-bucket 매칭 복잡도) |
| D-07 | reporters.py | 신규 파일, acceptance_report.py 미수정 | acceptance_report.py 재사용 (목적 다름 — V-track 통합 테스트) |

---

## Open Questions (사용자 결정 필요)

| # | 질문 | 영향 | 제안 |
|---|---|---|---|
| Q-01 | 현재 corpus에 상장폐지 코인 포함 여부? | survivorship bias → G8 FAIL vs WARNING | D1에 `find engine/data_cache -name "*.py" | xargs grep -l "delist\|deprecated"` 확인 |
| Q-02 | 현재 진입 시점: 봉 t 종가 진입인지 봉 t+1 시가 진입인지? | look-ahead bias 유무 | pipeline.py:_extract_entry_timestamps 실측 |
| Q-03 | G8 hygiene FAIL 시: pipeline 중단 vs warning? | 기본 제안: `strict=False` (warning 모드) | — |
| Q-04 | Phase 1 P0 5개 패턴 선정 기준? | n 충분성 우선 vs OI Reversal 우선 | 진입 횟수 많은 순 5개 제안 |
| Q-05 | entries.py: ledger에서 phase transition 추출 가능한가? | 가능하면 start_at proxy 즉시 교체 | `engine/ledger/` + `engine/patterns/supabase_state_sync.py` 실측 필요 |

---

## Implementation Plan

### Phase 1 (D1~D5)

| 일 | 작업 | 출력물 |
|---|---|---|
| D1 | entries.py + test_entries.py + Q-02/Q-05 실측 | PhaseEntryEvent 추출 동작 |
| D2 | labels.py (4종) + test_labels.py + data_hygiene.py | ReturnLabel (return/MFE/MAE/triple_barrier) |
| D3 | costs.py + baselines B4 + regime high_vol/low_vol + stats Mann-Whitney | CostModel versioned, 5-label regime |
| D4 | reporters.py + gates G8 + pipeline.py 연결 | PatternValidationReport 1장 |
| D5 | 5개 P0 패턴 실측 + 보고서 생성 + go/no-go 판정 | 보고서 5장 |

### Phase 2 (D6~D15)

| 작업 | 모듈 |
|---|---|
| Walk-forward 6mo | walkforward.py |
| 시간·심볼·변동성 4축 분할 | robustness.py |
| B5 volatility-matched baseline | baselines.py 수정 |
| Pattern decay monitor | decay.py (rolling 30/60/90d) |

### Phase 3 (D16+)

| 작업 | 모듈 |
|---|---|
| Preregistry YAML + 계층적 BH-FDR | multiple_testing.py |
| 53개 전체 배치 실행 | runner.py 연동 |

---

## Exit Criteria

### Phase 1

- [ ] `entries.py`: Q-05 실측 결과 반영, `use_ledger=False` fallback 포함, pytest green
- [ ] `labels.py`: 4종 라벨 동시 출력 (return / MFE / MAE / triple_barrier), pytest green
- [ ] `costs.py`: `CostModel.cost_model_id` 포함, net_edge_threshold = 2× cost, pytest green
- [ ] `data_hygiene.py`: look-ahead / survivorship / UTC / warmup, `strict=False` 기본, pytest green
- [ ] `baselines.py`: B4 shuffled path 추가, pytest green
- [ ] `regime.py`: high_vol / low_vol 추가 → 5 labels, pytest green
- [ ] `stats.py`: mann_whitney_u() + median_net_bps + payoff_ratio + mfe_mae_ratio, 기존 테스트 green
- [ ] `gates.py`: G8 data hygiene gate, 기존 테스트 green
- [ ] `reporters.py`: PatternValidationReport — 위 보고서 포맷 기준, pytest green
- [ ] 5개 P0 패턴 보고서 1장 생성 (n ≥ 30 확인)
- [ ] 기존 CI 전체 green (test_pipeline, test_cv, test_stats, test_gates, test_regime 모두)
- [ ] PR merged + CURRENT.md SHA 업데이트

### Phase 2

- [ ] `walkforward.py`: 1개 패턴 6mo walk-forward cumulative net edge 출력
- [ ] `robustness.py`: 시간·심볼·변동성 3축 결과 reporters.py 통합
- [ ] `decay.py`: rolling 30/60/90d 작동, deprecated 트리거 1회 확인

---

## References

- `docs/live/W-0214-quant-researcher-revision.md` — **공식 퀀트 개선 명세** (P0 gaps §12)
- `docs/design/14_MM_HUNTER_VALIDATION_DESIGN.md` — **MM Hunter 아키텍처** (PhaseEntryEvent, ReturnLabel)
- `work/completed/W-0214-mm-hunter-core-theory-and-validation.md` v1.3 — D1~D8 결정
- `engine/research/validation/cv.py` — PurgedKFold (재사용)
- `engine/research/validation/stats.py` — Welch/BH/DSR/bootstrap (재사용)
- `engine/research/validation/pipeline.py:367` — start_at proxy (수정 대상)
- López de Prado (2018) *Advances in Financial ML* Ch3 (triple barrier), Ch7 (Purged K-Fold)
- Harvey, Liu (2015) — Deflated Sharpe, multiple testing
