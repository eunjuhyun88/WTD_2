"""WikiIngestAgent — LLM-powered wiki page maintenance.

Implements the Karpathy LLM Wiki pattern adapted for this system:
- stats_engine writes frontmatter (numbers, deterministic, never LLM)
- LLM writes body_md (prose synthesis only)
- Separate read/write paths to prevent corruption

Triggers:
    on_capture_created(pattern_slug, capture_id)
    on_verdict_submitted(pattern_slug, outcome_id)
    on_pattern_stats_refreshed(pattern_slug)
    on_weekly_trigger()

Storm prevention:
    - Debounce: 60 seconds per slug before re-queuing
    - Max 10 pages per call batch
    - LLM token budget enforced by ContextAssembler

Wiki output format (cogochi/wiki/patterns/{slug}.md):
    ---
    slug: whale-accumulation-reversal-v1
    win_rate: 0.6429
    sample_count: 14
    ...  (stats_engine only)
    ---
    ## Overview
    ...  (LLM body_md — prose only)
"""
from __future__ import annotations

import logging
import os
import re
import time
from pathlib import Path
from typing import Any

log = logging.getLogger("engine.wiki.ingest")

_WIKI_OUTPUT_DIR = Path(__file__).parent.parent.parent / "cogochi" / "wiki" / "patterns"
_DEBOUNCE_SECONDS = 60
_MAX_PAGES_PER_BATCH = 10

# LLM model for wiki synthesis — prefer cheapest adequate model
_WIKI_LLM_MODEL = os.environ.get("WIKI_LLM_MODEL", "claude-haiku-4-5-20251001")
_MAX_BODY_TOKENS = 800  # ~3200 chars per page — keep wiki pages compact


class WikiIngestAgent:
    """Event-driven wiki page updater.

    Pattern:
        agent = WikiIngestAgent()
        agent.on_verdict_submitted("whale-accumulation-reversal-v1", outcome_id)

    The agent accumulates trigger events, debounces per slug, and flushes in
    batches. Safe to call from multiple event handlers — all writes are atomic
    (write temp file → rename).
    """

    def __init__(self) -> None:
        # slug → last_trigger_time
        self._pending: dict[str, float] = {}
        self._last_flush: float = 0.0

    # ── Event handlers ────────────────────────────────────────────────────

    def on_capture_created(self, pattern_slug: str, capture_id: str) -> None:
        log.debug("wiki trigger: capture_created %s (capture=%s)", pattern_slug, capture_id)
        self._queue(pattern_slug)

    def on_verdict_submitted(self, pattern_slug: str, outcome_id: str) -> None:
        log.debug("wiki trigger: verdict_submitted %s (outcome=%s)", pattern_slug, outcome_id)
        self._queue(pattern_slug)

    def on_pattern_stats_refreshed(self, pattern_slug: str) -> None:
        log.debug("wiki trigger: stats_refreshed %s", pattern_slug)
        self._queue(pattern_slug)

    def on_weekly_trigger(self) -> None:
        """Force-refresh all pattern wiki pages regardless of debounce."""
        from patterns.library import PATTERN_REGISTRY  # type: ignore

        log.info("wiki: weekly trigger — queuing all patterns")
        for slug in (PATTERN_REGISTRY or {}).keys():
            self._pending[slug] = 0.0  # bypass debounce

        self.flush()

    # ── Queue and flush ───────────────────────────────────────────────────

    def _queue(self, slug: str) -> None:
        """Add slug to pending queue (debounced)."""
        now = time.time()
        last = self._pending.get(slug, 0.0)
        if now - last < _DEBOUNCE_SECONDS:
            log.debug("wiki debounce: %s (%.0fs since last trigger)", slug, now - last)
            return
        self._pending[slug] = now
        log.debug("wiki queued: %s", slug)

    def flush(self, *, force: bool = False) -> list[str]:
        """Process up to MAX_PAGES_PER_BATCH pending slugs.

        Returns list of slugs successfully written.
        Call explicitly or let it auto-flush when queue is large.
        """
        now = time.time()
        ready = [
            slug for slug, trigger_t in self._pending.items()
            if force or (now - trigger_t >= _DEBOUNCE_SECONDS)
        ]

        if not ready:
            return []

        batch = ready[:_MAX_PAGES_PER_BATCH]
        written: list[str] = []

        for slug in batch:
            try:
                self._update_wiki_page(slug)
                written.append(slug)
                del self._pending[slug]
            except Exception as exc:
                log.error("wiki: failed to update page for %s: %s", slug, exc)

        if written:
            log.info("wiki: updated %d pages: %s", len(written), written)

        return written

    # ── Core page update ──────────────────────────────────────────────────

    def _update_wiki_page(self, slug: str) -> None:
        """Update or create wiki page for a pattern slug.

        1. stats_engine builds frontmatter (deterministic, no LLM)
        2. LLM builds body_md (prose synthesis only)
        3. Atomic write: temp file → rename
        """
        # Step 1: Deterministic frontmatter from stats_engine
        frontmatter = self._build_frontmatter(slug)

        # Step 2: LLM body_md (prose only)
        existing_body = self._load_existing_body(slug)
        body_md = self._synthesize_body(slug, frontmatter, existing_body)

        # Step 3: Atomic write
        page_content = _render_wiki_page(frontmatter, body_md)
        _atomic_write(_WIKI_OUTPUT_DIR / f"{slug}.md", page_content)

        log.info("wiki: updated %s (%d chars)", slug, len(page_content))

    def _build_frontmatter(self, slug: str) -> dict[str, Any]:
        """Stats-only frontmatter — deterministic SQL, no LLM."""
        try:
            from stats.engine import get_stats_engine  # type: ignore
            return get_stats_engine().as_wiki_frontmatter(slug)
        except Exception as exc:
            log.warning("wiki: could not build frontmatter for %s: %s", slug, exc)
            return {"slug": slug}

    def _load_existing_body(self, slug: str) -> str:
        """Load existing body_md from current wiki page (if any)."""
        page_path = _WIKI_OUTPUT_DIR / f"{slug}.md"
        if not page_path.exists():
            return ""
        text = page_path.read_text(encoding="utf-8")
        return _extract_body_md(text)

    def _synthesize_body(
        self,
        slug: str,
        frontmatter: dict[str, Any],
        existing_body: str,
    ) -> str:
        """Call LLM to synthesize wiki body_md.

        LLM receives: stats + existing body (if any) + capture examples
        LLM produces: prose-only body_md (no numbers — those are in frontmatter)
        """
        try:
            from agents.context import get_assembler  # type: ignore
            ctx = get_assembler().for_refinement(slug, min_verdicts=0)
            prompt = _build_wiki_prompt(slug, frontmatter, ctx, existing_body)
            return _call_llm(prompt)
        except Exception as exc:
            log.warning("wiki: LLM synthesis failed for %s: %s", slug, exc)
            # Return existing body unchanged on LLM failure (no corruption)
            return existing_body or f"## {slug}\n\n(Wiki page pending — awaiting sufficient data)"


