---
name: Worktree discipline — never cd out during edits
description: When operating a dedicated task worktree, all Edit/Read/commit operations must stay inside that worktree path. cd into the primary checkout causes commits to land on main.
type: feedback
originSessionId: 45567dac-e993-4913-8e5b-6b93837dad95
---
Stay inside the worktree directory when working on a task branch.

**Why:** W-0086 slice 1 (2026-04-18) committed onto `main` by accident
because a `cd /Users/ej/Projects/wtd-v2/engine && git commit` landed in
the primary checkout instead of the dazzling-jepsen worktree. Had to
`git reset --hard` main and cherry-pick the commit back onto the task
branch. Same session, slice 3 docstring edit initially wrote to the
wrong worktree's file path. Low-consequence because nothing was pushed,
but wasted recovery steps.

**How to apply:**
- When CLAUDE.md / memory indicates a dedicated worktree, resolve all
  Read/Edit paths under that worktree's root
  (`/Users/ej/Projects/wtd-v2/.claude/worktrees/<name>/...`), never
  under `/Users/ej/Projects/wtd-v2/...` directly.
- Before every Bash `git commit`, verify `git branch --show-current`
  is the task branch, not `main`.
- If tests need cached data that only exists in the main checkout,
  symlink the cache into the worktree (as done for
  `engine/data_cache/cache`) rather than `cd` into main.
