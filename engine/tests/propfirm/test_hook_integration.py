"""
PropFirm fill hook integration tests — W-PF-202 PR 2

6 케이스. 실제 Supabase 호출 없이 unittest.mock으로 DB를 모킹.

TC1: active evaluation 없음 → early return [], no DB write
TC2: MLL 위반 (total_loss <= -5%) → evaluations FAILED + rule_violations insert
TC3: MLL 통과 (total_loss > -5%) → no FAILED update, rule_violations 없음
TC4: CAS 실패 (다른 fill이 먼저 FAILED로 만든 경우, update count=0) → rule_violations insert 안 함
TC5: hook 내부 예외 발생 → try_fill 결과에 영향 없음
TC6: 신규 거래일 → evaluations.trading_days +1 UPDATE 호출됨
"""
from __future__ import annotations

import sys
import types
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


FIXED_NOW = datetime(2026, 5, 4, 12, 0, 0, tzinfo=timezone.utc)
TODAY_ISO = "2026-05-04"

ACCOUNT_ID = "acc-001"
USER_ID = "user-001"
EVAL_ID = "eval-001"
TIER_ID = "tier-001"


def _make_response(data):
    """Return a mock execute-result with .data."""
    r = MagicMock()
    r.data = data
    return r


def _make_client(
    *,
    user_id: str = USER_ID,
    has_active_eval: bool = True,
    trading_days: int = 3,
    mll_pct: float = 0.05,
    min_trading_days: int = 10,
    equity_start: float = 100_000.0,
    fills: list[dict] | None = None,
    positions: list[dict] | None = None,
    cas_count: int = 1,
    prev_fills_count: int = 1,
) -> MagicMock:
    """Build a mock Supabase client with configurable responses."""
    if fills is None:
        fills = []
    if positions is None:
        positions = []

    client = MagicMock()

    def table_side_effect(table_name: str) -> MagicMock:
        tbl = MagicMock()

        if table_name == "trading_accounts":
            chain = MagicMock()
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.single.return_value = chain
            chain.execute.return_value = _make_response({"user_id": user_id} if user_id else None)
            tbl.select.return_value = chain

        elif table_name == "evaluations":
            eval_data = (
                [{
                    "id": EVAL_ID,
                    "status": "ACTIVE",
                    "tier_id": TIER_ID,
                    "trading_days": trading_days,
                    "started_at": "2026-05-01T00:00:00+00:00",
                    "equity_start": equity_start,
                }]
                if has_active_eval else []
            )

            # select chain
            sel = MagicMock()
            sel.eq.return_value = sel
            sel.limit.return_value = sel
            sel.execute.return_value = _make_response(eval_data)
            tbl.select.return_value = sel

            # update chain (CAS FAILED / trading_days +1)
            upd = MagicMock()
            upd.eq.return_value = upd
            cas_data = [{"id": EVAL_ID}] * cas_count
            upd.execute.return_value = _make_response(cas_data)
            tbl.update.return_value = upd

        elif table_name == "challenge_tiers":
            chain = MagicMock()
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.single.return_value = chain
            chain.execute.return_value = _make_response({
                "mll_pct": mll_pct,
                "min_trading_days": min_trading_days,
            })
            tbl.select.return_value = chain

        elif table_name == "pf_fills":
            # Two .select() calls in sequence
            fills_chain_1 = MagicMock()
            fills_chain_1.eq.return_value = fills_chain_1
            fills_chain_1.gte.return_value = fills_chain_1
            fills_chain_1.execute.return_value = _make_response(fills)

            fills_chain_2 = MagicMock()
            fills_chain_2.eq.return_value = fills_chain_2
            fills_chain_2.gte.return_value = fills_chain_2
            fills_chain_2.limit.return_value = fills_chain_2
            fills_chain_2.execute.return_value = _make_response(
                [{"id": f"f{i}"} for i in range(prev_fills_count)]
            )

            call_n = {"n": 0}

            def select_dispatch(*args, **kwargs):
                call_n["n"] += 1
                return fills_chain_1 if call_n["n"] == 1 else fills_chain_2

            tbl.select.side_effect = select_dispatch

        elif table_name == "pf_positions":
            chain = MagicMock()
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.execute.return_value = _make_response(positions)
            tbl.select.return_value = chain

        elif table_name == "rule_violations":
            ins = MagicMock()
            ins.execute.return_value = _make_response([{"id": "rv-001"}])
            tbl.insert.return_value = ins

        return tbl

    client.table.side_effect = table_side_effect
    return client


