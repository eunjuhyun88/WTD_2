"""Built-in pattern library.

Patterns defined here are available to PatternStateMachine by slug.
"""
from __future__ import annotations
from patterns.types import PatternObject, PhaseCondition

TRADOOR_OI_REVERSAL = PatternObject(
    slug="tradoor-oi-reversal-v1",
    name="OI 급등 반전 패턴 (TRADOOR/PTB형)",
    description=(
        "급락+OI급등 두 번. 두 번째가 진짜(거래량 폭발 동반). "
        "이후 저점 상승 + 펀딩 양전환 = 진입 구간. "
        "OI 재급등 시 50~100% 목표."
    ),
    phases=[
        PhaseCondition(
            phase_id="FAKE_DUMP",
            label="가짜 신호 (관망)",
            required_blocks=["recent_decline", "funding_extreme"],
            optional_blocks=["oi_change"],
            disqualifier_blocks=["oi_spike_with_dump"],  # real dump disqualifies fake
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ARCH_ZONE",
            label="번지대 형성 (진입 금지)",
            required_blocks=["sideways_compression"],
            optional_blocks=["volume_dryup"],
            disqualifier_blocks=["oi_spike_with_dump"],
            min_bars=4, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="REAL_DUMP",
            label="진짜 신호 — 핵심 이벤트",
            required_blocks=["oi_spike_with_dump", "volume_spike"],
            optional_blocks=["recent_decline", "funding_extreme"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=4,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ACCUMULATION",
            label="축적 구간 — 진입 구간",
            required_blocks=["higher_lows_sequence", "oi_hold_after_spike"],
            required_any_groups=[["funding_flip", "positive_funding_bias", "ls_ratio_recovery"]],
            soft_blocks=[
                "volume_dryup",
                "bollinger_squeeze",
                "post_dump_compression",
                "reclaim_after_dump",
            ],
            disqualifier_blocks=["oi_spike_with_dump"],
            score_weights={
                "higher_lows_sequence": 0.40,
                "oi_hold_after_spike": 0.30,
                "funding_flip": 0.15,
                "positive_funding_bias": 0.15,
                "ls_ratio_recovery": 0.15,
                "post_dump_compression": 0.10,
                "volume_dryup": 0.05,
                "bollinger_squeeze": 0.05,
                "reclaim_after_dump": 0.05,
            },
            phase_score_threshold=0.70,
            transition_window_bars=12,
            anchor_from_previous_phase=True,
            anchor_phase_id="REAL_DUMP",
            min_bars=6, max_bars=72,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="BREAKOUT",
            label="브레이크아웃",
            required_blocks=["breakout_above_high", "oi_change", "volume_spike"],
            optional_blocks=[],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="1h",
        ),
    ],
    entry_phase="ACCUMULATION",
    target_phase="BREAKOUT",
    timeframe="1h",
    universe_scope="binance_dynamic",
    tags=["oi_reversal", "whale_short_squeeze", "altcoin", "perp"],
)

# Registry: slug → PatternObject
PATTERN_LIBRARY: dict[str, PatternObject] = {
    TRADOOR_OI_REVERSAL.slug: TRADOOR_OI_REVERSAL,
}

def get_pattern(slug: str) -> PatternObject:
    if slug not in PATTERN_LIBRARY:
        raise KeyError(f"Unknown pattern: {slug!r}. Available: {list(PATTERN_LIBRARY)}")
    return PATTERN_LIBRARY[slug]
