# W-0318 — Lifecycle Reconciliation Ports

> Wave: 4 | Priority: P1 | Effort: S | Issue: #674
> Status: Implemented — awaiting PR merge

## Goal

Reconcile the stale lifecycle PR branch after W-0307/W-0308 landed, then port only the safe improvements that make the core loop easier to operate.

## Owner

engine + app

## Scope

- Add `GET /patterns/lifecycle` for all PatternObject lifecycle statuses.
- Add SvelteKit proxy `GET /api/patterns/lifecycle`.
- Add `/patterns/lifecycle` management page.
- Fix legacy library patterns to default to `object`, not `draft`.
- Keep lifecycle archive aligned with the active variant scanner registry.

## Non-Goals

- No direct merge of `origin/feat/W-0308-f14-lifecycle-ui`.
- No Supabase lifecycle migration in this slice; current migrations do not define a `patterns` table contract.
- No rewrite of the already-merged W-0308 detail-page promote card.

## Canonical Files

- `engine/patterns/lifecycle_store.py`
- `engine/api/routes/patterns.py`
- `engine/tests/test_pattern_lifecycle.py`
- `app/src/lib/api/lifecycleApi.ts`
- `app/src/lib/components/patterns/PatternLifecycleCard.svelte`
- `app/src/routes/api/patterns/lifecycle/+server.ts`
- `app/src/routes/patterns/lifecycle/+page.svelte`

## Facts

1. `origin/main` already includes W-0307 (#671), W-0308 (#672), W-0315 (#668), and W-0316 (#667).
2. Open PR #673 is conflicting and contains a second lifecycle implementation.
3. #673's DB migration references a `patterns` table, but current app migrations do not define that table.
4. #672 defaults lifecycle status to `draft` for every slug, which mislabels existing production library patterns.
5. `active_variant_registry.py` already supports operator variants and file-backed removal.

## Assumptions

- Built-in `PATTERN_LIBRARY` entries are production `object` unless explicitly archived or overridden.
- Lifecycle list belongs at `/patterns/lifecycle`, not `/patterns/candidates`, because candidates already means live entry candidates.

## Open Questions

- Should a later DB mirror use Supabase `patterns` or a dedicated lifecycle table owned by engine?

## Decisions

- [D-0318-1] Hand-port list API/page from #673; reject direct merge because it conflicts with #672 and overwrites route semantics.
- [D-0318-2] Do not ship migration 031 from #673; it is not contract-safe against current migrations.
- [D-0318-3] Treat legacy library patterns as `object` by default; explicit lifecycle records override.

## Next Steps

1. Implement lifecycle list endpoint and page.
2. Run targeted engine/app verification.
3. Merge W-0318 PR, then close stale PR #673 with a port note.

## Exit Criteria

- [x] `GET /patterns/lifecycle` returns all known PatternObjects with default `object` status.
- [x] `/patterns/lifecycle` renders and can trigger existing transition modal.
- [x] `archive` removes the active variant registry entry.
- [x] Engine lifecycle tests pass.
- [x] App lifecycle API tests and `npm --prefix app run check` pass.

## Verification

- `cd engine && uv run pytest tests/test_pattern_lifecycle.py -q --tb=short` — pass, 6 tests
- `npm --prefix app test -- lifecycleApi.test.ts` — pass, 5 tests
- `npm --prefix app run check` — pass, 0 errors / 51 warnings
- `npm --prefix app run contract:check:engine-types` — pass

## Handoff Checklist

- [ ] PR merged.
- [ ] Stale PR #673 closed or superseded.
- [ ] Remaining lifecycle DB mirror question captured for a later work item.
