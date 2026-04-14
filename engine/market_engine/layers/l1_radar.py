from __future__ import annotations

from market_engine.config import VELOCITY_PROMOTE, VOL_NOISE_FLOOR


def l1_velocity(
    vol_snapshots: list[float],
    window_recent: int = 6,  # 1-min window (6 × 10-sec ticks)
    history: int = 60,  # 10-min baseline
) -> dict:
    """Rolling 1-min volume velocity.

    Returns: {vol_1m, avg_vol_1m, velocity}
    """
    if len(vol_snapshots) < window_recent + 1:
        return {"vol_1m": 0.0, "avg_vol_1m": 1.0, "velocity": 0.0}

    snaps = vol_snapshots
    deltas = [
        max(0.0, snaps[i] - snaps[i - window_recent])
        for i in range(window_recent, len(snaps))
    ]
    vol_1m = deltas[-1] if deltas else 0.0
    avg_vol_1m = sum(deltas[-history:]) / max(len(deltas[-history:]), 1)
    velocity = vol_1m / avg_vol_1m if avg_vol_1m > 0 else 0.0
    return {"vol_1m": vol_1m, "avg_vol_1m": avg_vol_1m, "velocity": round(velocity, 3)}


def l1_rsi_realtime(price_history: list[float], period: int = 14) -> float:
    """Wilder-smoothed RSI from price_history (most-recent last)."""
    if len(price_history) < period + 1:
        return 50.0
    closes = price_history[-(period * 3):]  # keep enough bars for warm-up
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(0.0, d) for d in deltas]
    losses = [max(0.0, -d) for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for g, l in zip(gains[period:], losses[period:]):
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period

    if avg_loss == 0:
        return 100.0
    return round(100 - 100 / (1 + avg_gain / avg_loss), 1)


def should_promote(
    velocity: float,
    vol_1m: float = 0.0,
    threshold: float = VELOCITY_PROMOTE,
) -> bool:
    """Promote symbol to L2 if velocity exceeds threshold and vol is real."""
    return velocity >= threshold and vol_1m >= VOL_NOISE_FLOOR
