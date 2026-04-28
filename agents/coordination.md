# Coordination Context (멀티 에이전트 · PR · 머지 작업 시 로드)

> 이 파일은 worktree 관리, PR 생성/머지, 에이전트 간 조율 작업 시 로드.

---

## 1 에이전트 = 1 worktree = 1 branch = 1 issue

충돌 방지 매트릭스:
- 병렬 sub-agent 시 **반드시** `isolation: "worktree"` 옵션
- 같은 파일 동시 수정 = merge conflict → 순차 실행으로 전환

```python
# ✅ 올바른 sub-agent 생성
Agent(
    description="...",
    subagent_type="general-purpose",
    isolation="worktree",   # 필수
    run_in_background=True,
    prompt="..."
)
```

## Worktree Registry

```bash
tools/worktree-registry.sh get              # 현재 worktree 매핑
tools/worktree-registry.sh list --mine      # 내 worktrees
tools/worktree-registry.sh list --orphan    # stale worktrees
```

## Branch 명명

```
feat/{Issue-ID}-{slug}   예: feat/W-0290-cursor-grade-code
chore/{slug}             예: chore/priorities-gap-sync-v2
fix/{slug}               예: fix/gate-v2-null-check
```

## Mutex (에이전트 충돌 방지)

```bash
# 작업 시작 전 — 다른 에이전트가 같은 파일 작업 중인지 확인
gh issue list --state open --json number,title,assignees | jq '.[] | select(.assignees|length>0)'

# 내 issue 취득
gh issue edit N --add-assignee @me
```

## PR 생성 패턴

```bash
gh pr create \
  --title "feat(W-####): 한 줄 요약" \
  --body "$(cat <<'EOF'
## Summary
- 변경 1
- 변경 2

## Test
- [ ] pytest PASS
- [ ] CI green

Closes #ISSUE_NUM
EOF
)"
```

## 머지 후 정리

```bash
# work item completed 이동
bash tools/complete_work_item.sh W-####

# worktree 회수
git worktree remove .claude/worktrees/<slug>
tools/worktree-registry.sh remove --path .claude/worktrees/<slug>

# branch 삭제
git branch -d feat/W-####-slug
git push origin --delete feat/W-####-slug
```

## main SHA 업데이트

```bash
# PR 머지 후 CURRENT.md main SHA 갱신
git fetch origin main
git log origin/main --oneline -1
# → CURRENT.md "## main SHA" 라인 업데이트
```

## 도메인 docs

- `docs/runbooks/multi-agent-coordination.md`
- `CLAUDE.md` §Multi-Agent Orchestration