def _inject_db_client(client: MagicMock):
    """Inject mock client into sys.modules so lazy `from db.client import get_client` works."""
    fake_db = types.ModuleType("db")
    fake_db_client = types.ModuleType("db.client")
    fake_db_client.get_client = lambda: client
    fake_db.client = fake_db_client
    sys.modules.setdefault("db", fake_db)
    sys.modules["db.client"] = fake_db_client
    return fake_db_client


def _remove_db_client():
    sys.modules.pop("db.client", None)
    sys.modules.pop("db", None)


# ─── TC1: active evaluation 없음 → early return [] ───────────────────────────

@pytest.mark.asyncio
async def test_tc1_no_active_eval():
    """TC1: evaluations에 ACTIVE 없음 → [] 반환, DB write 없음."""
    client = _make_client(has_active_eval=False)
    _inject_db_client(client)
    try:
        from propfirm.rules.hook import on_fill
        result = await on_fill(
            account_id=ACCOUNT_ID,
            fill_px=100.0,
            qty=1.0,
            fee=0.005,
            side="BUY",
            symbol="BTC",
            filled_at=FIXED_NOW,
        )
    finally:
        _remove_db_client()

    assert result == []
    rv_calls = [
        c for c in client.table.call_args_list
        if c.args and c.args[0] == "rule_violations"
    ]
    assert rv_calls == []


# ─── TC2: MLL 위반 → FAILED + rule_violations ────────────────────────────────

@pytest.mark.asyncio
async def test_tc2_mll_violation():
    """TC2: total_loss = -6000 / 100k → -6% < -5% → MLL 위반."""
    # realized = SELL 94k - BUY 100k = -6_000 (-6%)
    fills = [
        {"side": "SELL", "qty": 1.0, "fill_px": 94_000.0, "fee": 0.0},
        {"side": "BUY",  "qty": 1.0, "fill_px": 100_000.0, "fee": 0.0},
    ]
    client = _make_client(fills=fills, cas_count=1)
    _inject_db_client(client)
    try:
        from propfirm.rules.hook import on_fill
        result = await on_fill(
            account_id=ACCOUNT_ID,
            fill_px=94_000.0,
            qty=1.0,
            fee=0.0,
            side="SELL",
            symbol="BTC",
            filled_at=FIXED_NOW,
        )
    finally:
        _remove_db_client()

    assert len(result) == 2
    mll_result = result[0]
    assert mll_result.passed is False

    from propfirm.rules.types import RuleEnum
    assert mll_result.rule == RuleEnum.MLL

    # evaluations.update called (FAILED CAS)
    eval_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "evaluations"]
    assert len(eval_calls) >= 1

    # rule_violations.insert called
    rv_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "rule_violations"]
    assert len(rv_calls) == 1


# ─── TC3: MLL 통과 → no FAILED, no rule_violations ───────────────────────────

@pytest.mark.asyncio
async def test_tc3_mll_pass():
    """TC3: total_loss = -1000 / 100k → -1% > -5% → 통과."""
    fills = [
        {"side": "BUY", "qty": 1.0, "fill_px": 1_000.0, "fee": 0.0},
    ]
    # realized = -1_000 → -1% — passes MLL
    client = _make_client(fills=fills)
    _inject_db_client(client)
    try:
        from propfirm.rules.hook import on_fill
        result = await on_fill(
            account_id=ACCOUNT_ID,
            fill_px=1_000.0,
            qty=1.0,
            fee=0.0,
            side="BUY",
            symbol="ETH",
            filled_at=FIXED_NOW,
        )
    finally:
        _remove_db_client()

    assert len(result) == 2
    assert result[0].passed is True

    rv_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "rule_violations"]
    assert rv_calls == []


