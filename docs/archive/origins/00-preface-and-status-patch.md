# COGOCHI — Product Requirements Document

> **Version:** 1.1 (2026-04-11 mid-transition patch)
> **Date:** 2026-04-11
> **Author:** CPO × AI Research Lead
> **Status:** Legacy reference during docs transition (not primary canonical)
> **Audience:** historical context lookup only

> [!IMPORTANT]
> Canonical product and operating truth is now split into layered root docs.
> Read in this order for active work:
> 1. `AGENTS.md`
> 2. `work/active/*.md` (current task)
> 3. `docs/domains/*.md` (relevant domain only)
> 4. `docs/product/{brief,surfaces,research-thesis}.md`
> 5. `docs/decisions/ADR-000-operating-system-baseline.md`
>
> This file **keeps the full PRD body below** (not a redirect stub). **Split copies** live under `docs/archive/cogochi/`; refresh them after edits: `bash scripts/split-cogochi-archive.sh`. See `docs/archive/cogochi/README.md`.
>
> This file may contain historical drift.

---

## ⚠️ 2026-04-11 Status Patch — READ THIS FIRST

This document is in **mid-transition** between two designs. When a section contradicts another, the section order below is authoritative:

| Authoritative (current Day-1 design) | Drifted (pre-pivot, preserved for reference) |
|---|---|
| § 7 Surface Model (3 Day-1 surfaces) | § 0, 4, 6 still describe DOUNI + 15-layer + scan feedback |
| § 8 Per-Surface Feature Spec (patched) | § 10 still describes the old `cogochi/*.py` monorepo layout |
| § 9 Character Layer (DEFERRED) | § 12 Journey State Machine still references DOUNI |
| § 11 Data Contracts (WTD klines + 28 features + Challenge) | § 17 Roadmap mentions archetype + adapter |
| § 16 Home landing (still valid layout, copy deltas noted in § 8.6) | § 18 Implementation Sequence lists old PR A-N |
|  | § 19 Open Questions mentions archetype veto |
|  | § 20 Appendix still shows `cogochi/*.py` + DOUNI paths |

**Core pivots (2026-04-11):**

1. **Backend = external repo `/Users/ej/Projects/WTD/`.** The `cogochi-autoresearch/` Python package there (with 29 building blocks, `wizard/`, `challenges/pattern-hunting/`) is the actual engine. The `cogochi/*.py` files in THIS repo are legacy monorepo leftovers.
2. **Character layer DEFERRED.** No DOUNI, no archetype, no Stage. See § 9.
3. **Day-1 = 3 surfaces only:** `/terminal` (observe + compose via search), `/lab` (evaluate + inspect + iterate), `/dashboard` (my stuff inbox) + `/` (landing). See § 7.
4. **Search query IS the wizard.** No 5-step svelte form. User types `btc 4h recent_rally 10% + bollinger_expansion`, parser maps to WTD blocks, one click saves as a challenge. See § 8.1.
5. **Data contracts = WTD klines (7 columns) + features (28 columns) + Challenge directory format.** 15-layer `SignalSnapshot` is dropped. See § 11.

**How to use this document (revised):**
- New to Cogochi? Read the **Status Patch above**, then § 7, § 8 (the 4 active-surface subsections), § 11.
- Touching `/terminal`, `/lab`, `/dashboard`? Read § 8.1 / § 8.2 / § 8.7 respectively. Ignore § 8.3–§ 8.5.
- Need product narrative / thesis? § 0–§ 5 are still useful as intent — just substitute "challenge" for "pattern/feedback/adapter" and ignore the character references.
- Touching the backend? Go to `/Users/ej/Projects/WTD/cogochi-autoresearch/` directly — § 10 is archival.
- Writing the home landing page? § 16 layout is still valid; § 8.6 has the 2026-04-11 copy deltas.
- Everything else in `docs/` is operational/infra. This is the only product canonical.

---

