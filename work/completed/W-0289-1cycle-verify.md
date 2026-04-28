# W-0289 — 1사이클 완전 검증: 운영 활성화 + Layer P 통계 연결

> Wave: Beta | Priority: P0 | Effort: M
> Charter: In-Scope L3(PatternObject) ~ L7(AutoResearch)
> Status: 🟡 In Progress
> Branch: feat/W-0289-1cycle-verify
> Issue: #566
> Created: 2026-04-29 by A077

## Goal (1줄)

Search → Watch → Scan → Capture → 72h → Verdict 1사이클이 Cloud Run에서
실제로 돌고, 누적 verdicts가 `engine/research/validation/` M1~M4 통계
프레임으로 측정 가능한 상태가 된다.

---

## 배경 — 왜 지금인가

### 현재 막혀있는 이유 (진단 완료, 2026-04-29)

| 블로커 | 위치 | 상태 |
|---|---|---|
| 스케줄러 잡 4개 OFF | `engine/scanner/scheduler.py:91` (env var default=false) | ❌ 안 돌고 있음 |
| BTC returns `offline=True` | `validation/runner.py` | ✅ W-0288 PR #564로 fix됨 |
| GateV2DecisionStore | `validation/actuator.py` | ✅ W-0284 PR #565로 머지됨 |
| Migration 023/025/026 운영 DB | Supabase | ❓ issue #481 open |

### 코드 현황 (main = `a9eda8f8`)

`engine/research/validation/` 이미 빌드됨:
```
phase_eval.py  (397L) — M1: measure_phase_conditional_return()
baselines.py   (284L) — B0~B3: random/buy-hold/phase-zero/k-1
stats.py       (471L) — Welch t-test, BH correction, DSR, bootstrap CI
gates.py             — G1~G4 acceptance gates (t≥3.0, DSR≥0, hit_rate≥0.55)
pipeline.py          — run_full_validation() wiring
cv.py                — PurgedKFold (López de Prado Ch7)
ablation.py          — leave-one-out signal ablation (M2)
regime.py            — regime-conditional split (M4)
sequence.py          — sequence completion rate (M3)
acceptance_report.py — 수동 실행 리포트
actuator.py          — GateV2DecisionStore (W-0284)
```

**없는 것**:
- CLI runner (`run_evaluation.py`)
- Supabase production data → local holdout 연결 SQL
- OI Reversal v1 실 결과

---

## 두 축 구조

### 축 A — 운영 1사이클 활성화
### 축 B — Layer P 통계 연결 (W-0213 §Part 5)

---

## 축 A — 운영 1사이클 활성화

### A-0: Pre-flight (Supabase Studio에서 직접 실행)

```sql
-- 1. Migration 023: verdict 5-cat 적용 여부 (issue #481)
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'ledger_records'
  AND column_name IN ('valid','invalid','near_miss','too_early','too_late');
-- → 5개 모두 나와야 함. 없으면 supabase db push 또는 SQL 직접.

-- 2. Migration 025: beta_allowlist 테이블 존재
SELECT COUNT(*) FROM beta_allowlist;

-- 3. Migration 026: beta_feedback 테이블 존재
SELECT COUNT(*) FROM beta_feedback;

-- 4. pattern_phase_transitions 테이블 존재 여부 (축 B용)
SELECT COUNT(*) FROM pattern_phase_transitions;
```

### A-1: Cloud Run Env Vars ON

scheduler.py:91 주석: `"Set ENABLE_<JOB>=true to re-enable after beta."`

```bash
ENGINE_SVC=<Cloud Run 서비스명>  # gcloud run services list 로 확인
REGION=asia-southeast1

gcloud run services update $ENGINE_SVC \
  --region $REGION \
  --set-env-vars \
"ENABLE_OUTCOME_RESOLVER_JOB=true,\
ENABLE_REFINEMENT_TRIGGER_JOB=true,\
ENABLE_PATTERN_REFINEMENT_JOB=true,\
ENABLE_SEARCH_CORPUS_JOB=true,\
SUPABASE_HTTP_TIMEOUT=10,\
HYDRATION_TIMEOUT_SECONDS=10"
```

적용 확인:
```bash
gcloud run services describe $ENGINE_SVC \
  --region $REGION \
  --format='value(spec.template.spec.containers[0].env)'
```

### A-2: Smoke Test

```bash
ENGINE_URL=https://cogotchi-3u7pi6ndna-as.a.run.app

# 1. Health check
curl $ENGINE_URL/readyz | jq '.'
# 기대: {"status":"ok","role":"scanner|scheduler|..."}

# 2. Pattern states (스캐너 살아있는지)
curl $ENGINE_URL/api/patterns/states | jq '.states | length'
# 기대: 숫자 (0 이상)

# 3. Candidates (ACCUMULATION alert 있는지)
curl $ENGINE_URL/api/patterns/candidates | jq '.candidates | length'

# 4. Transitions (최근 전이)
curl "$ENGINE_URL/api/patterns/transitions?limit=5" | jq '.transitions[0]'
```

