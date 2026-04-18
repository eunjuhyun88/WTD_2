"""W-0097 P1 — CFTC Commitments of Traders parser + resolver tests.

Covers the three public layers of engine.data_cache.fetch_cme_cot:
  parse_cot_rows                (pure parser)
  fetch_cot_latest              (Socrata fetcher with injected http_getter)
  resolve_cme_oi_for_symbol     (weekly → hourly forward-fill)

No live HTTP — the fetcher is exercised via a stub http_getter.
"""
from __future__ import annotations

import pandas as pd
import pytest

from data_cache.fetch_cme_cot import (
    CONTRACT_MULTIPLIERS,
    DEFAULT_SOCRATA_URL,
    SYMBOL_TO_COT_COMMODITIES,
    fetch_cot_latest,
    parse_cot_rows,
    resolve_cme_oi_for_symbol,
)


def _row(report_date: str, commodity: str, oi: int | str) -> dict:
    return {
        "report_date_as_yyyy_mm_dd": report_date,
        "commodity_name": commodity,
        "open_interest_all": oi,
    }


# ── parse_cot_rows ──────────────────────────────────────────────────────────

def test_parse_keeps_only_known_commodities():
    rows = [
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18000),
        _row("2026-04-14T00:00:00.000", "S&P 500", 99999),   # unrelated — drop
        _row("2026-04-14T00:00:00.000", "NIKKEI 225", 40000),
    ]
    df = parse_cot_rows(rows)
    assert list(df["commodity_name"].unique()) == ["BITCOIN"]
    assert int(df["open_interest_contracts"].iloc[0]) == 18000


def test_parse_indexes_by_utc_report_date():
    df = parse_cot_rows([_row("2026-04-14T00:00:00.000", "BITCOIN", 18000)])
    assert df.index.tz is not None
    assert df.index[0] == pd.Timestamp("2026-04-14T00:00:00+0000")


def test_parse_dedupes_same_date_commodity_last_wins():
    rows = [
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18000),  # superseded
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18500),  # revision
    ]
    df = parse_cot_rows(rows)
    assert len(df) == 1
    assert int(df["open_interest_contracts"].iloc[0]) == 18500


def test_parse_case_insensitive_commodity():
    rows = [_row("2026-04-14T00:00:00.000", "bitcoin", 18000)]
    df = parse_cot_rows(rows)
    assert df["commodity_name"].iloc[0] == "BITCOIN"


def test_parse_skips_missing_date_or_oi():
    rows = [
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18000),
        {"commodity_name": "BITCOIN", "open_interest_all": "9999"},  # no date
        _row("2026-04-21T00:00:00.000", "BITCOIN", None),              # no oi
        _row("not-a-date", "BITCOIN", 5000),                           # bad date
    ]
    df = parse_cot_rows(rows)
    assert len(df) == 1
    assert int(df["open_interest_contracts"].iloc[0]) == 18000


def test_parse_accepts_string_open_interest():
    """Socrata returns integers as strings — both must parse."""
    rows = [_row("2026-04-14T00:00:00.000", "BITCOIN", "18000")]
    df = parse_cot_rows(rows)
    assert int(df["open_interest_contracts"].iloc[0]) == 18000


def test_parse_returns_empty_frame_on_empty_input():
    df = parse_cot_rows([])
    assert df.empty
    assert list(df.columns) == ["commodity_name", "open_interest_contracts"]


def test_parse_sorts_by_report_date_ascending():
    rows = [
        _row("2026-04-21T00:00:00.000", "BITCOIN", 19000),
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18000),
    ]
    df = parse_cot_rows(rows)
    dates = list(df.index)
    assert dates == sorted(dates)


# ── fetch_cot_latest ────────────────────────────────────────────────────────

def test_fetch_uses_injected_http_getter_and_default_url():
    captured: list[str] = []

    def stub(url: str) -> list[dict]:
        captured.append(url)
        return [_row("2026-04-14T00:00:00.000", "BITCOIN", 18000)]

    df = fetch_cot_latest(http_getter=stub)
    assert df is not None
    assert len(df) == 1
    assert captured[0].startswith(DEFAULT_SOCRATA_URL)
    # Query params must include order and limit.
    assert "$order=report_date+DESC" in captured[0] or "%24order=report_date+DESC" in captured[0]
    assert "$limit=200" in captured[0] or "%24limit=200" in captured[0]


def test_fetch_returns_none_when_getter_returns_none():
    assert fetch_cot_latest(http_getter=lambda _url: None) is None


def test_fetch_returns_empty_frame_when_no_known_commodities():
    def stub(_url: str) -> list[dict]:
        return [_row("2026-04-14T00:00:00.000", "S&P 500", 99999)]

    df = fetch_cot_latest(http_getter=stub)
    assert df is not None
    assert df.empty


def test_fetch_allows_custom_base_url_and_limit():
    seen: list[str] = []

    def stub(url: str) -> list[dict]:
        seen.append(url)
        return []

    fetch_cot_latest(
        base_url="https://example.test/resource/abcd.json",
        limit=50,
        http_getter=stub,
    )
    assert seen[0].startswith("https://example.test/resource/abcd.json")
    assert "$limit=50" in seen[0] or "%24limit=50" in seen[0]


# ── resolve_cme_oi_for_symbol ───────────────────────────────────────────────

