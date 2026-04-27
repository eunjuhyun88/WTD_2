# W-0266 — Parallel Orchestration `/병렬` Slash

> Wave: Meta / Tooling | Priority: **P0** | Effort: **M-L (3-4d)**
> Charter: ✅ governance / runbook
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-28
> Parent: W-0264 §B

---

## Goal (1줄)

`/병렬 W-X W-Y W-Z` 한 줄로 N개 work item에 대해 자동 충돌 매트릭스 생성 + file-disjoint 검증 + isolation="worktree" sub-agent 동시 launch + main agent는 통합/검토 역할만 수행하도록 표준화한다.

## Scope

### 포함

- `/병렬 W-#### W-#### [W-####...]` 신규 슬래시 (`.claude/commands/병렬.md`)
- `tools/parallel-orchestrate.sh` 신규 헬퍼:
  - `analyze_conflicts <W-IDs>` — 각 work item의 §Files Touched 파싱 → 매트릭스 생성
  - `launch_parallel <W-IDs>` — file-disjoint 검증 통과 시 sub-agent 동시 launch (Agent tool with isolation="worktree")
- 매트릭스 출력 포맷: 표 (work item × file/dir) → disjoint 여부 표시
- 충돌 발견 시 자동 fail + axis 묶음 권고 (예: 같은 dataclass 수정이면 한 work item으로)

### Non-Scope

- ❌ sub-agent 자체 작업 prompt 자동 생성 (사용자가 work item 설계문서 따르도록 유도)
- ❌ sub-agent 결과 자동 통합 (main agent가 PR 검토 수동)
- ❌ 3개 초과 동시 launch (token 부담 + 매트릭스 검증 시간 ↑)

---

## CTO 관점 (Engineering)

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| §Files Touched 파싱이 정확하지 않아 false-disjoint | 중 | 상 | conservative parsing — 인용된 path 패턴만 (`engine/...`, `app/...`), 모호하면 conflict로 표시 |
| sub-agent 동시 launch 시 token 폭주 | 높음 | 중 | max 3 work item, 각자 isolation=worktree로 token 격리 |
| sub-agent 중 1개 실패 시 처리 | 중 | 중 | each sub-agent의 PR 결과 main agent가 개별 검토 |
| `/병렬` 사용자가 work item ID 잘못 지정 | 낮 | 낮 | 시작 전 각 work item 존재 검증 + 매트릭스 보여주고 confirm |

### Dependencies

- 선행: W-0265 (`/구현` 슬래시) — sub-agent 각자 `/구현`으로 fresh worktree 진입
- 선행: PR #491 (isolation rule)
- 차단 해제: 본 슬래시 머지 후 multi-work-item 작업 자동 병렬 가능

### Files Touched

- `.claude/commands/병렬.md` (신규, ~100줄)
- `tools/parallel-orchestrate.sh` (신규, ~150줄)
- `tools/file-conflict-matrix.mjs` (신규, ~100줄, work item §Files Touched 파싱)

### Workflow

```
/병렬 W-X W-Y W-Z
   ↓
[1] tools/file-conflict-matrix.mjs W-X W-Y W-Z
       ↓
   매트릭스 출력:
   | work | engine/X | app/Y | engine/Z |
   | W-X  |   ✏️    |       |          |
   | W-Y  |         |  ✏️   |          |
   | W-Z  |         |       |    ✏️    |
   → disjoint OK
   ↓
[2] 사용자 confirm (y/n)
   ↓
[3] tools/parallel-orchestrate.sh launch
       sub-agent A (W-X, isolation=worktree, run_in_background=true)
       sub-agent B (W-Y, isolation=worktree, run_in_background=true)
       sub-agent C (W-Z, isolation=worktree, run_in_background=true)
   ↓
[4] main agent: 각 sub-agent 완료 알림 받음 → 결과 검증 → PR 머지
```

### Rollback Plan

- 단순 슬래시 추가만, 기존 동작 변경 0 → revert 단일 commit
- sub-agent launch 실패 시 worktree 자동 cleanup (isolation="worktree" 기본 동작)

---

## AI Researcher 관점

### Failure Modes

1. **False disjoint**: 매트릭스에서 disjoint로 표시됐는데 실제 sub-agent들이 같은 파일 건드림
   - 완화: parser conservative (모호 path = conflict). 사용자가 합의 후 진행
2. **Token explosion**: 3 sub-agent × work item 컨텍스트 = main session보다 큼
   - 완화: max 3 + sub-agent prompt에 work item file path만 명시 (전체 codebase grep 금지)
3. **Sub-agent infinite loop**: 한 sub-agent가 stuck → 다른 진행 차단 X (격리)
   - 완화: 각 sub-agent timeout (예: 30분)

### KPI

- 병렬 launch 후 sub-agent 충돌 발생률 (목표 0)
- 매트릭스 false-disjoint 비율 (목표 < 5%)
- main agent의 sub-agent 통합 시간 (목표 < 5분/work item)

### Falsifiable

- F1: 매트릭스 검사 후 launch했는데 sub-agent 충돌 발생 → parser 버그, 즉시 disable + fix

---

## Decisions

| ID | 결정 | 거절 |
|---|---|---|
| D1 | max 3 work item per `/병렬` | unlimited (✗ token + 매트릭스 검증 비용) |
| D2 | parser는 conservative (모호 = conflict) | aggressive disjoint (✗ false positive 위험) |
| D3 | 각 sub-agent는 isolation="worktree" 강제 | 옵션 (✗ G1 사고 재발 위험) |
| D4 | 매트릭스 출력 후 사용자 confirm | 자동 launch (✗ 큰 변경 검토 없이 진행) |

## Open Questions

- [ ] Q1: 매트릭스 conflict 발견 시 자동 axis 묶음 제안할까 (예: "W-X+W-Y는 한 work item으로 묶으세요")?
- [ ] Q2: sub-agent 결과를 main agent가 어떻게 통합 (PR 머지 순서)?

## Implementation Plan

1. `tools/file-conflict-matrix.mjs` 작성 (work item §Files Touched 파싱)
2. `tools/parallel-orchestrate.sh` 작성 (sub-agent launch wrapper)
3. `.claude/commands/병렬.md` slash 등록
4. 통합 테스트: 3 dummy work item으로 launch + 결과 확인
5. PR open

## Exit Criteria

- [ ] AC1: `/병렬 W-X W-Y W-Z` 한 줄로 매트릭스 + confirm + 3 sub-agent launch
- [ ] AC2: file-disjoint 통과한 work item만 launch (conflict 시 fail + 권고)
- [ ] AC3: 각 sub-agent에 isolation="worktree" 자동 적용
- [ ] AC4: max 3 enforce
- [ ] AC5: PR diff: `.claude/commands/병렬.md` + `tools/parallel-orchestrate.sh` + `tools/file-conflict-matrix.mjs` (3 files, 신규)

## References

- 부모: W-0264 §B
- 선행: PR #491 (isolation rule), W-0265 (`/구현`)
- 사고 사례: 2026-04-27 A045 W-0259 background agent
