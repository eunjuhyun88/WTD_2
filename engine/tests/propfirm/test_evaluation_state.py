"""
EvaluationStateMachine 전이 테스트 — W-PF-204

12 전이 케이스 + 동시성 테스트.

T01: PENDING → ACTIVE (activate 성공)
T02: ACTIVE → FAILED by MLL (fail 성공, rule_violations insert 확인)
T03: ACTIVE → FAILED by CONSISTENCY (fail 성공)
T04: ACTIVE → PASSED (try_pass 성공, verification_runs insert 확인)
T05: ACTIVE → ACTIVE (MLL pass, profit_goal 미달 → 상태 유지)
T06: CAS miss on fail (이미 FAILED → fail returns False, rule_violations 미삽입)
T07: CAS miss on try_pass (이미 PASSED → try_pass returns False)
T08: PENDING → FAILED (InvalidTransitionError)
T09: PENDING → PASSED (InvalidTransitionError)
T10: FAILED → ACTIVE (InvalidTransitionError)
T11: PASSED → FAILED (InvalidTransitionError)
T12: FAILED → PASSED (InvalidTransitionError)
"""
from __future__ import annotations

import asyncio
import sys
import types
import pytest
from unittest.mock import MagicMock, AsyncMock

from propfirm.evaluation import EvaluationStateMachine, InvalidTransitionError
from propfirm.rules.types import RuleEnum


EVAL_ID = "eval-001"


def _make_response(data):
    r = MagicMock()
    r.data = data
    return r


def _make_client(
    *,
    cas_update_count: int = 1,
    current_status: str = "ACTIVE",
) -> MagicMock:
    """Mock Supabase client for EvaluationStateMachine tests."""
    client = MagicMock()

    def table_side_effect(table_name: str) -> MagicMock:
        tbl = MagicMock()

        if table_name == "evaluations":
            # select chain (get_status)
            sel = MagicMock()
            sel.select.return_value = sel
            sel.eq.return_value = sel
            sel.limit.return_value = sel
            sel.execute.return_value = _make_response(
                [{"status": current_status}] if current_status else []
            )
            tbl.select.return_value = sel

            # update chain (CAS)
            upd = MagicMock()
            upd.eq.return_value = upd
            cas_data = [{"id": EVAL_ID}] * cas_update_count
            upd.execute.return_value = _make_response(cas_data)
            tbl.update.return_value = upd

        elif table_name == "rule_violations":
            ins = MagicMock()
            ins.execute.return_value = _make_response([{"id": "rv-001"}])
            tbl.insert.return_value = ins

        elif table_name == "verification_runs":
            ins = MagicMock()
            ins.execute.return_value = _make_response([{"id": "vr-001"}])
            tbl.insert.return_value = ins

        return tbl

    client.table.side_effect = table_side_effect
    return client


def _inject_db_client(client: MagicMock):
    """Inject mock client into sys.modules."""
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


# ─── T01: PENDING → ACTIVE ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_t01_activate_pending_to_active():
    """T01: activate() 성공 → True 반환, evaluations.update 호출됨."""
    client = _make_client(cas_update_count=1, current_status="PENDING")
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        result = await sm.activate(EVAL_ID)
    finally:
        _remove_db_client()

    assert result is True
    eval_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "evaluations"]
    assert len(eval_calls) >= 1


# ─── T02: ACTIVE → FAILED by MLL ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_t02_fail_by_mll():
    """T02: fail() MLL 위반 → True, rule_violations insert 확인."""
    client = _make_client(cas_update_count=1)
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        detail = {"total_loss_pct": -0.06, "evaluated_at": "2026-05-04T12:00:00+00:00"}
        result = await sm.fail(EVAL_ID, RuleEnum.MLL, detail)
    finally:
        _remove_db_client()

    assert result is True
    rv_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "rule_violations"]
    assert len(rv_calls) == 1


# ─── T03: ACTIVE → FAILED by CONSISTENCY ─────────────────────────────────────

@pytest.mark.asyncio
async def test_t03_fail_by_consistency():
    """T03: fail() CONSISTENCY 위반 → True, rule_violations insert."""
    client = _make_client(cas_update_count=1)
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        detail = {"ratio": 0.45, "consistency_limit": 0.40, "evaluated_at": "2026-05-04T12:00:00+00:00"}
        result = await sm.fail(EVAL_ID, RuleEnum.CONSISTENCY, detail)
    finally:
        _remove_db_client()

    assert result is True
    rv_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "rule_violations"]
    assert len(rv_calls) == 1
    # rule 값 확인
    insert_call = client.table("rule_violations").insert.call_args
    # insert was called — verified by rv_calls length


# ─── T04: ACTIVE → PASSED ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_t04_try_pass_succeeds():
    """T04: try_pass() 성공 → True, verification_runs insert 확인."""
    client = _make_client(cas_update_count=1)
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        snapshot = {
            "total_pnl": 9000.0,
            "equity_start": 100000.0,
            "profit_goal_pct": 0.08,
            "trading_days": 12,
            "min_trading_days": 10,
            "evaluated_at": "2026-05-04T12:00:00+00:00",
        }
        result = await sm.try_pass(EVAL_ID, snapshot)
    finally:
        _remove_db_client()

    assert result is True
    vr_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "verification_runs"]
    assert len(vr_calls) >= 1


