# Context Efficiency Report

This report estimates how much context the routing system saves before the agent reaches implementation files.

## Core Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| small map | 6 | 1328 | 13721 | 51.7% | 99.4% |
| canonical | 31 | 3100 | 28401 | 0.0% | 98.8% |
| all docs | 1036 | 244315 | 2427847 | -8448.5% | 0.0% |

## Estimated Savings

- Small map saves approximately `14680` tokens vs the canonical bundle.
- Small map saves approximately `2414126` tokens vs the all-doc bundle.
- Surface `core` saves approximately `2410110` tokens vs the all-doc bundle.

## Surface Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| core | 10 | 1659 | 17737 | 37.5% | 99.3% |

## Structural Scorecard

| Check | Actual | Target | Result |
| --- | --- | --- | --- |
| Small-map reduction vs canonical | 51.7% | >= 40% | PASS |
| Small-map reduction vs all docs | 99.4% | >= 55% | PASS |
| Worst surface reduction vs all docs | 99.3% | >= 50% | PASS |
| Small-map approx tokens | 13721 | <= 3800 | FAIL |
| Small-map file count | 6 | <= 6 | PASS |
| Canonical approx tokens | 28401 | <= 12000 | FAIL |

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
- `docs/SYSTEM_INTENT.md`
- `docs/CONTEXT_ENGINEERING.md`

## Notes

- Small-map results tell you whether the canonical entry path is compact enough to be practical.
- Surface bundles tell you whether route/store/API discovery can be done without broad document scans.
- Run `npm run eval:validate` to pair structural evidence with real task evidence.
- Run `npm run harness:benchmark -- --base-url http://localhost:4173` for repeated runtime/noise validation.

