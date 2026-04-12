"""Disqualifier building blocks — rules that invalidate an otherwise-matching bar.

Disqualifiers return True at bars where the pattern should be REJECTED
even if all triggers/confirmations/entries fired. The composer typically
inverts the disqualifier mask and ANDs it with the rest:

    mask = mask_triggers & mask_confirm & mask_entry & ~mask_disqualify
"""
from building_blocks.disqualifiers.extended_from_ma import extended_from_ma
from building_blocks.disqualifiers.extreme_volatility import extreme_volatility
from building_blocks.disqualifiers.volume_below_average import volume_below_average

__all__ = [
    "extended_from_ma",
    "extreme_volatility",
    "volume_below_average",
]
