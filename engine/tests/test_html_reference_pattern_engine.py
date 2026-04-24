"""Runtime coverage for HTML-reference-derived pattern families.

The HTML refs were decomposed into registered pattern slugs earlier. These
tests ensure those slugs are executable by the runtime block evaluator, not
only present in ``patterns.library``.
"""
from __future__ import annotations

from patterns.library import HTML_REFERENCE_PATTERNS, PATTERN_LIBRARY
from scoring.block_evaluator import _BLOCKS as BLOCK_REGISTRY

from building_blocks.confirmations.negative_funding_bias import negative_funding_bias
from building_blocks.confirmations.oi_contraction_confirm import oi_contraction_confirm
from building_blocks.confirmations.volume_surge_bear import volume_surge_bear


HTML_REFERENCE_PATTERN_SLUGS = [
    "volatility-squeeze-breakout-v1",
    "alpha-confluence-v1",
    "radar-golden-entry-v1",
    "institutional-distribution-v1",
    "oi-presurge-long-v1",
    "alpha-presurge-v1",
    *[pattern.slug for pattern in HTML_REFERENCE_PATTERNS],
]

HTML_SOURCE_SIGNAL_MAP = {
    "바이낸스 시그널 레이더_v3.0.html": [
        "radar-cvd-breakout-v1",
        "radar-whale-block-trade-v1",
        "radar-micro-squeeze-breakout-v1",
        "radar-orderbook-imbalance-v1",
        "radar-hot-target-cluster-v1",
        "radar-golden-entry-v1",
    ],
    "Alpha Terminal.html": [
        "alpha-terminal-short-squeeze-v1",
        "alpha-terminal-bottom-absorption-v1",
        "alpha-terminal-breakout-momentum-v1",
        "alpha-terminal-vwap-break-v1",
        "alpha-terminal-strong-bull-confluence-v1",
        "alpha-terminal-strong-bear-confluence-v1",
        "alpha-confluence-v1",
        "volatility-squeeze-breakout-v1",
    ],
    "나혼자매매 Alpha Flow_by 아카.html": [
        "alpha-flow-bull-bias-v1",
        "alpha-flow-bear-bias-v1",
        "alpha-flow-wyckoff-accumulation-v1",
        "alpha-flow-mtf-accumulation-v1",
        "alpha-flow-liquidity-zone-v1",
        "alpha-flow-extreme-flow-v1",
        "alpha-confluence-v1",
    ],
    "Alpha Hunter_v1.0.html": [
        "alpha-hunter-activity-surge-v1",
        "alpha-hunter-liquidity-health-v1",
        "alpha-hunter-trade-flow-accumulation-v1",
        "alpha-hunter-momentum-bull-divergence-v1",
        "alpha-hunter-momentum-bear-divergence-v1",
        "alpha-hunter-holder-quality-v1",
        "alpha-hunter-listing-stage-catalyst-v1",
        "alpha-hunter-dex-buy-pressure-v1",
        "alpha-hunter-holder-ratio-quality-v1",
        "alpha-hunter-accumulation-v1",
        "alpha-hunter-pre-pump-v1",
        "alpha-hunter-pre-dump-v1",
        "alpha-hunter-sector-rotation-v1",
        "alpha-hunter-multi-funding-skew-v1",
        "alpha-hunter-multi-exchange-lead-v1",
        "alpha-hunter-bb-squeeze-v1",
        "alpha-hunter-orderbook-wall-v1",
        "alpha-hunter-whale-flow-v1",
        "alpha-hunter-hunt-score-v1",
        "alpha-presurge-v1",
        "oi-presurge-long-v1",
    ],
}


def _referenced_blocks(pattern_slug: str) -> set[str]:
    pattern = PATTERN_LIBRARY[pattern_slug]
    refs: set[str] = set()
    for phase in pattern.phases:
        refs.update(phase.required_blocks)
        refs.update(phase.optional_blocks)
        refs.update(phase.soft_blocks)
        refs.update(phase.disqualifier_blocks)
        for group in phase.required_any_groups:
            refs.update(group)
    return refs


def test_html_reference_patterns_have_runtime_block_coverage():
    registered = {name for name, _ in BLOCK_REGISTRY}
    missing_by_slug = {
        slug: sorted(_referenced_blocks(slug) - registered)
        for slug in HTML_REFERENCE_PATTERN_SLUGS
    }
    assert missing_by_slug == {slug: [] for slug in HTML_REFERENCE_PATTERN_SLUGS}


def test_every_html_source_signal_is_registered():
    missing_by_source = {
        source: [slug for slug in slugs if slug not in PATTERN_LIBRARY]
        for source, slugs in HTML_SOURCE_SIGNAL_MAP.items()
    }
    assert missing_by_source == {
        source: [] for source in HTML_SOURCE_SIGNAL_MAP
    }


def test_new_html_reference_patterns_are_tagged_as_source_specific():
    for pattern in HTML_REFERENCE_PATTERNS:
        assert pattern.slug in PATTERN_LIBRARY
        assert "html_ref" in PATTERN_LIBRARY[pattern.slug].tags


def test_html_reference_blocks_registered_as_callables():
    block_map = {name: fn for name, fn in BLOCK_REGISTRY}
    for name in [
        "atr_ultra_low",
        "liq_zone_squeeze_setup",
        "volume_surge_bull",
        "volume_surge_bear",
        "negative_funding_bias",
        "oi_contraction_confirm",
    ]:
        assert callable(block_map[name])


def test_negative_funding_bias_reads_feature_table_funding(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100, 100],
        features={"funding_rate": [-0.001, -0.001, -0.001, -0.001, -0.001]},
    )
    mask = negative_funding_bias(ctx, min_bars=3, lookback_bars=5)
    assert bool(mask.iloc[-1])


def test_oi_contraction_confirm_reads_feature_table_oi_change(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100],
        features={"oi_change_24h": [0.0, -0.02, -0.07]},
    )
    mask = oi_contraction_confirm(ctx, lookback_bars=24, min_decline_pct=0.05)
    assert not bool(mask.iloc[1])
    assert bool(mask.iloc[-1])


def test_volume_surge_bear_derives_sell_volume_from_taker_buy(make_ctx):
    ctx = make_ctx(
        close=[100, 99, 98],
        overrides={
            "volume": [1000.0, 1000.0, 1000.0],
            "taker_buy_base_volume": [500.0, 350.0, 300.0],
        },
    )
    mask = volume_surge_bear(ctx, taker_sell_window=2, taker_sell_threshold=0.60)
    assert bool(mask.iloc[-1])
