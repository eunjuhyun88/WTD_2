"""AffinityRegistry: Beta-Binomial affinity score per (user, pattern).

Storage: JSON file per user at {store_path}/{user_id}.json
Atomic write via .tmp → rename.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from personalization.types import VerdictLabel

_ALPHA_0 = 1.0   # uninformed prior
_BETA_0 = 1.0
_COLD_START_MIN_N = 10   # < 10 → cold_start=True

# Shrinkage: κ=20 (informed prior equivalent)
_KAPPA = 20


@dataclass
class AffinityState:
    user_id: str
    pattern_slug: str
    alpha_valid: float
    beta_valid: float
    n_total: int
    score: float           # cached α/(α+β)
    is_cold: bool
    updated_at: str


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class AffinityRegistry:
    def __init__(self, store_path: Path, audit_log_path: Path | None = None) -> None:
        self._path = store_path
        self._path.mkdir(parents=True, exist_ok=True)
        # None = audit logging disabled (tests pass tmp_path explicitly)
        self._audit_log_path = audit_log_path

    def _user_file(self, user_id: str) -> Path:
        return self._path / f"{user_id}.json"

    def _load(self, user_id: str) -> dict:
        f = self._user_file(user_id)
        if not f.exists():
            return {}
        try:
            return json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            return {}

    def _save(self, user_id: str, data: dict) -> None:
        f = self._user_file(user_id)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(f)

    def _compute_score(self, alpha: float, beta: float) -> float:
        total = alpha + beta
        return alpha / total if total > 0 else 0.5

    def update(
        self,
        user_id: str,
        pattern_slug: str,
        outcome: VerdictLabel,
    ) -> AffinityState:
        """Update Beta posterior for (user, pattern)."""
        data = self._load(user_id)
        entry = data.get(pattern_slug, {
            "alpha_valid": _ALPHA_0,
            "beta_valid": _BETA_0,
            "n_total": 0,
        })

        alpha = entry["alpha_valid"]
        beta = entry["beta_valid"]
        n = entry["n_total"]

        # valid → increment alpha; invalid/near_miss/too_early/too_late → increment beta
        if outcome == "valid":
            alpha += 1.0
        else:
            beta += 1.0
        n += 1

        score = self._compute_score(alpha, beta)
        is_cold = n < _COLD_START_MIN_N

        now = _utcnow()
        state = AffinityState(
            user_id=user_id,
            pattern_slug=pattern_slug,
            alpha_valid=alpha,
            beta_valid=beta,
            n_total=n,
            score=score,
            is_cold=is_cold,
            updated_at=now,
        )

        data[pattern_slug] = {
            "alpha_valid": alpha,
            "beta_valid": beta,
            "n_total": n,
            "score": score,
            "is_cold": is_cold,
            "updated_at": now,
        }
        self._save(user_id, data)
        return state

    def get_score(self, user_id: str, pattern_slug: str) -> float:
        data = self._load(user_id)
        entry = data.get(pattern_slug)
        if entry is None:
            return 0.5  # cold-start neutral
        return float(entry.get("score", 0.5))

    def get_state(self, user_id: str, pattern_slug: str) -> Optional[AffinityState]:
        data = self._load(user_id)
        entry = data.get(pattern_slug)
        if entry is None:
            return None
        return AffinityState(
            user_id=user_id,
            pattern_slug=pattern_slug,
            alpha_valid=entry["alpha_valid"],
            beta_valid=entry["beta_valid"],
            n_total=entry["n_total"],
            score=entry["score"],
            is_cold=entry["is_cold"],
            updated_at=entry["updated_at"],
        )

    def list_for_user(
        self, user_id: str, top_k: Optional[int] = None
    ) -> list[AffinityState]:
        data = self._load(user_id)
        states = []
        for slug, entry in data.items():
            states.append(AffinityState(
                user_id=user_id,
                pattern_slug=slug,
                alpha_valid=entry["alpha_valid"],
                beta_valid=entry["beta_valid"],
                n_total=entry["n_total"],
                score=entry["score"],
                is_cold=entry["is_cold"],
                updated_at=entry["updated_at"],
            ))
        states.sort(key=lambda s: s.score, reverse=True)
        if top_k is not None:
            states = states[:top_k]
        return states

    def reset(self, user_id: str, pattern_slug: str, reason: str = "") -> AffinityState:
        """Always-invalid rescue: reset to priors and audit log."""
        data = self._load(user_id)
        now = _utcnow()
        state = AffinityState(
            user_id=user_id,
            pattern_slug=pattern_slug,
            alpha_valid=_ALPHA_0,
            beta_valid=_BETA_0,
            n_total=0,
            score=self._compute_score(_ALPHA_0, _BETA_0),
            is_cold=True,
            updated_at=now,
        )
        data[pattern_slug] = {
            "alpha_valid": _ALPHA_0,
            "beta_valid": _BETA_0,
            "n_total": 0,
            "score": state.score,
            "is_cold": True,
            "updated_at": now,
        }
        self._save(user_id, data)

        if self._audit_log_path is not None:
            self._audit_log_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._audit_log_path, "a") as f:
                f.write(json.dumps({
                    "user_id": user_id,
                    "pattern_slug": pattern_slug,
                    "reason": reason,
                    "reset_at": now,
                }) + "\n")
        return state