### A-3: Pattern Scan 수동 Trigger

```bash
# Cloud Scheduler secret (GCP Secret Manager에서 조회)
SCHEDULER_SECRET=$(gcloud secrets versions access latest --secret="scheduler-secret")

# Pattern scan 수동 실행
curl -X POST $ENGINE_URL/jobs/pattern-scan \
  -H "Authorization: Bearer $SCHEDULER_SECRET" | jq '.'
# 기대: {"status":"ok","job":"pattern_scan","symbols_scanned":N}

# 30초 후 transitions 재확인
sleep 30 && curl "$ENGINE_URL/api/patterns/transitions?limit=3" | jq '.'
```

### A-4: Verdict 5-cat 저장 확인

```bash
# 테스트 verdict (auto-verdict endpoint)
curl -X POST "$ENGINE_URL/api/verdict" \
  -H "Content-Type: application/json" \
  -d '{
    "entry_price": 95000,
    "direction": "long",
    "bars_after": [
      {"h": 96000, "l": 94500, "c": 95800},
      {"h": 96500, "l": 95200, "c": 96200}
    ],
    "target_pct": 0.01,
    "stop_pct": 0.01,
    "max_bars": 24
  }' | jq '.'
# 기대: {"outcome":"hit","pnl_pct":0.009,"bars_held":1,...}
```

Supabase에서 확인:
```sql
SELECT verdict, COUNT(*) FROM ledger_records
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY verdict;
```

---

## 축 B — Layer P 통계 연결 (W-0213 §Part 5)

### W-0213 이론 요약 (Kyle 1985 + A-S 2008)

> **너 phase machine = "Avellaneda-Stoikov optimal MM이 보는 microstructure regime을
> Kyle 1985-style informed/noise 분리 신호로 라벨링한 sequential state machine"**

| Phase | A-S regime | 신호 | directional_belief |
|---|---|---|---|
| 1 fake_dump | σ↑, q 비대칭(short heavy) | funding_extreme_short + oi_small_uptick | avoid_entry |
| 2 arch_zone | σ↓, good MM env | volume_dryup + sideways | avoid_entry |
| 3 real_dump | σ spike, VPIN-confirmed | price_dump + oi_spike + volume_spike | event_confirmed |
| 4 accumulation | spread normalize, MM ask side 회복 | higher_lows + oi_reexpansion | **entry_zone** |
| 5 breakout | σ↑ again, MM 늦게 진입 | range_high_break + volume_spike | late |

**검증 가설 (H-AS)**: Phase 4 entry_zone의 4h forward return이 B0(random) 대비 t-stat ≥ 3.0이면 이론 일치.

### B-1: CLI Runner 추가

파일: `engine/research/validation/run_evaluation.py`

```python
"""1사이클 검증 CLI.

Usage:
    cd engine && python -m research.validation.run_evaluation oi_reversal_v1
    cd engine && python -m research.validation.run_evaluation oi_reversal_v1 \
        --horizon 4 --holdout 90 --cost-bps 15
"""
from __future__ import annotations

import argparse
import json
import sys

from research.validation.pipeline import run_full_validation


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run Layer P statistical validation for a pattern slug."
    )
    parser.add_argument("pattern_slug", help="e.g. oi_reversal_v1")
    parser.add_argument("--horizon", type=int, default=4, help="Forward return horizon hours (default: 4)")
    parser.add_argument("--holdout", type=int, default=90, help="Holdout days (default: 90)")
    parser.add_argument("--cost-bps", type=float, default=15.0, help="Round-trip cost in bps (default: 15)")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args(argv)

    result = run_full_validation(
        pattern_slug=args.pattern_slug,
        horizon_hours=args.horizon,
        holdout_days=args.holdout,
        cost_bps=args.cost_bps,
    )

    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        _print_report(result, args)


def _print_report(result: dict, args) -> None:
    slug = args.pattern_slug
    print(f"\n{'='*60}")
    print(f"  Layer P Validation: {slug}")
    print(f"  Horizon: {args.horizon}h | Holdout: {args.holdout}d | Cost: {args.cost_bps}bps")
    print(f"{'='*60}\n")

    phases = result.get("phase_results", {})
    for phase_idx, pr in sorted(phases.items()):
        status = "✅ PASS" if pr.get("g1_pass") else "❌ FAIL"
        print(f"  Phase {phase_idx}: mean={pr.get('mean_return_pct', 0):.2f}%  "
              f"t={pr.get('t_stat', 0):.2f}  p={pr.get('p_value', 1):.4f}  "
              f"n={pr.get('n_samples', 0)}  {status}")

    print(f"\n  Overall: {'PROMOTE' if result.get('promote') else 'REFINE/DEPRECATE'}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
```

### B-2: Production Data 연결 SQL

