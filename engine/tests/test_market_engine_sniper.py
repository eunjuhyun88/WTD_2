"""Tests for market_engine/pipeline.py — SniperGate + SignalHistory.

Covers:
  1. SniperGate.dyn_cvd_target / dyn_whale_tick  — dynamic thresholds
  2. SniperGate.on_trade()                        — CVD accumulation, WHALE signal
  3. SniperGate.is_fakeout()                      — price high + CVD lagging
  4. SniperGate.check_breakout()                  — GOLDEN, SQUEEZE, IMBALANCE
  5. Debounce                                      — same signal type suppressed
  6. Re-arm                                        — SQUEEZE/IMBALANCE after reset window
  7. SignalHistory                                 — rolling window, heat labels
  8. compute_sector_scores()                       — batch aggregation
"""
from __future__ import annotations

import time

import pytest

from market_engine.config import (
    CVD_TARGET_MIN,
    CVD_TARGET_RATIO,
    WHALE_MIN,
    WHALE_RATIO,
    SQUEEZE_RESET_S,
    IMBALANCE_RESET_S,
    GOLDEN_VELOCITY,
    GOLDEN_RSI,
    GOLDEN_IMB,
    GOLDEN_SPREAD,
    SQZ_TICKS,
    SQZ_PCT,
    HOT_THRESHOLD,
    FIRE_THRESHOLD,
)
from market_engine.pipeline import SniperGate, SignalHistory, compute_sector_scores


# ── helpers ───────────────────────────────────────────────────────────────

AVG_VOL = 200_000.0   # $200k/min baseline


def _gate(avg_vol: float = AVG_VOL) -> SniperGate:
    return SniperGate("TESTUSDT", avg_vol)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ─────────────────────────────────────────────────────────────────────────
# 1. Dynamic thresholds
# ─────────────────────────────────────────────────────────────────────────

def test_dyn_cvd_target_uses_floor():
    """When avg_vol is tiny, floor CVD_TARGET_MIN should kick in."""
    gate = _gate(avg_vol=1_000)   # 1000 * 0.15 = 150 < 15_000
    assert gate.dyn_cvd_target == CVD_TARGET_MIN


def test_dyn_cvd_target_scales_with_vol():
    gate = _gate(avg_vol=200_000)
    expected = max(CVD_TARGET_MIN, 200_000 * CVD_TARGET_RATIO)
    assert gate.dyn_cvd_target == expected


def test_dyn_whale_tick_uses_floor():
    gate = _gate(avg_vol=100)
    assert gate.dyn_whale_tick == WHALE_MIN


def test_dyn_whale_tick_scales_with_vol():
    gate = _gate(avg_vol=1_000_000)
    expected = max(WHALE_MIN, 1_000_000 * WHALE_RATIO)
    assert gate.dyn_whale_tick == expected


# ─────────────────────────────────────────────────────────────────────────
# 2. on_trade — CVD accumulation + WHALE signal
# ─────────────────────────────────────────────────────────────────────────

def test_on_trade_buy_increments_cvd():
    gate = _gate()
    gate.on_trade(price=100.0, qty_usdt=1_000.0, is_maker=False, now_ms=_now_ms())
    assert gate.cvd == pytest.approx(1_000.0)


def test_on_trade_sell_decrements_cvd():
    gate = _gate()
    gate.on_trade(price=100.0, qty_usdt=1_000.0, is_maker=True, now_ms=_now_ms())
    assert gate.cvd == pytest.approx(-1_000.0)


def test_on_trade_max_cvd_tracks_peak():
    gate = _gate()
    gate.on_trade(100.0, 5_000.0, is_maker=False, now_ms=_now_ms())
    gate.on_trade(100.0, 2_000.0, is_maker=True,  now_ms=_now_ms() + 1)
    assert gate.max_cvd == pytest.approx(5_000.0)


def test_on_trade_whale_buy_fires():
    gate = _gate(avg_vol=100_000)
    threshold = gate.dyn_whale_tick
    result = gate.on_trade(
        price=100.0,
        qty_usdt=threshold + 1,
        is_maker=False,        # buyer is taker → BUY
        now_ms=_now_ms(),
    )
    assert result is not None
    assert result["type"] == "WHALE"
    assert result["side"] == "BUY"


def test_on_trade_whale_sell_fires():
    gate = _gate(avg_vol=100_000)
    threshold = gate.dyn_whale_tick
    result = gate.on_trade(
        price=100.0,
        qty_usdt=threshold + 1,
        is_maker=True,         # buyer is maker → SELL
        now_ms=_now_ms(),
    )
    assert result is not None
    assert result["type"] == "WHALE"
    assert result["side"] == "SELL"


def test_on_trade_whale_debounced():
    """Second WHALE within debounce window → no signal."""
    gate = _gate(avg_vol=100_000)
    threshold = gate.dyn_whale_tick
    ms = _now_ms()
    gate.on_trade(100.0, threshold + 1, is_maker=False, now_ms=ms)
    result2 = gate.on_trade(100.0, threshold + 1, is_maker=False, now_ms=ms + 100)
    assert result2 is None


