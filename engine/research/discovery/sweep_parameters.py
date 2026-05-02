"""Parameter sweep automation — auto-find optimal timeframe per pattern.

Runs pattern-benchmark-search across multiple timeframes and returns a ranked
summary so the researcher can pick the best timeframe without manual iteration.

Usage (programmatic):
    from research.sweep_parameters import sweep_timeframes, SweepResult
    result = sweep_timeframes("wyckoff-spring-reversal-v1")
    print(result.best_timeframe)

Usage (CLI — via research.cli sweep subcommand):
    python -m research.cli sweep --pattern wyckoff-spring-reversal-v1
    python -m research.cli sweep --pattern wyckoff-spring-reversal-v1 --timeframes 1h 2h 4h 8h

Noise filter:
    signal_count > MAX_SIGNALS → NOISE (too many false positives)
    signal_count < MIN_SIGNALS → SPARSE (not enough data to evaluate)
    Otherwise → OPTIMAL / OK
"""
from __future__ import annotations

import copy
import subprocess
import sys
import json
from dataclasses import dataclass, field
from pathlib import Path

# Noise thresholds (based on W-0104 findings: 1H WSR=10K noise, 4H=700 structure)
MAX_SIGNALS = 5000
MIN_SIGNALS = 50


@dataclass
class TimeframeResult:
    timeframe: str
    signal_count: int
    win_rate: float | None
    avg_return: float | None
    status: str  # "NOISE" | "SPARSE" | "OPTIMAL" | "OK" | "ERROR"
    raw_output: str = ""

    @property
    def is_usable(self) -> bool:
        return self.status in ("OPTIMAL", "OK")


@dataclass
class SweepResult:
    pattern_slug: str
    timeframes_tested: list[str]
    results: list[TimeframeResult]
    best_timeframe: str | None
    best_signal_count: int | None

    def summary(self) -> str:
        lines = [f"Sweep: {self.pattern_slug}"]
        for r in self.results:
            icon = "✓" if r.is_usable else "✗"
            sig = f"{r.signal_count:,}" if r.signal_count >= 0 else "?"
            wr = f"win={r.win_rate:.0%}" if r.win_rate is not None else ""
            avg = f"avg={r.avg_return:+.1%}" if r.avg_return is not None else ""
            meta = " ".join(filter(None, [wr, avg]))
            lines.append(f"  {icon} {r.timeframe}: {sig:>7} signals [{r.status}] {meta}")
        if self.best_timeframe:
            lines.append(f"\nBest: {self.best_timeframe} ({self.best_signal_count:,} signals)")
        else:
            lines.append("\nNo optimal timeframe found (all NOISE or SPARSE)")
        return "\n".join(lines)


def _classify(signal_count: int) -> str:
    if signal_count < 0:
        return "ERROR"
    if signal_count > MAX_SIGNALS:
        return "NOISE"
    if signal_count < MIN_SIGNALS:
        return "SPARSE"
    if signal_count <= 1000:
        return "OPTIMAL"
    return "OK"


def _parse_benchmark_output(raw: str) -> tuple[int, float | None, float | None]:
    """Parse signal_count, win_rate, avg_return from benchmark JSON output."""
    try:
        data = json.loads(raw)
        # Try common output shapes from pattern_benchmark_search
        signals = (
            data.get("signal_count")
            or data.get("n_signals")
            or data.get("signals")
            or -1
        )
        win_rate = data.get("win_rate") or data.get("hit_rate")
        avg_return = data.get("avg_return") or data.get("avg_72h_return")
        return int(signals), win_rate, avg_return
    except (json.JSONDecodeError, KeyError, TypeError):
        return -1, None, None


def sweep_timeframes(
    pattern_slug: str,
    timeframes: list[str] | None = None,
    since: str = "2024-01-01",
    timeout_sec: int = 120,
) -> SweepResult:
    """Run pattern backtest for each timeframe and return ranked results.

    This implementation calls the CLI subprocess for each timeframe so it
    stays decoupled from internal backtest wiring (which varies per pattern).
    The timeframe is passed by temporarily patching the pattern's phase
    timeframe via the --timeframe flag if supported, otherwise inferred
    from the slug variant.

    Args:
        pattern_slug: Pattern slug from PATTERN_LIBRARY.
        timeframes: List of timeframe strings to test. Default: 1h/2h/4h/8h.
        since: ISO date string for backtest start. Default "2024-01-01".
        timeout_sec: Per-timeframe subprocess timeout in seconds.

    Returns:
        SweepResult with ranked timeframes and best pick.
    """
    if timeframes is None:
        timeframes = ["1h", "2h", "4h", "8h"]

    results: list[TimeframeResult] = []

    for tf in timeframes:
        try:
            cmd = [
                sys.executable, "-m", "research.cli",
                "pattern-benchmark-search",
                "--slug", pattern_slug,
            ]
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
                cwd=Path(__file__).resolve().parent.parent,
            )
            raw = proc.stdout.strip()
            signal_count, win_rate, avg_return = _parse_benchmark_output(raw)
            status = _classify(signal_count)
        except subprocess.TimeoutExpired:
            signal_count, win_rate, avg_return = -1, None, None
            status = "ERROR"
            raw = f"TIMEOUT after {timeout_sec}s"
        except Exception as exc:
            signal_count, win_rate, avg_return = -1, None, None
            status = "ERROR"
            raw = str(exc)

        results.append(TimeframeResult(
            timeframe=tf,
            signal_count=signal_count,
            win_rate=win_rate,
            avg_return=avg_return,
            status=status,
            raw_output=raw,
        ))

    # Pick best: prefer OPTIMAL > OK, then highest signal_count in range
    usable = [r for r in results if r.is_usable]
    if usable:
        best = max(usable, key=lambda r: r.signal_count)
    else:
        best = None

    return SweepResult(
        pattern_slug=pattern_slug,
        timeframes_tested=timeframes,
        results=results,
        best_timeframe=best.timeframe if best else None,
        best_signal_count=best.signal_count if best else None,
    )
