"""W-0316: 6 discovery tools — schema definitions + handlers.

Tools:
  scan_universe         — symbol×TF priority list from AutoResearchLoop meta
  validate_pattern      — statistical validation (calls validation/facade.py)
  search_similar_history — top-N similar past setups
  judge_finding         — LLM multi-axis evaluation → keep/discard
  propose_to_user       — write inbox MD
  stop_research         — end the discovery cycle

All handlers return a dict. Errors return {"error": str}.
Handlers are intentionally synchronous thin wrappers — async is in provider.py.
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool schemas (Anthropic / litellm tool_use format)
# ---------------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "scan_universe",
            "description": (
                "Scan the market universe and return the top candidate "
                "symbol+timeframe pairs ranked by AutoResearchLoop cycle meta. "
                "Call this first to decide where to focus."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "top_k": {
                        "type": "integer",
                        "description": "Max candidates to return (1-30).",
                        "default": 10,
                    },
                    "min_sharpe": {
                        "type": "number",
                        "description": "Minimum Sharpe threshold for inclusion.",
                        "default": 0.5,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "validate_pattern",
            "description": (
                "Run full statistical validation (G1~G8 gates, BH-FDR, DSR) "
                "on a specific pattern slug. Returns overall_pass and gate details. "
                "Only call if win_rate >= 0.55 AND n_samples >= 15 AND Sharpe >= 0.8."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "slug": {"type": "string", "description": "Pattern slug to validate."},
                    "symbol": {"type": "string"},
                    "timeframe": {"type": "string", "enum": ["1h", "4h", "1d", "3d", "7d"]},
                },
                "required": ["slug", "symbol", "timeframe"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_similar_history",
            "description": (
                "Search for historical similar market setups. "
                "Returns top-N past instances with outcome statistics."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "slug": {"type": "string"},
                    "symbol": {"type": "string"},
                    "timeframe": {"type": "string"},
                    "top_k": {"type": "integer", "default": 5},
                },
                "required": ["slug", "symbol", "timeframe"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "judge_finding",
            "description": (
                "Multi-axis evaluation of a validated pattern. "
                "Returns verdict: keep or discard, with reasoning. "
                "ONLY call after validate_pattern returns overall_pass=true."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "slug": {"type": "string"},
                    "symbol": {"type": "string"},
                    "timeframe": {"type": "string"},
                    "win_rate": {"type": "number"},
                    "sharpe": {"type": "number"},
                    "n_samples": {"type": "integer"},
                    "similar_count": {"type": "integer"},
                    "gate_passed": {"type": "boolean"},
                },
                "required": ["slug", "symbol", "timeframe", "win_rate", "sharpe",
                             "n_samples", "similar_count", "gate_passed"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_to_user",
            "description": (
                "Write a validated finding to the user inbox. "
                "Call only after judge_finding returns verdict=keep. "
                "Maximum 5 proposals per cycle."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "slug": {"type": "string"},
                    "symbol": {"type": "string"},
                    "timeframe": {"type": "string"},
                    "pattern_label": {"type": "string", "description": "Human-readable pattern name."},
                    "win_rate": {"type": "number"},
                    "sharpe": {"type": "number"},
                    "n_samples": {"type": "integer"},
                    "ci_low": {"type": "number"},
                    "ci_high": {"type": "number"},
                    "regime": {"type": "string"},
                    "similar_count": {"type": "integer"},
                    "summary": {"type": "string", "description": "Trader-readable summary (1-3 sentences)."},
                },
                "required": ["slug", "symbol", "timeframe", "pattern_label",
                             "win_rate", "sharpe", "n_samples",
                             "ci_low", "ci_high", "regime", "similar_count", "summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stop_research",
            "description": (
                "End the discovery cycle. Call when: "
                "(1) 5 proposals reached, "
                "(2) no more promising candidates, "
                "(3) cost cap warning received."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "enum": ["proposals_limit", "no_candidates", "cost_cap", "manual"],
                    },
                },
                "required": ["reason"],
            },
        },
    },
]

TOOL_CHOICE_AUTO = {"type": "auto"}


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

class ToolHandlers:
    """Stateful tool handler registry for one discovery cycle."""

    def __init__(
        self,
        cycle_id: str,
        agent_model: str,
        inbox_root=None,
    ):
        self.cycle_id = cycle_id
        self.agent_model = agent_model
        self.inbox_root = inbox_root
        self.proposal_count = 0
        self.stop_requested = False
        self.stop_reason: str | None = None
        self.proposed_paths: list[str] = []

    def dispatch(self, tool_name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
        fn = getattr(self, f"_tool_{tool_name}", None)
        if fn is None:
            return {"error": f"unknown tool: {tool_name}"}
        try:
            return fn(**tool_input)
        except Exception as exc:
            log.error("tool %s failed: %s", tool_name, exc, exc_info=True)
            return {"error": str(exc)}

    def _tool_scan_universe(self, top_k: int = 10, min_sharpe: float = 0.5) -> dict:
        try:
            from research.autoresearch_loop import AutoResearchLoop
            loop = AutoResearchLoop()
            top = loop.get_top_symbols(top_n=min(top_k, 30), min_sharpe=min_sharpe)
            candidates = []
            for _, row in top.iterrows():
                candidates.append({
                    "symbol": row.get("symbol", ""),
                    "timeframe": row.get("timeframe", "4h"),
                    "slug": row.get("slug", ""),
                    "sharpe": float(row.get("sharpe", 0.0)),
                    "win_rate": float(row.get("win_rate", 0.0)),
                    "n_samples": int(row.get("n_trades", 0)),
                })
            return {"candidates": candidates, "count": len(candidates)}
        except Exception as exc:
            return {"error": str(exc), "candidates": []}

    def _tool_validate_pattern(
        self, slug: str, symbol: str, timeframe: str
    ) -> dict:
        try:
            from datetime import datetime, timezone

            from research.validation.facade import validate_and_gate
            from research.pattern_search import ReplayBenchmarkPack

            pack = ReplayBenchmarkPack(pattern_slug=slug, cases=[])
            family = f"{symbol.lower()}_{timeframe.lower()}"
            # as_of = now: no historical pack data available in agent context.
            # This is a conservative bound (today's bar is not future data).
            as_of = datetime.now(timezone.utc)
            result = validate_and_gate(
                slug=slug, pack=pack, family=family, as_of=as_of
            )
            return {
                "slug": slug,
                "overall_pass": result.overall_pass,
                "stage": result.stage,
                "dsr_n_trials": result.dsr_n_trials,
                "gate": result.gate_result.to_dict() if result.gate_result else None,
                "error": result.error,
            }
        except Exception as exc:
            return {"error": str(exc), "overall_pass": False}

    def _tool_search_similar_history(
        self, slug: str, symbol: str, timeframe: str, top_k: int = 5
    ) -> dict:
        try:
            from research.candidate_search import search_similar_patterns
            from research.query_transformer import SearchQuerySpec, PhaseQuery

            spec = SearchQuerySpec(
                pattern_slug=slug,
                phase_path=[],
                phase_queries=[],
                preferred_timeframes=[timeframe],
                symbol_scope=[symbol],
            )
            result = search_similar_patterns(spec, top_k=min(top_k, 20))
            similar = [
                {
                    "symbol": c.symbol,
                    "timeframe": c.timeframe,
                    "score": round(c.final_score, 4),
                    "bar_iso": c.bar_iso,
                }
                for c in result.ranked_candidates
            ]
            return {"similar": similar, "count": len(similar)}
        except Exception as exc:
            return {"error": str(exc), "similar": [], "count": 0}

    def _tool_judge_finding(
        self,
        slug: str,
        symbol: str,
        timeframe: str,
        win_rate: float,
        sharpe: float,
        n_samples: int,
        similar_count: int,
        gate_passed: bool,
    ) -> dict:
        # Python-level hard gates — LLM never sees below-threshold findings
        if not gate_passed:
            return {"verdict": "discard", "reason": "gate_not_passed"}
        if sharpe < 0.8:
            return {"verdict": "discard", "reason": f"sharpe={sharpe:.2f} < 0.8"}
        if n_samples < 15:
            return {"verdict": "discard", "reason": f"n={n_samples} < 15"}
        if win_rate < 0.55:
            return {"verdict": "discard", "reason": f"win_rate={win_rate:.2f} < 0.55"}
        if similar_count == 0:
            return {"verdict": "discard", "reason": "no_similar_history"}

        # All gates pass — defer to LLM judge (called from discovery_agent.py)
        return {
            "verdict": "keep",
            "reason": "gates_passed",
            "sharpe": sharpe,
            "win_rate": win_rate,
            "n_samples": n_samples,
            "similar_count": similar_count,
        }

    def _tool_propose_to_user(
        self,
        slug: str,
        symbol: str,
        timeframe: str,
        pattern_label: str,
        win_rate: float,
        sharpe: float,
        n_samples: int,
        ci_low: float,
        ci_high: float,
        regime: str,
        similar_count: int,
        summary: str,
    ) -> dict:
        if self.proposal_count >= 5:
            return {"error": "proposal_limit_reached", "count": self.proposal_count}

        from research.finding_store import save_finding
        path = save_finding(
            symbol=symbol,
            timeframe=timeframe,
            pattern_label=pattern_label,
            win_rate=win_rate,
            sharpe=sharpe,
            n_samples=n_samples,
            ci=(ci_low, ci_high),
            regime=regime,
            similar_count=similar_count,
            llm_summary=summary,
            agent_model=self.agent_model,
            cycle_cost_usd=0.0,  # updated at cycle end
            cycle_id=self.cycle_id,
            inbox_root=self.inbox_root,
        )

        self.proposal_count += 1
        self.proposed_paths.append(str(path))
        log.info("proposed finding #%d: %s → %s", self.proposal_count, slug, path)
        return {
            "path": str(path),
            "proposal_number": self.proposal_count,
            "remaining": 5 - self.proposal_count,
        }

    def _tool_stop_research(self, reason: str = "manual") -> dict:
        self.stop_requested = True
        self.stop_reason = reason
        log.info("stop_research called: reason=%s", reason)
        return {"stopped": True, "reason": reason}
