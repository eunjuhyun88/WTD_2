"""Market Judgment Engine — 4-Layer Pipeline.

    L0 Context  → GlobalCtx (market-wide, cached, refreshed every 10 min)
    L1 Radar    → Velocity + RSI sliding window (all symbols, fast)
    L2 Deep     → Full indicator suite (promoted symbols only)
    L3 Sniper   → Real-time WS CVD + orderbook (velocity ≥ 2.5×)

Entry points:
    run_deep_analysis(symbol, df_1h, ctx, perp, spot) → DeepResult
    compute_sector_scores(symbol_scores)               → dict[str, float]
    score_to_verdict(score)                            → str
"""
from __future__ import annotations

import time as _time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from market_engine.config import (
    VELOCITY_PROMOTE, VELOCITY_SNIPER, VOL_NOISE_FLOOR,
    GOLDEN_VELOCITY, GOLDEN_RSI, GOLDEN_IMB, GOLDEN_SPREAD,
    SQZ_TICKS, SQZ_PCT, CVD_TARGET_MIN, CVD_TARGET_RATIO, CVD_SQZ_RATIO,
    WHALE_MIN, WHALE_RATIO, FAKEOUT_PRICE_PCT, FAKEOUT_CVD_PCT,
    DEBOUNCE_MS, SQUEEZE_RESET_S, IMBALANCE_RESET_S,
    SIG_WINDOW_S,
)
from market_engine.types import GlobalCtx, LayerResult
from market_engine.sector import compute_sector_scores
from market_engine.signal_history import SignalHistory
from market_engine.verdict import score_to_verdict
from market_engine.l2 import (
    l1_wyckoff, l10_mtf,
    l2_flow, l11_cvd,
    l14_bb, s16_bb, l15_atr,
    l13_breakout, l3_vsurge,
    s19_oi_squeeze, s20_basis,
    l4_ob, s17_ob,
    l6_onchain, l7_fear_greed, l8_kimchi,
    l5_liq_estimate, l9_real_liq,
    l12_sector,
    s1_activity, s2_liquidity, s3_trades, s4_momentum, s5_holders,
    s6_stage, s7_dex, s9_accumulation, s10_prepump, s11_predump,
    s14_multi_fr, s15_vol_compare,
    compute_alpha, compute_hunt_score, resolve_conflict,
    SResult, AlphaResult,
)


# ── Result types ───────────────────────────────────────────────────────────

@dataclass
class DeepResult:
    symbol:     str
    # Terminal-style: raw sum of all L2 layer scores (perp-heavy)
    total_score:  float          = 0.0
    verdict:      str            = ""
    layers:  dict[str, LayerResult] = field(default_factory=dict)
    atr_levels: dict             = field(default_factory=dict)
    # Hunter-style: S-series alpha score (fundamental / spot tokens)
    alpha:      AlphaResult | None = None
    hunt_score: int | None         = None
    # EXTREME VOLATILITY override when prepump+predump fire simultaneously
    conflict:   dict | None        = None


# ── L1 Radar helpers ───────────────────────────────────────────────────────

def l1_velocity(
    vol_snapshots: list[float],
    window_recent: int = 6,    # 1-min window (6 × 10-sec ticks)
    history:       int = 60,   # 10-min baseline
) -> dict:
    """Rolling 1-min volume velocity.

    Returns: {vol_1m, avg_vol_1m, velocity}
    """
    if len(vol_snapshots) < window_recent + 1:
        return {"vol_1m": 0.0, "avg_vol_1m": 1.0, "velocity": 0.0}

    snaps  = vol_snapshots
    deltas = [
        max(0.0, snaps[i] - snaps[i - window_recent])
        for i in range(window_recent, len(snaps))
    ]
    vol_1m     = deltas[-1] if deltas else 0.0
    avg_vol_1m = sum(deltas[-history:]) / max(len(deltas[-history:]), 1)
    velocity   = vol_1m / avg_vol_1m if avg_vol_1m > 0 else 0.0
    return {"vol_1m": vol_1m, "avg_vol_1m": avg_vol_1m, "velocity": round(velocity, 3)}


