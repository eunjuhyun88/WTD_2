"""Pattern-hunting building blocks — pre-built, tested, pure functions.

Every block has the signature:
    block(ctx: Context, **params) -> pd.Series[bool]

where the returned Series is aligned to `ctx.features.index` and is True
at bars where the pattern holds. Vectorised over the full symbol history
so evaluate() can run across 30+ coins × 50k bars in seconds.

Blocks are grouped by role:
    triggers/      initial event that catches the eye
    confirmations/ secondary signals that corroborate the setup
    entries/       precise entry bar signals
    disqualifiers/ rules that invalidate an otherwise-matching bar

Wizard composer maps user answers to block imports + parameters; see
wizard/new_pattern.py. Blocks themselves know nothing about the wizard.
"""
from building_blocks.context import Context

__all__ = ["Context"]
