# Current Thesis

## Goal

Define the current research claim for the local-first WTD v2 loop in a form that can be tested and updated without chat history.

## Current thesis

Structured market verdicts with explicit evidence should outperform weak baselines on repeatable utility-based evaluation, and that advantage should remain explainable through fixed contracts rather than opaque intuition.

## Near-term questions

- Does the current verdict pipeline produce a measurable utility lift over `Random`?
- Does the current rule-based baseline beat `Random` before the sample-size ladder saturates?
- Are the current evaluation splits leakage-safe and reproducible enough to trust result deltas?
- Can the DB-backed trajectory source reproduce the same protocol as the synthetic source without changing experiment code?

## Current operating stance

- local-first research loop beats production architecture work
- use the existing `app/src/lib/research` and `app/scripts/research` stack as the implementation path
- keep `engine/` as backend truth and use app-side research code only for orchestration, baselines, and eval harness work already living in the app
- do not make user-facing product claims unless an artifact exists under `research/evals/` and `research/experiments/`

## Evidence path

- thesis statement: this file
- fixed protocol: `research/evals/rq-b-baseline-protocol.md`
- active experiment record: `research/experiments/rq-b-ladder-2026-04-11.md`
- runnable implementation: `app/scripts/research/*`

## Change rule

Update this file when the primary research question, acceptance rule, or canonical baseline family changes.
