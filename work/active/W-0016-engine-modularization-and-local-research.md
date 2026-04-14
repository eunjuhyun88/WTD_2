# W-0016 Engine Modularization and Local Research

## Goal

Modularize the engine hot paths that block local research iteration while adding lightweight model lineage and experiment tracking primitives inside `engine/`.

## Owner

engine

## Scope

- split `market_engine.pipeline` into import-stable layer modules without breaking old imports
- extract scanner jobs into a package boundary
- introduce feature metadata and a stable feature-compute surface under `engine/features/`
- add model manifest/store primitives for versioned local model lineage
- add a lightweight local research CLI and tracker under `engine/research/`
- expose training/report helpers needed for local model inspection

## Non-Goals

- production job orchestration or worker deployment
- replacing the app-side research harness
- committing generated experiment output directories
- redesigning terminal UI or app-side shell behavior

## Canonical Files

- `work/active/W-0016-engine-modularization-and-local-research.md`
- `work/active/W-0006-full-architecture-refactor-design.md`
- `engine/market_engine/pipeline.py`
- `engine/market_engine/layers/__init__.py`
- `engine/features/registry.py`
- `engine/models/registry/manifest.py`
- `engine/models/registry/store.py`
- `engine/research/cli.py`
- `engine/scanner/scheduler.py`
- `engine/api/routes/train.py`

## Decisions

- keep `market_engine.pipeline` as a compatibility surface while moving real logic into `market_engine.layers/*`
- keep scanner lifecycle wiring in `scheduler.py`, but move job implementations into `scanner/jobs/*`
- track local model lineage with file-backed manifests before introducing heavier infra
- keep local research tracking append-only and file-backed under `research/experiments/`

## Next Steps

- decide whether generated experiment artifacts should remain untracked or move behind a committed index/manifest
- document the engine-side research CLI in a canonical domain doc if it becomes part of the daily loop
- add targeted contract coverage if `/train/report` becomes app-consumed

## Exit Criteria

- old import paths remain stable while the engine internals are split into clearer modules
- local model versions have manifest metadata and comparison primitives
- local research/eval runs can be recorded from `engine/` without external services
- new engine modules ship with targeted tests
