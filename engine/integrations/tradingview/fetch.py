"""W-0393: TradingView URL → chart metadata + snapshot.

Only fetches from public domains: tradingview.com, s3.tradingview.com.
Drawing API is forbidden (ToS violation).
"""
from __future__ import annotations

import json
import logging
import re
from urllib.parse import urlparse

import requests

from .models import TVChartMeta

log = logging.getLogger("engine.integrations.tv.fetch")

_SNAPSHOT_BASE = "https://s3.tradingview.com/x/{chart_id}_mid.webp"
_TIMEOUT = 10
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; WTD-research/1.0)"}

_TF_MAP: dict[str, str] = {
    "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
    "45": "45m", "60": "1h", "120": "2h", "240": "4h",
    "D": "1d", "W": "1w", "M": "1mo",
}


def _normalize_tf(raw: str | None) -> str | None:
    if raw is None:
        return None
    return _TF_MAP.get(str(raw), str(raw))


def _extract_chart_id(url: str) -> str | None:
    m = re.search(r"/chart/(?:[^/]+/)?([A-Za-z0-9]{6,12})(?:[/-]|$)", url)
    return m.group(1) if m else None


def _extract_idea_slug(url: str) -> str | None:
    m = re.search(r"/ideas/([^/?#]+)", url)
    return m.group(1) if m else None


def _parse_next_data(html: str) -> dict:
    m = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def fetch_chart_meta(url: str) -> TVChartMeta:
    """Fetch TradingView chart/idea metadata from public HTML.

    Raises ValueError for invalid or non-public URLs.
    """
    parsed = urlparse(url)
    if parsed.netloc.lstrip("www.") not in {"tradingview.com"}:
        raise ValueError(f"URL must be tradingview.com, got: {parsed.netloc!r}")

    path = parsed.path
    is_idea = "/ideas/" in path
    source_type = "tradingview_idea" if is_idea else "tradingview_chart"

    try:
        resp = requests.get(url, timeout=_TIMEOUT, headers=_HEADERS)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise ValueError(f"Failed to fetch TV URL: {exc}") from exc

    next_data = _parse_next_data(resp.text)
    props = next_data.get("props", {}).get("pageProps", {})

    symbol = exchange = timeframe_raw = title = description = None
    author_username = author_display_name = None

    if is_idea:
        idea = props.get("idea") or props.get("data") or {}
        symbol = idea.get("symbol") or idea.get("ticker")
        timeframe_raw = str(idea.get("timeframe") or idea.get("interval") or "")
        title = idea.get("title") or idea.get("name")
        description = idea.get("description") or idea.get("body")
        author = idea.get("author") or idea.get("user") or {}
        author_username = author.get("username") or author.get("name")
        author_display_name = author.get("displayName") or author_username
    else:
        chart = props.get("chart") or props.get("data") or {}
        symbol = chart.get("symbol") or chart.get("ticker")
        exchange = chart.get("exchange")
        timeframe_raw = str(chart.get("interval") or chart.get("timeframe") or "")
        title = chart.get("title") or chart.get("name")
        description = chart.get("description")
        author = chart.get("author") or chart.get("user") or {}
        author_username = author.get("username") or author.get("name")
        author_display_name = author.get("displayName") or author_username

    # Fallback: og:title
    if not title:
        m2 = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', resp.text)
        if m2:
            title = m2.group(1)

    chart_id = _extract_chart_id(url) or _extract_idea_slug(url) or ""

    # Snapshot (chart URLs only)
    snapshot_url: str | None = None
    snapshot_bytes: bytes | None = None
    if chart_id and not is_idea:
        snap_url = _SNAPSHOT_BASE.format(chart_id=chart_id)
        try:
            snap_resp = requests.get(snap_url, timeout=_TIMEOUT, headers=_HEADERS)
            if snap_resp.status_code == 200:
                snapshot_url = snap_url
                snapshot_bytes = snap_resp.content
                log.debug("Snapshot fetched: %d bytes for chart_id=%s", len(snapshot_bytes), chart_id)
        except requests.RequestException as e:
            log.debug("Snapshot fetch failed for %s: %s", chart_id, e)

    return TVChartMeta(
        chart_id=chart_id,
        source_url=url,
        source_type=source_type,
        symbol=symbol or None,
        exchange=exchange or None,
        timeframe_raw=timeframe_raw or None,
        timeframe_engine=_normalize_tf(timeframe_raw),
        title=title,
        description=description,
        author_username=author_username,
        author_display_name=author_display_name,
        snapshot_url=snapshot_url,
        snapshot_bytes=snapshot_bytes,
    )
