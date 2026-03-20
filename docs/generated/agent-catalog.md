# Agent Catalog

This generated catalog lists the repo-local agent blueprints that outsiders can inspect and reuse.

## Overview

- Agent count: `5`
- Public agents: `5`

## Agents

| ID | Role | Surfaces | Manifest | Writes |
| --- | --- | --- | --- | --- |
| `implementer` | implementer | `home, terminal, arena, market, passport, lab` | `agents/implementer.json` | `src/, .agent-context/, docs/AGENT_WATCH_LOG.md, docs/handoffs/` |
| `implementer-systems` | implementer | `terminal, arena, market, passport, lab, api` | `agents/implementer-systems.json` | `src/lib/, src/routes/api/, db/, supabase/, .agent-context/, docs/handoffs/` |
| `implementer-ui` | implementer | `home, market, arena, passport, lab` | `agents/implementer-ui.json` | `src/routes/, src/components/, static/, .agent-context/, docs/handoffs/` |
| `planner` | planner | `home, terminal, arena, market, passport, lab, api` | `agents/planner.json` | `docs/exec-plans/active/, docs/decisions/, docs/handoffs/, docs/task-contracts/active/, .agent-context/, docs/AGENT_WATCH_LOG.md` |
| `reviewer` | reviewer | `home, terminal, arena, market, passport, lab, api` | `agents/reviewer.json` | `.agent-context/, docs/AGENT_WATCH_LOG.md, docs/handoffs/` |

## How To Use

- Create a new blueprint with `npm run agent:new -- --id "<agent-id>" --role "<role>" --surface "<surface>"`.
- Refresh generated artifacts with `npm run agent:refresh` and `npm run docs:refresh`.
- Search the public manifest with `npm run registry:query -- --kind agent --q "<term>"`.
