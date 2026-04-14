## § 17. Phase 2/3 Roadmap (summary)

### Phase 2 (M3~M6)

- `/market` — verified adapters listed, 15% take rate, no subscription
- `/copy` — copy trade based on archetype + adapter + live positions
- `/lab` dual-mode unlock (Backtest + AutoResearch)
- Doctrine weight slider UI in `/agent/[id]`
- Education mode in Terminal (Persona: Mina)

### Phase 3 (M6+)

- `/battle` — HP + ERA reveal + Memory Cards + character animation
- `cogochi/battle_engine.py` + `build_orpo_pair()` already wired; UX is the gap
- `/passport` — ERC-8004 on-chain track record
- `/world` — BTC history traversal
- API / Model Export (Persona: Dex)

---

## § 18. Implementation Sequence (Week 1-4 after canonical lands)

**Week 1:** docs/COGOCHI.md merged · next PR starts

- PR A: Home landing implementation (MacWindow, 6 sections, shader tune) — 2 days
- PR B: `/terminal` refactor (3-panel → Day-1 shape) — 3 days
- PR C: `/scanner` settings page stub (pattern list + on/off) — 0.5 day
- PR D: `/lab` AutoResearch runner UI (pool counter + history + report) — 2 days

**Week 2:** Python pipeline gaps

- PR E: `cogochi/scanner/` 15-layer (reuse existing factor engine where possible) — 5 days
- PR F: `cogochi/alerts/telegram_bot.py` — 2 days
- PR G: `cogochi/eval/fixed_scenarios.json` (200 cases, stratified) — 3 days

**Week 3:** KTO pipeline

- PR H: `finetune.py` + `prepare.py` (KTO + LoRA runner) — 3 days
- PR I: val gate + adapter swap + version manager — 2 days
- PR J: Weekly report generation (natural language) — 2 days

**Week 4:** Alpha launch prep

- PR K: `/create` 5-step onboarding — 2 days
- PR L: Journey state gates + tooltips — 1 day
- PR M: Closed alpha waitlist email flow + 20-seat gate — 1 day
- PR N: Kill criteria monitoring dashboard (internal) — 1 day

**Alpha launch:** End of Week 4. 20 seats. Goal: H1 testable by end of Week 6 (assuming 1-2 feedbacks/day/user).

---

## § 19. Open Questions (tracked)

1. **KTO vs ORPO in existing Python code.** `cogochi/autoresearch_service.py` has ORPO. § 5 says "KTO first". Refactor timeline?
2. **Memory Card generation from Scanner.** v3 generates cards from Battle only. Should Scanner feedback also mint cards? (Likely yes — same adapter, same data.)
3. **Archetype veto for non-GUARDIAN.** Only `guardian_veto()` exists. Do we add `oracle_boost()`, `crusher_aggression()`, `rider_filter()`?
4. **Dashboard scope.** `/dashboard` is "optional Day-1". Ship it or skip?
5. **Repo split.** Keep `cogochi/*.py` in monorepo forever, or split to `cogochi-autoresearch/` at M3?
6. **Publishing the H1 claim.** When do we write the methodology paper? Alpha end? M3?
7. **Jin-only persona stance.** If we get signups from non-Jin users during alpha, do we expand or hold?

---

## § 20. Appendix — Repo Layout & Boundaries

```
crazy-beaver/                          (this worktree)
├── CLAUDE.md                          Read First = docs/COGOCHI.md
├── ARCHITECTURE.md                    20-line root redirect → docs/COGOCHI.md § 20
├── README.md                          project README
├── AGENTS.md                          agent discipline
│
├── docs/
│   ├── COGOCHI.md                     ← single product canonical (this doc)
│   ├── README.md                      10-line pointer to COGOCHI.md
│   ├── DESIGN.md, FRONTEND.md, ...    operational / infra (untouched)
│   ├── AGENT_*.md                     agent discipline (untouched)
│   ├── design-docs/
│   │   ├── index.md                   rewritten: points to COGOCHI.md
│   │   └── core-beliefs.md            stable agent principles
│   └── (no product-specs/, no page-specs/ — all moved out)
│
├── src/                               SvelteKit frontend
│   ├── routes/
│   │   ├── +page.svelte               Home landing (next PR)
│   │   ├── terminal/+page.svelte      Primary surface (next PR refactor)
│   │   ├── lab/+page.svelte           AutoResearch runner (next PR)
│   │   ├── agent/[id]/+page.svelte    Ownership + history
│   │   ├── create/+page.svelte        DOUNI onboarding
│   │   ├── scanner/+page.svelte       Settings only (next PR)
│   │   ├── dashboard/+page.svelte     Optional
│   │   └── api/
│   │       ├── waitlist/              alpha signup
│   │       ├── autoresearch/          (next PR) bridge to Python
│   │       └── scanner/               (next PR) pattern CRUD
│   ├── components/home/
│   │   ├── MacWindow.svelte           (next PR)
│   │   ├── TerminalMiniPreview.svelte (next PR)
│   │   └── WebGLAsciiBackground.svelte (exists)
│   └── lib/webgl/ascii-trail-shaders.ts (shader tune in next PR)
│
├── cogochi/                           Python AutoResearch service
│   ├── __init__.py
│   ├── autoresearch_service.py        build_orpo_pair() — reused for Scanner feedback
│   ├── battle_engine.py               Phase 3 scaffolding
│   ├── context_builder.py             LLM context assembler
│   ├── skill_registry.py              DOUNI personality
│   ├── scanner/                       (to build) 15-layer + APScheduler
│   ├── alerts/                        (to build) Telegram bot
│   ├── eval/                          (to build) FIXED_SCENARIOS
│   └── deploy/                        (to build) adapter swap
│
└── (user-local, outside git)
    ~/Downloads/기타_문서/
    ├── Cogochi_MasterDesign_v5_FINAL.md
    ├── Cogochi_v5_FlowPatch.md
    ├── COGOCHI_DESIGN_PATCH_v4.1.md
    ├── COGOCHI_BUILD_PLAN.md
    ├── CLAUDE_1.md                    AutoResearch spec
    ├── PIPELINE.md                    Step 0-5 build plan
    ├── cogochi_user_acquisition.html
    └── cogochi-v3-archive-2026-04-11/ ← v3 docs moved here this PR
        ├── README.md
        ├── design-docs/
        ├── product-specs/
        ├── page-specs/
        ├── SYSTEM_INTENT.md
        ├── PRODUCT_SENSE.md
        └── ARCHITECTURE.md
```

### Boundary rules

1. **Frontend boundary:** `src/routes/**/*.svelte` (except `src/routes/api/**`), `src/components/**`, `src/lib/stores/**`, `src/lib/api/**`, `src/lib/services/**`
2. **SvelteKit server boundary:** `src/routes/api/**/+server.ts`, `src/lib/server/**`
3. **Python AutoResearch boundary:** `cogochi/**/*.py`. Never import from `src/`. Communicates with SvelteKit via HTTP API (`src/routes/api/autoresearch/`) or filesystem (Supabase, `~/.cache/cogochi_autoresearch/`).
4. **No Python in frontend, no TypeScript in Python.** Clean separation.
5. **Never commit `.agent-context/`, `~/.cache/cogochi_autoresearch/`, or local v3 archive folders.**

---

*End of `docs/COGOCHI.md` v1.0. If this document becomes stale, the fix is to edit it in place — do not create parallel v2/v3 files. The whole point of this doc is to BE the single source of truth.*