```sql
-- Supabase: phase entry 이력 → 로컬 CSV로 export
COPY (
  SELECT
    symbol,
    pattern_id,
    pattern_version,
    from_phase,
    to_phase,
    transition_id,
    created_at
  FROM pattern_phase_transitions
  WHERE created_at >= NOW() - INTERVAL '90 days'
  ORDER BY created_at
) TO '/tmp/phase_transitions_90d.csv' CSV HEADER;
```

또는 Supabase Studio → Table Editor → Export CSV.

로컬 실행:
```bash
cd engine
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python -m research.validation.run_evaluation oi_reversal_v1 \
  --horizon 4 --holdout 90
```

### B-3: M1 기대 결과 (OI Reversal v1)

```
Phase 1: mean≈-0.3%  t≈-1.2  p≈0.21  → FAIL (avoid_entry 검증)
Phase 2: mean≈+0.1%  t≈0.4   p≈0.68  → FAIL (avoid_entry 검증)
Phase 3: mean≈-2.1%  t≈-4.5  p<0.001 → PASS (event_confirmed)
Phase 4: mean≈+1.8%  t≈3.8   p<0.005 → PASS ← 핵심
Phase 5: mean≈+0.2%  t≈0.8   p≈0.43  → FAIL (late 검증)
```

Phase 4 t ≥ 3.0 AND p < 0.05 (BH-corrected) → G1 PASS → pattern promote.

---

## 이론 문서 저장

`docs/design/14_MM_THEORY_GROUNDING.md` 신규 작성 (W-0213 §Part 1~3 final):

- §1. Theory lineage: Bachelier 1900 → BSM 1973 → Kyle 1985 → GM 1985 → EKO 2002 → A-S 2008 → MMR 2022
- §2. Vocabulary × theory mapping (23개 signal)
- §3. Phase × A-S regime mapping (5 phases)
- §4. 명시적 가설 H-Kyle, H-VPIN, H-AS
- §5. 검증 절차 (M1~M4, B0~B3, G1~G4)

---

## Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Migration 023 미적용 → verdict INSERT 실패 | 중 | HIGH | A-0 pre-flight 필수 선행 |
| Cloud Run env var 반영 후 cold start | 저 | 중 | /readyz 재확인 |
| phase_eval이 production DB schema 불일치 | 중 | 중 | B-2 SQL 먼저 확인 |
| holdout n < 30 (베타 초기) | 높음 | 중 | feature_windows 138,915행 오프라인 백테스트로 대체 |

## Dependencies

- 선행: 없음 (A-1~A-4 즉시 실행 가능)
- 축 B: verdicts 30+ 누적 후 통계 유의 (또는 feature_windows 오프라인 모드)

## Decisions

- [D1] Forward return horizon: **4h** (phase machine 1h timeframe × 4)
- [D2] Cost model: **포함** (round-trip 15bps = 10bps fee + 5bps slip)
- [D3] 첫 검증 target: **OI Reversal v1** (production hit 최다)
- [D4] 데이터 부족 시: **feature_windows 138,915행 오프라인 백테스트** (holdout 2024-01-01~2024-10-01)

## Open Questions

- [ ] [Q-001] Cloud Run 서비스명 정확한 명칭? (`gcloud run services list` 확인 필요)
- [ ] [Q-002] `pattern_phase_transitions` 테이블명이 실제 Supabase에 있는가, 아니면 다른 테이블명?
- [ ] [Q-003] 축 B 오프라인 모드 진행 여부 (feature_windows 사용) vs 운영 captures 대기?

## Exit Criteria

**축 A:**
- [ ] AC1: Supabase migration 023/025/026 운영 DB 적용 확인 → issue #481 close
- [ ] AC2: Cloud Run ENABLE_* 4개 env var ON (`gcloud services describe` 확인)
- [ ] AC3: `/readyz` 200 OK
- [ ] AC4: `pattern_scan` manual trigger → `/api/patterns/transitions` 새 row 생성
- [ ] AC5: verdict 5-cat INSERT 성공 (Supabase `ledger_records` 확인)

**축 B:**
- [ ] AC6: `python -m research.validation.run_evaluation oi_reversal_v1` 에러 없이 실행
- [ ] AC7: Phase 결과 출력 (n ≥ 30, t-stat 값 출력, 유의 여부 관계없이)
- [ ] AC8: `docs/design/14_MM_THEORY_GROUNDING.md` 저장
- [ ] AC9: W-0213 §D1~D5 결정 완료 (D1~D4 위에서 결정됨, D5=Week 1 끝)

## References

- engine/scanner/scheduler.py:91 (ENABLE_* flags)
- engine/research/validation/ (M1~M4 기구현)
- spec/PRIORITIES.md §P0
- W-0213 §Part 1~5 (MM theory + validation framework design)
- issue #481 (migration 023 미검증)
- issue #563 (W-0288 — BTC offline fix, ✅ PR #564 머지)
