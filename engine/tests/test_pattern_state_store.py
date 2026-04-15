from __future__ import annotations

from datetime import datetime, timezone

from patterns.state_store import PatternStateStore
from patterns.types import PhaseTransition


def test_append_transition_persists_event_and_state(tmp_path) -> None:
    store = PatternStateStore(tmp_path / "pattern_runtime.sqlite")
    ts = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)

    transition = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        pattern_version=1,
        timeframe="1h",
        from_phase="REAL_DUMP",
        to_phase="ACCUMULATION",
        from_phase_idx=2,
        to_phase_idx=3,
        timestamp=ts,
        trigger_bar_ts=ts,
        scan_id="scan-1",
        is_entry_signal=True,
        confidence=0.75,
        blocks_triggered=["higher_lows_sequence", "funding_flip"],
        block_scores={
            "higher_lows_sequence": {"passed": True, "score": 0.8},
            "funding_flip": {"passed": True, "score": 1.0},
        },
        feature_snapshot={"oi_change_1h": 0.2},
        data_quality={"has_perp": True},
    )

    record = store.append_transition(transition)

    assert record.transition_id == transition.transition_id
    assert record.block_scores["higher_lows_sequence"]["score"] == 0.8
    assert record.scan_id == "scan-1"

    states = store.list_states("tradoor-oi-reversal-v1")
    assert len(states) == 1
    state = states[0]
    assert state.symbol == "PTBUSDT"
    assert state.current_phase == "ACCUMULATION"
    assert state.current_phase_idx == 3
    assert state.last_transition_id == transition.transition_id

    loaded = store.get_transition(transition.transition_id)
    assert loaded is not None
    assert loaded.feature_snapshot == {"oi_change_1h": 0.2}
    assert loaded.data_quality == {"has_perp": True}


def test_store_is_append_only_for_transitions(tmp_path) -> None:
    store = PatternStateStore(tmp_path / "pattern_runtime.sqlite")
    ts = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)

    first = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        from_phase="NONE",
        to_phase="FAKE_DUMP",
        from_phase_idx=None,
        to_phase_idx=0,
        timestamp=ts,
        transition_kind="phase_entered",
        blocks_triggered=["recent_decline", "funding_extreme"],
    )
    second = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        from_phase="FAKE_DUMP",
        to_phase="ARCH_ZONE",
        from_phase_idx=0,
        to_phase_idx=1,
        timestamp=ts,
        blocks_triggered=["sideways_compression"],
    )

    store.append_transition(first)
    store.append_transition(second)

    transitions = store.list_transitions("tradoor-oi-reversal-v1")
    assert [t.transition_id for t in transitions] == [first.transition_id, second.transition_id]

    [state] = store.list_states("tradoor-oi-reversal-v1")
    assert state.current_phase == "ARCH_ZONE"
    assert state.last_transition_id == second.transition_id
