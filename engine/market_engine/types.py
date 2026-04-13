"""Shared result types for the market judgment engine."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class LayerResult:
    """Output from a single indicator layer.

    score   : float in [-100, 100] (raw, before pipeline aggregation)
    sigs    : human-readable signal strings with polarity ('bull'|'bear'|'neut'|'warn')
    meta    : arbitrary structured data for downstream layers to consume
    """
    score: float = 0.0
    sigs: list[dict[str, str]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def sig(self, text: str, kind: str = "neut") -> None:
        self.sigs.append({"t": text, "type": kind})


@dataclass
class GlobalCtx:
    """Singleton context object populated by L0.
    Passed read-only to all L2+ layers.
    """
    fear_greed: int | None = None          # 0-100
    usd_krw: float | None = None           # KRW per USD
    upbit_map: dict[str, float] = field(default_factory=dict)   # base → KRW price
    bithumb_map: dict[str, float] = field(default_factory=dict)
    btc_onchain: dict[str, Any] = field(default_factory=dict)
    mempool: dict[str, Any] = field(default_factory=dict)
    mempool_fees: dict[str, Any] = field(default_factory=dict)
    sector_scores: dict[str, float] = field(default_factory=dict)  # sector → avg alpha
