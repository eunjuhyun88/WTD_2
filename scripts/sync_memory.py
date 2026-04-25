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
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEMORY_DIR = ROOT / "memory"
CURRENT_MD = ROOT / "work" / "active" / "CURRENT.md"

# engine .venv 우선 시도, 없으면 시스템 Python에서 import
sys.path.insert(0, str(ROOT / "engine"))
try:
    from memkraft import MemKraft
except ImportError:
    print("⚠️  memkraft not installed — skipping MemKraft write")
    MemKraft = None


# ──────────────────────────────────────────────
# MemKraft 기록
# ──────────────────────────────────────────────

def record_pr_event(pr_number: int, pr_title: str, pr_body: str, sha: str, author: str) -> None:
    if MemKraft is None:
        return

    mk = MemKraft(base_dir=str(MEMORY_DIR))

    # work item ID 추출 (W-XXXX 패턴)
    work_ids = re.findall(r"W-\d{4}", pr_title + " " + pr_body)
    tags_parts = ["pr", "merge"] + list(dict.fromkeys(work_ids))  # dedup, order preserved
    tags = ",".join(tags_parts)

    mk.log_event(
        f"PR #{pr_number} merged by {author}: {pr_title}",
        tags=tags,
        importance="high",
    )
    print(f"✅ MemKraft: PR #{pr_number} 기록 완료 (tags: {tags})")


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

    # 날짜 헤더 갱신
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    new_text = re.sub(
        r"(# CURRENT — 단일 진실 \().*?(\))",
        rf"\g<1>{today}\2",
        new_text,
    )

    # 완료 테이블에 PR 추가 (중복 방지)
    pr_entry = f"| #{pr_number} | {pr_title} |"
    if f"#{pr_number}" not in new_text:
        # "## 완료" 섹션 바로 아래 테이블에 삽입
        new_text = re.sub(
            r"(## 완료.*?\n\|[-| ]+\|\n)",
            rf"\1{pr_entry}\n",
            new_text,
            flags=re.DOTALL,
        )

    if new_text == text:
        print("ℹ️  CURRENT.md 변경 없음 (이미 최신)")
        return False

    CURRENT_MD.write_text(new_text, encoding="utf-8")
    print(f"✅ CURRENT.md: main SHA → {sha[:8]}, PR #{pr_number} 추가")
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
