"""Tests for backtest.config.RiskConfig and load_risk_config."""
from __future__ import annotations

from pathlib import Path

import pytest

from backtest.config import RiskConfig, load_risk_config
from exceptions import ConfigValidationError


def test_defaults_validate():
    cfg = RiskConfig()
    cfg.validate()
    assert cfg.initial_equity == 10_000.0
    assert cfg.max_concurrent_positions == 3


def test_content_hash_stable_and_sensitive():
    a = RiskConfig()
    b = RiskConfig()
    assert a.content_hash() == b.content_hash()
    c = RiskConfig(risk_per_trade_pct=0.02)
    assert c.content_hash() != a.content_hash()


@pytest.mark.parametrize(
    "field,value",
    [
        ("risk_per_trade_pct", 0.0),
        ("risk_per_trade_pct", 0.5),  # > 0.1
        ("initial_equity", 0.0),
        ("stop_loss_pct", 0.6),
        ("max_concurrent_positions", 0),
        ("kelly_fraction", 0.0),
        ("kelly_fraction", 2.0),
    ],
)
def test_out_of_range_raises(field, value):
    cfg = RiskConfig(**{field: value})
    with pytest.raises(ConfigValidationError, match=field):
        cfg.validate()


def test_unknown_sizing_method_raises():
    cfg = RiskConfig(sizing_method="magic")
    with pytest.raises(ConfigValidationError, match="sizing_method"):
        cfg.validate()


def test_load_risk_config_yaml_plus_cli(tmp_path: Path):
    yaml_path = tmp_path / "risk.yaml"
    yaml_path.write_text("risk_per_trade_pct: 0.015\nmax_concurrent_positions: 5\n")
    cfg = load_risk_config(
        yaml_path=yaml_path,
        cli_overrides={"max_concurrent_positions": 2},
    )
    assert cfg.risk_per_trade_pct == 0.015
    assert cfg.max_concurrent_positions == 2  # CLI beats yaml


def test_load_risk_config_unknown_field_raises(tmp_path: Path):
    yaml_path = tmp_path / "risk.yaml"
    yaml_path.write_text("bogus_field: 1\n")
    with pytest.raises(ConfigValidationError, match="unknown"):
        load_risk_config(yaml_path=yaml_path)


def test_load_risk_config_invalid_yaml_shape(tmp_path: Path):
    yaml_path = tmp_path / "risk.yaml"
    yaml_path.write_text("- just_a_list\n")
    with pytest.raises(ConfigValidationError, match="mapping"):
        load_risk_config(yaml_path=yaml_path)
