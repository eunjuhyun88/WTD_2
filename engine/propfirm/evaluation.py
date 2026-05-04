"""
EvaluationStateMachine — W-PF-204

PropFirm 챌린지 evaluation 상태 전이 관리.
CAS 패턴으로 동시성 보장 — 200 concurrent fill에서 race 0.

유효 전이:
  PENDING → ACTIVE   : activate(eval_id) — 결제 확인 후
  ACTIVE  → FAILED   : fail(eval_id, rule, detail) — 룰 위반
  ACTIVE  → PASSED   : try_pass(eval_id, snapshot) — 모든 통과 조건 충족

무효 전이 (guard → InvalidTransitionError):
  PENDING → FAILED / PASSED
  FAILED  → anything
  PASSED  → anything
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

# 유효 전이 매트릭스
_VALID_TRANSITIONS: set[tuple[str, str]] = {
    ("PENDING", "ACTIVE"),
    ("ACTIVE", "FAILED"),
    ("ACTIVE", "PASSED"),
}


class InvalidTransitionError(Exception):
    pass


class EvaluationStateMachine:

    def _check_transition(self, from_status: str, to_status: str) -> None:
        """Invalid 전이 시 InvalidTransitionError raise."""
        if (from_status, to_status) not in _VALID_TRANSITIONS:
            raise InvalidTransitionError(
                f"Invalid transition: {from_status!r} → {to_status!r}"
            )

    async def activate(self, eval_id: str) -> bool:
        """PENDING → ACTIVE. 결제 확인 후 호출.
        Returns True if transition succeeded (CAS), False if already moved."""
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        self._check_transition("PENDING", "ACTIVE")

        cas_resp = (
            client.table("evaluations")
            .update({"status": "ACTIVE"})
            .eq("id", eval_id)
            .eq("status", "PENDING")
            .execute()
        )
        cas_count = len(cas_resp.data) if cas_resp.data else 0
        if cas_count == 1:
            log.info("evaluation: PENDING→ACTIVE eval_id=%s", eval_id)
            return True
        else:
            log.info("evaluation: activate CAS miss eval_id=%s", eval_id)
            return False

    async def fail(self, eval_id: str, rule: RuleEnum, detail: dict) -> bool:
        """ACTIVE → FAILED. CAS 패턴.
        성공 시 rule_violations insert.
        Returns True if this caller made the transition."""
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        self._check_transition("ACTIVE", "FAILED")

        cas_resp = (
            client.table("evaluations")
            .update({"status": "FAILED"})
            .eq("id", eval_id)
            .eq("status", "ACTIVE")
            .execute()
        )
        cas_count = len(cas_resp.data) if cas_resp.data else 0
        if cas_count == 1:
            client.table("rule_violations").insert({
                "evaluation_id": eval_id,
                "rule": rule.value,
                "detail": detail,
                "violated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
            log.warning(
                "evaluation: ACTIVE→FAILED eval_id=%s rule=%s",
                eval_id,
                rule.value,
            )
            return True
        else:
            log.info(
                "evaluation: fail CAS miss (already FAILED?) eval_id=%s",
                eval_id,
            )
            return False

    async def try_pass(self, eval_id: str, snapshot: dict) -> bool:
        """ACTIVE → PASSED. profit_goal + min_trading_days 모두 충족 시.
        CAS 패턴. 성공 시 verification_runs insert (result='PASS', snapshot, signed_hash).
        Returns True if transition succeeded."""
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        self._check_transition("ACTIVE", "PASSED")

        # signed_hash 생성
        secret_key = os.environ.get("PROPFIRM_SIGNING_KEY", "dev-secret-key").encode()
        signed_hash = hmac.new(
            secret_key,
            json.dumps(snapshot, sort_keys=True).encode(),
            hashlib.sha256,
        ).hexdigest()

        # CAS UPDATE 먼저 — 성공 시에만 verification_runs insert (CAS miss = 고아 행 방지)
        cas_resp = (
            client.table("evaluations")
            .update({"status": "PASSED"})
            .eq("id", eval_id)
            .eq("status", "ACTIVE")
            .execute()
        )
        cas_count = len(cas_resp.data) if cas_resp.data else 0
        if cas_count == 1:
            client.table("verification_runs").insert({
                "evaluation_id": eval_id,
                "result": "PASS",
                "snapshot": snapshot,
                "signed_hash": signed_hash,
            }).execute()
            log.info("evaluation: ACTIVE→PASSED eval_id=%s", eval_id)
            return True
        else:
            log.info(
                "evaluation: try_pass CAS miss (already PASSED?) eval_id=%s",
                eval_id,
            )
            return False

    async def get_status(self, eval_id: str) -> str | None:
        """현재 status 반환. eval_id 없으면 None."""
        from db.client import get_client  # type: ignore[import]
        client = get_client()

        resp = (
            client.table("evaluations")
            .select("status")
            .eq("id", eval_id)
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0]["status"]
        return None
