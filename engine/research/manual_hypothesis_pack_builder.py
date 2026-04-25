"""Build replay benchmark-pack drafts from manual hypothesis captures."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import re

from capture.types import CaptureRecord
from patterns.library import get_pattern
from research.pattern_search import BenchmarkCase, ReplayBenchmarkPack


class ManualHypothesisBenchmarkPackError(ValueError):
    """Raised when a capture cannot be converted into a benchmark pack draft."""


_TIMEFRAME_FAMILY_BY_REFERENCE = {
    "5m": ["5m", "15m", "1h"],
    "15m": ["15m", "30m", "1h", "4h"],
    "30m": ["15m", "30m", "1h", "4h"],
    "1h": ["15m", "1h", "4h"],
    "4h": ["1h", "4h"],
    "1d": ["4h", "1d"],
}


def build_manual_hypothesis_benchmark_pack_draft(capture: CaptureRecord) -> ReplayBenchmarkPack:
    if capture.capture_kind != "manual_hypothesis":
        raise ManualHypothesisBenchmarkPackError(
            "benchmark pack draft generation requires a manual_hypothesis capture"
        )
    if not capture.pattern_slug:
        raise ManualHypothesisBenchmarkPackError(
            "benchmark pack draft generation requires capture.pattern_slug"
        )

    research_context = capture.research_context or {}
    if not research_context:
        raise ManualHypothesisBenchmarkPackError(
            "benchmark pack draft generation requires research_context"
        )

    phase_path = _derive_phase_path(capture, research_context)
    start_at, end_at = _derive_range_bounds(capture, research_context)
    reference_timeframe = _derive_reference_timeframe(capture, research_context)
    candidate_timeframes = _derive_candidate_timeframes(reference_timeframe, research_context)
    notes = _derive_notes(capture, research_context)

    case = BenchmarkCase(
        symbol=capture.symbol,
        timeframe=reference_timeframe,
        start_at=start_at,
        end_at=end_at,
        expected_phase_path=phase_path,
        role="reference",
        notes=notes,
        case_id=capture.capture_id,
    )
    return ReplayBenchmarkPack(
        benchmark_pack_id=f"{capture.pattern_slug}__capture-{capture.capture_id}",
        pattern_slug=capture.pattern_slug,
        candidate_timeframes=candidate_timeframes,
        cases=[case],
    )


def _derive_phase_path(
    capture: CaptureRecord,
    research_context: dict[str, Any],
) -> list[str]:
    raw_annotations = research_context.get("phase_annotations")
    pattern_draft = research_context.get("pattern_draft")
    annotations = raw_annotations if isinstance(raw_annotations, list) else []
    ordered_annotations = annotations
    if annotations and all(
        isinstance(annotation, dict) and isinstance(annotation.get("start_ts"), int)
        for annotation in annotations
    ):
        ordered_annotations = sorted(
            annotations,
            key=lambda annotation: int(annotation["start_ts"]),
        )

    raw_phase_ids = [
        annotation.get("phase_id")
        for annotation in ordered_annotations
        if isinstance(annotation, dict) and isinstance(annotation.get("phase_id"), str)
    ]
    if not raw_phase_ids and isinstance(pattern_draft, dict):
        draft_phases = pattern_draft.get("phases")
        if isinstance(draft_phases, list):
            ordered_draft_phases = sorted(
                [
                    phase
                    for phase in draft_phases
                    if isinstance(phase, dict) and isinstance(phase.get("phase_id"), str)
                ],
                key=lambda phase: int(phase.get("sequence_order", 0)),
            )
            raw_phase_ids = [str(phase["phase_id"]) for phase in ordered_draft_phases]
    if not raw_phase_ids and capture.phase:
        raw_phase_ids = [capture.phase]
    if not raw_phase_ids:
        raise ManualHypothesisBenchmarkPackError(
            "benchmark pack draft generation requires at least one annotated phase"
        )

    try:
        allowed_phase_ids = [phase.phase_id for phase in get_pattern(capture.pattern_slug).phases]
    except KeyError:
        allowed_phase_ids = []

    canonical_path = [_canonical_phase_id(phase_id, allowed_phase_ids) for phase_id in raw_phase_ids]
    deduped_path: list[str] = []
    for phase_id in canonical_path:
        if phase_id and phase_id not in deduped_path:
            deduped_path.append(phase_id)
    if not deduped_path:
        raise ManualHypothesisBenchmarkPackError(
            "benchmark pack draft generation produced an empty phase path"
        )
    return deduped_path


def _derive_range_bounds(
    capture: CaptureRecord,
    research_context: dict[str, Any],
) -> tuple[datetime, datetime]:
    raw_annotations = research_context.get("phase_annotations")
    annotations = raw_annotations if isinstance(raw_annotations, list) else []
    start_values = [
        annotation.get("start_ts")
        for annotation in annotations
        if isinstance(annotation, dict) and isinstance(annotation.get("start_ts"), int)
    ]
    end_values = [
        annotation.get("end_ts")
        for annotation in annotations
        if isinstance(annotation, dict) and isinstance(annotation.get("end_ts"), int)
    ]
    if start_values and end_values:
        start_at = _epoch_to_datetime(min(start_values))
        end_at = _epoch_to_datetime(max(end_values))
    else:
        viewport = _extract_viewport(capture.chart_context)
        if viewport is None:
            raise ManualHypothesisBenchmarkPackError(
                "benchmark pack draft generation requires phase timestamps or viewport bounds"
            )
        start_at = _epoch_to_datetime(viewport["timeFrom"])
        end_at = _epoch_to_datetime(viewport["timeTo"])

    if end_at <= start_at:
        raise ManualHypothesisBenchmarkPackError(
            "benchmark pack draft generation requires end_at > start_at"
        )
    return start_at, end_at


def _derive_reference_timeframe(
    capture: CaptureRecord,
    research_context: dict[str, Any],
) -> str:
    raw_annotations = research_context.get("phase_annotations")
    pattern_draft = research_context.get("pattern_draft")
    annotations = raw_annotations if isinstance(raw_annotations, list) else []
    annotation_timeframes = [
        annotation.get("timeframe")
        for annotation in annotations
        if isinstance(annotation, dict) and isinstance(annotation.get("timeframe"), str)
    ]
    if annotation_timeframes:
        return annotation_timeframes[0]
    if isinstance(pattern_draft, dict) and isinstance(pattern_draft.get("timeframe"), str):
        return str(pattern_draft["timeframe"])
    if capture.timeframe:
        return capture.timeframe
    raise ManualHypothesisBenchmarkPackError(
        "benchmark pack draft generation requires a capture timeframe"
    )


def _derive_candidate_timeframes(
    reference_timeframe: str,
    research_context: dict[str, Any],
) -> list[str]:
    raw_annotations = research_context.get("phase_annotations")
    pattern_draft = research_context.get("pattern_draft")
    annotations = raw_annotations if isinstance(raw_annotations, list) else []
    annotation_timeframes = [
        annotation.get("timeframe")
        for annotation in annotations
        if isinstance(annotation, dict) and isinstance(annotation.get("timeframe"), str)
    ]
    draft_timeframes: list[str] = []
    if isinstance(pattern_draft, dict):
        search_hints = pattern_draft.get("search_hints")
        if isinstance(search_hints, dict):
            draft_timeframes = [
                str(timeframe)
                for timeframe in (search_hints.get("preferred_timeframes") or [])
                if isinstance(timeframe, str)
            ]
    family = _TIMEFRAME_FAMILY_BY_REFERENCE.get(reference_timeframe, [reference_timeframe])
    ordered = [reference_timeframe, *annotation_timeframes, *draft_timeframes, *family]
    deduped: list[str] = []
    for timeframe in ordered:
        if timeframe and timeframe not in deduped:
            deduped.append(timeframe)
    return deduped


def _derive_notes(
    capture: CaptureRecord,
    research_context: dict[str, Any],
) -> list[str]:
    notes = [f"source_capture_id={capture.capture_id}"]
    pattern_draft = research_context.get("pattern_draft")
    source = research_context.get("source")
    if isinstance(source, dict) and isinstance(source.get("kind"), str):
        notes.append(f"source_kind={source['kind']}")
    if capture.user_note:
        notes.append(capture.user_note)
    research_tags = research_context.get("research_tags")
    if isinstance(research_tags, list) and research_tags:
        notes.append(
            "research_tags=" + ",".join(str(tag) for tag in research_tags if isinstance(tag, str))
        )
    thesis = research_context.get("thesis")
    if isinstance(thesis, list):
        for item in thesis[:3]:
            if isinstance(item, str) and item:
                notes.append(f"thesis={item}")
    if isinstance(pattern_draft, dict):
        source_text = pattern_draft.get("source_text")
        if isinstance(source_text, str) and source_text:
            notes.append(f"draft_source={source_text}")
        draft_thesis = pattern_draft.get("thesis")
        if isinstance(draft_thesis, list):
            for item in draft_thesis[:3]:
                if isinstance(item, str) and item:
                    notes.append(f"draft_thesis={item}")
    return notes


def _canonical_phase_id(raw_phase_id: str, allowed_phase_ids: list[str]) -> str:
    normalized = _normalize_token(raw_phase_id)
    if not allowed_phase_ids:
        return normalized

    direct_matches = [
        phase_id for phase_id in allowed_phase_ids if _normalize_token(phase_id) == normalized
    ]
    if direct_matches:
        return direct_matches[0]

    prefix_matches = [
        phase_id
        for phase_id in allowed_phase_ids
        if normalized.startswith(_normalize_token(phase_id))
        or _normalize_token(phase_id).startswith(normalized)
    ]
    if len(prefix_matches) == 1:
        return prefix_matches[0]
    return normalized


def _normalize_token(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def _extract_viewport(chart_context: dict[str, Any]) -> dict[str, int] | None:
    snapshot = chart_context.get("snapshot")
    if not isinstance(snapshot, dict):
        return None
    viewport = snapshot.get("viewport")
    if not isinstance(viewport, dict):
        return None
    time_from = viewport.get("timeFrom")
    time_to = viewport.get("timeTo")
    if not isinstance(time_from, (int, float)) or not isinstance(time_to, (int, float)):
        return None
    return {"timeFrom": int(time_from), "timeTo": int(time_to)}


def _epoch_to_datetime(value: int | float) -> datetime:
    seconds = float(value)
    if seconds >= 10_000_000_000:
        seconds /= 1000.0
    return datetime.fromtimestamp(seconds, tz=timezone.utc)
