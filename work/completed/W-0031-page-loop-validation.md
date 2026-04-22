## Goal

Validate whether the current page composition (`/terminal`, `/lab`, `/dashboard`, `/patterns`) matches the intended core-loop system and identify concrete structural gaps.

## Scope

- Review canonical core-loop and pattern runtime docs.
- Compare intended page responsibilities against current app surfaces.
- Produce a review-style validation with prioritized findings and recommended realignment.

## Non-Goals

- No runtime or UI implementation changes in this work item.
- No engine redesign beyond identifying where page/runtime coupling is misaligned.
- No visual polish review.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0030-core-loop-system-spec.md`
- `docs/product/core-loop-system-spec.md`
- `docs/domains/pattern-engine-runtime.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/routes/lab/+page.svelte`
- `app/src/routes/dashboard/+page.svelte`
- `app/src/routes/patterns/+page.svelte`

## Facts

- Verified: the core-loop spec assigns primary Day-1 roles across `/terminal`, `/lab`, and `/dashboard`.
- Verified: the current app also exposes `/patterns`, which appears to carry pattern-engine runtime responsibilities.
- Verified: this task is a validation/review, not an implementation request.
- Verified: `/terminal` already hosts the live chart, pattern status bar, and capture modal.
- Verified: `/lab` is still centered on strategy-store editing and cycle backtesting, not pattern-engine evaluation records.
- Verified: `/dashboard` still uses placeholder watching and adapter data instead of engine-backed watch or alert records.
- Verified: `/patterns` currently functions as the most complete pattern-ops surface for candidates, states, stats, and verdict actions.

## Assumptions

- The target product shape remains the one described in `docs/product/core-loop-system-spec.md`.
- `/patterns` is currently acceptable as an internal or transitional surface, but not necessarily the intended final product shell.

## Open Questions

- Should `/patterns` remain user-facing long term, or should its responsibilities migrate into `/lab` and `/dashboard`?
- Is `/lab` intended to stay strategy/backtest-centric, or should it become the canonical evaluation plane for pattern instances and verdicts?

## Decisions

- Owner: `research`
- Primary change type: `Research or eval change`
- Verification target: page-to-core-loop alignment and responsibility boundaries
- Validation standard: judge the app against `docs/product/core-loop-system-spec.md`, not against transitional implementation convenience

## Next Steps

- Use `/terminal` as the stable inspect-and-capture surface.
- Decide whether `/patterns` is transitional or permanent.
- If transitional, move candidate inbox and live state visibility into `/dashboard`, and move stats/verdict/evaluation workflows into `/lab`.
- Follow this validation with a new app-surface realignment work item instead of mixing it into engine-state work.

## Exit Criteria

- A clear validation answer exists for whether the current structure is well aligned.
- Findings identify the most important responsibility mismatches.
- Recommended next steps are concrete enough to drive a follow-up implementation work item.

## Handoff Checklist

- Keep findings compact and prioritized.
- Distinguish verified page behavior from inferred product intent.
- Name the exact files that drove each conclusion.
- Do not assume `/patterns` is canonical without an explicit product decision; current evidence suggests it is filling a gap in `/lab` and `/dashboard`.
