from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_cli_eval_latest_runs() -> None:
    root = Path(__file__).resolve().parents[1]
    proc = subprocess.run(
        [sys.executable, "-m", "research.cli", "eval", "--latest", "--samples", "120", "--features", "20", "--splits", "3"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    assert "Eval complete." in proc.stdout


def test_cli_list_runs() -> None:
    root = Path(__file__).resolve().parents[1]
    proc = subprocess.run(
        [sys.executable, "-m", "research.cli", "list", "--limit", "1"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    # Output should be JSON array
    out = proc.stdout.strip() or "[]"
    parsed = json.loads(out)
    assert isinstance(parsed, list)
