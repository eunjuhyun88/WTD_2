# W-0348 — Research Pipeline E2E Wiring (Verification + Composite Score)

> Wave: 5 | Priority: P1 | Effort: S
> Issue: #750
> Status: 🟡 Design Draft → Implementation
> Created: 2026-04-30

## Goal

BH-FDR 통과 패턴을 paper-trade ledger로 재검증하고 composite score(0–100) + quality grade(S/A/B/C)까지 한 번의 `pipeline.py` 실행으로 산출한다. W-0314 composite_score.py hook 연결 완성.

## Scope

- `engine/pipeline.py` — Stage 6 (_verify) + Stage 7 (_score) 추가 (~+120 LOC)
- `engine/tests/test_pipeline_e2e.py` (NEW, ~200 LOC)
- `PipelineResult.top_patterns` 7개 컬럼 추가

## Non-Goals

- W-0231 Phase 3 ledger read-path cutover (별도)
- Marketplace UI/sorting (별도)
- Live PnL 기반 scoring (paper-only)

## Implementation Plan

1. `ResearchPipeline.__init__` — `ledger_store: LedgerRecordStore | None = None` 파라미터 추가
2. `_verify(df) -> pd.DataFrame` — 각 unique pattern slug마다 `run_paper_verification` 호출, 7개 컬럼 attach
3. `_score(df) -> pd.DataFrame` — `compute_composite_score` 호출, composite_score + quality_grade 컬럼 attach
4. `run()` 에 Stage 6+7 삽입, `--skip-verification` CLI + `PIPELINE_SKIP_VERIFICATION` ENV 지원
5. `engine/tests/test_pipeline_e2e.py` 작성

## Exit Criteria

- [ ] AC1: in-memory ledger fixture로 Stage 6+7 실행 → composite_score, quality_grade 컬럼 존재
- [ ] AC2: n_trades=0 패턴 → composite_score=NaN (not 0, not error)
- [ ] AC3: ledger 조회 실패(exception) → warning log + Stage 1-5 결과 보존 (composite_score=NaN)
- [ ] AC4: --skip-verification → Stage 6+7 건너뜀, top_patterns 컬럼 없음
- [ ] AC5: 2 patterns with known ledger outcomes → composite ordering reflects quality diff
- [ ] AC6: pytest 8+ assertions PASS
