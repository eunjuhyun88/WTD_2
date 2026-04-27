# W-0215 — pattern_search.py Audit (V-00)

**Owner:** research
**Status:** Ready (pending W-0214 PR #396 merge)
**Type:** Read-only code audit
**Depends on:** W-0214 v1.3 LOCKED-IN
**Estimated effort:** 1 day (S)

---

## Goal

`engine/research/pattern_search.py` (3283줄)을 read-only로 audit하여 함수 시그니처 inventory를 작성하고, W-0214의 `engine/research/validation/` 모듈에서 wrapping 가능한 함수 매핑 표를 만든다. W-0214 §14 Appendix B를 채운다. 재구현 금지(augment-only) 정책 enforce.

## Owner

research

## Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/pattern_search.py` | **read-only** | 3283줄 audit, 변경 X |
| `work/active/W-0214-mm-hunter-core-theory-and-validation.md` | edit (§14 Appendix B) | 함수 inventory 통합 |
| `memory/decisions/dec-2026-04-XX-pattern-search-augment-policy.md` | new | augment-only 정책 결정 record (선택) |

## Non-Goals

- ❌ `pattern_search.py` 코드 변경 (read-only)
- ❌ 새 `engine/research/validation/` 모듈 파일 생성 (W-0216으로 분리)
- ❌ 함수 redesign 제안 (audit only, 평가 X)
- ❌ Hypothesis test 함수 재구현 (augment-only 위반)
- ❌ 다른 engine/research/ 파일 audit (이번엔 pattern_search.py만)

## Exit Criteria

```
[ ] engine/research/pattern_search.py 3283줄 전체 read 완료
[ ] 함수별 시그니처 inventory markdown 표 작성 (이름 / 파라미터 / 반환 타입 / 라인 번호)
[ ] validation 매핑 표 작성: 4 metrics (M1~M4)별로 wrapping 가능한 함수 식별
[ ] BenchmarkPack class와 W-0214 §3.3 baselines 4종 매핑
[ ] 재구현 금지 리스트 — 이미 존재하는 hypothesis test / variant evaluation / MTF search 함수
[ ] W-0214 §14 Appendix B에 위 결과 통합 (단일 commit)
[ ] PR 작성 + reviewer가 augment-only 정책 위반 없는지 확인
```

## Facts

- **F1** [factual]: W-0220 PRD §4 L5는 `engine/research/pattern_search.py:3283줄 — 벤치마크 팩, 변형 평가, MTF 검색, 가설 테스트` 명시
- **F2** [factual]: W-0214 §5.0은 augment-only 정책 lock-in. 재구현 금지
- **F3** [factual]: W-0214 §1.5 WVPL chain은 검증된 패턴이 search corpus에 포함되는 메커니즘 명시 (validation framework가 corpus filter를 갱신)
- **F4** [factual]: W-0220 PRD §4 L7는 Phase A+B AutoResearch (Hill Climbing + LightGBM) 이미 BUILT 명시. validation framework는 이와 통합

## Assumptions

- **A1** [assumption]: `engine/research/pattern_search.py` 파일이 실재하며 python 3.x로 readable. 검증 가능.
- **A2** [assumption]: 다른 agent가 동일 파일을 동시 수정하지 않음. **lock 권장**.
- **A3** [assumption]: 함수 docstring 또는 type hints 일부 존재. 시그니처 추출 가능.
- **A4** [speculation]: hypothesis_test, BenchmarkPack, variant_evaluation, mtf_search 함수가 명확히 분리되어 있음. 실제 audit에서 mixed 또는 missing 가능성 있음.

## Open Questions

- **Q1**: `pattern_search.py`가 internal helper 함수와 public API를 어떻게 구분? `__all__` 또는 underscore prefix?
- **Q2**: BenchmarkPack class가 이미 baseline 개념을 가지고 있나? B0~B3와 직접 매핑 가능?
- **Q3**: hypothesis_test 함수가 multiple comparison correction (BH/FDR) 또는 DSR을 이미 구현했나? 안 했으면 W-0214 §3.5 stats.py에서 추가

## Decisions

(현재 [unknown]. Audit 완료 시 다음 채움)
- D-V00-1: pattern_search.py의 hypothesis_test wrapping 방식
- D-V00-2: BenchmarkPack vs validation/baselines.py 통합 또는 분리
- D-V00-3: variant_evaluation을 W-0214 §3.8 decay monitoring과 연결 가능 여부

## Canonical Files

```
engine/research/pattern_search.py        (read-only)
work/active/W-0214-mm-hunter-core-theory-and-validation.md  (§14 Appendix B 추가)
work/active/CURRENT.md                   (W-0215 active 등록)
memory/decisions/dec-2026-04-XX-pattern-search-augment-policy.md  (선택)
```

## CTO 설계 원칙 적용

### 성능
- N/A (read-only audit). 측정 후속 모듈에서 적용.
- 단, audit 결과로 N+1 쿼리 / 비효율 패턴 발견 시 ⚠️ 메모만 (수정은 W-0216+에서)

### 안정성
- **File-domain lock 필수**: 다른 agent가 동시 수정 차단. CONTRACTS.md에 lock 등록 권장.
- 폴백: audit 도중 파일 못 읽으면 → 부분 inventory + 명시적 [unknown] 라벨로 진행
- 멱등성: audit 재실행 시 동일 결과. 부수효과 없음.

### 보안
- N/A (read-only).
- 단, audit 중 secret/credential 발견 시 → incident report 필수 (`memory/incidents/`)

### 유지보수성
- 계층 준수: `engine/research/`만 audit. `app/` `engine/api/` 등 미접근.
- 결과는 W-0214 §14에 영구 보존 → 다음 agent가 wrapping 작업 시 재참조
- markdown 표 형식 통일: `| name | line | params | returns | usage |` 5-column

## Next Steps

1. **Lock acquisition**: file-domain lock on `engine/research/pattern_search.py` 등록
2. **Read 3283줄**: 5분/100줄 = 약 165분 소요 [estimate]
3. **Inventory 작성**: 함수당 1~2줄, 표 형식
4. **Wrapping 매핑**: M1~M4 / B0~B3 / G1~G7 각각 어떤 기존 함수 활용 가능한지
5. **재구현 금지 리스트**: 신규 작성 시 중복될 함수 명시
6. **W-0214 §14 통합**: single commit
7. **PR 작성**: title `docs(W-0215): pattern_search.py audit + W-0214 §14 update`
8. **Lock release**: PR 머지 후

## 절대 하지 말 것

- ❌ `pattern_search.py` 1줄도 수정 X
- ❌ 새 `engine/research/validation/` 파일 생성 X (다음 work item)
- ❌ "내가 더 잘 짤 수 있다" 식의 redesign 제안 X (augment-only)
- ❌ Lock 없이 시작 X (다른 agent와 충돌 위험)
- ❌ Audit 중 발견한 버그를 즉시 수정 X (별도 incident report)

## 후속 work items (이 audit 통과 후)

- **W-0216 V-01**: PurgedKFold + Embargo 구현 (`engine/research/validation/cv.py`)
- **W-0217 V-02**: M1 phase_eval (pattern_search.hypothesis_test wrapping)
- **W-0218 V-06**: stats.py (BH + DSR)
- **W-0219 V-07**: SQL view migration
- **W-0220+ V-08**: pipeline.py + dashboard JSON

(전체 V-00 ~ V-13은 W-0214 §7.3 표 참조)

## Acceptance — 이 work item 완료 조건

```
[ ] 위 7개 Exit Criteria 모두 통과
[ ] PR가 reviewer (CTO 또는 senior researcher) approval 받음
[ ] augment-only 정책 위반 0건 (코드 수정 0줄)
[ ] W-0214 §14 Appendix B가 다음 agent의 V-01 작업 시작에 충분
[ ] 후속 W-0216 work item이 본 audit 결과 위에 작성 가능
```

---

## Cross-references

- **W-0214** v1.3 §5.0 augment-only 정책
- **W-0214** v1.3 §14 Appendix B (이 audit 결과 들어갈 곳)
- **W-0220** PRD v2.2 §4 L5 (pattern_search.py 3283줄 [factual])
- **memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md**

---

## 16. 구체화 v1.1 (2026-04-27 A032 추가)

### 16.1 Audit Output Template (의무 형식)

W-0214 §14 Appendix B에 통합될 inventory는 아래 5개 표 + 1 prose section으로 구성.

#### Table 1: Function Inventory (전수 조사)

```
| # | Name | Line | Signature | Returns | Public/Private | Has Docstring | Has Type Hints |
|---|------|------|-----------|---------|----------------|---------------|----------------|
| 1 | hypothesis_test | 142 | (pattern_id: str, horizon: int) | TestResult | public | Y | partial |
| 2 | _filter_candidate | 287 | (rows: pd.DataFrame) | pd.DataFrame | private | N | N |
| ... | ... | ... | ... | ... | ... | ... | ... |
```

→ 모든 def/class 누락 없이. 산출물 row count: 예상 80~150개 (3283줄 기준).

#### Table 2: Wrapping Map → V-01~V-13 Modules

```
| pattern_search.py 함수 | 매핑 모듈 | 매핑 작업 (V-XX) | Wrapping 방식 | 비고 |
|---|---|---|---|---|
| hypothesis_test() | validation/phase_eval.py | V-02 | thin wrapper + BH correction 추가 | t-stat 이미 반환 |
| BenchmarkPack class | validation/baselines.py | V-08 | composition (B0~B3 채움) | random baseline 부재 → 추가 |
| variant_evaluation() | validation/decay.py | V-13 | wrapping + decay schedule 추가 | 30일 cron 부재 |
| mtf_search() | (no mapping) | — | 사용 안 함 | search corpus 전용, validation 무관 |
```

→ Wrapping 방식 5종: ① thin wrapper ② composition ③ extension ④ no mapping ⑤ replace candidate (augment-only 위반 → 별도 ADR 필요).

#### Table 3: 4 Metrics × Existing Functions Mapping

```
| Metric | 정의 | 활용 가능 함수 | 부족분 (신규 작성 필요) |
|---|---|---|---|
| M1. Phase-conditional return | W-0214 §3.2 | hypothesis_test, _compute_forward_return | BH/FDR correction, bootstrap CI |
| M2. Signal ablation | W-0214 §3.2 | (찾기) | leave-one-out 루프 |
| M3. Sequence completion | W-0214 §3.2 | (찾기) | phase 1→k 도달률 |
| M4. Regime-conditional | W-0214 §3.2 | (찾기) | BTC 30d return regime label |
```

#### Table 4: 4 Baselines × Existing Functions

```
| Baseline | 정의 | 기존 구현 (Y/N) | 위치 또는 [신규] |
|---|---|---|---|
| B0. Random time | W-0214 §3.3 | ? | [unknown — audit 결과] |
| B1. Buy & hold | W-0214 §3.3 | ? | [unknown] |
| B2. Phase 0 | W-0214 §3.3 | ? | [unknown] |
| B3. Phase k-1 | W-0214 §3.3 | ? | [unknown] |
```

#### Table 5: 8 Acceptance Gates (G1~G7) × Existing Tests

```
| Gate | W-0214 §3.7 정의 | 기존 함수 | 신규 필요 |
|---|---|---|---|
| G1. t-stat ≥ 2 (BH) | M1 | hypothesis_test? | BH wrapper |
| G2. DSR > 0 | stats | ? | DSR 계산 함수 |
| G3. PurgedKFold pass | M1 + CV | ? | cv.py 신규 |
| G4. Bootstrap CI excludes 0 | M1 | ? | bootstrap |
| G5. Ablation drop ≥ 0.3% | M2 | ? | ablation 루프 |
| G6. Sequence monotonic | M3 | ? | 시퀀스 평가 |
| G7. Regime gate ok | M4 | ? | regime 라벨링 |
```

#### Prose Section (200~400자, mandatory)

3283줄을 read한 후 다음 5개 질문에 답변:
1. 이 파일은 어떤 단일 책임을 갖는가? (한 줄)
2. 의존하는 데이터 source는? (DB/Parquet/in-memory dict 등)
3. Test coverage 추정 (test_*.py와 매칭)
4. 가장 큰 hidden risk 1개 (예: global state, threading, side effect)
5. augment-only 정책으로 갈 때 가장 위험한 함수 1개 (재구현 유혹이 큰 곳)

### 16.2 Audit Methodology (구체적 7단계, 시간 예산)

| 단계 | 작업 | 예상 시간 | 산출물 |
|---|---|---|---|
| 1 | Lock acquire (`/claim engine/research/pattern_search.py`) | 5min | lock 등록 |
| 2 | 전수 read 1차 (skim, def/class 위치 파악) | 30min | 라인 번호 목록 |
| 3 | def/class별 시그니처 추출 (`grep -nE "^(def\|class)" pattern_search.py`) | 15min | Table 1 raw |
| 4 | 함수별 1~2줄 docstring/주석 read → Returns 컬럼 채움 | 60min | Table 1 완성 |
| 5 | M1~M4 / B0~B3 / G1~G7 매핑 (Table 2~5) | 90min | Wrapping map |
| 6 | Prose section 5개 질문 답변 | 20min | Prose |
| 7 | W-0214 §14에 단일 commit 통합 | 10min | PR 준비 |
| **총계** | | **~3.5시간** | |

→ Lock release는 PR 머지 후 별도.

### 16.3 Validation Matrix — 매핑 우선순위

augment-only 정책에서 다음 우선순위로 wrapping 결정:

```
1순위: thin wrapper      (기존 함수 그대로 + 입출력 변환만)
2순위: composition       (기존 함수를 새 클래스/파이프라인에서 호출)
3순위: extension         (기존 함수 호출 후 추가 metric/correction 적용)
4순위: no mapping        (해당 함수는 validation에 무관, 유지)
5순위: replace candidate (재구현 후보 → ADR 필수, default reject)
```

→ 5순위 발견 시 W-0215 PR에 ADR 첨부 (`memory/decisions/`).

### 16.4 Dependency Graph (W-0215 → 후속)

```
W-0215 (V-00 audit)
  ├─→ W-0216 V-01 PurgedKFold        (cv.py 신규, audit 결과 위에서)
  ├─→ W-0217 V-02 phase_eval         (M1: hypothesis_test wrapping)
  ├─→ W-0218 V-03 ablation           (M2: leave-one-out)
  ├─→ W-0219 V-04 sequence test      (M3)
  ├─→ W-0220 V-05 regime test        (M4)
  ├─→ W-0221 V-06 stats engine       (DSR + BH)
  ├─→ W-0222 V-07 SQL view
  ├─→ W-0223 V-08 pipeline           (V-01~V-07 통합)
  ├─→ W-0224 V-09 weekly cron
  ├─→ W-0225 V-10 Hunter UI          (Glossary + dashboard)
  ├─→ W-0226 V-11 F-60 gate
  ├─→ W-0227 V-12 threshold audit
  └─→ W-0228 V-13 decay monitoring
```

→ W-0216~W-0228은 W-0215 머지 후 분리 work item으로 작성. 이 PRD에서는 placeholder로만.

### 16.5 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 3283줄 read 도중 fatigue → 누락 | 중 | 중 | Table 1을 먼저 grep으로 raw 추출 후 채움 |
| BenchmarkPack이 baseline 개념과 다름 | 중 | 고 | composition으로 wrapping (replace 금지) |
| hypothesis_test가 이미 BH 적용 여부 불명 | 고 | 중 | docstring/code read로 확인. 없으면 V-06 stats.py에서 추가 |
| Lock 못 잡음 (다른 agent 동시) | 저 | 고 | start.sh 출력에서 active locks 확인 후 진입 |
| audit 결과가 "없음 / [unknown]" 다수 | 중 | 저 | [unknown] 라벨로 명시적 표시. V-XX 작업으로 해소 |

### 16.6 Acceptance Test (V-00 통과 자동 검증)

```bash
# 1. Inventory completeness
grep -cE "^(def |class )" engine/research/pattern_search.py
# → 표 1의 row count와 ±2 이내 일치

# 2. Augment-only enforcement
git diff origin/main -- engine/research/pattern_search.py
# → 출력 0줄 (수정 없음)

# 3. W-0214 §14 통합
grep -A5 "## 14. Appendix B" work/active/W-0214-mm-hunter-core-theory-and-validation.md
# → "[unknown]" placeholder가 사라지고 실제 표 5개 + Prose 등장

# 4. Cross-reference 일관성
grep -rn "W-0215" work/active/ memory/decisions/
# → 최소 3개 파일에서 참조
```

### 16.7 Out of scope (이 PRD에서 다루지 않음)

- ❌ V-01~V-13 신규 모듈 작성 — 후속 work item
- ❌ pattern_search.py 성능/리팩토링 제안 — augment-only 위반
- ❌ test coverage 측정 자동화 — 별도 W-0229 후보
- ❌ engine/research/ 다른 파일 audit — 이번엔 pattern_search.py만

---

## 17. Quant Trader 관점 — Audit 시 반드시 확인할 함수 카테고리

CTO + AI Researcher + Quant Trader 3-perspective sign-off를 위해 audit에서 **퀀트 관점의 추가 8개 검사 항목**:

### 17.1 거래 비용 모델 (Cost Model)

| 검사 항목 | 기존 함수 존재 여부 (audit 결과) | 부족 시 후속 |
|---|---|---|
| `compute_fee()` — taker 5bps × 2 (round-trip) | ? | V-08에서 추가 |
| `compute_slippage()` — orderbook depth 기반 | ? | V-08에서 추가. 기본 5bps default |
| `compute_funding()` — perp funding rate accrual | ? | V-13 decay와 함께 |
| `compute_market_impact()` — size × spread | ? | optional, capacity 측정 시 필수 |

→ pattern_search.py에 cost 처리가 0bps이면 W-0214 D3 (15bps) 위반. **반드시 wrapping 시 cost 주입**.

### 17.2 Risk-adjusted Return Metric

W-0214 §3.2 M1은 forward return만 측정. 퀀트는 **risk-adjusted** 필수:

| Metric | 정의 | 기존 함수? |
|---|---|---|
| Sharpe (annualized) | mean_return / std × sqrt(252×24/h) | ? |
| Sortino | mean_return / downside_std | ? |
| Calmar | annualized_return / max_drawdown | ? |
| Hit rate | sign(return) > 0 비율 | ? |
| Profit factor | sum(positive) / abs(sum(negative)) | ? |

→ Audit에서 위 5개 함수 존재 여부 명시. 없으면 V-06 stats.py에서 추가 (DSR과 함께).

### 17.3 Out-of-Sample 정합성 (Walk-Forward)

학술의 PurgedKFold 외에 **walk-forward backtest** 함수 존재 여부:

```
| walk_forward(start, end, retrain_freq='monthly') | ? | V-01 cv.py와 별도 / 통합 |
| live_paper_trade_simulator() | ? | V-13 decay와 연결 |
```

→ Audit 시 `walk_forward`, `expanding_window`, `rolling_window` 키워드 grep.

### 17.4 Regime Detection (M4 외 추가)

W-0214 M4는 BTC 30d return regime만. 퀀트는 추가 regime 차원:

| Dimension | 측정 함수 (audit 대상) | 후속 |
|---|---|---|
| Volatility regime | rolling_std / ATR | M4 확장 후보 |
| Funding regime | funding_rate sign + magnitude | V-13 |
| Liquidity regime | volume z-score | V-08 |
| Term structure | basis (futures - spot) | optional |

→ pattern_search.py에 regime 분류 함수 있는지 grep.

### 17.5 Capacity Estimation

P0 5개 패턴이 작동해도 capacity 제한 명시:

```python
# Audit: pattern_search.py에 다음 함수 존재 여부
estimate_capacity(pattern_id, max_slippage_bps=10) -> {bid_depth: USD, ask_depth: USD}
```

→ 없으면 V-08 또는 별도 W-0226에서 추가.

### 17.6 Alpha Attribution (Factor Regression)

t-stat ≥ 2가 진짜 alpha인지 market beta인지 분리:

```python
# 퀀트 표준: 패턴 return을 BTC return + funding + OI delta로 회귀
def factor_attribution(pattern_returns, factors=['btc_return', 'funding', 'oi_delta'])
  -> {alpha: float, betas: dict, r2: float, residual_sharpe: float}
```

→ pattern_search.py에 statsmodels / sklearn 의존 함수 grep. 없으면 V-06에 추가.

### 17.7 Drawdown / Tail Risk

```
| Max drawdown | rolling | ? |
| VaR (95%) | empirical / parametric | ? |
| CVaR (Expected Shortfall) | conditional | ? |
| Tail ratio | gain_at_95 / loss_at_5 | ? |
```

→ Audit에서 `drawdown`, `var`, `cvar`, `tail` 키워드 grep.

### 17.8 Position Sizing Model

```
| kelly_fraction(win_rate, win_loss_ratio) | ? |
| risk_parity_size(volatility) | ? |
| fixed_fractional(equity, risk_pct) | ? |
```

→ 패턴 단독 hit/miss만 측정해도 실 PnL 환산 시 sizing 필요. V-08 또는 W-0227 별도.

### 17.9 Audit Output Table 6 — Quant Coverage Matrix

기존 5 tables에 추가:

```
| Quant 영역 | Function 존재 (Y/N/Partial) | 기존 위치 | V-XX 매핑 |
|---|---|---|---|
| Cost (fee+slip+fund) | | | |
| Risk-adj return | | | |
| Walk-forward | | | |
| Regime ext | | | |
| Capacity | | | |
| Alpha attribution | | | |
| Drawdown / tail | | | |
| Position sizing | | | |
```

→ 8개 영역 중 **5개 미만 존재** 시 → W-0217 (Quant Realism Protocol) 가속화 필요.

### 17.10 시간 예산 추가

§16.2 7-step에 step 4.5 추가:

| step | 작업 | 시간 |
|---|---|---|
| 4.5 | Quant 8개 영역 grep + Table 6 채움 | 30min |

→ 총 시간 3.5h → **4h**로 조정.

---

## 18. v1.2 변경 사항

- §17 신규: Quant Trader 관점 8개 영역 (cost / risk-adj / walk-forward / regime ext / capacity / alpha / tail / sizing)
- §17.9: Quant Coverage Matrix (Table 6)
- §17.10: 시간 예산 +30min → 총 4h

---

## 19. v1.1 변경 사항

- §16 신규 추가: Audit Output Template (5 tables + prose)
- §16.2: 7-step methodology with time budget (3.5h)
- §16.3: Wrapping priority matrix (5단계)
- §16.4: Dependency graph (W-0216~W-0228)
- §16.5: Risk register
- §16.6: Bash-based acceptance test

---

*W-0215 v1.0 created 2026-04-27 as next work item after W-0214 lock-in.*
*W-0215 v1.1 concretized 2026-04-27 by Agent A032 — output template + methodology + validation matrix.*
*W-0215 v1.2 concretized 2026-04-27 by Agent A032 — Quant Trader 관점 8개 영역 추가 (cost / risk-adj / walk-forward / capacity / alpha / tail / sizing).*

## Handoff Checklist

- [x] PRD v1.2 published (3-perspective)
- [x] V-00 audit 완료 (W-0214 §14 통합, PR #415)
- [ ] PR #415 머지
- [ ] Issue #417 close (audit 완료)
- [ ] 후속 W-0217~W-0221 work items으로 인계
