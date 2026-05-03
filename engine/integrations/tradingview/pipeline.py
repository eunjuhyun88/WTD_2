"""W-0393: TradingView import pipeline — URL → TVImportDraft (all tiers).

Orchestrates: fetch → cascade(pine→text→vision) → compile → estimate.
"""
from __future__ import annotations

import logging

from .fetch import fetch_chart_meta
from .models import TVImportDraft, VisionPatternSpec, VisibleAtom
from .pine_parser import is_pine_script, parse_pine
from .text_parser import parse_text
from .vision_parser import parse_vision
from .compiler import compile_hypothesis
from .estimate import estimate_variant

log = logging.getLogger("engine.integrations.tv.pipeline")


def process_url(url: str) -> TVImportDraft:
    """Full pipeline: URL → TVImportDraft with vision_spec + compiler_spec + diagnostics."""
    meta = fetch_chart_meta(url)    # raises ValueError on bad URL

    atoms: list[VisibleAtom] = []
    direction: str | None = None
    family = "unknown"
    parser_tier = "vision"
    confidence = 0.0

    # ── Tier 1: Pine Script ──────────────────────────────────────────────────
    desc = meta.description or ""
    if is_pine_script(desc):
        pine_atoms, pine_dir, pine_family = parse_pine(desc)
        if pine_atoms:
            atoms, direction, family = pine_atoms, pine_dir, pine_family
            parser_tier = "pine"
            confidence = 0.85
            log.debug("Tier 1 (Pine): %d atoms", len(atoms))

    # ── Tier 2: Text LLM ─────────────────────────────────────────────────────
    if not atoms and (meta.title or meta.description):
        t_atoms, t_dir, t_family, t_conf = parse_text(meta.title, meta.description)
        if t_conf >= 0.3 and t_atoms:
            atoms, direction, family = t_atoms, t_dir, t_family
            parser_tier = "text"
            confidence = t_conf
            log.debug("Tier 2 (text): %d atoms, conf=%.2f", len(atoms), t_conf)

    # ── Tier 3: Vision ───────────────────────────────────────────────────────
    if not atoms and meta.snapshot_bytes:
        vspec_raw = parse_vision(meta.snapshot_bytes)
        atoms = list(vspec_raw.visible_atoms)
        direction = vspec_raw.direction
        family = vspec_raw.pattern_family
        parser_tier = "vision"
        confidence = vspec_raw.confidence
        log.debug("Tier 3 (vision): %d atoms, conf=%.2f", len(atoms), confidence)

    vision_spec = VisionPatternSpec(
        direction=direction,
        pattern_family=family,
        visible_indicators=[],
        visible_annotations=[],
        support_resistance_notes=[],
        visible_atoms=atoms,
        confidence=confidence,
        evidence=[],
        parser_tier=parser_tier,
    )

    compiler_spec = compile_hypothesis(vision_spec, meta.chart_id)
    diagnostics = estimate_variant(compiler_spec, "base")

    draft = TVImportDraft(
        source_url=url,
        chart_id=meta.chart_id,
        source_type=meta.source_type,
        parser_tier=parser_tier,
        symbol=meta.symbol,
        exchange=meta.exchange,
        timeframe_raw=meta.timeframe_raw,
        timeframe_engine=meta.timeframe_engine,
        title=meta.title,
        description=meta.description,
        author_username=meta.author_username,
        author_display_name=meta.author_display_name,
        snapshot_url=meta.snapshot_url,
        vision_spec=vision_spec,
        compiler_spec=compiler_spec,
        diagnostics=diagnostics,
        status="draft",
    )
    return draft
