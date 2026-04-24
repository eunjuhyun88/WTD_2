from __future__ import annotations

import asyncio

import pandas as pd
import pytest

import scanner.scheduler as scheduler


def _klines_df() -> pd.DataFrame:
    index = pd.date_range("2026-04-13", periods=3, freq="h", tz="UTC")
    return pd.DataFrame(
        {
            "open": [100.0, 101.0, 102.0],
            "high": [101.0, 102.0, 103.0],
            "low": [99.0, 100.0, 101.0],
            "close": [100.5, 101.5, 102.5],
            "volume": [1_000.0, 1_100.0, 1_200.0],
        },
        index=index,
    )


def _features_df() -> pd.DataFrame:
    index = pd.date_range("2026-04-13", periods=1, freq="h", tz="UTC")
    return pd.DataFrame({"price": [102.5]}, index=index)


def test_scan_universe_pushes_alerts_and_telegram(monkeypatch) -> None:
    pushed: list[dict] = []
    telegram: list[dict] = []
    summaries: list[dict] = []

    async def fake_load_universe_async(name: str) -> list[str]:
        assert name == scheduler.UNIVERSE_NAME
        return ["BTCUSDT"]

    class FakeSnapshot:
        def model_dump(self, mode: str = "json") -> dict:
            assert mode == "json"
            return {"price": 102.5, "regime": "bullish"}

    class FakeLGBM:
        is_trained = True

        def predict_one(self, snap) -> float:
            return 0.61

    async def fake_push(payload: dict) -> None:
        pushed.append(payload)

    async def fake_pattern_alert(payload: dict) -> bool:
        telegram.append(payload)
        return True

    async def fake_summary(payload: dict) -> bool:
        summaries.append(payload)
        return True

    monkeypatch.setattr(scheduler, "load_universe_async", fake_load_universe_async)
    monkeypatch.setattr(scheduler, "load_macro_bundle", lambda offline=True: None)
    monkeypatch.setattr(scheduler, "load_klines", lambda symbol, offline=True: _klines_df())
    monkeypatch.setattr(scheduler, "load_perp", lambda symbol, offline=True: None)
    monkeypatch.setattr(scheduler, "compute_features_table", lambda *args, **kwargs: _features_df())
    monkeypatch.setattr(scheduler, "compute_snapshot", lambda *args, **kwargs: FakeSnapshot())
    monkeypatch.setattr(scheduler, "evaluate_blocks", lambda *args, **kwargs: ["oi_hold_after_spike", "funding_flip"])
    monkeypatch.setattr(scheduler, "get_engine", lambda: FakeLGBM())
    monkeypatch.setattr(scheduler, "_push_alert", fake_push)
    monkeypatch.setattr(scheduler, "send_pattern_engine_alert", fake_pattern_alert)
    monkeypatch.setattr(scheduler, "send_scan_summary", fake_summary)
    monkeypatch.setattr(scheduler, "MIN_BLOCKS", 1)
    monkeypatch.setattr(scheduler, "SCAN_TELEGRAM_ENABLED", True)

    asyncio.run(scheduler._scan_universe())

    assert len(pushed) == 1
    assert pushed[0]["symbol"] == "BTCUSDT"
    assert pushed[0]["blocks_triggered"] == ["oi_hold_after_spike", "funding_flip"]
    assert pushed[0]["p_win"] == 0.61
    assert telegram == pushed
    assert len(summaries) == 1
    assert summaries[0]["n_signals"] == 1
    assert summaries[0]["n_symbols"] == 1
    assert summaries[0]["duration_sec"] >= 0


