"""Data types for the Challenge system.

A Challenge is the user-defined unit of pattern:
  - Created from 1–5 "snaps" (symbol + timestamp + optional label)
  - Refined by PatternRefiner into a feature vector + win-rate statistics
  - Stored on-disk in challenges/{slug}/
  - Used by the background scanner to find real-time matches

Pattern representation: a multi-snap pattern is encoded as an extended
feature vector (see architecture-v2-draft.md §3.1b):

  [features_snap1 | features_snap2 | ... | delta12 | delta23 | timing12 | timing23]

Single-snap patterns degrade gracefully to the standard 28-feature vector.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np

from scoring.feature_matrix import N_FEATURES

# Where challenges are stored relative to the engine root.
CHALLENGES_DIR = Path(__file__).parent.parent / "challenges"


# ---------------------------------------------------------------------------
# Input types (what the API receives)
# ---------------------------------------------------------------------------


@dataclass
class Snap:
    """One user-marked reference point."""

    symbol: str
    timestamp: datetime  # UTC
    label: str = ""      # e.g. "급락 시작", "OI 터짐", "진입"


@dataclass
class PatternInput:
    """User-registered pattern: 1–5 snaps defining a multi-step sequence."""

    snaps: list[Snap]
    user_id: Optional[str] = None

    def __post_init__(self) -> None:
        if not 1 <= len(self.snaps) <= 5:
            raise ValueError("PatternInput requires 1–5 snaps")


# ---------------------------------------------------------------------------
# Derived types (what the matcher produces)
# ---------------------------------------------------------------------------


@dataclass
class StrategyResult:
    """Result from one refinement strategy competing for the best pattern."""

    name: str          # "feature_outlier" | "cosine_similarity" | "lightgbm_importance" | "dtw"
    win_rate: float
    match_count: int
    expectancy: float
    feature_vector: list[float]   # centroid / importance-weighted vector
    threshold: float              # similarity score that separates matches


@dataclass
class ChallengeRecord:
    """Persisted challenge (stored as JSON in challenges/{slug}/)."""

    slug: str
    user_id: Optional[str]
    snaps: list[dict]             # serialised Snap list
    strategies: list[dict]        # serialised StrategyResult list
    recommended: str              # name of best strategy
    feature_vector: list[float]   # centroid for real-time scanning
    created_at: str               # ISO-8601 UTC
    scan_enabled: bool = True

    def save(self) -> Path:
        """Write to challenges/{slug}/challenge.json."""
        path = CHALLENGES_DIR / self.slug / "challenge.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(asdict(self), f, indent=2, default=str)
        return path

    @classmethod
    def load(cls, slug: str) -> "ChallengeRecord":
        path = CHALLENGES_DIR / slug / "challenge.json"
        if not path.exists():
            raise FileNotFoundError(f"Challenge not found: {slug}")
        with open(path) as f:
            data = json.load(f)
        return cls(**data)

    @classmethod
    def list_all(cls) -> list[str]:
        """Return all known challenge slugs."""
        if not CHALLENGES_DIR.exists():
            return []
        return [p.name for p in CHALLENGES_DIR.iterdir() if p.is_dir()]


# ---------------------------------------------------------------------------
# Similarity match (what the scanner returns)
# ---------------------------------------------------------------------------


@dataclass
class ScanMatch:
    symbol: str
    timestamp: datetime
    similarity: float       # 0..1
    p_win: Optional[float]  # LightGBM score, None if untrained
    price: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def slugify(text: str) -> str:
    """Convert arbitrary text to a URL/filesystem-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text[:64] or "challenge"


def make_slug(snaps: list[Snap]) -> str:
    """Generate a deterministic slug from the first snap."""
    s = snaps[0]
    ts = s.timestamp.strftime("%Y%m%d")
    base = slugify(f"{s.symbol}-{ts}-{s.label or 'pattern'}")
    return base
