"""
PropFirm fill hook — W-PF-202 PR 2

try_fill() 직후 호출. active evaluation을 찾아 MLL + MinDays 룰 평가.
위반 시 rule_violations insert + evaluations.status='FAILED' CAS UPDATE.
MinDays는 위반이 아니라 trading_days 캐시 +1만 처리.

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

# mark_px staleness threshold (seconds)
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
    """PropFirm eval hook — MLL + MinDays 평가.

    Returns list of RuleResult (empty on early-return or DB error).
    """
    try:
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        # 1. trading_accounts → user_id
        ta_resp = (
            client.table("trading_accounts")
            .select("user_id")
            .eq("id", account_id)
            .single()
            .execute()
        )
        if not ta_resp.data:
            log.warning("hook: no trading_account for account_id=%s", account_id)
            return []
        user_id: str = ta_resp.data["user_id"]

        # 2. active evaluation
        eval_resp = (
            client.table("evaluations")
            .select(
                "id, status, tier_id, trading_days, started_at"
            )
            .eq("user_id", user_id)
            .eq("status", "ACTIVE")
            .limit(1)
            .execute()
        )
        if not eval_resp.data:
            log.debug("hook: no ACTIVE evaluation for user_id=%s", user_id)
            return []
        evaluation = eval_resp.data[0]
        eval_id: str = evaluation["id"]
        tier_id: str = evaluation["tier_id"]
        trading_days: int = evaluation.get("trading_days") or 0

        # 3. challenge_tiers → mll_pct, min_trading_days, equity_start
        tier_resp = (
            client.table("challenge_tiers")
            .select("mll_pct, min_trading_days, equity_start")
            .eq("id", tier_id)
            .single()
            .execute()
        )
        if not tier_resp.data:
            log.warning("hook: no challenge_tier for tier_id=%s", tier_id)
            return []
        tier = tier_resp.data
        mll_pct: float = float(tier["mll_pct"])
        min_trading_days: int = int(tier["min_trading_days"])
        equity_start: float = float(tier["equity_start"])

        # 4. MLL 계산용 데이터 수집

        # 4a. 오늘(UTC) fills → realized_today, fee_today
        today_utc: str = datetime.now(timezone.utc).date().isoformat()
        fills_resp = (
            client.table("pf_fills")
            .select("side, qty, fill_px, fee")
            .eq("account_id", account_id)
            .gte("filled_at", f"{today_utc}T00:00:00+00:00")
            .execute()
        )
        fills = fills_resp.data or []

        realized_today: float = 0.0
        fee_today: float = 0.0
        for f in fills:
            f_qty = float(f.get("qty") or 0)
            f_px = float(f.get("fill_px") or 0)
            f_fee = float(f.get("fee") or 0)
            f_side = f.get("side", "BUY")
            # 현금흐름: SELL = 수익(+), BUY = 매입비용(-)
            if f_side == "SELL":
                realized_today += f_qty * f_px
            else:
                realized_today -= f_qty * f_px
            fee_today += f_fee

        # 4b. unrealized PnL (open positions)
        pos_resp = (
            client.table("pf_positions")
            .select("unrealized_pnl, updated_at")
            .eq("account_id", account_id)
            .eq("status", "OPEN")
            .execute()
        )
        positions = pos_resp.data or []
        unrealized: float = sum(float(p.get("unrealized_pnl") or 0) for p in positions)

        # 4c. stale mark check
        now_ts = filled_at.timestamp()
        stale_mark: bool = False
        for p in positions:
            upd = p.get("updated_at")
            if upd:
                try:
                    upd_dt = datetime.fromisoformat(upd.replace("Z", "+00:00"))
                    if (now_ts - upd_dt.timestamp()) >= _STALE_MARK_SECS:
                        stale_mark = True
                        break
                except (ValueError, TypeError):
                    pass

        # 5. evaluate_mll
        mll_result = evaluate_mll(
            MllInput(
                equity_start=equity_start,
                mll_pct=mll_pct,
                realized_today=realized_today,
                fee_today=fee_today,
                unrealized=unrealized,
                stale_mark=stale_mark,
                evaluated_at=filled_at,
            )
        )

        # 6. MLL 위반 처리
        if not mll_result.passed:
            from propfirm.evaluation import EvaluationStateMachine
            sm = EvaluationStateMachine()
            await sm.fail(eval_id, RuleEnum.MLL, mll_result.detail)
            log.warning(
                "hook: MLL FAILED eval_id=%s detail=%s",
                eval_id,
                mll_result.detail,
            )

        # 7. trading_days 갱신 (신규 거래일인 경우)
        fill_date: date = filled_at.astimezone(timezone.utc).date()
        today_date: date = datetime.now(timezone.utc).date()
        new_trading_days = trading_days

        if fill_date == today_date:
            # 오늘 이전에 fill이 있었는지 확인 (현재 fill 제외)
            prev_fills_resp = (
                client.table("pf_fills")
                .select("id")
                .eq("account_id", account_id)
                .gte("filled_at", f"{today_utc}T00:00:00+00:00")
                .limit(2)
                .execute()
            )
            prev_count = len(prev_fills_resp.data or [])
            # fills에는 현재 fill도 포함됨 — 1개면 오늘 첫 fill
            if prev_count <= 1:
                new_trading_days = trading_days + 1
                client.table("evaluations").update(
                    {"trading_days": new_trading_days}
                ).eq("id", eval_id).execute()
                log.info(
                    "hook: trading_days +1 → %d for eval_id=%s",
                    new_trading_days,
                    eval_id,
                )

        # 8. evaluate_min_days
        min_days_result = evaluate_min_days(
            MinDaysInput(
                trading_days=new_trading_days,
                min_required=min_trading_days,
                evaluated_at=filled_at,
            )
        )

        # 9. MLL 통과한 경우 consistency + profit_goal 평가 및 PASSED 체크
        if mll_result.passed:
            # 챌린지 시작 이후 전체 fills SUM → total_pnl, max_single_day_pnl
            started_at: str = evaluation.get("started_at") or "1970-01-01T00:00:00+00:00"
            all_fills_resp = (
                client.table("pf_fills")
                .select("side, qty, fill_px, fee, filled_at")
                .eq("account_id", account_id)
                .gte("filled_at", started_at)
                .execute()
            )
            all_fills = all_fills_resp.data or []

            total_pnl: float = 0.0
            daily_pnl: dict[str, float] = {}
            for f in all_fills:
                f_qty = float(f.get("qty") or 0)
                f_px = float(f.get("fill_px") or 0)
                f_fee = float(f.get("fee") or 0)
                f_side = f.get("side", "BUY")
                if f_side == "SELL":
                    pnl_contrib = f_qty * f_px - f_fee
                else:
                    pnl_contrib = -(f_qty * f_px) - f_fee
                total_pnl += pnl_contrib
                # 일별 그룹핑 (UTC 날짜)
                f_date = str(f.get("filled_at", ""))[:10]
                daily_pnl[f_date] = daily_pnl.get(f_date, 0.0) + pnl_contrib

            max_single_day_pnl = max(daily_pnl.values()) if daily_pnl else 0.0

            from propfirm.evaluation import EvaluationStateMachine
            sm = EvaluationStateMachine()

            # consistency 평가
            consistency_result = evaluate_consistency(
                ConsistencyInput(
                    total_pnl=total_pnl,
                    max_single_day_pnl=max_single_day_pnl,
                )
            )
            if not consistency_result.passed:
                await sm.fail(eval_id, RuleEnum.CONSISTENCY, consistency_result.detail)
                log.warning(
                    "hook: CONSISTENCY FAILED eval_id=%s detail=%s",
                    eval_id,
                    consistency_result.detail,
                )
            else:
                # profit_goal 평가
                profit_goal_result = evaluate_profit_goal(
                    ProfitGoalInput(
                        equity_start=equity_start,
                        total_pnl=total_pnl,
                    )
                )
                # profit_goal + min_days 둘 다 passed → PASSED 전이
                if profit_goal_result.passed and min_days_result.passed:
                    snapshot = {
                        "total_pnl": total_pnl,
                        "equity_start": equity_start,
                        "profit_goal_pct": 0.08,
                        "trading_days": new_trading_days,
                        "min_trading_days": min_trading_days,
                        "evaluated_at": filled_at.isoformat(),
                    }
                    await sm.try_pass(eval_id, snapshot)

        # 10. 결과 반환
        return [mll_result, min_days_result]

    except Exception as exc:
        log.warning("hook: on_fill failed (non-fatal): %s", exc)
        return []
