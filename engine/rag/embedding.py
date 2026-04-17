from __future__ import annotations

import math
import time

CANONICAL_FACTOR_ORDER = [
    "EMA_TREND", "RSI_TREND", "RSI_DIVERGENCE", "MTF_ALIGNMENT", "PRICE_STRUCTURE", "VOL_TREND",
    "CVD_TREND", "BUY_SELL_RATIO", "VOL_PROFILE", "ABSORPTION", "VOL_DIVERGENCE", "CLIMAX_SIGNAL",
    "LIQUIDITY_POOL", "FVG", "ORDER_BLOCK", "BOS_CHOCH", "DISPLACEMENT", "PREMIUM_DISCOUNT",
    "OI_PRICE_CONV", "FR_TREND", "LIQUIDATION_TREND", "LS_RATIO_TREND", "OI_DIVERGENCE", "SQUEEZE_SIGNAL",
    "MVRV_ZONE", "NUPL_TREND", "SOPR_SIGNAL", "CYCLE_POSITION", "REALIZED_CAP_TREND", "SUPPLY_PROFIT",
    "EXCHANGE_FLOW", "WHALE_ACTIVITY", "MINER_FLOW", "STABLECOIN_FLOW", "ACTIVE_ADDRESSES", "ETF_FLOW",
    "FG_TREND", "SOCIAL_VOLUME", "SOCIAL_SENTIMENT", "NEWS_IMPACT", "SEARCH_TREND", "CONTRARIAN_SIGNAL",
    "DXY_TREND", "EQUITY_TREND", "YIELD_TREND", "BTC_DOMINANCE", "STABLECOIN_MCAP", "EVENT_PROXIMITY",
]

ROLE_WEIGHT: dict[str, float] = {}
for idx in range(18):
    ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[idx]] = 1.2
for idx in range(18, 36):
    ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[idx]] = 1.0
for idx in range(36, 48):
    ROLE_WEIGHT[CANONICAL_FACTOR_ORDER[idx]] = 0.8

REGIME_MAP = {
    "bullish": [1, 0, 0, 0],
    "trending_up": [1, 0, 0, 0],
    "bearish": [0, 1, 0, 0],
    "trending_down": [0, 1, 0, 0],
    "ranging": [0, 0, 1, 0],
    "sideways": [0, 0, 1, 0],
    "volatile": [0, 0, 0, 1],
}

TF_MAP = {
    "15m": [0.5, 0, 0, 0, 0],
    "1h": [1, 0, 0, 0, 0],
    "4h": [0, 1, 0, 0, 0],
    "1d": [0, 0, 1, 0, 0],
    "1w": [0, 0, 0, 1, 0],
}

AGENT_GROUPS = [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17],
    [18, 19, 20, 21, 22, 23],
    [24, 25, 26, 27, 28, 29],
    [30, 31, 32, 33, 34, 35],
    [36, 37, 38, 39, 40, 41],
    [42, 43, 44, 45, 46, 47],
]

ACTION_INTENSITY = {
    "convert_to_trade": 1.0,
    "copy_trade": 0.8,
    "quick_long": 0.9,
    "quick_short": 0.9,
    "track": 0.5,
    "untrack": 0.2,
}

AGENT_TO_FACTOR_RANGE = {
    "STRUCTURE": (0, 5),
    "VPA": (6, 11),
    "ICT": (12, 17),
    "DERIV": (18, 23),
    "VALUATION": (24, 29),
    "FLOW": (30, 35),
    "SENTI": (36, 41),
    "MACRO": (42, 47),
}


def clamp(v: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, v))


