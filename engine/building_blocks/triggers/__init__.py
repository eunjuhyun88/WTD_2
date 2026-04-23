"""Trigger building blocks — initial events that catch the eye.

A trigger says "something interesting just happened at this bar."
Triggers are usually the first block in a composed pattern: they
narrow the candidate bars down to a manageable set before more
expensive confirmations run.
"""
from building_blocks.triggers.breakout_above_high import breakout_above_high
from building_blocks.triggers.breakout_after_accumulation import breakout_after_accumulation
from building_blocks.triggers.breakout_from_pullback_range import breakout_from_pullback_range
from building_blocks.triggers.breakout_volume_confirm import breakout_volume_confirm
from building_blocks.triggers.consolidation_then_breakout import (
    consolidation_then_breakout,
)
from building_blocks.triggers.gap_down import gap_down
from building_blocks.triggers.gap_up import gap_up
from building_blocks.triggers.recent_decline import recent_decline
from building_blocks.triggers.recent_rally import recent_rally
from building_blocks.triggers.sweep_below_low import sweep_below_low
from building_blocks.triggers.volume_spike import volume_spike
from building_blocks.triggers.volume_spike_cluster import volume_spike_cluster
from building_blocks.triggers.volume_spike_down import volume_spike_down

__all__ = [
    "breakout_above_high",
    "breakout_after_accumulation",
    "breakout_from_pullback_range",
    "breakout_volume_confirm",
    "consolidation_then_breakout",
    "gap_down",
    "gap_up",
    "recent_decline",
    "recent_rally",
    "sweep_below_low",
    "volume_spike",
    "volume_spike_cluster",
    "volume_spike_down",
]
