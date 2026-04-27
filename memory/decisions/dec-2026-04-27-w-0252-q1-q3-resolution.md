---
tier: core
decided_at: 2026-04-27T14:15:00Z
id: dec-2026-04-27-w-0252-q1-q3-resolution
linked_incidents: []
recorded_at: 2026-04-27T14:15:00Z
source: cto-decision
status: accepted
tags: ["w-0252", "v-00", "audit", "mm-hunter", "cto-decision", "open-questions"]
title: W-0252 V-00 Audit — Open Questions Q1~Q3 CTO 결정
type: decision
valid_from: 2026-04-27T14:15:00Z
valid_to: null
related_docs:
  - work/active/W-0252-v00-pattern-search-audit.md
  - memory/decisions/dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md
---

# W-0252 V-00 Audit — Open Questions Q1~Q3 CTO 결정

## What

W-0252 설계문서의 Open Question 3개 (Q1: drift 정정 시점 / Q2: F1 발동 처리 / Q3: V-13 갭 처리)에 대한 CTO 위임 결정.

## Why

사용자가 "CTO 입장에서 가장 최고의 선택을 하고 진행"으로 명시적 권한 위임. 3개 Open Question 모두 audit 실제 실행 진입 전 확정 필요 — 미정 상태로 진입 시 audit Phase 별 분기 결정 시 막힘.

## How — 3개 결정

### Q1: PRIORITIES.md "W-0215" drift 정정 시점

**결정**: 즉시 정정 (PR #465 atomic chore)

| 검토 옵션 | 결과 |
|---|---|
| (A) 즉시 atomic PR | ✅ **선택** — drift 노출 시간 최소, 다음 에이전트 W-0215 오인 차단 |
| (B) audit 종료 후 일괄 정정 | ❌ 거절 — 1d audit 동안 drift 누적, 동시 에이전트 혼동 위험 |
| (C) audit PR에 묶음 | ❌ 거절 — atomic single-axis commit 원칙 위반 (chore + design 혼합) |

### Q2: F1 발동 시 (8개 D-결정 중 3+개 augment-only 불가) 처리

**결정**: 사용자 직접 보고 우선, 자동 incident 등록 금지

| 검토 옵션 | 결과 |
|---|---|
| (A) 자동 incident + 사용자 알림 | ❌ 거절 — incident 카탈로그가 architecture 결정용으로 오염, F1은 framing-level 결정이라 자동화 부적합 |
| (B) 사용자 직접 보고만 | ✅ **선택** — framing 재검토는 product-level 결정, 사용자 결재 필수 |
| (C) audit를 F1 시점에 중단 | ❌ 거절 — partial gap matrix는 후속 결정에 가치, 끝까지 catalog 후 보고 |

**적용 방식**: audit report `docs/live/W-0252-v00-audit-report.md` §3 "Augment 작업 목록"에서 🔴 갭 개수 ≥3개 시 사용자 직접 보고 + 별도 work item으로 W-0214 framing 재검토 제안.

### Q3: V-13 (decay monitoring) 갭 발견 시 처리

**결정**: 별도 work item, 본 audit 포함 금지

| 검토 옵션 | 결과 |
|---|---|
| (A) 본 audit에 V-13 갭 포함 | ❌ 거절 — Effort M (1d+0.5d) 초과 위험, scope creep |
| (B) 별도 work item으로 분리 | ✅ **선택** — audit는 "갭 식별", 갭 처리는 별도 작업 원칙 (CTO 분리) |
| (C) V-13 자체를 P2로 강등 | ❌ 거절 — P2 강등은 D6 결정 변경, audit 결과 보기 전 사전 판단 위험 |

**적용 방식**: V-13 (decay monitoring) 관련 갭 발견 시 audit report §4 "V-track 추가 작업 권고"에 명시 + 후속 work item ID (예상 W-0253) 발번 권고.

## Outcome

- **Status**: Accepted, locked-in 2026-04-27.
- 본 audit Phase 1~5 진입 가능.
- 후속 PR #465 머지 후 mutex 확보 → audit 실제 실행 시작.

## References

- Issue: #462 (comment with full reasoning)
- PR: #463 (W-0252 design merged 215f23fa), #465 (drift fix pending)
- Linked: dec-2026-04-27-w-0214-mm-hunter-framing-d1-d8-lockin.md (D1~D8)
