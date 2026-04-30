"""ExitMonitor — W-PF-105

Polls open pf_positions every 60 seconds and closes positions that hit:
- TP:  unrealized_pnl / entry_notional >= tp_bps/10000
- SL:  unrealized_pnl / entry_notional <= -sl_bps/10000
- TTL: now() - opened_at >= ttl_min minutes
- MLL: account.current_equity <= account.mll_level

exit_policy JSONB: {tp_bps: int, sl_bps: int, ttl_min: int}
Falls back to account-level defaults when absent from individual field.

P1 scope: simulated close only (mark_px from Redis mid).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

log = logging.getLogger("engine.propfirm.exit")

_DEFAULT_TP_BPS = 300   # 3%
_DEFAULT_SL_BPS = 150   # 1.5%
_DEFAULT_TTL_MIN = 120  # 2 hours


class ExitMonitor:
    async def run_once(self) -> int:
        """Check all open positions and close those that hit exit conditions.

        Returns number of positions closed.
        """
        positions = await self._get_open_positions()
        closed = 0
        for pos in positions:
            if await self._should_close(pos):
                closed += 1
        return closed

    # ── evaluation ───────────────────────────────────────────────────────

    async def _should_close(self, pos: dict) -> bool:
        account = await self._get_account(pos["account_id"])
        if account is None:
            return False

        exit_policy = account.get("exit_policy") or {}
        tp_bps = int(exit_policy.get("tp_bps", _DEFAULT_TP_BPS))
        sl_bps = int(exit_policy.get("sl_bps", _DEFAULT_SL_BPS))
        ttl_min = int(exit_policy.get("ttl_min", _DEFAULT_TTL_MIN))

        mark_px = await self._get_mid_price(pos["coin"])
        if mark_px is None:
            return False

        entry_px = float(pos["entry_px"])
        qty = float(pos["qty"])
        side = pos["side"]

        if side == "LONG":
            pnl = (mark_px - entry_px) * qty
        else:
            pnl = (entry_px - mark_px) * qty

        notional = entry_px * qty
        pnl_bps = int(pnl / notional * 10000) if notional > 0 else 0

        reason = None
        if pnl_bps >= tp_bps:
            reason = "EXIT_TP"
        elif pnl_bps <= -sl_bps:
            reason = "EXIT_SL"
        else:
            opened_at = datetime.fromisoformat(pos["opened_at"].replace("Z", "+00:00"))
            age_min = (datetime.now(timezone.utc) - opened_at).total_seconds() / 60
            if age_min >= ttl_min:
                reason = "EXIT_TTL"
            elif account.get("mll_level") is not None:
                equity = float(account.get("current_equity") or 0)
                if equity <= float(account["mll_level"]):
                    reason = "EXIT_MLL"

        if reason:
            await self._close_position(pos, mark_px, pnl, reason, account)
            return True
        else:
            await self._update_mark(pos["id"], mark_px, pnl)
        return False

    # ── DB helpers ───────────────────────────────────────────────────────

    async def _get_open_positions(self) -> list[dict]:
        try:
            from db.client import get_client  # type: ignore[import]
            resp = (
                get_client()
                .table("pf_positions")
                .select("id, account_id, coin, side, qty, entry_px, opened_at")
                .eq("status", "OPEN")
                .execute()
            )
            return resp.data or []
        except Exception as exc:
            log.error("exit: position fetch failed: %s", exc)
            return []

    async def _get_account(self, account_id: str) -> dict | None:
        try:
            from db.client import get_client  # type: ignore[import]
            resp = (
                get_client()
                .table("trading_accounts")
                .select("id, exit_policy, current_equity, mll_level, user_id")
                .eq("id", account_id)
                .single()
                .execute()
            )
            return resp.data
        except Exception as exc:
            log.error("exit: account fetch failed: %s", exc)
            return None

    async def _get_mid_price(self, symbol: str) -> float | None:
        try:
            from cache.kline_cache import _pool as redis_pool  # type: ignore[import]
            if redis_pool is None:
                return None
            val = await redis_pool.get(f"propfirm:mid:{symbol}")
            return float(val) if val else None
        except Exception as exc:
            log.debug("exit: redis mid price unavailable: %s", exc)
            return None

    async def _update_mark(self, position_id: str, mark_px: float, unrealized_pnl: float) -> None:
        try:
            from db.client import get_client  # type: ignore[import]
            get_client().table("pf_positions").update({
                "mark_px": mark_px,
                "unrealized_pnl": unrealized_pnl,
            }).eq("id", position_id).execute()
        except Exception:
            pass

    async def _close_position(
        self, pos: dict, exit_px: float, realized_pnl: float, intent: str, account: dict
    ) -> None:
        position_id = pos["id"]
        account_id = pos["account_id"]
        coin = pos["coin"]
        qty = float(pos["qty"])
        user_id = account.get("user_id")
        closed_at = datetime.now(timezone.utc)

        try:
            from db.client import get_client  # type: ignore[import]
            db = get_client()

            # close position
            db.table("pf_positions").update({
                "status": "CLOSED",
                "exit_px": exit_px,
                "realized_pnl": realized_pnl,
                "unrealized_pnl": 0.0,
                "closed_at": closed_at.isoformat(),
            }).eq("id", position_id).execute()

            # exit order
            exit_side = "SELL" if pos["side"] == "LONG" else "BUY"
            order_resp = db.table("pf_orders").insert({
                "account_id": account_id,
                "user_id": user_id,
                "source": "AUTO_STRATEGY",
                "intent": intent,
                "parent_position_id": position_id,
                "coin": coin,
                "side": exit_side,
                "order_type": "MARKET",
                "qty": qty,
                "price": exit_px,
                "status": "FILLED",
                "filled_qty": qty,
                "avg_fill_px": exit_px,
                "fee": 0.0,
                "filled_at": closed_at.isoformat(),
            }).execute()

            # exit fill
            if order_resp.data:
                db.table("pf_fills").insert({
                    "order_id": order_resp.data[0]["id"],
                    "account_id": account_id,
                    "coin": coin,
                    "side": exit_side,
                    "qty": qty,
                    "fill_px": exit_px,
                    "fee": 0.0,
                    "is_simulated": True,
                    "filled_at": closed_at.isoformat(),
                }).execute()

            # update account equity
            new_equity = float(account.get("current_equity") or 10000) + realized_pnl
            db.table("trading_accounts").update({
                "current_equity": new_equity,
                "realized_pnl": float(account.get("realized_pnl") or 0) + realized_pnl,
            }).eq("id", account_id).execute()

            log.info(
                "exit: closed position %s %s %s pnl=%.2f reason=%s",
                position_id[:8],
                coin,
                pos["side"],
                realized_pnl,
                intent,
            )
        except Exception as exc:
            log.error("exit: close failed for position %s: %s", position_id[:8], exc)
