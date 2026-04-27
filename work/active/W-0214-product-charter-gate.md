# W-0214 — Product Charter Gate

## Goal

Keep agents pointed at the product core by enforcing `spec/CHARTER.md`, syncing the stale live index, and recording which proposed tasks are actually in `main`.

## Owner

contract

## Scope

- Maintain the PR #347 charter gate and priority reset.
- Sync `work/active/CURRENT.md` to `origin/main` `3ce9cf5d`.
- Record the 25-item main-status audit below.
- Mark PR #346 / W-0145 as merged into `main`.

## Non-Goals

- New active-claims JSON store.
- CURRENT auto-sync GitHub Action.
- MemKraft, Multi-Agent OS, slash-command, or session-history expansion.
- Implementing L3-L7 product features in this work item.

## Canonical Files

- `spec/CHARTER.md`
- `spec/PRIORITIES.md`
- `work/active/CURRENT.md`
- `work/active/W-0214-product-charter-gate.md`
- `tools/claim.sh`
- `tools/start.sh`

## Facts

- PR #347 landed the charter gate at `8d8ea7ad`.
- `work/active/CURRENT.md` on `main` still pointed at `c0ab48dc`, W-0213, and W-0212 after PR #347.
- PR #346 merged W-0145 search corpus 40+ dimensional weighted L1 into `main`.
- PR #313 merged Copy Trading Phase 1, but public copy trading remains frozen/non-goal.
- PR #281 merged several core infrastructure files, but follow-up verification is still required before treating them as complete product paths.

## Assumptions

- "Main status" means `origin/main` plus open PR state as of 2026-04-26.
- Future search changes need a fresh eval/regression work item now that PR #346 has merged.

## Open Questions

- Should L6 Ledger durability remain P0, or should L7 Verdict Loop UI become the next product implementation?

## Decisions

- Preserve PR #347's charter/claim/start implementation; do not duplicate or widen it.
- Use this work item as the durable audit table for the proposed task list.
- Treat #346 as complete; do not keep W-0145 in the active queue unless a new eval/regression slice is opened.
- Leave automation proposals frozen unless they directly enforce the charter with small scope.

## Main Status Audit

| # | Item | Main status at `3ce9cf5d` | Disposition |
|---|---|---|---|
| 1 | CURRENT.md main SHA sync | Stale before this follow-up: `c0ab48dc` | Fix in W-0214 follow-up |
| 2 | W-0132 Copy Trading status | PR #313 merged Phase 1 | Frozen beyond landed Phase 1 |
| 3 | Worktree 52+ cleanup | Local hygiene, not product code | Manual cleanup only |
| 4 | PR #281 infra verification | Merged; files exist | Verify before relying on stats/context/wiki |
| 5 | L3 hardcoded library -> registry-backed | `PATTERN_LIBRARY` still hardcoded; JSON registry seeded | Core TODO |
| 6 | W-0160 definition versioning | `definition_id` helpers and capture columns exist; no canonical `pattern_objects` DB | Partial core TODO |
| 7 | L4 durable state_store | SQLite WAL + Supabase sync exists | Verify hot path and hydration |
| 8 | Scan cycle idempotency tests | No scanner-cycle idempotency test found | Core TODO |
| 9 | `engine/rag/embedding.py` naming docstring | Missing explicit "not semantic RAG" note | Quick TODO |
| 10 | W-0145 40+ dim corpus | PR #346 merged; `_signals.py` + runtime/similar/test updates are in main | Done for this slice; future quality work needs new eval item |
| 11 | Pattern Stats Engine output | `engine/stats/engine.py` exists; no dedicated tests found | Verify/fill tests |
| 12 | Ledger 4-split | Single `pattern_ledger_records` + JSON file store remain | Core TODO |
| 13 | JSON ledger backfill | No backfill script found | Core TODO after ledger schema |
| 14 | Verdict loop UI | Capture/verdict routes/tests exist; full L7 loop not closed | Product P1/P0 candidate |
| 15 | Personal variant runtime registry | `active_variant_registry.py` exists | Verify runtime adoption |
| 16 | AI Parser endpoint | `/search/query-spec/transform` is deterministic transform, not LLM parser | Phase 2 TODO |
| 17 | Visualization Intent Router | No intent-template router implementation found | Phase 2 TODO |
| 18 | Context Assembly rules | `engine/agents/context.py` exists | Verify integration/tests |
| 19 | Wiki + WikiIngestAgent | `engine/wiki/ingest.py` exists | Verify schema/triggers/tests |
| 20 | LambdaRank Reranker | Docs only; no `engine/search/reranker/` in main | Phase 3 after verdict data |
| 21 | Semantic RAG | Not present; deterministic `engine/rag/embedding.py` only | Phase 3 after news ingest |
| 22 | Read/Display BFF `/api/v2/workspace/{symbol}/{tf}` | Not present; app has `/api/cogochi/workspace-bundle` | Defer until L6/L7 shape stabilizes |
| 23 | GCP worker Cloud Build trigger | Setup script exists; cloud state human-owned | Human infra |
| 24 | Vercel `EXCHANGE_ENCRYPTION_KEY` production | Not verifiable in repo | Human infra |
| 25 | `app/vercel.json` branch guardrail | Present and disables main/master/agent auto-deploy | Done |

## Next Steps

1. Merge the CURRENT sync + main-status audit follow-up.
2. Create the next product implementation work item for L6 Ledger durability or L7 Verdict Loop UI.
3. Use a separate eval/regression item for any post-#346 search quality work.

## Exit Criteria

- [ ] `CURRENT.md` points at `3ce9cf5d`.
- [ ] `CURRENT.md` no longer lists W-0213 or W-0212 as active.
- [ ] The 25-item proposed task list has a main-status disposition.
- [ ] MemKraft protocol validation passes for active work items.

## Handoff Checklist

- [ ] Do not touch `engine/search/*` without a new search eval/regression work item.
- [ ] Keep meta-tool work frozen unless the user explicitly approves a small safety fix.
- [ ] Next product PR starts from `spec/CHARTER.md` and `spec/PRIORITIES.md`.
