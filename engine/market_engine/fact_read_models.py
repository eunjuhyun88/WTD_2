"""Additional bounded engine-owned fact read models.

These routes are intentionally transitional. They reuse the existing
`build_fact_context()` landing zone so the engine becomes the owner of
the public read models before deeper persistence and ingestion cutovers
are complete.
"""
from __future__ import annotations

from typing import Any

from market_engine.fact_plane import build_fact_context
from market_engine.indicator_catalog import build_indicator_catalog


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _source_contract(source_id: str, state: dict[str, Any]) -> dict[str, Any]:
    raw_status = str(state.get("status") or "missing")
    if raw_status == "ok":
        contract_state = "live"
    elif raw_status == "not_requested":
        contract_state = "reference_only"
    elif raw_status == "missing":
        contract_state = "blocked"
    else:
        contract_state = "stale"

    rows = int(state.get("rows") or 0)
    end_at = state.get("end_at")
    summary = f"{rows} rows" if rows > 0 else "no rows"
    if end_at:
        summary = f"{summary}; latest={end_at}"
    return {
        "id": source_id,
        "state": contract_state,
        "rows": rows,
        "summary": summary,
    }


def build_price_context(
    *,
    symbol: str,
    timeframe: str = "1h",
    offline: bool = True,
) -> dict[str, Any]:
    ctx = build_fact_context(symbol=symbol, timeframe=timeframe, offline=offline)
    features = ctx["feature_row"]
    return {
        "ok": True,
        "owner": "engine",
        "plane": "fact",
        "kind": "price_context",
        "status": "transitional",
        "generated_at": ctx["generated_at"],
        "symbol": ctx["symbol"],
        "timeframe": ctx["timeframe"],
        "bars": ctx["bars"],
        "market": ctx["market"],
        "structure": {
            "ema_alignment": features.get("ema_alignment"),
            "htf_structure": features.get("htf_structure"),
            "range_7d_position": _as_float(features.get("range_7d_position")),
            "dist_from_20d_high": _as_float(features.get("dist_from_20d_high")),
            "dist_from_20d_low": _as_float(features.get("dist_from_20d_low")),
            "regime": features.get("regime"),
        },
        "sources": {
            "klines": _source_contract("klines", ctx["sources"]["klines"]),
        },
        "notes": [
            "bounded price-context read model",
            "derived from engine fact context; app migration target for snapshot consumers",
        ],
    }


def _crowding_state(funding_rate: float, oi_change_24h: float) -> str:
    if funding_rate > 0.0005 and oi_change_24h > 0.03:
        return "crowded_longs"
    if funding_rate < -0.0005 and oi_change_24h > 0.03:
        return "crowded_shorts"
    if abs(funding_rate) < 0.0001 and abs(oi_change_24h) < 0.01:
        return "neutral"
    return "mixed"


def build_perp_context(
    *,
    symbol: str,
    timeframe: str = "1h",
    offline: bool = True,
) -> dict[str, Any]:
    ctx = build_fact_context(symbol=symbol, timeframe=timeframe, offline=offline)
    features = ctx["feature_row"]
    funding_rate = _as_float(features.get("funding_rate"))
    oi_change_1h = _as_float(features.get("oi_change_1h"))
    oi_change_24h = _as_float(features.get("oi_change_24h"))
    long_short_ratio = _as_float(features.get("long_short_ratio"), 1.0)
    taker_buy_ratio_1h = _as_float(features.get("taker_buy_ratio_1h"), 0.5)
    perp_source = _source_contract("perp", ctx["sources"]["perp"])

    return {
        "ok": True,
        "owner": "engine",
        "plane": "fact",
        "kind": "perp_context",
        "status": "transitional",
        "generated_at": ctx["generated_at"],
        "symbol": ctx["symbol"],
        "timeframe": ctx["timeframe"],
        "source": perp_source,
        "metrics": {
            "funding_rate": funding_rate,
            "oi_change_1h": oi_change_1h,
            "oi_change_24h": oi_change_24h,
            "long_short_ratio": long_short_ratio,
            "taker_buy_ratio_1h": taker_buy_ratio_1h,
        },
        "regime": {
            "crowding": _crowding_state(funding_rate, oi_change_24h),
            "cvd_state": features.get("cvd_state"),
        },
        "notes": [
            "bounded perp-context read model",
            "uses engine feature row to expose crowding without app-side recomposition",
        ],
    }


