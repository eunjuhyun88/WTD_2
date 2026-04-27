# W-0264 — Agent Management System Overhaul (4-Domain)

> Wave: Meta / Tooling | Priority: **P0** (governance) | Effort: **L (1.5w total: design 1d + 4 domain PRs)**
> Charter: ✅ governance / runbook / tooling (코드 변경은 영역별 implementation work item에서)
> Status: 🟡 **Design Draft** (사용자 검토 대기)
> Created: 2026-04-28 by Agent A045
> Branch: `feat/W0264-agent-management-overhaul-design`

---

## Goal (1줄)

이번 세션 (2026-04-27 A045)에서 사용자가 실제로 작동시킨 워크플로우 패턴 10개를 시스템화하고, 같은 세션에서 부딪힌 사고 6개 (G1~G6)를 자동으로 차단하는 멀티 에이전트 관리 시스템을 구축한다.

## Scope

### 4 Domain

| Domain | 목적 | Implementation work item (예상) |
|---|---|---|
| **A. Slash Lifecycle 4단계 표준** | `/설계 → /구현 → /검증 → /닫기` 일관된 라이프사이클 | W-0265 |
| **B. Parallel Orchestration** | `/병렬 W-X W-Y W-Z` 자동 launch + 충돌 매트릭스 | W-0266 |
| **C. Auto Sync (post-merge)** | PRIORITIES.md / CURRENT.md / work-active→completed 자동 동기화 | W-0267 |
| **D. Safety / 사고 차단** | G1~G6 6개 사고 자동 방지 | W-0268 |

### 본 work item 자체 = 설계만
- 영역별 work item으로 분리 후 각자 atomic PR로 구현
- 본 PR은 4-domain 설계 batch (코드 변경 0줄)

### Non-Scope
- ❌ 실제 코드 구현 (별도 work item)
- ❌ 기존 `/start /save /end /검색` 등 기존 슬래시 동작 변경 (compatibility 유지)
- ❌ memkraft 자체 변경 (Frozen — Charter §Frozen)
- ❌ 새 메모리 stack 빌드

---

## CTO 관점 (Engineering)

### 사용자 패턴 카탈로그 (10개)

| # | 패턴 | 슬래시/지점 | 강제 어디서 |
|---|---|---|---|
| P1 | Design-First Loop | `/설계` | 비자명 작업 = work item 먼저 |
| P2 | 2-Perspective 설계 | `/설계` | CTO + AI Researcher 2축 |
| P3 | Audit 후 Augment | (수동) | F1 미발동 시 augment-only |
| P4 | Atomic Axis 묶음 | (수동) | 같은 dataclass = 한 PR |
| P5 | 3-PR 분리 | (수동) | design / impl / priorities sync |
| P6 | 종합 검증 | `/검증` | 스펙 vs 실측 + 자동 sync |
| P7 | Drift 정정 즉시 | (수동) | atomic chore PR |
| P8 | CTO 위임 자율 진행 | (선언) | 결정 기록 강제 |
| P9 | Falsifiable Kill Criteria | (필수) | F1/F2/F3 측정 임계 |
| P10 | Worktree 격리 | start.sh | sub-agent isolation="worktree" |

### 사고 카탈로그 (6개, 2026-04-27 세션)

