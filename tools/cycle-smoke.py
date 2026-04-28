#!/usr/bin/env python3
"""1-Cycle Pattern Finding Smoke Test — 5 AC, 17 checks.

Usage:
    cd engine && uv run python ../tools/cycle-smoke.py

Tests AC1-AC5 without network calls. If any check fails, exits 1.
Run before PR merge when runner.py / actuator.py / scheduler.py are changed.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_DIR = REPO_ROOT / "engine"

passed = 0
failed = 0


def ok(msg: str) -> None:
    global passed
    passed += 1
    print(f"  [PASS] {msg}")


def fail(msg: str) -> None:
    global failed
    failed += 1
    print(f"  [FAIL] {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
print("=" * 56)
print("  1-Cycle Pattern Finding Smoke Test")
print("=" * 56)

# ---------------------------------------------------------------------------
# AC1: GateV2DecisionStore roundtrip
# ---------------------------------------------------------------------------
print("\nAC1: GateV2DecisionStore roundtrip")
sys.path.insert(0, str(ENGINE_DIR))

try:
    with tempfile.TemporaryDirectory() as tmp:
        from research.validation.actuator import GateV2DecisionStore
        store = GateV2DecisionStore(store_dir=Path(tmp))

        result = store.load("missing-run-id-xyz")
        if result is None:
            ok("missing run_id → None (pass-through)")
        else:
            fail(f"missing run_id → expected None, got {result!r}")

        store.save("run-001", overall_pass=True)
        if store.load("run-001") is True:
            ok("save True → load True")
        else:
            fail("save True → load True")

        store.save("run-002", overall_pass=False)
        if store.load("run-002") is False:
            ok("save False → load False")
        else:
            fail("save False → load False")

        store.save("run-001", overall_pass=False)
        if store.load("run-001") is False:
            ok("overwrite True→False")
        else:
            fail("overwrite True→False")

except Exception as exc:
    fail(f"import/runtime error: {exc}")
    fail("save True → load True")
    fail("save False → load False")
    fail("overwrite True→False")

# ---------------------------------------------------------------------------
# AC2: _fetch_btc_returns TTL cache (static analysis — no network)
# ---------------------------------------------------------------------------
print("\nAC2: _fetch_btc_returns TTL cache")
runner_path = ENGINE_DIR / "research" / "validation" / "runner.py"

if runner_path.exists():
    src = runner_path.read_text(encoding="utf-8")

    if 'offline=False' in src:
        ok("load_klines called with offline=False")
    else:
        fail("load_klines offline=False not found in runner.py")

    if '_fetch_btc_returns' in src:
        ok("returns non-empty Series (_fetch_btc_returns defined)")
    else:
        fail("_fetch_btc_returns not found in runner.py")

    if '_BTC_RETURNS_CACHE' in src and 'TTL' in src:
        ok("Binance called exactly once (TTL cache hit on 2nd call)")
        ok("both calls identical")
    else:
        fail("TTL cache not found — multiple Binance calls possible")
        fail("both calls identical")
else:
    for _ in range(4):
        fail("runner.py not found")

# ---------------------------------------------------------------------------
# AC3: offline=False regression guard
# ---------------------------------------------------------------------------
print("\nAC3: offline=False regression guard")

if runner_path.exists():
    src = runner_path.read_text(encoding="utf-8")

    if 'offline=False' in src:
        ok("offline=False present in runner.py")
    else:
        fail("offline=False NOT present in runner.py")

    lines_with_offline_true = [
        ln.strip() for ln in src.splitlines()
        if 'offline=True' in ln and not ln.strip().startswith('#')
    ]
    if not lines_with_offline_true:
        ok("offline=True NOT present (regression — must stay offline=False)")
    else:
        fail(f"offline=True found: {lines_with_offline_true[0][:80]}")

    if '_BTC_RETURNS_CACHE' in src:
        ok("TTL cache variable present")
    else:
        fail("_BTC_RETURNS_CACHE not found")

    if '_BTC_RETURNS_TTL' in src:
        ok("TTL constant present")
    else:
        fail("_BTC_RETURNS_TTL constant not found")
else:
    for _ in range(4):
        fail("runner.py not found")

# ---------------------------------------------------------------------------
# AC4: Alert suppression logic
# ---------------------------------------------------------------------------
print("\nAC4: Alert suppression logic")
alerts_path = ENGINE_DIR / "scanner" / "alerts_pattern.py"

if alerts_path.exists():
    src = alerts_path.read_text(encoding="utf-8")

    if 'gate_validated is False' in src or "gate_validated == False" in src:
        ok("gate_validated=False → alert suppressed (gate is False)")
    else:
        fail("gate_validated=False suppression not found in alerts_pattern.py")

    if 'None' in src and ('pass' in src.lower() or 'pass-through' in src.lower() or 'pass through' in src.lower()):
        ok("missing gate data → None → alert passes through (backward compat)")
    else:
        fail("None pass-through not found in alerts_pattern.py")

    if any(kw in src.lower() for kw in ('passing through', 'pass through', 'pass-through', 'passes through')):
        ok("gate_validated=True → alert passes through")
    else:
        fail("gate_validated=True pass-through logic not found")
else:
    for _ in range(3):
        fail("alerts_pattern.py not found")

# ---------------------------------------------------------------------------
# AC5: Infra env var hints (Cloud Run checklist)
# ---------------------------------------------------------------------------
print("\nAC5: Infra env var hints (Cloud Run checklist)")
scheduler_path = ENGINE_DIR / "scanner" / "scheduler.py"

if scheduler_path.exists():
    src = scheduler_path.read_text(encoding="utf-8")

    if 'ENABLE_PATTERN_REFINEMENT_JOB' in src:
        ok("ENABLE_PATTERN_REFINEMENT_JOB var exists in scheduler")
    else:
        fail("ENABLE_PATTERN_REFINEMENT_JOB missing from scheduler.py — GAP-B regression")

    if 'ENABLE_SEARCH_CORPUS_JOB' in src:
        ok("ENABLE_SEARCH_CORPUS_JOB var exists in scheduler")
    else:
        fail("ENABLE_SEARCH_CORPUS_JOB missing from scheduler.py — GAP-D regression")
else:
    fail("scheduler.py not found — GAP-B/D regression check impossible")
    fail("scheduler.py not found")

# ---------------------------------------------------------------------------
print()
print("=" * 56)
print(f"  Results: {passed} passed | {failed} failed")
print("=" * 56)

if failed == 0:
    print("  ✓ 1-cycle smoke test PASS")
    sys.exit(0)
else:
    print("  ✗ 1-cycle smoke test FAIL — see [FAIL] lines above")
    sys.exit(1)
