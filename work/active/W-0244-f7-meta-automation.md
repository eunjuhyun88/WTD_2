# W-0244 — F-7: 메타 자동화 (CURRENT SHA hook + worktree cron)

> Wave 4 P0 | Owner: engine+app | Branch: `feat/F7-meta-automation`
> **PRD F-7: 1.5일 작업. 즉시 시작 가능. 에이전트 협업 품질 직결.**

---

## Goal

PR 머지 후 CURRENT.md SHA 자동 업데이트 + worktree ≤10 cron으로 에이전트 운영 자동화. 에이전트가 stale SHA로 잘못된 컨텍스트에서 작업하는 문제 제거.

## Owner

engine+app (CI/infra)

---

## CTO 설계

### 1. CURRENT.md SHA post-merge hook

```yaml
# .github/workflows/update-current-sha.yml
on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  update-sha:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          token: ${{ secrets.GITHUB_TOKEN }}
      - name: Update CURRENT.md SHA
        run: |
          SHA=$(git rev-parse HEAD)
          DATE=$(date -u +%Y-%m-%d)
          sed -i "s/main SHA: [a-f0-9]*/main SHA: ${SHA:0:8}/" work/active/CURRENT.md
          sed -i "s/Updated: .*/Updated: ${DATE}/" work/active/CURRENT.md
      - name: Commit SHA update
        run: |
          git config user.email "actions@github.com"
          git config user.name "GitHub Actions"
          git add work/active/CURRENT.md
          git diff --staged --quiet || git commit -m "chore(auto): CURRENT.md SHA → ${SHA:0:8} [skip ci]"
          git push
```

### 2. worktree ≤10 cron

```yaml
# .github/workflows/worktree-cleanup.yml
on:
  schedule:
    - cron: '0 */6 * * *'  # 6시간마다

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Prune stale worktrees
        run: |
          COUNT=$(git worktree list | wc -l)
          if [ "$COUNT" -gt 10 ]; then
            echo "Warning: $COUNT worktrees active. Check .claude/worktrees/"
          fi
          git worktree prune
```

### 3. spec/PRIORITIES.md 자동 동기화

- PR body에 `Closes #N` 있으면 해당 feature checklist `[ ]` → `[x]` 자동 토글
- 기존 `checklist-sync.yml` 확장

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `.github/workflows/update-current-sha.yml` | 신규 — post-merge SHA 업데이트 |
| `.github/workflows/worktree-cleanup.yml` | 신규 — 6h 주기 worktree prune |
| `.github/workflows/checklist-sync.yml` | 변경 — PRIORITIES.md 자동 동기화 확장 |

## Non-Goals

- full CURRENT.md 자동 재생성
- agent 자동 배정

## Exit Criteria

- [ ] PR main 머지 → CURRENT.md SHA 자동 업데이트 (≤5분)
- [ ] worktree cron 6h 주기 작동
- [ ] `[skip ci]` 커밋이 CI loop 유발 안 함
- [ ] App CI ✅

## Facts

1. `.github/workflows/checklist-sync.yml` — 이미 존재. 확장 가능.
2. `GITHUB_TOKEN` — GitHub Actions default, push 권한 필요.
3. PRD F-7: CURRENT.md SHA hook + worktree ≤10 cron.

## Canonical Files

- `.github/workflows/update-current-sha.yml`
- `.github/workflows/worktree-cleanup.yml`
