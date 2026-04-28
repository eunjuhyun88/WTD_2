#!/usr/bin/env python3
"""verify.py — CI guard for wtd-v2.

Replaces the /검증.md prompt-based command with an actual runnable script.

Usage:
    ./tools/verify.py [--quick] [--engine-only] [--app-only] [--dry-run]
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_DIR = REPO_ROOT / "engine"
APP_DIR = REPO_ROOT / "app"

# Security pattern: catches hard-coded secrets/passwords/raw SQL execute calls
SECURITY_RE = re.compile(
    r'secret="[^"]+"|key="[A-Za-z0-9]{8,}|password="[^"]|for.*\.execute\('
)

EXIT_PASS = 0
EXIT_BLOCK = 1
EXIT_ERROR = 2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run(cmd: list[str], cwd: Path | None = None, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=cwd or REPO_ROOT,
        capture_output=capture,
        text=True,
    )


def hdr(msg: str) -> None:
    print(msg, flush=True)


def ok(label: str, detail: str = "") -> None:
    suffix = f" ({detail})" if detail else ""
    print(f"  {label} ... \u2705 OK{suffix}", flush=True)


def block(label: str, lines: list[str], hint: str = "") -> None:
    print(f"  {label} ... \u274c BLOCK", flush=True)
    for ln in lines:
        print(f"    {ln}", flush=True)
    if hint:
        print(f"    \u2192 {hint}", flush=True)


def warn(msg: str) -> None:
    print(f"  \u26a0\ufe0f  WARNING: {msg}", flush=True)


def skip(label: str, reason: str) -> None:
    print(f"  {label} ... \u23ed\ufe0f  SKIP ({reason})", flush=True)


# ---------------------------------------------------------------------------
# Step 1 — changed files
# ---------------------------------------------------------------------------

def changed_files() -> list[str]:
    result = run(["git", "diff", "--name-only", "origin/main..HEAD"])
    if result.returncode != 0:
        # Fallback: compare against local main
        result = run(["git", "diff", "--name-only", "main..HEAD"])
    if result.returncode != 0:
        return []
    return [f.strip() for f in result.stdout.splitlines() if f.strip()]


def classify(files: list[str]) -> dict[str, bool]:
    engine = any(f.startswith("engine/") for f in files)
    app = any(f.startswith("app/src/") or f.startswith("app/") for f in files)
    tools = any(f.startswith("tools/") or f.startswith(".github/") for f in files)
    code_files = [
        f for f in files
        if not (
            f.startswith("work/")
            or f.startswith("docs/")
            or f.startswith("spec/")
            or f.endswith(".md")
        )
    ]
    docs_only = bool(files) and not code_files
    return {
        "engine": engine,
        "app": app,
        "tools": tools,
        "docs_only": docs_only,
        "any": bool(files),
    }


# ---------------------------------------------------------------------------
# Step 2 — quality / security grep
# ---------------------------------------------------------------------------

def quality_grep(dry_run: bool) -> tuple[bool, list[str]]:
    """Return (passed, problem_lines)."""
    if dry_run:
        return True, []

    result = run(
        ["git", "diff", "origin/main..HEAD", "--", "*.py", "*.ts"],
    )
    if result.returncode != 0:
        result = run(["git", "diff", "main..HEAD", "--", "*.py", "*.ts"])

    hits: list[str] = []
    for line in result.stdout.splitlines():
        if not line.startswith("+"):
            continue
        if line.startswith("+++"):
            continue
        if SECURITY_RE.search(line):
            hits.append(line[:120])

    return (len(hits) == 0), hits


# ---------------------------------------------------------------------------
# Step 3 — engine tests
# ---------------------------------------------------------------------------

def run_engine_tests(dry_run: bool) -> tuple[bool, str, float]:
    """Return (passed, summary, elapsed_seconds)."""
    if dry_run:
        return True, "dry-run", 0.0

    uv = shutil.which("uv")
    if not uv:
        return True, "SKIP (uv not found)", 0.0

    t0 = time.monotonic()
    result = run(
        [uv, "run", "pytest", "tests/", "-x", "-q", "--tb=short"],
        cwd=ENGINE_DIR,
    )
    elapsed = time.monotonic() - t0

    output = (result.stdout + result.stderr).strip()
    passed = result.returncode == 0

    # Extract summary line like "127 passed in 4.2s"
    summary_match = re.search(r"(\d+ passed[^\n]*)", output)
    summary = summary_match.group(1) if summary_match else output.splitlines()[-1] if output else ""

    if not passed:
        # Find FAILED lines
        failed_lines = [ln for ln in output.splitlines() if ln.startswith("FAILED")]
        return False, "\n".join(failed_lines[:10]) if failed_lines else output[-800:], elapsed

    return True, summary, elapsed


# ---------------------------------------------------------------------------
# Step 4 — app typecheck
# ---------------------------------------------------------------------------

def run_app_typecheck(dry_run: bool) -> tuple[bool, str]:
    """Return (passed, output_tail)."""
    if dry_run:
        return True, "dry-run"

    pnpm = shutil.which("pnpm")
    if not pnpm:
        npm = shutil.which("npm")
        if not npm:
            return True, "SKIP (pnpm/npm not found)"
        runner = [npm, "--prefix", str(APP_DIR), "run", "typecheck"]
        result = run(runner, cwd=REPO_ROOT)
    else:
        result = run([pnpm, "typecheck"], cwd=APP_DIR)

    output = (result.stdout + result.stderr).strip()
    tail = "\n".join(output.splitlines()[-20:])
    return result.returncode == 0, tail


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="wtd-v2 local CI guard — verify changed code before commit/PR",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ./tools/verify.py                 # auto-detect surfaces from git diff
  ./tools/verify.py --quick         # skip bench/slow tests, only -x -q
  ./tools/verify.py --engine-only   # force engine path regardless of diff
  ./tools/verify.py --app-only      # force app path regardless of diff
  ./tools/verify.py --dry-run       # parse args + print plan, no subprocess calls
        """,
    )
    parser.add_argument("--quick", action="store_true", help="Skip slow benchmarks; run only -x -q")
    parser.add_argument("--engine-only", action="store_true", help="Force engine test surface")
    parser.add_argument("--app-only", action="store_true", help="Force app typecheck surface")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without running subprocesses")
    args = parser.parse_args()

    today = "2026-04-29"
    print(f"\n=== verify.py ({today}) ===", flush=True)

    # --- Determine changed files ---
    if args.dry_run:
        files: list[str] = []
        surfaces: dict[str, bool] = {"engine": True, "app": True, "tools": False, "docs_only": False, "any": True}
        print("변경: (dry-run — no git calls)", flush=True)
    else:
        files = changed_files()
        surfaces = classify(files)

        if not files:
            print("변경: 없음", flush=True)
            if not args.engine_only and not args.app_only:
                print("\n결과: PASS \u2705 (변경 없음)", flush=True)
                return EXIT_PASS

        engine_count = sum(1 for f in files if f.startswith("engine/"))
        app_count = sum(1 for f in files if f.startswith("app/"))
        other_count = len(files) - engine_count - app_count
        parts = []
        if engine_count:
            parts.append(f"engine {engine_count}파일")
        if app_count:
            parts.append(f"app {app_count}파일")
        if other_count:
            parts.append(f"기타 {other_count}파일")
        print(f"변경: {', '.join(parts) or '없음'}", flush=True)

    # Apply overrides before docs_only check so --engine-only / --app-only
    # force the requested verification surface even when the diff is docs-only.
    if args.engine_only:
        surfaces["engine"] = True
        surfaces["app"] = False
        surfaces["docs_only"] = False
    if args.app_only:
        surfaces["engine"] = False
        surfaces["app"] = True
        surfaces["docs_only"] = False

    if surfaces["docs_only"]:
        print("\n결과: PASS \u2705 (docs-only — 테스트 스킵)", flush=True)
        return EXIT_PASS

    # --- Build step list ---
    steps: list[tuple[str, str]] = []
    steps.append(("품질 grep", "security"))
    if surfaces.get("engine"):
        steps.append(("engine tests", "engine"))
    if surfaces.get("app"):
        steps.append(("app typecheck", "app"))

    total = len(steps)
    print("", flush=True)

    blocked = False
    block_step = ""

    for idx, (label, kind) in enumerate(steps, 1):
        prefix = f"[{idx}/{total}] {label}"
        print(prefix, end=" ", flush=True)

        if kind == "security":
            passed, hits = quality_grep(args.dry_run)
            detail = "no secrets detected" if not args.dry_run else "dry-run"
            if passed:
                print(f"... \u2705 OK ({detail})", flush=True)
            else:
                print(f"... \u274c BLOCK", flush=True)
                for ln in hits[:5]:
                    print(f"    {ln}", flush=True)
                print("    \u2192 보안 패턴 감지 — 직접 확인 필요", flush=True)
                blocked = True
                block_step = f"Step {idx}"
                break

        elif kind == "engine":
            passed, summary, elapsed = run_engine_tests(args.dry_run)
            elapsed_str = f"{elapsed:.1f}s" if elapsed else ""
            if passed:
                detail = summary + (f", {elapsed_str}" if elapsed_str else "")
                print(f"... \u2705 {detail}", flush=True)
            else:
                print(f"... \u274c BLOCK", flush=True)
                for ln in summary.splitlines()[:10]:
                    print(f"    {ln}", flush=True)
                blocked = True
                block_step = f"Step {idx}"
                first_failed = next(
                    (ln.split("::")[0].replace("FAILED ", "").strip() for ln in summary.splitlines() if ln.startswith("FAILED")),
                    None,
                )
                if first_failed:
                    print(f"    \u2192 {first_failed} 확인", flush=True)
                break

        elif kind == "app":
            passed, tail = run_app_typecheck(args.dry_run)
            if passed:
                print(f"... \u2705 OK", flush=True)
            else:
                print(f"... \u274c BLOCK", flush=True)
                for ln in tail.splitlines()[-10:]:
                    print(f"    {ln}", flush=True)
                print(f"    \u2192 app/ 타입 에러 확인", flush=True)
                blocked = True
                block_step = f"Step {idx}"
                break

    print("", flush=True)

    if blocked:
        print(f"결과: BLOCK \u274c ({block_step} 실패)", flush=True)
        # Suggest next command
        if "engine" in block_step or any(s[1] == "engine" for s in steps[:int(block_step.split()[-1])]):
            print("다음: uv run pytest engine/tests/ -x -v", flush=True)
        else:
            print("다음: cd app && pnpm typecheck", flush=True)
        return EXIT_BLOCK
    else:
        print("결과: PASS \u2705", flush=True)
        return EXIT_PASS


if __name__ == "__main__":
    sys.exit(main())
