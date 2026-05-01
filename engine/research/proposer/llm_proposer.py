"""LLM 8-track parallel proposer."""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from engine.llm.cost_tracker import CostTracker
from engine.llm.provider import call_text
from engine.research.proposer.schemas import ChangeProposal, ProposalBatch


PROPOSER_TRACKS: list[str] = [
    "deepseek/deepseek-chat",
    "groq/llama-3.3-70b-versatile",
    "cerebras/qwen-3-235b-a22b-instruct-2507",
    "nvidia_nim/meta/llama-3.3-70b-instruct",
    "ollama/qwen2.5:32b",
    "huggingface/Qwen/Qwen2.5-72B-Instruct",
    "ollama/gemma2:27b",
    "anthropic/claude-haiku-4-5-20251001",
]

_PROGRAM_PATH = Path("engine/research/program.md")


@dataclass(frozen=True)
class LLMProposerConfig:
    """Configuration for LLMProposer."""

    tracks: list[str] = field(default_factory=lambda: PROPOSER_TRACKS)
    k_per_track: int = 5
    timeout_per_track: float = 60.0
    max_total_cost_usd: float = 0.30


class LLMProposer:
    """8-track LLM proposer running all tracks in parallel."""

    def __init__(self, config: LLMProposerConfig | None = None) -> None:
        self.config = config or LLMProposerConfig()
        self.tracker = CostTracker()

    async def propose_all_tracks(
        self,
        rules_before: dict,
        hint_context: str,
    ) -> list[ChangeProposal]:
        """Run all tracks in parallel, return merged candidates."""
        program = _PROGRAM_PATH.read_text()
        system_prompt = self._build_system_prompt(program, rules_before)
        user_prompt = self._build_user_prompt(hint_context)

        tasks = [
            self._propose_one_track(track, system_prompt, user_prompt)
            for track in self.config.tracks
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_proposals: list[ChangeProposal] = []
        for track, result in zip(self.config.tracks, results):
            if isinstance(result, Exception):
                continue
            for prop in result:
                prop.proposer_track = track
                all_proposals.append(prop)

        return all_proposals

    async def _propose_one_track(
        self,
        track: str,
        system_prompt: str,
        user_prompt: str,
    ) -> list[ChangeProposal]:
        """Call single track and extract proposals."""
        try:
            text = await asyncio.wait_for(
                call_text(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    tracker=self.tracker,
                    task="propose",
                    model=track,
                    timeout=self.config.timeout_per_track,
                ),
                timeout=self.config.timeout_per_track,
            )
            batch = ProposalBatch.model_validate_json(self._extract_json(text))
            return batch.proposals
        except Exception:
            return []

    def _extract_json(self, text: str) -> str:
        """Strip code fences, find JSON block."""
        text = text.strip()
        if text.startswith("```"):
            parts = text.split("```")
            if len(parts) > 1:
                text = parts[1]
                if text.startswith("json"):
                    text = text[4:]
        return text.strip()

    def _build_system_prompt(self, program: str, rules_before: dict) -> str:
        """Build system prompt with program and current rules."""
        return f"""{program}

## Current rules (active.yaml)
```yaml
{yaml.safe_dump(rules_before, sort_keys=False)}
```
"""

    def _build_user_prompt(self, hint_context: str) -> str:
        """Build user prompt with hint context."""
        return f"""Propose {self.config.k_per_track} variations of the rules
that you think will increase DSR. Output strict JSON per program.md.

## Hint context (last 30 days)
{hint_context}
"""
