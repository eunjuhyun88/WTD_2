---
description: Rehydrate the current task from Memento working memory and canonical docs before touching code.
---

1. Run `git status --short --branch`.
2. Run `MEMENTO_AGENT="${MEMENTO_AGENT:-implementer-ui}" npm run ctx:resume`.
3. If the resume bundle is still insufficient, run `npm run ctx:restore -- --mode handoff`.
4. If no compacted artifacts exist, read `README.md`, `AGENTS.md`, `docs/README.md`, `docs/SYSTEM_INTENT.md`, and `ARCHITECTURE.md`.
5. Summarize:
   - current objective
   - next step
   - read-first docs
   - open questions
6. Do not start in `docs/archive/` unless canonical docs are insufficient.
