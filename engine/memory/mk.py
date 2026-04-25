"""MemKraft singleton — project-wide agent memory.

Usage:
    from memory.mk import mk

    # 작업 시작 전 — 과거 결정/장애 조회 (evidence_first)
    evidence = mk.evidence_first("search corpus upsert")

    # 아키텍처 결정 기록
    mk.decision_record(
        what="SearchCorpusStore upsert를 feature_materialization job에 추가",
        why="15분마다 자동으로 corpus가 채워지도록 하기 위해",
        how="materialize_symbol_window() 끝에 build_corpus_windows() 호출",
        tags="search,corpus,W-0162",
    )

    # PR 머지 / 배포 이벤트 기록
    mk.log_event(
        "PR #276 merged: W-0162 corpus + W-0160 ledger + W-0151 auto-promote + W-0124 JWT RS256",
        tags="pr,merge",
        importance="high",
    )

    # 장애/실패 기록
    mk.incident_record(
        title="CI 실패: feature_materialization import error",
        symptoms=["ImportError: cannot import build_corpus_windows"],
        severity="medium",
    )
"""
from __future__ import annotations

from pathlib import Path

from memkraft import MemKraft

# 프로젝트 루트 / memory/ 고정 — engine/.venv 위치와 무관하게 동작
_MEMORY_DIR = Path(__file__).resolve().parents[2] / "memory"

_instance: MemKraft | None = None


def _get() -> MemKraft:
    global _instance
    if _instance is None:
        _instance = MemKraft(base_dir=str(_MEMORY_DIR))
    return _instance


# 편의 접근자 — `from memory.mk import mk` 후 바로 사용
mk: MemKraft = type(
    "_LazyMK",
    (),
    {
        "__getattr__": staticmethod(lambda name: getattr(_get(), name)),
        "__repr__": staticmethod(lambda: f"<MemKraft lazy @ {_MEMORY_DIR}>"),
    },
)()
