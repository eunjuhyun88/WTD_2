# W-0249 — F-19: Observability (Sentry + p95 대시보드)

> Wave 4 P1 | Owner: engine+app | Branch: `feat/F19-observability`

---

## Goal

Sentry 에러 추적 + p95 latency / error rate / cost-per-WAA 대시보드. H-04/H-05(flywheel health)는 이미 있음.

## Owner

engine+app

---

## Scope

| 파일 | 변경 이유 |
|------|-----------|
| `engine/main.py` | 변경 — Sentry init |
| `app/src/app.html` | 변경 — Sentry browser init |
| `engine/observability/metrics.py` | 변경 — p95 latency 측정 추가 |
| `app/src/routes/api/observability/dashboard/+server.ts` | 신규 — 통합 메트릭 |

## Exit Criteria

- [ ] engine 500 에러 → Sentry 캡처
- [ ] app JS 에러 → Sentry 캡처
- [ ] `GET /observability/dashboard` → p95 / error_rate / cost_per_waa
- [ ] p95 < 2s, error < 0.5% (PRD guardrail)
- [ ] `SENTRY_DSN` env var

## Facts

1. `GET /observability/flywheel/health` — H-04 이미 BUILT.
2. `app/src/routes/api/observability/metrics/+server.ts` — H-05 이미 BUILT.
3. PRD guardrail: p95 < 2s / error < 0.5% / cost/WAA < $8.

## Canonical Files

- `engine/main.py`
- `engine/observability/metrics.py`
