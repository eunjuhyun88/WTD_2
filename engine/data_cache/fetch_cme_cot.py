"""CFTC Commitments of Traders (COT) — CME Bitcoin/Ether open interest.

Closes the ``cme_oi`` placeholder in fetch_exchange_oi. Unlike perp OI
(hourly, published live), CFTC COT is **weekly**: the report is released
every Friday at 3:30 PM ET and reflects the prior Tuesday settlement.

This module is split into three layers so each is independently testable:

  parse_cot_rows(rows)               — pure parser, no network
  fetch_cot_latest(http_getter)      — Socrata REST → DataFrame
  resolve_cme_oi_for_symbol(...)     — weekly → hourly forward-fill
                                       for a perp symbol (BTCUSDT/ETHUSDT)

Socrata endpoint (CFTC public reporting):
  https://publicreporting.cftc.gov/resource/gpe5-46if.json
  (Traders in Financial Futures — Futures Only — Most Recent.)

We key rows by the ``commodity_name`` field. CME products that matter:

  BITCOIN          — 5 BTC/contract
  MICRO BITCOIN    — 0.1 BTC/contract
  ETHER            — 50 ETH/contract     (not all legacy snapshots carry it)
  MICRO ETHER      — 0.1 ETH/contract

Callers can supply either the Socrata slice directly or a fixture list,
which makes offline unit tests trivial.
"""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Iterable, Mapping

import pandas as pd

log = logging.getLogger("engine.data_cache.cme_cot")


DEFAULT_SOCRATA_URL = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
DEFAULT_TIMEOUT = 15
_UA = "cogochi-autoresearch/data_cache"

# CFTC commodity_name → ordered set of perp symbols those contracts back.
# Multiple commodity names can roll into the same perp symbol (BTC +
# MICRO BITCOIN both contribute to total BTC institutional OI).
SYMBOL_TO_COT_COMMODITIES: dict[str, tuple[str, ...]] = {
    "BTCUSDT": ("BITCOIN", "MICRO BITCOIN"),
    "ETHUSDT": ("ETHER", "MICRO ETHER"),
}

# Contract multiplier → number of base-asset units per CFTC "contract".
# Used to convert reported ``open_interest_all`` (contracts) into base-asset
# units before callers apply a spot price for USD notional.
CONTRACT_MULTIPLIERS: dict[str, float] = {
    "BITCOIN": 5.0,
    "MICRO BITCOIN": 0.1,
    "ETHER": 50.0,
    "MICRO ETHER": 0.1,
}


@dataclass(frozen=True)
class CotRow:
    """Parsed row for one (commodity_name, report_date)."""

    report_date: pd.Timestamp
    commodity_name: str
    open_interest_contracts: int


# ── Parser ──────────────────────────────────────────────────────────────────

def _coerce_report_date(value: object) -> pd.Timestamp | None:
    """CFTC dates arrive ISO-8601 with a ``T`` separator or as an already
    parsed value. Return a UTC-aware Timestamp, or ``None`` when the field
    is missing / unparseable.
    """
    if value is None:
        return None
    try:
        ts = pd.Timestamp(value)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        return None
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    else:
        ts = ts.tz_convert("UTC")
    return ts


def _coerce_open_interest(value: object) -> int | None:
    """Socrata returns numbers as strings; coerce to int or None."""
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def parse_cot_rows(rows: Iterable[Mapping[str, object]]) -> pd.DataFrame:
    """Parse raw Socrata rows into a tidy DataFrame.

    Only rows with a known commodity name (in CONTRACT_MULTIPLIERS) and a
    valid report_date + open_interest_all are retained. Unknown rows are
    silently dropped — the CFTC dataset also includes unrelated financial
    futures (S&P 500, Nikkei, etc.) which are not of interest here.

    Returns DataFrame indexed by ``report_date`` (UTC tz-aware) with
    columns [commodity_name, open_interest_contracts]. Duplicates on the
    same (date, commodity) keep the LAST occurrence (CFTC occasionally
    revises — the newer row wins).
    """
    records: list[CotRow] = []
    for row in rows:
        commodity = str(row.get("commodity_name", "")).strip().upper()
        if commodity not in CONTRACT_MULTIPLIERS:
            continue
        report_date = _coerce_report_date(
            row.get("report_date_as_yyyy_mm_dd") or row.get("report_date")
        )
        oi = _coerce_open_interest(row.get("open_interest_all"))
        if report_date is None or oi is None:
            continue
        records.append(
            CotRow(
                report_date=report_date,
                commodity_name=commodity,
                open_interest_contracts=oi,
            )
        )

    if not records:
        return pd.DataFrame(
            columns=["commodity_name", "open_interest_contracts"],
        ).rename_axis("report_date")

    df = pd.DataFrame(
        [
            {
                "report_date": r.report_date,
                "commodity_name": r.commodity_name,
                "open_interest_contracts": r.open_interest_contracts,
            }
            for r in records
        ]
    )
    # Last-write-wins on duplicates.
    df = (
        df.sort_values("report_date")
        .drop_duplicates(subset=["report_date", "commodity_name"], keep="last")
    )
    return df.set_index("report_date").sort_index()


