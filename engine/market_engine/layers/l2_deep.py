from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from market_engine.l2 import (
    AlphaResult,
    SResult,
    compute_alpha,
    compute_hunt_score,
    l1_wyckoff,
    l2_flow,
    l3_vsurge,
    l4_ob,
    l5_liq_estimate,
    l6_onchain,
    l7_fear_greed,
    l8_kimchi,
    l9_real_liq,
    l10_mtf,
    l11_cvd,
    l12_sector,
    l13_breakout,
    l14_bb,
    l15_atr,
    resolve_conflict,
    s1_activity,
    s2_liquidity,
    s3_trades,
    s4_momentum,
    s5_holders,
    s6_stage,
    s7_dex,
    s9_accumulation,
    s10_prepump,
    s11_predump,
    s14_multi_fr,
    s15_vol_compare,
    s16_bb,
    s17_ob,
    s19_oi_squeeze,
    s20_basis,
)
from market_engine.types import GlobalCtx, LayerResult
from market_engine.verdict import score_to_verdict


@dataclass
class DeepResult:
    symbol: str
    # Terminal-style: raw sum of all L2 layer scores (perp-heavy)
    total_score: float = 0.0
    verdict: str = ""
    layers: dict[str, LayerResult] = field(default_factory=dict)
    atr_levels: dict = field(default_factory=dict)
    # Hunter-style: S-series alpha score (fundamental / spot tokens)
    alpha: AlphaResult | None = None
    hunt_score: int | None = None
    # EXTREME VOLATILITY override when prepump+predump fire simultaneously
    conflict: dict | None = None


