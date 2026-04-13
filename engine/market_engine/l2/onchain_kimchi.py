"""L6 / L7 / L8 — BTC On-chain, Fear & Greed, Kimchi Premium.

Sources: Alpha Terminal L6_onchain(), L7_fg(), L8_kimchi()
"""
from __future__ import annotations

from market_engine.types import GlobalCtx, LayerResult
from sector_map import base_symbol as _base_symbol


# ── L6: BTC On-chain ──────────────────────────────────────────────────────

def l6_onchain(ctx: GlobalCtx) -> LayerResult:
    r = LayerResult()
    oc = ctx.btc_onchain
    mp = ctx.mempool
    fees = ctx.mempool_fees

    if not oc:
        r.sig("BTC 온체인 데이터 없음", "neut")
        return r

    n_tx      = oc.get("n_tx", 0)
    avg_val   = oc.get("avg_tx_val", 0.0)
    whale_sig = oc.get("whale_sig", "LOW")
    ex_flow   = oc.get("exchange_flow", "NORMAL")

    # Network activity
    if n_tx > 400_000:
        r.score += 6; r.sig(f"BTC Tx {n_tx:,}회 — 네트워크 활성 (+6)", "bull")
    elif n_tx < 150_000:
        r.score -= 4; r.sig(f"BTC Tx {n_tx:,}회 — 저활동 (-4)", "bear")
    else:
        r.sig(f"BTC Tx {n_tx:,}회 — 정상", "neut")

    # Whale activity
    if whale_sig == "HIGH":
        r.score += 6; r.sig(f"고래 이동 감지 (평균 Tx {avg_val:.2f} BTC) (+6)", "warn")
    elif whale_sig == "MED":
        r.score += 2

    if ex_flow == "WHALE_MOVE":
        r.sig("대규모 거래소 이동 감지", "warn")

    # Mempool congestion → high demand
    if mp:
        pending = mp.get("pending_tx", 0)
        mb      = mp.get("mempool_mb", 0)
        if pending > 100_000:
            r.score += 4; r.sig(f"멤풀 혼잡 {pending:,} Tx ({mb:.1f}MB) (+4)", "bull")

    # Fee signal
    fastest = (fees or {}).get("fastest_fee")
    if fastest and fastest > 100:
        r.score += 3; r.sig(f"수수료 {fastest} sat/vB — 고수요 (+3)", "bull")

    r.score = max(-10, min(15, round(r.score)))
    return r


# ── L7: Fear & Greed ─────────────────────────────────────────────────────

def l7_fear_greed(ctx: GlobalCtx) -> LayerResult:
    r = LayerResult()
    fg = ctx.fear_greed

    if fg is None:
        r.sig("Fear & Greed 데이터 없음", "neut")
        return r

    if fg <= 15:
        r.score = 8;  r.sig(f"극단적 공포 {fg} — 역발상 매수 (+8)", "bull")
    elif fg <= 25:
        r.score = 5;  r.sig(f"공포 구간 {fg} (+5)", "bull")
    elif fg <= 45:
        r.score = 2;  r.sig(f"약한 공포 {fg} (+2)", "bull")
    elif fg <= 55:
        r.score = 0;  r.sig(f"Fear & Greed {fg} — 중립", "neut")
    elif fg <= 75:
        r.score = -3; r.sig(f"탐욕 구간 {fg} (-3)", "bear")
    elif fg <= 85:
        r.score = -6; r.sig(f"강한 탐욕 {fg} (-6)", "bear")
    else:
        r.score = -8; r.sig(f"극단적 탐욕 {fg} — 고점 위험 (-8)", "bear")

    r.meta["fear_greed"] = fg
    r.score = max(-10, min(10, r.score))
    return r


# ── L8: Kimchi Premium ────────────────────────────────────────────────────

def l8_kimchi(
    symbol: str,
    binance_price: float,
    ctx: GlobalCtx,
) -> LayerResult:
    """
    Kimchi = (KRW_price / (binance_price × usdKrw) - 1) × 100
    Positive: KRW exchanges at premium → Korean demand > global
    Negative: KRW exchanges at discount → possible outflow signal
    """
    r = LayerResult()
    base = _base_symbol(symbol)   # strips USDT/BUSD/FDUSD/USDC/BTC/ETH/BNB

    usd_krw   = ctx.usd_krw
    upbit_p   = ctx.upbit_map.get(base)
    bithumb_p = ctx.bithumb_map.get(base)

    if usd_krw is None or usd_krw == 0:
        r.sig("환율 데이터 없음", "neut")
        return r

    krw_price = upbit_p or bithumb_p
    if krw_price is None or binance_price == 0:
        r.sig(f"{base} KRW 가격 없음", "neut")
        return r

    kimchi = (krw_price / (binance_price * usd_krw) - 1) * 100

    if kimchi >= 5.0:
        r.score = -10; r.sig(f"김치 프리미엄 {kimchi:.2f}% — 과열 거품 (-10)", "bear")
    elif kimchi >= 3.0:
        r.score = -6;  r.sig(f"김치 프리미엄 {kimchi:.2f}% (-6)", "bear")
    elif kimchi >= 1.0:
        r.score = -2;  r.sig(f"김치 프리미엄 {kimchi:.2f}% (-2)", "bear")
    elif kimchi <= -4.0:
        r.score = 8;   r.sig(f"김치 역프리미엄 {kimchi:.2f}% — 글로벌 강세 (+8)", "bull")
    elif kimchi <= -2.0:
        r.score = 4;   r.sig(f"김치 역프리미엄 {kimchi:.2f}% (+4)", "bull")
    else:
        r.sig(f"김치 프리미엄 {kimchi:.2f}% — 중립", "neut")

    r.meta.update({
        "kimchi_pct":  round(kimchi, 3),
        "krw_price":   krw_price,
        "usd_krw":     usd_krw,
        "source":      "upbit" if upbit_p else "bithumb",
    })
    r.score = max(-12, min(10, r.score))
    return r
