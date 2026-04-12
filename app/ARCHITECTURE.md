# Architecture

This file is a thin entry point. For the canonical repo layout, boundaries, and product→code mapping, open **[`docs/COGOCHI.md § 20`](./docs/COGOCHI.md#§-20-appendix--repo-layout--boundaries)**.

## 30-second overview

Cogochi is a **monorepo** containing two coupled surfaces:

```
src/          SvelteKit 2 full-stack frontend + API layer
cogochi/      Python AutoResearch service (KTO + LoRA, per-user adapters)
```

The frontend calls the Python service via HTTP routes under `src/routes/api/autoresearch/` and via a Supabase database shared between both. See `docs/COGOCHI.md § 10 AutoResearch Pipeline` for how the Python layer is structured and which functions (`build_orpo_pair`, `BattleContext`, `guardian_veto`) are currently in the repo vs still to be built.

## Where things live

- **Product truth** — `docs/COGOCHI.md` (single file)
- **Operational / infra routing** — `docs/{DESIGN,FRONTEND,PLANS,SECURITY,RELIABILITY,QUALITY_SCORE}.md`
- **Agent discipline** — `docs/AGENT_*.md`, `docs/MULTI_AGENT_*.md`, `docs/CONTEXT_*.md`
- **Frontend code** — `src/routes/`, `src/components/`, `src/lib/`
- **Python AutoResearch** — `cogochi/*.py`
- **v3 historical archive** (outside git) — `~/Downloads/기타_문서/cogochi-v3-archive-2026-04-11/`

## Read order for new sessions

1. `README.md` (collaboration SSOT)
2. `AGENTS.md` (execution rules)
3. `docs/COGOCHI.md` (product truth — read this once, referenced often)
4. `docs/README.md` (what else is in docs/)
5. This file (for the repo layout overview)

If the task is purely operational, skip step 3 and read the relevant `docs/*.md` operational doc instead.
