# Context Efficiency Report

This report estimates how much context the routing system saves before the agent reaches implementation files.

## Core Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| small map | 5 | 1036 | 8769 | 55.6% | 99.9% |
| canonical | 15 | 2172 | 19731 | 0.0% | 99.8% |
| all docs | 3555 | 923657 | 8848083 | -44743.6% | 0.0% |

## Estimated Savings

- Small map saves approximately `10962` tokens vs the canonical bundle.
- Small map saves approximately `8839314` tokens vs the all-doc bundle.
- Surface `core` saves approximately `8835910` tokens vs the all-doc bundle.

## Surface Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| core | 8 | 1310 | 12173 | 38.3% | 99.9% |

## Structural Scorecard

| Check | Actual | Target | Result |
| --- | --- | --- | --- |
| Small-map reduction vs canonical | 55.6% | >= 40% | PASS |
| Small-map reduction vs all docs | 99.9% | >= 55% | PASS |
| Worst surface reduction vs all docs | 99.9% | >= 50% | PASS |
| Small-map approx tokens | 8769 | <= 3800 | FAIL |
| Small-map file count | 5 | <= 6 | PASS |
| Canonical approx tokens | 19731 | <= 12000 | FAIL |

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

