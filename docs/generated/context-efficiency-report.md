# Context Efficiency Report

This report estimates how much context the routing system saves before the agent reaches implementation files.

## Core Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| small map | 6 | 1331 | 13646 | 65.4% | 97.1% |
| canonical | 33 | 4669 | 39407 | 0.0% | 91.6% |
| all docs | 192 | 51108 | 467045 | -1085.2% | 0.0% |

## Estimated Savings

- Small map saves approximately `25761` tokens vs the canonical bundle.
- Small map saves approximately `453399` tokens vs the all-doc bundle.
- Surface `core` saves approximately `448690` tokens vs the all-doc bundle.

## Surface Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| core | 10 | 1699 | 18355 | 53.4% | 96.1% |

## Structural Scorecard

| Check | Actual | Target | Result |
| --- | --- | --- | --- |
| Small-map reduction vs canonical | 65.4% | >= 40% | PASS |
| Small-map reduction vs all docs | 97.1% | >= 55% | PASS |
| Worst surface reduction vs all docs | 96.1% | >= 50% | PASS |
| Small-map approx tokens | 13646 | <= 3800 | FAIL |
| Small-map file count | 6 | <= 6 | PASS |
| Canonical approx tokens | 39407 | <= 12000 | FAIL |

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