def compute_terminal_scan_embedding(signals: list[dict], timeframe: str, data_completeness: float = 0.7) -> list[float]:
    emb = [0.0] * 256
    signal_map = {str(s.get("agentId", "")).upper(): s for s in signals}

    for agent_id, (start, end) in AGENT_TO_FACTOR_RANGE.items():
        signal = signal_map.get(agent_id)
        if not signal:
            continue
        vote = str(signal.get("vote", "neutral"))
        dir_value = 1 if vote == "long" else -1 if vote == "short" else 0
        conf_norm = clamp(float(signal.get("confidence", 0)) / 100.0, 0, 1)
        for idx in range(start, end + 1):
            slot = idx - start
            gradient = 1 - (abs(slot - 2.5) / 3)
            emb[idx] = clamp(dir_value * conf_norm * gradient, -1, 1)

    for idx in range(48):
        emb[48 + idx] = abs(emb[idx])
        weight = ROLE_WEIGHT.get(CANONICAL_FACTOR_ORDER[idx], 1.0)
        emb[96 + idx] = clamp(emb[idx] * weight, -1.2, 1.2)

    long_signals = sum(1 for s in signals if s.get("vote") == "long")
    short_signals = sum(1 for s in signals if s.get("vote") == "short")
    avg_conf = sum(float(s.get("confidence", 0)) for s in signals) / len(signals) if signals else 50
    confs = [float(s.get("confidence", 0)) for s in signals] or [50]
    regime = "ranging"
    if long_signals >= 5 and avg_conf >= 65:
        regime = "bullish"
    elif short_signals >= 5 and avg_conf >= 65:
        regime = "bearish"
    elif max(confs) - min(confs) > 40:
        regime = "volatile"
    regime_vec = REGIME_MAP.get(regime, [0, 0, 1, 0])
    for idx, value in enumerate(regime_vec):
        emb[144 + idx] = value

    tf_vec = TF_MAP.get(timeframe, [0, 0, 0, 0, 1])
    for idx, value in enumerate(tf_vec[:5]):
        emb[148 + idx] = value

    sorted_signals = sorted(signals, key=lambda s: float(s.get("confidence", 0)), reverse=True)[:10]
    for idx, signal in enumerate(sorted_signals):
        vote = str(signal.get("vote", "neutral"))
        dir_value = 1 if vote == "long" else -1 if vote == "short" else 0
        emb[153 + idx] = clamp(dir_value * float(signal.get("confidence", 0)) / 100.0, -1, 1)

    emb[163] = 1 if long_signals >= 6 else 0
    emb[166] = 1 if short_signals >= 5 and long_signals >= 3 else 0
    emb[167] = 1 if abs(long_signals - short_signals) <= 1 else 0
    emb[168] = 1 if avg_conf >= 75 else 0

    agent_pairs = [
        ("STRUCTURE", "VPA"), ("STRUCTURE", "DERIV"), ("VPA", "FLOW"), ("SENTI", "MACRO"),
        ("ICT", "STRUCTURE"), ("DERIV", "FLOW"), ("VALUATION", "MACRO"), ("FLOW", "SENTI"),
    ]
    for idx, (a_id, b_id) in enumerate(agent_pairs):
        a = signal_map.get(a_id)
        b = signal_map.get(b_id)
        if not a or not b:
            continue
        da = 1 if a.get("vote") == "long" else -1 if a.get("vote") == "short" else 0
        db = 1 if b.get("vote") == "long" else -1 if b.get("vote") == "short" else 0
        emb[171 + idx] = clamp((da * float(a.get("confidence", 0)) * db * float(b.get("confidence", 0))) / 10000.0, -1, 1)

    dim_idx = 187
    for g1 in range(8):
        for g2 in range(g1 + 1, 8):
            total = 0.0
            count = 0
            for i1 in AGENT_GROUPS[g1]:
                for i2 in AGENT_GROUPS[g2]:
                    total += emb[i1] * emb[i2]
                    count += 1
            emb[dim_idx] = clamp(total / max(count, 1), -1, 1)
            dim_idx += 1
            if dim_idx >= 255:
                break
        if dim_idx >= 255:
            break

    for group in AGENT_GROUPS:
        if dim_idx >= 255:
            break
        vals = [emb[idx] for idx in group]
        mean = sum(vals) / len(vals)
        variance = sum((v - mean) ** 2 for v in vals) / len(vals)
        emb[dim_idx] = clamp(variance, 0, 1)
        dim_idx += 1

    emb[255] = clamp(data_completeness, 0, 1)
    return emb


