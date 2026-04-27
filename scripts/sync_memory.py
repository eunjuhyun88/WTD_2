#!/usr/bin/env python3
"""PR 머지 시 MemKraft 자동 기록 + CURRENT.md SHA 동기화.

GitHub Actions에서 호출:
    python scripts/sync_memory.py \
        --pr-number 278 \
        --pr-title "feat(memory): MemKraft 도입" \
        --pr-body "..." \
        --sha abc1234 \
        --author "claude"
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MEMORY_DIR = ROOT / "memory"
CURRENT_MD = ROOT / "work" / "active" / "CURRENT.md"
LOCAL_TZ = ZoneInfo("Asia/Seoul")

# 루트 memory.mk protocol import를 우선 사용한다.
sys.path.insert(0, str(ROOT))
sys.path.insert(1, str(ROOT / "engine"))
try:
    from memory.mk import mk
except ImportError:
    print("memkraft not installed or memory.mk unavailable - skipping MemKraft write")
    mk = None


# ──────────────────────────────────────────────
# MemKraft 기록
# ──────────────────────────────────────────────

def record_pr_event(pr_number: int, pr_title: str, pr_body: str, sha: str, author: str) -> None:
    if mk is None:
        return

    if has_existing_pr_event(pr_number):
        print(f"MemKraft: PR #{pr_number} event already exists - skipping duplicate")
        return

    # work item ID 추출 (W-XXXX 패턴)
    work_ids = re.findall(r"W-\d{4}", pr_title + " " + pr_body)
    tags_parts = ["pr", "merge"] + list(dict.fromkeys(work_ids))  # dedup, order preserved
    tags = ",".join(tags_parts)

    mk.log_event(
        f"PR #{pr_number} merged by {author}: {pr_title}",
        tags=tags,
        importance="high",
    )
    print(f"MemKraft: recorded PR #{pr_number} (tags: {tags})")


def has_existing_pr_event(pr_number: int) -> bool:
    needle = f"PR #{pr_number} merged"
    sessions_dir = MEMORY_DIR / "sessions"
    if not sessions_dir.exists():
        return False

    for path in sessions_dir.glob("*.jsonl"):
        try:
            if needle in path.read_text(encoding="utf-8"):
                return True
        except OSError:
            continue
    return False


# ──────────────────────────────────────────────
# CURRENT.md SHA 동기화
# ──────────────────────────────────────────────

def sync_current_md(sha: str, pr_number: int, pr_title: str) -> bool:
    if not CURRENT_MD.exists():
        print(f"⚠️  CURRENT.md not found: {CURRENT_MD}")
        return False

    text = CURRENT_MD.read_text(encoding="utf-8")

    # main SHA 교체
    new_text = re.sub(
        r"(## main SHA\s*\n\n)`[0-9a-f]+(.*?)`",
        rf"\1`{sha[:8]}\2`",
        text,
    )

    # 날짜 헤더 갱신. GitHub Actions runs in UTC, but CURRENT.md is kept in KST.
    today = datetime.now(LOCAL_TZ).strftime("%Y-%m-%d")
    new_text = re.sub(
        r"(# CURRENT — 단일 진실 \().*?(\))",
        rf"\g<1>{today}\2",
        new_text,
    )

    if new_text == text:
        print("CURRENT.md unchanged")
        return False

    CURRENT_MD.write_text(new_text, encoding="utf-8")
    print(f"CURRENT.md: main SHA -> {sha[:8]} after PR #{pr_number}")
    return True


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="PR 머지 후 memory + CURRENT.md 동기화")
    parser.add_argument("--pr-number", type=int, required=True)
    parser.add_argument("--pr-title", required=True)
    parser.add_argument("--pr-body", default="")
    parser.add_argument("--sha", required=True)
    parser.add_argument("--author", default="unknown")
    args = parser.parse_args()

    record_pr_event(args.pr_number, args.pr_title, args.pr_body, args.sha, args.author)
    sync_current_md(args.sha, args.pr_number, args.pr_title)
    return 0


if __name__ == "__main__":
    sys.exit(main())
