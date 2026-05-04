"""Eval runner for AI agent gold set.

Usage:
    python -m agents.eval.runner [--gold gold_set.jsonl] [--out report.json] [--limit N]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import time
from pathlib import Path

log = logging.getLogger("engine.agents.eval.runner")

GOLD_SET_PATH = Path(__file__).parent / "gold_set.jsonl"


async def run_single(item: dict, timeout: float = 30.0) -> dict:
    """Run one gold set item, return result dict."""
    from agents.conversation import run_conversation_turn

    inp = item["input"]
    tools_used: list[str] = []
    text_out = ""
    error: str | None = None
    start = time.monotonic()

    try:
        async for chunk in run_conversation_turn(
            inp["message"],
            symbol=inp.get("symbol", "BTCUSDT"),
            timeframe=inp.get("timeframe", "4h"),
        ):
            if "text" in chunk:
                text_out += chunk["text"]
            elif "tool_call" in chunk:
                tools_used.append(chunk["tool_call"]["name"])
            elif chunk.get("done"):
                break
    except asyncio.TimeoutError:
        error = "timeout"
    except Exception as exc:
        error = str(exc)

    latency_ms = int((time.monotonic() - start) * 1000)

    from agents.eval.scorer import score_item
    passed, reasons = score_item(item, tools_used=tools_used, text_out=text_out)

    return {
        "id": item["id"],
        "category": item["category"],
        "passed": passed,
        "reasons": reasons,
        "tools_used": tools_used,
        "latency_ms": latency_ms,
        "error": error,
    }


async def run_all(gold_path: Path, limit: int | None = None) -> dict:
    items = []
    with gold_path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    if limit:
        items = items[:limit]

    results = []
    for item in items:
        r = await asyncio.wait_for(run_single(item), timeout=35.0)
        results.append(r)
        status = "v" if r["passed"] else "x"
        log.info("[eval] %s %s (%dms)", status, r["id"], r["latency_ms"])

    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    by_cat: dict[str, dict] = {}
    for r in results:
        cat = r["category"]
        if cat not in by_cat:
            by_cat[cat] = {"total": 0, "passed": 0}
        by_cat[cat]["total"] += 1
        if r["passed"]:
            by_cat[cat]["passed"] += 1

    return {
        "total": total,
        "passed": passed,
        "win_rate": round(passed / total * 100, 1) if total else 0,
        "by_category": by_cat,
        "results": results,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--gold", default=str(GOLD_SET_PATH))
    parser.add_argument("--out", default="eval_report.json")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    report = asyncio.run(run_all(Path(args.gold), args.limit))
    print(f"\nResult: {report['passed']}/{report['total']} ({report['win_rate']}%)")
    for cat, s in report["by_category"].items():
        pct = round(s["passed"] / s["total"] * 100, 1) if s["total"] else 0
        print(f"  {cat}: {s['passed']}/{s['total']} ({pct}%)")

    with open(args.out, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"Report saved to {args.out}")


if __name__ == "__main__":
    main()
