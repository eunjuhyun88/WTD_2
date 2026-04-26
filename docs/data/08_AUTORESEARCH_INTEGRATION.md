# W — AutoResearch 패턴 도입 설계 (원본 분석 기반)

> **⚠️ Verdict cardinality 주석 (2026-04-27 rebase 정합)**
> 이 문서는 Ryan Li 16-seed validation 기반 **6-cat verdict** (`near_miss / too_early` 추가) 제안을 담고 있다.
> Main canonical은 **5-cat** (`valid / invalid / missed / too_late / unclear`, PR #370 F-02 머지).
> 6-cat 채택 여부는 verdict 50+ 누적 후 재논의. 본 문서는 alternative proposal로 보존.

**출처:** github.com/ryanli-me/paradigm-pm-challenge · github.com/octavi42/prediction-market-maker · github.com/Ar9av/obsidian-wiki  
**분석일:** 2026-04-26 (A028 — 원본 코드/README/WRITEUP.md 직접 취득)

---

## TL;DR — 핵심 발견 3가지

1. **Ryan Li repo는 사실상 Cogochi AutoResearch의 실증 case study다.** 패러다임이 정확히 같다: PatternObject ↔ strategy.py, verdict ledger ↔ benchmark.py, parallel agents ↔ Claude Code Agent 툴.

2. **obsidian-wiki는 우리 memory/ 시스템과 이미 동형이다.** 새로 빌드할 것 없음. `/wiki-update`(우리 `/save`) + `/wiki-query`(우리 `/search`) 두 개뿐.

3. **즉시 적용은 2개 파일 변경만.** R-02에서 `PatternObject`에 3개 필드 추가 + R-05에 multi-seed gate. 나머지는 Phase D.

---

## Repo 1: ryanli-me/paradigm-pm-challenge — 원본 분석

### 실제 아키텍처 (WRITEUP.md + strategy.py 직접 취득)

```
strategy_3610.py (~900 lines) 구조:
  1. REGIME DETECTION      — gap = comp_ask - comp_bid → cs bucket
  2. MID ESTIMATION        — info-theoretic delta tracking with EMA
  3. SKIP/GATE             — cs=1 skip, vol gate, early cautious
  4. PRICE SELECTION       — comp_bid+1 / comp_ask-1
  5. BASE SIZING           — k × retail_mult × arb_risk_factor
  6. FLOOR EXPLOIT         — aggressive at p<5%
  7. HIGH-PRICE ASYMMETRY  — dampen bids, boost asks at p>75%
  8. THROTTLE              — reduce size near p=50%
  9. ARB-PROB SIZING       — per-side Gaussian arb probability
  10. TIME SCALING          — 0.9× early, 1.0× mid, 1.15× late
  11. CASH CONSTRAINTS      — 88% at extremes, 45% moderate
  12. INVENTORY SKEW        — quadratic skew
  13. JUMP SUPPRESSION      — suppress dangerous side after jump
  14. NONE HANDLING         — tick 1/99 when competitor empty
```

### Cogochi 직접 매핑

| Ryan Li | Cogochi | 상태 |
|---|---|---|
| `strategy.py` (1개 파일 ~900줄) | `PatternObject` (phase sequence) | ✅ BUILT |
| 1,039 strategy variants | AutoResearch loop variants | ❌ Phase D |
| `benchmark.py` (immutable eval) | verdict ledger (200+ verdicts) | 🔄 R-01~R-05 |
| Multi-seed (16 seeds, 4 minimum) | multi-period gate (3 quarters) | ❌ R-05 |
| "Saving learnings to markdown" | `memory/` + `work/active/` | ✅ BUILT |
| From-scratch agent escape | parallel agent + fresh context | ❌ Phase D |
| Agent swarm (20 concurrent) | Worker control plane | ❌ Phase D |
| Dead end confirmation table | rejected hypothesis ledger | 🔄 partial |

### 핵심 인사이트 (원본 인용)

> **"The bitter lesson applies: scaling up search with occasional resets beat every clever hand-crafted idea."**

> **"When we were stuck at +$25, a fresh agent — with only domain knowledge and a target — independently discovered the arb-risk-weighted sizing formula that jumped us from +$25 to +$44."**

**Cogochi 번역:** 
- OI Reversal v1이 F-60 gate를 통과 못 하면 → "fresh context agent"에게 전혀 다른 접근 시도 지시
- 기존 v1 코드 참조 금지 + 기본 원리(OI divergence + liquidation)와 target(accuracy ≥ 0.55)만 제공
- 이게 Phase D의 핵심 루프

### 평가 프로토콜 (원본 수치)

```
Leaderboard 1-seed eval:    $52.03  ← 과적합 가능
Final 3-seed median:         $42.32  ← 실제 성능 (1위)
16-seed validation average: $52.08  ← range $34~$70

교훈: single-period accuracy 0.60이 multi-period 0.45보다 나쁘다.
```

---

## Repo 2: octavi42/prediction-market-maker — 원본 분석

### 실제 Evolution 구조 (README.md 직접 취득)

```
7 milestone versions (v01 → v109):
  v01  foundation         : -$17.25  (multi-level quoting)
  v10  asymmetric skew    :  +$4.18  (asymmetric inventory skew)
  v50  z-score regimes    :  -$2.59  (volatility-adjusted filtering)
  v74  monopoly discovery : +$40.64  ← BREAKTHROUGH (+$55 swing)
  v97  retail optimization: +$37.41  (size=10 flat)
  v99  retail matching    : +$42.95  (size=14/prob)
  v109 final tuning       : +$46.70  (mono=85/prob, tiered z)
```

**v74 monopoly discovery = "regime change breakthrough"**  
: 이전까지 전략이 어떤 파라미터를 바꿔도 -$15 → +$15 범위에서 맴돌다가  
  완전히 다른 regime을 발견하는 순간 +$40으로 점프. **1개 아이디어가 100개 파라미터 튜닝보다 가치 있음.**

### 직접 적용: evolution_chain 필드

```python
# Octavi의 7 milestone이 있었기 때문에:
# 1. 어떤 변형이 breakthrough인지 알 수 있음
# 2. dead end를 재탐색하지 않음
# 3. benchmark_results.json 캐시로 비교 기준 유지

# Cogochi에서:
@dataclass
class PatternObject:
    parent_id: str | None = None                    # "oi_reversal_v1"
    evolution_chain: list[str] = field(default_factory=list)  # ["oi_reversal_v1", "oi_reversal_v2"]
    derivation_note: str | None = None              # "early entry threshold 0.08 → 0.12"
```

**이 필드 없으면 Phase D에서 1,039 variant를 실험해도 "v60이 breakthrough였다"는 사실을 잃는다.**

### Magic Numbers = Systematic Sweep (원본 인용)

> **"Constants like 39.9, 85, 0.08, and 2.8 were not derived analytically — they were found through systematic parameter sweeps across hundreds of simulations."**

Cogochi 매핑:
- 우리 `08_SPEC.md` 가중치: insertion 0.15, deletion 0.40, phase_score_threshold 등
- Day-1: hand-tuned 시작 (OK)
- Phase 2 이후: eval data 누적 → `benchmark.py` 형태 자동 sweep으로 전환
- 현재 hand-tuned 값들은 "v01 기준점"으로 저장해야 함

---

## Repo 3: Ar9av/obsidian-wiki — 원본 분석

### 실제 구조 (README.md 직접 취득)

```
핵심 2가지 skill:
  /wiki-update  — 현재 프로젝트의 지식을 vault에 distill
  /wiki-query   — vault에서 질문에 답

부가 기능:
  delta tracking  (.manifest.json — 변경분만 처리)
  cross-linker    (wikilinks 자동 연결)
  wiki-lint       (orphan, contradiction 감지)
  provenance      (claimed vs inferred 구분)
```

### Cogochi와의 동형 확인

| obsidian-wiki | Cogochi | 상태 |
|---|---|---|
| `/wiki-update` | `/save` | ✅ BUILT |
| `/wiki-query` | `/search` | ✅ BUILT |
| `.manifest.json` (delta tracking) | `memory/` system | ✅ BUILT (다름) |
| `concepts/` (이론, 패턴) | PatternObject definitions | ✅ BUILT |
| `journal/` (시간순 로그) | `work/active/*.md` | ✅ BUILT |
| `projects/` (per-project) | per-user pattern library | ❌ Phase D |
| `synthesis/` (cross-cutting) | Pattern × Outcome correlation | ❌ Phase D |

**결론: obsidian-wiki 별도 구현 불필요.** 우리 memory 시스템이 이미 same pattern.  
Phase D에서 `synthesis/` 역할(Pattern × Outcome correlation)만 추가하면 됨.

---

## Cogochi 도입 계획 (원본 분석 기반 확정)

### Stage 1: 이번 주 R-01 (0 추가 작업)

**Verdict 6-cat → anti-overfit label system**

```python
# engine/ledger/types.py:54
user_verdict: Literal["valid", "invalid", "near_miss", "too_early", "too_late", "missed"] | None = None
```

Ryan Li가 16-seed validation을 통해 발견한 것:  
- `too_early` = 패턴 맞는데 entry phase 기준 조기 진입 → phase threshold 상향 신호  
- `near_miss` = 방향 맞는데 타이밍 약간 빗나감 → evaluation_window_hours 조정 신호  
- `too_late` = 패턴 이미 끝난 후 → scanner scan_interval 단축 신호  
- `missed` = 패턴 감지 못함 → required_blocks 재검토 신호

이 4개 label이 있어야 "어떤 파라미터를 sweep해야 하는지" 알 수 있음.  
Ryan Li식으로 말하면: **dead end confirmation table의 각 행이 이 label에서 나온다.**

변경 파일 (R-01 spec 동일):
- `engine/ledger/types.py:54`
- `engine/api/routes/captures.py:66`  
- `engine/api/routes/verdict.py`
- `app/src/routes/api/captures/[id]/verdict/+server.ts`
- `app/src/routes/dashboard/+page.svelte`

---

### Stage 2: 이번 주 R-02 (+2h)

**PatternObject evolution lineage**

```python
# engine/patterns/types.py:40 — PatternObject에 추가
parent_id: str | None = None
evolution_chain: list[str] = field(default_factory=list)
derivation_note: str | None = None
```

```python
# engine/api/routes/patterns.py — _RegisterPatternBody에 추가
class _RegisterPatternBody(BaseModel):
    # ... 기존 필드 ...
    parent_id: str | None = None
    derivation_note: str | None = None
```

```python
# engine/api/routes/patterns.py — POST /patterns/parse 응답 body에 mode 추가
class _ParsePatternBody(BaseModel):
    text: str
    mode: Literal["simple", "research", "variant"] = "simple"
    parent_id: str | None = None  # variant 모드에서 사용
```

`mode="variant"` + `parent_id` 조합이 Phase D의 핵심 인터페이스.  
지금은 simple만 구현, variant는 hook 자리만.

변경 파일:
- `engine/patterns/types.py` (3줄 추가)
- `engine/api/routes/patterns.py` (2개 모델 필드 추가)
- `engine/patterns/registry.py` (serialize에 new fields)

---

### Stage 3: 다음 주 R-05 (+2h)

**Multi-period acceptance gate**

Ryan Li 원본 수치 기반:

```python
# engine/stats/engine.py — _compute_gate_status() 변경

def _compute_gate_status(outcomes: list[PatternOutcome]) -> GateStatus:
    # 기존: single accuracy >= 0.55
    # 변경: rolling window 3개로 분할
    
    recent = [o for o in outcomes if not o.outcome == "pending"]
    if len(recent) < 200:
        return GateStatus(passed=False, reason="insufficient_data")
    
    # 30일 rolling window 3개 (Q1=가장 최근, Q2=중간, Q3=가장 오래된)
    windows = split_rolling_30d(recent, n=3)
    
    accuracies = []
    for window in windows:
        valid = sum(1 for o in window if o.user_verdict in ("valid", "near_miss"))
        total = sum(1 for o in window if o.user_verdict is not None)
        if total > 0:
            accuracies.append(valid / total)
    
    if len(accuracies) < 2:
        return GateStatus(passed=False, reason="insufficient_windows")
    
    median_acc = statistics.median(accuracies)
    floor_acc = min(accuracies)
    
    return GateStatus(
        passed=median_acc >= 0.55 and floor_acc >= 0.40,
        median_accuracy=median_acc,
        floor_accuracy=floor_acc,
        window_accuracies=accuracies,
    )
```

Ryan Li 교훈: leaderboard 1-seed $52.03 → final 3-seed $42.32 (drop 20%)  
우리 gate에서도 single-period 0.60이 multi-period 0.40이 되는 케이스를 막아야 함.

---

### Stage 4: Phase D (12주 후, 지금 건드리지 않음)

**AutoResearch Loop (Ryan Li 아키텍처 Cogochi 번역)**

```
# program.md 형식 (유저가 작성)
목표: OI Reversal 패턴 accuracy 0.55 → 0.65 개선
베이스라인: oi_reversal_v1 (accuracy 0.52, 200 verdicts)
탐색 방향:
  - Phase 1 threshold 조정 (too_early 35% → 20%)
  - REAL_DUMP 조건에 liquidation_volume 추가
  - evaluation_window_hours 72h → 48h 테스트

# prepare.py (immutable eval = verdict ledger)
eval_set = ledger.query(
    pattern_slug="oi_reversal_v1",
    verdict_count_min=200,
    quarters=3
)

# train.py (agent variant 생성 + 병렬 실행)
for hypothesis in hypotheses:
    variant = PatternObject(
        slug=f"oi_reversal_v{n+1}",
        parent_id="oi_reversal_v1",
        derivation_note=hypothesis.description,
        ...
    )
    result = scanner.backtest(variant, eval_set)
    if result.median_accuracy > baseline.median_accuracy:
        registry.register(variant)
        champion = variant
```

**선행조건 (지금 데이터 없음):**
- verdict 200+ (R-01 → R-05 완료 후)
- PatternObject.evolution_chain BUILT (R-02)
- multi-period gate BUILT (R-05)
- 베이스라인 패턴 3-5개 production validated

---

## 결정 사항 (구현 전 확정 필요)

| Q | 선택지 | 권고 | 근거 |
|---|---|---|---|
| Q-A: `near_miss` 점수 처리 | (a) 0.5 partial, (b) full 1.0, (c) 별도 카운터 | **(c) 별도 카운터** | Ryan Li처럼 "signal for which param to sweep" — accuracy 분자에 넣으면 목표 희석 |
| Q-B: evolution_chain 저장 | (a) in-memory only, (b) Supabase patterns 테이블 | **(b) Supabase** | Phase D parallel 20+ agent가 동시 접근 — in-memory 불가 |
| Q-C: multi-period 기준 | (a) calendar Q1/Q2/Q3, (b) rolling 30d window | **(b) rolling 30d** | verdict 200개 → 분포 불균등, calendar로 자르면 어떤 quarter는 5개 |

---

## 변경 파일 최종 요약

### 이번 주 (R-01 + R-02)

| 파일 | 변경 내용 | 추가 effort |
|---|---|---|
| `engine/ledger/types.py:54` | `user_verdict` 6-cat | 0 (R-01 spec에 있음) |
| `engine/api/routes/captures.py:66` | VerdictLabel 6-cat | 0 |
| `engine/api/routes/verdict.py` | 동일 | 0 |
| `app/src/routes/.../verdict/+server.ts` | 타입 주석 | 0 |
| `app/src/routes/dashboard/+page.svelte` | 5버튼 (missed hidden) | 0 |
| `engine/patterns/types.py:40-53` | PatternObject +3 필드 | +30m |
| `engine/api/routes/patterns.py` | `_RegisterPatternBody` + `_ParsePatternBody` | +1h |
| `engine/patterns/registry.py` | serialize new fields | +30m |

### 다음 주 (R-05)

| 파일 | 변경 내용 | 추가 effort |
|---|---|---|
| `engine/stats/engine.py` | multi-period gate | +2h |
| `live/requirements-specification.md` | R-05 spec 갱신 | +30m |

---

## Phase D 참조 (12주 후 필독 순서)

```
1. github.com/ryanli-me/paradigm-pm-challenge/WRITEUP.md
   → "The Journey: Five Paradigm Shifts" 섹션이 핵심
   → "From-Scratch to Escape Local Optima" = Phase D 기본 원리

2. github.com/octavi42/prediction-market-maker/README.md
   → "Strategy Evolution" 7 milestone table
   → analysis/benchmark.py 구조 (immutable eval 구현 레퍼런스)

3. github.com/Ar9av/obsidian-wiki/README.md
   → synthesis/ 구현 참조 (Pattern × Outcome correlation)
   → delta tracking (.manifest.json) 패턴
```

---

## Non-Goals

- obsidian-wiki 별도 구현 — 우리 memory 시스템이 동형. 중복.
- 10_AUTORESEARCH_LOOP_SPEC.md 지금 작성 — 데이터 없이 쓰면 폐기 확률 70%
- 1,000+ variant loop 인프라 — Phase D 선행조건 미충족
- evolution chart UI — Phase D

---

## Exit Criteria (이번 주)

- [ ] `user_verdict` 6-cat BUILT, POST /verdict near_miss/too_early/too_late → 200
- [ ] `PatternObject.parent_id` + `evolution_chain` + `derivation_note` BUILT
- [ ] `POST /patterns/parse` body에 `mode` enum + `parent_id` optional 포함
- [ ] Supabase patterns 테이블에 3개 신규 컬럼 migration 계획 (별도 migration)
