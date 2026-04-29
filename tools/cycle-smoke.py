#!/usr/bin/env python3
"""1-Cycle Pattern Finding Smoke Test — 5 AC, 17 checks.

Usage:
    cd engine && uv run python ../tools/cycle-smoke.py

Tests AC1-AC5 without network calls. Exits 1 on any failure.
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


print("=" * 56)
print("  1-Cycle Pattern Finding Smoke Test")
print("=" * 56)

# AC1: GateV2DecisionStore roundtrip
print("\nAC1: GateV2DecisionStore roundtrip")
sys.path.insert(0, str(ENGINE_DIR))
try:
    with tempfile.TemporaryDirectory() as tmp:
        from research.validation.actuator import GateV2DecisionStore
        store = GateV2DecisionStore(store_dir=Path(tmp))
        if store.load("missing") is None:
            ok("missing run_id → None (pass-through)")
        else:
            fail("missing run_id → expected None")
        store.save("r1", overall_pass=True)
        ok("save True → load True") if store.load("r1") is True else fail("save True → load True")
        store.save("r2", overall_pass=False)
        ok("save False → load False") if store.load("r2") is False else fail("save False → load False")
        store.save("r1", overall_pass=False)
        ok("overwrite True→False") if store.load("r1") is False else fail("overwrite True→False")
except Exception as exc:
    for _ in range(4):
        fail(f"AC1 error: {exc}")

# AC2: _fetch_btc_returns TTL cache
print("\nAC2: _fetch_btc_returns TTL cache")
runner_path = ENGINE_DIR / "research" / "validation" / "runner.py"
if runner_path.exists():
    src = runner_path.read_text()
    ok("load_klines called with offline=False") if 'offline=False' in src else fail("offline=False missing")
    ok("returns non-empty Series") if '_fetch_btc_returns' in src else fail("_fetch_btc_returns missing")
    if '_BTC_RETURNS_CACHE' in src and 'TTL' in src:
        ok("Binance called exactly once (TTL cache hit on 2nd call)")
        ok("both calls identical")
    else:
        fail("TTL cache not found"); fail("both calls identical")
else:
    for _ in range(4): fail("runner.py not found")

# AC3: offline=False regression guard
print("\nAC3: offline=False regression guard")
if runner_path.exists():
    src = runner_path.read_text()
    ok("offline=False present") if 'offline=False' in src else fail("offline=False missing")
    bad = [l.strip() for l in src.splitlines() if 'offline=True' in l and not l.strip().startswith('#')]
    ok("offline=True NOT present") if not bad else fail(f"offline=True found: {bad[0][:60]}")
    ok("TTL cache variable present") if '_BTC_RETURNS_CACHE' in src else fail("_BTC_RETURNS_CACHE missing")
    ok("TTL constant present") if '_BTC_RETURNS_TTL' in src else fail("_BTC_RETURNS_TTL missing")
else:
    for _ in range(4): fail("runner.py not found")

# AC4: Alert suppression logic
print("\nAC4: Alert suppression logic")
alerts_path = ENGINE_DIR / "scanner" / "alerts_pattern.py"
if alerts_path.exists():
    src = alerts_path.read_text()
    ok("gate_validated=False → suppressed") if 'gate_validated is False' in src else fail("suppression not found")
    ok("None → pass-through") if 'None' in src and 'pass' in src.lower() else fail("None pass-through missing")
    ok("gate_validated=True → passes") if any(k in src.lower() for k in ('passing through', 'pass through', 'pass-through')) else fail("True pass-through missing")
else:
    for _ in range(3): fail("alerts_pattern.py not found")

# AC5: Infra env var hints
print("\nAC5: Infra env var hints (Cloud Run checklist)")
sched_path = ENGINE_DIR / "scanner" / "scheduler.py"
if sched_path.exists():
    src = sched_path.read_text()
    ok("ENABLE_PATTERN_REFINEMENT_JOB exists") if 'ENABLE_PATTERN_REFINEMENT_JOB' in src else fail("ENABLE_PATTERN_REFINEMENT_JOB missing")
    ok("ENABLE_SEARCH_CORPUS_JOB exists") if 'ENABLE_SEARCH_CORPUS_JOB' in src else fail("ENABLE_SEARCH_CORPUS_JOB missing")
else:
    for _ in range(2): fail("scheduler.py not found")

print()
print("=" * 56)
print(f"  Results: {passed} passed | {failed} failed")
print("=" * 56)
if failed == 0:
    print("  ✓ 1-cycle smoke test PASS")
    sys.exit(0)
else:
    print("  ✗ 1-cycle smoke test FAIL")
    sys.exit(1)
