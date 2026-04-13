"""Central threshold constants for the Market Engine.

Single source of truth — tune everything here instead of hunting across files.
"""

# ── L1 Radar ──────────────────────────────────────────────────────────────
VELOCITY_PROMOTE   = 2.5      # promote to L2 at this velocity
VELOCITY_SNIPER    = 3.0      # L3 Golden Gate minimum velocity
VOL_NOISE_FLOOR    = 30_000   # USD — minimum vol_1m to count as real signal

# ── L3 SniperGate ─────────────────────────────────────────────────────────
GOLDEN_VELOCITY    = 3.0      # Condition A
GOLDEN_RSI         = 55.0     # Condition A
GOLDEN_IMB         = 3.0      # Condition C (avg bid/ask imbalance)
GOLDEN_SPREAD      = 1.2      # Condition D (velocity / btc_velocity)

SQZ_TICKS          = 18       # price-history window for micro-squeeze
SQZ_PCT            = 0.8      # max range % to qualify as squeeze

CVD_TARGET_MIN     = 15_000   # floor for dyn_cvd_target
CVD_TARGET_RATIO   = 0.15     # avg_vol_1m × this → CVD target
CVD_SQZ_RATIO      = 0.5      # CVD must exceed dyn_target × this for SQUEEZE

WHALE_MIN          = 20_000   # floor for dyn_whale_tick (USDT)
WHALE_RATIO        = 0.05     # avg_vol_1m × this → whale threshold

FAKEOUT_PRICE_PCT  = 0.999    # price >= max_price * this → "at high"
FAKEOUT_CVD_PCT    = 0.80     # cvd < max_cvd * this → "cvd lagging"

# Per-signal debounce windows (milliseconds) — independent per signal type
DEBOUNCE_MS: dict[str, int] = {
    "GOLDEN":    5_000,
    "SQUEEZE":  30_000,
    "IMBALANCE": 15_000,
    "WHALE":      2_000,
}
# Alert re-arm: after this many seconds, the "already alerted" flag resets
SQUEEZE_RESET_S    = 300   # 5 min
IMBALANCE_RESET_S  = 180   # 3 min

# ── Signal History ─────────────────────────────────────────────────────────
SIG_WINDOW_S       = 30 * 60   # 30-min rolling window
HOT_THRESHOLD      = 5
FIRE_THRESHOLD     = 10

# ── Score Deflation (applied once, inside compute_alpha) ──────────────────
DEFLATION_UPPER_1  = 40
DEFLATION_UPPER_2  = 70
DEFLATION_RATE_1   = 0.5
DEFLATION_RATE_2   = 0.2

# ── Alpha Hard Caps ────────────────────────────────────────────────────────
LIQ_CAP_THRESHOLD  = 0.05   # liq_ratio < this → max alpha score 10
DUMP_CAP_COUNT     = 3      # s11 warn_count >= this → force score <= 0

# ── Hunt Score ────────────────────────────────────────────────────────────
COMBO_3_BONUS      = 25
COMBO_2_BONUS      = 10
DUMP_PENALTY       = 25
HUNT_SOFT_CAP      = 60
HUNT_SOFT_RATE     = 0.4

# ── Quote suffixes (order matters: longest first to avoid partial strip) ──
QUOTE_SUFFIXES = ("FDUSD", "USDT", "USDC", "BUSD", "TUSD", "DAI", "BTC", "ETH", "BNB")
