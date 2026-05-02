"""Perf test fixtures — isolated from live DB/network, deterministic."""
from __future__ import annotations

import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture(scope="module")
def app_client():
    """TestClient with scheduler + Supabase disabled, fake auth injected."""
    os.environ.setdefault("ENGINE_ENABLE_SCHEDULER", "false")
    os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
    os.environ.setdefault("SUPABASE_KEY", "test-key")
    from api.main import app

    @app.middleware("http")
    async def _inject_test_user(request, call_next):
        request.state.user_id = "perf-test-user"
        return await call_next(request)

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture(scope="module")
def mock_supabase():
    """Stub Supabase so perf tests never hit the network."""
    sb = MagicMock()
    sb.table.return_value.select.return_value.limit.return_value.execute.return_value.data = []
    return sb
