#!/usr/bin/env python3
"""backfill_work_issue_map — 1회 실행 초기화 스크립트

Scans work/active/ and work/completed/ for W-####-*.md,
searches GitHub issues, registers in state/work-issue-map.jsonl.
Skips w_ids already in the map.
"""
import sys
import os
import re
import json
import subprocess
import glob
from datetime import datetime, timezone

def repo_root():
    r = subprocess.run(["git","rev-parse","--show-toplevel"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else os.getcwd()

def load_existing_map(map_file):
    """Return set of w_ids already recorded (latest-entry dedup)."""
    if not os.path.exists(map_file):
        return set()
    seen = set()
    with open(map_file) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                seen.add(d["w_id"])
            except Exception:
                pass
    return seen

def collect_work_items(root):
    """Return dict {w_id: status} scanning completed/ then active/."""
    pattern = re.compile(r"^(W-\d{4})-")
    items = {}
    for status, folder in [("completed", "work/completed"), ("in_progress", "work/active")]:
        for path in glob.glob(os.path.join(root, folder, "W-[0-9][0-9][0-9][0-9]-*.md")):
            m = pattern.match(os.path.basename(path))
            if m:
                items[m.group(1)] = status  # active overwrites completed
    return items

def gh_search_issue(w_id):
    """Search GitHub issues for w_id; return (number, state) or (None, None)."""
    try:
        r = subprocess.run(
            ["gh","issue","list","--search", f'"{w_id}"',
             "--json","number,state","--limit","1"],
            capture_output=True, text=True, timeout=10
        )
        if r.returncode != 0:
            return None, None
        data = json.loads(r.stdout)
        if data:
            return data[0]["number"], data[0]["state"].lower()
    except Exception:
        pass
    return None, None

def main():
    dry_run = "--dry-run" in sys.argv
    root = repo_root()
    map_file = os.path.join(root, "state", "work-issue-map.jsonl")
    os.makedirs(os.path.dirname(map_file), exist_ok=True)
    open(map_file, "a").close()

    if dry_run:
        print("🔍 DRY RUN — no writes")

    existing = load_existing_map(map_file)
    items = collect_work_items(root)
    total = len(items)
    print(f"📋 Found {total} unique W-#### IDs to process")

    matched = skipped = not_found = 0
    ts_now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for w_id in sorted(items.keys()):
        if w_id in existing:
            skipped += 1
            continue

        issue_num, issue_state = gh_search_issue(w_id)
        if issue_num is None:
            print(f"  ⚠️  {w_id} → no GitHub issue found")
            not_found += 1
            continue

        status = items[w_id]
        if issue_state == "closed":
            status = "completed"

        print(f"  ✅ {w_id} → #{issue_num} ({issue_state}, status={status})")
        matched += 1

        if not dry_run:
            entry = json.dumps({
                "ts": ts_now,
                "w_id": w_id,
                "issue": issue_num,
                "pr": [],
                "status": status,
                "agent": "backfill"
            }, separators=(",", ":"))
            with open(map_file, "a") as f:
                f.write(entry + "\n")

    print()
    print("━" * 40)
    print(f"Total:     {total}")
    print(f"Matched:   {matched}")
    print(f"Skipped:   {skipped}  (already in map)")
    print(f"Not found: {not_found}")
    if dry_run:
        print("(dry-run — nothing written)")

if __name__ == "__main__":
    main()
