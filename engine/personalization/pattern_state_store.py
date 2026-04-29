"""PatternStateStore: JSON persistence for UserPatternState.

One file per user: {store_path}/{user_id}.json
  { "<pattern_slug>": { "states": {...}, "n_total": N, ... } }

Atomic write via .tmp → rename (same as AffinityRegistry).
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Optional

from personalization.types import ALL_VERDICT_LABELS, BetaState, UserPatternState
from personalization.exceptions import StateCorruptedError


class PatternStateStore:
    def __init__(self, store_path: Path) -> None:
        self._path = store_path
        self._path.mkdir(parents=True, exist_ok=True)

    def _user_file(self, user_id: str) -> Path:
        return self._path / f"{user_id}.json"

    def _load_raw(self, user_id: str) -> dict:
        f = self._user_file(user_id)
        if not f.exists():
            return {}
        try:
            return json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            return {}

    def _save_raw(self, user_id: str, data: dict) -> None:
        f = self._user_file(user_id)
        # Use pid+thread id suffix to avoid .tmp collision under concurrent writes
        tmp = f.parent / f"{f.stem}.{os.getpid()}.{threading.get_ident()}.tmp"
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(f)

    def get(self, user_id: str, pattern_slug: str) -> Optional[UserPatternState]:
        data = self._load_raw(user_id)
        entry = data.get(pattern_slug)
        if entry is None:
            return None
        try:
            return _deserialize(user_id, pattern_slug, entry)
        except (KeyError, TypeError, ValueError) as exc:
            raise StateCorruptedError(
                f"state for ({user_id}, {pattern_slug}) is corrupt: {exc}"
            ) from exc

    def put(self, state: UserPatternState) -> None:
        data = self._load_raw(state.user_id)
        data[state.pattern_slug] = _serialize(state)
        self._save_raw(state.user_id, data)

    def list_users(self) -> list[str]:
        return [f.stem for f in self._path.glob("*.json") if f.suffix == ".json"]

    def list_patterns_for_user(self, user_id: str) -> list[str]:
        return list(self._load_raw(user_id).keys())

    def delete(self, user_id: str, pattern_slug: str) -> bool:
        """Remove a pattern entry. Returns True if it existed."""
        data = self._load_raw(user_id)
        if pattern_slug not in data:
            return False
        del data[pattern_slug]
        self._save_raw(user_id, data)
        return True


def _serialize(state: UserPatternState) -> dict:
    return {
        "states": {
            label: {"alpha": bs.alpha, "beta": bs.beta}
            for label, bs in state.states.items()
        },
        "n_total": state.n_total,
        "last_verdict_at": state.last_verdict_at,
        "decay_applied_at": state.decay_applied_at,
    }


def _deserialize(user_id: str, pattern_slug: str, entry: dict) -> UserPatternState:
    raw_states = entry["states"]
    states = {
        label: BetaState(alpha=float(raw_states[label]["alpha"]),
                         beta=float(raw_states[label]["beta"]))
        for label in ALL_VERDICT_LABELS
        if label in raw_states
    }
    # Ensure all labels present (tolerate partial writes from older versions)
    for label in ALL_VERDICT_LABELS:
        if label not in states:
            states[label] = BetaState(alpha=1.0, beta=1.0)
    return UserPatternState(
        user_id=user_id,
        pattern_slug=pattern_slug,
        states=states,
        n_total=int(entry["n_total"]),
        last_verdict_at=entry.get("last_verdict_at"),
        decay_applied_at=entry.get("decay_applied_at"),
    )
