"""W-0393: Pine Script → VisibleAtom list.

Priority 1 parser — deterministic regex, $0 cost.
Reuses the same indicator-detection logic as app/src/lib/server/pine/classifier.ts.
"""
from __future__ import annotations

import re
from .models import VisibleAtom

# (pattern, atom_kind, confidence) — ordered most-specific first
_ATOM_PATTERNS: list[tuple[re.Pattern, str, float]] = [
    (re.compile(r'\brsi\b[^)]*<\s*3[0-5]\b', re.I),            "rsi_oversold", 0.92),
    (re.compile(r'\brsi\b[^)]*>\s*6[5-9]\b|\brsi\b[^)]*>\s*70\b', re.I), "rsi_overbought", 0.92),
    (re.compile(r'\bta\.rsi\b|\brsi\s*\(', re.I),               "rsi_condition", 0.80),
    (re.compile(r'\bmacd\b.*cross|crossover.*\bmacd\b', re.I),  "macd_crossover", 0.85),
    (re.compile(r'\bmacd_hist\b|\bhistogram\b.*[<>]', re.I),    "macd_hist_condition", 0.80),
    (re.compile(r'\bvolume\b\s*[>]=?\s*[\w.]+\s*\*\s*[1-9]', re.I), "volume_spike", 0.82),
    (re.compile(r'\bta\.bb\b|\bbbands\b|\bbollinger\b', re.I),  "bb_condition", 0.75),
    (re.compile(r'\bbb_width\b|\bbandwidth\b', re.I),           "bb_squeeze", 0.85),
    (re.compile(r'\bichimoku\b|\bkumo\b|\btenkan\b|\bkijun\b',  re.I), "ichimoku_condition", 0.88),
    (re.compile(r'close\s*<\s*(?:cloud|span|senkou)', re.I),    "price_below_cloud", 0.90),
    (re.compile(r'close\s*>\s*(?:cloud|span|senkou)', re.I),    "price_above_cloud", 0.90),
    (re.compile(r'\bliquidity.*sweep\b|\bsweep.*low\b|\bsweep.*high\b', re.I), "liquidity_sweep", 0.80),
    (re.compile(r'\bwyckoff\b|\bspring\b|\breaccumulation\b', re.I), "wyckoff_spring", 0.72),
    (re.compile(r'\bbreakout\b|\bbreak.*above\b|\bbreak.*high\b', re.I), "breakout", 0.75),
    (re.compile(r'\bbreakdown\b|\bbreak.*below\b|\bbreak.*low\b', re.I), "breakdown_reversal", 0.75),
    (re.compile(r'\bfunding.*rate\b|\bfundingRate\b', re.I),    "funding_extreme", 0.80),
    (re.compile(r'\bopen_interest\b|\bopenInterest\b|\b\boi\b\b', re.I), "oi_spike", 0.75),
    (re.compile(r'\bsqueeze\b|\bsqz\b|\bcompression\b', re.I), "compression", 0.78),
    (re.compile(r'\bstoch.*rsi\b|\bstochrsi\b', re.I),         "stoch_rsi_condition", 0.85),
    (re.compile(r'\breclaim\b|\brecovery\b|\bbounce\b', re.I), "reclaim_after_dump", 0.65),
    (re.compile(r'\bema\s*\(\s*20\b|\bema20\b', re.I),         "ema20_condition", 0.80),
    (re.compile(r'\bema\s*\(\s*50\b|\bema50\b', re.I),         "ema50_condition", 0.80),
]

_DIRECTION_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\blong\b|\bbuy\b|\bbullish\b', re.I), "long"),
    (re.compile(r'\bshort\b|\bsell\b|\bbearish\b', re.I), "short"),
]

_FAMILY_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\bliquidity.*sweep\b', re.I),             "liquidity_sweep"),
    (re.compile(r'\bsqueeze.*breakout\b|\bcompression.*break\b', re.I), "squeeze_breakout"),
    (re.compile(r'\bbreakdown.*reversal\b|\bspring\b|\bbounce.*from.*low\b', re.I), "breakdown_reversal"),
    (re.compile(r'\bbreakout\b|\bbreak.*above\b', re.I),   "breakout"),
    (re.compile(r'\btrend.*pullback\b|\bpullback.*trend\b', re.I), "trend_pullback"),
]

_PINE_MARKERS = ("//@version=", "indicator(", "strategy(", "study(", "ta.rsi", "ta.macd")


def is_pine_script(text: str) -> bool:
    """Return True if text looks like Pine Script code."""
    return any(marker in text for marker in _PINE_MARKERS)


def parse_pine(pine_code: str) -> tuple[list[VisibleAtom], str | None, str]:
    """Extract visible atoms, direction, and pattern_family from Pine Script.

    Returns (atoms, direction, pattern_family).
    """
    atoms: list[VisibleAtom] = []
    seen: set[str] = set()

    for pattern, kind, confidence in _ATOM_PATTERNS:
        if kind not in seen and pattern.search(pine_code):
            atoms.append(VisibleAtom(kind=kind, confidence=confidence, source="pine"))
            seen.add(kind)

    direction: str | None = None
    for pattern, dir_val in _DIRECTION_PATTERNS:
        if pattern.search(pine_code):
            direction = dir_val
            break

    family = "unknown"
    for pattern, fam in _FAMILY_PATTERNS:
        if pattern.search(pine_code):
            family = fam
            break

    return atoms, direction, family