# ─────────────────────────────────────────────────────────────────────────
# 3. is_fakeout
# ─────────────────────────────────────────────────────────────────────────

def test_is_fakeout_true_when_price_high_cvd_low():
    gate = _gate()
    # Push max_price and max_cvd up
    gate.max_price = 100.0
    gate.max_cvd   = 10_000.0
    gate.cvd       = 5_000.0    # < 10_000 * 0.80 = 8_000 → lagging
    assert gate.is_fakeout(current_price=99.95) is True   # 99.95 >= 100 * 0.999


def test_is_fakeout_false_when_cvd_healthy():
    gate = _gate()
    gate.max_price = 100.0
    gate.max_cvd   = 10_000.0
    gate.cvd       = 9_000.0    # >= 8_000 → not lagging
    assert gate.is_fakeout(current_price=99.95) is False


def test_is_fakeout_false_when_price_not_at_high():
    gate = _gate()
    gate.max_price = 100.0
    gate.max_cvd   = 10_000.0
    gate.cvd       = 5_000.0
    assert gate.is_fakeout(current_price=95.0) is False    # not at high


# ─────────────────────────────────────────────────────────────────────────
# 4. check_breakout — GOLDEN signal
# ─────────────────────────────────────────────────────────────────────────

def _prime_golden(gate: SniperGate, cvd: float = None) -> None:
    """Set up gate state to satisfy all 4 GOLDEN conditions."""
    target = gate.dyn_cvd_target
    gate.cvd = (cvd if cvd is not None else target + 1.0)
    # Imbalance history: 5 values all >= GOLDEN_IMB
    for _ in range(5):
        gate.on_depth(bid_total=GOLDEN_IMB + 0.5, ask_total=1.0)


def test_golden_signal_all_4_conditions():
    gate = _gate()
    _prime_golden(gate)
    result = gate.check_breakout(
        velocity=GOLDEN_VELOCITY + 0.5,
        rsi=GOLDEN_RSI + 5.0,
        current_price=50.0,
        is_price_rising=True,
        btc_velocity=1.0,       # spread = vel/btc_vel = 4.0 >= 1.2
        now_ms=_now_ms(),
    )
    assert result is not None
    assert result["type"] == "GOLDEN"
    assert result["score"] == 4   # all 4 conditions met


def test_golden_signal_3_conditions_sufficient():
    gate = _gate()
    target = gate.dyn_cvd_target
    gate.cvd = target + 1.0
    # No imbalance history → cond_c = False; also btc_velocity=0 → cond_d=False
    # cond_a + cond_b = 2 only → NOT enough
    result = gate.check_breakout(
        velocity=GOLDEN_VELOCITY + 0.5,
        rsi=GOLDEN_RSI + 5.0,
        current_price=50.0,
        is_price_rising=False,
        btc_velocity=0.0,
        now_ms=_now_ms(),
    )
    assert result is None   # only 2/4 conditions


def test_golden_signal_debounced_on_repeat():
    """After GOLDEN fires, second call within debounce window returns no GOLDEN.
    Pass is_price_rising=False so cond_c=False → IMBALANCE also won't fire."""
    gate = _gate()
    _prime_golden(gate)
    ms = _now_ms()
    gate.check_breakout(GOLDEN_VELOCITY + 0.5, GOLDEN_RSI + 5.0, 50.0, True, 1.0, ms)
    # is_price_rising=False disables cond_c (avg_imb & rising) → no IMBALANCE fallback
    result2 = gate.check_breakout(GOLDEN_VELOCITY + 0.5, GOLDEN_RSI + 5.0, 50.0, False, 1.0, ms + 100)
    assert result2 is None  # GOLDEN debounced; IMBALANCE not triggered


# ─────────────────────────────────────────────────────────────────────────
# 5. check_breakout — SQUEEZE signal
# ─────────────────────────────────────────────────────────────────────────

def _prime_squeeze(gate: SniperGate, base_price: float = 100.0) -> None:
    """Fill price history with tight range + CVD above half-target."""
    target = gate.dyn_cvd_target
    gate.cvd = target * 0.6   # > target * 0.5 (CVD_SQZ_RATIO)
    # SQZ_TICKS + some buffer prices in tight range
    for i in range(SQZ_TICKS + 4):
        gate._price_history.append(base_price + (i % 3) * 0.05)  # tiny oscillation


def test_squeeze_fires_on_tight_range():
    gate = _gate()
    _prime_squeeze(gate)
    result = gate.check_breakout(
        velocity=0.0, rsi=40.0,          # GOLDEN conditions NOT met
        current_price=100.0,
        is_price_rising=False,
        btc_velocity=1.0,
        now_ms=_now_ms(),
    )
    # Range = (100.10 - 100.00) / 100.00 * 100 = 0.10% ≤ 0.8% → SQUEEZE
    assert result is not None
    assert result["type"] == "SQUEEZE"


def test_squeeze_does_not_refire_until_rearmed():
    gate = _gate()
    _prime_squeeze(gate)
    ms = _now_ms()
    gate.check_breakout(0.0, 40.0, 100.0, False, 1.0, ms)
    result2 = gate.check_breakout(0.0, 40.0, 100.0, False, 1.0, ms + 60_000)
    assert result2 is None   # alerted → blocked even after SQUEEZE debounce expires


