---
tier: core
decided_at: 2026-04-27T14:30:00Z
id: dec-2026-04-27-w-0252-audit-result
linked_incidents: []
recorded_at: 2026-04-27T14:30:00Z
source: cto-decision
status: accepted
tags: ["w-0252", "v-00", "audit", "mm-hunter", "augment-only", "f1-not-triggered"]
title: W-0252 V-00 Audit 결과 — F1 미발동, augment-only 진행 가능
type: decision
valid_from: 2026-04-27T14:30:00Z
valid_to: null
related_docs:
  - docs/live/W-0252-v00-audit-report.md
  - work/active/W-0252-v00-pattern-search-audit.md
  - memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md
  - memory/decisions/dec-2026-04-27-w-0252-q1-q3-resolution.md
---

# W-0252 V-00 Audit 결과 — F1 미발동, augment-only 진행 가능

## What

`engine/research/pattern_search.py` (3283줄, 100% coverage) audit 완료. MM Hunter D1~D8 호환성 분석 결과 augment-only로 처리 가능 — framing 재검토 트리거(F1) 미발동.

## Why

D6 audit 시작 조건 충족 + V-track (#435/#436/#438/#440) 머지 직후 통합 surface 확인 필요했음. augment-only 정책이 실제로 가능한지 검증.

## Outcome — 핵심 발견

### Gap Matrix (D1~D8)

| D | Status | 근거 |
|---|---|---|
| D1 framing | scope-out | doc-level, 코드 무관 |
| D2 horizon (4h) | 🟡 **partial** | 48 bars 하드코딩, 4h time normalization 부재 |
| D3 cost (15bps) | 🔴 **missing** | entry slippage만 (0.1%), bps/cost/fee 키워드 0 |
| D4 P0 패턴 수 | scope-out | data-level |
| D5 F-60 gate (Layer A+B) | 🟡 **partial** | objective 6게이트만, Layer B (subjective) 없음 |
| D6 일정 | scope-out | project mgmt |
| D7 Hunter UI | scope-out | UI 결정 |
| D8 phase taxonomy | 🔴 **hardcoded** | BenchmarkCase default L599-611에 단일 taxonomy 박힘 |

🔴 = 2 (D3, D8) / 🟡 = 2 (D2, D5) / scope-out = 4 (D1, D4, D6, D7)

### Falsifiable F1 (W-0214 D6 inheritance)

- 임계: 🔴 ≥ 3개 → framing 재검토
- 실측: **🔴 = 2** → **F1 미발동** ✅
- 결론: **augment-only 정책 유효, framing 보존**

### V-track 통합 surface

- V-01/V-02/V-04/V-06 모두 **zero coupling** with pattern_search.py
- 의미: validation/ 신규 모듈에서 wrapper로 augment 가능 (코드 변경 0줄)
- forward_peak_return_pct (L232, L2732)는 V-02가 직접 소비 가능 상태

## How — 후속 작업 (Priority A/B/C)

### Priority A — 즉시 (P0)
- A1. `engine/validation/` 신규 모듈 (V-01/V-02/V-04/V-06 wrapper)
- A2. D3 cost model: PromotionGatePolicy + VariantCaseResult에 `roundtrip_cost_bps=15.0` 필드 추가
- A3. D8 phase taxonomy: BenchmarkCase에 `phase_taxonomy_id` 필드 + taxonomy registry

### Priority B — M3 출시 전 (P1)
- B1. D2 horizon parametrization (`horizon_label="4h"`)
- B2. D5 F-60 Layer B (`require_subjective_gate`)

### Priority C — V-track 통합 후 (P2)
- C1. forward_peak_return_pct → V-02 alias
- C2. Robustness → V-06 stats 결합

## Decisions (검토한 옵션)

| 옵션 | 결과 |
|---|---|
| (A) augment-only 진행 | ✅ **선택** — F1 미발동, 코드 0줄 변경으로 V-track 통합 가능 |
| (B) pattern_search.py rewrite | ❌ 거절 — augment-only 정책 위반 + 3283줄 rewrite 비용 과다 + 외부 caller 15+개 영향 |
| (C) framing 재검토 | ❌ 거절 — F1 미발동 (🔴 = 2 < 3 임계), W-0214 lock-in 유효 |

## Exit Criteria (audit 종료)

- [x] AC1: audit report 100% coverage ✅
- [x] AC2: gap matrix evidence file:line 100% ✅
- [x] AC6: pattern_search.py 변경 0줄 (augment-only 검증) ✅
- [x] AC4: 본 decision record 등록 ✅
- [ ] AC3: V-track cross-reference 5-function spot check (deferred → 별도 verification)
- [ ] AC5: status-checklist V-00 ✅ 토글 (PR에서 처리)
- [ ] AC7: PR merged + CURRENT.md SHA 업데이트 (PR 머지 후)

## References

- audit report: `docs/live/W-0252-v00-audit-report.md`
- 설계문서: `work/active/W-0252-v00-pattern-search-audit.md`
- W-0214 D1~D8: `memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md`
- Q1~Q3 결정: `memory/decisions/dec-2026-04-27-w-0252-q1-q3-resolution.md`
- 다음 단계 (augment 시작): Priority A1+A2+A3 통합 work item 발번 예정
