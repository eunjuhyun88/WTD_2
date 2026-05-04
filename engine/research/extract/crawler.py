"""
engine.research.extract.crawler
================================
One-shot full crawl of kieran.ai → raw_dump/<date>/

Usage:
    python -m engine.research.extract.crawler --out engine/research/calibration/raw_dump/$(date -I)
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://kieran.ai"
USER_AGENT = "WTD-research-bot/1.0 (+https://github.com/eunjuhyun88/WTD_2)"
RATE_LIMIT_SLEEP = 5  # seconds between requests

ENDPOINTS: list[str] = [
    "/api/signals",
    "/api/positions",
    "/api/trades",
    "/api/closed-trades",
    "/api/formula-attribution",
    "/api/equity",
    "/api/stats",
    "/api/health",
]

HTML_PAGES: list[str] = [
    "/",
    "/positions",
    "/signals",
    "/research",
    "/tape",
    "/review",
    "/formula",
]


@dataclass
class CrawlResult:
    ts: datetime
    out_dir: Path
    saved: list[str] = field(default_factory=list)
    failed: list[dict] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)  # 404/non-200 without error

    def as_dict(self) -> dict:
        return {
            "ts": self.ts.isoformat(),
            "out_dir": str(self.out_dir),
            "saved": self.saved,
            "failed": [str(f) for f in self.failed],
            "skipped": self.skipped,
        }


def _slug(path: str) -> str:
    """Convert a URL path to a filesystem-safe filename stem."""
    slug = path.lstrip("/").replace("/", "_") or "index"
    # strip query params
    slug = slug.split("?")[0]
    return slug


def _save_json(out_dir: Path, filename: str, data: dict | list) -> Path:
    """Write data as gzipped JSON. Returns path written."""
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / filename
    with gzip.open(str(out_path), "wt", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return out_path


def _extract_next_data(html: str) -> dict | None:
    """Extract __NEXT_DATA__ JSON from a Next.js HTML page."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def crawl_all(out_dir: Path, ts: datetime | None = None) -> CrawlResult:
    """
    Crawl all endpoints and HTML pages, saving raw responses to out_dir.

    Parameters
    ----------
    out_dir : Path
        Directory to write raw_dump files into.
    ts : datetime, optional
        Timestamp for the crawl (defaults to now UTC).

    Returns
    -------
    CrawlResult
    """
    if ts is None:
        ts = datetime.now(timezone.utc)

    out_dir.mkdir(parents=True, exist_ok=True)
    result = CrawlResult(ts=ts, out_dir=out_dir)

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    with httpx.Client(
        base_url=BASE_URL,
        headers=headers,
        timeout=30,
        follow_redirects=True,
    ) as client:

        # --- JSON API endpoints ---
        for ep in ENDPOINTS:
            try:
                logger.info("GET %s", ep)
                resp = client.get(ep)
                slug = _slug(ep)
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                    except Exception:
                        data = {"_raw_text": resp.text}
                    filename = f"{slug}.json.gz"
                    saved_path = _save_json(out_dir, filename, data)
                    result.saved.append(str(saved_path))
                    logger.info("  saved %s (%d bytes)", filename, saved_path.stat().st_size)
                else:
                    result.skipped.append(f"{ep} → HTTP {resp.status_code}")
                    logger.warning("  skipped %s → %d", ep, resp.status_code)
            except Exception as exc:
                result.failed.append({"endpoint": ep, "error": str(exc)})
                logger.error("  failed %s: %s", ep, exc)

            time.sleep(RATE_LIMIT_SLEEP)

        # --- HTML pages: extract __NEXT_DATA__ ---
        html_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
        }
        for page in HTML_PAGES:
            try:
                logger.info("HTML GET %s", page)
                resp = client.get(page, headers=html_headers)
                slug = _slug(page)
                if resp.status_code == 200:
                    nd = _extract_next_data(resp.text)
                    if nd is not None:
                        filename = f"html_{slug}_nextdata.json.gz"
                        saved_path = _save_json(out_dir, filename, nd)
                        result.saved.append(str(saved_path))
                        logger.info("  saved %s (%d bytes)", filename, saved_path.stat().st_size)
                    else:
                        # Save raw HTML snippet (first 10KB) for debugging
                        raw = {"_raw_html_snippet": resp.text[:10_000], "_note": "no __NEXT_DATA__ found"}
                        filename = f"html_{slug}_raw.json.gz"
                        saved_path = _save_json(out_dir, filename, raw)
                        result.saved.append(str(saved_path))
                        logger.info("  no __NEXT_DATA__; saved raw snippet %s", filename)
                else:
                    result.skipped.append(f"{page} → HTTP {resp.status_code}")
                    logger.warning("  skipped HTML %s → %d", page, resp.status_code)
            except Exception as exc:
                result.failed.append({"page": page, "error": str(exc)})
                logger.error("  failed HTML %s: %s", page, exc)

            time.sleep(RATE_LIMIT_SLEEP)

    # Save manifest
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(result.as_dict(), indent=2))
    logger.info("Manifest written to %s", manifest_path)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl kieran.ai endpoints")
    parser.add_argument(
        "--out",
        required=True,
        type=Path,
        help="Output directory for raw_dump files",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(message)s",
    )

    ts = datetime.now(timezone.utc)
    logger.info("Starting crawl → %s (ts=%s)", args.out, ts.isoformat())
    result = crawl_all(out_dir=args.out, ts=ts)

    print(f"\nCrawl complete: {len(result.saved)} saved, {len(result.skipped)} skipped, {len(result.failed)} failed")
    if result.failed:
        print("Failures:")
        for f in result.failed:
            print(f"  {f}")


if __name__ == "__main__":
    main()
