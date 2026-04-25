---
tier: archival
affected: []
detected_at: 2026-04-25T16:27:53
id: inc-2026-04-25-current-md-만성-stale-에이전트-완료-후-중앙-기록-미갱신
recorded_at: 2026-04-25T16:27:53
resolved_at: 2026-04-25T16:27:53
severity: medium
source: manual
status: resolved
tags: []
title: CURRENT.md 만성 stale — 에이전트 완료 후 중앙 기록 미갱신
type: incident
valid_from: 2026-04-25T16:27:53
valid_to: null
---
# CURRENT.md 만성 stale — 에이전트 완료 후 중앙 기록 미갱신

## Symptoms
- main SHA가 e2fba18b로 기록됐지만 실제 origin/main은 b7673ac0 (7개 PR 누락)
- PR #276, #274, #262, #261, #260, #275, #259 전부 CURRENT.md에 없음
- 각 에이전트가 자기 work item만 업데이트하고 CURRENT.md는 방치
- worktree local HEAD가 remote main보다 수십 커밋 뒤처짐

## Evidence

## Hypotheses

## Resolution
MemKraft Memory Protocol 도입 (PR #278): 작업 완료 후 mk.log_event() + CURRENT.md SHA 업데이트 필수 규칙 추가

## Related
