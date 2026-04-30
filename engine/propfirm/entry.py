"""EntryDecider — W-PF-104 (part 1)

Checks account-level guards before creating an entry order:
- account not over MLL
- no existing open position in same symbol+direction (no pyramid)
- sizing_pct applied to current_equity → qty

Creates a pf_orders row with intent=ENTRY, then delegates to LimitMatcher.
"""
from __future__ import annotations

import logging

log = logging.getLogger("engine.propfirm.entry")

_DEFAULT_LEVERAGE = 1.0


class EntryDecider:
    async def decide(
        self,
        *,
        account: dict,
        fire_id: str,
        strategy_id: str,
        symbol: str,
        price: float | None,
    ) -> str | None:
        """Return order_id if entry order was placed, None if skipped."""
        account_id = account["id"]
        equity = float(account.get("current_equity") or 10000)
        mll = account.get("mll_level")

        if mll is not None and equity <= float(mll):
            log.info("entry: account %s at MLL — skip", account_id[:8])
            return None

        if await self._has_open_position(account_id, symbol):
            log.debug("entry: account %s already has open %s — skip", account_id[:8], symbol)
            return None

        sizing_pct = float(account.get("sizing_pct") or 0.05)
        notional = equity * sizing_pct
        entry_price = price or 0.0
        qty = (notional / entry_price) if entry_price > 0 else 0.0
        if qty <= 0:
            log.warning("entry: qty=0 for account %s — no price?", account_id[:8])
            return None

        order_id = await self._create_order(
            account_id=account_id,
            user_id=account.get("user_id"),
            fire_id=fire_id,
            symbol=symbol,
            qty=qty,
            price=price,
            source=self._source_for_mode(account.get("mode")),
        )
        if order_id is None:
            return None

        from propfirm.match import LimitMatcher  # type: ignore[import]
        matcher = LimitMatcher()
        await matcher.try_fill(order_id=order_id, symbol=symbol, mid_price=price)
        return order_id

    # ── helpers ──────────────────────────────────────────────────────────

    def _source_for_mode(self, mode: str | None) -> str:
        mapping = {
            "INTERNAL_RUN": "INTERNAL_RUN",
            "AUTO": "AUTO_STRATEGY",
            "ASSISTED": "ASSISTED_USER",
            "MANUAL": "USER",
        }
        return mapping.get(mode or "MANUAL", "USER")

    async def _has_open_position(self, account_id: str, symbol: str) -> bool:
        try:
            from db.client import get_client  # type: ignore[import]
            resp = (
                get_client()
                .table("pf_positions")
                .select("id")
                .eq("account_id", account_id)
                .eq("coin", symbol)
                .eq("status", "OPEN")
                .limit(1)
                .execute()
            )
            return bool(resp.data)
        except Exception as exc:
            log.warning("entry: position check failed: %s", exc)
            return False

    async def _create_order(
        self,
        *,
        account_id: str,
        user_id: str | None,
        fire_id: str,
        symbol: str,
        qty: float,
        price: float | None,
        source: str,
    ) -> str | None:
        try:
            from db.client import get_client  # type: ignore[import]
            row = {
                "account_id": account_id,
                "user_id": user_id,
                "source": source,
                "pattern_fire_id": fire_id,
                "intent": "ENTRY",
                "coin": symbol,
                "side": "BUY",
                "order_type": "MARKET",
                "qty": qty,
                "price": price,
                "status": "OPEN",
            }
            resp = get_client().table("pf_orders").insert(row).execute()
            return resp.data[0]["id"] if resp.data else None
        except Exception as exc:
            log.error("entry: order insert failed: %s", exc)
            return None
