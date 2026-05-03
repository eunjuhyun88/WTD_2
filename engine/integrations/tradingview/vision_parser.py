"""W-0393: Chart image → VisionPatternSpec via Claude Vision.

Priority 3 parser (fallback) — ~$0.01/image.
"""
from __future__ import annotations

import base64
import json
import logging
import os

from .models import VisibleAtom, VisionPatternSpec

log = logging.getLogger("engine.integrations.tv.vision_parser")

_VALID_FAMILIES = frozenset({
    "breakout", "breakdown_reversal", "squeeze_breakout",
    "liquidity_sweep", "trend_pullback", "unknown",
})

_VALID_KINDS = frozenset({
    "rsi_oversold", "rsi_overbought", "volume_spike", "bb_squeeze",
    "breakout", "breakdown_reversal", "liquidity_sweep", "ichimoku_condition",
    "price_below_cloud", "price_above_cloud", "funding_extreme", "oi_spike",
    "macd_crossover", "macd_hist_condition", "trend_pullback", "wyckoff_spring",
    "reclaim_after_dump", "compression", "stoch_rsi_condition",
    "ema20_condition", "ema50_condition",
})

_SCHEMA = json.dumps({
    "direction": "long|short|neutral",
    "pattern_family": "breakout|breakdown_reversal|squeeze_breakout|liquidity_sweep|trend_pullback|unknown",
    "visible_indicators": ["list of indicator names visible in chart"],
    "visible_annotations": ["list of text annotations visible"],
    "support_resistance_notes": ["description only — NOT used as backtest conditions"],
    "visible_atoms": [
        {"kind": "atom_kind_from_allowed_list", "confidence": 0.0}
    ],
    "confidence": 0.0,
}, indent=2)

_PROMPT = """Analyze this TradingView chart and extract the trading hypothesis.

CRITICAL RULES:
1. Extract ONLY indicator conditions (RSI levels, volume ratio, BB squeeze, etc.)
2. DO NOT include price levels (e.g. "price at 77200") as atoms — they are useless for backtesting
3. Allowed atom kinds ONLY: rsi_oversold, rsi_overbought, volume_spike, bb_squeeze, breakout, breakdown_reversal, liquidity_sweep, ichimoku_condition, price_below_cloud, price_above_cloud, funding_extreme, oi_spike, macd_crossover, trend_pullback, wyckoff_spring, reclaim_after_dump, compression

Return this exact JSON:
{schema}"""

_EMPTY = VisionPatternSpec(
    direction=None, pattern_family="unknown",
    visible_indicators=[], visible_annotations=[],
    support_resistance_notes=[], visible_atoms=[],
    confidence=0.0, evidence=[], parser_tier="vision",
)


def parse_vision(image_bytes: bytes) -> VisionPatternSpec:
    """Parse chart image via Claude Vision.

    Returns VisionPatternSpec. Never raises — returns empty spec on failure.
    """
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        b64 = base64.standard_b64encode(image_bytes).decode()
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/webp", "data": b64},
                    },
                    {
                        "type": "text",
                        "text": _PROMPT.format(schema=_SCHEMA),
                    },
                ],
            }],
        )
        raw = msg.content[0].text.strip()
    except Exception as e:
        log.warning("vision_parser failed: %s", e)
        return _EMPTY

    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log.warning("vision_parser JSON parse error: %s", e)
        return _EMPTY

    atoms: list[VisibleAtom] = []
    for atom in data.get("visible_atoms", []):
        if not isinstance(atom, dict):
            continue
        kind = str(atom.get("kind", ""))
        if kind not in _VALID_KINDS:
            continue
        try:
            atoms.append(VisibleAtom(
                kind=kind,
                confidence=float(atom.get("confidence", 0.5)),
                source="vision",
            ))
        except (ValueError, TypeError):
            pass

    direction = data.get("direction")
    if direction not in ("long", "short"):
        direction = None

    family = data.get("pattern_family", "unknown")
    if family not in _VALID_FAMILIES:
        family = "unknown"

    return VisionPatternSpec(
        direction=direction,
        pattern_family=family,
        visible_indicators=list(data.get("visible_indicators", [])),
        visible_annotations=list(data.get("visible_annotations", [])),
        support_resistance_notes=list(data.get("support_resistance_notes", [])),
        visible_atoms=atoms,
        confidence=float(data.get("confidence", 0.5)),
        evidence=[],
        parser_tier="vision",
    )