def build_reference_stack(
    *,
    symbol: str = "BTCUSDT",
    timeframe: str = "1h",
    offline: bool = True,
) -> dict[str, Any]:
    ctx = build_fact_context(symbol=symbol, timeframe=timeframe, offline=offline)
    catalog = build_indicator_catalog()
    source_entries = [
        _source_contract(source_id, state)
        for source_id, state in ctx["sources"].items()
    ]
    source_entries.append(
        {
            "id": "indicator_catalog",
            "state": "live",
            "rows": catalog["total"],
            "summary": f"{catalog['coverage']['usable_now']} usable now / {catalog['total']} tracked metrics",
        }
    )
    return {
        "ok": True,
        "owner": "engine",
        "plane": "fact",
        "kind": "reference_stack",
        "status": "transitional",
        "generated_at": ctx["generated_at"],
        "symbol": ctx["symbol"],
        "timeframe": ctx["timeframe"],
        "sources": source_entries,
        "coverage": catalog["coverage"],
        "catalogCounts": catalog["counts"],
        "notes": [
            "reference stack is engine-owned truth for provider/metric coverage status",
            "current source states are derived from fact-context loaders and metric catalog coverage",
        ],
    }


def build_confluence_context(
    *,
    symbol: str,
    timeframe: str = "1h",
    offline: bool = True,
) -> dict[str, Any]:
    ctx = build_fact_context(symbol=symbol, timeframe=timeframe, offline=offline)
    features = ctx["feature_row"]
    evidence: list[dict[str, Any]] = []
    score = 0

    ema_alignment = str(features.get("ema_alignment") or "")
    if ema_alignment == "bullish":
        score += 1
        evidence.append({"metric": "ema_alignment", "bias": "bullish", "value": ema_alignment})
    elif ema_alignment == "bearish":
        score -= 1
        evidence.append({"metric": "ema_alignment", "bias": "bearish", "value": ema_alignment})

    htf_structure = str(features.get("htf_structure") or "")
    if htf_structure == "uptrend":
        score += 1
        evidence.append({"metric": "htf_structure", "bias": "bullish", "value": htf_structure})
    elif htf_structure == "downtrend":
        score -= 1
        evidence.append({"metric": "htf_structure", "bias": "bearish", "value": htf_structure})

    funding_rate = _as_float(features.get("funding_rate"))
    oi_change_24h = _as_float(features.get("oi_change_24h"))
    crowding = _crowding_state(funding_rate, oi_change_24h)
    if crowding == "crowded_shorts":
        score += 1
        evidence.append({"metric": "perp_crowding", "bias": "bullish", "value": crowding})
    elif crowding == "crowded_longs":
        score -= 1
        evidence.append({"metric": "perp_crowding", "bias": "bearish", "value": crowding})

    mvrv_zscore = _as_float(features.get("mvrv_zscore"))
    if mvrv_zscore < 0:
        score += 1
        evidence.append({"metric": "mvrv_zscore", "bias": "bullish", "value": mvrv_zscore})
    elif mvrv_zscore > 5:
        score -= 1
        evidence.append({"metric": "mvrv_zscore", "bias": "bearish", "value": mvrv_zscore})

    fear_greed = _as_float(features.get("fear_greed"), 50.0)
    if fear_greed < 25:
        score += 1
        evidence.append({"metric": "fear_greed", "bias": "bullish", "value": fear_greed})
    elif fear_greed > 75:
        score -= 1
        evidence.append({"metric": "fear_greed", "bias": "bearish", "value": fear_greed})

    coinbase_premium = _as_float(features.get("coinbase_premium"))
    if coinbase_premium > 0.001:
        score += 1
        evidence.append({"metric": "coinbase_premium", "bias": "bullish", "value": coinbase_premium})
    elif coinbase_premium < -0.001:
        score -= 1
        evidence.append({"metric": "coinbase_premium", "bias": "bearish", "value": coinbase_premium})

    bias = "neutral"
    if score > 0:
        bias = "bullish"
    elif score < 0:
        bias = "bearish"

    return {
        "ok": True,
        "owner": "engine",
        "plane": "fact",
        "kind": "confluence",
        "status": "transitional",
        "generated_at": ctx["generated_at"],
        "symbol": ctx["symbol"],
        "timeframe": ctx["timeframe"],
        "summary": {
            "bias": bias,
            "score": score,
            "evidenceCount": len(evidence),
            "confidencePct": min(85, 35 + len(evidence) * 8 + abs(score) * 6),
        },
        "inputs": {
            "price": _as_float(ctx["market"].get("price")),
            "funding_rate": funding_rate,
            "oi_change_24h": oi_change_24h,
            "mvrv_zscore": mvrv_zscore,
            "fear_greed": fear_greed,
            "coinbase_premium": coinbase_premium,
        },
        "evidence": evidence,
        "providerStates": {
            source_id: _source_contract(source_id, state)["state"]
            for source_id, state in ctx["sources"].items()
        },
        "notes": [
            "fact-based confluence summary; not the final engine search score",
            "intended as migration bridge until dedicated confluence store/scorer lands",
        ],
    }
