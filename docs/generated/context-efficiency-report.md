# Context Efficiency Report

This report estimates how much context the routing system saves before the agent reaches implementation files.

## Core Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| small map | 5 | 1108 | 12092 | 53.2% | 96.6% |
| canonical | 27 | 2679 | 25835 | 0.0% | 92.8% |
| all docs | 147 | 42897 | 358483 | -1287.6% | 0.0% |

## Estimated Savings

- Small map saves approximately `13743` tokens vs the canonical bundle.
- Small map saves approximately `346391` tokens vs the all-doc bundle.
- Surface `terminal` saves approximately `341939` tokens vs the all-doc bundle.
- Surface `arena` saves approximately `341941` tokens vs the all-doc bundle.
- Surface `community` saves approximately `342494` tokens vs the all-doc bundle.
- Surface `api` saves approximately `342494` tokens vs the all-doc bundle.

## Surface Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| terminal | 9 | 1478 | 16544 | 36.0% | 95.4% |
| arena | 9 | 1483 | 16542 | 36.0% | 95.4% |
| community | 8 | 1411 | 15989 | 38.1% | 95.5% |
| api | 8 | 1411 | 15989 | 38.1% | 95.5% |

## Structural Scorecard

| Check | Actual | Target | Result |
| --- | --- | --- | --- |
| Small-map reduction vs canonical | 53.2% | >= 40% | PASS |
| Small-map reduction vs all docs | 96.6% | >= 55% | PASS |
| Worst surface reduction vs all docs | 95.4% | >= 50% | PASS |
| Small-map approx tokens | 12092 | <= 14000 | PASS |
| Small-map file count | 5 | <= 6 | PASS |
| Canonical approx tokens | 25835 | <= 32000 | PASS |

## Structural Readiness

- PASS: structural routing gate

## Budget Checks

- PASS: Small map approx tokens <= 14000
- PASS: Small map files <= 6
- PASS: Canonical approx tokens <= 32000

## Small Map Files

- `README.md`
- `AGENTS.md`
- `docs/README.md`
- `ARCHITECTURE.md`
- `docs/SYSTEM_INTENT.md`

## Notes

- Small-map results tell you whether the canonical entry path is compact enough to be practical.
- Surface bundles tell you whether route/store/API discovery can be done without broad document scans.
- Run `npm run eval:validate` to pair structural evidence with real task evidence.
- Run `npm run harness:benchmark -- --base-url http://localhost:4173` for repeated runtime/noise validation.

