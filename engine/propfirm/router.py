"""PatternFireRouter — W-PF-103

Receives PhaseTransition entry signals from patterns/scanner._on_entry_signal()
and fans out to all active INTERNAL_RUN/AUTO/ASSISTED trading accounts whose
strategy_id matches.

Entry point:
    get_router().on_entry_signal(transition)

Key decisions:
    - strategy_id = f"wtd.{transition.pattern_slug}"
    - symbol normalisation: strip USDT/PERP suffix → BTC/ETH/SOL
    - fan-out: only accounts with matching strategy_id or NULL (accepts all)
    - pattern_fires row inserted BEFORE fan-out; consumed/skipped on fan-out result
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

log = logging.getLogger("engine.propfirm.router")

# Symbols supported in P1
SYMBOLS_WHITELIST = frozenset({"BTC", "ETH", "SOL"})

_router_instance: "PatternFireRouter | None" = None


def get_router() -> "PatternFireRouter":
    global _router_instance
    if _router_instance is None:
        _router_instance = PatternFireRouter()
    return _router_instance


class PatternFireRouter:
    """Converts a PhaseTransition into pattern_fires rows and account fan-out."""

    async def on_entry_signal(self, transition: object) -> str | None:
        """Called from patterns/scanner._on_entry_signal().

        Returns the pattern_fire UUID if persisted, None if skipped.
        """
        symbol = self._normalise_symbol(getattr(transition, "symbol", ""))
        if symbol not in SYMBOLS_WHITELIST:
            log.debug("router: symbol %s not in whitelist — skip", symbol)
            return None

        pattern_slug = getattr(transition, "pattern_slug", None)
        if not pattern_slug:
            log.warning("router: transition has no pattern_slug — skip")
            return None

        strategy_id = f"wtd.{pattern_slug}"
        block_scores = getattr(transition, "block_scores", None) or {}
        blocks_triggered = list(block_scores.keys())
        confidence = getattr(transition, "confidence", None)
        scan_run_id = getattr(transition, "scan_id", None)
        fired_at = getattr(transition, "timestamp", None) or datetime.now(timezone.utc)

        # price from HL feed (Redis mid) — falls back to feature_snapshot close
        price = await self._get_mid_price(symbol)
        if price is None:
            fs = getattr(transition, "feature_snapshot", None)
            if fs is not None:
                price = getattr(fs, "close", None)

        fire_id = await self._persist_fire(
            scan_run_id=scan_run_id,
            fired_at=fired_at,
            symbol=symbol,
            price=price,
            p_win=self._p_win(transition),
            blocks_triggered=blocks_triggered,
            confidence=confidence,
            strategy_id=strategy_id,
        )
        if fire_id is None:
            return None

        accounts = await self._matching_accounts(strategy_id, symbol)
        if not accounts:
            log.info("router: no matching accounts for %s %s", strategy_id, symbol)
            await self._update_fire_status(fire_id, "SKIPPED")
            return fire_id

        await self._fan_out(fire_id, strategy_id, symbol, price, accounts)
        await self._update_fire_status(fire_id, "CONSUMED")
        log.info(
            "router: fire %s → %s accounts (%s %s price=%s)",
            fire_id[:8],
            len(accounts),
            strategy_id,
            symbol,
            price,
        )
        return fire_id

    # ── helpers ──────────────────────────────────────────────────────────

    def _normalise_symbol(self, raw: str) -> str:
        return raw.upper().replace("USDT", "").replace("PERP", "").replace("-", "").strip()

    def _p_win(self, transition: object) -> float | None:
        es = getattr(transition, "entry_score", None)
        if es is not None:
            return getattr(es, "p_win", None)
        return None

    async def _get_mid_price(self, symbol: str) -> float | None:
        """Read mid price from Redis (written by propfirm_hl_feed worker)."""
        try:
            from cache.kline_cache import _pool as redis_pool  # type: ignore[import]
            if redis_pool is None:
                return None
            val = await redis_pool.get(f"propfirm:mid:{symbol}")
            return float(val) if val else None
        except Exception as exc:
            log.debug("router: redis mid price unavailable: %s", exc)
            return None

    async def _persist_fire(
        self,
        *,
        scan_run_id: str | None,
        fired_at: datetime,
        symbol: str,
        price: float | None,
        p_win: float | None,
        blocks_triggered: list[str],
        confidence: str | None,
        strategy_id: str,
    ) -> str | None:
        try:
            from db.client import get_client  # type: ignore[import]
            supabase = get_client()
            row = {
                "scan_run_id": str(scan_run_id) if scan_run_id else None,
                "fired_at": fired_at.isoformat(),
                "symbol": symbol,
                "price": price,
                "p_win": p_win,
                "blocks_triggered": blocks_triggered or [],
                "confidence": confidence,
                "strategy_id": strategy_id,
                "status": "NEW",
                "ttl_sec": 120,
            }
            resp = supabase.table("pattern_fires").insert(row).execute()
            return resp.data[0]["id"] if resp.data else None
        except Exception as exc:
            log.error("router: failed to persist pattern_fire: %s", exc)
            return None

    async def _update_fire_status(self, fire_id: str, status: str) -> None:
        try:
            from db.client import get_client  # type: ignore[import]
            get_client().table("pattern_fires").update({"status": status}).eq("id", fire_id).execute()
        except Exception as exc:
            log.warning("router: status update failed for %s: %s", fire_id, exc)

    async def _matching_accounts(self, strategy_id: str, symbol: str) -> list[dict]:
        """Return ACTIVE accounts that match this strategy and symbol."""
        try:
            from db.client import get_client  # type: ignore[import]
            resp = (
                get_client()
                .table("trading_accounts")
                .select("id, mode, exit_policy, sizing_pct, symbols, max_loss_limit, current_equity, mll_level")
                .eq("status", "ACTIVE")
                .in_("mode", ["INTERNAL_RUN", "AUTO", "ASSISTED"])
                .execute()
            )
            accounts = resp.data or []
            result = []
            for acct in accounts:
                # strategy match: account strategy_id NULL → accepts all
                acct_strategy = acct.get("strategy_id")
                if acct_strategy and acct_strategy != strategy_id:
                    continue
                # symbol whitelist: NULL → accepts all
                whitelist = acct.get("symbols")
                if whitelist and symbol not in whitelist:
                    continue
                result.append(acct)
            return result
        except Exception as exc:
            log.error("router: account query failed: %s", exc)
            return []

    async def _fan_out(
        self,
        fire_id: str,
        strategy_id: str,
        symbol: str,
        price: float | None,
        accounts: list[dict],
    ) -> None:
        from propfirm.entry import EntryDecider  # type: ignore[import]
        decider = EntryDecider()
        tasks = [
            decider.decide(
                account=acct,
                fire_id=fire_id,
                strategy_id=strategy_id,
                symbol=symbol,
                price=price,
            )
            for acct in accounts
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for acct, result in zip(accounts, results):
            if isinstance(result, Exception):
                log.warning("router: fan-out error for account %s: %s", acct["id"][:8], result)
