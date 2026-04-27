# W-0268 — Safety: G1~G7 Auto-Block

> Wave: Meta / Tooling | Priority: **P0** | Effort: **M (3d)**
> Charter: ✅ governance / runbook
> Status: 🟡 Design Draft (사용자 검토 대기)
> Created: 2026-04-28
> Parent: W-0264 §D

---

## Goal (1줄)

이번 세션 (2026-04-27 A045 + A051 + romantic-tesla agent) 발생한 사고 G1~G7 7개를 detection 수준에서 **prevention 수준**으로 끌어올려 같은 사고가 재발하지 않게 한다.

## Scope

### 포함 — 사고 G1~G7 차단 매트릭스

| ID | 사고 | 현 상태 | 본 work item에서 |
|---|---|---|---|
| G1 | sub-agent worktree 공유 | ✅ PR #491 rule 명시 | hook으로 강제 (Agent tool intercept?) — 실현 가능성 검토 |
| G2 | PRIORITIES drift (W-0215 등) | ✅ W-0267 post-merge sync | duplicate check은 본 work item |
| G3 | 병렬 PR 중복 (W-0259 vs PR #485) | ❌ 미처리 | `tools/check-active-issues.mjs` 신규 — `/설계 "주제"` 시 중복 검사 |
| G4 | start.sh re-run으로 ID 3개 발번 | ❌ 미처리 | start.sh idempotent — 같은 worktree + 같은 day = 같은 ID |
| G5 | stash 5개 누적 | ❌ 미처리 | `/닫기`에 통합 (W-0265에 일부 포함) — stash 정리 prompt 강화 |
| G6 | PRIORITIES drift fix 수동 | ✅ W-0267 post-merge sync | (중복) |
| G7 | stale worktree (≥30 commits) | ⚠️ PR #496 detection only | **prevention 강화**: stale 진입 시 force exit + 자동 worktree 추천 |

### 본 work item 5 sub-tasks

1. **G3 차단**: `tools/check-active-issues.mjs` 신규 — `/설계 "주제"` 또는 `/구현 W-####` 시 비슷한 active work item / open PR 검색 → 중복 경고
2. **G4 차단**: `tools/start.sh` idempotent — `state/agent-id-cache.json`에 (worktree_path, YYYY-MM-DD) → agent_id 매핑 캐시. 같은 키 재호출 시 cached ID 재사용
3. **G5 차단**: `/닫기` 슬래시 (W-0265와 통합) stash list ≥3 시 prune prompt 강제, 사용자가 명시적 keep 결정 필요
4. **G7 prevention 강화**: PR #496 stale check를 enhance:
   - ≥30 commits behind: 단순 echo가 아니라 **`/start` 자체 종료 + 자동 worktree 추천 명령 출력**
   - `tools/safe-worktree-bootstrap.sh` 신규 — 새 worktree 한 줄로 생성 + 진입 안내
5. **G1 hook 검토**: Agent tool 호출 시 isolation="worktree" 누락 검출 → stop signal. (실현 가능성 R&D — Claude Code harness가 hook 노출 여부에 따라)

### Non-Scope

- ❌ G1 강제 hook (실현 가능성 미확정 — 검토만, 안 되면 룰 강화로 fallback)
- ❌ 새 사고 카탈로그 (G8+) 추가 — 본 work item은 G1~G7 한정
- ❌ PR #496 (G7 detection) 변경 — enhance만

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| G7 force exit이 합법적 stale 작업 (예: 의도된 archive) 막음 | 낮 | 중 | `--force` 옵션으로 우회 가능 |
| G4 idempotent ID가 사용자가 진짜 새 ID 원할 때 잘못 재사용 | 낮 | 낮 | `--new-id` 옵션 |
| G3 dup 검사가 실제로 disjoint한 비슷한 주제를 false-positive | 중 | 중 | 사용자 confirm (검사 실패 ≠ launch 실패) |
| G1 hook 실현 안 되면 룰만 남음 | 높음 | 중 | rule + start.sh echo (PR #491 + #496) 강화 → 사용자 자가 검사 |

### Dependencies

- 선행: PR #491 (G1 rule), PR #496 (G7 detection), W-0265 (`/닫기`), W-0267 (post-merge sync)
- 차단 해제: 본 work item 머지 후 G1~G7 재발률 측정 가능

### Files Touched

- `tools/check-active-issues.mjs` (신규, ~120줄)
- `tools/start.sh` (enhance: idempotent ID + G7 force exit, ~30줄 추가)
- `tools/safe-worktree-bootstrap.sh` (신규, ~50줄)
- `state/agent-id-cache.json` (신규 cache)
- `.claude/commands/설계.md` (enhance: dup 검사 호출, ~10줄)
- `.claude/commands/닫기.md` (enhance: stash prune 강화, ~15줄)

### Workflow — G7 Prevention 강화

```
사용자가 stale worktree에서 /start 호출
   ↓
[1] start.sh: STALE_COMMITS=$(git rev-list --count HEAD..origin/main)
   ↓
[2] STALE_COMMITS ≥ 30:
       echo "🚨 STALE WORKTREE — 본 worktree 진입 차단"
       echo "  자동 새 worktree 생성:"
       echo "    ./tools/safe-worktree-bootstrap.sh feat/W-XXXX-{slug}"
       exit 1   ← (현 PR #496은 echo만 하고 계속 진행. 본 work item은 exit 1)
```

`tools/safe-worktree-bootstrap.sh`:
```bash
#!/bin/bash
BRANCH=${1:?branch name required}
NAME=$(echo "$BRANCH" | sed 's|/|-|g')
git fetch origin main --quiet
git worktree add ".claude/worktrees/$NAME" "origin/main" -b "$BRANCH"
echo "✅ New worktree: .claude/worktrees/$NAME"
echo "  cd .claude/worktrees/$NAME && /start"
```

### Workflow — G4 Idempotent ID

```
/start 호출
   ↓
KEY="$(pwd)+$(date +%Y-%m-%d)"
CACHED_ID=$(jq -r ".[\"$KEY\"]" state/agent-id-cache.json)
if [ -n "$CACHED_ID" ] && [ "$CACHED_ID" != "null" ]; then
   NEXT_ID=$CACHED_ID
   echo "Resuming Agent $NEXT_ID (idempotent — same worktree + day)"
else
   NEXT_ID=$(generate_new_id)
   jq ".[\"$KEY\"] = \"$NEXT_ID\"" > state/agent-id-cache.json
fi
```

### Rollback Plan

- 각 sub-task 별 revert 가능 (5 atomic commits)
- G7 force exit이 false positive로 작동하면 `--force` 옵션 즉시 사용

---

## AI Researcher 관점

### Failure Modes

1. **G7 over-blocking**: 정상 stale 작업 (의도된 archive) 막음
   - 완화: `--force` 옵션 + force 사용 카운트 측정 (높으면 threshold 재조정)
2. **G3 false dup**: 다른 주제인데 키워드 비슷해서 dup
   - 완화: 사용자 confirm 후 진행, 검사 실패는 stop이 아닌 warning
3. **G4 cached ID 잘못 재사용**: 같은 worktree에서 다른 작업 (의도된 ID 분리)
   - 완화: `--new-id` 옵션

### KPI

| 지표 | 베이스라인 | 목표 |
|---|---|---|
| G1~G7 재발 (다음 5 세션) | 7/세션 | ≤ 1/세션 |
| G7 force exit 발동률 | 0 | 100% (stale 진입 시) |
| G4 idempotent ID 재사용률 | 0 | 100% (re-run 시) |
| G3 dup 경고 발동률 | 0 | 검출 가능한 dup의 ≥ 80% |

### Falsifiable

- F1: 다음 5 세션 G1~G7 재발 1회 이상 → 본 work item 재설계
- F2: G7 force exit이 정상 작업 ≥ 5% 막음 → threshold ↑

---

## Decisions

| ID | 결정 | 거절 |
|---|---|---|
| D1 | G7 force exit (echo만 X) | echo + 계속 진행 (✗ A051/romantic-tesla 사고 재발) |
| D2 | G4 idempotent = (worktree, day) 키 | (worktree only) (✗ 다른 day는 새 ID 합리적) |
| D3 | G3 dup 검사는 warning, force exit 아님 | force exit (✗ false positive 위험) |
| D4 | G1 hook은 R&D 단계 — 실현 안 되면 룰만 | hook 강제 (✗ harness 한계 가능성) |

## Open Questions

- [ ] Q1: G1 hook이 Claude Code harness에서 실현 가능한가? (Agent tool 호출 intercept) — R&D 후 결정
- [ ] Q2: G4 idempotent 키 = (worktree, day) vs (worktree, branch)?
- [ ] Q3: G7 force exit threshold = 30 commits behind 적정한가? (10? 50?)

## Implementation Plan

1. `tools/safe-worktree-bootstrap.sh` 작성 + start.sh G7 force exit 강화
2. `tools/start.sh` idempotent ID 캐시 추가
3. `tools/check-active-issues.mjs` 작성 + `/설계` `/구현` slash enhance
4. `/닫기` stash prune 강화 (W-0265와 통합 PR)
5. G1 hook 실현 가능성 R&D (Claude Code harness API 조사)
6. 통합 테스트: 5 sub-task 각자 시나리오
7. PR open

## Exit Criteria

- [ ] AC1: G7 force exit (≥30 commits behind 시 start.sh exit 1)
- [ ] AC2: `tools/safe-worktree-bootstrap.sh` 한 줄로 새 worktree 생성
- [ ] AC3: G4 idempotent ID 캐시 (`state/agent-id-cache.json`)
- [ ] AC4: G3 dup 검사 (`tools/check-active-issues.mjs`)
- [ ] AC5: `/닫기` stash list ≥3 시 prune prompt
- [ ] AC6: G1 hook R&D 결과 문서화 (실현 가능 시 구현, 안 되면 룰 강화)
- [ ] AC7: 다음 5 세션 G1~G7 재발 측정 (benchmark)

## References

- 부모: W-0264 §D
- 선행: PR #491 (G1 rule), PR #496 (G7 detection), W-0265 (lifecycle), W-0267 (post-merge)
- 사고 사례:
  - 2026-04-27 A045 (G1, G2, G3, G4, G5, G6)
  - 2026-04-27 A051 (G7)
  - 2026-04-28 romantic-tesla agent (G7 prevention 부족 사례)
