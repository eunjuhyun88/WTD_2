# Context Efficiency Report

This report estimates how much context the routing system saves before the agent reaches implementation files.

## Core Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| small map | 6 | 1328 | 13721 | 59.6% | 96.9% |
| canonical | 32 | 3974 | 33979 | 0.0% | 92.4% |
| all docs | 176 | 49084 | 445091 | -1209.9% | 0.0% |

## Estimated Savings

- Small map saves approximately `20258` tokens vs the canonical bundle.
- Small map saves approximately `431370` tokens vs the all-doc bundle.
- Surface `core` saves approximately `427217` tokens vs the all-doc bundle.

## Surface Bundles

| Bundle | Files | Lines | Approx Tokens | Reduction vs canonical | Reduction vs all docs |
| --- | --- | --- | --- | --- | --- |
| core | 10 | 1673 | 17874 | 47.4% | 96.0% |

## Structural Scorecard

| Check | Actual | Target | Result |
| --- | --- | --- | --- |
| Small-map reduction vs canonical | 59.6% | >= 40% | PASS |
| Small-map reduction vs all docs | 96.9% | >= 55% | PASS |
| Worst surface reduction vs all docs | 96.0% | >= 50% | PASS |
| Small-map approx tokens | 13721 | <= 3800 | FAIL |
| Small-map file count | 6 | <= 6 | PASS |
| Canonical approx tokens | 33979 | <= 12000 | FAIL |

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

