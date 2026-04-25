#!/usr/bin/env python3
"""Validate the repo-local MemKraft and active-work protocol."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

REQUIRED_WORK_SECTIONS = (
    "Goal",
    "Owner",
    "Scope",
    "Non-Goals",
    "Canonical Files",
    "Facts",
    "Assumptions",
    "Open Questions",
    "Decisions",
    "Next Steps",
    "Exit Criteria",
    "Handoff Checklist",
)


def _section_names(markdown: str) -> set[str]:
    return {match.group(1).strip() for match in re.finditer(r"^##\s+(.+?)\s*$", markdown, re.MULTILINE)}


def _active_section(current_md: str) -> str:
    match = re.search(
        r"^## 활성 Work Items\s*(.*?)(?:\n---\n|\n## )",
        current_md,
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(1) if match else ""


def _work_item_paths(active_section: str) -> Iterable[Path]:
    # Only canonical active work-item slugs are enforced here. CURRENT.md can
    # still contain human-readable PR rows while they are being cleaned up.
    for slug in dict.fromkeys(re.findall(r"`(W-\d{4}-[a-z0-9][a-z0-9-]*)`", active_section)):
        filename = slug if slug.endswith(".md") else f"{slug}.md"
        yield ROOT / "work" / "active" / filename


def main() -> int:
    errors: list[str] = []

    try:
        from memory.mk import mk
    except Exception as exc:  # pragma: no cover - diagnostic path
        errors.append(f"from memory.mk import mk failed: {exc}")
        mk = None

    if mk is not None:
        for method in ("search", "evidence_first", "log_event", "decision_record", "incident_record"):
            if not hasattr(mk, method):
                errors.append(f"memory.mk missing method: {method}")

        try:
            evidence = mk.evidence_first("memkraft ci agent governance")
            print(f"[memkraft:protocol] evidence_first ok ({len(evidence)} results)")
        except Exception as exc:
            errors.append(f"mk.evidence_first failed: {exc}")

        if hasattr(mk, "health_check"):
            try:
                health = mk.health_check()
                score = health.get("health_score", "unknown")
                pass_rate = float(health.get("pass_rate", 0))
                print(f"[memkraft:protocol] health {score} ({pass_rate:.1f}%)")
                if pass_rate < 100:
                    errors.append(f"MemKraft health_check below 100%: {pass_rate:.1f}%")
            except Exception as exc:
                errors.append(f"mk.health_check failed: {exc}")

    active_handoffs = sorted((ROOT / "work" / "active").glob("AGENT-HANDOFF-*.md"))
    if active_handoffs:
        joined = ", ".join(str(path.relative_to(ROOT)) for path in active_handoffs)
        errors.append(f"archive active handoff snapshots: {joined}")

    current_path = ROOT / "work" / "active" / "CURRENT.md"
    current_md = current_path.read_text(encoding="utf-8")
    active = _active_section(current_md)
    if not active:
        errors.append("CURRENT.md missing '## 활성 Work Items' section")
    else:
        paths = list(_work_item_paths(active))
        if not paths:
            errors.append("CURRENT.md active section has no W-* work items")
        for path in paths:
            if not path.exists():
                errors.append(f"listed work item missing: {path.relative_to(ROOT)}")
                continue
            names = _section_names(path.read_text(encoding="utf-8"))
            missing = [section for section in REQUIRED_WORK_SECTIONS if section not in names]
            if missing:
                errors.append(f"{path.relative_to(ROOT)} missing sections: {', '.join(missing)}")
        print(f"[memkraft:protocol] active work items ok ({len(paths)} listed)")

    if errors:
        for error in errors:
            print(f"[memkraft:protocol] ERROR: {error}", file=sys.stderr)
        return 1

    print("[memkraft:protocol] ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
