"""LimitMatcher — W-PF-104 (part 2)

For INTERNAL_RUN / PAPER: simulates immediate fill at mid price.
For FUNDED (P3): delegates to HL live order.

P1 scope: simulated fill only.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

log = logging.getLogger("engine.propfirm.match")

# Simulated taker fee in P1 (Hyperliquid cross-margin taker rate)
_TAKER_FEE_BPS = 5  # 0.05%


class LimitMatcher:
    async def try_fill(
        self,
        *,
        order_id: str,
        symbol: str,
        mid_price: float | None,
    ) -> bool:
        """Simulate immediate fill for INTERNAL_RUN/PAPER.

        Returns True if fill was recorded.
        """
        if mid_price is None or mid_price <= 0:
            log.warning("match: no mid price for %s order %s — cannot fill", symbol, order_id[:8])
            return False

        order = await self._get_order(order_id)
        if order is None:
            return False

        qty = float(order.get("qty") or 0)
        if qty <= 0:
            return False

        fee = qty * mid_price * (_TAKER_FEE_BPS / 10000)
        filled_at = datetime.now(timezone.utc)

        await self._record_fill(
            order_id=order_id,
            account_id=order["account_id"],
            symbol=symbol,
            side=order.get("side", "BUY"),
            qty=qty,
            fill_px=mid_price,
            fee=fee,
            filled_at=filled_at,
        )
        await self._mark_order_filled(order_id, qty, mid_price, fee, filled_at)
        position_id = await self._open_position(
            account_id=order["account_id"],
            symbol=symbol,
            side="LONG" if order.get("side") == "BUY" else "SHORT",
            qty=qty,
            entry_px=mid_price,
        )
        if position_id:
            await self._link_order_to_position(order_id, position_id)

        log.info(
            "match: filled order %s %s qty=%.4f px=%.4f fee=%.4f",
            order_id[:8],
            symbol,
            qty,
            mid_price,
            fee,
        )

        # ── PropFirm eval hook (W-PF-202) ──────────────────────
        try:
            from propfirm.rules.hook import on_fill as _on_fill
            await _on_fill(
                account_id=order["account_id"],
                fill_px=mid_price,
                qty=qty,
                fee=fee,
                side=order.get("side", "BUY"),
                symbol=symbol,
                filled_at=filled_at,
            )
        except Exception as _hook_exc:
            log.error("match: eval hook error (non-fatal): %s", _hook_exc)
        # ── end hook ─────────────────────────────────────────────

        return True

    # ── helpers ──────────────────────────────────────────────────────────

    async def _get_order(self, order_id: str) -> dict | None:
        try:
            from db.client import get_client  # type: ignore[import]
            resp = (
                get_client()
                .table("pf_orders")
                .select("account_id, qty, side, status")
                .eq("id", order_id)
                .single()
                .execute()
            )
            return resp.data
        except Exception as exc:
            log.error("match: order fetch failed: %s", exc)
            return None

    async def _record_fill(
        self,
        *,
        order_id: str,
        account_id: str,
        symbol: str,
        side: str,
        qty: float,
        fill_px: float,
        fee: float,
        filled_at: datetime,
    ) -> None:
        try:
            from db.client import get_client  # type: ignore[import]
            get_client().table("pf_fills").insert({
                "order_id": order_id,
                "account_id": account_id,
                "coin": symbol,
                "side": side,
                "qty": qty,
                "fill_px": fill_px,
                "fee": fee,
                "is_simulated": True,
                "filled_at": filled_at.isoformat(),
            }).execute()
        except Exception as exc:
            log.error("match: fill insert failed: %s", exc)

    async def _mark_order_filled(
        self, order_id: str, qty: float, px: float, fee: float, filled_at: datetime
    ) -> None:
        try:
            from db.client import get_client  # type: ignore[import]
            get_client().table("pf_orders").update({
                "status": "FILLED",
                "filled_qty": qty,
                "avg_fill_px": px,
                "fee": fee,
                "filled_at": filled_at.isoformat(),
            }).eq("id", order_id).execute()
        except Exception as exc:
            log.error("match: order update failed: %s", exc)

    async def _open_position(
        self,
        *,
        account_id: str,
        symbol: str,
        side: str,
        qty: float,
        entry_px: float,
    ) -> str | None:
        try:
            from db.client import get_client  # type: ignore[import]
            resp = get_client().table("pf_positions").insert({
                "account_id": account_id,
                "coin": symbol,
                "side": side,
                "qty": qty,
                "entry_px": entry_px,
                "mark_px": entry_px,
                "leverage": 1.0,
                "unrealized_pnl": 0.0,
                "status": "OPEN",
            }).execute()
            return resp.data[0]["id"] if resp.data else None
        except Exception as exc:
            log.error("match: position insert failed: %s", exc)
            return None

    async def _link_order_to_position(self, order_id: str, position_id: str) -> None:
        try:
            from db.client import get_client  # type: ignore[import]
            get_client().table("pf_orders").update(
                {"parent_position_id": position_id}
            ).eq("id", order_id).execute()
        except Exception as exc:
            log.warning("match: position link failed: %s", exc)
