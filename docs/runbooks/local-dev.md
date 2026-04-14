# Runbook: Local Development

## Engine

1. `cd engine`
2. install deps with `uv sync` if needed
3. run targeted tests with `uv run pytest`

## App

1. `npm --prefix app install`
2. `npm --prefix app run dev`
3. use local routes for UI and API validation

## Repo Baseline

1. run `bash scripts/check-operating-baseline.sh`
2. fix missing work item, canonical docs, or contract path issues before broader checks

## Rule

Run only the minimum checks needed during iteration, then run broader checks before merge.
