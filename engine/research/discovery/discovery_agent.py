"""W-0316: Autonomous Pattern Discovery Agent.

One cycle:
  Cron 03:00 KST  OR  POST /research/discover
  → DiscoveryAgent.run()
  → tool loop (max 10 turns, max 5 proposals)
  → inbox/findings/{date}/*.md

Cost hard cap: $0.50/cycle (CostCapExceeded → stop_research).
Requires: ANTHROPIC_API_KEY (or relevant provider key)
Toggle:   DISCOVERY_AGENT_ENABLED=false → no-op
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

MAX_TURNS = 10
MAX_PROPOSALS = 5

_SYSTEM_PROMPT = """\
You are a quant pattern discovery agent for Cogochi, a crypto research OS.

Your job: autonomously scan the market, validate statistically significant patterns,
and propose at most 5 high-quality findings to the user's inbox.

Workflow:
1. Call scan_universe to get top candidates.
2. For each promising candidate (Sharpe ≥ 0.8, n ≥ 15, win_rate ≥ 0.55):
   a. Call validate_pattern to run G1~G8 gate validation.
   b. Call search_similar_history to check precedents.
   c. Call judge_finding to evaluate quality.
   d. If verdict=keep: call propose_to_user with a concise trader summary.
3. Call stop_research when done (≥5 proposals, no more candidates, or cost warning).

Hard rules:
- NEVER propose without validate_pattern overall_pass=true.
- NEVER propose if judge_finding verdict=discard.
- Maximum 5 proposals per cycle.
- If you receive a cost_cap warning, call stop_research immediately.
- Be decisive — do not overthink. A good finding is better than a perfect one.
"""


@dataclass
class CycleResult:
    cycle_id: str
    started_at: datetime
    finished_at: datetime | None = None
    proposals: list[str] = field(default_factory=list)  # file paths
    turns_used: int = 0
    total_cost_usd: float = 0.0
    stop_reason: str | None = None
    error: str | None = None

    @property
    def success(self) -> bool:
        return self.error is None

    def to_dict(self) -> dict:
        return {
            "cycle_id": self.cycle_id,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "proposals": self.proposals,
            "turns_used": self.turns_used,
            "total_cost_usd": round(self.total_cost_usd, 5),
            "stop_reason": self.stop_reason,
            "error": self.error,
        }


class DiscoveryAgent:
    """Autonomous discovery agent. One instance per cycle."""

    def __init__(self, *, inbox_root=None):
        self.inbox_root = inbox_root

    async def run(self) -> CycleResult:
        """Run one discovery cycle. Never raises."""
        if os.environ.get("DISCOVERY_AGENT_ENABLED", "true").lower() == "false":
            log.info("DISCOVERY_AGENT_ENABLED=false — skipping cycle")
            return CycleResult(
                cycle_id="disabled",
                started_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc),
                stop_reason="disabled",
            )

        cycle_id = uuid.uuid4().hex[:12]
        started = datetime.now(timezone.utc)

        from observability.research_metrics import CycleTimer, record_cycle, set_cycle_id
        set_cycle_id(cycle_id)
        timer = CycleTimer()
        log.info("research_cycle_start cycle_id=%s", cycle_id)

        try:
            result = await self._run_cycle(cycle_id, started)
        except Exception as exc:
            log.error("Discovery cycle %s crashed: %s", cycle_id, exc, exc_info=True)
            result = CycleResult(
                cycle_id=cycle_id,
                started_at=started,
                finished_at=datetime.now(timezone.utc),
                error=str(exc),
            )

        record_cycle(
            cycle_id=cycle_id,
            stop_reason=result.stop_reason or "error",
            proposals=len(result.proposals),
            turns_used=result.turns_used,
            cost_usd=result.total_cost_usd,
            duration_ms=timer.elapsed_ms(),
            error=result.error,
        )
        return result

    async def _run_cycle(self, cycle_id: str, started: datetime) -> CycleResult:
        from llm.cost_tracker import CostCapExceeded, CostTracker
        from llm.provider import call_with_tools
        from llm.router import resolve_model
        from research.discovery_tools import TOOLS, TOOL_CHOICE_AUTO, ToolHandlers

        model = resolve_model("judge")
        tracker = CostTracker(cycle_id=cycle_id)
        handlers = ToolHandlers(
            cycle_id=cycle_id,
            agent_model=model,
            inbox_root=self.inbox_root,
        )

        messages: list[dict[str, Any]] = [
            {"role": "user", "content": "Start a new pattern discovery cycle. "
             "Scan the universe and find the best patterns available right now."},
        ]

        turns = 0
        stop_reason = "max_turns"

        try:
            for turn in range(MAX_TURNS):
                turns = turn + 1
                log.debug("Turn %d/%d | cost=$%.4f", turns, MAX_TURNS, tracker.total_usd)

                resp = await call_with_tools(
                    messages=messages,
                    tools=TOOLS,
                    tool_choice=TOOL_CHOICE_AUTO,
                    tracker=tracker,
                    task="judge",
                    model=model,
                )

                msg = resp.choices[0].message
                messages.append({"role": "assistant", "content": msg.content or "",
                                 "tool_calls": _serialize_tool_calls(msg)})

                # No tool calls → agent is done
                if not msg.tool_calls:
                    stop_reason = "no_tool_calls"
                    break

                # Execute all tool calls in this turn
                for tc in msg.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_input = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        tool_input = {}

                    try:
                        result_dict = handlers.dispatch(tool_name, tool_input)
                    except Exception as tool_exc:
                        from observability.research_metrics import record_tool_error
                        record_tool_error(
                            tool_name=tool_name,
                            error=str(tool_exc),
                            cycle_id=cycle_id,
                        )
                        result_dict = {
                            "error": f"tool_exception: {tool_exc}",
                            "tool": tool_name,
                        }

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result_dict),
                    })

                    if handlers.stop_requested:
                        stop_reason = handlers.stop_reason or "stop_tool"
                        break

                    if handlers.proposal_count >= MAX_PROPOSALS:
                        stop_reason = "proposals_limit"
                        handlers.stop_requested = True
                        break

                if handlers.stop_requested:
                    break

        except CostCapExceeded as cap_exc:
            log.warning("Cost cap hit: %s", cap_exc)
            stop_reason = "cost_cap"

        tracker.flush_to_supabase()

        return CycleResult(
            cycle_id=cycle_id,
            started_at=started,
            finished_at=datetime.now(timezone.utc),
            proposals=handlers.proposed_paths,
            turns_used=turns,
            total_cost_usd=tracker.total_usd,
            stop_reason=stop_reason,
        )


def _serialize_tool_calls(msg: Any) -> list[dict] | None:
    if not msg.tool_calls:
        return None
    out = []
    for tc in msg.tool_calls:
        out.append({
            "id": tc.id,
            "type": "function",
            "function": {"name": tc.function.name, "arguments": tc.function.arguments},
        })
    return out


async def run_discovery_cycle(inbox_root=None) -> CycleResult:
    """Convenience entry point for cron / API."""
    agent = DiscoveryAgent(inbox_root=inbox_root)
    return await agent.run()
