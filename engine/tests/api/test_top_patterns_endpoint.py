"""W-0352: GET /research/top-patterns endpoint tests."""
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import research as research_module


def _make_app() -> TestClient:
    """Create an isolated FastAPI app with the research router, bypassing JWT auth."""
    app = FastAPI()
    app.include_router(research_module.router, prefix="/research")

    @app.middleware("http")
    async def _inject_test_user(request, call_next):
        request.state.user_id = "test-user"
        return await call_next(request)

    return TestClient(app)


def _make_parquet(tmp_path: Path, rows: list[dict], filename: str = "results_2026-04-30.parquet") -> Path:
    df = pd.DataFrame(rows)
    p = tmp_path / filename
    df.to_parquet(p, index=False)
    return p


BASE_ROW = dict(
    pattern="wyckoff-spring-v1__ptb-v1",
    symbol="BTCUSDT",
    direction="long",
    n_signals=50,
    n_executed=30,
    win_rate=0.6,
    expectancy_pct=1.2,
    sharpe=1.5,
    calmar=0.8,
    max_drawdown_pct=-0.12,
    final_equity=11200.0,
    scan_ts="2026-04-30T00:00:00",
    composite_score=72.0,
    quality_grade="A",
)


def test_ac1_returns_200_with_patterns(tmp_path):
    client = _make_app()
    p = _make_parquet(tmp_path, [BASE_ROW])
    with patch("api.routes.research.latest_top_patterns_path", return_value=p):
        resp = client.get("/research/top-patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert "patterns" in data
    assert len(data["patterns"]) == 1


def test_ac2_response_has_required_fields(tmp_path):
    client = _make_app()
    p = _make_parquet(tmp_path, [BASE_ROW])
    with patch("api.routes.research.latest_top_patterns_path", return_value=p):
        resp = client.get("/research/top-patterns")
    item = resp.json()["patterns"][0]
    for field in ["pattern_slug", "composite_score", "quality_grade", "n_trades_paper",
                  "win_rate_paper", "sharpe_paper", "max_drawdown_pct_paper",
                  "expectancy_pct_paper", "model_source"]:
        assert field in item, f"Missing field: {field}"


def test_ac3_no_parquet_returns_empty(tmp_path):
    client = _make_app()
    with patch("api.routes.research.latest_top_patterns_path", return_value=None):
        resp = client.get("/research/top-patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert data["patterns"] == []
    assert data["pipeline_run_id"] is None


def test_ac5_schema_drift_returns_422(tmp_path):
    client = _make_app()
    row = {k: v for k, v in BASE_ROW.items() if k != "composite_score"}
    p = _make_parquet(tmp_path, [row])
    with patch("api.routes.research.latest_top_patterns_path", return_value=p):
        resp = client.get("/research/top-patterns")
    assert resp.status_code == 422
    assert "composite_score" in resp.json()["detail"]


def test_ac6_limit_cap(tmp_path):
    client = _make_app()
    rows = [{**BASE_ROW, "pattern": f"pat-{i}", "composite_score": float(i)} for i in range(150)]
    p = _make_parquet(tmp_path, rows)
    with patch("api.routes.research.latest_top_patterns_path", return_value=p):
        resp = client.get("/research/top-patterns?limit=500&min_grade=C")
    data = resp.json()
    assert len(data["patterns"]) == 100
    assert data["total_available"] == 150
    assert data["limit_applied"] == 100


def test_min_grade_filter(tmp_path):
    client = _make_app()
    rows = [
        {**BASE_ROW, "pattern": "p1", "composite_score": 90.0, "quality_grade": "S"},
        {**BASE_ROW, "pattern": "p2", "composite_score": 72.0, "quality_grade": "A"},
        {**BASE_ROW, "pattern": "p3", "composite_score": 58.0, "quality_grade": "B"},
        {**BASE_ROW, "pattern": "p4", "composite_score": 40.0, "quality_grade": "C"},
    ]
    p = _make_parquet(tmp_path, rows)
    with patch("api.routes.research.latest_top_patterns_path", return_value=p):
        r_s = client.get("/research/top-patterns?min_grade=S&limit=100")
        r_a = client.get("/research/top-patterns?min_grade=A&limit=100")
        r_b = client.get("/research/top-patterns?min_grade=B&limit=100")
        r_c = client.get("/research/top-patterns?min_grade=C&limit=100")
    counts = [len(r.json()["patterns"]) for r in [r_s, r_a, r_b, r_c]]
    assert counts == [1, 2, 3, 4], f"Expected [1,2,3,4] got {counts}"


def test_nan_composite_score_excluded(tmp_path):
    client = _make_app()
    rows = [
        {**BASE_ROW, "pattern": "good", "composite_score": 72.0, "quality_grade": "A"},
        {**BASE_ROW, "pattern": "bad", "composite_score": float("nan"), "quality_grade": None},
    ]
    p = _make_parquet(tmp_path, rows)
    with patch("api.routes.research.latest_top_patterns_path", return_value=p):
        resp = client.get("/research/top-patterns?min_grade=C")
    slugs = [item["pattern_slug"] for item in resp.json()["patterns"]]
    assert "bad" not in slugs
    assert "good" in slugs
