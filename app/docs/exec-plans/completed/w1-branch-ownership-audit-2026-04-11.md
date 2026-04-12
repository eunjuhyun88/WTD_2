# W1 — Branch / Ownership Hygiene Audit

Date: 2026-04-11
Status: active (audit result)
Source plan: `docs/exec-plans/active/chatbattle-repo-wide-refactor-design-2026-04-11.md` — W1 "Branch and ownership hygiene", Execution Order Phase 1 "Isolate current WIP from trunk refactor".
Worktree: `claude/objective-vaughan` @ `8e7b931`

## Why this audit exists

The repo-wide refactor design (2026-04-11) opened with two W1 concerns:

1. "Current dirty WIP on shared files (`Header`, `+layout.svelte`, `+page.svelte`, `AlphaMarketBar`) would contaminate any trunk refactor."
2. "`safe:sync` is currently blocked by pre-existing uncommitted changes."

Both concerns were written BEFORE the `db71d47` / `eaf7a2e` / `43d09f3` / `13c2579` chain landed on `main`. This audit captures the post-merge state so future slices can start from verified facts, not the design-doc snapshot.

## Audit scope

- Verify no shared UI shell file is being co-edited by `claude/objective-vaughan`.
- Enumerate all active worktrees and confirm none block `safe:sync`.
- Capture the current hotspot file line counts as a new baseline.
- Re-run the route overlap check so the F5 "surface model drift" signal is up to date.
- Confirm warning budget still clean.

## Finding 1 — Shared shell isolation: PASS

`git diff --name-only origin/main...HEAD` on `claude/objective-vaughan` returns only backend + contract + doc files. ZERO files touched in the W1 concern list.

Files changed vs `origin/main`:
- `docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md`
- `docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md`
- `src/lib/contracts/ids.ts`
- `src/lib/server/douni/toolExecutor.ts`
- `src/lib/server/providers/index.ts`
- `src/lib/server/providers/rawSources.ts`
- `src/lib/server/scanner.ts`
- `src/routes/api/cogochi/thermometer/+server.ts`

Concern files that REMAIN owned by `main` on this branch:
- `src/components/layout/Header.svelte`
- `src/routes/+layout.svelte`
- `src/routes/+page.svelte`
- `src/components/cogochi/AlphaMarketBar.svelte`

→ This branch carries zero collision risk against any future slice that needs those files.

## Finding 2 — Working tree + safe:sync: PASS

- `git status` clean on `claude/objective-vaughan`.
- `npm run safe:status` reports 8 committed changes vs `origin/main`, no uncommitted files.
- `safe:sync` is no longer blocked.

## Finding 3 — Worktree inventory (snapshot 2026-04-11)

```
CHATBATTLE                          13c2579 [main]
chore-docs                          a45ab5e [chore/docs-consolidation-2026-04-11]
compassionate-jepsen                d11c835 [claude/compassionate-jepsen]    (14 behind main)
crazy-beaver                        fde1f89 [claude/crazy-beaver]
hardcore-kapitsa                    ad33a6a [claude/hardcore-kapitsa]        (runs dev server on 5173)
inspiring-hertz                     13c2579 [claude/inspiring-hertz]         (= main)
jovial-satoshi                      dcf0ce5 [feat/research-spine]
objective-vaughan                   8e7b931 [claude/objective-vaughan]       ← THIS
upbeat-lovelace                     13c2579 [claude/upbeat-lovelace]         (= main)
```

Notes:
- 9 worktrees. Three (`inspiring-hertz`, `upbeat-lovelace`, `CHATBATTLE` root) sit exactly at `main`.
- `compassionate-jepsen` is the Phase 0 contracts origin — already merged into `main`.
- `hardcore-kapitsa` is the only worktree holding a running dev server (port 5173 conflict reason for `autoPort: true` in `.claude/launch.json`).
- None of the worktrees show uncommitted WIP.

## Finding 4 — Hotspot file line counts (new baseline)

