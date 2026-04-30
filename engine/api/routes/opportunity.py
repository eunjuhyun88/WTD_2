"""POST /opportunity/run — remote opportunity scanner.

Builds a lightweight opportunity view from the engine token-universe cache.
This route is intentionally backend-owned even though some richer overlays
still live in app-web local mode.
"""
from __future__ import annotations

import logging
import re
import time

from fastapi import APIRouter

from api.schemas import OpportunityMacroBackdrop, OpportunityRunRequest, OpportunityRunResponse, OpportunityScore
from data_cache.token_universe import get_universe
from memory.state_store import USER_VERDICT_WEIGHT_STORE

log = logging.getLogger(__name__)

# Lazy-loaded perp signal cache {raw_symbol (BTCUSDT): composite_score float | None}
_PERP_CACHE: dict[str, float | None] = {}
_PERP_CACHE_TS: float = 0.0
_PERP_CACHE_TTL = 3600.0  # 1h


def _load_perp_signals(symbols: list[str]) -> dict[str, float | None]:
    """Batch-load latest funding + LS ratio from ParquetStore for a list of symbols.

    composite_score = mean(funding_score, ls_score)
      funding_score: neutral funding (|rate| < 0.0001) → 1.0; extreme (|rate| > 0.0003) → 0.0
      ls_score: LS ratio ~1.0 neutral (0.5); >1.5 overbought (0.0); <0.7 oversold (1.0)
    Returns None if no data available for a symbol.
    """
    try:
        from data_cache.parquet_store import ParquetStore
        store = ParquetStore()
        result: dict[str, float | None] = {}
        for sym in symbols:
            try:
                parts: list[float] = []
                # Funding signal
                df_f = store.read_funding(sym)
                if len(df_f) > 0:
                    fr = float(df_f.iloc[-1]["funding_rate"])
                    funding_score = max(0.0, 1.0 - abs(fr) / 0.0003)
                    parts.append(round(funding_score, 3))
                # Long/Short ratio signal
                df_ls = store.read_longshort(sym)
                if len(df_ls) > 0:
                    ls = float(df_ls.iloc[-1]["long_short_ratio"])
                    if ls > 1.5:
                        ls_score = 0.0
                    elif ls < 0.7:
                        ls_score = 1.0
                    else:
                        # 0.7-1.5 range → 0-1 inverted from overbought
                        ls_score = max(0.0, min(1.0, (1.5 - ls) / 0.8))
                    parts.append(round(ls_score, 3))
                result[sym] = round(sum(parts) / len(parts), 2) if parts else None
            except Exception:
                result[sym] = None
        return result
    except Exception:
        log.warning("perp signal load failed; composite_score will be null", exc_info=True)
        return {s: None for s in symbols}


router = APIRouter()