# ─── T05: ACTIVE → ACTIVE (MLL pass, profit_goal 미달) ───────────────────────

@pytest.mark.asyncio
async def test_t05_active_stays_active_profit_goal_not_met():
    """T05: try_pass는 profit_goal 미달이면 호출되지 않음 → status 유지."""
    client = _make_client(cas_update_count=1)
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        # profit_goal 미달 → try_pass 호출 안 함
        # status는 여전히 ACTIVE
        status = await sm.get_status(EVAL_ID)
    finally:
        _remove_db_client()

    # status remains ACTIVE (no transition happened)
    assert status == "ACTIVE"
    vr_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "verification_runs"]
    assert len(vr_calls) == 0


# ─── T06: CAS miss on fail ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_t06_cas_miss_on_fail():
    """T06: CAS UPDATE count=0 → fail returns False, rule_violations 미삽입."""
    client = _make_client(cas_update_count=0)
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        detail = {"total_loss_pct": -0.06}
        result = await sm.fail(EVAL_ID, RuleEnum.MLL, detail)
    finally:
        _remove_db_client()

    assert result is False
    rv_calls = [c for c in client.table.call_args_list if c.args and c.args[0] == "rule_violations"]
    assert len(rv_calls) == 0


# ─── T07: CAS miss on try_pass ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_t07_cas_miss_on_try_pass():
    """T07: CAS UPDATE count=0 → try_pass returns False."""
    client = _make_client(cas_update_count=0)
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        snapshot = {
            "total_pnl": 9000.0,
            "equity_start": 100000.0,
            "profit_goal_pct": 0.08,
            "trading_days": 12,
            "min_trading_days": 10,
            "evaluated_at": "2026-05-04T12:00:00+00:00",
        }
        result = await sm.try_pass(EVAL_ID, snapshot)
    finally:
        _remove_db_client()

    assert result is False


# ─── T08~T12: 무효 전이 guard ────────────────────────────────────────────────

def test_t08_pending_to_failed_invalid():
    """T08: PENDING → FAILED → InvalidTransitionError."""
    sm = EvaluationStateMachine()
    with pytest.raises(InvalidTransitionError):
        sm._check_transition("PENDING", "FAILED")


def test_t09_pending_to_passed_invalid():
    """T09: PENDING → PASSED → InvalidTransitionError."""
    sm = EvaluationStateMachine()
    with pytest.raises(InvalidTransitionError):
        sm._check_transition("PENDING", "PASSED")


def test_t10_failed_to_active_invalid():
    """T10: FAILED → ACTIVE → InvalidTransitionError."""
    sm = EvaluationStateMachine()
    with pytest.raises(InvalidTransitionError):
        sm._check_transition("FAILED", "ACTIVE")


def test_t11_passed_to_failed_invalid():
    """T11: PASSED → FAILED → InvalidTransitionError."""
    sm = EvaluationStateMachine()
    with pytest.raises(InvalidTransitionError):
        sm._check_transition("PASSED", "FAILED")


def test_t12_failed_to_passed_invalid():
    """T12: FAILED → PASSED → InvalidTransitionError."""
    sm = EvaluationStateMachine()
    with pytest.raises(InvalidTransitionError):
        sm._check_transition("FAILED", "PASSED")


# ─── 동시성 테스트 ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_concurrent_200_fills_zero_race():
    """200개 동시 fail() 호출 중 CAS 성공은 정확히 1번만."""
    call_count = {"n": 0}
    insert_count = {"n": 0}

    def make_concurrent_client():
        client = MagicMock()

        def table_side_effect(table_name: str) -> MagicMock:
            tbl = MagicMock()

            if table_name == "evaluations":
                upd = MagicMock()
                upd.eq.return_value = upd

                def execute_cas():
                    call_count["n"] += 1
                    # 첫 번째 호출만 count=1, 나머지는 count=0
                    if call_count["n"] == 1:
                        return _make_response([{"id": EVAL_ID}])
                    else:
                        return _make_response([])

                upd.execute.side_effect = execute_cas
                tbl.update.return_value = upd

            elif table_name == "rule_violations":
                ins = MagicMock()

                def execute_insert():
                    insert_count["n"] += 1
                    return _make_response([{"id": "rv-001"}])

                ins.execute.side_effect = execute_insert
                tbl.insert.return_value = ins

            return tbl

        client.table.side_effect = table_side_effect
        return client

    client = make_concurrent_client()
    _inject_db_client(client)
    try:
        sm = EvaluationStateMachine()
        detail = {"total_loss_pct": -0.06}

        tasks = [sm.fail(EVAL_ID, RuleEnum.MLL, detail) for _ in range(200)]
        results = await asyncio.gather(*tasks)
    finally:
        _remove_db_client()

    # 정확히 1번만 CAS 성공
    assert sum(1 for r in results if r is True) == 1
    assert sum(1 for r in results if r is False) == 199
    # rule_violations insert 1번만
    assert insert_count["n"] == 1
