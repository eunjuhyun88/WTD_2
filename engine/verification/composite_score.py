"""Pattern marketplace composite quality score.

W-0314 — score_version v1.

Composite = 0.30·E + 0.25·S + 0.15·W + 0.20·D + 0.10·C  (result ∈ [0, 100])

  E  Expectancy    — clipped [-0.5 %, +1.0 %] → linear 0–100
  S  Sharpe        — clipped [-2.0, 4.0]      → linear 0–100  (NaN → 50 fallback)
  W  Win-rate xs   — excess above 0.55 gate, saturates at 0.75
  D  Drawdown      — sqrt-convex penalty, 50 % DD → D_score = 0
  C  Confidence    — log₁₀(n / 200), saturates at n = 2000

Grades: S ≥ 85 | A ≥ 70 | B ≥ 55 | C < 55
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from .types import PaperVerificationResult

SCORE_VERSION = "v1"

WEIGHTS: dict[str, float] = {"E": 0.30, "S": 0.25, "W": 0.15, "D": 0.20, "C": 0.10}
_GRADE_CUTS: dict[str, float] = {"S": 85.0, "A": 70.0, "B": 55.0}

GradeStr = Literal["S", "A", "B", "C"]


@dataclass(frozen=True)
class PatternCompositeScore:
    pattern_slug: str
    composite: float
    quality_grade: GradeStr
    component_scores: dict[str, float]
    score_version: str
    computed_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


def compute_composite_score(
    result: PaperVerificationResult,
) -> PatternCompositeScore:
    """Compute composite score from a PaperVerificationResult."""
    components = _compute_components(result)
    raw = sum(WEIGHTS[k] * v for k, v in components.items())
    composite = round(min(100.0, max(0.0, raw)), 2)
    grade = _grade(composite)
    return PatternCompositeScore(
        pattern_slug=result.pattern_slug,
        composite=composite,
        quality_grade=grade,
        component_scores={k: round(v, 4) for k, v in components.items()},
        score_version=SCORE_VERSION,
    )


# ── component scorers ─────────────────────────────────────────────────────────

def _e_score(expectancy_pct: float) -> float:
    """Expectancy axis: clip [-0.5, 1.0] → linear 0–100."""
    clipped = max(-0.5, min(1.0, expectancy_pct))
    return 100.0 * (clipped + 0.5) / 1.5


def _s_score(sharpe: float) -> float:
    """Sharpe axis: clip [-2.0, 4.0] → linear 0–100. NaN/inf → 50 fallback."""
    if not math.isfinite(sharpe):
        return 50.0
    clipped = max(-2.0, min(4.0, sharpe))
    return 100.0 * (clipped + 2.0) / 6.0


def _w_score(win_rate: float) -> float:
    """Win-rate excess above 0.55 gate, saturates at 0.75 (excess = 0.20)."""
    excess = max(0.0, win_rate - 0.55)
    return 100.0 * min(1.0, excess / 0.20)


def _d_score(max_drawdown_pct: float) -> float:
    """Drawdown penalty — sqrt-convex. max_drawdown_pct is ≤ 0 (fraction, e.g. -0.15 = -15%).
    Formula operates in percentage space (cap at 50 pp), so multiply by 100 first."""
    dd_pct = min(50.0, abs(max_drawdown_pct) * 100.0)
    return 100.0 * (1.0 - (dd_pct / 50.0) ** 0.5)


def _c_bonus(n_trades: int) -> float:
    """Confidence — log₁₀(n / 200), 0 at n=200, saturates at n=2000."""
    if n_trades <= 0:
        return 0.0
    log_val = math.log10(n_trades / 200.0)
    return 100.0 * min(1.0, max(0.0, log_val))


def _compute_components(r: PaperVerificationResult) -> dict[str, float]:
    return {
        "E": _e_score(r.expectancy_pct),
        "S": _s_score(r.sharpe),
        "W": _w_score(r.win_rate),
        "D": _d_score(r.max_drawdown_pct),
        "C": _c_bonus(r.n_trades),
    }


def _grade(composite: float) -> GradeStr:
    if composite >= _GRADE_CUTS["S"]:
        return "S"
    if composite >= _GRADE_CUTS["A"]:
        return "A"
    if composite >= _GRADE_CUTS["B"]:
        return "B"
    return "C"
