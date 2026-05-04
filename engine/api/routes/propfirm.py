"""PropFirm API routes — W-PF-106 / W-PF-205 backend

GET  /propfirm/summary?user_id=&account_id=&limit=20
  Returns { ok, account, recent_fires, open_positions }

POST /propfirm/accounts
  Body: { user_id, action, exit_policy, strategy_id?, symbols? }
  Creates an INTERNAL_RUN trading_accounts row

POST /propfirm/payment/confirm
  수동 reconcile: Stripe payment_intent_id로 eval을 PENDING→ACTIVE로 전환.
  webhook 재시도 3회 실패 시 ops가 직접 호출.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
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


# ─── Manual Payment Reconcile (W-PF-205) ─────────────────────────────────────

class ConfirmPaymentRequest(BaseModel):
    evaluation_id: str
    stripe_payment_intent: str
    user_id: str


@router.post("/payment/confirm")
async def confirm_payment(req: ConfirmPaymentRequest) -> dict:
    """PENDING → ACTIVE 수동 전환.
    Stripe PI 상태 confirmed 후 evaluation을 ACTIVE로 업데이트.
    webhook 재시도 3회 실패 시 ops가 직접 호출.
    """
    import stripe as stripe_lib

    stripe_lib.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not stripe_lib.api_key:
        raise HTTPException(status_code=500, detail="STRIPE_SECRET_KEY not set")

    # 1. Stripe PI 상태 확인
    try:
        pi = stripe_lib.PaymentIntent.retrieve(req.stripe_payment_intent)
    except stripe_lib.StripeError as exc:
        raise HTTPException(status_code=400, detail=f"Stripe error: {exc}") from exc

    if pi.status != "succeeded":
        raise HTTPException(
            status_code=400,
            detail=f"payment not succeeded (status={pi.status})",
        )

    sb = _get_supabase()

    # 2. Evaluation 상태 확인
    resp = (
        sb.table("evaluations")
        .select("id, status, user_id")
        .eq("id", req.evaluation_id)
        .single()
        .execute()
    )
    evaluation = resp.data if resp.data else None
    if not evaluation:
        raise HTTPException(status_code=404, detail="evaluation not found")

    if evaluation["user_id"] != req.user_id:
        raise HTTPException(status_code=403, detail="user_id mismatch")

    if evaluation["status"] == "ACTIVE":
        # Already activated — idempotent success
        return {"ok": True, "message": "already active"}

    if evaluation["status"] != "PENDING":
        raise HTTPException(
            status_code=400,
            detail=f"evaluation not in PENDING state (status={evaluation['status']})",
        )

    # 3. PENDING → ACTIVE
    now = datetime.now(tz=timezone.utc).isoformat()
    sb.table("evaluations").update(
        {
            "status": "ACTIVE",
            "stripe_payment_intent": req.stripe_payment_intent,
            "payment_method": "stripe",
            "paid_at": now,
            "started_at": now,
            "equity_start": 10000,
            "equity_current": 10000,
        }
    ).eq("id", req.evaluation_id).eq("status", "PENDING").execute()

    log.info(
        "propfirm payment confirmed manually: eval=%s user=%s pi=%s",
        req.evaluation_id,
        req.user_id,
        req.stripe_payment_intent,
    )
    return {"ok": True, "message": "evaluation activated"}
