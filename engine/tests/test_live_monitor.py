"""Tests for research.live_monitor (W-0089)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pandas as pd
import pytest

from patterns.active_variant_registry import ActivePatternVariantEntry
from research.live_monitor import (
    LiveScanResult,
    search_pattern_state_similarity,
    scan_universe_live,
    scan_all_patterns_live,
    print_scan_report,
    WATCH_PHASES,
)


def _make_result(
    symbol: str,
    phase: str = "ARCH_ZONE",
    entry_hit: bool = False,
    fwd: float | None = None,
    real: float | None = None,
) -> LiveScanResult:
    return LiveScanResult(
        symbol=symbol,
        phase=phase,
        path=f"FAKE_DUMP→{phase}",
        entry_hit=entry_hit,
        fwd_peak_pct=fwd,
        realistic_pct=real,
        phase_fidelity=0.7,
        canonical_feature_snapshot={},
    )


class TestLiveScanResult:
    def test_is_entry_candidate_requires_accumulation_and_entry_hit(self):
        r = _make_result("AAA", phase="ACCUMULATION", entry_hit=True, fwd=10.0)
        assert r.is_entry_candidate is True

    def test_is_entry_candidate_false_when_no_entry_hit(self):
        r = _make_result("AAA", phase="ACCUMULATION", entry_hit=False)
        assert r.is_entry_candidate is False

    def test_is_entry_candidate_false_when_not_accumulation(self):
        r = _make_result("AAA", phase="REAL_DUMP", entry_hit=True)
        assert r.is_entry_candidate is False

    def test_is_watch_covers_accumulation_and_real_dump(self):
        assert _make_result("A", phase="ACCUMULATION").is_watch is True
        assert _make_result("A", phase="REAL_DUMP").is_watch is True
        assert _make_result("A", phase="ARCH_ZONE").is_watch is False

    def test_to_dict_serializable(self):
        r = _make_result("BTCUSDT", phase="ACCUMULATION", entry_hit=True, fwd=15.3, real=15.0)
        d = r.to_dict()
        assert d["symbol"] == "BTCUSDT"
        assert d["phase"] == "ACCUMULATION"
        assert d["entry_hit"] is True
        assert d["fwd_peak_pct"] == 15.3
        assert "scanned_at" in d


class TestScanUniverseLive:
    def _make_klines(self, n: int = 300) -> pd.DataFrame:
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        idx = pd.date_range(end=now, periods=n, freq="1h", tz="UTC")
        return pd.DataFrame(
            {"open": 1.0, "high": 1.1, "low": 0.9, "close": 1.0, "volume": 1000.0},
            index=idx,
        )

    def test_skips_stale_symbols(self):
        stale_klines = self._make_klines()
        stale_klines.index = stale_klines.index - timedelta(hours=100)

        with patch("research.live_monitor.load_klines", return_value=stale_klines):
            results = scan_universe_live(
                universe=["AAVEUSDT"],
                staleness_hours=48,
                log_to_experiment=False,
            )
        assert results == []

    def test_returns_result_for_recent_symbol(self, monkeypatch):
        klines = self._make_klines()

        from research import live_monitor
        monkeypatch.setattr(live_monitor, "load_klines", lambda *a, **kw: klines)

        from research.pattern_search import VariantCaseResult
        dummy_result = VariantCaseResult(
            case_id="x", symbol="KOMAUSDT", role="holdout",
            current_phase="ACCUMULATION",
            observed_phase_path=["ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
            phase_fidelity=0.75, phase_depth_progress=0.6,
            entry_hit=True, target_hit=False,
            lead_bars=5, score=0.8,
            entry_close=1.0, forward_peak_return_pct=12.5,
            entry_next_open=1.001, realistic_forward_peak_return_pct=12.3,
        )
        monkeypatch.setattr(live_monitor, "evaluate_variant_on_case", lambda *a, **kw: dummy_result)

        results = scan_universe_live(
            universe=["KOMAUSDT"],
            log_to_experiment=False,
        )
        assert len(results) == 1
        r = results[0]
        assert r.symbol == "KOMAUSDT"
        assert r.phase == "ACCUMULATION"
        assert r.entry_hit is True
        assert r.fwd_peak_pct == 12.5
        assert r.is_entry_candidate is True

    def test_results_sorted_accumulation_first(self):
        results = [
            _make_result("SYM1", phase="ARCH_ZONE"),
            _make_result("SYM2", phase="ACCUMULATION", entry_hit=True, fwd=10.0),
            _make_result("SYM3", phase="REAL_DUMP"),
        ]
        from research.live_monitor import PHASE_ORDER
        results.sort(key=lambda x: (
            PHASE_ORDER.get(x.phase, 9), not x.entry_hit, -(x.fwd_peak_pct or -999)
        ))
        assert results[0].phase == "ACCUMULATION"
        assert results[1].phase == "REAL_DUMP"
        assert results[2].phase == "ARCH_ZONE"

    def test_scan_all_patterns_live_uses_registry_timeframe(self, monkeypatch):
        captured: list[tuple[str, str, str]] = []

        monkeypatch.setattr(
            "research.live_monitor.list_active_pattern_entries",
            lambda: [
                ActivePatternVariantEntry(
                    pattern_slug="tradoor-oi-reversal-v1",
                    variant_slug="tradoor-oi-reversal-v1__intraday-dump-cluster__tf-15m",
                    timeframe="15m",
                    watch_phases=["ACCUMULATION", "REAL_DUMP"],
                    source_kind="benchmark_search",
                )
            ],
        )

        def fake_scan_universe_live(**kwargs):
            captured.append((kwargs["pattern_slug"], kwargs["variant_slug"], kwargs["timeframe"]))
            return []

        monkeypatch.setattr("research.live_monitor.scan_universe_live", fake_scan_universe_live)

        results = scan_all_patterns_live(log_to_experiment=False)

        assert results == []
        assert captured == [
            (
                "tradoor-oi-reversal-v1",
                "tradoor-oi-reversal-v1__intraday-dump-cluster__tf-15m",
                "15m",
            )
        ]

    def test_search_pattern_state_similarity_uses_registry_defaults_and_ranks_by_score(self, monkeypatch):
        klines = self._make_klines()
        from research import live_monitor
        monkeypatch.setattr(live_monitor, "load_klines", lambda *a, **kw: klines)
        monkeypatch.setattr(
            live_monitor,
            "ACTIVE_PATTERN_VARIANT_STORE",
            type(
                "FakeStore",
                (),
                {
                    "get": lambda self, slug: ActivePatternVariantEntry(
                        pattern_slug=slug,
                        variant_slug="tradoor-oi-reversal-v1__intraday-dump-cluster__tf-15m",
                        timeframe="15m",
                        watch_phases=["ACCUMULATION", "REAL_DUMP"],
                    ),
                    "list_effective": lambda self: [],
                },
            )(),
        )

        def fake_evaluate_variant_on_case(pattern, case, **kwargs):
            from research.pattern_search import VariantCaseResult

            score_by_symbol = {
                "PTBUSDT": 0.92,
                "TRADOORUSDT": 0.61,
                "ALTUSDT": 0.18,
            }
            phase_by_symbol = {
                "PTBUSDT": "BREAKOUT",
                "TRADOORUSDT": "ACCUMULATION",
                "ALTUSDT": "ARCH_ZONE",
            }
            return VariantCaseResult(
                case_id=case.case_id,
                symbol=case.symbol,
                role=case.role,
                current_phase=phase_by_symbol[case.symbol],
                observed_phase_path=["ARCH_ZONE", "REAL_DUMP", phase_by_symbol[case.symbol]],
                phase_fidelity=0.8,
                phase_depth_progress=score_by_symbol[case.symbol],
                entry_hit=case.symbol != "ALTUSDT",
                target_hit=case.symbol == "PTBUSDT",
                lead_bars=4,
                score=score_by_symbol[case.symbol],
                entry_close=1.0,
                forward_peak_return_pct=10.0,
                entry_next_open=1.01,
                realistic_forward_peak_return_pct=9.5,
                canonical_feature_snapshot={
                    "oi_raw": 1200.0,
                    "oi_zscore": 2.4 if case.symbol == "PTBUSDT" else 1.2,
                    "funding_rate_zscore": 1.1,
                    "funding_flip_flag": True,
                    "volume_percentile": 0.95,
                    "pullback_depth_pct": 0.08,
                    "cvd_price_divergence": 1.0,
                },
            )

        monkeypatch.setattr(live_monitor, "evaluate_variant_on_case", fake_evaluate_variant_on_case)

        results = search_pattern_state_similarity(
            "tradoor-oi-reversal-v1",
            universe=["ALTUSDT", "PTBUSDT", "TRADOORUSDT"],
            top_k=2,
            min_similarity_score=0.2,
        )

        assert [result.symbol for result in results] == ["PTBUSDT", "TRADOORUSDT"]
        assert all(result.variant_slug == "tradoor-oi-reversal-v1__intraday-dump-cluster__tf-15m" for result in results)
        assert all(result.timeframe == "15m" for result in results)
        assert results[0].similarity_score == 0.92
        assert results[1].similarity_score == 0.61
        assert results[0].canonical_feature_snapshot["funding_flip_flag"] is True
        assert results[0].canonical_feature_snapshot["oi_zscore"] == pytest.approx(2.4)


class TestPrintScanReport:
    def test_print_does_not_crash(self, capsys):
        results = [
            _make_result("AAVEUSDT", phase="ACCUMULATION", entry_hit=True, fwd=10.5, real=10.3),
            _make_result("DOGEUSDT", phase="REAL_DUMP"),
            _make_result("SUIUSDT", phase="ARCH_ZONE"),
        ]
        print_scan_report(results)
        out = capsys.readouterr().out
        assert "ACCUMULATION" in out
        assert "AAVEUSDT" in out
        assert "진입 후보" in out
