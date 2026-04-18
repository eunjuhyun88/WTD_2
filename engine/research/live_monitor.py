"""Live pattern phase monitor — W-0089.

Scans a universe of symbols against a promoted pattern variant and reports
which symbols are currently in ACCUMULATION (entry candidates) or approaching
it (REAL_DUMP watch list).

Usage:
    from research.live_monitor import scan_universe_live, LiveScanResult
    results = scan_universe_live(UNIVERSE, 'tradoor-oi-reversal-v1__canonical')
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from data_cache.loader import load_klines
from research.pattern_search import (
    BenchmarkCase,
    PatternVariantSpec,
    build_variant_pattern,
    evaluate_variant_on_case,
)

_EXPERIMENT_LOG = (
    Path(__file__).parent.parent.parent
    / "research" / "experiments" / "experiment_log.jsonl"
)

DEFAULT_UNIVERSE = [
    "AAVEUSDT", "DOGEUSDT", "SUIUSDT", "SEIUSDT", "APEUSDT",
    "JUPUSDT", "ORDIUSDT", "TIAUSDT", "ENAUSDT", "STRKUSDT",
    "WIFUSDT", "VIRTUALUSDT", "TRUMPUSDT", "PENGUUSDT",
    "JTOUSDT", "KAITOUSDT", "ONDOUSDT", "1000BONKUSDT",
    "KOMAUSDT", "PYTHUSDT", "DYMUSDT", "AIXBTUSDT",
    "TRADOORUSDT", "ALTUSDT", "PTBUSDT",
    "FARTCOINUSDT", "ARCUSDT", "ANIMEUSDT",
    "1000FLOKIUSDT", "1000PEPEUSDT",
]

WATCH_PHASES = {"ACCUMULATION", "REAL_DUMP"}
PHASE_ORDER = {
    "ACCUMULATION": 0, "REAL_DUMP": 1,
    "ARCH_ZONE": 2, "FAKE_DUMP": 3, "BREAKOUT": 4,
}


@dataclass
class LiveScanResult:
    symbol: str
    phase: str
    path: str
    entry_hit: bool
    fwd_peak_pct: float | None
    realistic_pct: float | None
    phase_fidelity: float
    scanned_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_entry_candidate(self) -> bool:
        return self.phase == "ACCUMULATION" and self.entry_hit

    @property
    def is_watch(self) -> bool:
        return self.phase in WATCH_PHASES

    def to_dict(self) -> dict:
        d = asdict(self)
        d["scanned_at"] = self.scanned_at.isoformat()
        return d


def scan_universe_live(
    universe: list[str] | None = None,
    variant_slug: str = "tradoor-oi-reversal-v1__canonical",
    pattern_slug: str = "tradoor-oi-reversal-v1",
    timeframe: str = "1h",
    window_bars: int = 120,
    staleness_hours: int = 48,
    warmup_bars: int = 240,
    log_to_experiment: bool = True,
) -> list[LiveScanResult]:
    """Scan universe for active phase signals.

    Args:
        universe: list of symbols to scan (default: DEFAULT_UNIVERSE)
        variant_slug: promoted variant to evaluate
        pattern_slug: pattern family
        timeframe: bar size (default 1h)
        window_bars: lookback bars for phase detection (default 120 = 5 days)
        staleness_hours: skip symbols whose latest bar is older than this
        log_to_experiment: append summary to experiment_log.jsonl

    Returns:
        List of LiveScanResult sorted by phase priority (ACCUMULATION first).
    """
    if universe is None:
        universe = DEFAULT_UNIVERSE

    now = datetime.now(timezone.utc)
    variant = PatternVariantSpec(
        pattern_slug=pattern_slug,
        variant_slug=variant_slug,
        timeframe=timeframe,
    )
    pattern = build_variant_pattern(pattern_slug, variant)

    results: list[LiveScanResult] = []

    for sym in universe:
        try:
            k = load_klines(sym, timeframe, offline=True)
        except Exception:
            continue
        if k is None or k.empty:
            continue

        latest = pd.Timestamp(k.index[-1]).to_pydatetime()
        if latest.tzinfo is None:
            latest = latest.replace(tzinfo=timezone.utc)
        if (now - latest).total_seconds() > staleness_hours * 3600:
            continue

        end_at = latest
        start_at = end_at - timedelta(hours=window_bars)
        case = BenchmarkCase(
            symbol=sym,
            timeframe=timeframe,
            start_at=start_at,
            end_at=end_at,
            expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"],
        )
        try:
            r = evaluate_variant_on_case(pattern, case, timeframe=timeframe, warmup_bars=warmup_bars)
        except Exception:
            continue

        path_str = "→".join(r.observed_phase_path) if r.observed_phase_path else "(idle)"
        results.append(LiveScanResult(
            symbol=sym,
            phase=r.current_phase or "IDLE",
            path=path_str,
            entry_hit=bool(r.entry_hit),
            fwd_peak_pct=r.forward_peak_return_pct,
            realistic_pct=r.realistic_forward_peak_return_pct,
            phase_fidelity=r.phase_fidelity or 0.0,
            scanned_at=now,
        ))

    results.sort(key=lambda x: (
        PHASE_ORDER.get(x.phase, 9),
        not x.entry_hit,
        -(x.fwd_peak_pct or -999),
    ))

    if log_to_experiment and _EXPERIMENT_LOG.exists():
        entry_candidates = [r for r in results if r.is_entry_candidate]
        watch_list = [r for r in results if r.is_watch and not r.is_entry_candidate]
        log_entry = {
            "timestamp": now.strftime("%Y%m%d_%H%M%S"),
            "name": "live-phase-scan",
            "params": {
                "pattern": variant_slug,
                "universe_size": len(universe),
                "window_bars": window_bars,
                "staleness_hours": staleness_hours,
            },
            "metrics": {
                "symbols_scanned": len(results),
                "entry_candidates": len(entry_candidates),
                "watch_list": len(watch_list),
                "entry_candidate_symbols": [r.symbol for r in entry_candidates],
                "watch_symbols": [r.symbol for r in watch_list],
            },
            "artifacts": [],
            "dir": "",
        }
        with open(_EXPERIMENT_LOG, "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    return results


def print_scan_report(results: list[LiveScanResult], title: str = "LIVE PHASE SCAN") -> None:
    """Print a formatted scan report to stdout."""
    now = results[0].scanned_at if results else datetime.now(timezone.utc)
    print("=" * 90)
    print(f"{title}  —  {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 90)
    print()
    print(f"{'SYMBOL':<22} {'PHASE':<14} {'PATH':<38} {'ENTRY':<5} {'FWD%':>7} {'REAL%':>7}")
    print("-" * 95)

    for r in results:
        fwd  = f"{r.fwd_peak_pct:+.1f}"  if r.fwd_peak_pct  is not None else "  n/a"
        real = f"{r.realistic_pct:+.1f}" if r.realistic_pct is not None else "  n/a"
        entry = "YES" if r.entry_hit else "no"
        flag = " <-- WATCH" if r.phase in WATCH_PHASES else ""
        print(f"{r.symbol:<22} {r.phase:<14} {r.path[:37]:<38} {entry:<5} {fwd:>7} {real:>7}{flag}")

    print()
    entry_candidates = [r for r in results if r.is_entry_candidate]
    watch_list = [r for r in results if r.phase == "REAL_DUMP"]
    print(f"SUMMARY: {len(results)} 심볼 스캔")
    print(f"  ACCUMULATION (진입 후보): {len(entry_candidates)}")
    print(f"  REAL_DUMP (주시):         {len(watch_list)}")

    if entry_candidates:
        print()
        print("  *** 진입 후보 ***")
        for r in entry_candidates:
            fwd  = f"{r.fwd_peak_pct:+.1f}%"  if r.fwd_peak_pct  is not None else "n/a"
            real = f"{r.realistic_pct:+.1f}%" if r.realistic_pct is not None else "n/a"
            print(f"    {r.symbol}  fwd_peak={fwd}  realistic={real}")


if __name__ == "__main__":
    results = scan_universe_live()
    print_scan_report(results)
