"""Build replay benchmark-pack drafts directly from manual-hypothesis captures."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from capture.store import CaptureStore
from capture.types import CaptureRecord
from data_cache.resample import tf_string_to_minutes
from patterns.library import get_pattern
from research.pattern_search import (
    BenchmarkCase,
    BenchmarkPackStore,
    NegativeSearchMemoryStore,
    PatternBenchmarkSearchConfig,
    PatternSearchArtifactStore,
    ReplayBenchmarkPack,
    pattern_benchmark_search_payload,
    run_pattern_benchmark_search,
)
from research.state_store import ResearchRun

_TIMEFRAME_ORDER = ["5m", "15m", "30m", "1h", "4h", "1d"]
_DEFAULT_LOOKBACK_BARS = 48
_DEFAULT_FORWARD_BARS = 24


def _utc_from_ms(value: int) -> datetime:
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


def _dedupe_in_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        ordered.append(value)
        seen.add(value)
    return ordered


def _sort_timeframes(values: list[str]) -> list[str]:
    ordered = _dedupe_in_order(values)
    rank = {timeframe: idx for idx, timeframe in enumerate(_TIMEFRAME_ORDER)}
    return sorted(ordered, key=lambda timeframe: (rank.get(timeframe, len(rank)), timeframe))


def _research_context(capture: CaptureRecord) -> dict:
    data = capture.research_context if capture.research_context is not None else {}
    return data if isinstance(data, dict) else {}


def _pattern_family_key(capture: CaptureRecord, *, pattern_slug: str) -> str:
    research_context = _research_context(capture)
    family = research_context.get("pattern_family")
    if isinstance(family, str) and family:
        return family
    return pattern_slug


def _expected_phase_path(capture: CaptureRecord, *, pattern_slug: str) -> list[str]:
    research_context = _research_context(capture)
    annotations = research_context.get("phase_annotations")
    if isinstance(annotations, list) and annotations:
        phase_ids = [
            annotation.get("phase_id")
            for annotation in annotations
            if isinstance(annotation, dict) and isinstance(annotation.get("phase_id"), str)
        ]
        phase_ids = _dedupe_in_order([phase_id for phase_id in phase_ids if phase_id])
        if phase_ids:
            return phase_ids
    pattern = get_pattern(pattern_slug)
    return [phase.phase_id for phase in pattern.phases]


def _capture_candidate_timeframes(
    capture: CaptureRecord,
    *,
    sibling_captures: list[CaptureRecord],
    explicit: list[str] | None = None,
) -> list[str]:
    if explicit:
        return _sort_timeframes(list(explicit))

    research_context = _research_context(capture)
    annotations = research_context.get("phase_annotations")
    derived = [capture.timeframe]
    if isinstance(annotations, list):
        for annotation in annotations:
            if not isinstance(annotation, dict):
                continue
            timeframe = annotation.get("timeframe")
            if isinstance(timeframe, str) and timeframe:
                derived.append(timeframe)
    for sibling in sibling_captures:
        if sibling.timeframe:
            derived.append(sibling.timeframe)
    return _sort_timeframes(derived or ["1h"])


def _window_from_research_context(capture: CaptureRecord) -> tuple[datetime, datetime] | None:
    research_context = _research_context(capture)
    annotations = research_context.get("phase_annotations")
    if not isinstance(annotations, list) or not annotations:
        return None

    starts: list[int] = []
    ends: list[int] = []
    for annotation in annotations:
        if not isinstance(annotation, dict):
            continue
        start_ts = annotation.get("start_ts")
        end_ts = annotation.get("end_ts")
        if isinstance(start_ts, int):
            starts.append(start_ts)
        if isinstance(end_ts, int):
            ends.append(end_ts)
    if starts and ends:
        return _utc_from_ms(min(starts)), _utc_from_ms(max(ends))
    return None


def _window_from_chart_context(capture: CaptureRecord) -> tuple[datetime, datetime] | None:
    chart_context = capture.chart_context if isinstance(capture.chart_context, dict) else {}
    snapshot = chart_context.get("snapshot")
    if not isinstance(snapshot, dict):
        return None
    viewport = snapshot.get("viewport")
    if not isinstance(viewport, dict):
        return None
    time_from = viewport.get("timeFrom")
    time_to = viewport.get("timeTo")
    if isinstance(time_from, (int, float)) and isinstance(time_to, (int, float)):
        return (
            datetime.fromtimestamp(float(time_from), tz=timezone.utc),
            datetime.fromtimestamp(float(time_to), tz=timezone.utc),
        )
    return None


def _fallback_window(capture: CaptureRecord) -> tuple[datetime, datetime]:
    timeframe_minutes = tf_string_to_minutes(capture.timeframe or "1h")
    anchor = _utc_from_ms(capture.captured_at_ms)
    start_at = anchor - timedelta(minutes=timeframe_minutes * _DEFAULT_LOOKBACK_BARS)
    end_at = anchor + timedelta(minutes=timeframe_minutes * _DEFAULT_FORWARD_BARS)
    return start_at, end_at


def _capture_window(capture: CaptureRecord) -> tuple[datetime, datetime]:
    for resolver in (_window_from_research_context, _window_from_chart_context):
        resolved = resolver(capture)
        if resolved is not None:
            return resolved
    return _fallback_window(capture)


def _capture_notes(capture: CaptureRecord, *, family_key: str) -> list[str]:
    notes = [f"capture_id={capture.capture_id}", f"family={family_key}"]
    if capture.user_note:
        notes.append(capture.user_note)
    if capture.phase:
        notes.append(f"phase={capture.phase}")
    return notes


def _matching_siblings(
    source_capture: CaptureRecord,
    *,
    capture_store: CaptureStore,
    pattern_slug: str,
    family_key: str,
    max_holdouts: int,
) -> list[CaptureRecord]:
    candidates = capture_store.list(user_id=source_capture.user_id, limit=500)
    filtered: list[CaptureRecord] = []
    for capture in candidates:
        if capture.capture_id == source_capture.capture_id:
            continue
        if capture.capture_kind != "manual_hypothesis":
            continue
        sibling_family = _pattern_family_key(capture, pattern_slug=pattern_slug)
        if sibling_family != family_key and capture.pattern_slug != pattern_slug:
            continue
        filtered.append(capture)

    filtered.sort(
        key=lambda capture: (
            capture.symbol == source_capture.symbol,
            abs(capture.captured_at_ms - source_capture.captured_at_ms),
        )
    )
    return filtered[: max(0, max_holdouts)]


@dataclass(frozen=True)
class CaptureBenchmarkDraft:
    source_capture_id: str
    sibling_capture_ids: list[str]
    family_key: str
    pack: ReplayBenchmarkPack

    def to_dict(self) -> dict:
        return {
            "source_capture_id": self.source_capture_id,
            "sibling_capture_ids": list(self.sibling_capture_ids),
            "family_key": self.family_key,
            "pack": self.pack.to_dict(),
        }


@dataclass(frozen=True)
class CaptureBenchmarkSearchDraft:
    benchmark_draft: CaptureBenchmarkDraft
    search_run: dict

    def to_dict(self) -> dict:
        return {
            "benchmark_draft": self.benchmark_draft.to_dict(),
            "search_run": dict(self.search_run),
        }


def build_benchmark_pack_from_capture(
    *,
    capture_id: str,
    pattern_slug: str | None = None,
    candidate_timeframes: list[str] | None = None,
    max_holdouts: int = 4,
    capture_store: CaptureStore | None = None,
    pack_store: BenchmarkPackStore | None = None,
) -> CaptureBenchmarkDraft:
    capture_store = capture_store or CaptureStore()
    pack_store = pack_store or BenchmarkPackStore()

    source_capture = capture_store.load(capture_id)
    if source_capture is None:
        raise ValueError(f"Unknown capture_id: {capture_id}")
    if source_capture.capture_kind != "manual_hypothesis":
        raise ValueError("Only manual_hypothesis captures can seed benchmark packs")

    resolved_pattern_slug = pattern_slug or source_capture.pattern_slug
    if not resolved_pattern_slug:
        raise ValueError("pattern_slug is required when the source capture has no pattern_slug")
    if source_capture.pattern_slug and source_capture.pattern_slug != resolved_pattern_slug:
        raise ValueError("source capture pattern_slug does not match requested pattern_slug")

    family_key = _pattern_family_key(source_capture, pattern_slug=resolved_pattern_slug)
    sibling_captures = _matching_siblings(
        source_capture,
        capture_store=capture_store,
        pattern_slug=resolved_pattern_slug,
        family_key=family_key,
        max_holdouts=max_holdouts,
    )

    cases: list[BenchmarkCase] = []
    source_path = _expected_phase_path(source_capture, pattern_slug=resolved_pattern_slug)
    start_at, end_at = _capture_window(source_capture)
    cases.append(
        BenchmarkCase(
            symbol=source_capture.symbol,
            timeframe=source_capture.timeframe,
            start_at=start_at,
            end_at=end_at,
            expected_phase_path=source_path,
            role="reference",
            notes=_capture_notes(source_capture, family_key=family_key),
        )
    )

    for sibling in sibling_captures:
        sibling_start_at, sibling_end_at = _capture_window(sibling)
        cases.append(
            BenchmarkCase(
                symbol=sibling.symbol,
                timeframe=sibling.timeframe,
                start_at=sibling_start_at,
                end_at=sibling_end_at,
                expected_phase_path=_expected_phase_path(sibling, pattern_slug=resolved_pattern_slug),
                role="holdout",
                notes=_capture_notes(sibling, family_key=family_key),
            )
        )

    pack = ReplayBenchmarkPack(
        benchmark_pack_id=f"{resolved_pattern_slug}__cap-{source_capture.capture_id[:8]}",
        pattern_slug=resolved_pattern_slug,
        candidate_timeframes=_capture_candidate_timeframes(
            source_capture,
            sibling_captures=sibling_captures,
            explicit=candidate_timeframes,
        ),
        cases=cases,
    )
    pack_store.save(pack)

    return CaptureBenchmarkDraft(
        source_capture_id=source_capture.capture_id,
        sibling_capture_ids=[capture.capture_id for capture in sibling_captures],
        family_key=family_key,
        pack=pack,
    )


def build_and_run_benchmark_search_from_capture(
    *,
    capture_id: str,
    pattern_slug: str | None = None,
    candidate_timeframes: list[str] | None = None,
    max_holdouts: int = 4,
    warmup_bars: int = 240,
    min_reference_score: float = 0.55,
    min_holdout_score: float = 0.35,
    capture_store: CaptureStore | None = None,
    pack_store: BenchmarkPackStore | None = None,
    artifact_store: PatternSearchArtifactStore | None = None,
    negative_memory_store: NegativeSearchMemoryStore | None = None,
) -> CaptureBenchmarkSearchDraft:
    pack_store = pack_store or BenchmarkPackStore()
    artifact_store = artifact_store or PatternSearchArtifactStore()
    negative_memory_store = negative_memory_store or NegativeSearchMemoryStore()

    benchmark_draft = build_benchmark_pack_from_capture(
        capture_id=capture_id,
        pattern_slug=pattern_slug,
        candidate_timeframes=candidate_timeframes,
        max_holdouts=max_holdouts,
        capture_store=capture_store,
        pack_store=pack_store,
    )
    run: ResearchRun = run_pattern_benchmark_search(
        PatternBenchmarkSearchConfig(
            pattern_slug=benchmark_draft.pack.pattern_slug,
            benchmark_pack_id=benchmark_draft.pack.benchmark_pack_id,
            warmup_bars=warmup_bars,
            min_reference_score=min_reference_score,
            min_holdout_score=min_holdout_score,
        ),
        pack_store=pack_store,
        artifact_store=artifact_store,
        negative_memory_store=negative_memory_store,
    )
    return CaptureBenchmarkSearchDraft(
        benchmark_draft=benchmark_draft,
        search_run=pattern_benchmark_search_payload(
            run,
            artifact_store=artifact_store,
            negative_memory_store=negative_memory_store,
        ),
    )