# ─── TC4: CAS 실패 → rule_violations insert 안 함 ────────────────────────────

@pytest.mark.asyncio
async def test_tc4_cas_miss():
    """TC4: MLL 위반이지만 CAS UPDATE count=0 → rule_violations insert 없음."""
    fills = [
        {"side": "BUY",  "qty": 1.0, "fill_px": 100_000.0, "fee": 0.0},
        {"side": "SELL", "qty": 1.0, "fill_px": 90_000.0,  "fee": 0.0},
    ]
    # realized = 90k - 100k = -10k → -10% → 위반
    client = _make_client(fills=fills, cas_count=0)  # CAS returns 0 rows
    _inject_db_client(client)
    try:
        from propfirm.rules.hook import on_fill
        result = await on_fill(
            account_id=ACCOUNT_ID,
            fill_px=90_000.0,
            qty=1.0,
            fee=0.0,
            side="SELL",
            symbol="BTC",
            filled_at=FIXED_NOW,
        )
    finally:
        _remove_db_client()

    assert len(result) == 2
    assert result[0].passed is False  # MLL 위반

    # CAS 실패 → rule_violations insert 없음
    rv_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "rule_violations"]
    assert rv_calls == []


# ─── TC5: hook 예외 → try_fill 결과에 영향 없음 ──────────────────────────────

@pytest.mark.asyncio
async def test_tc5_hook_exception_isolation():
    """TC5: on_fill이 예외를 던져도 match.try_fill은 True 반환."""
    with patch("propfirm.match.LimitMatcher._get_order") as mock_get_order, \
         patch("propfirm.match.LimitMatcher._record_fill") as mock_record_fill, \
         patch("propfirm.match.LimitMatcher._mark_order_filled") as mock_mark, \
         patch("propfirm.match.LimitMatcher._open_position") as mock_pos, \
         patch("propfirm.match.LimitMatcher._link_order_to_position") as mock_link, \
         patch("propfirm.rules.hook.on_fill", side_effect=RuntimeError("DB down")):

        mock_get_order.return_value = {
            "account_id": ACCOUNT_ID,
            "qty": 1.0,
            "side": "BUY",
            "status": "PENDING",
        }
        mock_record_fill.return_value = None
        mock_mark.return_value = None
        mock_pos.return_value = "pos-001"
        mock_link.return_value = None

        from propfirm.match import LimitMatcher
        matcher = LimitMatcher()
        result = await matcher.try_fill(
            order_id="order-001",
            symbol="BTC",
            mid_price=50_000.0,
        )

    assert result is True  # hook 예외에 관계없이 fill 성공


# ─── TC6: 신규 거래일 → trading_days +1 ──────────────────────────────────────

@pytest.mark.asyncio
async def test_tc6_new_trading_day():
    """TC6: 오늘 첫 fill → evaluations.trading_days +1 UPDATE 호출됨."""
    client = _make_client(
        fills=[],           # 오늘 fill 없음 → realized 0 → MLL 통과
        trading_days=3,
        prev_fills_count=1,  # 오늘 첫 fill (현재 fill 포함 1개)
    )

    update_calls: list[dict] = []
    original_side_effect = client.table.side_effect

    def capturing_table(name):
        tbl = original_side_effect(name)
        if name == "evaluations":
            orig_update = tbl.update

            def capturing_update(data):
                update_calls.append(data)
                return orig_update(data)

            tbl.update = capturing_update
        return tbl

    client.table.side_effect = capturing_table

    _inject_db_client(client)
    try:
        from propfirm.rules.hook import on_fill
        result = await on_fill(
            account_id=ACCOUNT_ID,
            fill_px=1_000.0,
            qty=0.1,
            fee=0.0,
            side="BUY",
            symbol="ETH",
            filled_at=FIXED_NOW,
        )
    finally:
        _remove_db_client()

    assert len(result) == 2

    # trading_days +1 UPDATE가 호출됐는지 확인
    td_updates = [d for d in update_calls if "trading_days" in d]
    assert len(td_updates) == 1
    assert td_updates[0]["trading_days"] == 4  # 3 + 1
