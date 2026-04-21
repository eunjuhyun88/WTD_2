# W-0123 Public Repo Exposure Audit

## Goal

Assess whether the current repository is safe to keep public by checking for committed secrets, sensitive local artifacts, unsafe public-facing config, and documentation or assets that should not be internet-visible.

## Owner

research

## Scope

- review tracked repo content for hardcoded credentials, private keys, tokens, and internal-only config
- identify local artifacts or metadata that should not live in a public repository
- verify app/engine public exposure risks already visible from repo code and config
- implement safe cleanup for low-risk public-repo hygiene issues
- remove already-published local-only artifacts from git history
- produce a prioritized report with evidence and any remaining concrete cleanup recommendations

## Non-Goals

- broad secret rotation or remote platform remediation outside this repository
- auditing remote GitHub settings outside local repo evidence
- re-reviewing unrelated performance or product architecture issues

## Canonical Files

- `work/active/W-0123-public-repo-exposure-audit.md`
- `AGENTS.md`
- `docs/domains/app-route-inventory.md`
- `.gitignore`
- `.env.example`

## Facts

- The current branch is `codex/w-0123-w-0124-public-hardening`, split from `origin/main` to isolate the public-hardening merge unit.
- This worktree contains only the scoped public-hardening and engine-ingress changes needed for the new PR.
- `docs/domains/app-route-inventory.md` documents a broad app API surface including a passthrough engine proxy.
- Current-tree secret pattern scans did not find obvious live API tokens, private keys, or committed `.env` files in tracked files or git history.
- Tracked repo content still includes internal-only artifacts such as `.claude/*`, `app/docs/AGENT_WATCH_LOG.md`, `research/experiments/experiment_log.jsonl`, and `tmp/telegram_refs/*.html`.
- Cleanup-in-place is feasible without deleting local working copies by untracking those paths and extending `.gitignore`.
- `engine/api/routes/jobs.py` currently allows low-blast-radius hardening: fail closed when `SCHEDULER_SECRET` is missing, with targeted route tests.
- A mirror-clone `git filter-repo` rewrite has removed the confirmed local-only artifact paths from branch history and force-updated the remote branch heads.

## Assumptions

- The user wants immediate cleanup for obvious public-repo hygiene issues.
- Public repo risk is defined by committed content plus configuration and code patterns visible to outside readers.

## Open Questions

- Whether the associated GitHub Actions/Vercel project secrets were also reviewed outside the repository.

## Decisions

- Use a minimal audit pack focused on repo visibility, secrets, and public-facing config.
- Treat evidence already present in code as actionable even if infrastructure mitigations may exist elsewhere.
- Separate findings into two classes: confirmed public-repo hygiene issues vs deployment-risk issues that matter if the engine runtime is internet reachable.
- Prefer non-destructive cleanup: untrack local artifacts with `git rm --cached`, extend ignore rules, and avoid deleting the user's local working copies.
- Limit code hardening in this pass to low-blast-radius fixes with targeted tests.
- Sanitize real infrastructure identifiers in public design docs when they are not needed to understand the architecture.
- Use history rewrite only for confirmed local-only artifacts that were already untracked in the current tree cleanup.
- Split a new merge unit from `origin/main` for this cleanup because `claude/cto-security-perf-refactor` contains unrelated perf/refactor commits that would muddy review and create avoidable conflicts.

## Next Steps

- confirm whether any open GitHub PR refs or forks still retain pre-rewrite commits
- separately review hosted platform secrets and secret-scanning alerts that are not visible from local repo state

## Exit Criteria

- committed/publicly visible risks are identified with file evidence
- low-risk hygiene fixes are applied without deleting local working copies
- false alarms are separated from confirmed issues
- the user gets a clear keep-public vs fix-first recommendation

## Handoff Checklist

- active work item: `work/active/W-0123-public-repo-exposure-audit.md`
- branch: `codex/w-0123-w-0124-public-hardening`
- verification: repo scan, current-tree cleanup, history rewrite, and targeted `jobs` auth verification completed
- remaining blockers: GitHub-side secret scanning is out of band, and GitHub-hidden PR refs were not rewritten by the forced branch-head push
