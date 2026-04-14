from __future__ import annotations

from datetime import datetime, timezone

from patterns.entry_scorer import PatternEntryScore
from patterns.types import PhaseTransition
import patterns.scanner as pattern_scanner


def test_on_entry_signal_persists_shadow_ml_metadata(monkeypatch) -> None:
    saved = []

    class FakeStore:
        def save(self, outcome):
            saved.append(outcome)
            return None

    monkeypatch.setattr(pattern_scanner, "LEDGER_STORE", FakeStore())
    monkeypatch.setattr(pattern_scanner, "_get_entry_price", lambda symbol: 123.45)
    monkeypatch.setattr(pattern_scanner, "_detect_btc_trend", lambda: "bullish")
    monkeypatch.setattr(
        pattern_scanner,
        "score_entry_feature_snapshot",
        lambda snapshot: PatternEntryScore(
            state="scored",
            p_win=0.73,
            model_version="20260414_010203",
            threshold=0.55,
            threshold_passed=True,
            error=None,
        ),
    )

    transition = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        from_phase="REAL_DUMP",
        to_phase="ACCUMULATION",
        timestamp=datetime(2026, 4, 14, 1, 0, tzinfo=timezone.utc),
        confidence=0.75,
        feature_snapshot={"ema20_slope": 0.1, "oi_change_1h": 0.2},
    )

    pattern_scanner._on_entry_signal(transition)

    assert len(saved) == 1
    outcome = saved[0]
    assert outcome.symbol == "PTBUSDT"
    assert outcome.entry_price == 123.45
    assert outcome.btc_trend_at_entry == "bullish"
    assert outcome.entry_block_coverage == 0.75
    assert outcome.entry_p_win == 0.73
    assert outcome.entry_ml_state == "scored"
    assert outcome.entry_model_version == "20260414_010203"
    assert outcome.entry_threshold == 0.55
    assert outcome.entry_threshold_passed is True
    assert outcome.feature_snapshot == {"ema20_slope": 0.1, "oi_change_1h": 0.2}
