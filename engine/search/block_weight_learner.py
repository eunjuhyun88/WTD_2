"""Search-facing facade for block_weights EWM store."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional

from scoring import block_weights as _bw


class BlockWeightLearner:
    """Facade over block_weights SQLite store for search layer."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self._db = db_path or _bw._DEFAULT_DB

    def update(self, block_name: str, outcome: float) -> None:
        """outcome in [-1, 1], +1=hit, -1=miss, 0=neutral."""
        _bw.update(block_name, outcome, db_path=self._db)

    def update_from_verdict(
        self,
        verdict: str,  # "valid"|"invalid"|"near_miss"|"too_early"|"too_late"
        blocks_triggered: Iterable[str],
        all_blocks: Iterable[str],
    ) -> None:
        outcome_map = {
            "valid": 1.0,
            "invalid": -1.0,
            "near_miss": 0.3,
            "too_early": 0.0,
            "too_late": 0.0,
        }
        outcome = outcome_map.get(verdict, 0.0)
        triggered_set = set(blocks_triggered)
        for block in all_blocks:
            if block in triggered_set:
                _bw.update(block, outcome, db_path=self._db)
            else:
                # unfired blocks get 0 outcome (no update to raw, effectively)
                pass  # skip unfired blocks

    def get_weights(self) -> dict[str, float]:
        return _bw.get_all_weights(db_path=self._db)

    def get_raw(self, block_name: str) -> float:
        return _bw.get_raw(block_name, db_path=self._db)

    def reset(self, block_name: str) -> None:
        _bw.reset_block(block_name, db_path=self._db)

    def reset_all(self) -> None:
        _bw.reset_all(db_path=self._db)

    def n_updates(self, block_name: str) -> int:
        return _bw.get_n_updates(block_name, db_path=self._db)
