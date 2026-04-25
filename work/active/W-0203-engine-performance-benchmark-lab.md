# W-0203 — Engine Performance Benchmark Lab

## Goal

엔진 성능개선 후보를 baseline → scoped change → rerun → comparison report → accept/reject/shadow로 기록하는 벤치마크 운영 체계를 설계한다.

## Owner

research

## Primary Change Type

Research or eval change

## Scope

- `docs/domains/engine-performance-benchmark-lab.md` 신규 작성
- quality performance와 systems performance를 분리해 metric family 정의
- benchmark ladder, improvement hypothesis card, benchmark run record, comparison report schema 정의
- 기존 `research/experiments`, `ExperimentTracker`, `quality_ledger`, benchmark packs와 연결
- high-leverage improvement tracks 정의

## Non-Goals

- benchmark runner implementation
- engine optimization implementation
- database migration
- app UI reporting
- production monitoring dashboard

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0203-engine-performance-benchmark-lab.md`
- `docs/domains/engine-performance-benchmark-lab.md`
- `docs/domains/engine-strengthening-methodology.md`
- `docs/domains/evaluation.md`
- `engine/research/eval_protocol.py`
- `engine/research/tracker.py`
- `engine/search/quality_ledger.py`
- `research/experiments/README.md`

## Facts

1. The repo already has `ExperimentTracker`, `eval_protocol.py`, `quality_ledger.py`, benchmark packs, and many `research/experiments/*/metrics.json` records.
2. Current engine-strengthening docs define what to improve but not a strict benchmark recording protocol.
3. Search quality and system latency can move in opposite directions, so both must be measured for every optimization.
4. TRADOOR/PTB remains the best first benchmark family because it has existing packs and loop proof usage.
5. A performance improvement without baseline and rerun records cannot support promotion decisions.

## Assumptions

1. First benchmark records can reuse `research/experiments` file layout.
2. First metrics can be JSON file based before shared DB reporting.
3. Baseline/candidate comparison should be manual-documentable first, then automated later.

## Open Questions

- Should benchmark comparison reports live under `research/experiments/` or `research/reports/` once implemented?
- Should performance benchmark records also sync to Supabase for long-term durability?
- What sample size is enough for manual top-k relevance before Stage 3 reranker work?

## Decisions

- Performance has two mandatory dimensions: quality performance and systems performance.
- Every serious optimization starts with an improvement hypothesis card.
- Every accepted improvement must have a baseline run, candidate run, guardrail check, and written decision.
- Benchmarks are organized into Level 0-4 from unit/contract to shadow runtime.
- FeatureWindowStore cutover is the first high-leverage benchmark track.

## Next Steps

1. Create the first improvement card for `FeatureWindowStore search cutover`.
2. Run a baseline TRADOOR/PTB Stage 1+2 benchmark and record it in `research/experiments`.
3. Add a comparison report template before implementing the optimization.

## Exit Criteria

- Engine Performance Benchmark Lab domain doc exists.
- It defines benchmark ladder, metric families, guardrails, run records, comparison reports, and first 14-day plan.
- CURRENT lists W-0203 as active design work.
- Adjacent evaluation/engine-strengthening docs point to this benchmark lab.

## Handoff Checklist

- active work item: `work/active/W-0203-engine-performance-benchmark-lab.md`
- active branch: `claude/arch-improvements-0425`
- verification: docs-only review; no engine/app tests required
- remaining blockers: benchmark runner and first TRADOOR/PTB baseline run remain future implementation work
