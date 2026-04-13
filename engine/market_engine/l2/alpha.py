"""S1–S20 — Alpha Hunter signal set + Score Deflation + Hunt Score.

Ported faithfully from Alpha Hunter v2.0 (나혼자 매매 아카).
All functions are pure / synchronous.  Callers are responsible for
fetching the raw data (token metadata, klines, DEX pair, order book, etc.)
before calling these.

Main entry points:
    compute_alpha(scores)     → AlphaResult  (deflated score + verdict)
    compute_hunt_score(...)   → int           (final hunt score)
    resolve_conflict(s10, s11)→ dict | None   (EXTREME VOLATILITY override)
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class SResult:
    """Result of one signal function."""
    score: float = 0.0
    sigs: list[dict] = field(default_factory=list)
    meta: dict = field(default_factory=dict)

    def sig(self, text: str, kind: str = "neut") -> None:
        self.sigs.append({"t": text, "type": kind})


# ── helpers ───────────────────────────────────────────────────────────────

def _rsi(closes: list[float], period: int = 14) -> float:
    """Wilder-smoothed RSI (matches TradingView / standard definition).

    Seed: simple average of first `period` up/down moves.
    Then: avg = prev_avg * (period-1)/period + current / period  (Wilder EMA).
    """
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(0.0, d) for d in deltas]
    losses = [max(0.0, -d) for d in deltas]

    # Seed with simple average over first window
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Wilder smoothing for remaining bars
    for g, l in zip(gains[period:], losses[period:]):
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period

    if avg_loss == 0:
        return 100.0
    return round(100 - 100 / (1 + avg_gain / avg_loss), 1)


def _ema(values: list[float], n: int) -> float:
    k = 2 / (n + 1)
    e = values[0]
    for v in values:
        e = v * k + e * (1 - k)
    return e


# ── S1: Activity ─────────────────────────────────────────────────────────

def s1_activity(vol_24h: float, market_cap: float, count_24h: int = 0) -> SResult:
    r = SResult()
    mc = market_cap or 1
    ratio = vol_24h / mc
    avg_trade = vol_24h / count_24h if count_24h > 0 else 0

    if ratio > 1.0:
        r.score = 15; r.sig(f"거래량/시총 {ratio*100:.0f}% 극도 활발 — 펌프/덤프 임박", "warn")
    elif ratio > 0.5:
        r.score = 10; r.sig(f"거래량/시총 {ratio*100:.0f}% 매우 활발", "bull")
    elif ratio > 0.2:
        r.score = 5;  r.sig(f"거래량/시총 {ratio*100:.0f}% 활발", "bull")
    elif ratio > 0.1:
        r.score = 0;  r.sig(f"거래량/시총 {ratio*100:.0f}% 보통", "neut")
    else:
        r.score = -10; r.sig(f"거래량/시총 {ratio*100:.2f}% 극저 — 관심 없음", "bear")

    r.score = max(-15, min(20, round(r.score)))
    r.meta.update({"ratio": ratio, "avg_trade": avg_trade})
    return r


# ── S2: Liquidity ────────────────────────────────────────────────────────

def s2_liquidity(liquidity: float, market_cap: float, vol_24h: float) -> SResult:
    r = SResult()
    mc = market_cap or 1
    liq_ratio = liquidity / mc
    liq_vol   = liquidity / vol_24h if vol_24h > 0 else 999

    if liq_ratio > 0.5:
        r.score = 10; r.sig(f"유동성/시총 {liq_ratio*100:.0f}% 매우 건강", "bull")
    elif liq_ratio > 0.2:
        r.score = 5;  r.sig(f"유동성/시총 {liq_ratio*100:.0f}% 건강", "bull")
    elif liq_ratio > 0.1:
        r.score = 0;  r.sig(f"유동성/시총 {liq_ratio*100:.0f}% 보통", "neut")
    elif liq_ratio > 0.05:
        r.score = -5; r.sig(f"유동성/시총 {liq_ratio*100:.1f}% 낮음 — 슬리피지 위험", "bear")
    else:
        r.score = -20; r.sig(f"유동성/시총 {liq_ratio*100:.2f}% 극저 — 러그풀 위험", "bear")

    r.score = max(-20, min(15, round(r.score)))
    r.meta.update({"liq_ratio": liq_ratio, "liq_vol": liq_vol, "liquidity": liquidity})
    return r


# ── S3: Trades (aggTrades buy/sell ratio) ────────────────────────────────

def s3_trades(buy_vol: float, sell_vol: float) -> SResult:
    r = SResult()
    total = (buy_vol + sell_vol) or 1
    buy_pct  = buy_vol  / total * 100
    sell_pct = sell_vol / total * 100

    if buy_pct >= 75:
        r.score = 15; r.sig(f"매수 주도 {buy_pct:.0f}% — 강한 축적", "bull")
    elif buy_pct >= 65:
        r.score = 10; r.sig(f"매수 주도 {buy_pct:.0f}%", "bull")
    elif buy_pct <= 25:
        r.score = -15; r.sig(f"매도 주도 {sell_pct:.0f}% — 강한 분산", "bear")
    elif buy_pct <= 35:
        r.score = -10; r.sig(f"매도 주도 {sell_pct:.0f}%", "bear")
    else:
        r.sig(f"매수/매도 균형 ({buy_pct:.0f}%/{sell_pct:.0f}%)", "neut")

    r.score = max(-20, min(20, round(r.score)))
    r.meta.update({"buy_pct": buy_pct, "sell_pct": sell_pct})
    return r


# ── S4: Momentum (RSI + EMA + divergence) ────────────────────────────────

def s4_momentum(closes: list[float]) -> SResult:
    r = SResult()
    if len(closes) < 15:
        r.sig("캔들 데이터 없음", "neut"); return r

    rsi      = _rsi(closes)
    rsi_prev = _rsi(closes[:-14]) if len(closes) >= 28 else rsi

    # Divergence: price fell but RSI rose → bullish; price rose but RSI fell → bearish
    bull_div = closes[-1] < closes[-14] and rsi > rsi_prev
    bear_div = closes[-1] > closes[-14] and rsi < rsi_prev

    ema7  = _ema(closes[-30:], 7)
    ema25 = _ema(closes[-30:], 25)
    trend = "UP" if ema7 > ema25 * 1.01 else ("DOWN" if ema7 < ema25 * 0.99 else "FLAT")

    if rsi <= 25:
        r.score += 10; r.sig(f"RSI {rsi} 극단 과매도 — 강한 반등 가능", "bull")
    elif rsi >= 75:
        r.score -= 10; r.sig(f"RSI {rsi} 극단 과매수 — 조정 경보", "bear")
    else:
        r.sig(f"RSI {rsi} 중립", "neut")

    if bull_div:
        r.score += 8; r.sig("RSI 강세 다이버전스 ★", "bull")
    if bear_div:
        r.score -= 8; r.sig("RSI 약세 다이버전스 ★", "bear")
    if trend == "UP":
        r.score += 4; r.sig("단기 상승 추세", "bull")
    elif trend == "DOWN":
        r.score -= 4; r.sig("단기 하락 추세", "bear")

    r.score = max(-20, min(20, round(r.score)))
    r.meta.update({"rsi": rsi, "trend": trend, "bull_div": bull_div, "bear_div": bear_div})
    return r


# ── S5: Holders ──────────────────────────────────────────────────────────

def s5_holders(holders: int) -> SResult:
    r = SResult()
    if holders > 10_000:
        r.score = 5;  r.sig(f"홀더 {holders:,}명 — 중대형 커뮤니티", "bull")
    elif holders > 3_000:
        r.score = 2;  r.sig(f"홀더 {holders:,}명", "bull")
    elif holders < 500:
        r.score = -5; r.sig(f"홀더 {holders}명 — 매우 적음 (러그풀 위험)", "bear")
    else:
        r.sig(f"홀더 {holders:,}명 — 보통", "neut")
    r.score = max(-10, min(10, round(r.score)))
    r.meta["holders"] = holders
    return r


# ── S6: Stage (PRE / SPOT / FUTURES) ────────────────────────────────────

def s6_stage(is_spot: bool, is_futures: bool, pct_24h: float = 0.0) -> SResult:
    r = SResult()
    if is_futures:
        r.score = 3; r.sig("바이낸스 선물 상장", "bull")
    elif is_spot:
        r.score = 5; r.sig("바이낸스 현물 상장", "bull")
    else:
        if pct_24h > 20:
            r.score = 8; r.sig(f"DEX 미상장 +{pct_24h:.1f}% — Spot 상장 기대감", "bull")
        else:
            r.sig("DEX 전용 (미상장)", "neut")
    r.score = max(-5, min(10, round(r.score)))
    return r


# ── S7: DexScreener ──────────────────────────────────────────────────────

def s7_dex(
    buy_pct_5m: float,
    pm5: float,
    ph6: float,
    liquidity_usd: float,
) -> SResult:
    """
    buy_pct_5m  : % buy trades in last 5 min
    pm5         : % price change in 5 min
    ph6         : % price change in 6 hours
    liquidity_usd: DEX liquidity in USD
    """
    r = SResult()
    r.meta["has_dex"] = True
    r.meta.update({"buy_pct_5m": buy_pct_5m, "pm5": pm5, "ph6": ph6})

    if buy_pct_5m >= 75:
        r.score += 12; r.sig(f"DEX 5분 매수 {buy_pct_5m:.0f}%", "bull")
    elif buy_pct_5m <= 25:
        r.score -= 12; r.sig(f"DEX 5분 매도 {100-buy_pct_5m:.0f}%", "bear")
    else:
        r.sig(f"DEX 5분 균형 (매수 {buy_pct_5m:.0f}%)", "neut")

    if pm5 > 5 and abs(ph6) < 5:
        r.score += 8; r.sig(f"5분 +{pm5:.1f}% 급등 — 초기 선행 ★", "bull")
    if pm5 < -5 and abs(ph6) < 5:
        r.score -= 8; r.sig(f"5분 {pm5:.1f}% 급락 — 하락 선행 ★", "bear")

    if liquidity_usd > 1_000_000:
        r.score += 5; r.sig(f"DEX 유동성 ${liquidity_usd/1e6:.1f}M — 우수", "bull")
    elif liquidity_usd < 10_000:
        r.score -= 10; r.sig(f"DEX 유동성 ${liquidity_usd:.0f} 극저 — 러그풀 위험", "bear")

    r.score = max(-20, min(20, round(r.score)))
    return r


# ── S9: Accumulation ─────────────────────────────────────────────────────

def s9_accumulation(
    pct_24h: float,
    price_high_24h: float,
    price_low_24h: float,
    buy_pct: float,
    rsi: float,
    vol: float,
    holders: int,
    market_cap: float,
) -> SResult:
    r = SResult()
    if vol < 10_000 or holders < 100 or market_cap < 5_000:
        r.score = -3; r.sig("매집 분석 불가 (유동성 부족)", "neut"); return r

    conditions = []
    is_flat = abs(pct_24h) < 8
    price_range = (price_high_24h - price_low_24h) / price_low_24h * 100 if price_low_24h > 0 else 100

    if is_flat and price_range < 20:
        r.score += 8; conditions.append("가격 횡보"); r.sig("가격 횡보+레인지 압축", "bull")
    if buy_pct >= 58:
        r.score += 6; conditions.append("매수 우세"); r.sig(f"체결 매수 {buy_pct:.0f}%", "bull")
    if 28 <= rsi <= 52:
        r.score += 5; conditions.append("RSI 회복"); r.sig(f"RSI {rsi} 회복 구간", "bull")

    cc = len(conditions)
    if cc >= 3:
        r.score += 10; r.sig(f"매집 조건 완벽 ({'+'.join(conditions)})", "bull")
    elif cc == 0 and pct_24h < -10:
        r.score -= 5; r.sig("매집 신호 없음", "bear")

    is_accumulating = cc >= 2
    r.score = max(-10, min(25, round(r.score)))
    r.meta.update({"cond_count": cc, "conditions": conditions, "is_accumulating": is_accumulating})
    return r


# ── S10: Pre-Pump ────────────────────────────────────────────────────────

def s10_prepump(
    dex_pm5: float = 0.0,
    dex_ph6: float = 0.0,
    bull_div: bool = False,
    dex_buy_pct_5m: float = 50.0,
) -> SResult:
    r = SResult()
    triggers = []

    if abs(dex_ph6) < 8 and dex_pm5 > 3:
        r.score += 10; triggers.append("5분 선행 돌파"); r.sig(f"5분 +{dex_pm5:.1f}% — 급등 초기", "bull")
    if bull_div:
        r.score += 8; triggers.append("강세다이버전스")
    if dex_buy_pct_5m >= 70:
        r.score += 8; triggers.append("DEX 극단매수")

    tc = len(triggers)
    if tc >= 2:
        r.sig(f"급등 전 {tc}개 신호 동시", "bull")

    is_prepump = tc >= 2
    r.score = max(-5, min(20, round(r.score)))
    r.meta.update({"trig_count": tc, "triggers": triggers, "is_prepump": is_prepump})
    return r


# ── S11: Pre-Dump ────────────────────────────────────────────────────────

def s11_predump(
    dex_pm5: float = 0.0,
    bear_div: bool = False,
    dex_buy_pct_5m: float = 50.0,
) -> SResult:
    r = SResult()
    warnings = []

    if dex_pm5 < -3:
        r.score -= 10; warnings.append("5분 하락 선행"); r.sig("5분 하락 급락 초기", "bear")
    if dex_buy_pct_5m <= 30:
        r.score -= 10; warnings.append("DEX 극단매도")
    if bear_div:
        r.score -= 8; warnings.append("약세다이버전스")

    wc = len(warnings)
    if wc >= 2:
        r.sig(f"급락 전 {wc}개 신호", "bear")

    is_predump = wc >= 2
    r.score = max(-25, min(5, round(r.score)))
    r.meta.update({"warn_count": wc, "warnings": warnings, "is_predump": is_predump})
    return r


# ── S14: Multi-Exchange Funding Rate ─────────────────────────────────────

def s14_multi_fr(
    binance_fr: float | None,
    mexc_fr: float | None,
    bitget_fr: float | None,
) -> SResult:
    r = SResult()
    frs = {k: v for k, v in {"Binance": binance_fr, "MEXC": mexc_fr, "Bitget": bitget_fr}.items() if v is not None}
    if not frs:
        r.sig("멀티 FR 데이터 없음", "neut"); return r

    avg_fr = sum(frs.values()) / len(frs)
    neg_count = sum(1 for v in frs.values() if v < -0.02)

    if neg_count >= 2 and avg_fr < -0.03:
        r.score = 15; r.sig(f"멀티거래소 동시 음수 FR {avg_fr:.3%} → 숏스퀴즈 (+15)", "bull")
    elif neg_count >= 1 and avg_fr < -0.01:
        r.score = 8;  r.sig(f"평균 FR {avg_fr:.3%} 음수 (+8)", "bull")
    elif avg_fr > 0.05:
        r.score = -10; r.sig(f"평균 FR {avg_fr:.3%} 과열 양수 (-10)", "bear")

    r.meta["frs"] = {k: round(v, 5) for k, v in frs.items()}
    r.meta["avg_fr"] = round(avg_fr, 5)
    r.score = max(-15, min(20, round(r.score)))
    return r


# ── S15: Multi-Exchange Volume (MEXC lead indicator) ─────────────────────

def s15_vol_compare(
    alpha_vol: float,
    mexc_vol: float | None,
    bitget_vol: float | None = None,
    mexc_pct: float | None = None,
) -> SResult:
    r = SResult()
    if mexc_vol is None:
        r.sig("MEXC 데이터 없음", "neut"); return r

    mexc_ratio = mexc_vol / alpha_vol if alpha_vol > 0 else 0

    if mexc_ratio > 3 and (mexc_pct or 0) > 5:
        r.score = 20; r.sig(f"MEXC 거래량 {mexc_ratio:.1f}× Binance + {mexc_pct:.1f}% — 선행 수급 폭발", "bull")
    elif mexc_ratio > 2:
        r.score = 12; r.sig(f"MEXC 거래량 {mexc_ratio:.1f}× Binance (+12)", "bull")
    elif mexc_ratio > 1.5:
        r.score = 6;  r.sig(f"MEXC 선행 {mexc_ratio:.1f}× (+6)", "bull")

    r.meta.update({"mexc_ratio": round(mexc_ratio, 2), "mexc_pct": mexc_pct})
    r.score = max(-5, min(20, round(r.score)))
    return r


# ── Score Deflation + Hard Cap ────────────────────────────────────────────

@dataclass
class AlphaResult:
    raw: float
    score: float                   # deflated + capped
    verdict: str
    v_class: str
    all_sigs: list[dict]


def compute_alpha(scores: dict[str, SResult]) -> AlphaResult:
    """
    Aggregate all S-scores with deflation and hard caps.

    scores dict keys: 's1'…'s20' (only present keys counted)
    """
    raw = sum(s.score for s in scores.values())

    # ── Score Deflation (non-linear) ──────────────────────────────────────
    deflated = float(raw)
    if raw > 40:
        deflated = 40 + (raw - 40) * 0.5
    if raw > 70:
        deflated = 70 + (raw - 70) * 0.2
    if raw < -40:
        deflated = -40 + (raw + 40) * 0.5
    if raw < -70:
        deflated = -70 + (raw + 70) * 0.2

    score = round(deflated)

    # ── Hard Caps ─────────────────────────────────────────────────────────
    liq_ratio  = scores.get("s2", SResult()).meta.get("liq_ratio", 1.0)
    warn_count = scores.get("s11", SResult()).meta.get("warn_count", 0)
    if liq_ratio < 0.05:
        score = min(score, 10)   # liquidity bottom → max 10
    if warn_count >= 3:
        score = min(score, 0)    # 3+ dump warnings → force ≤ 0

    score = max(-100, min(100, score))

    # ── Verdict ───────────────────────────────────────────────────────────
    if score >= 60:
        verdict, v_class = "STRONG BULL — 강한 상승 선행 신호", "vv-bull"
    elif score >= 30:
        verdict, v_class = "BULLISH — 축적 신호", "vv-bull"
    elif score >= -20:
        verdict, v_class = "NEUTRAL — 방향 불명확", "vv-neut"
    elif score >= -50:
        verdict, v_class = "BEARISH — 하락/분산 신호", "vv-bear"
    else:
        verdict, v_class = "STRONG BEAR — 위험 경보", "vv-warn"

    # ── Special verdict overrides (LAST one that matches wins → highest priority last)
    s15 = scores.get("s15", SResult())
    s10 = scores.get("s10", SResult())
    s11 = scores.get("s11", SResult())
    s9  = scores.get("s9",  SResult())

    # Lowest priority first
    if s9.meta.get("is_accumulating") and abs(score) < 40:
        verdict = "ACCUMULATING — 매집 구간 진행 중"
    if s11.meta.get("is_predump") and score < -20:
        verdict = "PRE-DUMP — 급락 임박 신호 감지"
    if s10.meta.get("is_prepump") and score > 20:
        verdict = "PRE-PUMP — 급등 임박 신호 감지"      # overrides ACCUMULATING
    if s15.meta.get("mexc_ratio", 0) > 3 and (s15.meta.get("mexc_pct") or 0) > 5:
        verdict = "멀티 거래소 선행 수급 — MEXC 선행 폭발"  # highest priority

    # Aggregate all sigs
    all_sigs = []
    for key in ["s19","s20","s15","s10","s11","s9","s14","s16","s17","s1","s2","s3","s4","s7"]:
        s = scores.get(key)
        if s:
            all_sigs.extend(s.sigs)

    return AlphaResult(raw=raw, score=score, verdict=verdict, v_class=v_class, all_sigs=all_sigs)


def compute_hunt_score(
    alpha_score: float,
    s10: SResult,
    s11: SResult,
    s9:  SResult,
    s16: SResult | None,
    s19: SResult | None,
) -> int:
    """Final Hunt Score = alpha + combo bonuses - dump penalty, with soft cap."""
    hunt = float(alpha_score)
    combos = 0

    if s10.meta.get("is_prepump"):        combos += 1
    if s9.meta.get("is_accumulating"):    combos += 1
    if s16 and 0 < s16.meta.get("bandwidth", 99) < 4.0: combos += 1
    if s19 and s19.score >= 10:           combos += 1

    if combos >= 3:
        hunt += 25
    elif combos == 2:
        hunt += 10

    if s11.meta.get("is_predump"):
        hunt -= 25

    # Hunt Soft Cap
    if hunt > 60:
        hunt = 60 + (hunt - 60) * 0.4
    if hunt < -60:
        hunt = -60 + (hunt + 60) * 0.4

    return max(-100, min(100, round(hunt)))


def s9_quick(
    pct_24h: float,
    price_high_24h: float,
    price_low_24h: float,
    vol: float,
    market_cap: float,
    holders: int,
) -> SResult:
    """Fast first-pass accumulation check for batch scanning (pre-Deep).

    Simplified S9 — only 2 conditions, no aggTrades needed.
    Used by Alpha Hunter's initial batch scan before full S9 is run.
    """
    r = SResult()
    if vol < 10_000 or holders < 100:
        return r  # score=0

    conditions = []
    is_flat   = abs(pct_24h) < 8
    price_range = (
        (price_high_24h - price_low_24h) / price_low_24h * 100
        if price_low_24h > 0 else 100.0
    )

    if is_flat and price_range < 20:
        r.score += 8; conditions.append("가격 횡보")
    if market_cap > 0 and vol / market_cap > 0.1:
        r.score += 5; conditions.append("거래 활성")

    cc = len(conditions)
    is_accumulating = cc >= 2
    if is_accumulating:
        r.sig(f"기본 매집 신호 {cc}/2 (빠른 스캔)", "bull")

    r.score = max(0, min(13, round(r.score)))
    r.meta.update({"cond_count": cc, "is_accumulating": is_accumulating})
    return r


def resolve_conflict(s10: SResult, s11: SResult) -> dict | None:
    """If Pre-pump AND Pre-dump simultaneously → EXTREME VOLATILITY override."""
    if s10.meta.get("is_prepump") and s11.meta.get("is_predump"):
        return {
            "is_extreme": True,
            "verdict": "EXTREME VOLATILITY — 급등/급락 동시 신호 (방향 불명확, 큰 움직임 임박)",
            "v_class": "vv-warn",
        }
    return None
