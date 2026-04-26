#!/usr/bin/env python3
"""
Render work/active/CURRENT.md from GitHub Project v2.

Single source of truth = GitHub Project (eunjuhyun88/projects/3).
This script regenerates CURRENT.md so humans/agents can read the active
state without GH access.

Usage:
    python scripts/render_current_md.py          # write CURRENT.md
    python scripts/render_current_md.py --check  # exit 1 if drift detected

Requires: gh CLI authenticated with `project` scope.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_NUMBER = 3
PROJECT_OWNER = "eunjuhyun88"
PROJECT_URL = f"https://github.com/users/{PROJECT_OWNER}/projects/{PROJECT_NUMBER}"
REPO = "eunjuhyun88/WTD_2"
CURRENT_MD_PATH = Path("work/active/CURRENT.md")


def gh_json(args: list[str]) -> dict:
    res = subprocess.run(
        ["gh", *args, "--format", "json"],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(res.stdout)


def fetch_main_sha() -> str:
    res = subprocess.run(
        ["git", "rev-parse", "--short", "origin/main"],
        check=True,
        capture_output=True,
        text=True,
    )
    return res.stdout.strip()


def fetch_open_prs() -> list[dict]:
    res = subprocess.run(
        ["gh", "pr", "list", "--repo", REPO, "--state", "open",
         "--json", "number,title,headRefName"],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(res.stdout)


def fetch_project_items() -> list[dict]:
    data = gh_json(["project", "item-list", str(PROJECT_NUMBER),
                    "--owner", PROJECT_OWNER])
    return data.get("items", [])


def render_markdown(items: list[dict], main_sha: str, prs: list[dict]) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Group items by status
    status_buckets: dict[str, list[dict]] = {}
    for item in items:
        status = item.get("status") or "Todo"
        status_buckets.setdefault(status, []).append(item)

    lines: list[str] = []
    lines.append(f"# CURRENT — 단일 진실 ({today})")
    lines.append("")
    lines.append(f"> 🤖 **자동 생성** — `scripts/render_current_md.py` from "
                 f"[Project #{PROJECT_NUMBER}]({PROJECT_URL})")
    lines.append("> 단일 source = GitHub Project. 수동 편집 시 다음 sync에서 덮어쓰여짐.")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Active work items table
    lines.append("## 활성 Work Items")
    lines.append("")
    lines.append("| Work ID | Issue | Title | Owner | Status | Branch |")
    lines.append("|---|---|---|---|---|---|")

    # Show all non-Done items, sorted by status (In Progress > Todo > Done)
    order = {"In Progress": 0, "Todo": 1, "Done": 2}
    sorted_items = sorted(
        items,
        key=lambda x: (order.get(x.get("status", "Todo"), 99),
                       x.get("work ID", "") or ""),
    )
    for item in sorted_items:
        status = item.get("status", "Todo")
        if status == "Done":
            continue
        content = item.get("content", {}) or {}
        issue_num = content.get("number", "?")
        title = content.get("title", "?")
        # Strip "W-#### — " prefix from title for cleaner table
        clean_title = title
        for prefix in ["W-0132 — ", "W-0145 — "]:
            clean_title = clean_title.replace(prefix, "")
        work_id = item.get("work ID", "?") or "?"
        owner = item.get("owner", "?") or "?"
        branch = item.get("branch", "—") or "—"
        issue_link = f"[#{issue_num}](https://github.com/{REPO}/issues/{issue_num})"
        lines.append(
            f"| `{work_id}` | {issue_link} | {clean_title} | {owner} | {status} | {branch} |"
        )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## main SHA")
    lines.append("")
    lines.append(f"`{main_sha}` — origin/main")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Open PRs
    lines.append("## 🔴 Open PRs")
    lines.append("")
    if prs:
        for pr in prs:
            lines.append(f"- [#{pr['number']}](https://github.com/{REPO}/pull/{pr['number']}) "
                         f"`{pr['headRefName']}` — {pr['title']}")
    else:
        lines.append("(없음)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Recently completed (Done items)
    done_items = [i for i in items if i.get("status") == "Done"]
    if done_items:
        lines.append("## ✅ 최근 완료")
        lines.append("")
        for item in done_items[:10]:
            content = item.get("content", {}) or {}
            issue_num = content.get("number", "?")
            title = content.get("title", "?")
            work_id = item.get("work ID", "?") or "?"
            lines.append(f"- `{work_id}` [#{issue_num}](https://github.com/{REPO}/issues/{issue_num}) — {title}")
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="Exit 1 if rendered output differs from on-disk CURRENT.md")
    args = parser.parse_args()

    items = fetch_project_items()
    main_sha = fetch_main_sha()
    prs = fetch_open_prs()
    rendered = render_markdown(items, main_sha, prs)

    if args.check:
        existing = CURRENT_MD_PATH.read_text() if CURRENT_MD_PATH.exists() else ""
        if existing != rendered:
            print("CURRENT.md is out of sync with Project. Run without --check to fix.",
                  file=sys.stderr)
            return 1
        print("CURRENT.md is in sync.")
        return 0

    CURRENT_MD_PATH.write_text(rendered)
    print(f"Wrote {CURRENT_MD_PATH} ({len(rendered)} chars, {len(items)} items)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
