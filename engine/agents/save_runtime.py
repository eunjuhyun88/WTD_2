"""Capture save runtime — /agent/save (W-0387).

Idempotent INSERT into terminal_pattern_captures using an evidence_hash
derived from the indicator snapshot + decision fields.
LLM generates a short Korean reason summary (optional; failure → reason=None).
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

log = logging.getLogger("engine.agents.save_runtime")

_SAVE_REASON_SYSTEM = """당신은 퀀트 트레이더 보조 AI입니다.
아래 진입 판단 정보를 받아 80자 이내의 한국어 한 문장으로 요약하세요.
JSON 없이 문장만 반환하세요."""


def build_reason_prompt(
    symbol: str,
    timeframe: str,
    verdict: str,
    entry: float | None,
    stop: float | None,
    target: float | None,
    rationale: str,
) -> str:
    parts = [f"{symbol} ({timeframe}) {verdict.upper()}"]
    if entry is not None:
        parts.append(f"entry={entry}")
    if stop is not None:
        parts.append(f"stop={stop}")
    if target is not None:
        parts.append(f"target={target}")
    if rationale:
        parts.append(f"근거: {rationale}")
    return " | ".join(parts)


def _evidence_hash(
    snapshot: dict[str, float],
    decision: dict[str, Any],
) -> str:
    """Stable 32-char hex hash over sorted snapshot values + decision fields."""
    payload = {
        "snapshot": {k: snapshot[k] for k in sorted(snapshot)},
        "verdict": decision.get("verdict"),
        "entry": decision.get("entry"),
        "stop": decision.get("stop"),
        "target": decision.get("target"),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


def promote_capture(
    sb_client: Any,
    user_id: str,
    symbol: str,
    timeframe: str,
    snapshot: dict[str, float],
    decision: dict[str, Any],
    trigger_origin: str,
    reason: str | None,
) -> dict[str, Any]:
    """Lookup existing capture by evidence_hash; INSERT if absent.

    Returns {'capture_id': str, 'dup_of': str | None}.
    Never raises — errors are logged and a fallback capture_id is generated.
    """
    e_hash = _evidence_hash(snapshot, decision)

    try:
        existing = (
            sb_client.table("terminal_pattern_captures")
            .select("id")
            .eq("user_id", user_id)
            .eq("symbol", symbol)
            .eq("timeframe", timeframe)
            .eq("evidence_hash", e_hash)
            .limit(1)
            .execute()
        )
        if existing.data:
            dup_id = existing.data[0]["id"]
            log.debug("promote_capture: dup found %s", dup_id)
            return {"capture_id": dup_id, "dup_of": dup_id}
    except Exception as exc:
        log.warning("promote_capture lookup failed: %s", exc)

    import uuid
    capture_id = str(uuid.uuid4())
    row = {
        "id": capture_id,
        "user_id": user_id,
        "symbol": symbol,
        "timeframe": timeframe,
        "context_kind": "agent_judge",
        "trigger_origin": trigger_origin,
        "snapshot": snapshot,
        "decision": decision,
        "evidence_hash": e_hash,
        "reason": reason,
        "source_freshness": {},
    }
    try:
        sb_client.table("terminal_pattern_captures").insert(row).execute()
        log.debug("promote_capture: inserted %s", capture_id)
    except Exception as exc:
        log.warning("promote_capture insert failed: %s", exc)

    return {"capture_id": capture_id, "dup_of": None}
