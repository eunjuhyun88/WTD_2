"""W-0099: Pattern Discovery Agent CLI.

Automates the full loop:
  detect_extreme_events → tag_outcomes → filter_predictive
  → auto_build_benchmark_pack → run_benchmark_search → report

Usage
-----
    cd engine
    python -m research.pattern_discovery_agent \\
        --event-type funding_extreme \\
        --pattern-slug funding-flip-reversal-v1 \\
        --min-return 0.10 \\
        --universe-file scanner/universe_lists/dynamic_universe.txt \\
        [--dry-run]

Output
------
    Prints a summary table.
    Saves any newly promoted variants to stdout.
    If --save-pack is given, writes the benchmark pack JSON and re-runs
    benchmark-search automatically.
"""
from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("engine.discovery_agent")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

# Fallback universe when no file is provided
DEFAULT_UNIVERSE = [
    "DYMUSDT", "ORDIUSDT", "STRKUSDT", "KOMAUSDT",
    "ANIMEUSDT", "1000PEPEUSDT", "BONKUSDT", "PENGUUSDT",
    "ONDOUSDT", "AIXBTUSDT",
]


def _load_universe(universe_file: str | None) -> list[str]:
    if universe_file is None:
        return DEFAULT_UNIVERSE
    path = Path(universe_file)
    if not path.exists():
        log.warning("Universe file %s not found — using default universe", path)
        return DEFAULT_UNIVERSE
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def _run_scan(universe: list[str], event_type: str) -> list:
    from research.event_tracker.detector import ExtremeEventDetector
    from research.event_tracker.tracker import OutcomeTracker

    detector = ExtremeEventDetector()
    log.info("Scanning %d symbols for %s events ...", len(universe), event_type)

    if event_type == "funding_extreme":
        events = detector.scan_universe(universe)
    elif event_type == "compression":
        events = []
        for sym in universe:
            events.extend(detector.scan_symbol_klines(sym))
    else:
        raise ValueError(f"Unknown event_type: {event_type}")

    log.info("Detected %d events", len(events))
    return events


def _resolve_and_filter(events: list, min_return: float) -> list:
    from research.event_tracker.tracker import OutcomeTracker

    tracker = OutcomeTracker()
    tracker.append_events(events)
    updated = tracker.update_outcomes()
    log.info("Resolved %d new outcomes", updated)

    predictive = tracker.get_predictive_events(min_return=min_return)
    log.info(
        "Predictive events (return ≥ %.0f%%): %d",
        min_return * 100,
        len(predictive),
    )
    return predictive


def _build_pack(predictive: list, pattern_slug: str) -> dict | None:
    from research.event_tracker.pack_builder import BenchmarkPackBuilder

    if len(predictive) < 2:
        log.warning("Need ≥2 predictive events to build a pack, got %d", len(predictive))
        return None

    builder = BenchmarkPackBuilder()
    try:
        pack = builder.build_from_events(pattern_slug, predictive, n_reference=1, n_holdout=3)
        return pack
    except ValueError as exc:
        log.error("Could not build pack: %s", exc)
        return None


def _run_benchmark_search(pack: dict) -> dict | None:
    """Write pack to disk and call pattern-benchmark-search CLI."""
    from research.event_tracker.pack_builder import BenchmarkPackBuilder

    builder = BenchmarkPackBuilder()
    pack_id = pack.get("benchmark_pack_id", "auto-discovery")
    filename = f"{pack_id}.json"
    saved = builder.save_pack(pack, filename)
    log.info("Saved benchmark pack: %s", saved)

    # Call the existing CLI
    cmd = [
        sys.executable, "-m", "research.pattern_search",
        "--benchmark-pack", str(saved),
        "--output-json",
    ]
    log.info("Running: %s", " ".join(cmd))
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            log.error("benchmark-search failed:\n%s", result.stderr)
            return None
        return json.loads(result.stdout)
    except Exception as exc:  # noqa: BLE001
        log.error("benchmark-search error: %s", exc)
        return None


def _print_report(
    events: list,
    predictive: list,
    pack: dict | None,
    search_result: dict | None,
) -> None:
    print("\n" + "=" * 60)
    print("W-0099 Pattern Discovery Agent — Report")
    print("=" * 60)
    print(f"Total events detected:    {len(events)}")
    print(f"Predictive (≥10% in 72h): {len(predictive)}")

    if predictive:
        print("\nTop predictive events:")
        for ev in sorted(predictive, key=lambda e: e.outcome_72h or 0, reverse=True)[:5]:
            print(
                f"  {ev.symbol:12s}  {ev.event_type:20s}  "
                f"detected={ev.detected_at}  72h={ev.outcome_72h:+.1%}"
            )

    if pack:
        print(f"\nBenchmark pack: {pack.get('benchmark_pack_id')}")
        print(f"Cases: {len(pack.get('cases', []))} ({sum(1 for c in pack.get('cases', []) if c['role']=='reference')} ref + {sum(1 for c in pack.get('cases', []) if c['role']=='holdout')} holdout)")

    if search_result:
        overall = search_result.get("overall_score", "N/A")
        promote = search_result.get("promote_candidate", False)
        variant = search_result.get("best_variant", "N/A")
        print(f"\nbenchmark-search result:")
        print(f"  variant:          {variant}")
        print(f"  overall_score:    {overall}")
        print(f"  promote_candidate:{promote}")
        if promote:
            print("\n✅ NEW PROMOTE CANDIDATE — review and approve in live_monitor.py")
    print("=" * 60)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="W-0099 Pattern Discovery Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--event-type", default="funding_extreme",
                        choices=["funding_extreme", "compression"],
                        help="Type of extreme event to scan for")
    parser.add_argument("--pattern-slug", default="funding-flip-reversal-v1",
                        help="Pattern slug to use for benchmark-search")
    parser.add_argument("--min-return", type=float, default=0.10,
                        help="Minimum 72h return to consider an event predictive (default: 0.10)")
    parser.add_argument("--universe-file", default=None,
                        help="Path to universe file (one symbol per line)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Scan and report without saving pack or running benchmark-search")
    parser.add_argument("--save-pack", action="store_true",
                        help="Save benchmark pack and run benchmark-search")
    args = parser.parse_args(argv)

    universe = _load_universe(args.universe_file)
    events = _run_scan(universe, args.event_type)

    if not events:
        log.info("No events found — nothing to do.")
        return 0

    predictive = _resolve_and_filter(events, args.min_return)

    pack = None
    search_result = None
    if predictive and (args.save_pack or not args.dry_run):
        pack = _build_pack(predictive, args.pattern_slug)
        if pack and args.save_pack:
            search_result = _run_benchmark_search(pack)

    _print_report(events, predictive, pack, search_result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