def compute_quick_trade_embedding(params: dict) -> list[float]:
    emb = [0.0] * 256
    direction = str(params.get("direction", "LONG"))
    entry_price = float(params.get("entryPrice", 0))
    current_price = float(params.get("currentPrice", 0))
    tp = params.get("tp")
    sl = params.get("sl")
    confidence = float(params.get("confidence", 50))
    timeframe = str(params.get("timeframe", "4h"))
    dir_sign = 1 if direction == "LONG" else -1
    conf_norm = clamp(confidence, 0, 100) / 100.0

    for idx in range(18):
        gradient = 1.0 - (idx / 18.0) * 0.4
        emb[idx] = dir_sign * conf_norm * gradient * 0.6
    for idx in range(18, 36):
        emb[idx] = dir_sign * conf_norm * 0.2

    momentum = clamp((current_price - entry_price) / entry_price, -0.1, 0.1) * 10 if entry_price > 0 else 0
    for idx in range(36, 48):
        emb[idx] = momentum * 0.3

    for idx in range(48):
        emb[48 + idx] = abs(emb[idx])
    for idx in range(18):
        emb[96 + idx] = clamp(emb[idx] * 1.2, -1.2, 1.2)
    for idx in range(18, 36):
        emb[96 + idx] = emb[idx]
    for idx in range(36, 48):
        emb[96 + idx] = clamp(emb[idx] * 0.8, -1, 1)

    if momentum > 0.3:
        emb[144] = 1
    elif momentum < -0.3:
        emb[145] = 1
    else:
        emb[146] = 1

    tf_vec = TF_MAP.get(timeframe)
    if tf_vec:
        for idx, value in enumerate(tf_vec[:5]):
            emb[148 + idx] = value
    else:
        emb[152] = 1

    if tp is not None and sl is not None and entry_price > 0:
        tp_dist = abs(float(tp) - entry_price) / entry_price
        sl_dist = abs(float(sl) - entry_price) / entry_price
        rr_ratio = clamp(tp_dist / sl_dist, 0, 5) / 5 if sl_dist > 0 else 0.5
        emb[153] = rr_ratio
        emb[154] = clamp(tp_dist * 10, 0, 1)
        emb[155] = clamp(sl_dist * 10, 0, 1)
    emb[156] = conf_norm
    if confidence >= 75:
        emb[163] = 1
    if tp is not None and entry_price > 0:
        tp_dir = float(tp) > entry_price if direction == "LONG" else float(tp) < entry_price
        if tp_dir:
            emb[165] = 1

    emb[255] = 0.3
    return emb


def compute_signal_action_embedding(params: dict) -> list[float]:
    emb = [0.0] * 256
    direction = str(params.get("direction", ""))
    action_type = str(params.get("actionType", "track"))
    confidence = float(params.get("confidence", 50) or 50)
    timeframe = str(params.get("timeframe", "4h"))
    dir_sign = 1 if direction == "LONG" else -1 if direction == "SHORT" else 0
    conf_norm = clamp(confidence, 0, 100) / 100.0
    intensity = ACTION_INTENSITY.get(action_type, 0.5)

    for idx in range(18):
        emb[idx] = dir_sign * conf_norm * intensity * 0.4
    for idx in range(18, 36):
        emb[idx] = dir_sign * conf_norm * intensity * 0.15
    for idx in range(48):
        emb[48 + idx] = abs(emb[idx])
    for idx in range(18):
        emb[96 + idx] = clamp(emb[idx] * 1.2, -1.2, 1.2)
    for idx in range(18, 36):
        emb[96 + idx] = emb[idx]
    for idx in range(36, 48):
        emb[96 + idx] = clamp(emb[idx] * 0.8, -1, 1)

    emb[146] = 1
    tf_vec = TF_MAP.get(timeframe)
    if tf_vec:
        for idx, value in enumerate(tf_vec[:5]):
            emb[148 + idx] = value
    emb[156] = conf_norm * intensity
    emb[255] = 0.2
    return emb


def _js_hash(value: str) -> int:
    hash_value = 0
    for char in value:
        hash_value = ((hash_value << 5) - hash_value + ord(char)) & 0xFFFFFFFF
    if hash_value & 0x80000000:
        hash_value = -((~hash_value + 1) & 0xFFFFFFFF)
    return hash_value


def compute_dedupe_hash(pair: str, timeframe: str, direction: str, regime: str, source: str, window_minutes: int = 60) -> str:
    time_bucket = math.floor(time.time() * 1000 / (window_minutes * 60 * 1000))
    joined = "|".join([pair, timeframe, direction, regime, source, str(time_bucket)])
    hashed = abs(_js_hash(joined))
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if hashed == 0:
        encoded = "0"
    else:
        encoded = ""
        while hashed > 0:
            hashed, rem = divmod(hashed, 36)
            encoded = digits[rem] + encoded
    return f"dh_{encoded}"
