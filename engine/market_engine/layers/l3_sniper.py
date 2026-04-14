from __future__ import annotations

import time as _time
from collections import deque

from market_engine.config import (
    CVD_SQZ_RATIO,
    CVD_TARGET_MIN,
    CVD_TARGET_RATIO,
    DEBOUNCE_MS,
    FAKEOUT_CVD_PCT,
    FAKEOUT_PRICE_PCT,
    GOLDEN_IMB,
    GOLDEN_RSI,
    GOLDEN_SPREAD,
    GOLDEN_VELOCITY,
    IMBALANCE_RESET_S,
    SQZ_PCT,
    SQZ_TICKS,
    SQUEEZE_RESET_S,
    WHALE_MIN,
    WHALE_RATIO,
)


class SniperGate:
    """Stateful 4-condition gate for a single symbol under L3 watch."""

    def __init__(self, symbol: str, avg_vol_1m: float):
        self.symbol = symbol
        self.avg_vol_1m = avg_vol_1m
        self.cvd = 0.0
        self.max_cvd = 0.0
        self.max_price = 0.0
        self._price_history: deque[float] = deque(maxlen=SQZ_TICKS + 4)
        self.imb_history: deque[float] = deque(maxlen=30)
        self._last_ms: dict[str, int] = {k: 0 for k in DEBOUNCE_MS}
        self._squeeze_alerted: bool = False
        self._squeeze_alerted_t: float = 0.0
        self._imb_alerted: bool = False
        self._imb_alerted_t: float = 0.0

    @property
    def dyn_cvd_target(self) -> float:
        return max(CVD_TARGET_MIN, self.avg_vol_1m * CVD_TARGET_RATIO)

    @property
    def dyn_whale_tick(self) -> float:
        return max(WHALE_MIN, self.avg_vol_1m * WHALE_RATIO)

    def _debounced(self, sig_type: str, now_ms: int) -> bool:
        return now_ms - self._last_ms.get(sig_type, 0) < DEBOUNCE_MS.get(sig_type, 2_000)

    def _maybe_rearm(self, now_s: float) -> None:
        if self._squeeze_alerted and (now_s - self._squeeze_alerted_t) >= SQUEEZE_RESET_S:
            self._squeeze_alerted = False
        if self._imb_alerted and (now_s - self._imb_alerted_t) >= IMBALANCE_RESET_S:
            self._imb_alerted = False

    def is_fakeout(self, current_price: float) -> bool:
        at_high = current_price >= self.max_price * FAKEOUT_PRICE_PCT
        cvd_lag = self.cvd < self.max_cvd * FAKEOUT_CVD_PCT
        return at_high and cvd_lag

    def on_trade(
        self,
        price: float,
        qty_usdt: float,
        is_maker: bool,
        now_ms: int = 0,
    ) -> dict | None:
        delta = -qty_usdt if is_maker else qty_usdt
        self.cvd += delta
        self.max_cvd = max(self.max_cvd, self.cvd)
        self.max_price = max(self.max_price, price)
        self._price_history.append(price)

        if now_ms == 0:
            now_ms = int(_time.time() * 1000)

        if qty_usdt >= self.dyn_whale_tick and not self._debounced("WHALE", now_ms):
            self._last_ms["WHALE"] = now_ms
            return {
                "symbol": self.symbol,
                "type": "WHALE",
                "usdt": round(qty_usdt, 0),
                "price": price,
                "side": "SELL" if is_maker else "BUY",
                "threshold": self.dyn_whale_tick,
            }
        return None

    def on_depth(self, bid_total: float, ask_total: float) -> None:
        ratio = bid_total / ask_total if ask_total > 0 else 1.0
        self.imb_history.append(ratio)

    def check_breakout(
        self,
        velocity: float,
        rsi: float,
        current_price: float,
        is_price_rising: bool,
        btc_velocity: float,
        now_ms: int,
    ) -> dict | None:
        now_s = now_ms / 1_000
        self._maybe_rearm(now_s)
        imb_window = list(self.imb_history)[-5:] if self.imb_history else []
        avg_imb = sum(imb_window) / len(imb_window) if imb_window else 1.0
        fakeout = self.is_fakeout(current_price)

        cond_a = velocity >= GOLDEN_VELOCITY and rsi >= GOLDEN_RSI
        cond_b = self.cvd > self.dyn_cvd_target and not fakeout
        cond_c = avg_imb >= GOLDEN_IMB and is_price_rising
        cond_d = (velocity / btc_velocity >= GOLDEN_SPREAD) if btc_velocity > 0 else False
        met = cond_a + cond_b + cond_c + cond_d
        if met >= 3 and not self._debounced("GOLDEN", now_ms):
            self._last_ms["GOLDEN"] = now_ms
            return {
                "symbol": self.symbol,
                "type": "GOLDEN",
                "score": met,
                "velocity": velocity,
                "rsi": rsi,
                "cvd": round(self.cvd, 0),
                "avg_imb": round(avg_imb, 2),
                "fakeout": fakeout,
                "conds": {"A": cond_a, "B": cond_b, "C": cond_c, "D": cond_d},
            }

        if (
            not self._squeeze_alerted
            and not self._debounced("SQUEEZE", now_ms)
            and len(self._price_history) >= SQZ_TICKS
            and self.cvd > self.dyn_cvd_target * CVD_SQZ_RATIO
        ):
            window = list(self._price_history)[-SQZ_TICKS:]
            hi, lo = max(window), min(window)
            range_pct = (hi - lo) / lo * 100 if lo > 0 else 999.0
            if range_pct <= SQZ_PCT:
                self._squeeze_alerted = True
                self._squeeze_alerted_t = now_s
                self._last_ms["SQUEEZE"] = now_ms
                return {
                    "symbol": self.symbol,
                    "type": "SQUEEZE",
                    "cvd": round(self.cvd, 0),
                    "range_pct": round(range_pct, 3),
                }

        if (
            not self._imb_alerted
            and not self._debounced("IMBALANCE", now_ms)
            and cond_c
        ):
            self._imb_alerted = True
            self._imb_alerted_t = now_s
            self._last_ms["IMBALANCE"] = now_ms
            return {
                "symbol": self.symbol,
                "type": "IMBALANCE",
                "cvd": round(self.cvd, 0),
                "avg_imb": round(avg_imb, 2),
            }

        return None