def _hourly_index(start: str, hours: int) -> pd.DatetimeIndex:
    return pd.date_range(start=start, periods=hours, freq="1h", tz="UTC")


def test_resolver_returns_zero_for_unsupported_symbol():
    idx = _hourly_index("2026-04-14", 12)
    cot = parse_cot_rows([_row("2026-04-14T00:00:00.000", "BITCOIN", 18000)])
    series = resolve_cme_oi_for_symbol("SOLUSDT", idx, cot)
    assert (series == 0.0).all()
    assert len(series) == len(idx)


def test_resolver_returns_zero_for_empty_cot():
    idx = _hourly_index("2026-04-14", 12)
    series = resolve_cme_oi_for_symbol(
        "BTCUSDT", idx, pd.DataFrame(columns=["commodity_name", "open_interest_contracts"])
    )
    assert (series == 0.0).all()


def test_resolver_returns_zero_when_cot_df_is_none():
    idx = _hourly_index("2026-04-14", 12)
    series = resolve_cme_oi_for_symbol("BTCUSDT", idx, None)
    assert (series == 0.0).all()


def test_resolver_forward_fills_from_report_date():
    """Hourly bars at/after the Tuesday settlement pick up the weekly OI."""
    idx = _hourly_index("2026-04-13 22:00", 6)  # 22,23,00,01,02,03 UTC
    rows = [_row("2026-04-14T00:00:00.000", "BITCOIN", 18000)]
    cot = parse_cot_rows(rows)

    series = resolve_cme_oi_for_symbol("BTCUSDT", idx, cot)

    # First two bars (22:00, 23:00 on 04-13) are before the report → 0.
    assert series.iloc[0] == 0.0
    assert series.iloc[1] == 0.0
    # Bar at 00:00 on 04-14 picks up OI × BITCOIN multiplier (5 BTC/contract).
    expected = 18000 * CONTRACT_MULTIPLIERS["BITCOIN"]
    assert series.iloc[2] == expected
    # And stays forward-filled.
    assert (series.iloc[2:] == expected).all()


def test_resolver_sums_micro_and_full_contracts():
    idx = _hourly_index("2026-04-14 00:00", 3)
    rows = [
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18000),        # 18000 × 5 = 90000
        _row("2026-04-14T00:00:00.000", "MICRO BITCOIN", 50000),  # 50000 × 0.1 = 5000
    ]
    cot = parse_cot_rows(rows)
    series = resolve_cme_oi_for_symbol("BTCUSDT", idx, cot)
    expected = 18000 * 5.0 + 50000 * 0.1
    assert series.iloc[0] == pytest.approx(expected)


def test_resolver_applies_next_week_report_forward():
    idx = _hourly_index("2026-04-14 00:00", 24 * 8)  # 8 days hourly
    rows = [
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18000),  # week 1
        _row("2026-04-21T00:00:00.000", "BITCOIN", 19000),  # week 2 revision
    ]
    cot = parse_cot_rows(rows)
    series = resolve_cme_oi_for_symbol("BTCUSDT", idx, cot)

    # Prior to 04-21 00:00 → week 1 number.
    week1 = 18000 * 5.0
    week2 = 19000 * 5.0
    bar_before = series.loc[pd.Timestamp("2026-04-20 23:00", tz="UTC")]
    bar_after = series.loc[pd.Timestamp("2026-04-21 00:00", tz="UTC")]
    assert bar_before == pytest.approx(week1)
    assert bar_after == pytest.approx(week2)


def test_resolver_eth_symbol_mapping():
    idx = _hourly_index("2026-04-14 00:00", 3)
    rows = [
        _row("2026-04-14T00:00:00.000", "ETHER", 800),
        _row("2026-04-14T00:00:00.000", "MICRO ETHER", 2000),
    ]
    cot = parse_cot_rows(rows)
    series = resolve_cme_oi_for_symbol("ETHUSDT", idx, cot)
    expected = 800 * 50.0 + 2000 * 0.1
    assert series.iloc[0] == pytest.approx(expected)


def test_resolver_ignores_other_symbols_commodities():
    """Even if cot_df holds ETH data, resolving BTCUSDT must only see BTC."""
    idx = _hourly_index("2026-04-14 00:00", 3)
    rows = [
        _row("2026-04-14T00:00:00.000", "ETHER", 800),
        _row("2026-04-14T00:00:00.000", "BITCOIN", 18000),
    ]
    cot = parse_cot_rows(rows)
    series = resolve_cme_oi_for_symbol("BTCUSDT", idx, cot)
    assert series.iloc[0] == pytest.approx(18000 * 5.0)


def test_resolver_output_index_matches_input_index():
    idx = _hourly_index("2026-04-14 00:00", 10)
    cot = parse_cot_rows([_row("2026-04-14T00:00:00.000", "BITCOIN", 18000)])
    series = resolve_cme_oi_for_symbol("BTCUSDT", idx, cot)
    assert len(series) == len(idx)
    assert (series.index == idx).all()


def test_symbol_mapping_covers_btc_and_eth():
    assert "BTCUSDT" in SYMBOL_TO_COT_COMMODITIES
    assert "ETHUSDT" in SYMBOL_TO_COT_COMMODITIES
    # Must reference commodities with known multipliers.
    for commodities in SYMBOL_TO_COT_COMMODITIES.values():
        for commodity in commodities:
            assert commodity in CONTRACT_MULTIPLIERS
