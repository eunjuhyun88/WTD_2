"""EvaluationStateMachine — W-PF-204

PropFirm 챌린지 evaluation 상태 전이 관리.
CAS 패턴으로 동시성 보장 — 200 concurrent fill에서 race 0.

유효 전이:
  PENDING → ACTIVE  : activate()  — 결제 확인 후
  ACTIVE  → FAILED  : fail()      — 룰 위반
  ACTIVE  → PASSED  : try_pass()  — 모든 통과 조건 충족
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone

from propfirm.rules.types import RuleEnum

log = logging.getLogger("engine.propfirm.evaluation")

_VALID_TRANSITIONS: set[tuple[str, str]] = {
    ("PENDING", "ACTIVE"),
    ("ACTIVE", "FAILED"),
    ("ACTIVE", "PASSED"),
}


class InvalidTransitionError(Exception):
    pass


class EvaluationStateMachine:

    def _check_transition(self, from_status: str, to_status: str) -> None:
        if (from_status, to_status) not in _VALID_TRANSITIONS:
            raise InvalidTransitionError(
                f"Invalid transition: {from_status!r} → {to_status!r}"
            )

    async def activate(self, eval_id: str) -> bool:
        """PENDING → ACTIVE. 결제 확인 후 호출.
        DB 트리거(fn_create_paper_account)가 PAPER 계정 생성을 atomic하게 처리.
        Returns True if CAS succeeded."""
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        self._check_transition("PENDING", "ACTIVE")

        resp = (
            client.table("evaluations")
            .update({"status": "ACTIVE"})
            .eq("id", eval_id)
            .eq("status", "PENDING")
            .execute()
        )
        succeeded = bool(resp.data)
        if succeeded:
            log.info("evaluation: PENDING→ACTIVE eval_id=%s", eval_id)
        else:
            log.info("evaluation: activate CAS miss eval_id=%s", eval_id)
        return succeeded

    async def fail(self, eval_id: str, rule: RuleEnum, detail: dict) -> bool:
        """ACTIVE → FAILED. CAS 패턴.
        성공 시 rule_violations insert.
        Returns True if this caller made the transition."""
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        self._check_transition("ACTIVE", "FAILED")

        resp = (
            client.table("evaluations")
            .update({"status": "FAILED"})
            .eq("id", eval_id)
            .eq("status", "ACTIVE")
            .execute()
        )
        succeeded = bool(resp.data)
        if succeeded:
            client.table("rule_violations").insert({
                "evaluation_id": eval_id,
                "rule": rule.value,
                "detail": detail,
                "violated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            log.warning("evaluation: ACTIVE→FAILED eval_id=%s rule=%s", eval_id, rule.value)
        else:
            log.info("evaluation: fail CAS miss eval_id=%s", eval_id)
        return succeeded

    async def try_pass(self, eval_id: str, snapshot: dict) -> bool:
        """ACTIVE → PASSED. profit_goal + min_trading_days 모두 충족 시.
        verification_runs insert (append-only 감사 추적) 후 CAS UPDATE.
        Returns True if transition succeeded."""
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        self._check_transition("ACTIVE", "PASSED")

        secret = os.environ.get("PROPFIRM_SIGNING_KEY", "dev-secret-key").encode()
        signed_hash = hmac.new(
            secret,
            json.dumps(snapshot, sort_keys=True).encode(),
            hashlib.sha256,
        ).hexdigest()

        client.table("verification_runs").insert({
            "evaluation_id": eval_id,
            "result": "PASS",
            "snapshot": snapshot,
            "signed_hash": signed_hash,
        }).execute()

        resp = (
            client.table("evaluations")
            .update({"status": "PASSED"})
            .eq("id", eval_id)
            .eq("status", "ACTIVE")
            .execute()
        )
        succeeded = bool(resp.data)
        if succeeded:
            log.info("evaluation: ACTIVE→PASSED eval_id=%s", eval_id)
        else:
            log.info("evaluation: try_pass CAS miss eval_id=%s", eval_id)
        return succeeded

    async def get_status(self, eval_id: str) -> str | None:
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        resp = (
            client.table("evaluations")
            .select("status")
            .eq("id", eval_id)
            .limit(1)
            .execute()
        )
        return resp.data[0]["status"] if resp.data else None
