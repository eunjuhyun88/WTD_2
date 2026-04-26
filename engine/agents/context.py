"""Context Assembly rules for LLM agent calls.

Defines WHAT context each agent type receives and enforces token budgets.
This is the single source of truth for context injection — no agent should
build its own context ad-hoc.

Agent types and token budgets:
    Parser     ~10 000 tokens — COGOCHI core + top-3 patterns + last-5 verdicts + snapshot
    Judge      ~12 000 tokens — COGOCHI judge section + wiki page + history + outcome + news
    Refinement ~12 000 tokens — pattern wiki page + anonymous verdicts (k≥10) + overlap

Design (CTO):
- Lazy loading: only fetch what's needed for the agent type
- Token budget: truncate to stay within limit (cost control)
- Deterministic content (stats, history) comes from DB/files; LLM only writes body_md
- COGOCHI.md is split into sections so agents only load relevant slices
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger("engine.agents.context")

_WIKI_DIR = Path(__file__).parent.parent / "wiki"
_COGOCHI_PATH = _WIKI_DIR / "COGOCHI.md"

# Token budgets (approx — 1 token ≈ 4 chars in English/code)
_BUDGET_PARSER = 10_000
_BUDGET_JUDGE = 12_000
_BUDGET_REFINEMENT = 12_000

# COGOCHI.md section markers
_SECTION_CORE = "## CORE"
_SECTION_JUDGE = "## JUDGE"
_SECTION_REFINEMENT = "## REFINEMENT"

_CHARS_PER_TOKEN = 4


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def _truncate_to_budget(text: str, budget_tokens: int) -> str:
    """Hard-truncate text to stay within token budget."""
    max_chars = budget_tokens * _CHARS_PER_TOKEN
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    log.debug("truncated %d → %d chars (budget %d tokens)", len(text), len(truncated), budget_tokens)
    return truncated + "\n[...truncated to fit token budget]"


def _load_cogochi_section(section_marker: str) -> str:
    """Load a named section from COGOCHI.md.

    Sections are delimited by '## SECTION_NAME' headers.
    Returns empty string if the file or section is missing.
    """
    if not _COGOCHI_PATH.exists():
        log.warning("COGOCHI.md not found at %s", _COGOCHI_PATH)
        return ""

    text = _COGOCHI_PATH.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    # Find the section start
    start_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith(section_marker):
            start_idx = i
            break

    if start_idx is None:
        # Section not found — return full COGOCHI content (graceful fallback)
        return text

    # Find the next ## section (end of our section)
    end_idx = len(lines)
    for i in range(start_idx + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped.startswith("## ") and not stripped.startswith(section_marker):
            end_idx = i
            break

    return "".join(lines[start_idx:end_idx])


# ── Context dataclasses ────────────────────────────────────────────────────

@dataclass
class ParseTextContext:
    """Context for text-to-PatternDraft parse calls.

    Used by POST /patterns/parse. Contains only the system prompt and the
    user's raw text — no user_id or symbol required.
    """
    system_prompt: str = ""
    token_estimate: int = 0


@dataclass
class ParserContext:
    """Context for Parser agent (~10K tokens).

    Parser reads a new market snapshot and identifies which pattern(s) are
    potentially forming. Needs pattern definitions + recent user verdicts.
    """
    cogochi_core: str = ""
    top_patterns: list[dict[str, Any]] = field(default_factory=list)  # top-3 by win_rate
    recent_verdicts: list[dict[str, Any]] = field(default_factory=list)  # last-5
    feature_snapshot: dict[str, Any] = field(default_factory=dict)
    symbol: str = ""
    timeframe: str = ""
    token_estimate: int = 0

    def to_prompt_parts(self) -> list[str]:
        parts = [self.cogochi_core]
        if self.top_patterns:
            parts.append("## Top Patterns\n" + _format_patterns(self.top_patterns))
        if self.recent_verdicts:
            parts.append("## Recent Verdicts\n" + _format_verdicts(self.recent_verdicts))
        if self.feature_snapshot:
            parts.append("## Current Snapshot\n" + _format_snapshot(self.feature_snapshot, self.symbol))
        return parts


@dataclass
class JudgeContext:
    """Context for Judge agent (~12K tokens).

    Judge evaluates a capture record and produces a verdict on pattern quality.
    """
    cogochi_judge: str = ""
    wiki_page: str = ""          # pattern wiki page body_md
    outcome_history: list[dict[str, Any]] = field(default_factory=list)  # last-10 outcomes
    capture_record: dict[str, Any] = field(default_factory=dict)
    pattern_stats: dict[str, Any] = field(default_factory=dict)
    symbol: str = ""
    token_estimate: int = 0

    def to_prompt_parts(self) -> list[str]:
        parts = [self.cogochi_judge]
        if self.wiki_page:
            parts.append("## Pattern Wiki\n" + self.wiki_page)
        if self.pattern_stats:
            parts.append("## Pattern Stats\n" + _format_stats(self.pattern_stats))
        if self.outcome_history:
            parts.append("## Recent Outcomes\n" + _format_outcomes(self.outcome_history))
        if self.capture_record:
            parts.append("## Capture Under Review\n" + _format_capture(self.capture_record))
        return parts


@dataclass
class RefinementContext:
    """Context for Refinement agent (~12K tokens).

    Refinement re-evaluates a pattern definition based on accumulated verdicts.
    """
    cogochi_refinement: str = ""
    pattern_wiki_page: str = ""
    anonymous_verdicts: list[dict[str, Any]] = field(default_factory=list)  # k≥10
    overlap_analysis: dict[str, Any] = field(default_factory=dict)
    pattern_stats: dict[str, Any] = field(default_factory=dict)
    pattern_slug: str = ""
    token_estimate: int = 0

    def to_prompt_parts(self) -> list[str]:
        parts = [self.cogochi_refinement]
        if self.pattern_wiki_page:
            parts.append("## Pattern Definition\n" + self.pattern_wiki_page)
        if self.pattern_stats:
            parts.append("## Performance Stats\n" + _format_stats(self.pattern_stats))
        if self.anonymous_verdicts:
            parts.append(
                f"## User Verdicts (n={len(self.anonymous_verdicts)}, anonymized)\n"
                + _format_verdicts(self.anonymous_verdicts)
            )
        if self.overlap_analysis:
            parts.append("## Pattern Overlap Analysis\n" + str(self.overlap_analysis))
        return parts


# ── Assembler ──────────────────────────────────────────────────────────────

class ContextAssembler:
    """Builds agent-specific context objects, enforcing token budgets.

    Usage:
        ctx = ContextAssembler()
        parser_ctx = ctx.for_parser(user_id="u1", symbol="BTCUSDT")
        judge_ctx  = ctx.for_judge(user_id="u1", capture_id="cap-xyz")
        refine_ctx = ctx.for_refinement(pattern_slug="whale-accumulation-reversal-v1")
    """

    def for_parse_text(self, symbol: str | None = None) -> ParseTextContext:
        """Build system prompt for POST /patterns/parse (free-text → PatternDraftBody).

        Token budget: ~10K. Returns a ParseTextContext with a ready-to-use
        system prompt string and an estimated token count.
        """
        budget = _BUDGET_PARSER
        ctx = ParseTextContext()

        symbol_hint = f"\nSymbol hint (if available): {symbol}" if symbol else ""

        system_prompt = f"""You are a crypto trading pattern analyst. Your task is to parse a free-text trading memo and extract a structured PatternDraftBody JSON.

