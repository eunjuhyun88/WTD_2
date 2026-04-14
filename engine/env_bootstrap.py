"""Load local environment files for Python engine processes.

The repository keeps real secrets in ignored ``.env`` files. Importing this
module makes those values available through ``os.environ`` without requiring an
extra dependency such as python-dotenv.
"""
from __future__ import annotations

import os
from pathlib import Path


def _parse_env_value(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, raw_value = stripped.split("=", 1)
        key = key.strip()
        if key and not os.environ.get(key):
            os.environ[key] = _parse_env_value(raw_value)


def load_local_env() -> None:
    engine_root = Path(__file__).resolve().parent
    repo_root = engine_root.parent

    for env_path in (
        repo_root / ".env.local",
        repo_root / ".env",
        engine_root / ".env.local",
        engine_root / ".env",
        repo_root / "app" / ".env.local",
        repo_root / "app" / ".env",
    ):
        _load_env_file(env_path)


load_local_env()