def l1_rsi_realtime(price_history: list[float], period: int = 14) -> float:
    """Wilder-smoothed RSI from price_history (most-recent last)."""
    if len(price_history) < period + 1:
        return 50.0
    closes = price_history[-(period * 3):]   # keep enough bars for warm-up
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(0.0, d) for d in deltas]
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
    vol_1m:   float = 0.0,
    threshold: float = VELOCITY_PROMOTE,
) -> bool:
    """Promote symbol to L2 if velocity exceeds threshold and vol is real."""
    return velocity >= threshold and vol_1m >= VOL_NOISE_FLOOR


# ── L2 Deep ────────────────────────────────────────────────────────────────

def run_deep_analysis(
    symbol:   str,
    df_1h:    pd.DataFrame,
    ctx:      GlobalCtx,
    perp: dict | None = None,
    spot: dict | None = None,
) -> DeepResult:
    """Run all L2 indicators and return a fully populated DeepResult.

    Args:
        symbol  : e.g. "BTCUSDT" or "BTC"
        df_1h   : 1-H OHLCV DataFrame.  Required columns:
                  open, high, low, close, volume
                  Optional: taker_buy_base_volume, timestamp (ms, for index)
        ctx     : GlobalCtx populated by fetch_global_ctx()
        perp    : Perpetual / derivatives data (all keys optional):
                    fr, oi_pct, ls_ratio, taker_ratio, price_pct,
                    oi_notional, vol_24h, mark_price, index_price,
                    short_liq_usd, long_liq_usd
        spot    : Token metadata + DEX + multi-exchange data (all optional):
                    vol_24h, market_cap, count_24h,
                    liquidity,          ← CEX order-book depth ($)
                    buy_vol, sell_vol,  ← 24h taker volumes
                    holders,
                    is_spot, is_futures, pct_24h,
                    price_high_24h, price_low_24h,
                    buy_pct,            ← 24h taker-buy ratio (0-100)
                    dex_buy_pct_5m, dex_pm5, dex_ph6, dex_liquidity,
                    mexc_fr, bitget_fr,
                    mexc_vol, bitget_vol, mexc_pct,
                    bid_total, ask_total  ← OB depth totals ($)
    """
    p = perp or {}
    s = spot or {}
    res = DeepResult(symbol=symbol)
    layers: dict[str, LayerResult] = {}

    last_close = float(df_1h["close"].iloc[-1])

    # ── Structural ─────────────────────────────────────────────────────
    layers["wyckoff"]  = l1_wyckoff(df_1h)
    layers["mtf"]      = l10_mtf(df_1h)
    layers["breakout"] = l13_breakout(df_1h)

    # ── Volume ─────────────────────────────────────────────────────────
    layers["vsurge"]   = l3_vsurge(df_1h)
    layers["cvd"]      = l11_cvd(df_1h)

    # ── Derivatives / Funding ─────────────────────────────────────────
    layers["flow"]     = l2_flow(
        fr          = p.get("fr"),
        oi_pct      = p.get("oi_pct"),
        ls_ratio    = p.get("ls_ratio"),
        taker_ratio = p.get("taker_ratio"),
        price_pct   = p.get("price_pct"),
    )
    layers["liq_est"]  = l5_liq_estimate(p.get("fr"), last_close, p.get("oi_pct"))
    layers["real_liq"] = l9_real_liq(
        short_liq_usd = p.get("short_liq_usd", 0),
        long_liq_usd  = p.get("long_liq_usd",  0),
        oi_notional   = p.get("oi_notional"),   # enables OI-relative thresholds
    )
    layers["oi"]       = s19_oi_squeeze(p.get("oi_notional"), p.get("vol_24h"), p.get("fr"))
    layers["basis"]    = s20_basis(p.get("mark_price"), p.get("index_price"))

    # ── Technical ─────────────────────────────────────────────────────
    layers["bb14"]     = l14_bb(df_1h)
    layers["bb16"]     = s16_bb(df_1h)
    layers["atr"]      = l15_atr(df_1h)

    # ── Order Book ────────────────────────────────────────────────────
    if s.get("bid_total") is not None and s.get("ask_total") is not None:
        layers["ob"] = l4_ob(float(s["bid_total"]), float(s["ask_total"]))

    # ── Global Context ────────────────────────────────────────────────
    layers["onchain"]  = l6_onchain(ctx)
    layers["fg"]       = l7_fear_greed(ctx)
    layers["kimchi"]   = l8_kimchi(symbol, last_close, ctx)
    layers["sector"]   = l12_sector(symbol, ctx)

    # ── Terminal-style aggregate (L2 layer sum) ────────────────────────
    total = sum(lr.score for lr in layers.values())
    total = max(-100.0, min(100.0, total))
    res.layers      = layers
    res.total_score = round(total, 1)
    res.verdict     = score_to_verdict(total)
    res.atr_levels  = layers["atr"].meta

    # ── Hunter-style S-series (when spot data available) ───────────────
    if s:
        closes = df_1h["close"].tolist()

        # ── Momentum derivations for divergence signals ────────────────
        s4_res = s4_momentum(closes)
        bull_div = s4_res.meta.get("bull_div", False)
        bear_div = s4_res.meta.get("bear_div", False)

        # Build S-scores dict
        alpha_scores: dict[str, SResult] = {}

        alpha_scores["s1"]  = s1_activity(
            vol_24h   = float(s.get("vol_24h",    0)),
            market_cap= float(s.get("market_cap", 1)),
            count_24h = int(  s.get("count_24h",  0)),
        )
        alpha_scores["s2"]  = s2_liquidity(
            liquidity  = float(s.get("liquidity",   0)),
            market_cap = float(s.get("market_cap",  1)),
            vol_24h    = float(s.get("vol_24h",     1)),
        )
        alpha_scores["s3"]  = s3_trades(
            buy_vol  = float(s.get("buy_vol",  0)),
            sell_vol = float(s.get("sell_vol", 0)),
        )
        alpha_scores["s4"]  = s4_res
        alpha_scores["s5"]  = s5_holders(int(s.get("holders", 0)))
        alpha_scores["s6"]  = s6_stage(
            is_spot   = bool(s.get("is_spot",    False)),
            is_futures= bool(s.get("is_futures", False)),
            pct_24h   = float(s.get("pct_24h",   0.0)),
        )

        # DEX signals (only when dex data present)
        if s.get("dex_pm5") is not None:
            alpha_scores["s7"] = s7_dex(
                buy_pct_5m   = float(s.get("dex_buy_pct_5m", 50)),
                pm5          = float(s.get("dex_pm5",        0)),
                ph6          = float(s.get("dex_ph6",        0)),
                liquidity_usd= float(s.get("dex_liquidity",  0)),
            )

        alpha_scores["s9"]  = s9_accumulation(
            pct_24h       = float(s.get("pct_24h",        0)),
            price_high_24h= float(s.get("price_high_24h", last_close * 1.01)),
            price_low_24h = float(s.get("price_low_24h",  last_close * 0.99)),
            buy_pct       = float(s.get("buy_pct",        50)),
            rsi           = s4_res.meta.get("rsi", 50.0),
            vol           = float(s.get("vol_24h",   0)),
            holders       = int(  s.get("holders",   0)),
            market_cap    = float(s.get("market_cap",1)),
        )
        alpha_scores["s10"] = s10_prepump(
            dex_pm5        = float(s.get("dex_pm5",        0)),
            dex_ph6        = float(s.get("dex_ph6",        0)),
            bull_div       = bull_div,
            dex_buy_pct_5m = float(s.get("dex_buy_pct_5m", 50)),
        )
        alpha_scores["s11"] = s11_predump(
            dex_pm5        = float(s.get("dex_pm5",        0)),
            bear_div       = bear_div,
            dex_buy_pct_5m = float(s.get("dex_buy_pct_5m", 50)),
        )

        # Multi-exchange FR / Vol (optional)
        if s.get("mexc_fr") is not None or s.get("bitget_fr") is not None:
            alpha_scores["s14"] = s14_multi_fr(
                binance_fr = p.get("fr"),
                mexc_fr    = s.get("mexc_fr"),
                bitget_fr  = s.get("bitget_fr"),
            )
        if s.get("mexc_vol") is not None:
            alpha_scores["s15"] = s15_vol_compare(
                alpha_vol  = float(s.get("vol_24h",  0)),
                mexc_vol   = s.get("mexc_vol"),
                bitget_vol = s.get("bitget_vol"),
                mexc_pct   = s.get("mexc_pct"),
            )

        # OB snapshot → S17
        if s.get("bid_total") is not None and s.get("ask_total") is not None:
            ob_lr = s17_ob(float(s["bid_total"]), float(s["ask_total"]))
            alpha_scores["s17"] = SResult(
                score=ob_lr.score, sigs=ob_lr.sigs, meta=ob_lr.meta,
            )

        # BB squeeze → S16
        bb16_r = layers["bb16"]
        alpha_scores["s16"] = SResult(
            score=bb16_r.score, sigs=bb16_r.sigs, meta=bb16_r.meta,
        )
        # OI squeeze → S19
        oi_r = layers["oi"]
        alpha_scores["s19"] = SResult(
            score=oi_r.score, sigs=oi_r.sigs, meta=oi_r.meta,
        )

        # Compute deflated alpha + hunt score
        res.alpha = compute_alpha(alpha_scores)
        res.hunt_score = compute_hunt_score(
            alpha_score = res.alpha.score,
            s10         = alpha_scores["s10"],
            s11         = alpha_scores["s11"],
            s9          = alpha_scores["s9"],
            s16         = alpha_scores.get("s16"),
            s19         = alpha_scores.get("s19"),
        )

        # EXTREME VOLATILITY override
        res.conflict = resolve_conflict(alpha_scores["s10"], alpha_scores["s11"])
        if res.conflict:
            res.verdict = res.conflict["verdict"]

    return res


