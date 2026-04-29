"""Pattern lifecycle status store (W-0308).

Manages Draft → Candidate → Object → Archived transitions for patterns.
File-backed JSON store; in-memory cache with write-through.

Status graph (one-way):
    draft → candidate → object
                     ↘ archived
    draft → archived
    candidate → archived
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import Lock
from typing import Any

log = logging.getLogger("engine.lifecycle")

_STORE_DIR = Path(os.environ.get("ENGINE_DATA_DIR", "/tmp/engine_data")) / "pattern_lifecycle"
_STORE_FILE = _STORE_DIR / "status.json"
_AUDIT_FILE = _STORE_DIR / "audit.jsonl"

# Valid status values
VALID_STATUSES = {"draft", "candidate", "object", "archived"}

# Allowed transitions: {from_status: allowed_to_statuses}
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft":     {"candidate", "archived"},
    "candidate": {"object", "archived"},
    "object":    {"archived"},
    "archived":  set(),  # terminal — no transitions from archived
}


@dataclass
class LifecycleRecord:
    slug: str
    status: str
    updated_at: float
    updated_by: str = "system"
    reason: str = ""


class PatternLifecycleStore:
    """Thread-safe file-backed pattern lifecycle status store."""

    def __init__(self, store_dir: Path = _STORE_DIR) -> None:
        self._dir = store_dir
        self._file = store_dir / "status.json"
        self._audit = store_dir / "audit.jsonl"
        self._lock = Lock()
        self._cache: dict[str, LifecycleRecord] = {}
        self._load()

    def _load(self) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        if self._file.exists():
            try:
                raw = json.loads(self._file.read_text())
                for slug, entry in raw.items():
                    self._cache[slug] = LifecycleRecord(**entry)
            except Exception as exc:
                log.warning("lifecycle_store: load failed: %s", exc)

    def _save(self) -> None:
        try:
            tmp = self._file.with_suffix(".tmp")
            tmp.write_text(json.dumps({k: asdict(v) for k, v in self._cache.items()}, indent=2))
            tmp.replace(self._file)
        except Exception as exc:
            log.error("lifecycle_store: save failed: %s", exc)

    def get_record(self, slug: str) -> dict[str, Any] | None:
        """Return the explicit lifecycle record for slug, if one has been written."""
        with self._lock:
            record = self._cache.get(slug)
            return asdict(record) if record is not None else None

    def get_status(self, slug: str, default: str = "draft") -> str:
        """Return current status for slug; default is caller-selected."""
        with self._lock:
            return self._cache.get(slug, LifecycleRecord(slug=slug, status=default, updated_at=0)).status

    def get_all(self) -> list[dict[str, Any]]:
        with self._lock:
            return [asdict(r) for r in self._cache.values()]

    def transition(
        self,
        slug: str,
        to_status: str,
        user_id: str = "system",
        reason: str = "",
        default_from_status: str = "draft",
    ) -> dict[str, Any]:
        """Apply status transition. Raises ValueError on invalid transition.

        Returns: { slug, from_status, to_status, updated_at }
        """
        if to_status not in VALID_STATUSES:
            raise ValueError(f"Invalid status: {to_status!r}. Must be one of {VALID_STATUSES}")

        with self._lock:
            current = self._cache.get(slug)
            from_status = current.status if current else default_from_status

            allowed = ALLOWED_TRANSITIONS.get(from_status, set())
            if to_status not in allowed:
                raise ValueError(
                    f"Transition {from_status!r} → {to_status!r} not allowed. "
                    f"Allowed from {from_status!r}: {sorted(allowed) or ['(none)']}"
                )

            now = time.time()
            record = LifecycleRecord(
                slug=slug,
                status=to_status,
                updated_at=now,
                updated_by=user_id,
                reason=reason,
            )
            self._cache[slug] = record
            self._save()

            # Append audit log entry (non-blocking write)
            audit_entry = {
                "slug": slug,
                "from_status": from_status,
                "to_status": to_status,
                "user_id": user_id,
                "reason": reason,
                "ts": now,
            }
            try:
                with self._audit.open("a") as f:
                    f.write(json.dumps(audit_entry) + "\n")
            except Exception as exc:
                log.warning("lifecycle_store: audit write failed: %s", exc)

            return {
                "slug": slug,
                "from_status": from_status,
                "to_status": to_status,
                "updated_at": now,
            }


# Module-level singleton
_store: PatternLifecycleStore | None = None


def get_lifecycle_store() -> PatternLifecycleStore:
    global _store
    if _store is None:
        _store = PatternLifecycleStore()
    return _store
