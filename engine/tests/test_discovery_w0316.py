"""W-0316: Tests for LLM pipeline + discovery agent.

All tests mock litellm — no real API calls.
AC: cost cap, gate enforcement, tool loop, finding format, provider routing.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# router tests
# ---------------------------------------------------------------------------

def test_router_default_models():
    from llm.router import TASK_MODEL
    assert "judge" in TASK_MODEL
    assert "summary" in TASK_MODEL
    assert "scan" in TASK_MODEL


def test_router_judge_blocks_local(monkeypatch):
    monkeypatch.setenv("LLM_JUDGE_MODEL", "ollama/qwen2.5:14b")
    monkeypatch.setenv("LLM_JUDGE_FALLBACK_MODEL", "anthropic/claude-haiku-4-5-20251001")
    # reimport to pick up env
    import importlib
    import llm.router as r
    importlib.reload(r)
    model = r.resolve_model("judge")
    assert model == "anthropic/claude-haiku-4-5-20251001"


def test_router_summary_allows_local(monkeypatch):
    monkeypatch.setenv("LLM_SUMMARY_MODEL", "ollama/qwen2.5:14b")
    import importlib, llm.router as r
    importlib.reload(r)
    model = r.resolve_model("summary")
    assert model == "ollama/qwen2.5:14b"


# ---------------------------------------------------------------------------
# cost_tracker tests
# ---------------------------------------------------------------------------

def test_cost_tracker_accumulates():
    from llm.cost_tracker import CostTracker
    t = CostTracker(cycle_id="test-cycle-1", cap_usd=1.0)
    cost = t.record_call("judge", "anthropic/claude-haiku-4-5-20251001", 1000, 200)
    assert cost > 0
    assert t.total_usd == cost


def test_cost_tracker_hard_cap():
    from llm.cost_tracker import CostCapExceeded, CostTracker
    t = CostTracker(cycle_id="test-cycle-2", cap_usd=0.0001)
    with pytest.raises(CostCapExceeded) as exc_info:
        t.record_call("judge", "anthropic/claude-haiku-4-5-20251001", 100_000, 50_000)
    assert exc_info.value.cycle_id == "test-cycle-2"


def test_cost_tracker_ollama_is_free():
    from llm.cost_tracker import CostTracker
    t = CostTracker(cycle_id="test-cycle-3", cap_usd=1.0)
    cost = t.record_call("summary", "ollama/qwen2.5:14b", 10_000, 5_000)
    assert cost == 0.0


def test_cost_tracker_flush_best_effort(monkeypatch):
    """flush_to_supabase never raises even on DB error."""
    from llm.cost_tracker import CostTracker
    t = CostTracker(cycle_id="test-cycle-4", cap_usd=1.0)
    t.record_call("judge", "anthropic/claude-haiku-4-5-20251001", 100, 50)

    with patch("llm._supabase.get_client", side_effect=RuntimeError("no db")):
        t.flush_to_supabase()  # must not raise


# ---------------------------------------------------------------------------
# Tool handler tests
# ---------------------------------------------------------------------------

def test_tool_judge_discard_low_sharpe():
    from research.discovery_tools import ToolHandlers
    h = ToolHandlers(cycle_id="x", agent_model="haiku")
    result = h.dispatch("judge_finding", {
        "slug": "test", "symbol": "BTCUSDT", "timeframe": "4h",
        "win_rate": 0.60, "sharpe": 0.5,  # below 0.8
        "n_samples": 20, "similar_count": 3, "gate_passed": True,
    })
    assert result["verdict"] == "discard"
    assert "sharpe" in result["reason"]


def test_tool_judge_discard_low_n():
    from research.discovery_tools import ToolHandlers
    h = ToolHandlers(cycle_id="x", agent_model="haiku")
    result = h.dispatch("judge_finding", {
        "slug": "test", "symbol": "BTCUSDT", "timeframe": "4h",
        "win_rate": 0.62, "sharpe": 1.2,
        "n_samples": 10,  # below 15
        "similar_count": 3, "gate_passed": True,
    })
    assert result["verdict"] == "discard"


def test_tool_judge_discard_gate_fail():
    from research.discovery_tools import ToolHandlers
    h = ToolHandlers(cycle_id="x", agent_model="haiku")
    result = h.dispatch("judge_finding", {
        "slug": "test", "symbol": "BTCUSDT", "timeframe": "4h",
        "win_rate": 0.65, "sharpe": 1.5, "n_samples": 30,
        "similar_count": 3, "gate_passed": False,  # gate failed
    })
    assert result["verdict"] == "discard"


def test_tool_judge_keep():
    from research.discovery_tools import ToolHandlers
    h = ToolHandlers(cycle_id="x", agent_model="haiku")
    result = h.dispatch("judge_finding", {
        "slug": "test", "symbol": "BTCUSDT", "timeframe": "4h",
        "win_rate": 0.63, "sharpe": 1.3, "n_samples": 25,
        "similar_count": 4, "gate_passed": True,
    })
    assert result["verdict"] == "keep"


def test_tool_propose_writes_file(tmp_path):
    from research.discovery_tools import ToolHandlers
    h = ToolHandlers(cycle_id="cycle-abc", agent_model="haiku", inbox_root=tmp_path)
    result = h.dispatch("propose_to_user", {
        "slug": "btc-4h-accum",
        "symbol": "BTCUSDT",
        "timeframe": "4h",
        "pattern_label": "ACCUMULATION→BREAKOUT",
        "win_rate": 0.63,
        "sharpe": 1.4,
        "n_samples": 23,
        "ci_low": 0.52,
        "ci_high": 0.74,
        "regime": "high_vol_trending",
        "similar_count": 3,
        "summary": "Strong accumulation with OI spike and funding flip.",
    })
    assert "path" in result
    assert result["proposal_number"] == 1
    path = Path(result["path"])
    assert path.exists()
    content = path.read_text()
    assert "BTCUSDT" in content
    assert "ACCUMULATION" in content
    assert "win_rate=0.63" in content
    assert "cycle_id: cycle-abc" in content


def test_tool_propose_enforces_limit(tmp_path):
    from research.discovery_tools import ToolHandlers
    h = ToolHandlers(cycle_id="c", agent_model="haiku", inbox_root=tmp_path)
    h.proposal_count = 5  # already at limit
    result = h.dispatch("propose_to_user", {
        "slug": "x", "symbol": "ETH", "timeframe": "1h",
        "pattern_label": "P", "win_rate": 0.6, "sharpe": 1.0,
        "n_samples": 20, "ci_low": 0.5, "ci_high": 0.7,
        "regime": "mid", "similar_count": 2, "summary": "s",
    })
    assert "error" in result


def test_tool_stop():
    from research.discovery_tools import ToolHandlers
    h = ToolHandlers(cycle_id="x", agent_model="haiku")
    result = h.dispatch("stop_research", {"reason": "proposals_limit"})
    assert result["stopped"] is True
    assert h.stop_requested is True


# ---------------------------------------------------------------------------
# Discovery agent integration (mocked litellm)
# ---------------------------------------------------------------------------

def _make_litellm_resp(tool_name: str, tool_args: dict, call_id: str = "call_1"):
    """Build a mock litellm response with one tool call."""
    tc = MagicMock()
    tc.id = call_id
    tc.function.name = tool_name
    tc.function.arguments = json.dumps(tool_args)

    msg = MagicMock()
    msg.content = ""
    msg.tool_calls = [tc]

    choice = MagicMock()
    choice.message = msg

    resp = MagicMock()
    resp.choices = [choice]
    resp.usage.prompt_tokens = 500
    resp.usage.completion_tokens = 100
    return resp


def _make_stop_resp():
    """Build a mock response that calls stop_research."""
    return _make_litellm_resp("stop_research", {"reason": "no_candidates"}, "call_stop")


@pytest.mark.asyncio
async def test_agent_stop_on_disabled(monkeypatch):
    monkeypatch.setenv("DISCOVERY_AGENT_ENABLED", "false")
    from research.discovery_agent import DiscoveryAgent
    agent = DiscoveryAgent()
    result = await agent.run()
    assert result.stop_reason == "disabled"
    assert result.cycle_id == "disabled"


@pytest.mark.asyncio
async def test_agent_cost_cap_terminates(tmp_path, monkeypatch):
    monkeypatch.setenv("DISCOVERY_AGENT_ENABLED", "true")
    monkeypatch.setenv("LLM_CYCLE_COST_CAP", "0.000001")  # tiny cap

    # First call = scan_universe (will hit cap because cost > 0)
    scan_resp = _make_litellm_resp("scan_universe", {"top_k": 5})

    with (
        patch("llm.provider.litellm.acompletion", new_callable=AsyncMock, return_value=scan_resp),
        patch("research.discovery_tools.ToolHandlers._tool_scan_universe",
              return_value={"candidates": [], "count": 0}),
        patch("llm.cost_tracker.CostTracker.flush_to_supabase"),
    ):
        import importlib
        import llm.cost_tracker as ct
        importlib.reload(ct)
        from research.discovery_agent import DiscoveryAgent
        agent = DiscoveryAgent(inbox_root=tmp_path)
        result = await agent.run()

    assert result.stop_reason == "cost_cap"
    assert result.error is None


@pytest.mark.asyncio
async def test_agent_full_cycle_one_proposal(tmp_path, monkeypatch):
    monkeypatch.setenv("DISCOVERY_AGENT_ENABLED", "true")
    monkeypatch.setenv("LLM_CYCLE_COST_CAP", "10.0")

    responses = [
        _make_litellm_resp("scan_universe", {"top_k": 5}, "c1"),
        _make_litellm_resp("validate_pattern",
                           {"slug": "btc-4h", "symbol": "BTCUSDT", "timeframe": "4h"}, "c2"),
        _make_litellm_resp("search_similar_history",
                           {"slug": "btc-4h", "symbol": "BTCUSDT", "timeframe": "4h"}, "c3"),
        _make_litellm_resp("judge_finding", {
            "slug": "btc-4h", "symbol": "BTCUSDT", "timeframe": "4h",
            "win_rate": 0.63, "sharpe": 1.3, "n_samples": 25,
            "similar_count": 3, "gate_passed": True,
        }, "c4"),
        _make_litellm_resp("propose_to_user", {
            "slug": "btc-4h", "symbol": "BTCUSDT", "timeframe": "4h",
            "pattern_label": "TEST", "win_rate": 0.63, "sharpe": 1.3,
            "n_samples": 25, "ci_low": 0.53, "ci_high": 0.73,
            "regime": "trending", "similar_count": 3,
            "summary": "Test summary.",
        }, "c5"),
        _make_litellm_resp("stop_research", {"reason": "no_candidates"}, "c6"),
    ]
    call_count = [0]

    async def _mock_completion(**kwargs):
        idx = call_count[0]
        call_count[0] += 1
        return responses[min(idx, len(responses) - 1)]

    with (
        patch("llm.provider.litellm.acompletion", side_effect=_mock_completion),
        patch("research.discovery_tools.ToolHandlers._tool_scan_universe",
              return_value={"candidates": [{"slug": "btc-4h", "symbol": "BTCUSDT",
                                           "timeframe": "4h", "sharpe": 1.3,
                                           "win_rate": 0.63, "n_samples": 25}], "count": 1}),
        patch("research.discovery_tools.ToolHandlers._tool_validate_pattern",
              return_value={"slug": "btc-4h", "overall_pass": True, "stage": "shadow",
                            "dsr_n_trials": 3, "gate": None, "error": None}),
        patch("research.discovery_tools.ToolHandlers._tool_search_similar_history",
              return_value={"similar": [{"symbol": "BTCUSDT", "score": 0.85}], "count": 1}),
        patch("llm.cost_tracker.CostTracker.flush_to_supabase"),
    ):
        from research.discovery_agent import DiscoveryAgent
        agent = DiscoveryAgent(inbox_root=tmp_path)
        result = await agent.run()

    assert result.success
    assert len(result.proposals) == 1
    assert result.turns_used >= 1
    # Verify finding file was written
    finding_files = list(tmp_path.rglob("*.md"))
    assert len(finding_files) == 1
    content = finding_files[0].read_text()
    assert "BTCUSDT" in content
