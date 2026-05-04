"""PropFirm fill hook — W-PF-202

try_fill() 직후 호출. active evaluation을 찾아 MLL → Consistency → ProfitGoal + MinDays 순으로 평가.
위반 시 rule_violations insert + evaluations.status='FAILED' CAS UPDATE.
PASSED 조건 충족 시 verification_runs insert + evaluations.status='PASSED' CAS UPDATE.

hook 예외는 절대 try_fill로 전파하지 않음 (try/except 격리).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, date

from propfirm.rules.types import (
    MllInput, MinDaysInput, ConsistencyInput, ProfitGoalInput,
    RuleResult, RuleEnum,
)
from propfirm.rules.mll import evaluate_mll
from propfirm.rules.min_days import evaluate_min_days
from propfirm.rules.consistency import evaluate_consistency
from propfirm.rules.profit_goal import evaluate_profit_goal

log = logging.getLogger("engine.propfirm.hook")

_STALE_MARK_SECS = 30


async def on_fill(
    *,
    account_id: str,
    fill_px: float,
    qty: float,
    fee: float,
    side: str,
    symbol: str,
    filled_at: datetime,
) -> list[RuleResult]:
    """PropFirm eval hook — fill마다 호출. 룰 평가 후 상태 전이.

    Returns list[RuleResult] — 평가된 룰 목록 (빈 리스트 = early-return 또는 DB 오류).
    """
    try:
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        # 1. account_id → user_id (PAPER 계정 소유자)
        ta_resp = (
            client.table("trading_accounts")
            .select("user_id")
            .eq("id", account_id)
            .eq("account_type", "PAPER")
            .single()
            .execute()
        )
        if not ta_resp.data:
            return []
        user_id: str = ta_resp.data["user_id"]

        # 2. ACTIVE evaluation
        eval_resp = (
            client.table("evaluations")
            .select("id, status, tier_id, trading_days, started_at, account_id")
            .eq("user_id", user_id)
            .eq("status", "ACTIVE")
            .limit(1)
            .execute()
        )
        if not eval_resp.data:
            return []
        evaluation = eval_resp.data[0]
        eval_id: str = evaluation["id"]
        tier_id: str = evaluation["tier_id"]
        trading_days: int = evaluation.get("trading_days") or 0

        # 3. challenge_tiers — 룰 파라미터
        tier_resp = (
            client.table("challenge_tiers")
            .select("mll_pct, min_trading_days, initial_balance, profit_goal_pct, consistency_cap_pct")
            .eq("id", tier_id)
            .single()
            .execute()
        )
        if not tier_resp.data:
            log.warning("hook: no challenge_tier tier_id=%s", tier_id)
            return []
        tier = tier_resp.data
        mll_pct: float = float(tier["mll_pct"])
        min_trading_days: int = int(tier["min_trading_days"])
        initial_balance: float = float(tier["initial_balance"])
        profit_goal_pct: float = float(tier["profit_goal_pct"])
        consistency_cap_pct: float = float(tier["consistency_cap_pct"])

        # 4. 오늘(UTC) fills → realized_today, fee_today
        today_utc: str = datetime.now(timezone.utc).date().isoformat()
        fills_resp = (
            client.table("pf_fills")
            .select("side, qty, fill_px, fee")
            .eq("account_id", account_id)
            .gte("filled_at", f"{today_utc}T00:00:00+00:00")
            .execute()
        )
        realized_today: float = 0.0
        fee_today: float = 0.0
        for f in fills_resp.data or []:
            f_qty = float(f.get("qty") or 0)
            f_px = float(f.get("fill_px") or 0)
            f_fee = float(f.get("fee") or 0)
            if f.get("side") == "SELL":
                realized_today += f_qty * f_px
            else:
                realized_today -= f_qty * f_px
            fee_today += f_fee

        # 5. unrealized PnL + stale mark 체크
        pos_resp = (
            client.table("pf_positions")
            .select("unrealized_pnl, updated_at")
            .eq("account_id", account_id)
            .eq("status", "OPEN")
            .execute()
        )
        positions = pos_resp.data or []
        unrealized: float = sum(float(p.get("unrealized_pnl") or 0) for p in positions)

        now_ts = filled_at.timestamp()
        stale_mark: bool = any(
            (now_ts - datetime.fromisoformat(
                str(p.get("updated_at", "")).replace("Z", "+00:00")
            ).timestamp()) >= _STALE_MARK_SECS
            for p in positions
            if p.get("updated_at")
        )

        # 6. MLL 평가
        mll_result = evaluate_mll(MllInput(
            equity_start=initial_balance,
            mll_pct=mll_pct,
            realized_today=realized_today,
            fee_today=fee_today,
            unrealized=unrealized,
            stale_mark=stale_mark,
            evaluated_at=filled_at,
        ))

        if not mll_result.passed:
            from propfirm.evaluation import EvaluationStateMachine
            await EvaluationStateMachine().fail(eval_id, RuleEnum.MLL, mll_result.detail)
            log.warning("hook: MLL FAILED eval_id=%s", eval_id)
            return [mll_result]

        # 7. trading_days 갱신 (오늘 첫 fill인 경우)
        prev_fills_resp = (
            client.table("pf_fills")
            .select("id")
            .eq("account_id", account_id)
            .gte("filled_at", f"{today_utc}T00:00:00+00:00")
            .limit(2)
            .execute()
        )
        new_trading_days = trading_days
        if len(prev_fills_resp.data or []) <= 1:  # 현재 fill 포함 1개 = 오늘 첫 fill
            new_trading_days = trading_days + 1
            client.table("evaluations").update(
                {"trading_days": new_trading_days}
            ).eq("id", eval_id).execute()
            log.info("hook: trading_days +1 → %d eval_id=%s", new_trading_days, eval_id)

        min_days_result = evaluate_min_days(MinDaysInput(
            trading_days=new_trading_days,
            min_required=min_trading_days,
            evaluated_at=filled_at,
        ))

        # 8. 챌린지 시작 이후 전체 PnL 집계 (Consistency + ProfitGoal용)
        started_at: str = evaluation.get("started_at") or "1970-01-01T00:00:00+00:00"
        all_fills_resp = (
            client.table("pf_fills")
            .select("side, qty, fill_px, fee, filled_at")
            .eq("account_id", account_id)
            .gte("filled_at", started_at)
            .execute()
        )

        total_pnl: float = 0.0
        daily_pnl: dict[str, float] = {}
        for f in all_fills_resp.data or []:
            f_qty = float(f.get("qty") or 0)
            f_px = float(f.get("fill_px") or 0)
            f_fee = float(f.get("fee") or 0)
            pnl = (f_qty * f_px - f_fee) if f.get("side") == "SELL" else -(f_qty * f_px) - f_fee
            total_pnl += pnl
            f_date = str(f.get("filled_at", ""))[:10]
            daily_pnl[f_date] = daily_pnl.get(f_date, 0.0) + pnl

        max_single_day_pnl = max(daily_pnl.values()) if daily_pnl else 0.0

        # 9. Consistency 평가
        consistency_result = evaluate_consistency(ConsistencyInput(
            total_pnl=total_pnl,
            max_single_day_pnl=max_single_day_pnl,
            cap_pct=consistency_cap_pct,
        ))

        if not consistency_result.passed:
            from propfirm.evaluation import EvaluationStateMachine
            await EvaluationStateMachine().fail(eval_id, RuleEnum.CONSISTENCY, consistency_result.detail)
            log.warning("hook: CONSISTENCY FAILED eval_id=%s", eval_id)
            return [mll_result, min_days_result, consistency_result]

        # 10. ProfitGoal 평가
        profit_goal_result = evaluate_profit_goal(ProfitGoalInput(
            equity_start=initial_balance,
            total_pnl=total_pnl,
            profit_goal_pct=profit_goal_pct,
        ))

        # 11. PASSED 조건: profit_goal + min_days 둘 다 충족
        if profit_goal_result.passed and min_days_result.passed:
            snapshot = {
                "total_pnl": total_pnl,
                "equity_start": initial_balance,
                "profit_goal_pct": profit_goal_pct,
                "trading_days": new_trading_days,
                "min_trading_days": min_trading_days,
                "consistency_ratio": consistency_result.detail.get("ratio"),
                "evaluated_at": filled_at.isoformat(),
            }
            from propfirm.evaluation import EvaluationStateMachine
            await EvaluationStateMachine().try_pass(eval_id, snapshot)

        return [mll_result, min_days_result, consistency_result, profit_goal_result]

    except Exception as exc:
        log.warning("hook: on_fill failed (non-fatal): %s", exc)
        return []
