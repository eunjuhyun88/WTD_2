"""Tests for wizard.composer — answers → challenge folder files.

Uses a hand-crafted answers dict that mirrors what the interview would
produce, exercises compose_match_py unit-level and generate_challenge
end-to-end writing into tmp_path.
"""
from __future__ import annotations

from pathlib import Path

import yaml
import pytest

pytest.importorskip("wizard.composer", reason="wizard package not present in current repo layout")

from wizard.composer import (
    compose_match_py,
    compose_program_md_blocks,
    format_block_call,
    generate_challenge,
)


def _sample_answers() -> dict:
    return {
        "version": 1,
        "schema": "pattern_hunting",
        "created_at": "2026-04-11T20:00:00Z",
        "identity": {
            "name": "test-pattern",
            "description": "A test pattern for the composer test suite.",
        },
        "setup": {
            "direction": "long",
            "universe": "binance_30",
            "timeframe": "1h",
        },
        "blocks": {
            "trigger": {
                "module": "building_blocks.triggers",
                "function": "recent_rally",
                "params": {"pct": 0.15, "lookback_bars": 120},
            },
            "confirmations": [
                {
                    "module": "building_blocks.confirmations",
                    "function": "fib_retracement",
                    "params": {"levels": (0.618,), "tolerance": 0.01, "lookback": 60},
                },
                {
                    "module": "building_blocks.confirmations",
                    "function": "dead_cross",
                    "params": {"fast": 50, "slow": 200},
                },
            ],
            "entry": {
                "module": "building_blocks.entries",
                "function": "long_lower_wick",
                "params": {"body_ratio": 2.5},
            },
            "disqualifiers": [
                {
                    "module": "building_blocks.disqualifiers",
                    "function": "extreme_volatility",
                    "params": {"atr_pct_threshold": 0.08, "atr_period": 14},
                },
            ],
        },
        "outcome": {
            "target_pct": 0.06,
            "stop_pct": 0.02,
            "horizon_bars": 24,
        },
    }


# -------- format_block_call --------------------------------------------------


def test_format_block_call_with_params():
    imp, call = format_block_call(
        "building_blocks.triggers",
        "recent_rally",
        {"pct": 0.15, "lookback_bars": 120},
    )
    assert imp == "from building_blocks.triggers import recent_rally"
    assert "recent_rally(ctx" in call
    assert "pct=0.15" in call
    assert "lookback_bars=120" in call


def test_format_block_call_no_params():
    imp, call = format_block_call(
        "building_blocks.entries", "bullish_engulfing", {}
    )
    assert call == "bullish_engulfing(ctx)"


def test_format_block_call_invert_disqualifier():
    imp, call = format_block_call(
        "building_blocks.disqualifiers", "extreme_volatility",
        {"atr_pct_threshold": 0.08},
        invert=True,
    )
    assert call.startswith("~(") and call.endswith(")")


def test_format_block_call_tuple_values():
    _, call = format_block_call(
        "building_blocks.confirmations",
        "fib_retracement",
        {"levels": (0.618, 0.786), "tolerance": 0.005},
    )
    # Tuple literal should serialise as a tuple
    assert "levels=(0.618, 0.786)" in call


# -------- compose_match_py ---------------------------------------------------


def test_compose_match_py_basic_shape():
    imports, body = compose_match_py(_sample_answers())

    # All four import lines present
    assert "from building_blocks.triggers import recent_rally" in imports
    assert "from building_blocks.confirmations import fib_retracement" in imports
    assert "from building_blocks.confirmations import dead_cross" in imports
    assert "from building_blocks.entries import long_lower_wick" in imports
    assert "from building_blocks.disqualifiers import extreme_volatility" in imports

    # Body: trigger seeds mask, rest AND
    lines = body.split("\n")
    assert lines[0].strip().startswith("mask = recent_rally(ctx")
    assert any("mask &= fib_retracement" in line for line in lines)
    assert any("mask &= dead_cross" in line for line in lines)
    assert any("mask &= long_lower_wick" in line for line in lines)
    # Disqualifier is inverted
    assert any("~(extreme_volatility" in line for line in lines)


def test_compose_match_py_no_entry():
    """When entry is None, body should skip the entry line."""
    answers = _sample_answers()
    answers["blocks"]["entry"] = None
    imports, body = compose_match_py(answers)
    assert "long_lower_wick" not in imports
    assert "long_lower_wick" not in body


def test_compose_match_py_no_confirmations_or_disqualifiers():
    answers = _sample_answers()
    answers["blocks"]["confirmations"] = []
    answers["blocks"]["disqualifiers"] = []
    imports, body = compose_match_py(answers)
    # Only trigger + entry lines
    body_lines = [line for line in body.split("\n") if line.strip()]
    assert len(body_lines) == 2  # trigger, entry


def test_compose_match_py_deduplicates_imports():
    """Two confirmations from the same module produce one import line."""
    answers = _sample_answers()
    imports, _ = compose_match_py(answers)
    # building_blocks.confirmations appears twice (fib + dead_cross) but
    # each import is for a different function so both lines are present.
    # Ensure no exact duplicates.
    lines = imports.split("\n")
    assert len(lines) == len(set(lines))


# -------- compose_program_md_blocks ------------------------------------------


def test_program_md_blocks_lists_all_sections():
    text = compose_program_md_blocks(_sample_answers())
    assert "Trigger" in text
    assert "recent_rally" in text
    assert "Confirmation" in text
    assert "fib_retracement" in text
    assert "Entry" in text
    assert "long_lower_wick" in text
    assert "Disqualifier" in text
    assert "extreme_volatility" in text


# -------- generate_challenge (end-to-end) ------------------------------------


def test_generate_challenge_writes_all_files(tmp_path: Path):
    target = generate_challenge(_sample_answers(), tmp_path)

    assert target == tmp_path / "pattern-hunting" / "test-pattern"
    assert target.is_dir()

    for name in ("prepare.py", "match.py", "program.md", "pyproject.toml", "answers.yaml"):
        assert (target / name).exists(), f"missing {name}"
    assert (target / "output").is_dir()

    # match.py is valid Python: compile it
    match_src = (target / "match.py").read_text()
    compile(match_src, "match.py", "exec")
    assert "def matches(klines" in match_src
    assert "recent_rally" in match_src
    assert "fib_retracement" in match_src

    # program.md has the description
    program = (target / "program.md").read_text()
    assert "A test pattern for the composer test suite." in program
    assert "6.00%" in program  # target_pct display

    # answers.yaml round-trips
    with (target / "answers.yaml").open() as f:
        loaded = yaml.safe_load(f)
    assert loaded["identity"]["name"] == "test-pattern"
    assert loaded["blocks"]["trigger"]["function"] == "recent_rally"


def test_generate_challenge_refuses_existing(tmp_path: Path):
    generate_challenge(_sample_answers(), tmp_path)
    import pytest
    with pytest.raises(FileExistsError):
        generate_challenge(_sample_answers(), tmp_path)


def test_generate_challenge_overwrite(tmp_path: Path):
    target1 = generate_challenge(_sample_answers(), tmp_path)
    # Modify match.py and generate again with overwrite
    (target1 / "match.py").write_text("# modified")
    target2 = generate_challenge(_sample_answers(), tmp_path, overwrite=True)
    assert target1 == target2
    assert "# modified" not in (target2 / "match.py").read_text()


def test_generated_prepare_py_compiles(tmp_path: Path):
    target = generate_challenge(_sample_answers(), tmp_path)
    src = (target / "prepare.py").read_text()
    compile(src, "prepare.py", "exec")
