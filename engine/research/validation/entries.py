"""W-0290 Phase 1 — Phase entry event 추출.

현재 구현은 BenchmarkCase.start_at fallback을 사용한다 (use_ledger=False).
use_ledger=True는 Phase 2에서 ledger 데이터가 충분해지면 활성화.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


@dataclass
class PhaseEntryEvent:
    """단일 phase entry event.

    Attributes:
        id: 고유 ID
        pattern_slug: 패턴 식별자
        pattern_version: 패턴 버전
        symbol: 마켓 심볼 (예: "BTCUSDT")
        timeframe: 봉 타임프레임 (예: "4h")
        taxonomy_id: 페이즈 택소노미
        phase_name: 진입한 페이즈 이름
        phase_index: 페이즈 인덱스
        entered_at: 페이즈 전환 시각 (UTC)
        entry_price: 실행 가능 진입가 (진입 봉 이후 다음 봉 시가 사용)
        side: 롱/숏
        source: "ledger" | "benchmark_proxy" — 데이터 출처 표기
        feature_snapshot: 진입 시점 feature
        regime_label: 진입 시점 레짐 (없으면 None)
    """
    id: str
    pattern_slug: str
    pattern_version: str
    symbol: str
    timeframe: str
    taxonomy_id: str
    phase_name: str
    phase_index: int
    entered_at: datetime
    entry_price: float
    side: Literal["long", "short"]
    source: Literal["ledger", "benchmark_proxy"]
    feature_snapshot: dict = field(default_factory=dict)
    regime_label: str | None = None


def extract_phase_entries_from_benchmark(
    benchmark_cases: list,
    pattern_slug: str,
    pattern_version: str = "unknown",
    timeframe: str = "4h",
) -> list[PhaseEntryEvent]:
    """BenchmarkCase 리스트에서 PhaseEntryEvent 추출 (fallback 구현).

    실제 phase transition이 아닌 BenchmarkCase.start_at을 사용하는 임시 구현.
    W-0290 Phase 2에서 ledger 기반으로 교체 예정.
    """
    events: list[PhaseEntryEvent] = []
    for i, case in enumerate(benchmark_cases):
        entered_at = getattr(case, "start_at", None) or getattr(case, "timestamp", None)
        if entered_at is None:
            logger.warning("BenchmarkCase %d has no start_at/timestamp, skipping", i)
            continue

        symbol = getattr(case, "symbol", "UNKNOWN")
        entry_price = getattr(case, "entry_price", None) or getattr(case, "price", 0.0)
        side = getattr(case, "side", "long")
        taxonomy_id = getattr(case, "taxonomy_id", "unknown")
        phase_name = getattr(case, "phase_name", "entry")
        phase_index = getattr(case, "phase_index", 0)
        feature_snapshot = getattr(case, "feature_snapshot", {}) or {}
        regime_label = getattr(case, "regime_label", None)

        events.append(PhaseEntryEvent(
            id=f"{pattern_slug}_{symbol}_{i}",
            pattern_slug=pattern_slug,
            pattern_version=pattern_version,
            symbol=symbol,
            timeframe=timeframe,
            taxonomy_id=taxonomy_id,
            phase_name=phase_name,
            phase_index=phase_index,
            entered_at=entered_at,
            entry_price=float(entry_price) if entry_price else 0.0,
            side=side if side in ("long", "short") else "long",
            source="benchmark_proxy",
            feature_snapshot=dict(feature_snapshot) if feature_snapshot else {},
            regime_label=regime_label,
        ))

    logger.info("Extracted %d phase entries from benchmark_cases (proxy mode)", len(events))
    return events


def extract_phase_entries(
    benchmark_cases: list,
    pattern_slug: str,
    pattern_version: str = "unknown",
    timeframe: str = "4h",
    use_ledger: bool = False,
) -> list[PhaseEntryEvent]:
    """Phase entry 추출 진입점.

    Args:
        use_ledger: True이면 ledger에서 실제 phase transition 추출 (Phase 2+).
                    False이면 benchmark_cases fallback 사용.
    """
    if use_ledger:
        logger.warning(
            "use_ledger=True requested but not yet implemented (W-0290 Phase 2). "
            "Falling back to benchmark_proxy."
        )
    return extract_phase_entries_from_benchmark(
        benchmark_cases=benchmark_cases,
        pattern_slug=pattern_slug,
        pattern_version=pattern_version,
        timeframe=timeframe,
    )
