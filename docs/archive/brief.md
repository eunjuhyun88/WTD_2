# Product Brief

## Purpose

WTD v2 provides an AI-assisted crypto research and execution workflow where users inspect market context, evaluate setups, and act with evidence-backed guidance.

## Current User Value

- Fast terminal-style market interpretation
- Repeatable challenge and evaluation loop
- Evidence visibility from engine outputs to UI surfaces

## Core Product Loop

The product has two loops that must not be confused:

1. Surface orchestration loop
   - user requests analysis from `app`
   - `app` orchestrates request to `engine`
   - `engine` returns structured analysis or evaluation artifacts
   - `app` renders outputs and captures interaction
2. Product learning loop
   - real trade review becomes pattern definition
   - engine scans the market and tracks pattern phase
   - action-zone candidates are surfaced for review and `Save Setup`
   - outcomes are recorded and user judgment refines future detection

The canonical definition of the product learning loop lives in [`docs/product/core-loop.md`](/Users/ej/Projects/wtd-v2/docs/product/core-loop.md).

## Out of Scope Here

- Historical roadmap narratives
- Deprecated surface plans
- Legacy architecture migration notes
