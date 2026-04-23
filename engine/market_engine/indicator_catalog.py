"""Canonical engine-owned indicator catalog for trader / CT metrics.

This catalog fixes the universe of high-signal metrics that repeatedly appear
across Crypto Twitter / X, CryptoQuant, Glassnode, DefiLlama, Dune, CoinGlass,
and adjacent trader tooling. The immediate goal is not to claim that every
metric is already live; it is to make the coverage state explicit and
machine-readable so fact-plane cutovers can execute against one source of truth.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

STATUS_ORDER = ("live", "partial", "blocked", "missing")
PROMOTION_STAGE_ORDER = ("cataloged", "readable", "operational", "promoted")
FAMILY_ORDER = (
    "technical",
    "derivatives",
    "onchain",
    "defi_dex",
    "options",
    "macro",
    "social_tokenomics",
)
OWNER_ORDER = ("engine", "app_bridge", "none")


@dataclass(frozen=True)
class IndicatorCatalogEntry:
    id: str
    label: str
    family: str
    status: str
    local_owner: str
    primary_sources: tuple[str, ...]
    notes: str

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["primary_sources"] = list(self.primary_sources)
        payload["current_owner"] = payload.pop("local_owner")
        payload["promotion_stage"] = promotion_stage_for_entry(self)
        payload["next_gate"] = next_gate_for_stage(payload["promotion_stage"])
        return payload


def _m(
    indicator_id: str,
    label: str,
    family: str,
    status: str,
    local_owner: str,
    primary_sources: tuple[str, ...],
    notes: str,
) -> IndicatorCatalogEntry:
    if status not in STATUS_ORDER:
        raise ValueError(f"invalid status: {status}")
    if family not in FAMILY_ORDER:
        raise ValueError(f"invalid family: {family}")
    if local_owner not in OWNER_ORDER:
        raise ValueError(f"invalid local owner: {local_owner}")
    return IndicatorCatalogEntry(
        id=indicator_id,
        label=label,
        family=family,
        status=status,
        local_owner=local_owner,
        primary_sources=primary_sources,
        notes=notes,
    )


CATALOG: tuple[IndicatorCatalogEntry, ...] = (
    # Technical (10)
    _m("rsi_14", "RSI (14)", "technical", "live", "engine", ("engine_features", "tradingview"), "Baseline momentum oscillator already computed in engine features."),
    _m("ema_20_50_200_alignment", "EMA 20/50/200 Alignment", "technical", "live", "engine", ("engine_features", "tradingview"), "Trend stack used in scanner signal snapshots."),
    _m("ema_50_200_cross", "EMA 50/200 Cross", "technical", "live", "engine", ("engine_features", "tradingview"), "Golden/death-cross style structure available from engine EMA fields."),
    _m("macd_histogram", "MACD Histogram", "technical", "live", "engine", ("engine_features", "tradingview"), "MACD histogram already present in canonical feature vector."),
    _m("bollinger_band_width", "Bollinger Band Width", "technical", "live", "engine", ("engine_features", "tradingview"), "BB width exists in feature vector and squeeze logic."),
    _m("atr", "ATR", "technical", "live", "engine", ("engine_features", "tradingview"), "ATR and ATR regime already exist in engine features."),
    _m("volume_profile_hvn_lvn", "Volume Profile HVN/LVN", "technical", "partial", "engine", ("chart_surface", "tradingview"), "Used in chart surfaces, but not yet a canonical engine fact object."),
    _m("vwap", "VWAP", "technical", "live", "engine", ("engine_features", "tradingview"), "VWAP ratio already computed in engine signal snapshot."),
    _m("obv", "OBV", "technical", "live", "engine", ("engine_features", "tradingview"), "OBV slope already computed in engine features."),
    _m("supertrend", "Supertrend", "technical", "live", "engine", ("engine_features", "tradingview"), "Supertrend signal and distance already present in engine features."),
    # Derivatives (18)
    _m("funding_rate", "Funding Rate", "derivatives", "live", "engine", ("binance_perp", "coinalyze"), "Canonical crowding metric already wired into engine/perp context."),
    _m("predicted_funding_rate", "Predicted Funding Rate", "derivatives", "partial", "app_bridge", ("binance_perp",), "Available in app-side war-room paths, not yet engine fact-plane owned."),
    _m("funding_rate_percentile", "Funding Rate Percentile", "derivatives", "live", "app_bridge", ("binance_history",), "Live percentile route exists, but remains app-owned."),
    _m("funding_flip", "Funding Flip", "derivatives", "live", "app_bridge", ("binance_history",), "Dedicated funding-flip route exists in app compatibility layer."),
    _m("open_interest", "Open Interest", "derivatives", "live", "app_bridge", ("binance_perp", "coinalyze"), "Live in current market routes and used by terminal surfaces."),
    _m("oi_change_1h", "OI Change 1H", "derivatives", "live", "engine", ("engine_perp", "binance_perp"), "Canonical engine feature already computed for scanner/runtime."),
    _m("oi_change_24h", "OI Change 24H", "derivatives", "live", "engine", ("engine_perp", "binance_perp"), "Canonical engine feature already computed for scanner/runtime."),
    _m("oi_percentile", "OI Percentile", "derivatives", "live", "app_bridge", ("binance_history",), "Live percentile context exists in app route; engine cutover pending."),
    _m("long_short_ratio", "Long/Short Ratio", "derivatives", "live", "engine", ("binance_perp", "coinalyze"), "Already part of engine snapshot/perp context."),
    _m("top_trader_long_short_ratio", "Top Trader Long/Short Ratio", "derivatives", "missing", "none", ("binance_top_trader", "coinglass"), "Referenced by CT traders, but no canonical local implementation exists."),
    _m("taker_buy_sell_ratio", "Taker Buy/Sell Ratio", "derivatives", "live", "engine", ("binance_perp", "cryptoquant"), "Engine already stores taker-buy ratio in feature vector."),
    _m("taker_cvd_90d", "Taker CVD (90D)", "derivatives", "partial", "none", ("cryptoquant",), "CryptoQuant/X popular metric; no dedicated read model yet."),
    _m("liquidation_heatmap", "Liquidation Heatmap", "derivatives", "partial", "app_bridge", ("binance_force_orders", "coinglass"), "Current implementation is approximation; real WS ingestion still open."),
    _m("liquidation_clusters", "Liquidation Clusters", "derivatives", "partial", "app_bridge", ("binance_force_orders", "derived"), "Live approximation route exists, but not full multi-venue canonical heatmap."),
    _m("long_liquidations_24h", "Long Liquidations 24H", "derivatives", "live", "app_bridge", ("binance_force_orders", "coinglass"), "Exposed in current derivatives/flow surfaces."),
    _m("short_liquidations_24h", "Short Liquidations 24H", "derivatives", "live", "app_bridge", ("binance_force_orders", "coinglass"), "Exposed in current derivatives/flow surfaces."),
    _m("perp_spot_basis", "Perp/Spot Basis", "derivatives", "partial", "engine", ("binance_perp", "coinbase_spot"), "Engine logic exists, but canonical route/export is still thin."),
    _m("venue_divergence", "Venue Divergence", "derivatives", "live", "app_bridge", ("binance", "bybit", "okx"), "Dedicated live route exists and is already surfaced."),
    # On-chain (24)
    _m("exchange_reserve", "Exchange Reserve", "onchain", "partial", "app_bridge", ("cryptoquant", "coinmetrics"), "Available through app-side on-chain proxy; not yet canonical engine object."),
    _m("exchange_netflow", "Exchange Netflow", "onchain", "partial", "app_bridge", ("coinmetrics", "etherscan", "dune"), "Proxy paths exist, but Arkham-grade canonical lane remains open."),
    _m("exchange_inflow", "Exchange Inflow", "onchain", "partial", "app_bridge", ("coinmetrics",), "Raw flow components exist in fallback client, but not exposed as first-class fact."),
    _m("exchange_outflow", "Exchange Outflow", "onchain", "partial", "app_bridge", ("coinmetrics",), "Raw flow components exist in fallback client, but not exposed as first-class fact."),
    _m("exchange_whale_ratio", "Exchange Whale Ratio", "onchain", "blocked", "app_bridge", ("cryptoquant",), "Implementation path exists, but exact data requires CryptoQuant key access."),
    _m("whale_netflow", "Whale Netflow", "onchain", "partial", "app_bridge", ("cryptoquant", "geckoterminal"), "Current coverage is mixed proxy + key-gated exact path."),
    _m("whale_tx_count", "Whale Transaction Count", "onchain", "live", "app_bridge", ("dune", "etherscan"), "Live Dune-backed large transaction count already exposed."),
    _m("active_addresses", "Active Addresses", "onchain", "live", "engine", ("coinmetrics", "dune"), "Live in engine fetchers and app-side ETH proxy."),
    _m("new_addresses", "New Addresses", "onchain", "missing", "none", ("glassnode", "cryptoquant"), "Frequently cited on X, but no local fetch path exists yet."),
    _m("transaction_count", "Transaction Count", "onchain", "live", "engine", ("coinmetrics",), "Engine fetcher already supports daily transaction count."),
    _m("transaction_volume", "Transaction Volume", "onchain", "missing", "none", ("glassnode", "coinmetrics"), "Not yet normalized into local fact plane."),
    _m("mvrv_ratio", "MVRV Ratio", "onchain", "partial", "engine", ("coinmetrics", "cryptoquant"), "Available, but mixed engine/app coverage and not fully canonicalized across surfaces."),
    _m("mvrv_zscore", "MVRV Z-Score", "onchain", "live", "engine", ("coinmetrics", "glassnode"), "Engine fetcher and signal contract already include canonical MVRV z-score."),
    _m("nupl", "NUPL", "onchain", "partial", "app_bridge", ("coinmetrics", "cryptoquant"), "Proxy approximation exists via CoinMetrics fallback; exact canonical path not frozen."),
    _m("sopr", "SOPR", "onchain", "blocked", "app_bridge", ("cryptoquant", "glassnode"), "Exact metric is key/paywall-dependent in current implementation."),
    _m("lth_sopr", "LTH SOPR", "onchain", "blocked", "none", ("glassnode", "cryptoquant"), "Popular CT cycle metric; no free/local canonical lane currently exists."),
    _m("realized_price", "Realized Price", "onchain", "missing", "none", ("glassnode",), "Widely cited on X, but not yet implemented locally."),
    _m("sth_cost_basis", "STH Cost Basis", "onchain", "missing", "none", ("glassnode",), "Common Glassnode reference line; no local implementation yet."),
    _m("percent_supply_in_profit", "Percent Supply in Profit", "onchain", "missing", "none", ("glassnode", "cryptoquant"), "Frequently used cycle metric not yet present locally."),
    _m("accumulation_trend_score", "Accumulation Trend Score", "onchain", "missing", "none", ("glassnode",), "No local fetch/compute path exists yet."),
    _m("miner_reserve", "Miner Reserve", "onchain", "blocked", "app_bridge", ("cryptoquant",), "Implemented behind key-gated CryptoQuant path."),
    _m("miner_outflow", "Miner Outflow", "onchain", "blocked", "app_bridge", ("cryptoquant",), "Implemented behind key-gated CryptoQuant path."),
    _m("puell_multiple", "Puell Multiple", "onchain", "live", "engine", ("coinmetrics", "cryptoquant"), "Engine fetcher already computes canonical Puell Multiple."),
    _m("hodl_waves", "HODL Waves", "onchain", "missing", "none", ("glassnode",), "High-signal holder age metric not implemented locally."),
    # DeFi / DEX (18)
    _m("total_tvl", "Total TVL", "defi_dex", "live", "app_bridge", ("defillama",), "Live via current DeFiLlama client and app snapshot paths."),
    _m("chain_tvl", "Chain TVL", "defi_dex", "live", "app_bridge", ("defillama",), "Live via current DeFiLlama chain rankings."),
    _m("protocol_tvl", "Protocol TVL", "defi_dex", "live", "app_bridge", ("defillama",), "Live via top protocol rankings."),
    _m("dex_volume_24h", "DEX Volume 24H", "defi_dex", "partial", "app_bridge", ("dune", "defillama"), "Dune query ID exists, but no canonical engine route exports it yet."),
    _m("dex_volume_7d", "DEX Volume 7D", "defi_dex", "missing", "none", ("defillama", "dune"), "Common CT metric, but no local normalized output exists."),
    _m("perps_volume", "Perps Volume", "defi_dex", "missing", "none", ("defillama", "coinglass"), "Not yet normalized into local fact plane."),
    _m("dex_cex_volume_ratio", "DEX/CEX Volume Ratio", "defi_dex", "missing", "none", ("defillama", "coingecko"), "No local compute/export lane exists yet."),
    _m("volume_tvl_ratio", "Volume/TVL Ratio", "defi_dex", "missing", "none", ("defillama", "dune"), "Important DeFi efficiency metric not yet computed locally."),
    _m("unique_swappers", "Unique Swappers", "defi_dex", "missing", "none", ("dune",), "Frequently cited on Dune/X, not implemented locally."),
    _m("active_traders", "Active Traders", "defi_dex", "missing", "none", ("dune",), "No local normalized lane exists."),
    _m("fees_generated", "Fees Generated", "defi_dex", "missing", "none", ("defillama", "tokenterminal"), "Important protocol health metric still absent locally."),
    _m("protocol_revenue", "Protocol Revenue", "defi_dex", "missing", "none", ("defillama", "tokenterminal"), "Widely referenced fundamental metric not yet present."),
    _m("stablecoin_market_cap", "Stablecoin Market Cap", "defi_dex", "live", "app_bridge", ("defillama", "coingecko"), "Live in existing app snapshot / DefiLlama client."),
    _m("stablecoin_supply_ratio", "Stablecoin Supply Ratio", "defi_dex", "live", "app_bridge", ("defillama", "coincap"), "Dedicated live SSR route exists today."),
    _m("bridge_volume", "Bridge Volume", "defi_dex", "missing", "none", ("defillama",), "Not yet normalized into local routes."),
    _m("liquidity_depth", "Liquidity Depth", "defi_dex", "partial", "app_bridge", ("dexscreener", "depth_ladder"), "Depth exists for market surfaces, but not as canonical DEX liquidity object."),
    _m("slippage", "Slippage / Price Impact", "defi_dex", "missing", "none", ("dexscreener", "dune"), "No local fact computation/export exists."),
    _m("top_token_pairs", "Top Token Pairs", "defi_dex", "missing", "none", ("dune", "dexscreener"), "High-signal DEX trend metric not yet modeled."),
    # Options (10)
    _m("put_call_oi_ratio", "Put/Call OI Ratio", "options", "live", "app_bridge", ("deribit",), "Live via options snapshot route."),
    _m("put_call_volume_ratio", "Put/Call Volume Ratio", "options", "live", "app_bridge", ("deribit",), "Live via options snapshot route."),
    _m("skew_25d", "25D Skew", "options", "live", "app_bridge", ("deribit",), "Live via options snapshot route."),
    _m("atm_iv", "ATM IV", "options", "live", "app_bridge", ("deribit",), "Live via options snapshot route."),
    _m("dvol", "DVOL", "options", "partial", "app_bridge", ("deribit",), "Current implementation is ATM-IV proxy, not true DVOL index."),
    _m("total_options_oi", "Total Options OI", "options", "live", "app_bridge", ("deribit",), "Live via options snapshot route."),
    _m("gamma_exposure", "Gamma Exposure", "options", "partial", "app_bridge", ("deribit",), "Phase-1 only has heuristic gamma-levels, not full GEX."),
    _m("gamma_flip_level", "Gamma Flip Level", "options", "partial", "app_bridge", ("deribit",), "Current route exposes heuristic pin/gamma levels; full model is pending."),
    _m("max_pain", "Max Pain", "options", "partial", "app_bridge", ("deribit",), "Heuristic max-pain output exists inside options snapshot."),
    _m("open_interest_by_expiry", "Options OI by Expiry", "options", "live", "app_bridge", ("deribit",), "Nearest-expiry summaries already ship in options snapshot payload."),
    # Macro / cross-market (9)
    _m("fear_greed_index", "Fear & Greed Index", "macro", "live", "engine", ("alternative_me",), "Canonical engine/global context already includes Fear & Greed."),
    _m("coinbase_premium", "Coinbase Premium", "macro", "live", "engine", ("coinbase", "binance"), "Engine has dedicated fetch/building blocks for Coinbase premium."),
    _m("etf_net_inflows", "ETF Net Inflows", "macro", "missing", "none", ("etf_issuers", "farside"), "Important CT macro flow metric, but no local lane exists."),
    _m("btc_dominance", "BTC Dominance", "macro", "partial", "app_bridge", ("coingecko_global",), "Available in app market snapshot paths, not yet canonical engine read model."),
    _m("dxy_index", "DXY Index", "macro", "partial", "app_bridge", ("yahoo_finance",), "Macro price series are fetched in app snapshot layer, not canonical engine fact plane."),
    _m("vix_index", "VIX Index", "macro", "partial", "app_bridge", ("yahoo_finance",), "Macro price series are fetched in app snapshot layer, not canonical engine fact plane."),
    _m("us10y_yield", "US 10Y Yield", "macro", "partial", "app_bridge", ("yahoo_finance",), "Macro rates are available as app-side series only."),
    _m("macro_event_calendar", "Macro Event Calendar", "macro", "live", "app_bridge", ("macro_calendar",), "Dedicated route already exists in market API layer."),
    _m("kimchi_premium", "Kimchi Premium", "macro", "live", "engine", ("upbit", "bithumb", "usdkrw"), "Canonical engine global context already supports kimchi premium."),
    # Social / tokenomics (11)
    _m("social_sentiment", "Social Sentiment", "social_tokenomics", "partial", "app_bridge", ("lunarcrush", "santiment"), "Live in app paths, but key/provider dependency keeps it non-canonical."),
    _m("social_volume", "Social Volume", "social_tokenomics", "partial", "app_bridge", ("lunarcrush", "santiment"), "Live in app paths, but not yet engine-owned."),
    _m("social_dominance", "Social Dominance", "social_tokenomics", "partial", "app_bridge", ("lunarcrush",), "Live in app paths, but not yet engine-owned."),
    _m("galaxy_score", "Galaxy Score", "social_tokenomics", "partial", "app_bridge", ("lunarcrush",), "Live in app paths, but not yet engine-owned."),
    _m("trending_mentions_velocity", "Trending Mentions Velocity", "social_tokenomics", "missing", "none", ("x", "lunarcrush"), "No local normalized velocity metric yet."),
    _m("token_unlock_schedule", "Token Unlock Schedule", "social_tokenomics", "blocked", "none", ("tokenomist",), "Source selected, but no local ingestion and provider access is not wired."),
    _m("vesting_cliff_pressure", "Vesting Cliff Pressure", "social_tokenomics", "blocked", "none", ("tokenomist",), "Depends on token unlock / vesting source lane that is not wired yet."),
    _m("fundraising_flow", "Fundraising Flow", "social_tokenomics", "blocked", "none", ("rootdata",), "Source selected, but no local ingestion and provider access is not wired."),
    _m("smart_money_wallet_flows", "Smart Money Wallet Flows", "social_tokenomics", "blocked", "none", ("arkham", "etherscan", "solscan"), "Targeted by W-0122, but canonical wallet-label pipeline is not ready."),
    _m("market_maker_wallet_flows", "Market Maker Wallet Flows", "social_tokenomics", "blocked", "none", ("arkham",), "User-provided MM wallet thesis is relevant, but no canonical labeled wallet lane exists."),
    _m("labeled_fund_wallet_activity", "Labeled Fund Wallet Activity", "social_tokenomics", "blocked", "none", ("arkham", "manual_wallet_registry"), "Research inputs exist, but no runtime labeled-wallet tracker is wired yet."),
)

if len(CATALOG) != 100:
    raise RuntimeError(f"indicator catalog must contain exactly 100 metrics, got {len(CATALOG)}")


def _ordered_counts(values: list[str], order: tuple[str, ...]) -> dict[str, int]:
    counts = Counter(values)
    return {key: int(counts.get(key, 0)) for key in order}


def promotion_stage_for_entry(entry: IndicatorCatalogEntry) -> str:
    """Map current coverage truth into the Karpathy-style promotion loop.

    cataloged   -> inventoried only; no dependable local lane
    readable    -> partial/proxy/local evidence exists but not yet operational
    operational -> usable now, but still bridge/transitional
    promoted    -> engine-owned canonical lane fit for cutover consumers
    """
    if entry.status in {"blocked", "missing"}:
        return "cataloged"
    if entry.status == "partial":
        if entry.local_owner == "engine":
            return "readable"
        return "cataloged" if entry.local_owner == "none" else "readable"
    if entry.status == "live":
        if entry.local_owner == "engine":
            return "promoted"
        if entry.local_owner == "app_bridge":
            return "operational"
    return "cataloged"


def next_gate_for_stage(stage: str) -> str:
    if stage == "cataloged":
        return "implement local ingress/read path or unblock provider access"
    if stage == "readable":
        return "add bounded route, tests, and degraded-state contract"
    if stage == "operational":
        return "cut app/search/agent consumers over to the canonical engine contract"
    return "keep contract stable and widen canonical consumers"


def normalize_indicator_catalog_filters(
    *,
    status: str | None = None,
    family: str | None = None,
    stage: str | None = None,
    query: str | None = None,
) -> dict[str, str | None]:
    normalized_status = status.strip().lower() if status else None
    normalized_family = family.strip().lower() if family else None
    normalized_stage = stage.strip().lower() if stage else None
    normalized_query = query.strip() if query else None

    if normalized_status is not None and normalized_status not in STATUS_ORDER:
        raise ValueError(f"status must be one of {', '.join(STATUS_ORDER)}")
    if normalized_family is not None and normalized_family not in FAMILY_ORDER:
        raise ValueError(f"family must be one of {', '.join(FAMILY_ORDER)}")
    if normalized_stage is not None and normalized_stage not in PROMOTION_STAGE_ORDER:
        raise ValueError(f"stage must be one of {', '.join(PROMOTION_STAGE_ORDER)}")

    return {
        "status": normalized_status,
        "family": normalized_family,
        "stage": normalized_stage,
        "query": normalized_query,
    }


def build_indicator_catalog(
    *,
    status: str | None = None,
    family: str | None = None,
    stage: str | None = None,
    query: str | None = None,
) -> dict[str, Any]:
    filtered = list(CATALOG)
    if status is not None:
        filtered = [entry for entry in filtered if entry.status == status]
    if family is not None:
        filtered = [entry for entry in filtered if entry.family == family]
    if stage is not None:
        filtered = [entry for entry in filtered if promotion_stage_for_entry(entry) == stage]
    if query:
        q = query.strip().lower()
        filtered = [
            entry for entry in filtered
            if q in entry.id.lower() or q in entry.label.lower() or q in entry.notes.lower()
        ]

    live_count = sum(1 for entry in CATALOG if entry.status == "live")
    partial_count = sum(1 for entry in CATALOG if entry.status == "partial")

    return {
        "ok": True,
        "owner": "engine",
        "plane": "fact",
        "kind": "indicator_catalog",
        "status": "transitional",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(CATALOG),
        "matched": len(filtered),
        "filters": {
            "status": status,
            "family": family,
            "stage": stage,
            "query": query,
        },
        "coverage": {
            "live": live_count,
            "partial": partial_count,
            "usable_now": live_count + partial_count,
            "coverage_pct": round(((live_count + partial_count) / len(CATALOG)) * 100, 1),
        },
        "counts": {
            "status": _ordered_counts([entry.status for entry in CATALOG], STATUS_ORDER),
            "family": _ordered_counts([entry.family for entry in CATALOG], FAMILY_ORDER),
            "owner": _ordered_counts([entry.local_owner for entry in CATALOG], OWNER_ORDER),
            "stage": _ordered_counts([promotion_stage_for_entry(entry) for entry in CATALOG], PROMOTION_STAGE_ORDER),
        },
        "metrics": [entry.to_dict() for entry in filtered],
        "notes": [
            "catalog source basis = X/CT discourse + official platform surfaces",
            "status=live means locally usable today; partial means proxy/app-bridge/heuristic; blocked means provider/key/paywall constraint; missing means no local lane yet",
            "engine owns the catalog truth even when current data path still lives in app_bridge",
            "promotion_stage follows the Karpathy-style execution loop: cataloged -> readable -> operational -> promoted",
        ],
    }