# ── L3 Golden Gate ─────────────────────────────────────────────────────────

class SniperGate:
    """Stateful 4-condition gate for a single symbol under L3 watch.

    GOLDEN (3 of 4 conditions):
      A: velocity >= 3.0 AND rsi >= 55
      B: cvd > dyn_cvd_target AND NOT fakeout
      C: avg_imbalance >= 3.0 AND is_price_rising
      D: velocity / btc_velocity >= 1.2

    Additional signals (independent debounce + re-arm):
      SQUEEZE   : 18-tick price range ≤ 0.8% + CVD > target × 0.5
      IMBALANCE : avg orderbook imbalance ≥ 3.0 + price rising (without full GOLDEN)
      WHALE     : any single taker-buy OR taker-sell tick ≥ dynamic threshold
    """

    def __init__(self, symbol: str, avg_vol_1m: float):
        self.symbol     = symbol
        self.avg_vol_1m = avg_vol_1m

        # CVD state
        self.cvd        = 0.0
        self.max_cvd    = 0.0
        self.max_price  = 0.0

        # Price + depth history
        self._price_history: deque[float] = deque(maxlen=SQZ_TICKS + 4)
        self.imb_history:    deque[float] = deque(maxlen=30)

        # Per-signal last-fire timestamps (ms)
        self._last_ms: dict[str, int] = {k: 0 for k in DEBOUNCE_MS}

        # Re-arm tracking: (alerted, last_alert_time_s)
        self._squeeze_alerted:   bool  = False
        self._squeeze_alerted_t: float = 0.0
        self._imb_alerted:       bool  = False
        self._imb_alerted_t:     float = 0.0

    # ── Dynamic thresholds ────────────────────────────────────────────
    @property
    def dyn_cvd_target(self) -> float:
        return max(CVD_TARGET_MIN, self.avg_vol_1m * CVD_TARGET_RATIO)

    @property
    def dyn_whale_tick(self) -> float:
        return max(WHALE_MIN, self.avg_vol_1m * WHALE_RATIO)

    # ── Helpers ───────────────────────────────────────────────────────
    def _debounced(self, sig_type: str, now_ms: int) -> bool:
        """True if this signal type is still in its cooldown window."""
        return now_ms - self._last_ms.get(sig_type, 0) < DEBOUNCE_MS.get(sig_type, 2_000)

    def _maybe_rearm(self, now_s: float) -> None:
        """Re-arm SQUEEZE / IMBALANCE after their reset windows."""
        if self._squeeze_alerted and (now_s - self._squeeze_alerted_t) >= SQUEEZE_RESET_S:
            self._squeeze_alerted = False
        if self._imb_alerted and (now_s - self._imb_alerted_t) >= IMBALANCE_RESET_S:
            self._imb_alerted = False

    def is_fakeout(self, current_price: float) -> bool:
        at_high = current_price >= self.max_price * FAKEOUT_PRICE_PCT
        cvd_lag  = self.cvd < self.max_cvd * FAKEOUT_CVD_PCT
        return at_high and cvd_lag

    # ── Trade tick ────────────────────────────────────────────────────
    def on_trade(
        self,
        price:    float,
        qty_usdt: float,
        is_maker: bool,       # True = buyer is maker → sell-initiated tick
        now_ms:   int = 0,
    ) -> dict | None:
        """Update CVD; emit WHALE for any oversized tick (buy or sell).

        Binance WS field `m` (is_maker):
            True  → buyer is market-maker → taker SOLD → bearish tick
            False → buyer is market-taker → taker BOUGHT → bullish tick
        """
        delta = -qty_usdt if is_maker else qty_usdt
        self.cvd       += delta
        self.max_cvd    = max(self.max_cvd,   self.cvd)
        self.max_price  = max(self.max_price, price)
        self._price_history.append(price)

        if now_ms == 0:
            now_ms = int(_time.time() * 1000)

        # WHALE: fire for large ticks regardless of direction
        if qty_usdt >= self.dyn_whale_tick and not self._debounced("WHALE", now_ms):
            self._last_ms["WHALE"] = now_ms
            return {
                "symbol":    self.symbol,
                "type":      "WHALE",
                "usdt":      round(qty_usdt, 0),
                "price":     price,
                "side":      "SELL" if is_maker else "BUY",
                "threshold": self.dyn_whale_tick,
            }
        return None

    # ── Depth update ──────────────────────────────────────────────────
    def on_depth(self, bid_total: float, ask_total: float) -> None:
        ratio = bid_total / ask_total if ask_total > 0 else 1.0
        self.imb_history.append(ratio)

    # ── Breakout check ────────────────────────────────────────────────
    def check_breakout(
        self,
        velocity:        float,
        rsi:             float,
        current_price:   float,
        is_price_rising: bool,
        btc_velocity:    float,
        now_ms:          int,
    ) -> dict | None:
        """Evaluate GOLDEN / SQUEEZE / IMBALANCE conditions.

        Returns the highest-priority signal dict or None.
        """
        now_s   = now_ms / 1_000
        self._maybe_rearm(now_s)

        imb_window = list(self.imb_history)[-5:] if self.imb_history else []
        avg_imb    = sum(imb_window) / len(imb_window) if imb_window else 1.0
        fakeout    = self.is_fakeout(current_price)

        # ── GOLDEN: 3/4 conditions ────────────────────────────────────
        cond_a = velocity >= GOLDEN_VELOCITY and rsi >= GOLDEN_RSI
        cond_b = self.cvd > self.dyn_cvd_target and not fakeout
        cond_c = avg_imb >= GOLDEN_IMB and is_price_rising
        cond_d = (velocity / btc_velocity >= GOLDEN_SPREAD) if btc_velocity > 0 else False

        met = cond_a + cond_b + cond_c + cond_d
        if met >= 3 and not self._debounced("GOLDEN", now_ms):
            self._last_ms["GOLDEN"] = now_ms
            return {
                "symbol":   self.symbol,
                "type":     "GOLDEN",
                "score":    met,
                "velocity": velocity,
                "rsi":      rsi,
                "cvd":      round(self.cvd, 0),
                "avg_imb":  round(avg_imb, 2),
                "fakeout":  fakeout,
                "conds":    {"A": cond_a, "B": cond_b, "C": cond_c, "D": cond_d},
            }

        # ── SQUEEZE: tight 18-tick range + rising CVD ─────────────────
        if (
            not self._squeeze_alerted
            and not self._debounced("SQUEEZE", now_ms)
            and len(self._price_history) >= SQZ_TICKS
            and self.cvd > self.dyn_cvd_target * CVD_SQZ_RATIO
        ):
            window    = list(self._price_history)[-SQZ_TICKS:]
            hi, lo    = max(window), min(window)
            range_pct = (hi - lo) / lo * 100 if lo > 0 else 999.0
            if range_pct <= SQZ_PCT:
                self._squeeze_alerted   = True
                self._squeeze_alerted_t = now_s
                self._last_ms["SQUEEZE"] = now_ms
                return {
                    "symbol":    self.symbol,
                    "type":      "SQUEEZE",
                    "cvd":       round(self.cvd, 0),
                    "range_pct": round(range_pct, 3),
                }

        # ── IMBALANCE: sustained OB imbalance (standalone) ────────────
        if (
            not self._imb_alerted
            and not self._debounced("IMBALANCE", now_ms)
            and cond_c  # avg_imb >= GOLDEN_IMB AND is_price_rising
        ):
            self._imb_alerted   = True
            self._imb_alerted_t = now_s
            self._last_ms["IMBALANCE"] = now_ms
            return {
                "symbol":  self.symbol,
                "type":    "IMBALANCE",
                "cvd":     round(self.cvd, 0),
                "avg_imb": round(avg_imb, 2),
            }

        return None


