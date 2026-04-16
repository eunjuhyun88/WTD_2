from __future__ import annotations

import pytest

from ops.state_store import OpsStateConflictError, OpsStateStore


def test_session_lifecycle_persists(tmp_path) -> None:
    db_path = tmp_path / "agent-control.sqlite"
    store = OpsStateStore(db_path)

    session = store.start_session(
        agent_name="codex",
        owner="engine",
        work_item_ref="W-0052",
        branch_name="task/w-0052-state-store",
        worktree_path=tmp_path / "wt-state-store",
        started_at="2026-04-16T10:00:00+00:00",
        metadata={"note": "phase1"},
    )
    assert session.status == "active"

    claim = store.get_work_claim(session.session_id)
    lease = store.get_branch_lease(session.session_id)
    assert claim is not None
    assert lease is not None
    assert claim.work_item_ref == "W-0052"
    assert lease.branch_name == "task/w-0052-state-store"

    updated = store.heartbeat_session(session.session_id, heartbeat_at="2026-04-16T10:05:00+00:00")
    assert updated.last_heartbeat_at == "2026-04-16T10:05:00+00:00"

    event = store.record_handoff_event(
        session_id=session.session_id,
        event_kind="verified",
        summary="targeted tests passed",
        details={"suite": "ops"},
        created_at="2026-04-16T10:10:00+00:00",
    )
    assert event.event_kind == "verified"

    closed = store.close_session(session.session_id, closed_at="2026-04-16T10:15:00+00:00")
    assert closed.status == "closed"
    assert closed.closed_at == "2026-04-16T10:15:00+00:00"

    reloaded = OpsStateStore(db_path)
    bundle = reloaded.get_session_bundle(session.session_id)
    assert bundle is not None
    assert bundle["session"]["status"] == "closed"
    assert bundle["handoff_events"][0]["summary"] == "targeted tests passed"
    assert bundle["work_claim"]["released_at"] == "2026-04-16T10:15:00+00:00"
    assert bundle["branch_lease"]["lease_status"] == "released"


def test_store_rejects_conflicting_claims_and_leases(tmp_path) -> None:
    db_path = tmp_path / "agent-control.sqlite"
    store = OpsStateStore(db_path)

    primary = store.start_session(
        agent_name="codex",
        owner="engine",
        work_item_ref="W-0052",
        branch_name="task/w-0052-primary",
        worktree_path=tmp_path / "wt-primary",
        started_at="2026-04-16T11:00:00+00:00",
    )

    with pytest.raises(OpsStateConflictError, match="active claim"):
        store.start_session(
            agent_name="codex",
            owner="engine",
            work_item_ref="W-0052",
            branch_name="task/w-0052-second-primary",
            worktree_path=tmp_path / "wt-second-primary",
            started_at="2026-04-16T11:01:00+00:00",
        )

    with pytest.raises(OpsStateConflictError, match="parent_session_id"):
        store.start_session(
            agent_name="codex",
            owner="engine",
            work_item_ref="W-0052",
            branch_name="task/w-0052-parallel",
            worktree_path=tmp_path / "wt-parallel",
            started_at="2026-04-16T11:02:00+00:00",
            claim_mode="parallel_child",
        )

    parallel = store.start_session(
        agent_name="codex",
        owner="engine",
        work_item_ref="W-0052",
        branch_name="task/w-0052-parallel",
        worktree_path=tmp_path / "wt-parallel",
        started_at="2026-04-16T11:03:00+00:00",
        claim_mode="parallel_child",
        parent_session_id=primary.session_id,
    )
    assert store.get_work_claim(parallel.session_id) is not None

    with pytest.raises(OpsStateConflictError, match="branch task/w-0052-primary"):
        store.start_session(
            agent_name="codex",
            owner="engine",
            work_item_ref="W-0053",
            branch_name="task/w-0052-primary",
            worktree_path=tmp_path / "wt-another",
            started_at="2026-04-16T11:04:00+00:00",
        )


def test_handoff_events_append_in_reverse_chronological_order(tmp_path) -> None:
    db_path = tmp_path / "agent-control.sqlite"
    store = OpsStateStore(db_path)

    session = store.start_session(
        agent_name="codex",
        owner="engine",
        work_item_ref="W-0052",
        branch_name="task/w-0052-events",
        worktree_path=tmp_path / "wt-events",
        started_at="2026-04-16T12:00:00+00:00",
    )

    store.record_handoff_event(
        session_id=session.session_id,
        event_kind="impl_ready",
        summary="implementation ready",
        details={},
        created_at="2026-04-16T12:05:00+00:00",
    )
    store.record_handoff_event(
        session_id=session.session_id,
        event_kind="verified",
        summary="tests passed",
        details={"tests": 3},
        created_at="2026-04-16T12:10:00+00:00",
    )

    events = store.list_handoff_events(session_id=session.session_id)
    assert [item.event_kind for item in events] == ["verified", "impl_ready"]

