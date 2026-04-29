"""F-16: Search recall eval set — 50 (query, expected_signature) pairs.

Each EvalItem defines:
  - pattern_draft:       the search query (search_hints)
  - expected_signature:  the feature signature a relevant corpus window should have
  - noise_signatures:    19 dissimilar windows that should NOT rank above expected

Design: synthetic corpus approach — inject expected window + noise into a temp
corpus, run search, check expected window appears in top-10 (recall@10).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class EvalItem:
    query_id: str
    pattern_slug: str
    pattern_draft: dict
    expected_signature: dict  # the "relevant" window signature
    # Noise windows differ in close_return_pct sign and magnitude
    noise_profile: str = "generic"  # "long", "short", "neutral"
    # Real corpus distractors — when set, used instead of synthetic _NOISE_POOL
    real_noise: tuple[dict, ...] = field(default_factory=tuple)


def _long_draft(slug: str, ret: float, vol: float, vol_ratio: float = 1.5) -> dict:
    return {
        "pattern_slug": slug,
        "search_hints": {
            "target_return_pct": ret,
            "volatility_range": {"min": vol * 0.8, "max": vol * 1.3},
            "volume_breakout_threshold": vol_ratio,
        },
    }


def _short_draft(slug: str, ret: float, vol: float, vol_ratio: float = 1.5) -> dict:
    return {
        "pattern_slug": slug,
        "search_hints": {
            "target_return_pct": ret,
            "volatility_range": {"min": vol * 0.8, "max": vol * 1.3},
            "volume_breakout_threshold": vol_ratio,
        },
    }


def _sig(ret: float, vol: float, vol_ratio: float = 1.5, trend: str = "up") -> dict:
    return {
        "close_return_pct": ret,
        "realized_volatility_pct": vol,
        "volume_ratio": vol_ratio,
        "trend": trend,
    }


EVAL_SET: list[EvalItem] = [
    # ── OI reversal / presurge patterns ───────────────────────────────────────
    EvalItem("q-001", "tradoor-oi-reversal-v1",
             _long_draft("tradoor-oi-reversal-v1", 15.0, 4.0, 2.5),
             _sig(14.8, 3.9, 2.4), "long"),
    EvalItem("q-002", "oi-presurge-long-v1",
             _long_draft("oi-presurge-long-v1", 12.0, 3.5, 2.0),
             _sig(11.7, 3.4, 2.1), "long"),
    # ── Funding flip patterns ─────────────────────────────────────────────────
    EvalItem("q-003", "funding-flip-reversal-v1",
             _long_draft("funding-flip-reversal-v1", 10.0, 2.8, 1.8),
             _sig(9.8, 2.7, 1.9), "long"),
    EvalItem("q-004", "funding-flip-short-v1",
             _short_draft("funding-flip-short-v1", -8.0, 2.5, 1.6),
             _sig(-7.9, 2.6, 1.7, "down"), "short"),
    EvalItem("q-005", "funding-flip-reversal-short-v1",
             _short_draft("funding-flip-reversal-short-v1", -10.0, 3.0, 1.9),
             _sig(-9.7, 3.1, 2.0, "down"), "short"),
    # ── Whale accumulation / liquidity patterns ───────────────────────────────
    EvalItem("q-006", "whale-accumulation-reversal-v1",
             _long_draft("whale-accumulation-reversal-v1", 11.0, 2.5, 3.0),
             _sig(10.8, 2.4, 2.9), "long"),
    EvalItem("q-007", "liquidity-sweep-reversal-v1",
             _long_draft("liquidity-sweep-reversal-v1", 8.0, 3.5, 2.2),
             _sig(8.2, 3.3, 2.3), "long"),
    # ── Wyckoff pattern ───────────────────────────────────────────────────────
    EvalItem("q-008", "wyckoff-spring-reversal-v1",
             _long_draft("wyckoff-spring-reversal-v1", 9.0, 2.0, 1.5),
             _sig(9.1, 2.1, 1.6), "long"),
    # ── Volume / absorption patterns ─────────────────────────────────────────
    EvalItem("q-009", "volume-absorption-reversal-v1",
             _long_draft("volume-absorption-reversal-v1", 7.0, 1.8, 4.0),
             _sig(6.9, 1.9, 3.9), "long"),
    EvalItem("q-010", "compression-breakout-reversal-v1",
             _long_draft("compression-breakout-reversal-v1", 13.0, 1.5, 2.8),
             _sig(12.8, 1.6, 2.7), "long"),
    # ── Gap / short patterns ─────────────────────────────────────────────────
    EvalItem("q-011", "gap-fade-short-v1",
             _short_draft("gap-fade-short-v1", -6.0, 3.0, 1.4),
             _sig(-5.8, 3.1, 1.5, "down"), "short"),
    # ── Volatility / squeeze patterns ────────────────────────────────────────
    EvalItem("q-012", "volatility-squeeze-breakout-v1",
             _long_draft("volatility-squeeze-breakout-v1", 11.0, 1.2, 3.5),
             _sig(10.7, 1.3, 3.4), "long"),
    # ── Alpha confluence / presurge ───────────────────────────────────────────
    EvalItem("q-013", "alpha-confluence-v1",
             _long_draft("alpha-confluence-v1", 9.0, 2.2, 2.0),
             _sig(8.9, 2.3, 2.1), "long"),
    EvalItem("q-014", "alpha-presurge-v1",
             _long_draft("alpha-presurge-v1", 14.0, 3.0, 2.5),
             _sig(13.8, 3.1, 2.6), "long"),
    # ── Radar patterns ───────────────────────────────────────────────────────
    EvalItem("q-015", "radar-golden-entry-v1",
             _long_draft("radar-golden-entry-v1", 10.0, 2.0, 2.0),
             _sig(9.8, 2.1, 2.1), "long"),
    EvalItem("q-016", "radar-cvd-breakout-v1",
             _long_draft("radar-cvd-breakout-v1", 8.0, 2.5, 2.8),
             _sig(7.8, 2.6, 2.7), "long"),
    EvalItem("q-017", "radar-whale-block-trade-v1",
             _long_draft("radar-whale-block-trade-v1", 6.0, 1.5, 4.5),
             _sig(5.9, 1.6, 4.4), "long"),
    EvalItem("q-018", "radar-micro-squeeze-breakout-v1",
             _long_draft("radar-micro-squeeze-breakout-v1", 12.0, 1.8, 3.0),
             _sig(11.7, 1.9, 2.9), "long"),
    EvalItem("q-019", "radar-orderbook-imbalance-v1",
             _long_draft("radar-orderbook-imbalance-v1", 5.0, 1.5, 2.0),
             _sig(4.9, 1.6, 2.1), "long"),
    EvalItem("q-020", "radar-hot-target-cluster-v1",
             _long_draft("radar-hot-target-cluster-v1", 9.0, 2.8, 2.2),
             _sig(8.8, 2.9, 2.3), "long"),
    # ── Institutional distribution ────────────────────────────────────────────
    EvalItem("q-021", "institutional-distribution-v1",
             _short_draft("institutional-distribution-v1", -9.0, 2.5, 2.0),
             _sig(-8.8, 2.6, 2.1, "down"), "short"),
    # ── Alpha terminal patterns ────────────────────────────────────────────────
    EvalItem("q-022", "alpha-terminal-short-squeeze-v1",
             _long_draft("alpha-terminal-short-squeeze-v1", 18.0, 5.0, 3.0),
             _sig(17.8, 4.9, 3.1), "long"),
    EvalItem("q-023", "alpha-terminal-bottom-absorption-v1",
             _long_draft("alpha-terminal-bottom-absorption-v1", 11.0, 2.5, 2.5),
             _sig(10.8, 2.6, 2.6), "long"),
    EvalItem("q-024", "alpha-terminal-breakout-momentum-v1",
             _long_draft("alpha-terminal-breakout-momentum-v1", 14.0, 2.8, 3.2),
             _sig(13.7, 2.9, 3.1), "long"),
    EvalItem("q-025", "alpha-terminal-vwap-break-v1",
             _long_draft("alpha-terminal-vwap-break-v1", 7.0, 1.8, 1.8),
             _sig(6.9, 1.9, 1.9), "long"),
    EvalItem("q-026", "alpha-terminal-strong-bull-confluence-v1",
             _long_draft("alpha-terminal-strong-bull-confluence-v1", 12.0, 2.5, 2.5),
             _sig(11.8, 2.6, 2.6), "long"),
    EvalItem("q-027", "alpha-terminal-strong-bear-confluence-v1",
             _short_draft("alpha-terminal-strong-bear-confluence-v1", -12.0, 2.5, 2.5),
             _sig(-11.8, 2.6, 2.6, "down"), "short"),
    # ── Alpha flow patterns ────────────────────────────────────────────────────
    EvalItem("q-028", "alpha-flow-bull-bias-v1",
             _long_draft("alpha-flow-bull-bias-v1", 8.0, 2.0, 2.0),
             _sig(7.9, 2.1, 2.1), "long"),
    EvalItem("q-029", "alpha-flow-bear-bias-v1",
             _short_draft("alpha-flow-bear-bias-v1", -8.0, 2.0, 2.0),
             _sig(-7.9, 2.1, 2.1, "down"), "short"),
    EvalItem("q-030", "alpha-flow-extreme-flow-v1",
             _long_draft("alpha-flow-extreme-flow-v1", 16.0, 4.0, 3.5),
             _sig(15.8, 3.9, 3.4), "long"),
    EvalItem("q-031", "alpha-flow-liquidity-zone-v1",
             _long_draft("alpha-flow-liquidity-zone-v1", 7.0, 1.5, 2.5),
             _sig(6.8, 1.6, 2.4), "long"),
    EvalItem("q-032", "alpha-flow-mtf-accumulation-v1",
             _long_draft("alpha-flow-mtf-accumulation-v1", 10.0, 2.2, 2.8),
             _sig(9.8, 2.3, 2.7), "long"),
    EvalItem("q-033", "alpha-flow-wyckoff-accumulation-v1",
             _long_draft("alpha-flow-wyckoff-accumulation-v1", 9.0, 2.0, 2.0),
             _sig(8.8, 2.1, 2.1), "long"),
    # ── Alpha hunter patterns ─────────────────────────────────────────────────
    EvalItem("q-034", "alpha-hunter-accumulation-v1",
             _long_draft("alpha-hunter-accumulation-v1", 10.0, 2.5, 3.0),
             _sig(9.8, 2.6, 2.9), "long"),
    EvalItem("q-035", "alpha-hunter-activity-surge-v1",
             _long_draft("alpha-hunter-activity-surge-v1", 12.0, 3.5, 4.0),
             _sig(11.8, 3.4, 3.9), "long"),
    EvalItem("q-036", "alpha-hunter-bb-squeeze-v1",
             _long_draft("alpha-hunter-bb-squeeze-v1", 9.0, 1.0, 2.5),
             _sig(8.8, 1.1, 2.4), "long"),
    EvalItem("q-037", "alpha-hunter-dex-buy-pressure-v1",
             _long_draft("alpha-hunter-dex-buy-pressure-v1", 11.0, 3.0, 3.5),
             _sig(10.8, 3.1, 3.4), "long"),
    EvalItem("q-038", "alpha-hunter-holder-quality-v1",
             _long_draft("alpha-hunter-holder-quality-v1", 7.0, 1.5, 1.8),
             _sig(6.8, 1.6, 1.9), "long"),
    EvalItem("q-039", "alpha-hunter-holder-ratio-quality-v1",
             _long_draft("alpha-hunter-holder-ratio-quality-v1", 8.0, 1.8, 1.8),
             _sig(7.8, 1.9, 1.9), "long"),
    EvalItem("q-040", "alpha-hunter-hunt-score-v1",
             _long_draft("alpha-hunter-hunt-score-v1", 13.0, 3.0, 2.5),
             _sig(12.8, 3.1, 2.6), "long"),
    EvalItem("q-041", "alpha-hunter-liquidity-health-v1",
             _long_draft("alpha-hunter-liquidity-health-v1", 6.0, 1.5, 2.0),
             _sig(5.9, 1.6, 2.1), "long"),
    EvalItem("q-042", "alpha-hunter-listing-stage-catalyst-v1",
             _long_draft("alpha-hunter-listing-stage-catalyst-v1", 20.0, 6.0, 5.0),
             _sig(19.5, 5.9, 4.9), "long"),
    EvalItem("q-043", "alpha-hunter-momentum-bear-divergence-v1",
             _short_draft("alpha-hunter-momentum-bear-divergence-v1", -7.0, 2.0, 1.5),
             _sig(-6.8, 2.1, 1.6, "down"), "short"),
    EvalItem("q-044", "alpha-hunter-momentum-bull-divergence-v1",
             _long_draft("alpha-hunter-momentum-bull-divergence-v1", 9.0, 2.5, 2.0),
             _sig(8.8, 2.6, 2.1), "long"),
    EvalItem("q-045", "alpha-hunter-multi-exchange-lead-v1",
             _long_draft("alpha-hunter-multi-exchange-lead-v1", 11.0, 3.0, 2.5),
             _sig(10.8, 3.1, 2.6), "long"),
    EvalItem("q-046", "alpha-hunter-multi-funding-skew-v1",
             _long_draft("alpha-hunter-multi-funding-skew-v1", 10.0, 2.5, 2.0),
             _sig(9.8, 2.6, 2.1), "long"),
    EvalItem("q-047", "alpha-hunter-orderbook-wall-v1",
             _long_draft("alpha-hunter-orderbook-wall-v1", 7.0, 2.0, 3.0),
             _sig(6.8, 2.1, 2.9), "long"),
    EvalItem("q-048", "alpha-hunter-pre-dump-v1",
             _short_draft("alpha-hunter-pre-dump-v1", -14.0, 4.5, 3.5),
             _sig(-13.8, 4.4, 3.4, "down"), "short"),
    EvalItem("q-049", "alpha-hunter-pre-pump-v1",
             _long_draft("alpha-hunter-pre-pump-v1", 18.0, 5.0, 4.0),
             _sig(17.8, 4.9, 3.9), "long"),
    EvalItem("q-050", "alpha-hunter-sector-rotation-v1",
             _long_draft("alpha-hunter-sector-rotation-v1", 8.0, 2.0, 2.2),
             _sig(7.8, 2.1, 2.3), "long"),
]

assert len(EVAL_SET) == 50, f"Expected 50 eval items, got {len(EVAL_SET)}"