def test_squeeze_rearmed_after_reset_window():
    gate = _gate()
    _prime_squeeze(gate)
    ms = _now_ms()
    gate.check_breakout(0.0, 40.0, 100.0, False, 1.0, ms)
    # Simulate time passing beyond SQUEEZE_RESET_S
    future_ms = ms + (SQUEEZE_RESET_S + 1) * 1_000
    result2 = gate.check_breakout(0.0, 40.0, 100.0, False, 1.0, future_ms)
    assert result2 is not None
    assert result2["type"] == "SQUEEZE"


# ─────────────────────────────────────────────────────────────────────────
# 6. check_breakout — IMBALANCE signal
# ─────────────────────────────────────────────────────────────────────────

def test_imbalance_fires_when_avg_imb_high():
    gate = _gate()
    # No CVD → GOLDEN won't fire; no SQUEEZE candidate
    for _ in range(5):
        gate.on_depth(bid_total=GOLDEN_IMB + 0.5, ask_total=1.0)
    result = gate.check_breakout(
        velocity=0.0, rsi=40.0,
        current_price=100.0,
        is_price_rising=True,    # required for cond_c
        btc_velocity=1.0,
        now_ms=_now_ms(),
    )
    assert result is not None
    assert result["type"] == "IMBALANCE"


def test_imbalance_rearmed_after_reset_window():
    gate = _gate()
    for _ in range(5):
        gate.on_depth(bid_total=GOLDEN_IMB + 0.5, ask_total=1.0)
    ms = _now_ms()
    gate.check_breakout(0.0, 40.0, 100.0, True, 1.0, ms)
    future_ms = ms + (IMBALANCE_RESET_S + 1) * 1_000
    result2 = gate.check_breakout(0.0, 40.0, 100.0, True, 1.0, future_ms)
    assert result2 is not None
    assert result2["type"] == "IMBALANCE"


# ─────────────────────────────────────────────────────────────────────────
# 7. SignalHistory — rolling window + heat labels
# ─────────────────────────────────────────────────────────────────────────

def test_signal_history_empty_ranking():
    sh = SignalHistory()
    assert sh.ranking() == []


def test_signal_history_records_and_ranks():
    sh = SignalHistory()
    for _ in range(3):
        sh.record("BTCUSDT", "GOLDEN")
    sh.record("ETHUSDT", "WHALE")
    ranking = sh.ranking()
    assert ranking[0]["symbol"] == "BTCUSDT"
    assert ranking[0]["total"] == 3
    assert ranking[0]["golden"] == 3


def test_signal_history_hot_label():
    sh = SignalHistory()
    for _ in range(HOT_THRESHOLD):
        sh.record("SOLUSDT", "WHALE")
    entry = next(e for e in sh.ranking() if e["symbol"] == "SOLUSDT")
    assert entry["heat"] == "hot"


def test_signal_history_fire_label():
    sh = SignalHistory()
    for _ in range(FIRE_THRESHOLD):
        sh.record("XRPUSDT", "SQUEEZE")
    entry = next(e for e in sh.ranking() if e["symbol"] == "XRPUSDT")
    assert entry["heat"] == "fire"


def test_signal_history_prunes_old_events(monkeypatch):
    """Events older than SIG_WINDOW_S should be dropped."""
    import market_engine.pipeline as pipeline_mod
    sh = SignalHistory()

    # Record events at t=0
    now = time.time()
    monkeypatch.setattr("market_engine.pipeline._time.time", lambda: now)
    for _ in range(HOT_THRESHOLD):
        sh.record("BNBUSDT", "GOLDEN")

    # Advance time past window
    monkeypatch.setattr(
        "market_engine.pipeline._time.time",
        lambda: now + pipeline_mod.SIG_WINDOW_S + 1,
    )
    ranking = sh.ranking()
    # All events should be pruned → empty
    syms = [e["symbol"] for e in ranking]
    assert "BNBUSDT" not in syms


# ─────────────────────────────────────────────────────────────────────────
# 8. compute_sector_scores
# ─────────────────────────────────────────────────────────────────────────

def test_compute_sector_scores_groups_by_sector():
    """BTCUSDT and BTCFDUSD both map to 'BTC' sector → averaged."""
    symbol_scores = {
        "BTCUSDT":  30.0,
        "BTCFDUSD": 10.0,
        "ETHUSDT":  20.0,
    }
    result = compute_sector_scores(symbol_scores)
    # BTC average = (30 + 10) / 2 = 20.0
    assert "BTC" in result
    assert result["BTC"] == pytest.approx(20.0)
    assert "ETH" in result
    assert result["ETH"] == pytest.approx(20.0)


def test_compute_sector_scores_empty_input():
    assert compute_sector_scores({}) == {}


def test_compute_sector_scores_single_symbol():
    result = compute_sector_scores({"SOLUSDT": 42.0})
    assert list(result.values()) == [42.0]
