from __future__ import annotations

from datetime import datetime, timedelta, timezone

from patterns.library import TRADOOR_OI_REVERSAL
from patterns.state_machine import PatternStateMachine
from patterns.state_store import PatternStateStore


def ts(offset_hours: int = 0) -> datetime:
    return datetime(2026, 4, 15, 0, 0, tzinfo=timezone.utc) + timedelta(hours=offset_hours)


def test_state_machine_emits_durable_transition_evidence() -> None:
    transitions = []
    sm = PatternStateMachine(TRADOOR_OI_REVERSAL, on_transition=transitions.append)

    t = sm.evaluate(
        "PTBUSDT",
        ["recent_decline", "funding_extreme"],
        ts(0),
        feature_snapshot={"price_change_1h": -0.06},
        scan_id="scan-1",
        data_quality={"has_perp": True},
    )

    assert t is not None
    assert transitions == [t]
    assert t.transition_id
    assert t.transition_kind == "phase_entered"
    assert t.from_phase == "NONE"
    assert t.to_phase == "FAKE_DUMP"
    assert t.to_phase_idx == 0
    assert t.scan_id == "scan-1"
    assert t.block_scores["recent_decline"]["passed"] is True
    assert t.feature_snapshot == {"price_change_1h": -0.06}


def test_state_machine_can_hydrate_from_store(tmp_path) -> None:
    store = PatternStateStore(tmp_path / "pattern_runtime.sqlite")
    sm = PatternStateMachine(TRADOOR_OI_REVERSAL, on_transition=store.append_transition)

    sm.evaluate("PTBUSDT", ["recent_decline", "funding_extreme"], ts(0))
    sm.evaluate("PTBUSDT", [], ts(1))
    sm.evaluate("PTBUSDT", ["sideways_compression"], ts(2))

    restored = PatternStateMachine(TRADOOR_OI_REVERSAL)
    restored.hydrate_states(store.hydrate_states(TRADOOR_OI_REVERSAL))

    assert restored.get_current_phase("PTBUSDT") == "ARCH_ZONE"
    rich = restored.get_all_states_rich()["PTBUSDT"]
    assert rich["phase_label"] == "번지대 형성 (진입 금지)"
