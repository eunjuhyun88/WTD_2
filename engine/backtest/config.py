"""Frozen, validated configuration objects for Phase D12 backtests.

Two knobs govern a backtest run:

* ``RiskConfig``     — sizing, concurrency, circuit breakers.
* ``ExecutionCosts`` — fees and slippage (defined in ``scanner.pnl``).

Both are ``@dataclass(frozen=True)``. Yaml and CLI overrides merge into
a plain dict, which then instantiates the dataclass and is validated
eagerly via ``RiskConfig.validate()``. Failing validation raises
``ConfigValidationError`` with the offending field and value.

The ``content_hash()`` method is what Phase D12's audit trail records
alongside the git sha — two runs with the same ``content_hash`` must
produce identical results.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any, Optional

import yaml

from exceptions import ConfigValidationError


@dataclass(frozen=True)
class RiskConfig:
    """Portfolio-level risk and execution rules.

    Defaults reflect the Phase D12 preregistered settings (see
    ``docs/design/phase-d12-to-e.md`` §6.14 "Open decisions"). Do NOT
    change defaults without also bumping the ``content_hash`` in the
    experiments log, because a silent default change would break the
    reproducibility contract.
    """

    initial_equity: float = 10_000.0
    risk_per_trade_pct: float = 0.01
    sizing_method: str = "fixed_risk"
    max_concurrent_positions: int = 3
    max_positions_per_symbol: int = 1
    cooldown_bars_per_symbol: int = 3
    stop_loss_pct: float = 0.02
    take_profit_pct: float = 0.04
    max_hold_bars: int = 24
    daily_loss_limit_pct: float = 0.03
    weekly_loss_limit_pct: float = 0.08
    max_consecutive_losses: int = 5
    consecutive_loss_pause_bars: int = 24
    kelly_fraction: float = 0.25
    regime_skip: tuple[str, ...] = ()

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    _VALID_REGIMES = frozenset({"bull", "bear", "chop", "unknown"})

    def validate(self) -> None:
        """Raise ``ConfigValidationError`` on any out-of-range field."""
        self._check("initial_equity", self.initial_equity > 0)
        self._check(
            "risk_per_trade_pct",
            0 < self.risk_per_trade_pct < 0.1,
            "must be in (0, 0.1)",
        )
        if self.sizing_method not in ("fixed_risk", "kelly", "fixed_notional"):
            raise ConfigValidationError(
                f"sizing_method must be one of "
                f"(fixed_risk, kelly, fixed_notional), got {self.sizing_method!r}"
            )
        self._check("max_concurrent_positions", self.max_concurrent_positions >= 1)
        self._check("max_positions_per_symbol", self.max_positions_per_symbol >= 1)
        self._check("cooldown_bars_per_symbol", self.cooldown_bars_per_symbol >= 0)
        self._check("stop_loss_pct", 0 < self.stop_loss_pct < 0.5)
        self._check("take_profit_pct", 0 < self.take_profit_pct < 1.0)
        self._check("max_hold_bars", self.max_hold_bars >= 1)
        self._check(
            "daily_loss_limit_pct",
            0 < self.daily_loss_limit_pct < 0.5,
            "must be in (0, 0.5)",
        )
        self._check(
            "weekly_loss_limit_pct",
            0 < self.weekly_loss_limit_pct < 0.8,
            "must be in (0, 0.8)",
        )
        self._check("max_consecutive_losses", self.max_consecutive_losses >= 1)
        self._check("consecutive_loss_pause_bars", self.consecutive_loss_pause_bars >= 0)
        self._check("kelly_fraction", 0 < self.kelly_fraction <= 1.0)
        for r in self.regime_skip:
            if r not in self._VALID_REGIMES:
                raise ConfigValidationError(
                    f"regime_skip contains invalid regime {r!r}; "
                    f"valid: {sorted(self._VALID_REGIMES)}"
                )

    def _check(self, name: str, ok: bool, hint: str | None = None) -> None:
        if not ok:
            value = getattr(self, name)
            msg = f"{name}={value!r} failed validation"
            if hint:
                msg += f" ({hint})"
            raise ConfigValidationError(msg)

    # ------------------------------------------------------------------
    # Reproducibility
    # ------------------------------------------------------------------
    def content_hash(self) -> str:
        """Stable 12-char hex digest of the config contents.

        Order-insensitive (``sort_keys=True``) so field reordering in
        the dataclass definition does not invalidate hashes of prior
        runs.
        """
        payload = json.dumps(asdict(self), sort_keys=True).encode()
        return hashlib.sha256(payload).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def load_risk_config(
    yaml_path: Optional[Path] = None,
    cli_overrides: Optional[dict[str, Any]] = None,
) -> RiskConfig:
    """Load a ``RiskConfig`` from yaml + CLI overrides.

    Precedence (lowest → highest):
      1. ``RiskConfig`` dataclass defaults
      2. Fields present in ``yaml_path`` (if provided and exists)
      3. Fields present in ``cli_overrides``

    Unknown fields at any layer raise ``ConfigValidationError``.
    """
    data: dict[str, Any] = {}
    if yaml_path is not None and yaml_path.exists():
        with yaml_path.open("r", encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
            if not isinstance(loaded, dict):
                raise ConfigValidationError(
                    f"{yaml_path}: top-level yaml must be a mapping"
                )
            data.update(loaded)
    if cli_overrides:
        data.update(cli_overrides)

    allowed = {f.name for f in fields(RiskConfig)}
    unknown = set(data) - allowed
    if unknown:
        raise ConfigValidationError(
            f"unknown RiskConfig fields: {sorted(unknown)}"
        )

    try:
        cfg = RiskConfig(**data)
    except TypeError as e:  # pragma: no cover - defensive
        raise ConfigValidationError(f"invalid RiskConfig fields: {e}") from e
    cfg.validate()
    return cfg
