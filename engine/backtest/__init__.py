"""Portfolio-level backtest machinery (Phase D12).

Submodules:

* ``config``     — frozen, validated ``RiskConfig`` + yaml loader
* ``portfolio``  — mutable portfolio state (cash, positions, circuit breakers)
* ``simulator``  — event-driven ``run_backtest`` entry point
* ``metrics``    — institutional metrics + ``stage_1_gate`` binary decision
* ``calibration``— reliability diagram for classifier probabilities
* ``audit``      — structured audit trail writer
* ``regime``     — stub in D12, full implementation in D15

See ``docs/design/phase-d12-to-e.md`` §6 for the full specification and
§5.2 for the inter-layer dataclass contracts.
"""
