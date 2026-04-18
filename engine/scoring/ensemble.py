"""Ensemble scoring: fuse ML probability with building-block convergence.

Design rationale (AI Researcher perspective):
    - LightGBM captures non-linear feature interactions → P(win)
    - Building blocks capture discrete structural conditions (engulfing, breakout, etc.)
    - Neither alone is sufficient: LightGBM gives ~0.55 AUC, blocks fire on noise
    - Convergence = both signals agree → dramatically higher precision

Scoring formula:
    ensemble_score = w_ml * ml_score + w_block * block_score + w_regime * regime_bonus

    Where:
      ml_score    = calibrated P(win) from LightGBM [0, 1]
      block_score = convergence_ratio * category_diversity_bonus [0, 1]
      regime_bonus = +0.05 if regime aligns with direction, -0.10 if against

    Final signal:
      STRONG_LONG  → ensemble ≥ 0.65 AND ≥2 block categories AND no disqualifiers
      LONG         → ensemble ≥ 0.55 AND ≥1 entry/trigger
      NEUTRAL      → everything else
      SHORT        → ensemble_short ≥ 0.55
      STRONG_SHORT → ensemble_short ≥ 0.65

The key insight: category diversity (entry + trigger + confirmation all firing)
is a much stronger signal than raw count. 5 triggers with 0 confirmations = noise.
1 entry + 1 trigger + 1 confirmation = convergence.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class SignalDirection(str, Enum):
    STRONG_LONG = "strong_long"
    LONG = "long"
    NEUTRAL = "neutral"
    SHORT = "short"
    STRONG_SHORT = "strong_short"


class BlockCategory(str, Enum):
    ENTRY = "entry"
    TRIGGER = "trigger"
    CONFIRMATION = "confirmation"
    DISQUALIFIER = "disqualifier"


# Block name → category mapping (must stay in sync with block_evaluator._BLOCKS)
_BLOCK_CATEGORIES: dict[str, BlockCategory] = {
    # entries
    "bullish_engulfing": BlockCategory.ENTRY,
    "bearish_engulfing": BlockCategory.ENTRY,
    "long_lower_wick": BlockCategory.ENTRY,
    "long_upper_wick": BlockCategory.ENTRY,
    "rsi_threshold": BlockCategory.ENTRY,
    "rsi_bullish_divergence": BlockCategory.ENTRY,
    "rsi_bearish_divergence": BlockCategory.ENTRY,
    "support_bounce": BlockCategory.ENTRY,
    # triggers
    "recent_rally": BlockCategory.TRIGGER,
    "recent_decline": BlockCategory.TRIGGER,
    "gap_up": BlockCategory.TRIGGER,
    "gap_down": BlockCategory.TRIGGER,
    "breakout_above_high": BlockCategory.TRIGGER,
    "consolidation_then_breakout": BlockCategory.TRIGGER,
    "sweep_below_low": BlockCategory.TRIGGER,
    "volume_spike": BlockCategory.TRIGGER,
    # confirmations
    "golden_cross": BlockCategory.CONFIRMATION,
    "dead_cross": BlockCategory.CONFIRMATION,
    "ema_pullback": BlockCategory.CONFIRMATION,
    "bollinger_squeeze": BlockCategory.CONFIRMATION,
    "bollinger_expansion": BlockCategory.CONFIRMATION,
    "funding_extreme": BlockCategory.CONFIRMATION,
    "oi_change": BlockCategory.CONFIRMATION,
    "cvd_state_eq": BlockCategory.CONFIRMATION,
    "cvd_buying": BlockCategory.CONFIRMATION,
    "volume_dryup": BlockCategory.CONFIRMATION,
    "coinbase_premium_positive": BlockCategory.CONFIRMATION,
    "smart_money_accumulation": BlockCategory.CONFIRMATION,
    "total_oi_spike": BlockCategory.CONFIRMATION,
    "oi_exchange_divergence": BlockCategory.CONFIRMATION,
    # disqualifiers
    "volume_below_average": BlockCategory.DISQUALIFIER,
    "extreme_volatility": BlockCategory.DISQUALIFIER,
    "extended_from_ma": BlockCategory.DISQUALIFIER,
}

# Blocks that are inherently bearish (used for direction inference)
_BEARISH_BLOCKS: frozenset[str] = frozenset({
    "bearish_engulfing", "long_upper_wick", "rsi_bearish_divergence",
    "recent_decline", "gap_down", "dead_cross",
})

_BULLISH_BLOCKS: frozenset[str] = frozenset({
    "bullish_engulfing", "long_lower_wick", "rsi_bullish_divergence",
    "support_bounce", "recent_rally", "gap_up", "breakout_above_high",
    "consolidation_then_breakout", "golden_cross", "ema_pullback",
    "coinbase_premium_positive",
    "smart_money_accumulation",
})

# Ensemble weights (tuned via walk-forward analysis on BTCUSDT 6yr data)
W_ML = 0.50       # ML probability weight
W_BLOCK = 0.35    # Block convergence weight
W_REGIME = 0.15   # Regime alignment weight

# Thresholds
THRESHOLD_SIGNAL = 0.55     # minimum for any signal
THRESHOLD_STRONG = 0.65     # strong conviction
MIN_CATEGORIES_STRONG = 2   # need ≥2 block categories for strong signal


@dataclass(frozen=True)
class BlockAnalysis:
    """Detailed breakdown of triggered blocks by category."""
    entries: list[str]
    triggers: list[str]
    confirmations: list[str]
    disqualifiers: list[str]
    n_categories_active: int   # count of non-empty categories (excl disqualifiers)
    bullish_count: int
    bearish_count: int

    @property
    def has_disqualifier(self) -> bool:
        return len(self.disqualifiers) > 0

    @property
    def net_direction(self) -> str:
        """'bullish', 'bearish', or 'mixed' based on block polarity."""
        if self.bullish_count > self.bearish_count:
            return "bullish"
        elif self.bearish_count > self.bullish_count:
            return "bearish"
        return "mixed"


@dataclass(frozen=True)
class EnsembleResult:
    """Complete ensemble scoring output."""
    direction: SignalDirection
    ensemble_score: float        # [0, 1] — overall conviction
    ml_contribution: float       # ML component (before weighting)
    block_contribution: float    # Block convergence component (before weighting)
    regime_contribution: float   # Regime alignment component (before weighting)
    block_analysis: BlockAnalysis
    confidence: str              # "high" | "medium" | "low"
    reason: str                  # human-readable explanation

    def to_dict(self) -> dict:
        return {
            "direction": self.direction.value,
            "ensemble_score": round(self.ensemble_score, 4),
            "ml_contribution": round(self.ml_contribution, 4),
            "block_contribution": round(self.block_contribution, 4),
            "regime_contribution": round(self.regime_contribution, 4),
            "confidence": self.confidence,
            "reason": self.reason,
            "block_analysis": {
                "entries": self.block_analysis.entries,
                "triggers": self.block_analysis.triggers,
                "confirmations": self.block_analysis.confirmations,
                "disqualifiers": self.block_analysis.disqualifiers,
                "n_categories_active": self.block_analysis.n_categories_active,
                "net_direction": self.block_analysis.net_direction,
            },
        }


def analyze_blocks(triggered: list[str]) -> BlockAnalysis:
    """Classify triggered blocks into categories and count polarity."""
    entries: list[str] = []
    triggers: list[str] = []
    confirmations: list[str] = []
    disqualifiers: list[str] = []
    bullish = 0
    bearish = 0

    for name in triggered:
        cat = _BLOCK_CATEGORIES.get(name)
        if cat == BlockCategory.ENTRY:
            entries.append(name)
        elif cat == BlockCategory.TRIGGER:
            triggers.append(name)
        elif cat == BlockCategory.CONFIRMATION:
            confirmations.append(name)
        elif cat == BlockCategory.DISQUALIFIER:
            disqualifiers.append(name)

        if name in _BULLISH_BLOCKS:
            bullish += 1
        elif name in _BEARISH_BLOCKS:
            bearish += 1

    n_cats = sum(1 for lst in [entries, triggers, confirmations] if lst)

    return BlockAnalysis(
        entries=entries,
        triggers=triggers,
        confirmations=confirmations,
        disqualifiers=disqualifiers,
        n_categories_active=n_cats,
        bullish_count=bullish,
        bearish_count=bearish,
    )


def _compute_block_score(analysis: BlockAnalysis) -> float:
    """Block convergence score [0, 1].

    Formula:
      base = min(total_non_disq_blocks / 5, 1.0)  — saturates at 5 blocks
      diversity_bonus = n_categories / 3            — max 1.0 for all 3 categories
      score = base * 0.6 + diversity_bonus * 0.4    — diversity matters more than count
    """
    total = len(analysis.entries) + len(analysis.triggers) + len(analysis.confirmations)
    if total == 0:
        return 0.0

    base = min(total / 5.0, 1.0)
    diversity = analysis.n_categories_active / 3.0
    return base * 0.6 + diversity * 0.4


def _compute_regime_bonus(regime: str, direction: str) -> float:
    """Regime alignment bonus.

    +0.05 if regime supports direction (risk_on + bullish, risk_off + bearish)
    -0.10 if regime opposes direction (penalty is asymmetric — fighting regime is worse)
     0.00 for chop or mixed
    """
    if regime == "risk_on" and direction == "bullish":
        return 0.05
    if regime == "risk_off" and direction == "bearish":
        return 0.05
    if regime == "risk_on" and direction == "bearish":
        return -0.10
    if regime == "risk_off" and direction == "bullish":
        return -0.10
    return 0.0


def compute_ensemble(
    p_win: Optional[float],
    blocks_triggered: list[str],
    regime: str = "chop",
) -> EnsembleResult:
    """Compute the ensemble signal from ML + blocks + regime.

    Args:
        p_win:           LightGBM P(win) ∈ [0, 1], or None if untrained.
        blocks_triggered: list of active block names from evaluate_blocks().
        regime:          "risk_on" | "risk_off" | "chop" from the snapshot.

    Returns:
        EnsembleResult with direction, score, and full breakdown.
    """
    analysis = analyze_blocks(blocks_triggered)

    # ML component: use 0.5 (neutral) if model not trained
    ml_raw = p_win if p_win is not None else 0.5

    # Block convergence score
    block_raw = _compute_block_score(analysis)

    # Direction inference from blocks
    block_direction = analysis.net_direction

    # Regime alignment
    regime_bonus = _compute_regime_bonus(regime, block_direction)

    # Weighted ensemble
    ensemble = (
        W_ML * ml_raw
        + W_BLOCK * block_raw
        + W_REGIME * max(0.0, regime_bonus + 0.5)  # shift regime to [0,1] range
    )
    # Clamp to [0, 1]
    ensemble = max(0.0, min(1.0, ensemble))

    # --- Disqualifier veto ---
    # Disqualifiers reduce score but don't zero it (soft veto)
    if analysis.has_disqualifier:
        penalty = 0.10 * len(analysis.disqualifiers)
        ensemble = max(0.0, ensemble - penalty)

    # --- Determine signal direction ---
    direction = SignalDirection.NEUTRAL
    reasons: list[str] = []

    if block_direction == "bullish":
        if ensemble >= THRESHOLD_STRONG and analysis.n_categories_active >= MIN_CATEGORIES_STRONG and not analysis.has_disqualifier:
            direction = SignalDirection.STRONG_LONG
            reasons.append(f"ML {ml_raw:.0%} + {analysis.n_categories_active}cat convergence")
        elif ensemble >= THRESHOLD_SIGNAL and (analysis.entries or analysis.triggers):
            direction = SignalDirection.LONG
            reasons.append(f"ML {ml_raw:.0%} + {len(blocks_triggered)} blocks")
    elif block_direction == "bearish":
        # For short signals, invert ML score (P(win) high = good for longs = bad for shorts)
        short_ml = 1.0 - ml_raw
        short_ensemble = (
            W_ML * short_ml
            + W_BLOCK * block_raw
            + W_REGIME * max(0.0, _compute_regime_bonus(regime, "bearish") + 0.5)
        )
        short_ensemble = max(0.0, min(1.0, short_ensemble))
        if analysis.has_disqualifier:
            short_ensemble = max(0.0, short_ensemble - 0.10 * len(analysis.disqualifiers))

        if short_ensemble >= THRESHOLD_STRONG and analysis.n_categories_active >= MIN_CATEGORIES_STRONG and not analysis.has_disqualifier:
            direction = SignalDirection.STRONG_SHORT
            ensemble = short_ensemble
            reasons.append(f"Short ML {short_ml:.0%} + {analysis.n_categories_active}cat convergence")
        elif short_ensemble >= THRESHOLD_SIGNAL and (analysis.entries or analysis.triggers):
            direction = SignalDirection.SHORT
            ensemble = short_ensemble
            reasons.append(f"Short ML {short_ml:.0%} + {len(blocks_triggered)} blocks")

    if not reasons:
        if len(blocks_triggered) == 0 and (p_win is None or 0.45 <= ml_raw <= 0.55):
            reasons.append("No conviction — ML neutral, no blocks active")
        elif len(blocks_triggered) > 0 and ensemble < THRESHOLD_SIGNAL:
            reasons.append(f"Blocks active but ensemble {ensemble:.0%} below threshold")
        else:
            reasons.append(f"Mixed signals — ML {ml_raw:.0%}, {len(blocks_triggered)} blocks")

    # Confidence level
    if ensemble >= 0.70 and analysis.n_categories_active >= 3:
        confidence = "high"
    elif ensemble >= THRESHOLD_SIGNAL:
        confidence = "medium"
    else:
        confidence = "low"

    return EnsembleResult(
        direction=direction,
        ensemble_score=ensemble,
        ml_contribution=ml_raw,
        block_contribution=block_raw,
        regime_contribution=regime_bonus,
        block_analysis=analysis,
        confidence=confidence,
        reason=" | ".join(reasons),
    )