| ID | 사건 | 원인 | 해결 위치 |
|---|---|---|---|
| G1 | Worktree 공유로 commit 섞임 | Agent tool isolation 누락 | ✅ PR #491 (CLAUDE.md + start.sh) |
| G2 | ID drift (W-0215 ledger vs V-00) | work/active/ ↔ PRIORITIES.md sync 부재 | Domain C (post-merge hook) |
| G3 | 병렬 PR 중복 (W-0259 vs PR #485) | 다른 에이전트 동시 비슷한 작업 | Domain D (active issue search) |
| G4 | start.sh re-run으로 ID 3개 발번 | 멱등성 없음 | Domain D (idempotent ID) |
| G5 | Stash 5개 누적 | 세션 종료 시 정리 절차 없음 | Domain A (`/닫기` enhance) |
| G6 | PRIORITIES.md drift fix 수동 | post-merge sync 부재 | Domain C (post-merge hook) |

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 4 domain 동시 진행 시 file 충돌 | 중 | 중 | Domain간 file disjoint 매트릭스 (아래 §Boundary) |
| 기존 슬래시 동작 회귀 | 중 | 상 | each domain PR에 backward-compat AC 명시 |
| post-merge hook이 main에서 동작 안 함 (worktree) | 중 | 중 | hook은 main repo에 있으나 어떤 worktree에서든 발동 가능 (이미 .githooks/post-merge 존재) |
| /설계 재귀 호출 시 ID 발번 race | 낮 | 중 | Domain D idempotent ID 룰 적용 |

### Dependencies

- 선행: ✅ PR #491 (Multi-Agent Orchestration rule) — Domain D G1 부분 완료
- 선행: ✅ PR #487 (W-0260 worktree registry SSOT) — Domain A `/구현` 시 worktree 자동 생성 가능
- 차단 해제: 본 설계 머지 후 W-0265~W-0268 4개 implementation work item 발번 가능

### File / Domain Boundary Matrix

| Domain | 변경 영역 |
|---|---|
| A. Lifecycle | `.claude/commands/구현.md` (신규), `.claude/commands/닫기.md` (enhance), `tools/lifecycle.sh` (신규) |
| B. Parallel | `.claude/commands/병렬.md` (신규), `tools/parallel-orchestrate.sh` (신규) |
| C. Auto Sync | `.githooks/post-merge` (enhance), `tools/sync-priorities.mjs` (신규), `tools/sync-current-md.mjs` (W-0244 기존) |
| D. Safety | `tools/start.sh` (idempotent), `tools/check-active-issues.mjs` (신규 dup 검사), `.claude/commands/설계.md` (active search 추가) |

→ A/B는 `.claude/commands/` 내 다른 파일, C는 `.githooks/`, D는 `tools/start.sh` + 기존 `/설계` enhance — file disjoint OK.

### Rollback Plan

- 각 domain PR은 atomic. 문제 발생 시 단일 PR revert로 100% 복구.
- 기존 슬래시는 모두 backward-compat (새 기능은 추가, 기존 동작 변경 X).

---

## AI Researcher 관점 (Data/Model)

### 측정 대상

본 시스템 개편의 효과 측정:

| 지표 | 베이스라인 (이번 세션) | 목표 |
|---|---|---|
| 세션당 git 사고 발생 | 6 (G1~G6) | ≤ 1 |
| 세션당 PRIORITIES.md drift PR | 1 (PR #465) | 0 (auto sync) |
| 병렬 sub-agent 충돌 | 1 (G1) | 0 (orchestration rule) |
| 머지 후 manual chore PR (sync 위해) | 2 (#465 #482) | 0 (post-merge hook) |
| Agent ID 중복 발번 | 3 (A043/A044/A045) | 0 (idempotent) |
| /검증 대비 manual sync 비율 | ~30% | < 5% |

측정 방법: 다음 5 세션 retrospective에서 위 지표 카운트.

### Failure Modes

1. **Type-1 (false trigger)**: post-merge hook이 잘못된 work item을 close 처리 → PRIORITIES drift 반대 방향
   - 완화: hook이 변경 검증 (work item state machine)
2. **Type-2 (silent failure)**: hook 실패 시 사용자 모름
   - 완화: hook 실패 시 stderr + 다음 `/start`에서 알림
3. **Worktree leak**: isolation="worktree" 사용 후 cleanup 안 됨
   - 완화: `/닫기` 시 stale worktree (≥7d) 자동 검출

### Falsifiable Kill Criteria

- F1: 다음 5 세션 retrospective에서 G1~G6 사고가 1회라도 재발 → 해당 domain 재설계
- F2: post-merge hook이 PRIORITIES.md를 잘못 update해 갭 카운트 ±2 이상 drift → 즉시 disable + incident
- F3: `/병렬` launch 후 sub-agent 충돌 (file overlap) 발생 → 매트릭스 검사 로직 버그, 즉시 fix

---

## Decisions (이 설계에서 확정)

| ID | 결정 | 거절 |
|---|---|---|
| D-W0264-1 | 4-domain 분리 (A/B/C/D), 각자 implementation work item | 단일 PR 통합 (✗ 검토 부담), domain별 별도 design (✗ 메타 시스템은 통합 시야 필요) |
| D-W0264-2 | 본 work item = **설계만** (코드 변경 0) | 설계+구현 묶음 (✗ atomic axis 위반) |
| D-W0264-3 | 측정 가능한 KPI 정의 (사고 카운트 / drift / 충돌) | 정성적 평가 (✗ kill criteria 측정 불가) |
| D-W0264-4 | 기존 슬래시는 backward-compat 유지 | 슬래시 통합/재네이밍 (✗ 사용자 학습 비용 + 회귀 위험) |
| D-W0264-5 | post-merge hook은 .githooks/ (이미 존재) 확장 | 새 CI workflow (✗ local merge 시 작동 안 함, 이미 worktree 정책과 충돌) |

## Open Questions

- [ ] **Q1**: `/구현` 슬래시는 자동 worktree 생성 + mutex 획득까지 처리할까, 아니면 worktree만 생성하고 mutex는 사용자가?
- [ ] **Q2**: post-merge hook이 PRIORITIES.md 갭 카운트를 자동 갱신할 때, P0/P1/P2 라벨 매핑은 어디서 가져올까? (work item frontmatter `priority:` 필드 추가?)
- [ ] **Q3**: `/병렬` 실행 시 file disjoint 검사 실패하면 자동 fail vs 사용자에게 axis 묶음 권고?
- [ ] **Q4**: Idempotent Agent ID — 같은 user가 같은 날 같은 worktree에서 `/start` 재실행 시 같은 ID 재사용 vs 새 ID? (re-run 사용자 의도 모호)

---

## Implementation Plan (4-Domain Phasing)

### Phase A — Slash Lifecycle 4단계 (W-0265, M)

1. `/구현` 신규: design merged 확인 → worktree 생성 → mutex 획득 → 코드 시작 안내
2. `/닫기` enhance: stash 정리 prompt + worktree cleanup 옵션 + handoff 자동 생성

### Phase B — Parallel Orchestration (W-0266, M-L)

1. `/병렬 W-X W-Y W-Z` 신규: 충돌 매트릭스 자동 생성 → file-disjoint면 isolation=worktree로 sub-agent 동시 launch → 사용자 검토
2. `tools/parallel-orchestrate.sh` 헬퍼: file matrix builder

### Phase C — Auto Sync (W-0267, M)

1. `.githooks/post-merge` enhance: 머지된 PR body에서 work item ID 추출 → PRIORITIES.md / CURRENT.md / work/active → completed 자동 update
2. `tools/sync-priorities.mjs` 신규: 갭 카운트 자동 감산 (work item priority frontmatter 기반)
3. (기존 W-0244 F-7) CURRENT.md SHA 자동 갱신과 통합

### Phase D — Safety (W-0268, S-M)

1. `tools/start.sh` idempotent ID: 같은 worktree + 같은 day = 같은 ID
2. `tools/check-active-issues.mjs` 신규: `/설계 "주제"` 시 비슷한 active work item 검색 → 중복 경고
3. `/닫기` 시 stash 정리 + ≥7d worktree 자동 prune prompt

---

## Exit Criteria (이 work item)

- [ ] AC1: 4 domain (A/B/C/D) implementation work item 4개 발번 (W-0265~W-0268)
- [ ] AC2: 각 domain의 file boundary 매트릭스 명시 (file disjoint 검증)
- [ ] AC3: 측정 KPI 6개 베이스라인 명시 (이번 세션 카운트)
- [ ] AC4: Falsifiable F1~F3 임계 명시
- [ ] AC5: PR diff = 설계문서 only (코드 변경 0줄)
- [ ] AC6: 사용자 검토 통과 → 4 domain implementation 시작 가능

---

## References

- 본 세션 사고 사례:
  - PR #491 (Multi-Agent Orchestration rule, G1 부분 해소)
  - PR #482 (PRIORITIES drift sync, G2/G6 사례)
  - PR #490 (W-0259 superseded, G3 사례)
- 기존 인프라:
  - `state/worktrees.json` (PR #487 W-0260 worktree registry SSOT)
  - `.githooks/post-merge` (existing)
  - `work/active/W-0244-f7-meta-automation.md` (CURRENT.md SHA hook 설계)
- Charter: `spec/CHARTER.md` §Coordination + §Frozen
- 4-Domain 후속 work item: W-0265 / W-0266 / W-0267 / W-0268 (본 PR 머지 후 발번)
