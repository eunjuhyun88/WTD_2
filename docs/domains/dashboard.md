# Domain: Dashboard

## Goal

Summarize system state, alerts, and key performance indicators for fast operator awareness.

## Canonical Areas

- `app/src/routes/dashboard`
- related dashboard API routes in `app/src/routes/api`

## Boundary

- Owns aggregation and display logic only.
- Must consume precomputed engine outputs or contract-safe summaries.
