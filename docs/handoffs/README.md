# Handoffs

Purpose:
- leave branch- or slice-level continuation notes that another agent can use immediately

Use this folder when:
- work is partially complete
- a second agent must continue on a different path scope
- a reviewer needs a precise resume note
- a worktree is being merged, paused, or re-routed

Rules:
- handoffs are not canonical architecture docs
- if a handoff contains a stable rule, promote that rule into `docs/decisions/` or another canonical doc
- prefer one file per active slice or branch

Minimum handoff fields:
- branch or worktree
- owned paths
- finished work
- unfinished work
- blockers or risks
- exact next step
