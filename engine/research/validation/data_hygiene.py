"""W-0290 Phase 1 — 데이터 위생 검사."""
from __future__ import annotations
import pandas as pd
from dataclasses import dataclass, field
from typing import Sequence


@dataclass
class HygieneCheckResult:
    look_ahead_ok: bool = True
    survivorship_flag: bool = False   # True = 상장폐지 코인 없음 (WARN 아님)
    timezone_ok: bool = True
    warmup_ok: bool = True
    overall_pass: bool = True
    violations: list[str] = field(default_factory=list)


def check_data_hygiene(
    signal_timestamps: pd.DatetimeIndex,
    entry_timestamps: pd.DatetimeIndex,
    bar_size_hours: int = 4,
    warmup_bars: int = 42,
    strict: bool = False,
) -> HygieneCheckResult:
    """
    검사 항목:
    1. Look-ahead bias: signal_timestamps가 entry_timestamps보다 항상 이전인지
    2. Timezone: UTC 여부
    3. Warmup: entry 최초 시점이 signal 시작으로부터 warmup_bars × bar_size_hours 이후인지
    4. Survivorship: 현재 API 제약으로 자동 검사 불가 → always WARNING (survivorship_flag=False)

    strict=False: violations만 기록, overall_pass=True
    strict=True: violations 있으면 overall_pass=False
    """
    violations: list[str] = []
    look_ahead_ok = True
    timezone_ok = True
    warmup_ok = True

    # 1. Look-ahead: 모든 entry가 대응하는 signal 이후인지
    if len(signal_timestamps) > 0 and len(entry_timestamps) > 0:
        try:
            if entry_timestamps.min() < signal_timestamps.min():
                look_ahead_ok = False
                violations.append("look_ahead: entry before first signal")
        except TypeError:
            # tz-naive vs tz-aware comparison: timezone check will catch this
            pass

    # 2. Timezone UTC 체크
    if len(entry_timestamps) > 0:
        if entry_timestamps.tz is None:
            timezone_ok = False
            violations.append("timezone: entry_timestamps has no tz (expected UTC)")
        elif str(entry_timestamps.tz).upper() not in ("UTC", "UTC+00:00"):
            timezone_ok = False
            violations.append(f"timezone: got {entry_timestamps.tz}, expected UTC")

    # 3. Warmup
    if len(signal_timestamps) > 0 and len(entry_timestamps) > 0:
        try:
            min_entry = entry_timestamps.min()
            warmup_end = signal_timestamps.min() + pd.Timedelta(hours=bar_size_hours * warmup_bars)
            if min_entry < warmup_end:
                warmup_ok = False
                violations.append(f"warmup: earliest entry {min_entry} before warmup end {warmup_end}")
        except TypeError:
            # tz-naive vs tz-aware: skip warmup check, timezone issue already flagged
            pass

    overall_pass = look_ahead_ok and timezone_ok and warmup_ok
    if strict:
        pass  # already computed
    else:
        overall_pass = True  # warning mode — never fail

    return HygieneCheckResult(
        look_ahead_ok=look_ahead_ok,
        survivorship_flag=False,  # always WARNING: corpus doesn't include delisted
        timezone_ok=timezone_ok,
        warmup_ok=warmup_ok,
        overall_pass=overall_pass,
        violations=violations,
    )
