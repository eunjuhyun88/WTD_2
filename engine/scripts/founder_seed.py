#!/usr/bin/env python3
"""
Founder Seed — bulk-import past TRADOOR/PTB trade setups into the capture store.

사용법:
  cd engine
  python scripts/founder_seed.py [--engine http://localhost:8000] [--dry-run]

데이터 출처: 아카 텔레그램 채널 복기 (2021~2026) + TRADOOR/PTB 실매매 레퍼런스
"""

import argparse
import json
from datetime import datetime, timezone
from typing import Any

try:
    import requests
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests


# ── Helpers ───────────────────────────────────────────────────────────────────

def to_ms(dt_str: str) -> int:
    """'YYYY-MM-DD HH:MM' UTC → Unix ms"""
    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


# ── Seed rows ─────────────────────────────────────────────────────────────────
# 각 row: symbol, captured_at (UTC 문자열), pattern_slug, phase, user_note, entry_price(optional)
#
# Phase 값 참고:
#   tradoor-oi-reversal-v1      → FAKE_DUMP / ARCH_ZONE / REAL_DUMP / ACCUMULATION / BREAKOUT
#   funding-flip-reversal-v1    → COMPRESSION_ZONE / FLIP_SIGNAL / ENTRY_ZONE / SQUEEZE
#   whale-accumulation-reversal-v1 등 단순 패턴은 그냥 "ENTRY" 또는 "ACCUMULATION"

ROWS: list[dict[str, Any]] = [
    # ── BTC 역프(역방향 프리미엄) 케이스 ─────────────────────────────────────
    {
        "symbol": "BTCUSDT",
        "captured_at": "2026-01-13 04:00",    # 역프 확인 시각 (UTC 추정)
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

    # ── KOMA 펀딩 플립 케이스 (벤치마크) ──────────────────────────────────────
    {
        "symbol": "KOMAOUSDT",
        "captured_at": "2026-03-23 00:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "KOMA 역프: funding -0.00056 → 진입. 결과 +21.5% WIN. W-0091 벤치마크 케이스",
        "entry_price": None,
    },

    # ── 숏스퀴즈 케이스 ────────────────────────────────────────────────────────
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

    # ── TRADOOR/PTB OI 반전 레퍼런스 ──────────────────────────────────────────
    # 코어 루프 설계 출발점 — 정확한 날짜 불명, 대략적 타임스탬프 사용
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-11-01 00:00",    # TRADOOR 레퍼런스 구간 (추정)
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "TRADOOR/PTB OI 반전 레퍼런스. 급락+OI급등 2차 후 축적구간 진입. 코어루프 설계 기반 케이스",
        "entry_price": None,
    },
    {
        "symbol": "BTCUSDT",
        "captured_at": "2025-12-10 00:00",    # 두 번째 TRADOOR 패턴 (추정)
        "pattern_slug": "tradoor-oi-reversal-v1",
        "phase": "ACCUMULATION",
        "user_note": "TRADOOR 2차 레퍼런스. REAL_DUMP 후 펀딩 양전환 진입",
        "entry_price": None,
    },
]


# ── Payload builder ────────────────────────────────────────────────────────────

def build_payload(user_id: str) -> dict:
    rows = []
    for r in ROWS:
        row: dict[str, Any] = {
            "symbol": r["symbol"],
            "timeframe": r.get("timeframe", "1h"),
            "captured_at_ms": to_ms(r["captured_at"]),
            "pattern_slug": r["pattern_slug"],
            "phase": r["phase"],
            "user_note": r.get("user_note"),
        }
        if r.get("entry_price") is not None:
            row["entry_price"] = r["entry_price"]
        rows.append(row)
    return {"user_id": user_id, "rows": rows}


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Founder seed bulk-import")
    parser.add_argument("--engine", default="http://localhost:8000")
    parser.add_argument("--user-id", default="founder")
    parser.add_argument("--dry-run", action="store_true", help="Print payload, don't submit")
    args = parser.parse_args()

    payload = build_payload(args.user_id)

    print(f"\n{'='*60}")
    print(f"Founder Seed — {len(payload['rows'])} rows → {args.engine}")
    print(f"{'='*60}")
    for i, row in enumerate(payload["rows"], 1):
        dt = datetime.fromtimestamp(row["captured_at_ms"] / 1000, tz=timezone.utc)
        print(f"  [{i:02d}] {row['symbol']:<16} {row['pattern_slug']:<32} {dt.strftime('%Y-%m-%d')}  {row['phase']}")

    if args.dry_run:
        print("\n[DRY RUN] Payload:")
        print(json.dumps(payload, indent=2))
        return

    print(f"\nSubmitting…")
    url = f"{args.engine}/captures/bulk_import"
    try:
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        print(f"\n✓ Imported {data['count']} captures")
        print(f"  IDs: {data['capture_ids'][:3]}{'…' if len(data['capture_ids']) > 3 else ''}")
        print(f"\nNext: outcome_resolver picks these up on the next hourly tick.")
        print(f"      Check status: GET {args.engine}/captures/outcomes?status=pending_outcome")
    except requests.HTTPError as e:
        print(f"\n✗ HTTP {e.response.status_code}: {e.response.text[:400]}")
    except Exception as e:
        print(f"\n✗ Error: {e}")


if __name__ == "__main__":
    main()