def _slugify(name: str, symbol: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or symbol.lower()


def _score_momentum(change_24h: float, change_7d: float, change_1h: float) -> tuple[int, list[str], list[str]]:
    score = 0
    reasons: list[str] = []
    alerts: list[str] = []

    abs_1h = abs(change_1h)
    if abs_1h > 5:
        score += 8
        alerts.append(f"1h spike {change_1h:+.1f}%")
    elif abs_1h > 2:
        score += 5
    elif abs_1h > 0.5:
        score += 2

    abs_24h = abs(change_24h)
    if abs_24h > 10:
        score += 10
        reasons.append(f"24h move {change_24h:+.1f}%")
    elif abs_24h > 5:
        score += 7
        reasons.append(f"24h momentum {change_24h:+.1f}%")
    elif abs_24h > 2:
        score += 4
    else:
        score += 1

    same_dir = (change_24h > 0 and change_7d > 0) or (change_24h < 0 and change_7d < 0)
    if same_dir and abs(change_7d) > 10:
        score += 7
        reasons.append(f"7d aligned {change_7d:+.1f}%")
    elif same_dir:
        score += 4
    elif abs(change_7d) > 15:
        score += 3
        alerts.append("24h/7d reversal setup")

    return min(25, score), reasons, alerts


def _score_volume(volume_24h: float, market_cap: float) -> tuple[int, list[str], list[str]]:
    score = 0
    reasons: list[str] = []
    alerts: list[str] = []

    if market_cap > 0:
        ratio = volume_24h / market_cap
        if ratio > 0.5:
            score += 15
            reasons.append(f"volume burst {ratio * 100:.0f}% mc")
            alerts.append("volume spike")
        elif ratio > 0.2:
            score += 10
            reasons.append("elevated volume")
        elif ratio > 0.1:
            score += 6
        elif ratio > 0.05:
            score += 3

    if volume_24h > 1_000_000_000:
        score += 5
    elif volume_24h > 100_000_000:
        score += 3
    elif volume_24h > 10_000_000:
        score += 1

    return min(20, score), reasons, alerts


def _score_social_proxy(trending_score: float) -> tuple[int, list[str]]:
    score = max(0, min(20, round(trending_score * 20)))
    reasons: list[str] = []
    if trending_score >= 0.8:
        reasons.append(f"trend proxy {trending_score:.2f}")
    elif trending_score >= 0.6:
        reasons.append("trend proxy elevated")
    return score, reasons


def _compute_direction(total_score: int, change_24h: float) -> tuple[str, int]:
    price_dir = 1 if change_24h > 1 else -1 if change_24h < -1 else 0
    score_dir = 1 if total_score > 55 else -1 if total_score < 40 else 0

    if price_dir > 0 and score_dir >= 0:
        direction = "long"
    elif price_dir < 0 and score_dir <= 0:
        direction = "short"
    elif score_dir > 0:
        direction = "long"
    elif score_dir < 0:
        direction = "short"
    else:
        direction = "neutral"

    confidence = round(max(45, min(95, 45 + abs(total_score - 50) * 1.5)))
    return direction, confidence


@router.post("/run", response_model=OpportunityRunResponse)
async def run(req: OpportunityRunRequest) -> OpportunityRunResponse:
    global _PERP_CACHE, _PERP_CACHE_TS

    started_at = time.time()
    rows = await get_universe()
    ranked = sorted(rows, key=lambda row: row.get("trending_score", 0.0), reverse=True)[: req.limit]

    # Build raw_symbol_map: base (BTC) → full pair (BTCUSDT) for perp and personalization lookup
    raw_symbol_map: dict[str, str] = {
        str(row.get("base") or row.get("symbol", "")).upper(): str(row.get("symbol") or row.get("base", "")).upper()
        for row in ranked
    }

    # Refresh perp signal cache if stale (TTL = 1h)
    if time.time() - _PERP_CACHE_TS > _PERP_CACHE_TTL:
        _PERP_CACHE = _load_perp_signals(list(raw_symbol_map.values()))
        _PERP_CACHE_TS = time.time()

    # Personalization weights (W-0351) — 1 DB fetch per request
    user_adjustments: dict[str, float] = {}
    if req.user_id:
        try:
            user_adjustments = USER_VERDICT_WEIGHT_STORE.get_adjustments(req.user_id)
        except Exception:
            log.warning("personalization weight fetch failed; using base sort", exc_info=True)

    macro_backdrop = OpportunityMacroBackdrop(
        fedFundsRate=None,
        yieldCurveSpread=None,
        m2ChangePct=None,
        overallMacroScore=0.0,
        regime="neutral",
    )

    coins: list[OpportunityScore] = []
    for row in ranked:
        raw_sym = str(row.get("symbol") or row.get("base", "")).upper()
        symbol = str(row.get("base") or row.get("symbol", "")).upper()
        name = str(row.get("name") or symbol)
        price = float(row.get("price", 0.0))
        change_24h = float(row.get("pct_24h", 0.0))
        change_1h = change_24h / 24.0
        change_7d = change_24h
        volume_24h = float(row.get("vol_24h_usd", 0.0))
        market_cap = float(row.get("market_cap", 0.0))
        trending_score = float(row.get("trending_score", 0.0))

        momentum_score, momentum_reasons, momentum_alerts = _score_momentum(change_24h, change_7d, change_1h)
        volume_score, volume_reasons, volume_alerts = _score_volume(volume_24h, market_cap)
        social_score, social_reasons = _score_social_proxy(trending_score)
        macro_score = 7
        onchain_score = 10
        total_score = momentum_score + volume_score + social_score + macro_score + onchain_score
        direction, confidence = _compute_direction(total_score, change_24h)

        reasons = (momentum_reasons + volume_reasons + social_reasons)[:3]
        if not reasons:
            reasons = ["steady trend proxy"]

        alerts = momentum_alerts + volume_alerts
        composite_score = _PERP_CACHE.get(raw_sym)

        coins.append(
            OpportunityScore(
                symbol=symbol,
                name=name,
                slug=_slugify(name, symbol),
                price=price,
                change1h=change_1h,
                change24h=change_24h,
                change7d=change_7d,
                volume24h=volume_24h,
                marketCap=market_cap,
                momentumScore=momentum_score,
                volumeScore=volume_score,
                socialScore=social_score,
                macroScore=macro_score,
                onchainScore=onchain_score,
                totalScore=total_score,
                direction=direction,
                confidence=confidence,
                reasons=reasons,
                sentiment=None,
                socialVolume=None,
                galaxyScore=round(trending_score * 100, 2),
                alerts=alerts,
                compositeScore=composite_score,
            )
        )

    def _sort_key(coin: OpportunityScore) -> float:
        if not user_adjustments:
            return float(coin.totalScore)
        full_pair = raw_symbol_map.get(coin.symbol, coin.symbol)
        delta = user_adjustments.get(f"symbol:{full_pair}", 0.0)
        if delta == 0.0:
            delta = user_adjustments.get(f"symbol:{coin.symbol}", 0.0)
        return float(coin.totalScore) + delta * 10.0

    coins.sort(key=_sort_key, reverse=True)

    return OpportunityRunResponse(
        coins=coins,
        macroBackdrop=macro_backdrop,
        scannedAt=int(time.time() * 1000),
        scanDurationMs=int((time.time() - started_at) * 1000),
    )
