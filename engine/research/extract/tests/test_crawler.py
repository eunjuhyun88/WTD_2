"""Tests for engine.research.extract.crawler"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from research.extract.crawler import (
    CrawlResult,
    _extract_next_data,
    _save_json,
    _slug,
)


class TestSlug:
    def test_api_path(self):
        assert _slug("/api/signals") == "api_signals"

    def test_root_path(self):
        assert _slug("/") == "index"

    def test_nested_path(self):
        assert _slug("/api/closed-trades") == "api_closed-trades"

    def test_no_leading_slash(self):
        assert _slug("positions") == "positions"


class TestSaveJson:
    def test_creates_gzipped_file(self, tmp_path: Path):
        data = {"key": "value", "n": 42}
        path = _save_json(tmp_path, "test.json.gz", data)
        assert path.exists()
        with gzip.open(str(path), "rt", encoding="utf-8") as f:
            loaded = json.load(f)
        assert loaded == data

    def test_creates_parent_dirs(self, tmp_path: Path):
        data = {"x": 1}
        path = _save_json(tmp_path / "nested" / "dir", "out.json.gz", data)
        assert path.exists()


class TestExtractNextData:
    def test_extracts_json(self):
        html = '<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"data":42}}}</script></html>'
        result = _extract_next_data(html)
        assert result is not None
        assert result["props"]["pageProps"]["data"] == 42

    def test_returns_none_when_absent(self):
        html = "<html><body>No next data here</body></html>"
        assert _extract_next_data(html) is None

    def test_returns_none_on_invalid_json(self):
        html = '<html><script id="__NEXT_DATA__" type="application/json">NOT JSON</script></html>'
        assert _extract_next_data(html) is None


class TestCrawlResult:
    def test_as_dict(self, tmp_path: Path):
        from datetime import datetime, timezone
        ts = datetime(2026, 5, 5, 12, 0, 0, tzinfo=timezone.utc)
        result = CrawlResult(ts=ts, out_dir=tmp_path)
        result.saved.append("/some/path")
        result.skipped.append("/api/closed-trades → HTTP 404")
        d = result.as_dict()
        assert d["saved"] == ["/some/path"]
        assert d["skipped"] == ["/api/closed-trades → HTTP 404"]
        assert "2026-05-05" in d["ts"]
