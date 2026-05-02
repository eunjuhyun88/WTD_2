"""engine.alpha — Alpha composite scoring + scroll segment + similar pipeline (W-0384)."""
from __future__ import annotations

from engine.alpha.composite_score import (
    AlphaScoreRequest,
    AlphaScoreResult,
    AlphaSignal,
    compute_alpha_score,
)
from engine.alpha.scroll_segment import (
    AnomalyFlag,
    ScrollSegmentRequest,
    ScrollSegmentResult,
    analyze_scroll_segment,
)
from engine.alpha.scroll_similar_compose import (
    SimilarSegment,
    SimilarSegmentResponse,
    find_similar_segments,
)
from engine.alpha.universe_seed import get_alpha_universe

__all__ = [
    "AlphaScoreRequest",
    "AlphaScoreResult",
    "AlphaSignal",
    "AnomalyFlag",
    "ScrollSegmentRequest",
    "ScrollSegmentResult",
    "SimilarSegment",
    "SimilarSegmentResponse",
    "analyze_scroll_segment",
    "compute_alpha_score",
    "find_similar_segments",
    "get_alpha_universe",
]
