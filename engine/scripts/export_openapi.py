"""Emit FastAPI OpenAPI schema as JSON to stdout."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from api.main import app


def main() -> None:
    print(json.dumps(app.openapi(), ensure_ascii=True))


if __name__ == "__main__":
    main()