Output ONLY valid JSON that matches this exact schema — no markdown fences, no extra text:

{{
  "schema_version": 1,
  "pattern_family": "<string — short slug like 'oi-spike-price-divergence'>",
  "pattern_label": "<string | null — human-readable name>",
  "source_type": "text",
  "source_text": "<the original input text verbatim>",
  "symbol_candidates": ["<symbol if mentioned, e.g. BTCUSDT>"],
  "timeframe": "<e.g. '1h', '4h', '1d' | null>",
  "thesis": ["<key market thesis, 1–3 sentences>"],
  "phases": [
    {{
      "phase_id": "PHASE_0",
      "label": "<short label>",
      "sequence_order": 0,
      "description": "<what happens in this phase>",
      "timeframe": null,
      "signals_required": ["<signal name>"],
      "signals_preferred": [],
      "signals_forbidden": [],
      "directional_belief": "<'bullish' | 'bearish' | 'neutral' | null>",
      "evidence_text": null,
      "time_hint": null,
      "importance": 0.8
    }}
  ],
  "trade_plan": {{
    "entry_condition": "<entry trigger description>",
    "disqualifiers": ["<condition that cancels the setup>"]
  }},
  "search_hints": {{
    "must_have_signals": [],
    "preferred_timeframes": [],
    "exclude_patterns": [],
    "similarity_focus": [],
    "symbol_scope": []
  }},
  "confidence": 0.7,
  "ambiguities": ["<anything unclear in the input>"]
}}

