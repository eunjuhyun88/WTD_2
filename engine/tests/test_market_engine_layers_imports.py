from __future__ import annotations

from market_engine.layers import (
    DeepResult as new_DeepResult,
    SniperGate as new_SniperGate,
    l1_rsi_realtime as new_l1_rsi_realtime,
    l1_velocity as new_l1_velocity,
    run_deep_analysis as new_run_deep_analysis,
    should_promote as new_should_promote,
)
from market_engine.pipeline import (
    DeepResult as old_DeepResult,
    SniperGate as old_SniperGate,
    l1_rsi_realtime as old_l1_rsi_realtime,
    l1_velocity as old_l1_velocity,
    run_deep_analysis as old_run_deep_analysis,
    should_promote as old_should_promote,
)


def test_imports_resolve_from_old_and_new_paths() -> None:
    assert old_l1_velocity is new_l1_velocity
    assert old_l1_rsi_realtime is new_l1_rsi_realtime
    assert old_should_promote is new_should_promote
    assert old_run_deep_analysis is new_run_deep_analysis
    assert old_DeepResult is new_DeepResult
    assert old_SniperGate is new_SniperGate


def test_l1_helpers_smoke_behavior_equivalent() -> None:
    snaps = [100.0, 120.0, 150.0, 180.0, 220.0, 260.0, 320.0]
    old_vel = old_l1_velocity(snaps, window_recent=3, history=10)
    new_vel = new_l1_velocity(snaps, window_recent=3, history=10)
    assert old_vel == new_vel

    prices = [100.0 + i for i in range(30)]
    assert old_l1_rsi_realtime(prices) == new_l1_rsi_realtime(prices)

    assert old_should_promote(velocity=2.0, vol_1m=20_000.0) == new_should_promote(
        velocity=2.0, vol_1m=20_000.0
    )


def test_deep_result_and_sniper_gate_smoke_behavior_equivalent() -> None:
    old_res = old_DeepResult(symbol="BTCUSDT")
    new_res = new_DeepResult(symbol="BTCUSDT")
    assert old_res.symbol == new_res.symbol == "BTCUSDT"
    assert old_res.total_score == new_res.total_score == 0.0

    old_gate = old_SniperGate("BTCUSDT", avg_vol_1m=200_000.0)
    new_gate = new_SniperGate("BTCUSDT", avg_vol_1m=200_000.0)
    assert old_gate.dyn_cvd_target == new_gate.dyn_cvd_target
    assert old_gate.dyn_whale_tick == new_gate.dyn_whale_tick
