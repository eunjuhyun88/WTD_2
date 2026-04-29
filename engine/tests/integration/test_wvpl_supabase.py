"""Staging WVPL Supabase upsert tests (W-0311)."""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta

import pytest

KST = timezone(timedelta(hours=9))
TEST_USER_ID = "00000000-0000-0000-0000-000000000311"
TEST_WEEK = "2020-01-05"
_HAS_STAGING = bool(
    os.environ.get("SUPABASE_URL", "").strip()
    and os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
)

pytestmark = pytest.mark.skipif(
    not _HAS_STAGING,
    reason="staging unavailable: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set",
)


@pytest.fixture(scope="module")
def supabase_client():
    from supabase import create_client  # type: ignore[import]

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


@pytest.fixture(autouse=True, scope="module")
def cleanup(supabase_client):
    yield
    supabase_client.table("user_wvpl_weekly").delete().eq(
        "user_id", TEST_USER_ID
    ).eq("week_start", TEST_WEEK).execute()


def _breakdown(loop_count: int):
    from observability.wvpl import WVPLBreakdown

    return WVPLBreakdown(
        user_id=TEST_USER_ID,
        week_start=datetime(2020, 1, 5, tzinfo=KST),
        capture_n=2,
        search_n=3,
        verdict_n=loop_count,
        loop_count=loop_count,
    )


def _rows(supabase_client):
    return (
        supabase_client.table("user_wvpl_weekly")
        .select("*")
        .eq("user_id", TEST_USER_ID)
        .eq("week_start", TEST_WEEK)
        .execute()
        .data
    )


def test_upsert_writes_row(supabase_client):
    """Single write creates exactly 1 row."""
    from observability.wvpl_aggregator import _supabase_writer

    _supabase_writer(_breakdown(1))

    rows = _rows(supabase_client)
    assert len(rows) == 1
    assert rows[0]["loop_count"] == 1


def test_upsert_idempotent(supabase_client):
    """Two writes with same (user_id, week_start) → row count stays 1 (AC4)."""
    from observability.wvpl_aggregator import _supabase_writer

    for loop_count in (1, 2):
        _supabase_writer(_breakdown(loop_count))

    rows = _rows(supabase_client)
    assert len(rows) == 1
    assert rows[0]["loop_count"] == 2


def test_upsert_skips_when_env_unset(monkeypatch):
    """Writer silently skips (no exception) when env vars absent (D-0311-B)."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    from observability.wvpl_aggregator import _supabase_writer

    _supabase_writer(_breakdown(0))