# ── Fetcher ─────────────────────────────────────────────────────────────────

HttpGetter = Callable[[str], list[dict] | None]


def _default_http_getter(url: str) -> list[dict] | None:
    req = urllib.request.Request(
        url, headers={"User-Agent": _UA, "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("CFTC COT fetch failed [%s]: %s", url[:80], exc)
        return None
    return payload if isinstance(payload, list) else None


def fetch_cot_latest(
    *,
    base_url: str = DEFAULT_SOCRATA_URL,
    limit: int = 200,
    http_getter: HttpGetter | None = None,
) -> pd.DataFrame | None:
    """Fetch the most recent ``limit`` COT rows and return a parsed DataFrame.

    ``http_getter`` is injectable for tests. Returns ``None`` when the
    request fails, an EMPTY DataFrame when the request succeeds but no
    rows match known commodities.
    """
    getter = http_getter or _default_http_getter
    query = urllib.parse.urlencode(
        {
            "$limit": str(limit),
            "$order": "report_date DESC",
        }
    )
    url = f"{base_url}?{query}"
    raw = getter(url)
    if raw is None:
        return None
    return parse_cot_rows(raw)


# ── Resolver ────────────────────────────────────────────────────────────────

def resolve_cme_oi_for_symbol(
    symbol: str,
    hourly_index: pd.DatetimeIndex,
    cot_df: pd.DataFrame | None,
) -> pd.Series:
    """Forward-fill weekly CFTC OI (in CME contracts) onto an hourly index.

    The returned Series has the same index as ``hourly_index`` and is in
    base-asset units (contracts × CONTRACT_MULTIPLIERS). For a symbol not
    covered by CFTC (everything except BTCUSDT/ETHUSDT) or a missing /
    empty cot_df, returns an all-zero Series — matching the existing
    placeholder semantics so callers don't have to branch.

    Forward-fill policy: each COT report stamp ``t_r`` applies to every
    hourly bar ``t_bar`` where ``t_bar >= t_r``, until the next report
    supersedes it. Before the first report in ``cot_df``, the value is 0.
    """
    zero = pd.Series(0.0, index=hourly_index)
    commodities = SYMBOL_TO_COT_COMMODITIES.get(symbol.upper())
    if commodities is None or cot_df is None or cot_df.empty:
        return zero

    relevant = cot_df[cot_df["commodity_name"].isin(commodities)]
    if relevant.empty:
        return zero

    # Sum contributions across commodities (e.g. BITCOIN + MICRO BITCOIN)
    # converted to base-asset units.
    per_report: dict[pd.Timestamp, float] = {}
    for report_date, row in relevant.iterrows():
        commodity = row["commodity_name"]
        units = float(row["open_interest_contracts"]) * CONTRACT_MULTIPLIERS[commodity]
        per_report[report_date] = per_report.get(report_date, 0.0) + units

    weekly = pd.Series(per_report).sort_index()
    # Ensure the weekly index is tz-aware UTC to align with hourly_index.
    if weekly.index.tz is None:
        weekly.index = weekly.index.tz_localize("UTC")
    else:
        weekly.index = weekly.index.tz_convert("UTC")

    # Forward-fill onto the target hourly index. reindex+ffill does the
    # right thing for pre-first-report bars (stays NaN) so we fill with 0.
    combined_index = hourly_index.union(weekly.index).sort_values()
    aligned = weekly.reindex(combined_index).ffill().fillna(0.0)
    return aligned.loc[hourly_index].astype(float)


__all__ = [
    "CONTRACT_MULTIPLIERS",
    "DEFAULT_SOCRATA_URL",
    "SYMBOL_TO_COT_COMMODITIES",
    "fetch_cot_latest",
    "parse_cot_rows",
    "resolve_cme_oi_for_symbol",
]
