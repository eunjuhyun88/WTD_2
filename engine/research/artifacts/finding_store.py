"""W-0316: Inbox MD writer for discovery findings.

Output: inbox/findings/{YYYY-MM-DD}/{id}.md
Format is human-readable and git-trackable.
No DB writes — ephemeral artifact.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_DEFAULT_INBOX = Path(__file__).parents[2] / "inbox" / "findings"


def save_finding(
    *,
    symbol: str,
    timeframe: str,
    pattern_label: str,
    win_rate: float,
    sharpe: float,
    n_samples: int,
    ci: tuple[float, float],
    regime: str,
    similar_count: int,
    llm_summary: str,
    agent_model: str,
    cycle_cost_usd: float,
    cycle_id: str,
    extra: dict[str, Any] | None = None,
    inbox_root: Path | None = None,
) -> Path:
    """Write one finding MD file. Returns path."""
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M KST")  # display only
    finding_id = uuid.uuid4().hex[:8]

    root = (inbox_root or _DEFAULT_INBOX) / date_str
    root.mkdir(parents=True, exist_ok=True)

    path = root / f"{finding_id}.md"
    ci_lo, ci_hi = ci

    content = f"""\
# [{symbol} {timeframe}] {pattern_label}

**발견**: {date_str} {time_str}
**통계**: win_rate={win_rate:.2f}, Sharpe={sharpe:.2f}, n={n_samples}, CI=[{ci_lo:.2f}, {ci_hi:.2f}]
**국면**: {regime}
**유사 선례**: {similar_count}건

{llm_summary}

---
*agent_model: {agent_model} | cost: ${cycle_cost_usd:.4f} | cycle_id: {cycle_id}*
"""

    if extra:
        content += "\n## Extra\n"
        for k, v in extra.items():
            content += f"- {k}: {v}\n"

    path.write_text(content, encoding="utf-8")
    return path


def list_findings(date: str | None = None, inbox_root: Path | None = None) -> list[Path]:
    """Return all finding MD files, optionally filtered by date (YYYY-MM-DD)."""
    root = inbox_root or _DEFAULT_INBOX
    if date:
        return sorted((root / date).glob("*.md")) if (root / date).exists() else []
    return sorted(root.rglob("*.md"))
