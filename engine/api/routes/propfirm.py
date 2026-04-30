"""PropFirm API routes — W-PF-106 backend

GET  /propfirm/summary?user_id=&account_id=&limit=20
  Returns { ok, account, recent_fires, open_positions }

POST /propfirm/accounts
  Body: { user_id, action, exit_policy, strategy_id?, symbols? }
  Creates an INTERNAL_RUN trading_accounts row
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

log = logging.getLogger("engine.api.propfirm")

router = APIRouter(prefix="/propfirm", tags=["propfirm"])


def _get_supabase() -> Any:
    from supabase import create_client  # type: ignore[import]
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


@router.get("/summary")
async def get_summary(
    user_id: str = Query(...),
    account_id: str = Query(default=""),
    limit: int = Query(default=20, le=100),
) -> dict:
    try:
        sb = _get_supabase()

        # Fetch account — prefer explicit account_id, else first INTERNAL_RUN for user
        account = None
        if account_id:
            resp = sb.table("trading_accounts").select("*").eq("id", account_id).limit(1).execute()
            account = resp.data[0] if resp.data else None
        else:
            resp = (
                sb.table("trading_accounts")
                .select("*")
                .eq("user_id", user_id)
                .eq("account_type", "INTERNAL_RUN")
                .eq("status", "ACTIVE")
                .limit(1)
                .execute()
            )
            account = resp.data[0] if resp.data else None
            if not account:
                # Also return INTERNAL_RUN rows with NULL user_id (system default)
                resp2 = (
                    sb.table("trading_accounts")
                    .select("*")
                    .is_("user_id", "null")
                    .eq("account_type", "INTERNAL_RUN")
                    .eq("status", "ACTIVE")
                    .limit(1)
                    .execute()
                )
                account = resp2.data[0] if resp2.data else None

        if account is None:
            return {"ok": True, "account": None, "recent_fires": [], "open_positions": []}

        acct_id = account["id"]

        # Recent pattern fires for this account's strategy
        strategy_id = account.get("strategy_id")
        fires_query = (
            sb.table("pattern_fires")
            .select("id, fired_at, symbol, strategy_id, price, p_win, confidence, status")
            .order("fired_at", desc=True)
            .limit(limit)
        )
        if strategy_id:
            fires_query = fires_query.eq("strategy_id", strategy_id)
        fires_resp = fires_query.execute()

        # Open positions for this account
        positions_resp = (
            sb.table("pf_positions")
            .select("id, coin, side, qty, entry_px, mark_px, unrealized_pnl, opened_at")
            .eq("account_id", acct_id)
            .eq("status", "OPEN")
            .execute()
        )

        return {
            "ok": True,
            "account": account,
            "recent_fires": fires_resp.data or [],
            "open_positions": positions_resp.data or [],
        }
    except Exception as exc:
        log.error("propfirm summary error: %s", exc)
        return {"ok": False, "error": str(exc)}


class CreateAccountBody(BaseModel):
    user_id: str
    action: str
    exit_policy: dict | None = None
    strategy_id: str | None = None
    symbols: list[str] | None = None


@router.post("/accounts")
async def create_account(body: CreateAccountBody) -> dict:
    if body.action != "create_account":
        return {"ok": False, "error": f"unknown action: {body.action}"}
    try:
        sb = _get_supabase()
        initial_balance = 10000.0
        max_loss_limit = 1000.0
        row = {
            "user_id": body.user_id,
            "account_type": "INTERNAL_RUN",
            "mode": "INTERNAL_RUN",
            "strategy_id": body.strategy_id,
            "symbols": body.symbols,
            "exit_policy": body.exit_policy,
            "sizing_pct": 0.05,
            "status": "ACTIVE",
            "initial_balance": initial_balance,
            "current_equity": initial_balance,
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "max_loss_limit": max_loss_limit,
            "mll_level": initial_balance - max_loss_limit,
            "profit_goal": 3000.0,
        }
        resp = sb.table("trading_accounts").insert(row).execute()
        account = resp.data[0] if resp.data else None
        return {"ok": True, "account": account}
    except Exception as exc:
        log.error("propfirm create_account error: %s", exc)
        return {"ok": False, "error": str(exc)}