# ── LLM call ──────────────────────────────────────────────────────────────

def _call_llm(prompt: str) -> str:
    """Call configured LLM model. Returns body_md string."""
    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("LLM_API_KEY")
    if not api_key:
        log.warning("wiki: no LLM API key configured — skipping body synthesis")
        return ""

    try:
        import anthropic  # type: ignore
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=_WIKI_LLM_MODEL,
            max_tokens=_MAX_BODY_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
    except Exception as exc:
        log.error("wiki: LLM call failed: %s", exc)
        raise


# ── Helpers ────────────────────────────────────────────────────────────────

def _build_wiki_prompt(
    slug: str,
    frontmatter: dict[str, Any],
    ctx: Any,
    existing_body: str,
) -> str:
    """Build LLM prompt for wiki body synthesis.

    LLM is instructed to write prose only — no numbers (those are in frontmatter).
    """
    stats_lines = "\n".join(f"  {k}: {v}" for k, v in frontmatter.items())
    existing_section = (
        f"\n\nExisting page body (update/improve if needed):\n{existing_body}"
        if existing_body
        else ""
    )
    pattern_section = ctx.pattern_wiki_page if ctx.pattern_wiki_page else ""

    return f"""You are maintaining a trading pattern wiki page.

Pattern slug: {slug}
Performance stats (DO NOT repeat these numbers in your output — they are already in frontmatter):
{stats_lines}

{pattern_section}
{existing_section}

Write a concise wiki page body (prose only, max 600 words):
1. ## Overview — 2-3 sentences describing what this pattern represents
2. ## When It Works — key market conditions for high win-rate
3. ## When It Fails — common failure modes
4. ## Key Signals — bulleted list of the 3-5 most important signals to watch
5. ## Notes — any other observations from recent outcomes

Rules:
- Prose and bullet points only — no statistics tables (stats are in frontmatter)
- Be specific and actionable, not generic
- Base observations on the outcome history and verdict patterns
- Keep total length under 600 words"""


def _render_wiki_page(frontmatter: dict[str, Any], body_md: str) -> str:
    """Render complete wiki page: YAML frontmatter + body_md."""
    fm_lines = ["---"]
    for k, v in frontmatter.items():
        if isinstance(v, str):
            fm_lines.append(f"{k}: {v}")
        elif isinstance(v, float):
            fm_lines.append(f"{k}: {v}")
        elif isinstance(v, int):
            fm_lines.append(f"{k}: {v}")
        else:
            fm_lines.append(f"{k}: {v!r}")
    fm_lines.append("---")
    return "\n".join(fm_lines) + "\n\n" + (body_md or "")


def _extract_body_md(page_text: str) -> str:
    """Extract body_md from a wiki page (everything after the frontmatter block)."""
    if not page_text.startswith("---"):
        return page_text
    # Find second --- marker
    second = page_text.find("\n---\n", 3)
    if second == -1:
        return page_text
    return page_text[second + 5:].strip()


def _atomic_write(path: Path, content: str) -> None:
    """Write content atomically using temp file + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(content, encoding="utf-8")
        tmp.rename(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


# ── Module-level singleton ─────────────────────────────────────────────────

_agent: WikiIngestAgent | None = None


def get_wiki_agent() -> WikiIngestAgent:
    global _agent
    if _agent is None:
        _agent = WikiIngestAgent()
    return _agent
