"""Confirmation building blocks — secondary signals that corroborate a trigger.

A confirmation answers "is this setup real, or a false start?" by checking
structural or technical conditions that accompany the main event. Patterns
typically compose 1-3 confirmations after the trigger.
"""
from building_blocks.confirmations.bollinger_expansion import bollinger_expansion
from building_blocks.confirmations.bollinger_squeeze import bollinger_squeeze
from building_blocks.confirmations.cvd_state_eq import cvd_state_eq
from building_blocks.confirmations.dead_cross import dead_cross
from building_blocks.confirmations.ema_pullback import ema_pullback
from building_blocks.confirmations.fib_retracement import fib_retracement
from building_blocks.confirmations.funding_extreme import funding_extreme
from building_blocks.confirmations.golden_cross import golden_cross
from building_blocks.confirmations.oi_change import oi_change
from building_blocks.confirmations.range_break_retest import range_break_retest
from building_blocks.confirmations.volume_dryup import volume_dryup

__all__ = [
    "bollinger_expansion",
    "bollinger_squeeze",
    "cvd_state_eq",
    "dead_cross",
    "ema_pullback",
    "fib_retracement",
    "funding_extreme",
    "golden_cross",
    "oi_change",
    "range_break_retest",
    "volume_dryup",
]
