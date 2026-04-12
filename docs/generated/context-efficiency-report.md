# Context Efficiency Report

This report estimates how much context the routing system saves before the agent reaches implementation files.

## Core Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| small map | 5 | 1036 | 8769 | 55.2% | 98.6% |
| canonical | 15 | 2162 | 19565 | 0.0% | 96.9% |
| all docs | 177 | 60320 | 633369 | -3137.3% | 0.0% |

## Estimated Savings

- Small map saves approximately `10796` tokens vs the canonical bundle.
- Small map saves approximately `624600` tokens vs the all-doc bundle.
- Surface `core` saves approximately `621045` tokens vs the all-doc bundle.

## Surface Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| core | 8 | 1321 | 12324 | 37.0% | 98.1% |

## Structural Scorecard

| Check | Actual | Target | Result |
| --- | --- | --- | --- |
| Small-map reduction vs canonical | 55.2% | >= 40% | PASS |
| Small-map reduction vs all docs | 98.6% | >= 55% | PASS |
| Worst surface reduction vs all docs | 98.1% | >= 50% | PASS |
| Small-map approx tokens | 8769 | <= 3800 | FAIL |
| Small-map file count | 5 | <= 6 | PASS |
| Canonical approx tokens | 19565 | <= 12000 | FAIL |

## Structural Readiness

- FAIL: structural routing gate

## Budget Checks

- FAIL: Small map approx tokens <= 3800
- PASS: Small map files <= 6
- FAIL: Canonical approx tokens <= 12000

## Small Map Files

- `README.md`
- `AGENTS.md`
- `docs/README.md`
- `ARCHITECTURE.md`
- `docs/CONTEXT_ENGINEERING.md`

## Notes

- Small-map results tell you whether the canonical entry path is compact enough to be practical.
- Surface bundles tell you whether route/store/API discovery can be done without broad document scans.
- Run `npm run eval:validate` to pair structural evidence with real task evidence.
- Run `npm run harness:benchmark -- --base-url http://localhost:4173` for repeated runtime/noise validation.

