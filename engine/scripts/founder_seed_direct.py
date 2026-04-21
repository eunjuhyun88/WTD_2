#!/usr/bin/env python3
"""
Founder Seed (Direct) — write PatternOutcome ledger records directly to ledger_data/.

Use this when the engine HTTP API is not reachable (e.g. Cloud Run IAM blocks
unauthenticated access from a dev machine).

사용법:
  cd engine
  python scripts/founder_seed_direct.py [--dry-run]

These records land as outcome='pending' so the outcome_resolver will close
them on the next scheduled tick once the evaluation window elapses.
"""
from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

# ---------------------------------------------------------------------------
# Paths — resolve relative to this script so it works from any cwd
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
ENGINE_DIR = SCRIPT_DIR.parent
LEDGER_DIR = ENGINE_DIR / "ledger_data"

Outcome = Literal["success", "failure", "timeout", "pending"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def to_dt(dt_str: str) -> datetime:
    """'YYYY-MM-DD HH:MM' UTC → datetime"""
    return datetime.strptime(dt_str, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)


def make_id() -> str:
    return str(uuid.uuid4())[:8]


def outcome_from_note(note: str) -> Outcome:
    """Heuristic: parse outcome from user_note string."""
    note_up = note.upper()
    if "WIN" in note_up and "LOSS" not in note_up:
        return "success"
    if "LOSS" in note_up:
        return "failure"
    if "TIMEOUT" in note_up or "미기록" in note or "방향 없음" in note:
        return "timeout"
    return "pending"


def gain_from_note(note: str) -> float | None:
    """Extract gain pct from note like '+11.8%' → 11.8 or '-3.2%' → None (loss)."""
    import re
    m = re.search(r'\+(\d+\.?\d*)%', note)
    if m:
        return float(m.group(1))
    return None


def loss_from_note(note: str) -> float | None:
    """Extract loss pct from note like '-3.2%' → -3.2."""
    import re
    m = re.search(r'-(\d+\.?\d*)%', note)
    if m:
        return -float(m.group(1))
    return None


def build_record(r: dict[str, Any]) -> dict:
    """Convert a seed row into a PatternOutcome dict ready for JSON serialisation."""
    captured_at = to_dt(r["captured_at"])
    note = r.get("user_note", "") or ""
    outcome = outcome_from_note(note)

    # Derive gain/loss pcts from note heuristics
    max_gain = gain_from_note(note) if outcome == "success" else None
    exit_return = gain_from_note(note) if outcome == "success" else loss_from_note(note)
    duration = 24.0 if outcome in ("success", "failure") else None

    entry_price = r.get("entry_price")

    # Peak price estimate for wins
    peak_price: float | None = None
    if entry_price and max_gain:
        peak_price = round(entry_price * (1 + max_gain / 100), 6)

    exit_price: float | None = None
    if entry_price and exit_return is not None:
        exit_price = round(entry_price * (1 + exit_return / 100), 6)

    now = datetime.now()

    return {
        "id": make_id(),
        "pattern_slug": r["pattern_slug"],
        "symbol": r["symbol"],
        "user_id": "founder",
        "phase2_at": None,
        "accumulation_at": captured_at.isoformat(),
        "breakout_at": captured_at.isoformat() if outcome == "success" else None,
        "invalidated_at": captured_at.isoformat() if outcome == "failure" else None,
        "phase2_price": None,
        "entry_price": entry_price,
        "peak_price": peak_price,
        "exit_price": exit_price,
        "invalidation_price": None,
        "outcome": outcome,
        "max_gain_pct": max_gain,
        "exit_return_pct": exit_return,
        "duration_hours": duration,
        "btc_trend_at_entry": "unknown",
        "user_verdict": None,
        "user_note": note,
        "feature_snapshot": {},
        "entry_transition_id": None,
        "entry_scan_id": None,
        "entry_block_scores": None,
        "entry_block_coverage": None,
        "entry_p_win": None,
        "entry_ml_state": None,
        "entry_model_key": None,
        "entry_model_version": None,
        "entry_rollout_state": None,
        "entry_threshold": None,
        "entry_threshold_passed": None,
        "entry_ml_error": None,
        "evaluation_window_hours": 72.0,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Seed rows — same 51 cases as founder_seed.py
# ---------------------------------------------------------------------------

ROWS: list[dict[str, Any]] = [
    # ── funding-flip-reversal-v1 (10 cases) ───────────────────────────────────
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-01-13 04:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "역프 케이스: funding 음수전환 후 91K 진입. 결과 96K +5.5% WIN",
        "entry_price": 91000.0,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-03-02 06:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "역프 케이스 2차: BTC funding 음수 → 상승 확인 WIN",
        "entry_price": None,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-03-05 06:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "역프 케이스 3차: 달릴 듯 but 진입 불가. 결과 미기록",
        "entry_price": None,
    },
    {
        "symbol": "KOMAOUSDT",
        "captured_at": "2026-03-23 00:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "KOMA 역프: funding -0.00056 → 진입. 결과 +21.5% WIN. W-0091 벤치마크 케이스",
        "entry_price": None,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2026-01-20 08:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "ETH funding 음수 전환 후 반등. 3100 진입 → 3350 +8.1% WIN",
        "entry_price": 3100.0,
    },
    {
        "symbol": "SOLUSDT",
        "captured_at": "2026-02-05 14:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "SOL funding flip: -0.0012 → 진입. 결과 +15.3% WIN",
        "entry_price": 185.0,
    },
    {
        "symbol": "BNBUSDT",
        "captured_at": "2026-02-18 10:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "BNB 역프 후 진입. 결과 LOSS -3.2%",
        "entry_price": 420.0,
    },
    {
        "symbol": "AVAXUSDT",
        "captured_at": "2026-03-10 06:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "AVAX funding 음수 전환 신호. 진입 36.5. 결과 +11.8% WIN",
        "entry_price": 36.5,
    },
    {
        "symbol": "LINKUSDT",
        "captured_at": "2026-03-15 00:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "LINK 역프 케이스. 진입 17.2. 결과 timeout — 방향 없음",
        "entry_price": 17.2,
    },
    {
        "symbol": "DOTUSDT",
        "captured_at": "2026-03-28 12:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "DOT funding flip 신호 확인. 결과 +6.5% WIN",
        "entry_price": 8.4,
    },

    # ── whale-accumulation-reversal-v1 (10 cases) ─────────────────────────────
    {
        "symbol": "PUFFERUSDT",
        "captured_at": "2026-04-04 12:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "PUFFER 숏스퀴즈 발동 케이스. Apr 4 진입 확인",
        "entry_price": None,
    },
    {
        "symbol": "ETCUSDT",
        "captured_at": "2026-04-08 10:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "ETC 횡보 끝 상방 기대. 숏스퀴즈 진입 Apr 8",
        "entry_price": None,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-10-15 04:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "BTC 고래 축적 신호. OI 상승+스팟 매수. 결과 +18% WIN",
        "entry_price": 62000.0,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2025-11-20 10:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "ETH 고래 축적 후 반등. 2400 → 2800 WIN",
        "entry_price": 2400.0,
    },
    {
        "symbol": "SOLUSDT",
        "captured_at": "2025-12-05 06:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "SOL 고래 매집 확인. 결과 LOSS 지지 실패",
        "entry_price": 210.0,
    },
    {
        "symbol": "OPUSDT",
        "captured_at": "2026-01-08 14:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "OP 고래 매집 패턴. 진입 2.1. 결과 +22% WIN",
        "entry_price": 2.1,
    },
    {
        "symbol": "ARBUSDT",
        "captured_at": "2026-01-25 08:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "ARB 횡보 중 고래 매집 확인. 결과 timeout",
        "entry_price": 1.15,
    },
    {
        "symbol": "NEARUSDT",
        "captured_at": "2026-02-10 00:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "NEAR 고래 OI+스팟 누적. 결과 +12% WIN",
        "entry_price": 4.2,
    },
    {
        "symbol": "APTUSDT",
        "captured_at": "2026-02-20 06:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "APT 급락 후 축적 패턴. 결과 LOSS",
        "entry_price": 9.8,
    },
    {
        "symbol": "INJUSDT",
        "captured_at": "2026-03-12 10:00",
        "pattern_slug": "whale-accumulation-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "INJ 고래 매집 → 상승. 결과 +28% WIN",
        "entry_price": 24.0,
    },

    # ── tradoor-oi-reversal-v1 (10 cases) ─────────────────────────────────────
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-11-01 00:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "TRADOOR/PTB OI 반전 레퍼런스. 급락+OI급등 2차 후 축적구간 진입. 코어루프 설계 기반 케이스",
        "entry_price": None,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-12-10 00:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "TRADOOR 2차 레퍼런스. REAL_DUMP 후 펀딩 양전환 진입",
        "entry_price": None,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2025-10-20 00:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "FAKE_DUMP",
        "user_note": "ETH FAKE_DUMP: OI 급등 후 가격 회복. 결과 WIN",
        "entry_price": 2600.0,
    },
    {
        "symbol": "SOLUSDT",
        "captured_at": "2025-11-15 06:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "SOL OI 반전 축적 구간. 결과 +20% WIN",
        "entry_price": 195.0,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-01-05 12:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ARCH_ZONE",
        "user_note": "BTC ARCH_ZONE 확인. 고OI + 가격 압축. 결과 LOSS",
        "entry_price": 97000.0,
    },
    {
        "symbol": "XRPUSDT",
        "captured_at": "2026-01-18 08:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "XRP OI 반전 신호 후 축적. 결과 +14% WIN",
        "entry_price": 2.4,
    },
    {
        "symbol": "BNBUSDT",
        "captured_at": "2026-02-08 10:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "REAL_DUMP",
        "user_note": "BNB REAL_DUMP 확인 후 반전 진입. 결과 timeout",
        "entry_price": 380.0,
    },
    {
        "symbol": "LTCUSDT",
        "captured_at": "2026-02-25 14:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "LTC OI 급등 후 가격 회복 진입. 결과 WIN +9%",
        "entry_price": 115.0,
    },
    {
        "symbol": "ADAUSDT",
        "captured_at": "2026-03-18 08:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "ADA OI 반전 후 축적. 결과 LOSS 지지 실패",
        "entry_price": 0.78,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-04-01 00:00",
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "BTC Apr 초 OI 반전 케이스. 결과 WIN +7%",
        "entry_price": 83000.0,
    },

    # ── liquidity-sweep-reversal-v1 (10 cases) ────────────────────────────────
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-09-10 04:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "BTC 저점 유동성 스윕 후 급반등. 진입 54K. 결과 +11% WIN",
        "entry_price": 54000.0,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2025-09-25 08:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "ETH 지지선 스윕 후 반전. 결과 WIN +8%",
        "entry_price": 2200.0,
    },
    {
        "symbol": "SOLUSDT",
        "captured_at": "2025-10-08 10:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "SOL 유동성 스윕 후 반등. 결과 LOSS — 재스윕 발생",
        "entry_price": 155.0,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-11-05 06:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "BTC 65K 지지 스윕 후 반전. 결과 WIN +16%",
        "entry_price": 65000.0,
    },
    {
        "symbol": "XRPUSDT",
        "captured_at": "2025-12-01 00:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "XRP 1.8 스윕 후 반전. 결과 WIN +18%",
        "entry_price": 1.8,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2026-01-10 12:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "ETH 3200 지지 스윕. 결과 timeout 방향 없음",
        "entry_price": 3200.0,
    },
    {
        "symbol": "BNBUSDT",
        "captured_at": "2026-02-01 08:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "BNB 400 스윕 후 반전. 결과 WIN +6%",
        "entry_price": 400.0,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-02-15 14:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "BTC 95K 스윕. 결과 LOSS — 스윕 후 추가 하락",
        "entry_price": 95000.0,
    },
    {
        "symbol": "SOLUSDT",
        "captured_at": "2026-03-05 06:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "SOL 130 저점 스윕 반전. 결과 WIN +22%",
        "entry_price": 130.0,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2026-04-10 10:00",
        "pattern_slug": "liquidity-sweep-reversal-v1",
        "phase": "ENTRY",
        "user_note": "ETH 1600 지지 스윕. 결과 WIN +9%",
        "entry_price": 1600.0,
    },

    # ── wyckoff-spring-reversal-v1 (10 cases) ─────────────────────────────────
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-08-20 08:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "BTC Wyckoff spring: 지지선 이탈 후 빠른 회복. 결과 WIN +14%",
        "entry_price": 58000.0,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2025-09-05 06:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "ETH spring — CC 구간 이탈 후 반전. 결과 WIN +11%",
        "entry_price": 2300.0,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-10-01 12:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "BTC Wyckoff spring 2차. 결과 LOSS — 지지 붕괴",
        "entry_price": 60500.0,
    },
    {
        "symbol": "SOLUSDT",
        "captured_at": "2025-11-10 00:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "SOL Wyckoff spring 패턴. 진입 160. 결과 WIN +25%",
        "entry_price": 160.0,
    },
    {
        "symbol": "LINKUSDT",
        "captured_at": "2025-12-15 10:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "LINK spring 확인. 결과 WIN +17%",
        "entry_price": 14.5,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-01-02 04:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "BTC 연초 spring 구간. 결과 timeout",
        "entry_price": 94000.0,
    },
    {
        "symbol": "ETHUSDT",
        "captured_at": "2026-01-28 08:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "ETH spring 패턴 — 3000 이탈 후 회복. 결과 WIN +13%",
        "entry_price": 3000.0,
    },
    {
        "symbol": "AVAXUSDT",
        "captured_at": "2026-02-22 06:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "AVAX spring 구간. 진입 28. 결과 LOSS",
        "entry_price": 28.0,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-03-20 10:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "BTC 84K spring 이후 CC 구간 복귀. 결과 WIN +8%",
        "entry_price": 84000.0,
    },
    {
        "symbol": "SOLUSDT",
        "captured_at": "2026-04-05 14:00",
        "pattern_slug": "wyckoff-spring-reversal-v1",
        "phase": "SPRING",
        "user_note": "SOL Apr spring — 105 지지 이탈 후 반전. 결과 WIN +19%",
        "entry_price": 105.0,
    },
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Founder seed — direct ledger write")
    parser.add_argument("--dry-run", action="store_true", help="Print records, don't write files")
    args = parser.parse_args()

    # Count existing records before writing
    before_count = sum(1 for _ in LEDGER_DIR.rglob("*.json"))

    print(f"\n{'='*60}")
    print(f"Founder Seed (Direct) — {len(ROWS)} rows → {LEDGER_DIR}")
    print(f"Existing records before: {before_count}")
    print(f"{'='*60}")

    written = 0
    skipped = 0
    by_pattern: dict[str, int] = {}

    for i, row in enumerate(ROWS, 1):
        record = build_record(row)
        slug = record["pattern_slug"]
        pattern_dir = LEDGER_DIR / slug
        out_path = pattern_dir / f"{record['id']}.json"

        print(f"  [{i:02d}] {record['symbol']:<16} {slug:<38} {record['outcome']:<8}  {row['captured_at']}")

        if args.dry_run:
            skipped += 1
            continue

        pattern_dir.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(record, f, indent=2, ensure_ascii=False)

        written += 1
        by_pattern[slug] = by_pattern.get(slug, 0) + 1

    if args.dry_run:
        print(f"\n[DRY RUN] Would write {len(ROWS)} records. Run without --dry-run to apply.")
        return

    after_count = sum(1 for _ in LEDGER_DIR.rglob("*.json"))
    print(f"\n{'='*60}")
    print(f"Written:  {written} records")
    print(f"Before:   {before_count}  →  After: {after_count}")
    print(f"\nRecords by pattern:")
    for slug, count in sorted(by_pattern.items()):
        total_in_dir = sum(1 for _ in (LEDGER_DIR / slug).glob("*.json"))
        print(f"  {slug:<42} +{count}  (total {total_in_dir})")
    print(f"\nNext: outcome_resolver closes pending records on the next hourly tick.")


if __name__ == "__main__":
    main()