def test_pattern_scan_job_prewarms_dynamic_universe_and_sends_summary(monkeypatch) -> None:
    import patterns.scanner as pattern_scanner

    prewarm_calls: list[tuple[list[str], int]] = []
    run_calls: list[tuple[str, bool, list[str]]] = []
    summaries: list[tuple[dict, str | None]] = []

    async def fake_load_universe_async(name: str) -> list[str]:
        assert name == scheduler.UNIVERSE_NAME
        return ["BTCUSDT", "ETHUSDT"]

    def fake_prewarm(symbols: list[str], max_workers: int = 5) -> dict:
        prewarm_calls.append((symbols, max_workers))
        return {"cached": len(symbols)}

    async def fake_run_pattern_scan(
        universe_name: str | None = None,
        prewarm: bool = True,
        symbols: list[str] | None = None,
    ) -> dict:
        run_calls.append((universe_name or "", prewarm, symbols or []))
        return {
            "n_symbols": len(symbols or []),
            "n_evaluated": len(symbols or []),
            "elapsed_ms": 12,
            "entry_candidates": {"tradoor-oi-reversal-v1": ["BTCUSDT"]},
        }

    async def fake_summary(result: dict, *, universe_name: str | None = None) -> bool:
        summaries.append((result, universe_name))
        return True

    monkeypatch.setattr(scheduler, "load_universe_async", fake_load_universe_async)
    monkeypatch.setattr(scheduler, "send_pattern_scan_summary", fake_summary)
    monkeypatch.setattr(scheduler, "SCAN_TELEGRAM_ENABLED", True)
    monkeypatch.setattr(scheduler, "_last_pattern_entry_keys", set())
    monkeypatch.setattr(pattern_scanner, "prewarm_perp_cache", fake_prewarm)
    monkeypatch.setattr(pattern_scanner, "run_pattern_scan", fake_run_pattern_scan)

    asyncio.run(scheduler._pattern_scan_job())

    assert prewarm_calls == [(["BTCUSDT", "ETHUSDT"], 5)]
    assert run_calls == [(scheduler.UNIVERSE_NAME, False, ["BTCUSDT", "ETHUSDT"])]
    assert len(summaries) == 1
    assert summaries[0][1] == scheduler.UNIVERSE_NAME


def test_pattern_scan_job_dedupes_repeated_entry_candidate_summaries(monkeypatch) -> None:
    import patterns.scanner as pattern_scanner

    summaries: list[dict] = []

    async def fake_load_universe_async(name: str) -> list[str]:
        return ["BTCUSDT"]

    def fake_prewarm(symbols: list[str], max_workers: int = 5) -> dict:
        return {"cached": len(symbols)}

    async def fake_run_pattern_scan(
        universe_name: str | None = None,
        prewarm: bool = True,
        symbols: list[str] | None = None,
    ) -> dict:
        return {
            "n_symbols": 1,
            "n_evaluated": 1,
            "elapsed_ms": 12,
            "entry_candidates": {"tradoor-oi-reversal-v1": ["BTCUSDT"]},
        }

    async def fake_summary(result: dict, *, universe_name: str | None = None) -> bool:
        summaries.append(result)
        return True

    monkeypatch.setattr(scheduler, "load_universe_async", fake_load_universe_async)
    monkeypatch.setattr(scheduler, "send_pattern_scan_summary", fake_summary)
    monkeypatch.setattr(scheduler, "SCAN_TELEGRAM_ENABLED", True)
    monkeypatch.setattr(scheduler, "_last_pattern_entry_keys", set())
    monkeypatch.setattr(pattern_scanner, "prewarm_perp_cache", fake_prewarm)
    monkeypatch.setattr(pattern_scanner, "run_pattern_scan", fake_run_pattern_scan)

    asyncio.run(scheduler._pattern_scan_job())
    asyncio.run(scheduler._pattern_scan_job())

    assert len(summaries) == 1
    assert summaries[0]["entry_candidates"] == {"tradoor-oi-reversal-v1": ["BTCUSDT"]}


def test_search_corpus_refresh_scheduler_wrapper(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_search_corpus_refresh_job(*, universe_name: str) -> dict:
        calls.append(universe_name)
        return {"ok": True}

    monkeypatch.setattr(scheduler, "search_corpus_refresh_job", fake_search_corpus_refresh_job)

    asyncio.run(scheduler._search_corpus_refresh_job())

    assert calls == [scheduler.UNIVERSE_NAME]


def test_validate_scheduler_secrets_rejects_missing_service_role(monkeypatch) -> None:
    monkeypatch.setattr(scheduler, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(scheduler, "SUPABASE_ROLE_KEY", "")

    with pytest.raises(RuntimeError, match="SUPABASE_SERVICE_ROLE_KEY is required"):
        scheduler.validate_scheduler_secrets()


def test_validate_scheduler_secrets_rejects_placeholder_values(monkeypatch) -> None:
    monkeypatch.setattr(scheduler, "SUPABASE_URL", "https://your-project.supabase.co")
    monkeypatch.setattr(scheduler, "SUPABASE_ROLE_KEY", "your_service_role_key")

    with pytest.raises(RuntimeError, match="placeholder"):
        scheduler.validate_scheduler_secrets()


def test_market_search_index_refresh_job_runs_refresh(monkeypatch) -> None:
    seen: list[tuple[int, str]] = []

    class _Result:
        row_count = 123
        refreshed_at = "2026-04-24T00:00:00+00:00"

    def fake_refresh():
        seen.append((_Result.row_count, _Result.refreshed_at))
        return _Result()

    monkeypatch.setattr(scheduler, "refresh_market_search_index", fake_refresh)

    asyncio.run(scheduler._market_search_index_refresh_job())

    assert seen == [(123, "2026-04-24T00:00:00+00:00")]
