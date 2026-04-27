#!/usr/bin/env python3
"""Verify checklist toggles match Closes #N references.

Invariant (W-0223): PR diff에서 [ ] → [x] 토글된 체크리스트 항목 ID는
PR body의 Closes #N에 링크된 Issue body의 'Feature ID' 또는 'Checklist'
필드와 매칭되어야 한다.

매칭 실패 시 exit 1로 PR 차단. stub 단계는 경고만 출력.
"""
from __future__ import annotations
import os
import re
import subprocess
import sys

CHECKLIST_PATH = "docs/live/W-0220-status-checklist.md"


def diff_toggled_ids(base: str, head: str) -> list[str]:
    """PR diff에서 [x] 새로 추가된 항목의 Feature ID 추출."""
    try:
        out = subprocess.check_output(
            ["git", "diff", f"{base}..{head}", "--", CHECKLIST_PATH],
            text=True,
        )
    except subprocess.CalledProcessError:
        return []
    ids: list[str] = []
    pattern = re.compile(r"^\+.*\[x\]\s+\*\*([A-Z]-\d+(-\w+)?|F-\d+|D\d+|Q\d+)\*\*")
    for line in out.splitlines():
        m = pattern.match(line)
        if m:
            ids.append(m.group(1))
    return ids


def closes_issue_numbers(body: str) -> list[int]:
    return [int(n) for n in re.findall(r"[Cc]loses\s+#(\d+)", body or "")]


def issue_feature_ids(issue_num: int, repo: str) -> list[str]:
    try:
        out = subprocess.check_output(
            ["gh", "issue", "view", str(issue_num), "--repo", repo, "--json", "body,title"],
            text=True,
        )
    except subprocess.CalledProcessError:
        return []
    import json
    data = json.loads(out)
    text = data.get("body", "") + "\n" + data.get("title", "")
    return re.findall(r"([A-Z]-\d+(?:-\w+)?|F-\d+)", text)


def main() -> int:
    base = os.environ.get("PR_BASE_SHA", "")
    head = os.environ.get("PR_HEAD_SHA", "")
    body = os.environ.get("PR_BODY", "")
    repo = os.environ.get("REPO", "")
    if not (base and head and repo):
        print("missing PR env vars — skipping verification (stub mode)")
        return 0

    toggled = diff_toggled_ids(base, head)
    if not toggled:
        print("no checklist toggles in this PR — OK")
        return 0

    closes = closes_issue_numbers(body)
    if not closes:
        print(f"❌ checklist toggled {toggled} but PR body has no 'Closes #N'")
        return 1

    linked_ids: set[str] = set()
    for n in closes:
        linked_ids.update(issue_feature_ids(n, repo))

    missing = [t for t in toggled if t not in linked_ids and not t.startswith(("D", "Q"))]
    if missing:
        print(f"❌ toggled IDs {missing} not found in linked Issues {closes} (Feature IDs: {sorted(linked_ids)})")
        return 1

    print(f"✓ checklist toggle ↔ Closes match — toggled {toggled} linked via {closes}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