Rules:
- `phases` MUST have at least one entry. If the input describes no explicit phases, infer at least one phase from the text.
- `phase_sequence` means the ordered list of phases — ensure `sequence_order` is 0-indexed and strictly increasing.
- `pattern_family` must be a lowercase kebab-case slug (no spaces).
- If the input text is in Korean, parse the intent fully. Korean trading terms: OI=미결제약정, 롱=long, 숏=short, 급등=spike, 하락=decline.
- Do not add fields not in the schema.
- Confidence should reflect how well the text maps to a tradeable pattern (0.0–1.0).{symbol_hint}
"""
        ctx.system_prompt = _truncate_to_budget(system_prompt, budget)
        ctx.token_estimate = _estimate_tokens(system_prompt)
        return ctx

    def for_parser(
        self,
        user_id: str,
        symbol: str,
        timeframe: str = "1h",
        feature_snapshot: dict[str, Any] | None = None,
    ) -> ParserContext:
        budget = _BUDGET_PARSER
        ctx = ParserContext(symbol=symbol, timeframe=timeframe)

        # COGOCHI core section
        core = _load_cogochi_section(_SECTION_CORE)
        ctx.cogochi_core = _truncate_to_budget(core, budget // 4)
        budget -= _estimate_tokens(ctx.cogochi_core)

        # Top-3 patterns by win rate
        try:
            ctx.top_patterns = _load_top_patterns(user_id, limit=3)
            budget -= _estimate_tokens(str(ctx.top_patterns))
        except Exception as exc:
            log.warning("for_parser: failed to load top patterns: %s", exc)

        # Last-5 verdicts for this user
        try:
            ctx.recent_verdicts = _load_recent_verdicts(user_id, limit=5)
            budget -= _estimate_tokens(str(ctx.recent_verdicts))
        except Exception as exc:
            log.warning("for_parser: failed to load recent verdicts: %s", exc)

        # Feature snapshot
        if feature_snapshot:
            snap_str = _format_snapshot(feature_snapshot, symbol)
            ctx.feature_snapshot = feature_snapshot
            budget -= _estimate_tokens(snap_str)

        ctx.token_estimate = _BUDGET_PARSER - budget
        return ctx

    def for_judge(
        self,
        user_id: str,
        capture_id: str,
        pattern_slug: str | None = None,
    ) -> JudgeContext:
        budget = _BUDGET_JUDGE
        ctx = JudgeContext()

        # COGOCHI judge section
        judge_section = _load_cogochi_section(_SECTION_JUDGE)
        ctx.cogochi_judge = _truncate_to_budget(judge_section, budget // 4)
        budget -= _estimate_tokens(ctx.cogochi_judge)

        # Capture record
        try:
            capture = _load_capture(capture_id)
            if capture:
                ctx.capture_record = capture
                ctx.symbol = capture.get("symbol", "")
                if not pattern_slug:
                    pattern_slug = capture.get("pattern_slug")
                budget -= _estimate_tokens(str(capture))
        except Exception as exc:
            log.warning("for_judge: failed to load capture %s: %s", capture_id, exc)

        if pattern_slug:
            # Wiki page for this pattern
            try:
                ctx.wiki_page = _truncate_to_budget(
                    _load_wiki_page(pattern_slug), budget // 3
                )
                budget -= _estimate_tokens(ctx.wiki_page)
            except Exception as exc:
                log.warning("for_judge: failed to load wiki page for %s: %s", pattern_slug, exc)

            # Pattern stats
            try:
                from stats.engine import get_stats_engine  # type: ignore
                ctx.pattern_stats = get_stats_engine().as_wiki_frontmatter(pattern_slug)
                budget -= _estimate_tokens(str(ctx.pattern_stats))
            except Exception as exc:
                log.warning("for_judge: failed to load stats for %s: %s", pattern_slug, exc)

            # Outcome history (last 10 closed)
            try:
                ctx.outcome_history = _load_outcome_history(pattern_slug, limit=10)
                budget -= _estimate_tokens(str(ctx.outcome_history))
            except Exception as exc:
                log.warning("for_judge: failed to load outcome history: %s", exc)

        ctx.token_estimate = _BUDGET_JUDGE - budget
        return ctx

    def for_refinement(
        self,
        pattern_slug: str,
        min_verdicts: int = 10,
    ) -> RefinementContext:
        budget = _BUDGET_REFINEMENT
        ctx = RefinementContext(pattern_slug=pattern_slug)

        # COGOCHI refinement section
        refinement_section = _load_cogochi_section(_SECTION_REFINEMENT)
        ctx.cogochi_refinement = _truncate_to_budget(refinement_section, budget // 4)
        budget -= _estimate_tokens(ctx.cogochi_refinement)

        # Pattern wiki page
        try:
            ctx.pattern_wiki_page = _truncate_to_budget(
                _load_wiki_page(pattern_slug), budget // 3
            )
            budget -= _estimate_tokens(ctx.pattern_wiki_page)
        except Exception as exc:
            log.warning("for_refinement: failed to load wiki page for %s: %s", pattern_slug, exc)

        # Pattern stats
        try:
            from stats.engine import get_stats_engine  # type: ignore
            ctx.pattern_stats = get_stats_engine().as_wiki_frontmatter(pattern_slug)
            budget -= _estimate_tokens(str(ctx.pattern_stats))
        except Exception as exc:
            log.warning("for_refinement: failed to load stats: %s", exc)

        # Anonymous verdicts (only if k ≥ min_verdicts)
        try:
            verdicts = _load_outcome_history(pattern_slug, limit=50, closed_only=True)
            if len(verdicts) >= min_verdicts:
                ctx.anonymous_verdicts = [_anonymize_verdict(v) for v in verdicts]
                budget -= _estimate_tokens(str(ctx.anonymous_verdicts))
            else:
                log.info(
                    "for_refinement: only %d verdicts for %s (min=%d) — skipping",
                    len(verdicts), pattern_slug, min_verdicts,
                )
        except Exception as exc:
            log.warning("for_refinement: failed to load verdicts: %s", exc)

        ctx.token_estimate = _BUDGET_REFINEMENT - budget
        return ctx


# ── Data loaders (thin adapters over existing stores) ──────────────────────

def _load_top_patterns(user_id: str, limit: int = 3) -> list[dict[str, Any]]:
    from stats.engine import get_stats_engine  # type: ignore
    all_perfs = get_stats_engine().get_all()
    sorted_perfs = sorted(
        all_perfs.values(),
        key=lambda p: p.win_rate,
        reverse=True,
    )
    return [
        {
            "slug": p.slug,
            "win_rate": round(p.win_rate, 3),
            "ev": round(p.expected_value, 4),
            "sample_count": p.sample_count,
        }
        for p in sorted_perfs[:limit]
        if p.sample_count >= 5
    ]


def _load_recent_verdicts(user_id: str, limit: int = 5) -> list[dict[str, Any]]:
    from ledger.store import get_ledger_store  # type: ignore
    from patterns.library import PATTERN_REGISTRY  # type: ignore

    store = get_ledger_store()
    verdicts: list[dict[str, Any]] = []

    for slug in (PATTERN_REGISTRY or {}).keys():
        try:
            outcomes = store.list_all(slug)
            user_outcomes = [
                o for o in outcomes
                if getattr(o, "user_id", None) == user_id
                and getattr(o, "user_verdict", None) is not None
            ]
            for o in user_outcomes[:2]:
                verdicts.append({
                    "slug": slug,
                    "verdict": o.user_verdict,
                    "note": getattr(o, "user_note", None),
                    "outcome": o.outcome,
                })
        except Exception:
            continue

    # Most recent first, up to limit
    return verdicts[:limit]


def _load_capture(capture_id: str) -> dict[str, Any] | None:
    try:
        from capture.store import get_capture_store  # type: ignore
        record = get_capture_store().load(capture_id)
        if record is None:
            return None
        return {
            "capture_id": record.capture_id,
            "pattern_slug": getattr(record, "pattern_slug", None),
            "symbol": getattr(record, "symbol", None),
            "phase": getattr(record, "phase", None),
            "feature_snapshot": getattr(record, "feature_snapshot", {}),
            "user_note": getattr(record, "user_note", None),
        }
    except Exception as exc:
        log.warning("_load_capture: %s", exc)
        return None


def _load_wiki_page(pattern_slug: str) -> str:
    wiki_path = _WIKI_DIR / "patterns" / f"{pattern_slug}.md"
    if not wiki_path.exists():
        return f"(No wiki page yet for {pattern_slug})"
    return wiki_path.read_text(encoding="utf-8")


def _load_outcome_history(
    slug: str,
    limit: int = 10,
    closed_only: bool = False,
) -> list[dict[str, Any]]:
    from ledger.store import get_ledger_store  # type: ignore

    store = get_ledger_store()
    outcomes = store.list_all(slug)
    if closed_only:
        outcomes = [o for o in outcomes if getattr(o, "outcome", None) in ("success", "failure")]
    return [
        {
            "outcome": o.outcome,
            "symbol": getattr(o, "symbol", None),
            "entry_price": getattr(o, "entry_price", None),
            "max_gain_pct": getattr(o, "max_gain_pct", None),
            "exit_return_pct": getattr(o, "exit_return_pct", None),
            "duration_hours": getattr(o, "duration_hours", None),
            "btc_trend": getattr(o, "btc_trend_at_entry", None),
        }
        for o in outcomes[:limit]
    ]


def _anonymize_verdict(v: dict[str, Any]) -> dict[str, Any]:
    """Strip PII — remove user_id before passing to LLM."""
    return {k: v2 for k, v2 in v.items() if k not in ("user_id", "id")}


# ── Formatters ─────────────────────────────────────────────────────────────

def _format_patterns(patterns: list[dict[str, Any]]) -> str:
    lines = []
    for p in patterns:
        lines.append(
            f"- {p.get('slug')}: win_rate={p.get('win_rate'):.1%}, "
            f"ev={p.get('ev'):.4f}, n={p.get('sample_count')}"
        )
    return "\n".join(lines)


def _format_verdicts(verdicts: list[dict[str, Any]]) -> str:
    lines = []
    for v in verdicts:
        lines.append(
            f"- [{v.get('outcome', '?')}] {v.get('slug', '?')}: "
            f"verdict={v.get('verdict', '?')} note={v.get('note', '')}"
        )
    return "\n".join(lines)


def _format_outcomes(outcomes: list[dict[str, Any]]) -> str:
    lines = []
    for o in outcomes:
        gain = f"{o.get('max_gain_pct', 0) * 100:.1f}%" if o.get("max_gain_pct") is not None else "?"
        loss = f"{o.get('exit_return_pct', 0) * 100:.1f}%" if o.get("exit_return_pct") is not None else "?"
        lines.append(
            f"- {o.get('outcome', '?')} on {o.get('symbol', '?')}: "
            f"peak={gain}, exit={loss}, dur={o.get('duration_hours', '?')}h, "
            f"btc={o.get('btc_trend', '?')}"
        )
    return "\n".join(lines)


def _format_snapshot(snapshot: dict[str, Any], symbol: str) -> str:
    if not snapshot:
        return f"Symbol: {symbol}\n(no snapshot)"
    key_fields = (
        "trend_regime", "volatility_regime", "phase_guess",
        "oi_change_pct", "funding_rate_last", "cvd_delta",
        "volume_zscore", "range_width_pct",
    )
    lines = [f"Symbol: {symbol}"]
    for k in key_fields:
        if k in snapshot:
            lines.append(f"  {k}: {snapshot[k]}")
    return "\n".join(lines)


def _format_capture(capture: dict[str, Any]) -> str:
    lines = [
        f"capture_id: {capture.get('capture_id')}",
        f"pattern: {capture.get('pattern_slug')}",
        f"symbol: {capture.get('symbol')}",
        f"phase: {capture.get('phase')}",
    ]
    snap = capture.get("feature_snapshot")
    if snap:
        lines.append(_format_snapshot(snap, capture.get("symbol", "")))
    if capture.get("user_note"):
        lines.append(f"user_note: {capture['user_note']}")
    return "\n".join(lines)


def _format_stats(stats: dict[str, Any]) -> str:
    return "\n".join(f"  {k}: {v}" for k, v in stats.items())


# ── Module-level singleton ─────────────────────────────────────────────────

_assembler: ContextAssembler | None = None


def get_assembler() -> ContextAssembler:
    global _assembler
    if _assembler is None:
        _assembler = ContextAssembler()
    return _assembler
