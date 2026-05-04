"""Scorer for eval gold set items."""
from __future__ import annotations


def score_item(
    item: dict,
    *,
    tools_used: list[str],
    text_out: str,
) -> tuple[bool, list[str]]:
    """Return (passed, reasons_list)."""
    reasons: list[str] = []
    passed = True

    expected_tools: list[str] = item.get("expected_tools", [])
    expected_keywords: list[str] = item.get("expected_keywords", [])

    # Check expected tools were called
    for tool in expected_tools:
        if tool not in tools_used:
            reasons.append(f"missing tool: {tool}")
            passed = False

    # Check at least one expected keyword appears in output
    if expected_keywords:
        text_lower = text_out.lower()
        matched = [kw for kw in expected_keywords if kw.lower() in text_lower]
        if not matched:
            reasons.append(f"no keyword match: {expected_keywords}")
            passed = False
        else:
            reasons.append(f"keyword matched: {matched[0]}")

    # OOD: should NOT call tools (tool_use_blocked)
    if item.get("category") == "ood" and tools_used:
        reasons.append(f"OOD called tools unexpectedly: {tools_used}")
        passed = False

    if passed and not reasons:
        reasons.append("ok")

    return passed, reasons