| File | 2026-04-11 audit | Design doc snapshot | Delta |
|---|---:|---:|---:|
| `src/routes/arena/+page.svelte` | 4236 | 4237 | -1 |
| `src/components/arena/ChartPanel.svelte` | 4002 | 4003 | -1 |
| `src/routes/terminal-legacy/+page.svelte` | 3453 | 3454 | -1 |
| `src/components/terminal/IntelPanel.svelte` | 2775 | 2776 | -1 |
| `src/routes/passport/+page.svelte` | 2688 | 2689 | -1 |
| `src/routes/cogochi/scanner/+page.svelte` | 1634 | 1635 | -1 |
| `src/routes/terminal/+page.svelte` | **1660** | 1596 | **+64** |

The seven primary hotspots total **~20.4k lines**. Six are essentially flat; `terminal/+page.svelte` grew +64 lines post-design-doc due to the LLM greeting + friendly error UI shipped in `db71d47` / `4ceda4b`.

Interpretation: none of the god-route decomposition work (W2 in the design doc) has started yet. The refactor trunk is still at Phase 0.

## Finding 5 — Surface model drift (F5 signal): STILL ACTIVE

Current top-level route map (`ls src/routes/`):

```
agent  agents  api  arena  arena-v2  arena-war  battle  cogochi
create  creator  dashboard  holdings  lab  live  onboard  oracle
passport  scanner  settings  signals  terminal  terminal-legacy  world
```

Plus `cogochi/` subdirectory contains `scanner/` (so `/cogochi/scanner` is still live). `/cogochi/terminal` was deleted in `eaf7a2e` and is no longer present.

Overlap clusters:

| Cluster | Routes | Canonical intent |
|---|---|---|
| Arena / proof | `/arena`, `/arena-v2`, `/arena-war`, `/battle` | one proof route |
| Terminal / scan | `/terminal`, `/terminal-legacy`, `/scanner`, `/cogochi/scanner` | one terminal + scan surface |
| Profile / agent | `/passport`, `/agent`, `/agents` | one profile route |
| Creation | `/onboard`, `/create`, `/creator` | one creation flow |
| Overview | `/dashboard`, `/holdings` | one overview surface |
| Experimental | `/live`, `/world`, `/oracle`, `/signals` | promote or retire individually |

Canonical product intent from `chatbattle-repo-wide-refactor-design-2026-04-11.md` §F5:
`Home → Onboard → Dashboard → Terminal (optional) → Lab → Battle → Agent`

Active drift count: 26 top-level routes vs canonical 7 = ~19 drift surfaces. Phase 5 in the design doc (W5 + W6) is where this gets resolved. No action required in W1.

## Finding 6 — Warning budget: PASS

```
[warning-budget] summary: errors=0 warnings=0 budget=49
[warning-budget] passed.
```

The Phase 1 A-P0 slice (B commits `5a796bf` → `8e7b931`) added 265+ lines of new typed adapter code without burning any budget.

## W1 exit summary

| Gate | Result |
|---|---|
| `claude/objective-vaughan` avoids shared shell files | ✅ |
| Working tree clean on this branch | ✅ |
| `safe:sync` unblocked | ✅ |
| Warning budget clean | ✅ |
| Hotspot baseline captured | ✅ |
| Route overlap map captured | ✅ |
| No dirty WIP on any other worktree | ✅ |

**W1 is closed for the objective-vaughan branch.** The design-doc concerns that triggered W1 were already neutralized by the alpha-flow terminal integration commits landing on `main` before this branch started. No follow-up ownership work is needed for the currently shipped slices.

## What W1 does NOT claim

- The other eight worktrees are not audited for their own slice boundaries. Each branch owner must verify their own shared-file touches before merging into `main`. This document only certifies `claude/objective-vaughan`.
- Hotspot decomposition (W2) has not started. These line counts are a baseline for a future slice.
- Surface reduction (W5 / W6) has not started. 26 → 7 route consolidation remains open.

## Next W-slice candidates

Ordered by the design doc's execution order:

1. **W2 Phase 2 first target** — `terminal-legacy/+page.svelte` (3453 LOC) decomposition.
2. **W4 first target** — pick canonical terminal route ownership and make `cogochi/scanner` a wrapper or redirect.
3. **W3** — `priceStore` authority repair (cannot be attempted until a route shell is already split, because the current WIP is too tangled).

These are FUTURE slices. W1 does not commit to any of them.
