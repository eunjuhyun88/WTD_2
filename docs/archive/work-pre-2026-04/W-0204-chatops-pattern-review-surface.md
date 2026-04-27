# W-0204 — ChatOps Pattern Review Surface

## Goal

CUI 기반 Event-Driven ChatOps 패턴을 Cogochi에 맞게 `Pattern Review / Verdict / Benchmark Ops` 보조 surface로 정의하고, 자동주문 봇과의 경계를 명확히 고정한다.

## Owner

app

## Primary Change Type

Product surface change

## Scope

- `docs/domains/chatops-pattern-review-surface.md` 신규 작성
- Trading ChatOps와 Cogochi ChatOps의 유사점/차이점 정리
- candidate/outcome/benchmark/promotion 이벤트 카드 정의
- one-word response vocabulary, timeout, idempotency, audit rules 정의
- Day-1 order execution 금지 규칙 명시
- `docs/product/surfaces.md`와 `CURRENT.md` 연결

## Non-Goals

- Discord/Telegram/Slack provider implementation
- broker or exchange order execution
- app UI implementation
- engine route implementation
- production notification delivery

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0204-chatops-pattern-review-surface.md`
- `docs/domains/chatops-pattern-review-surface.md`
- `docs/product/surfaces.md`
- `docs/product/core-loop-system-spec.md`
- `docs/domains/engine-strengthening-methodology.md`

## Facts

1. External CUI Event-Driven ChatOps systems commonly use chat cards for human approval before order execution.
2. Cogochi's core loop is pattern capture/search/judgment/refinement, not broker order execution.
3. Existing Day-1 surfaces remain `/terminal`, `/lab`, and `/dashboard`.
4. ChatOps can reduce judgment friction for candidate review, outcome review, benchmark regression, and promotion decisions.
5. Chat history is useful audit context, but canonical truth must remain in engine records.

## Assumptions

1. First ChatOps slice should be design-only and provider-neutral.
2. One-word constrained responses are safer than free-form natural-language mutation.
3. No Day-1 ChatOps path should place orders or call broker/exchange APIs.

## Open Questions

- Which provider should be first if implemented: Discord, Telegram, or Slack?
- Should chat actions write through app proxy routes or directly through engine API routes?
- Should benchmark/promotion ChatOps be internal-only before user-facing candidate verdicts?

## Decisions

- ChatOps is a low-friction action surface, not the engine and not the moat.
- The first valuable Cogochi ChatOps use is verdict collection, not order execution.
- Timeouts never default to accept, promote, or execute.
- Every chat action requires idempotency and canonical engine record refs.
- Full chart inspection must deep-link to `/terminal`, `/lab`, or `/dashboard`.

## Next Steps

1. Draft card JSON contracts for `CandidateReviewEvent` and `OutcomeReviewEvent`.
2. Map normalized chat responses to existing verdict/outcome engine contracts.
3. Decide provider and app/engine route boundary only after card contracts are stable.

## Exit Criteria

- ChatOps domain doc exists and distinguishes Cogochi from order-execution bots.
- Event/card types, response vocabulary, safety rules, architecture, and first slice are defined.
- CURRENT lists W-0204 as active design work.
- Product surfaces doc references ChatOps as an auxiliary surface, not a Day-1 replacement.

## Handoff Checklist

- active work item: `work/active/W-0204-chatops-pattern-review-surface.md`
- active branch: `claude/arch-improvements-0425`
- verification: docs-only review; no engine/app tests required
- remaining blockers: provider choice and card contract implementation remain future work
