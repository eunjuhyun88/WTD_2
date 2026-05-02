#!/usr/bin/env python3
"""Import coupling audit — run before/after W-0386 phases to track coupling reduction.

Usage:
    python tools/import_audit.py              # full report
    python tools/import_audit.py --targets    # targets only
"""
from __future__ import annotations
import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
ENGINE_ROOT = REPO_ROOT / "engine"


def grep_count(pattern: str, path: Path, extra_args: list[str] | None = None) -> list[str]:
    cmd = ["grep", "-rn", pattern, str(path), "--include=*.py"]
    if extra_args:
        cmd.extend(extra_args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    return [l for l in result.stdout.splitlines() if "__pycache__" not in l]


def print_section(title: str, lines: list[str], show_files: bool = True) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}: {len(lines)}")
    print(f"{'='*60}")
    if show_files and lines:
        files = sorted({l.split(":")[0] for l in lines})
        for f in files[:10]:
            print(f"  {f}")
        if len(files) > 10:
            print(f"  ... ({len(files) - 10} more files)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets", action="store_true", help="Show only target counts")
    args = parser.parse_args()

    print("\n🔍 Engine Import Coupling Audit")
    print(f"   Root: {ENGINE_ROOT}")

    checks = [
        (
            "from engine.research (top-level, absolute)",
            grep_count("from engine\\.research", ENGINE_ROOT),
        ),
        (
            "from research. (relative, OUTSIDE research/)",
            [
                l for l in grep_count("from research\\.", ENGINE_ROOT)
                if "/research/" not in l.split(":")[0].replace(str(ENGINE_ROOT), "")
            ],
        ),
        (
            "from research. (relative, INSIDE research/ cross-imports)",
            [
                l for l in grep_count("from research\\.", ENGINE_ROOT)
                if "/research/" in l.split(":")[0].replace(str(ENGINE_ROOT), "")
            ],
        ),
        (
            "from engine.scanner (external coupling to scanner)",
            grep_count("from engine\\.scanner", ENGINE_ROOT),
        ),
    ]

    totals: dict[str, int] = {}
    for label, hits in checks:
        totals[label] = len(hits)
        if args.targets:
            print(f"  {label}: {len(hits)}")
        else:
            print_section(label, hits)

    print(f"\n{'='*60}")
    print("  TARGETS (after W-0386-D)")
    print(f"{'='*60}")
    print(f"  from engine.research top-level: {totals.get('from engine.research (top-level, absolute)', '?')} → target ≤ 12")
    print(f"  from research. external:        {totals.get('from research. (relative, OUTSIDE research/)', '?')} → target ≤ 30")
    print()


if __name__ == "__main__":
    main()
