"""W-0393: Idea text → VisibleAtom list via Haiku LLM.

Priority 2 parser — medium precision, ~$0.001/call.
"""
from __future__ import annotations

import json
import logging
import os

from .models import VisibleAtom

log = logging.getLogger("engine.integrations.tv.text_parser")

_VALID_FAMILIES = frozenset({
    "breakout", "breakdown_reversal", "squeeze_breakout",
    "liquidity_sweep", "trend_pullback", "unknown",
})

_VALID_ATOM_KINDS = frozenset({
    "rsi_oversold", "rsi_overbought", "volume_spike", "bb_squeeze",
    "breakout", "breakdown_reversal", "liquidity_sweep", "ichimoku_condition",
    "price_below_cloud", "price_above_cloud", "funding_extreme", "oi_spike",
    "macd_crossover", "macd_hist_condition", "trend_pullback", "wyckoff_spring",
    "reclaim_after_dump", "compression", "stoch_rsi_condition",
    "ema20_condition", "ema50_condition", "rsi_condition",
})

_SCHEMA = json.dumps({
    "direction": "long|short|neutral",
    "pattern_family": "breakout|breakdown_reversal|squeeze_breakout|liquidity_sweep|trend_pullback|unknown",
    "visible_atoms": [
        {"kind": "rsi_oversold | rsi_overbought | volume_spike | bb_squeeze | breakout | breakdown_reversal | liquidity_sweep | funding_extreme | oi_spike | macd_crossover | trend_pullback | wyckoff_spring | reclaim_after_dump | compression", "confidence": 0.0}
    ],
    "visible_indicators": ["list of indicator names mentioned"],
    "confidence": 0.0,
}, indent=2)

_SYSTEM = (
    "You are a trading hypothesis extractor. Extract ONLY indicator conditions "
    "(not price levels) from trading idea text. Return strict JSON matching the schema. "
    "NEVER include absolute price levels as atoms — only relative indicator conditions."
)

_PROMPT = """Extract the trading hypothesis from this TradingView idea.

Title: {title}
Description: {description}

Return JSON with this schema:
{schema}

Rules:
- atoms: indicator-based conditions only (rsi levels, volume ratio, squeeze, etc.)
- DO NOT include price levels like "price at 77200" as atoms
- confidence < 0.3 if text is too vague or short
- direction: long=bullish setup, short=bearish, neutral=unclear"""


def parse_text(
    title: str | None,
    description: str | None,
) -> tuple[list[VisibleAtom], str | None, str, float]:
    """Parse idea title + description via LLM.

    Returns (atoms, direction, pattern_family, confidence).
    Falls back to empty result on any error.
    """
    if not title and not description:
        return [], None, "unknown", 0.0

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_SYSTEM,
            messages=[{
                "role": "user",
                "content": _PROMPT.format(
                    title=title or "",
                    description=(description or "")[:2000],
                    schema=_SCHEMA,
                ),
            }],
        )
        raw = msg.content[0].text.strip()
    except Exception as e:
        log.warning("text_parser LLM call failed: %s", e)
        return [], None, "unknown", 0.0

    # Strip markdown fences
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log.warning("text_parser JSON parse failed: %s — raw: %s", e, raw[:200])
        return [], None, "unknown", 0.0

    atoms: list[VisibleAtom] = []
    for atom in data.get("visible_atoms", []):
        if not isinstance(atom, dict):
            continue
        kind = str(atom.get("kind", ""))
        if kind not in _VALID_ATOM_KINDS:
            continue
        try:
            atoms.append(VisibleAtom(
                kind=kind,
                confidence=float(atom.get("confidence", 0.5)),
                source="text",
            ))
        except (ValueError, TypeError):
            pass

    direction = data.get("direction")
    if direction not in ("long", "short"):
        direction = None

    family = data.get("pattern_family", "unknown")
    if family not in _VALID_FAMILIES:
        family = "unknown"

    confidence = float(data.get("confidence", 0.5))
    return atoms, direction, family, confidence
