# W-0225 — Design Verification + V-track Scope Declaration

**Owner:** research (Agent A033, CTO + AI Researcher + Quant Trader 3-perspective)
**Status:** Ready (verification + corrections, scope lock-in)
**Type:** Design audit + bug fix + scope separation
**Depends on:** W-0214 v1.3 LOCKED-IN, W-0215~W-0224 PRDs (PR #415 merged)
**Effort:** 1 day verification + bug-fix commits

---

## 0. 한 줄 요약

W-0214~W-0224 PRDs를 **CTO + AI Researcher + Quant Trader 3-perspective**로 cross-check하여 발견한 **9개 결함**을 수정. 동시에 **V-track (Wave-MM)** scope를 spec/PRIORITIES.md에 명시하여 **Wave 4 + Data fetcher 작업 다른 에이전트와 충돌 차단**.

## 1. Goal

1. V-* PRDs의 **3-perspective 오류** 수정 (cost double-counting / contract drift / threshold 등)
2. **V-track (Wave-MM) scope** 분리 선언 — 다른 agent가 Wave 4/Data를 자유롭게 작업 가능
3. **참고용 공식 문서** 정비 — spec/PRIORITIES.md, CURRENT.md, work/active/CONTRACTS.md (또는 README)에 명확한 분담

## 2. Owner

research

## 3. Scope

| 파일 | 변경 |
|---|---|
| `work/active/W-0225-*.md` (본 파일) | new — verification report |
| `work/active/W-0218-v02-phase-eval-m1.md` | edit — cost double-counting fix |
| `work/active/W-0221-v08-validation-pipeline.md` | edit — ValidationReport sub_results 확장 |
| `work/active/W-0220-v06-stats-engine.md` | edit — PF inf cap + DSR n_trials note |
| `work/active/W-0216-falsifiable-test-protocol.md` | edit — F1 KILL false positive guard |
| `spec/PRIORITIES.md` | edit — Wave-MM scope 명시 |
| `work/active/CURRENT.md` | edit — V-track 분담 표 |

## 4. Non-Goals

- ❌ Wave 4 작업 (다른 agent 담당)
- ❌ Data fetcher 작업 (다른 agent 담당)
- ❌ 코드 implementation (V-* 별도 work item)
- ❌ pattern_search.py 수정 (V-00 augment-only)

## 5. Exit Criteria

```
[x] 3-perspective verification 9개 항목 정리
[ ] CRITICAL 3개 fix commit (V-02 cost / V-08 contract / Wave 분리)
[ ] MEDIUM 3개 fix commit (F1 false positive / DSR n_trials / walk-forward 우선순위)
[ ] MINOR 3개 fix commit (PF inf cap / seed doc / augment risk)
[ ] spec/PRIORITIES.md Wave-MM scope 명시 + Wave 4/Data 분담 표
[ ] CURRENT.md V-track 진행 현황 + 다른 agent 손대지 말 것 명시
[ ] PR open + review + 머지
```

---

## 6. 3-Perspective Verification Report

### 6.1 🔴 CRITICAL Issues (반드시 fix)

#### Issue C-1: V-02 Cost Double-Counting [Quant Trader]

**파일**: `W-0218-v02-phase-eval-m1.md` line 130, line 277-278

**현재 코드**:
```python
_measure_forward_peak_return(
    entry_slippage_pct=0.05,  # 5bps slip (W-0214 D3 fee 10 + slip 5 = 15bps)
)
# ...
return_net = return_at_h - cost_bps / 100.0  # cost_bps=15.0 default
```

**버그**: `entry_slippage_pct=0.05` (5bps)가 `entry_next_open` 가격에 이미 반영됨 → 그 다음 `cost_bps=15` 차감 → **총 20bps cost** (의도한 15bps 초과 5bps).

**근거** (Quant Trader):
- pattern_search.py L2737-2739: `entry_next_open = round(raw_next_open * (1.0 + entry_slippage_pct / 100.0), 8)` — slippage가 entry price에 가산
- `(target_close - entry_next_open) / entry_next_open` — slippage 이미 차감된 값
- 추가로 `cost_bps/100` 차감 = 중복 차감

**Fix**: V-02에서 명시적 cost 단일 처리:
```python
# Option A (권장): cost_bps에 모든 cost 포함
_measure_forward_peak_return(entry_slippage_pct=0.0)  # slippage 외부에서 미주입
return_net = return_at_h - cost_bps / 100.0  # cost_bps=15.0 (fee 10 + slip 5)

# Option B: 분리 (덜 권장)
_measure_forward_peak_return(entry_slippage_pct=0.075)  # 7.5bps × 2 = 15bps slip
return_net = return_at_h  # cost는 entry/exit 가격에 모두 반영
```

→ **Option A 채택** (clean accounting). W-0218 수정 commit.

#### Issue C-2: V-08 / V-11 Contract Drift [CTO]

**파일**: `W-0221-v08-validation-pipeline.md` (V-08) vs `W-0224-v11-gate-v2-integration.md` (V-11)

**버그**: V-11이 다음 fields를 read하지만 V-08의 `ValidationReport`에 정의 안 됨:
- `validation_report.fold_pass_count` (G3 PurgedKFold pass 검증)
- `validation_report.ablation_results` (G5 ablation drop)
- `validation_report.sequence_result` (G6 sequence monotonic)
- `validation_report.regime_results` (G7 regime gate)

**현재 V-11 응답**: 4개 모두 `placeholder = True` (실제 검증 X). → V-11 작동 불가.

**Fix**: V-08 `ValidationReport`에 `sub_results: dict` 또는 dedicated fields 추가:

```python
@dataclass(frozen=True)
class ValidationReport:
    # 기존
    pattern_slug: str
    horizon_reports: list[HorizonReport]
    # 신규 (sub_results)
    fold_pass_count: int = 0           # V-01 PurgedKFold N folds passed
    fold_total_count: int = 0          # 5
    ablation_results: list = field(default_factory=list)  # V-03 AblationResult[]
    sequence_result: dict | None = None                    # V-04 SequenceCompletionResult
    regime_results: list = field(default_factory=list)    # V-05 RegimeConditionalReturn[]
```

→ V-08 PRD §6.1 spec 보강. V-11 placeholder 제거 가능.

#### Issue C-3: V-Track Scope 분리 미명시 [CTO + 사용자 요청]

**파일**: `spec/PRIORITIES.md` (PR #412 머지된 버전), `work/active/CURRENT.md`

**버그**: 현재 priorities는:
```
## P0 — MM Hunter (현재)
| W-0214 | ... |
| W-0215 | ... |
```

→ 다른 agent 입장에서 **Wave 4 (#406~#410)와 V-track (#417~#429)이 같은 P0인지 불명**. 또한 누가 무엇 담당인지 불명.

**Fix**: spec/PRIORITIES.md에 별도 섹션:

```markdown
## P0 트랙 분담 (충돌 차단)

| Track | Owner | Scope | Issues |
|---|---|---|---|
| **V-track (Wave-MM)** | research (V-* 전담 agent) | engine/research/validation/ + W-0214~W-0228 | #417, #418, #420~#423, #426~#429 |
| **Wave 4 — Stream A** | engine agent | engine/features/ + signals | #408 (F-12) |
| **Wave 4 — Stream B** | app agent | app/src/components/ + routes/ | #406 (F-2), #407 (F-4), #414 (F-3) |
| **Wave 4 — Stream C** | app agent | app/src/routes/dashboard/, telegram/ | #410 (F-11), #409 (F-13) |
| **Data fetchers** | data agent | engine/data/ | #401, #402, #403, #400, #404 |

**File-domain 충돌 0**: 모든 트랙은 다른 디렉토리. lock 정책 + Issue assignee로 mutex.

**V-track agent (현재)는 다음 외에 손대지 말 것**:
- engine/research/pattern_search.py (read-only, V-00 enforce)
- engine/research/validation/ (신규 모듈)
- work/active/W-0214 ~ W-0228 (PRD 및 결과)
```

### 6.2 🟠 MEDIUM Issues

#### Issue M-1: F1 KILL False Positive Guard [AI Researcher]

**파일**: `W-0216-falsifiable-test-protocol.md` §15.10

**버그**: KILL 조건 `pass_rate == 0` 단일 측정 시 noise (특정 fold 실패, 데이터 결손)에 너무 민감. False positive로 system 폐기 위험.

**근거**:
- 5 P0 patterns × 3 horizons = 15 tests
- 통계적 noise: 한 패턴 데이터 cache miss → 그 패턴 결과 0 → 전체 pass_rate 영향
- W-0216 §9 "False Positive Rescue Protocol" 있지만 자동 KILL 트리거 후 발동

**Fix**: KILL 트리거 조건 강화:

```
F1 KILL only if ALL 3 of below:
1. pass_rate == 0 in measurement
2. random seed 변경 후 재측정 3회 (W-0216 §9.1) 모두 0
3. holdout 기간 변경 후 재측정 (다른 1년) 0
→ 위 3개 통과 후에만 KILL trigger ADR
```

→ W-0216 §15.10 + falsifiable_kill.py implementation에 명시.

#### Issue M-2: DSR n_trials 과소평가 [AI Researcher]

**파일**: `W-0220-v06-stats-engine.md` line 122 + `measure_F1` line 263

**버그**:
```python
n_trials = config.n_trials_for_dsr or len(config.horizons_hours)  # = 3
```
또는 F1 measurement에서:
```python
dsr = deflated_sharpe(samples, n_trials=len(p0_patterns) * len(horizons))  # = 15
```

→ **n_trials = 15가 너무 작음**. DSR은 selection bias adjustment. 우리는 53 PatternObject library + 100s of variants를 search해서 P0 5개 선정. 따라서 n_trials는 **실제 search universe 반영** 필요.

**근거** (López de Prado 2014):
- DSR formula: `SR_threshold = sigma_SR × ((1-γ) × Φ⁻¹(1 - 1/n_trials) + γ × Φ⁻¹(1 - 1/(n_trials × e)))`
- n_trials 작으면 SR_threshold 작음 → DSR 통과 쉬워짐 (false positive 위험)
- n_trials 크면 SR_threshold 큼 → DSR 통과 어려움 (보수적)

**Fix**: n_trials 외부 주입 강제 + 권장값 명시:
```python
# F1 측정 시
n_trials = (
    n_patterns_in_search_universe  # 53 base + variants ~ 200~500
    * len(horizons)                  # × 3
    * n_phase_per_pattern            # × ~3
)  # ≈ 1800~4500
```

→ W-0220 PRD에 n_trials 가이드 추가 + measure_F1 호출 시 explicit n_trials.

#### Issue M-3: Walk-Forward 우선순위 상향 [Quant Trader]

**파일**: `W-0217-v01-purged-kfold-cv.md` §8.1

**현재**: Walk-forward는 W-0226+ Quant Realism (P3 분류 가능).

**버그**: Quant production 표준은 walk-forward (López de Prado 2018 Ch 11도 PurgedKFold + walk-forward 병행 권장). PurgedKFold만으로는 production 신뢰도 부족.

**Fix**: W-0226 walk-forward를 **P1 (V-* 후속 1순위)**로 상향. W-0217 PRD §8.1에 명시.

### 6.3 🟡 MINOR Issues

#### Issue N-1: V-06 Profit Factor inf [CTO]

**파일**: `W-0220-v06-stats-engine.md` `profit_factor` 함수

**버그**: 모든 sample 양수 시 `return float("inf")` → JSON serialization 실패 (`json.dumps(float('inf'))` → `JSONDecodeError`).

**Fix**:
```python
def profit_factor(samples):
    ...
    if abs(neg) < 1e-9:
        return 999.0 if pos > 0 else 0.0  # cap at 999, JSON-safe
    return float(pos / abs(neg))
```

#### Issue N-2: Bootstrap seed 문서화 [AI Researcher]

**파일**: `W-0220-v06-stats-engine.md` §6.1

**현재**: `seed: int = 42` default, reproducibility 위해.

**개선**: 프로덕션 measurement (W-0216 F1)에서는 multiple seeds (3~10)를 돌려 robustness 확인 필요. Default 42는 dev/test용. F1 measurement code에 명시:
```python
# falsifiable_kill.py (W-0218 후속)
SEEDS = [42, 7, 123, 2024, 99]  # rotating seeds for robustness
ci_results = [bootstrap_ci(samples, seed=s) for s in SEEDS]
ci_robust = min_max_consensus(ci_results)
```

→ W-0220 PRD §10 Q2에 추가.

#### Issue N-3: V-02 Augment-only Risk [CTO]

**파일**: `W-0218-v02-phase-eval-m1.md` `_measure_forward_peak_return` import

**버그**: `_measure_forward_peak_return`는 underscore prefix (Python convention: private). pattern_search.py 작가가 향후 rename/remove 시 V-02 break.

**Fix**: 두 가지 중 하나:
- (A) **ADR 작성**: `_measure_forward_peak_return`를 semi-public으로 격상 (rename: `measure_forward_peak_return`). 변경은 pattern_search.py 측이 수행 (V-00 enforce 위반 X — explicit upgrade ADR)
- (B) V-02에서 try/except + fallback (재구현 — V-00 위반)

→ **(A) 권장**. `memory/decisions/dec-2026-04-XX-pattern-search-public-api.md` 작성. Quant 4종 (W-0226+)에서도 동일 pattern 적용.

---

## 7. Wave-MM (V-track) Scope Declaration

### 7.1 V-track agent 책임 영역

```
디렉토리:
├ engine/research/pattern_search.py  (READ-ONLY, V-00 enforce)
├ engine/research/validation/        (NEW, V-01~V-13 모듈)
├ engine/research/validation/test_*  (V-* 테스트)
└ work/active/W-0214 ~ W-0228       (PRD + 결과)

GitHub Issues (V-track 전담):
├ #417 V-00 audit
├ #418 F1~F7 measurement protocol
├ #420 V-01 PurgedKFold
├ #421 V-02 phase_eval (M1)
├ #422 V-06 stats engine
├ #423 V-08 validation pipeline
├ #426 V-03 ablation (M2)
├ #427 V-04 sequence (M3, thin wrapper 가장 쉬움)
├ #428 V-05 regime (M4)
└ #429 V-11 gate v2

PRD 후속 (예정):
├ W-0226 V-12 threshold audit + walk-forward
├ W-0227 V-13 decay monitoring
├ W-0228 Quant Realism (capacity / sizing / alpha / drawdown)
└ W-0229 V-09 weekly cron + V-10 Hunter UI
```

### 7.2 V-track agent **건들지 말 것**

```
디렉토리 (다른 agent 작업):
├ app/                          (Wave 4 — F-2/F-4/F-11/F-13 app agent)
├ engine/features/              (Wave 4 Stream A — F-12 engine agent)
├ engine/data/                  (Data fetchers — D-A/D-B/D-E/D-G data agent)
├ engine/api/                   (Wave 4 — endpoint agent)
├ db/migrations/                (Wave 4 / Data agent)
└ docs/live/                    (PRD master agent)

GitHub Issues (다른 agent 전담):
├ #408 F-12 DESIGN_V3.1 features
├ #406 F-2 search UX
├ #407 F-4 Decision HUD
├ #410 F-11 dashboard
├ #409 F-13 telegram bot
├ #414 F-3 telegram deep link
├ #401 D-A STH Cost Basis
├ #402 D-B Exchange Reserve
├ #403 D-E Network Growth
├ #400 D-G Volume/TVL
└ #404 D-docs CME COT
```

### 7.3 충돌 차단 메커니즘

| 메커니즘 | 적용 |
|---|---|
| **Issue assignee mutex** | gh issue edit N --add-assignee @me |
| **Branch naming** | `feat/W-XXXX-*` (V-track) vs `feat/F-XX-*` (Wave) vs `feat/D-X-*` (Data) |
| **File-domain lock** | spec/CONTRACTS.md (필요 시 등록) |
| **PR review** | 다른 트랙 file 변경 발견 시 즉시 reject |

### 7.4 V-track agent 부팅 절차

```bash
1. ./tools/start.sh                                   # Agent ID 발번
2. cat work/active/CURRENT.md                          # V-track 진행 현황
3. cat spec/PRIORITIES.md | grep -A 30 "V-track"      # 책임 영역 확인
4. gh issue list --search "no:assignee Wave-MM" --state open
5. gh issue edit N --add-assignee @me                 # mutex 획득
6. git checkout -b feat/W-XXXX-*                      # V-track branch
7. 작업 → commit → push → PR
8. 머지 후 cd work/active/CURRENT.md 갱신
```

---

## 8. Cross-references

- W-0214 v1.3 §14 Appendix B (V-00 audit)
- W-0215~W-0224 (V-* PRDs)
- spec/PRIORITIES.md (Wave declaration)
- spec/CHARTER.md (frozen scope)

---

## Goal

§1 — V-* PRDs 3-perspective 오류 수정 + V-track scope 분리 선언.

## Owner

§2 — research

## Scope

§3 — W-0225 신규 + 4개 PRD edit + spec/PRIORITIES.md edit.

## Non-Goals

§4 — Wave 4 / Data / 코드 implementation X.

## Canonical Files

§3 — `W-0225-*.md`, edit 4개 PRD, spec/PRIORITIES.md, CURRENT.md.

## Facts

§6 9개 issue 발견 근거. 각 §6.X에 file/line/근거 명시.

## Assumptions

§6.1 C-3 — 다른 agent들이 spec/PRIORITIES.md를 부팅 시 read.

## Open Questions

- N-3 ADR 작성 시점 (V-02 implementation 전?)
- M-3 walk-forward W-0226에 통합 vs 별도 work item?

## Decisions

- C-1 Option A 채택 (cost clean accounting)
- C-2 V-08 ValidationReport sub_results 확장
- C-3 spec/PRIORITIES.md Wave-MM 분리 명시
- M-1 F1 KILL 3-step rescue 강제
- M-2 DSR n_trials 외부 주입 + 가이드
- M-3 Walk-forward W-0226 P1 상향
- N-1 PF cap 999.0
- N-2 Bootstrap multi-seed F1 measurement
- N-3 ADR `_measure_forward_peak_return` semi-public 격상

## Next Steps

§5 Exit Criteria 8개 단계 순차.

## Exit Criteria

§5 — 9개 fix commit + spec/PRIORITIES.md + CURRENT.md + PR 머지.

## Handoff Checklist

- [x] 3-perspective verification 완료
- [ ] CRITICAL 3개 fix
- [ ] MEDIUM 3개 fix
- [ ] MINOR 3개 fix
- [ ] Wave-MM scope 명시
- [ ] PR open + 머지

---

*W-0225 v1.0 created 2026-04-27 by Agent A033 — 3-perspective verification report + V-track scope declaration.*