def run_deep_analysis(
    symbol: str,
    df_1h: pd.DataFrame,
    ctx: GlobalCtx,
    perp: dict | None = None,
    spot: dict | None = None,
) -> DeepResult:
    """Run all L2 indicators and return a fully populated DeepResult."""
    p = perp or {}
    s = spot or {}
    res = DeepResult(symbol=symbol)
    layers: dict[str, LayerResult] = {}

    last_close = float(df_1h["close"].iloc[-1])
    layers["wyckoff"] = l1_wyckoff(df_1h)
    layers["mtf"] = l10_mtf(df_1h)
    layers["breakout"] = l13_breakout(df_1h)
    layers["vsurge"] = l3_vsurge(df_1h)
    layers["cvd"] = l11_cvd(df_1h)
    layers["flow"] = l2_flow(
        fr=p.get("fr"),
        oi_pct=p.get("oi_pct"),
        ls_ratio=p.get("ls_ratio"),
        taker_ratio=p.get("taker_ratio"),
        price_pct=p.get("price_pct"),
    )
    layers["liq_est"] = l5_liq_estimate(p.get("fr"), last_close, p.get("oi_pct"))
    layers["real_liq"] = l9_real_liq(
        short_liq_usd=p.get("short_liq_usd", 0),
        long_liq_usd=p.get("long_liq_usd", 0),
        oi_notional=p.get("oi_notional"),
    )
    layers["oi"] = s19_oi_squeeze(p.get("oi_notional"), p.get("vol_24h"), p.get("fr"))
    layers["basis"] = s20_basis(p.get("mark_price"), p.get("index_price"))
    layers["bb14"] = l14_bb(df_1h)
    layers["bb16"] = s16_bb(df_1h)
    layers["atr"] = l15_atr(df_1h)

    if s.get("bid_total") is not None and s.get("ask_total") is not None:
        layers["ob"] = l4_ob(float(s["bid_total"]), float(s["ask_total"]))

    layers["onchain"] = l6_onchain(ctx)
    layers["fg"] = l7_fear_greed(ctx)
    layers["kimchi"] = l8_kimchi(symbol, last_close, ctx)
    layers["sector"] = l12_sector(symbol, ctx)

    total = sum(lr.score for lr in layers.values())
    total = max(-100.0, min(100.0, total))
    res.layers = layers
    res.total_score = round(total, 1)
    res.verdict = score_to_verdict(total)
    res.atr_levels = layers["atr"].meta

    if s:
        closes = df_1h["close"].tolist()
        s4_res = s4_momentum(closes)
        bull_div = s4_res.meta.get("bull_div", False)
        bear_div = s4_res.meta.get("bear_div", False)

        alpha_scores: dict[str, SResult] = {}
        alpha_scores["s1"] = s1_activity(
            vol_24h=float(s.get("vol_24h", 0)),
            market_cap=float(s.get("market_cap", 1)),
            count_24h=int(s.get("count_24h", 0)),
        )
        alpha_scores["s2"] = s2_liquidity(
            liquidity=float(s.get("liquidity", 0)),
            market_cap=float(s.get("market_cap", 1)),
            vol_24h=float(s.get("vol_24h", 1)),
        )
        alpha_scores["s3"] = s3_trades(
            buy_vol=float(s.get("buy_vol", 0)),
            sell_vol=float(s.get("sell_vol", 0)),
        )
        alpha_scores["s4"] = s4_res
        alpha_scores["s5"] = s5_holders(int(s.get("holders", 0)))
        alpha_scores["s6"] = s6_stage(
            is_spot=bool(s.get("is_spot", False)),
            is_futures=bool(s.get("is_futures", False)),
            pct_24h=float(s.get("pct_24h", 0.0)),
        )

        if s.get("dex_pm5") is not None:
            alpha_scores["s7"] = s7_dex(
                buy_pct_5m=float(s.get("dex_buy_pct_5m", 50)),
                pm5=float(s.get("dex_pm5", 0)),
                ph6=float(s.get("dex_ph6", 0)),
                liquidity_usd=float(s.get("dex_liquidity", 0)),
            )

        alpha_scores["s9"] = s9_accumulation(
            pct_24h=float(s.get("pct_24h", 0)),
            price_high_24h=float(s.get("price_high_24h", last_close * 1.01)),
            price_low_24h=float(s.get("price_low_24h", last_close * 0.99)),
            buy_pct=float(s.get("buy_pct", 50)),
            rsi=s4_res.meta.get("rsi", 50.0),
            vol=float(s.get("vol_24h", 0)),
            holders=int(s.get("holders", 0)),
            market_cap=float(s.get("market_cap", 1)),
        )
        alpha_scores["s10"] = s10_prepump(
            dex_pm5=float(s.get("dex_pm5", 0)),
            dex_ph6=float(s.get("dex_ph6", 0)),
            bull_div=bull_div,
            dex_buy_pct_5m=float(s.get("dex_buy_pct_5m", 50)),
        )
        alpha_scores["s11"] = s11_predump(
            dex_pm5=float(s.get("dex_pm5", 0)),
            bear_div=bear_div,
            dex_buy_pct_5m=float(s.get("dex_buy_pct_5m", 50)),
        )

        if s.get("mexc_fr") is not None or s.get("bitget_fr") is not None:
            alpha_scores["s14"] = s14_multi_fr(
                binance_fr=p.get("fr"),
                mexc_fr=s.get("mexc_fr"),
                bitget_fr=s.get("bitget_fr"),
            )
        if s.get("mexc_vol") is not None:
            alpha_scores["s15"] = s15_vol_compare(
                alpha_vol=float(s.get("vol_24h", 0)),
                mexc_vol=s.get("mexc_vol"),
                bitget_vol=s.get("bitget_vol"),
                mexc_pct=s.get("mexc_pct"),
            )

        if s.get("bid_total") is not None and s.get("ask_total") is not None:
            ob_lr = s17_ob(float(s["bid_total"]), float(s["ask_total"]))
            alpha_scores["s17"] = SResult(score=ob_lr.score, sigs=ob_lr.sigs, meta=ob_lr.meta)

        bb16_r = layers["bb16"]
        alpha_scores["s16"] = SResult(score=bb16_r.score, sigs=bb16_r.sigs, meta=bb16_r.meta)
        oi_r = layers["oi"]
        alpha_scores["s19"] = SResult(score=oi_r.score, sigs=oi_r.sigs, meta=oi_r.meta)

        res.alpha = compute_alpha(alpha_scores)
        res.hunt_score = compute_hunt_score(
            alpha_score=res.alpha.score,
            s10=alpha_scores["s10"],
            s11=alpha_scores["s11"],
            s9=alpha_scores["s9"],
            s16=alpha_scores.get("s16"),
            s19=alpha_scores.get("s19"),
        )

        res.conflict = resolve_conflict(alpha_scores["s10"], alpha_scores["s11"])
        if res.conflict:
            res.verdict = res.conflict["verdict"]

    return res
