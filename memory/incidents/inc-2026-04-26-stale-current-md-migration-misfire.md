---
tier: core
affected: ["work/active/CURRENT.md", "spec/CHARTER.md", "PR #360"]
detected_at: 2026-04-26T00:00:00
id: inc-2026-04-26-stale-current-md-migration-misfire
recorded_at: 2026-04-26T00:00:00
resolved_at: 2026-04-26T00:00:00
severity: medium
source: manual
status: resolved
tags: ["stale-source", "charter-violation", "multi-agent", "process"]
title: stale CURRENT.md → frozen 정책 위반 마이그레이션 PR 사고 (PR #360 rollback)
type: incident
valid_from: 2026-04-26T00:00:00
valid_to: null
---
# stale CURRENT.md → frozen 정책 위반 마이그레이션 PR 사고 (PR #360 rollback)

## Symptoms

- 에이전트가 worktree(`claude/intelligent-austin`) local의 stale `work/active/CURRENT.md`를 source로 채택
- stale CURRENT.md는 활성 work items로 W-0132(Copy Trading), W-0145(Search Corpus) 표시
- 실제 main 진실:
  - W-0145는 PR #346로 이미 머지 완료
  - W-0132 Copy Trading은 `spec/CHARTER.md` Frozen 리스트에 등재
  - "MemKraft/Multi-Agent expansion" 자체가 Frozen
  - 활성 work item은 W-0214 단 1개
- 잘못된 전제로 GitHub Projects v2 마이그레이션 작업 진행:
  - W-0215 번호 사용(이미 `W-0215-ledger-supabase-cutover` 존재 — 충돌)
  - Issue #357 (Copy Trading) 생성 — frozen 항목
  - Issue #358 (W-0145) 생성 — 이미 완료된 작업
  - PR #360 오픈
- PR `mergeable: CONFLICTING`로 main rebase 시도 중 사고 발견

## Evidence

- `git show origin/main:work/active/CURRENT.md` → 활성 W-0214 1개만, main SHA 66e5979f
- `git show origin/main:spec/CHARTER.md` → Frozen: Copy Trading, MemKraft/Multi-Agent expansion, agent-session history PRs
- `git ls-tree origin/main work/active/W-0215-*.md` → `W-0215-ledger-supabase-cutover.md` 이미 존재
- PR #346 이미 머지 (W-0145 search corpus 40+dim) → main에 반영
- 이전 incident `inc-2026-04-25-current-md-만성-stale-...` 와 동일 패턴 재발

## Hypotheses

- (R1) worktree의 local CURRENT.md가 remote main보다 한참 뒤처졌고, 에이전트가 `git fetch` 없이 작업 시작
- (R2) AGENTS.md "Reconstruct context from canonical files before acting" 규칙 위반 — main의 `spec/CHARTER.md` 미열람
- (R3) MemKraft `mk.evidence_first("multi-agent collaboration")` 미호출 — 이전 동일 패턴 incident가 있었음에도 검색 안 함
- (R4) 단일 source 강제 메커니즘 없음 — CURRENT.md 수동 갱신 의존이 제거되지 않음

## Resolution

**즉시 조치 (수행됨)**:
1. PR #360 close (rollback 사유 코멘트)
2. Issue #357 close (reason: not planned — frozen)
3. Issue #358 close (reason: completed — already merged)
4. Local branch reset (`e60cb1f7` → `7e9e68e0`) + force-push로 remote 동기화
5. 추가 파일 제거 (W-0215 work item, render_current_md.py, CURRENT.md 변경)
6. Project #3 (`WTD_2 — Active Work`) 빈 상태로 유지 (재활용 가능)

**구조적 조치 (미수행 — W-0214 charter audit으로 위임)**:
- 같은 사고가 2일 연속 발생 (`inc-2026-04-25-current-md-만성-stale-*` 참조)
- MemKraft Memory Protocol(PR #278) 도입에도 불구 재발
- 단순 규칙 추가가 아닌 enforcement 메커니즘 필요:
  - 세션 시작 시 `git fetch` + `spec/CHARTER.md` 강제 노출
  - work item 시작 전 main 진실 cross-check 강제
  - frozen 항목에 대한 claim 시 hard block

## Lessons

1. **stale CURRENT.md 단일 인용은 위험** — 작업 시작 전 반드시 `git fetch origin main && cat origin/main:spec/CHARTER.md` 등으로 cross-check
2. **Frozen 정책은 첫 검색 대상** — work item 생성 전 spec/CHARTER.md Frozen 리스트 우선 확인
3. **번호 충돌 방지** — W-#### 번호는 `git ls-tree origin/main work/active/` 결과로 검증
4. **memkraft evidence_first 누락** — 동일 패턴 incident가 24시간 전 있었음에도 검색 미수행
5. **사용자의 "다해줘"는 charter 검증 권한 양도가 아님** — 정책 위반은 explicit 사용자 승인 필요

## Related

- `inc-2026-04-25-current-md-만성-stale-에이전트-완료-후-중앙-기록-미갱신.md` (선행 incident)
- `work/active/W-0214-product-charter-gate.md` (charter audit work item)
- PR #278 (MemKraft Memory Protocol 도입 — 본 사고로 효과 부족 확인)
- PR #346 (W-0145 머지 완료 — stale CURRENT.md에 미반영)
- PR #350 (W-0215-ledger-supabase-cutover — W-0215 번호 선점)
- PR #360 (closed — 본 사고 PR)
- closed Issue #357, #358
