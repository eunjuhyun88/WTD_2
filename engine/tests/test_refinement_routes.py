from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import refinement as refinement_module
from ledger.types import PatternStats


class _Pattern:
    def __init__(self, slug: str) -> None:
        self.slug = slug


class _FakeLedger:
    def __init__(self, stats_by_slug: dict[str, PatternStats]) -> None:
        self.stats_by_slug = stats_by_slug
        self.calls: dict[str, int] = {slug: 0 for slug in stats_by_slug}

    def compute_stats(self, slug: str) -> PatternStats:
        self.calls[slug] = self.calls.get(slug, 0) + 1
        return self.stats_by_slug[slug]


def _make_stats(
    *,
    slug: str,
    total: int,
    success_rate: float,
    expected_value: float | None,
    decay_direction: str | None,
) -> PatternStats:
    success_count = int(round(total * success_rate))
    failure_count = total - success_count
    return PatternStats(
        pattern_slug=slug,
        total_instances=total,
        pending_count=0,
        success_count=success_count,
        failure_count=failure_count,
        success_rate=success_rate,
        avg_gain_pct=0.02,
        avg_loss_pct=-0.03,
        expected_value=expected_value,
        avg_duration_hours=12.0,
        recent_30d_count=total,
        recent_30d_success_rate=success_rate,
        btc_bullish_rate=None,
        btc_bearish_rate=0.2 if slug == "alpha" else None,
        btc_sideways_rate=None,
        decay_direction=decay_direction,
    )


def test_refinement_routes_share_cached_snapshot(monkeypatch) -> None:
    fake_ledger = _FakeLedger(
        {
            "alpha": _make_stats(
                slug="alpha",
                total=6,
                success_rate=0.4,
                expected_value=-0.01,
                decay_direction="decaying",
            ),
            "beta": _make_stats(
                slug="beta",
                total=2,
                success_rate=0.5,
                expected_value=0.02,
                decay_direction="stable",
            ),
        }
    )

    monkeypatch.setattr(refinement_module, "_ledger", fake_ledger)
    monkeypatch.setattr(
        refinement_module,
        "PATTERN_REGISTRY_STORE",
        type("FakeRegistry", (), {"list_all": lambda self: [_Pattern("alpha"), _Pattern("beta")]})(),
    )
    monkeypatch.setattr(refinement_module, "_refinement_cache_ts", 0.0)
    monkeypatch.setattr(refinement_module, "_refinement_cache_rows", None)
    monkeypatch.setattr(refinement_module, "_refinement_cache_by_slug", None)
    monkeypatch.setattr(refinement_module, "_REFINEMENT_CACHE_TTL", 300.0)

    app = FastAPI()
    app.include_router(refinement_module.router, prefix="/refinement")
    client = TestClient(app)

    stats_res = client.get("/refinement/stats")
    leaderboard_res = client.get("/refinement/leaderboard")
    suggestions_res = client.get("/refinement/suggestions")
    detail_res = client.get("/refinement/stats/alpha")

    assert stats_res.status_code == 200
    assert leaderboard_res.status_code == 200
    assert suggestions_res.status_code == 200
    assert detail_res.status_code == 200
    assert suggestions_res.json()["count"] == 1
    assert detail_res.json()["stats"]["pattern_slug"] == "alpha"
    assert fake_ledger.calls == {"alpha": 1, "beta": 1}


def test_refinement_stats_unknown_slug_404(monkeypatch) -> None:
    fake_ledger = _FakeLedger(
        {
            "alpha": _make_stats(
                slug="alpha",
                total=6,
                success_rate=0.4,
                expected_value=-0.01,
                decay_direction="decaying",
            )
        }
    )

    monkeypatch.setattr(refinement_module, "_ledger", fake_ledger)
    monkeypatch.setattr(
        refinement_module,
        "PATTERN_REGISTRY_STORE",
        type("FakeRegistry", (), {"list_all": lambda self: [_Pattern("alpha")]})(),
    )
    monkeypatch.setattr(refinement_module, "_refinement_cache_ts", 0.0)
    monkeypatch.setattr(refinement_module, "_refinement_cache_rows", None)
    monkeypatch.setattr(refinement_module, "_refinement_cache_by_slug", None)

    app = FastAPI()
    app.include_router(refinement_module.router, prefix="/refinement")
    client = TestClient(app)

    response = client.get("/refinement/stats/missing")

    assert response.status_code == 404
