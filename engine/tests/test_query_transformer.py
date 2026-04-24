from __future__ import annotations

import pytest

from research.query_transformer import transform_pattern_draft


def test_transform_pattern_draft_builds_deterministic_search_query_spec() -> None:
    spec = transform_pattern_draft(
        {
            "schema_version": 1,
            "pattern_family": "tradoor_ptb_oi_reversal",
            "pattern_label": "Second dump reclaim",
            "source_type": "terminal_capture",
            "source_text": "OI spike after second dump then higher lows",
            "symbol_candidates": ["TRADOORUSDT"],
            "timeframe": "15m",
            "phases": [
                {
                    "phase_id": "real_dump",
                    "label": "real dump",
                    "sequence_order": 0,
                    "signals_required": ["oi_spike", "short_funding_pressure"],
                    "signals_preferred": ["volume_breakout"],
                },
                {
                    "phase_id": "accumulation",
                    "label": "higher lows",
                    "sequence_order": 1,
                    "signals_required": ["higher_lows_sequence"],
                    "signals_forbidden": ["long_funding_pressure"],
                    "max_gap_bars": 18,
                },
                {
                    "phase_id": "breakout",
                    "label": "range break",
                    "sequence_order": 2,
                    "signals_required": ["range_high_break"],
                },
            ],
            "search_hints": {
                "must_have_signals": ["dump_then_reclaim"],
                "preferred_timeframes": ["30m", "1h"],
                "exclude_patterns": ["continued_dump_after_low_oi"],
                "similarity_focus": ["phase_path", "required_signals"],
                "symbol_scope": ["TRADOORUSDT", "PTBUSDT"],
            },
        }
    )

    payload = spec.to_dict()
    assert payload["pattern_family"] == "tradoor_ptb_oi_reversal"
    assert payload["reference_timeframe"] == "15m"
    assert payload["phase_path"] == ["real_dump", "accumulation", "breakout"]
    assert payload["must_have_signals"] == [
        "dump_then_reclaim",
        "oi_spike",
        "short_funding_pressure",
        "higher_lows_sequence",
        "range_high_break",
    ]
    assert payload["preferred_timeframes"] == ["15m", "30m", "1h"]
    assert payload["exclude_patterns"] == ["continued_dump_after_low_oi"]
    assert payload["similarity_focus"] == ["phase_path", "required_signals"]
    assert payload["symbol_scope"] == ["TRADOORUSDT", "PTBUSDT"]
    assert payload["transformer_meta"] == {
        "transformer_version": "query-transformer-v1",
        "signal_vocab_version": "signal-vocab-v1",
        "rule_registry_version": "signal-rule-registry-v1",
    }

    phase_queries = payload["phase_queries"]
    assert phase_queries[0]["required_numeric"]["oi_zscore"] == {"min": 1.5}
    assert phase_queries[0]["required_numeric"]["funding_rate_zscore"] == {"max": -1.0}
    assert phase_queries[0]["preferred_numeric"]["volume_percentile"] == {"min": 0.75}
    assert phase_queries[1]["required_boolean"] == {"higher_lows_sequence": True}
    assert phase_queries[1]["forbidden_numeric"]["funding_rate_zscore"] == {"min": 1.0}
    assert phase_queries[1]["max_gap_bars"] == 18
    assert phase_queries[2]["required_boolean"] == {"range_high_break": True}


@pytest.mark.parametrize(
    ("pattern_draft", "message"),
    [
        ({}, "pattern_draft.pattern_family is required"),
        (
            {
                "pattern_family": "tradoor_ptb_oi_reversal",
                "timeframe": "15m",
                "phases": [],
            },
            "pattern_draft.phases must contain at least one phase",
        ),
        (
            {
                "pattern_family": "tradoor_ptb_oi_reversal",
                "phases": [{"phase_id": "real_dump", "label": "real dump", "sequence_order": 0}],
            },
            "pattern_draft.timeframe is required",
        ),
    ],
)
def test_transform_pattern_draft_validates_required_fields(
    pattern_draft: dict[str, object],
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        transform_pattern_draft(pattern_draft)
