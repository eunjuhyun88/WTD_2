"""Repository-local MemKraft singleton.

This keeps the AGENTS.md protocol import stable:

    from memory.mk import mk

The actual MemKraft dependency is resolved by the engine uv environment.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_MEMORY_DIR = Path(__file__).resolve().parent
_ROOT = _MEMORY_DIR.parent
_instance: Any | None = None


def _load_memkraft() -> type[Any]:
    try:
        from memkraft import MemKraft

        return MemKraft
    except ImportError as first_error:
        for site_packages in (_ROOT / "engine" / ".venv" / "lib").glob("python*/site-packages"):
            sys.path.insert(0, str(site_packages))
            try:
                from memkraft import MemKraft

                return MemKraft
            except ImportError:
                continue

        raise RuntimeError(
            "MemKraft is not importable. Run `cd engine && uv sync`, then retry the memory protocol."
        ) from first_error


def _get() -> Any:
    global _instance
    if _instance is None:
        _instance = _load_memkraft()(base_dir=str(_MEMORY_DIR))
    return _instance


class _LazyMemKraft:
    def __getattr__(self, name: str) -> Any:
        return getattr(_get(), name)

    def __repr__(self) -> str:
        return f"<MemKraft lazy @ {_MEMORY_DIR}>"


mk = _LazyMemKraft()

__all__ = ["mk"]
