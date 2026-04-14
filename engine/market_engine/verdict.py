"""Verdict mapping utilities for market engine scores."""
from __future__ import annotations


def score_to_verdict(score: float) -> str:
    if score >= 60:
        return "STRONG BULL"
    if score >= 30:
        return "BULLISH"
    if score >= 10:
        return "WEAK BULL"
    if score > -10:
        return "NEUTRAL"
    if score > -30:
        return "WEAK BEAR"
    if score > -60:
        return "BEARISH"
    return "STRONG BEAR"
