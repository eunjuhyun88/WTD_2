# Context Efficiency Report

This report estimates how much context the routing system saves before the agent reaches implementation files.

## Core Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| small map | 5 | 1108 | 12092 | 53.2% | 96.7% |
| canonical | 27 | 2680 | 25854 | 0.0% | 92.8% |
| all docs | 146 | 43258 | 361580 | -1298.5% | 0.0% |

## Estimated Savings

- Small map saves approximately `13762` tokens vs the canonical bundle.
- Small map saves approximately `349488` tokens vs the all-doc bundle.
- Surface `terminal` saves approximately `345048` tokens vs the all-doc bundle.
- Surface `arena` saves approximately `345050` tokens vs the all-doc bundle.
- Surface `community` saves approximately `345603` tokens vs the all-doc bundle.
- Surface `api` saves approximately `345603` tokens vs the all-doc bundle.

## Surface Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| terminal | 9 | 1477 | 16532 | 36.1% | 95.4% |
| arena | 9 | 1482 | 16530 | 36.1% | 95.4% |
| community | 8 | 1410 | 15977 | 38.2% | 95.6% |
| api | 8 | 1410 | 15977 | 38.2% | 95.6% |

## Structural Scorecard

| Check | Actual | Target | Result |
| --- | --- | --- | --- |
| Small-map reduction vs canonical | 53.2% | >= 40% | PASS |
| Small-map reduction vs all docs | 96.7% | >= 55% | PASS |
| Worst surface reduction vs all docs | 95.4% | >= 50% | PASS |
| Small-map approx tokens | 12092 | <= 14000 | PASS |
| Small-map file count | 5 | <= 6 | PASS |
| Canonical approx tokens | 25854 | <= 32000 | PASS |

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

