# ADR-010 — Memory Sync Queue

## What

Use one `automation/memory-sync-queue` branch and one open memory sync PR for merge-event recording instead of creating `automation/memory-sync-pr-<number>` for every merged PR.

## Why Now

Multiple PRs can merge before the previous memory sync PR lands. The old per-PR branch model made each automation branch edit the same files from different stale bases:

- `memory/sessions/*.jsonl`
- `work/active/CURRENT.md`

That created repeated conflicts, stale `main SHA` lines, and stale pending-PR rows.

## How

- Serialize memory sync workflow runs with a `memory-sync` concurrency group.
- Reuse `automation/memory-sync-queue` for new memory events.
- Skip memory-sync branches broadly with `startsWith(head.ref, 'automation/memory-sync')`.
- Keep `CURRENT.md` on the latest main copy before applying the new SHA/date update.
- Make `sync_memory.py` idempotent for already-recorded PR events.
- Use `Asia/Seoul` for `CURRENT.md` date headers instead of UTC.

## Verification

- Run `env CI=1 ./scripts/contract-check.sh`.
- Confirm PR #322 has required checks: `App CI`, `Contract CI`, `Engine Tests`.
- After merge, confirm future memory sync events update or create only `automation/memory-sync-queue`.
