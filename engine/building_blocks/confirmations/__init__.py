"""Confirmation building blocks — secondary signals that corroborate a trigger.

A confirmation answers "is this setup real, or a false start?" by checking
structural or technical conditions that accompany the main event. Patterns
typically compose 1-3 confirmations after the trigger.
"""
from building_blocks.confirmations.absorption_signal import absorption_signal
from building_blocks.confirmations.alt_btc_accel_ratio import alt_btc_accel_ratio
from building_blocks.confirmations.bollinger_expansion import bollinger_expansion
from building_blocks.confirmations.bollinger_squeeze import bollinger_squeeze
from building_blocks.confirmations.cvd_state_eq import cvd_state_eq
from building_blocks.confirmations.dead_cross import dead_cross
from building_blocks.confirmations.delta_flip_positive import delta_flip_positive
from building_blocks.confirmations.ema_pullback import ema_pullback
from building_blocks.confirmations.fib_retracement import fib_retracement
from building_blocks.confirmations.funding_extreme import funding_extreme
from building_blocks.confirmations.funding_flip import funding_flip
from building_blocks.confirmations.golden_cross import golden_cross
from building_blocks.confirmations.higher_lows_sequence import higher_lows_sequence
from building_blocks.confirmations.ls_ratio_recovery import ls_ratio_recovery
from building_blocks.confirmations.oi_change import oi_change
from building_blocks.confirmations.oi_expansion_confirm import oi_expansion_confirm
from building_blocks.confirmations.oi_hold_after_spike import oi_hold_after_spike
from building_blocks.confirmations.oi_spike_with_dump import oi_spike_with_dump
from building_blocks.confirmations.positive_funding_bias import positive_funding_bias
from building_blocks.confirmations.post_dump_compression import post_dump_compression
from building_blocks.confirmations.range_break_retest import range_break_retest
from building_blocks.confirmations.reclaim_after_dump import reclaim_after_dump
from building_blocks.confirmations.sideways_compression import sideways_compression
from building_blocks.confirmations.volume_dryup import volume_dryup

__all__ = [
    "absorption_signal",
    "alt_btc_accel_ratio",
    "bollinger_expansion",
    "bollinger_squeeze",
    "cvd_state_eq",
    "dead_cross",
    "delta_flip_positive",
    "ema_pullback",
    "fib_retracement",
    "funding_extreme",
    "funding_flip",
    "golden_cross",
    "higher_lows_sequence",
    "ls_ratio_recovery",
    "oi_change",
    "oi_expansion_confirm",
    "oi_hold_after_spike",
    "oi_spike_with_dump",
    "positive_funding_bias",
    "post_dump_compression",
    "range_break_retest",
    "reclaim_after_dump",
    "sideways_compression",
    "volume_dryup",
]
