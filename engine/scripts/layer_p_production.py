"""Layer P production validation — runs against real Supabase phase_transitions.

Fetches REVERSAL_SIGNAL transitions from production Supabase, deduplicates
to 1h buckets per symbol, fetches forward returns from Binance, and runs
Welch t-test + bootstrap CI to validate signal quality.

Usage:
    cd engine
    uv run python -m scripts.layer_p_production
    uv run python -m scripts.layer_p_production --signal REVERSAL_SIGNAL --days 30 --horizon 4

Environment:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (or .env.local / .env)
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("layer_p_production")

_BINANCE_FUTURES = "https://fapi.binance.com"
_UA = "cogochi-layer-p/1.0"


# ── Env loading ───────────────────────────────────────────────────────────────

def _load_env() -> tuple[str, str]:
    for env_file in [".env.local", ".env"]:
        p = Path(env_file)
        if not p.exists():
            p = Path("..") / env_file
        if p.exists():
            for line in p.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        log.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        sys.exit(1)
    return url, key


# ── Supabase query ────────────────────────────────────────────────────────────

def _supabase_get(url: str, key: str, table: str, params: dict) -> list[dict]:
    query = urllib.parse.urlencode(params)
    endpoint = f"{url}/rest/v1/{table}?{query}"
    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "User-Agent": _UA,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_transitions(url: str, key: str, signal: str, days: int) -> list[dict]:
    since = (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()
    rows = _supabase_get(url, key, "phase_transitions", {
        "select": "symbol,to_phase,occurred_at",
        "to_phase": f"eq.{signal}",
        "occurred_at": f"gte.{since}",
        "limit": "5000",
    })
    log.info("fetched %d raw transitions for signal=%s (last %d days)", len(rows), signal, days)
    return rows


# ── Deduplication ─────────────────────────────────────────────────────────────

def dedup_1h(rows: list[dict]) -> list[dict]:
    """Keep first signal per (symbol, 1h bucket) to reduce autocorrelation."""
    seen: set[tuple[str, str]] = set()
    result = []
    for r in sorted(rows, key=lambda x: x["occurred_at"]):
        ts = r["occurred_at"][:13]  # "2026-04-28T14"
        key = (r["symbol"], ts)
        if key not in seen:
            seen.add(key)
            result.append(r)
    log.info("deduped: %d → %d signals (1h bucket)", len(rows), len(result))
    return result


# ── Binance klines ────────────────────────────────────────────────────────────

def fetch_klines_binance(symbol: str, start_ms: int, end_ms: int) -> list:
    path = (
        f"/fapi/v1/klines?symbol={symbol}&interval=1h"
        f"&startTime={start_ms}&endTime={end_ms}&limit=500"
    )
    url = f"{_BINANCE_FUTURES}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("klines fetch failed for %s: %s", symbol, exc)
        return []


def get_close_at(symbol: str, ts_iso: str, close_cache: dict) -> float | None:
    """Get close price nearest to ts_iso. Caches by (symbol, day)."""
    try:
        dt = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
    except Exception:
        return None
    day_key = (symbol, dt.date().isoformat())
    if day_key not in close_cache:
        start_ms = int((dt - timedelta(hours=1)).timestamp() * 1000)
        end_ms = int((dt + timedelta(hours=2)).timestamp() * 1000)
        bars = fetch_klines_binance(symbol, start_ms, end_ms)
        if not bars:
            close_cache[day_key] = {}
        else:
            close_cache[day_key] = {b[0]: float(b[4]) for b in bars}
        time.sleep(0.05)

    ts_ms = int(dt.timestamp() * 1000)
    prices = close_cache.get(day_key, {})
    if not prices:
        return None
    closest = min(prices.keys(), key=lambda k: abs(k - ts_ms))
    return prices[closest]


def compute_forward_return(symbol: str, ts_iso: str, horizon_h: int, close_cache: dict) -> float | None:
    """Return = (price_t+horizon - price_t) / price_t."""
    try:
        dt = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
    except Exception:
        return None
    future_iso = (dt + timedelta(hours=horizon_h)).isoformat()

    p0 = get_close_at(symbol, ts_iso, close_cache)
    p1 = get_close_at(symbol, future_iso, close_cache)

    if p0 is None or p1 is None or p0 == 0:
        return None
    return (p1 - p0) / p0


# ── Stats ─────────────────────────────────────────────────────────────────────

def welch_t(x: list[float]) -> tuple[float, float]:
    """Welch t-test: mean vs 0 (B0 random baseline)."""
    n = len(x)
    if n < 4:
        return 0.0, 1.0
    mean = sum(x) / n
    var = sum((v - mean) ** 2 for v in x) / (n - 1)
    se = math.sqrt(var / n)
    t = mean / se if se > 0 else 0.0
    return t, mean


def bootstrap_ci(x: list[float], n_boot: int = 1000) -> tuple[float, float]:
    import random
    n = len(x)
    boot_means = sorted(
        sum(random.choices(x, k=n)) / n for _ in range(n_boot)
    )
    lo = boot_means[int(0.025 * n_boot)]
    hi = boot_means[int(0.975 * n_boot)]
    return lo, hi


# ── Main ──────────────────────────────────────────────────────────────────────

def run(signal: str, days: int, horizon_h: int) -> None:
    url, key = _load_env()

    # Fetch and dedup
    rows = fetch_transitions(url, key, signal, days)
    if not rows:
        log.error("no transitions found — check signal name and date range")
        sys.exit(1)
    rows = dedup_1h(rows)

    # Compute forward returns
    print(f"\nComputing {horizon_h}h forward returns for {len(rows)} signals...")
    close_cache: dict = {}
    returns: list[float] = []
    skipped = 0
    for i, row in enumerate(rows):
        fwd = compute_forward_return(row["symbol"], row["occurred_at"], horizon_h, close_cache)
        if fwd is not None:
            returns.append(fwd)
        else:
            skipped += 1
        if i % 50 == 0 and i > 0:
            print(f"  ... {i}/{len(rows)} done ({len(returns)} valid)")

    print(f"  Valid returns: {len(returns)}, Skipped: {skipped}")

    if len(returns) < 10:
        log.error("too few valid returns (%d) — cannot run statistics", len(returns))
        sys.exit(1)

    # Stats
    t_stat, mean_ret = welch_t(returns)
    ci_lo, ci_hi = bootstrap_ci(returns)
    hit_long = sum(1 for r in returns if r > 0) / len(returns)
    hit_short = 1 - hit_long

    g1 = abs(t_stat) >= 2.0
    g2 = max(hit_long, hit_short) >= 0.55
    direction = "SHORT" if mean_ret < 0 else "LONG"

    print(f"""
{'=' * 60}
Layer P Production Validation
{'=' * 60}
Signal:       {signal}
Period:       last {days} days
Horizon:      {horizon_h}h forward return
n_signals:    {len(returns)} (deduped 1h bucket)

Results:
  mean return:   {mean_ret * 100:.3f}%
  t-stat:        {t_stat:.2f}
  95% CI:        [{ci_lo * 100:.3f}%, {ci_hi * 100:.3f}%]
  hit_long:      {hit_long:.1%}
  hit_short:     {hit_short:.1%}
  direction:     {direction}

Gates:
  G1 (|t| ≥ 2.0): {"✅ PASS" if g1 else "❌ FAIL"} ({abs(t_stat):.2f})
  G2 (hit ≥ 55%): {"✅ PASS" if g2 else "❌ FAIL"} ({max(hit_long, hit_short):.1%})

Verdict:      {"🚀 PROMOTE" if g1 and g2 else "🔧 REFINE"}
{'=' * 60}
""")


def main() -> None:
    parser = argparse.ArgumentParser(description="Layer P production validation")
    parser.add_argument("--signal", default="REVERSAL_SIGNAL", help="to_phase signal name")
    parser.add_argument("--days", type=int, default=30, help="days of history to pull")
    parser.add_argument("--horizon", type=int, default=4, help="forward return horizon (hours)")
    args = parser.parse_args()
    run(args.signal, args.days, args.horizon)


if __name__ == "__main__":
    main()
