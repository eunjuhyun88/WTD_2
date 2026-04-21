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

    # ── funding-flip-reversal-v1 추가 케이스 (10개 목표) ──────────────────────
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
    {
        "symbol": "MATICUSDT",
        "captured_at": "2026-04-02 08:00",
        "pattern_slug": "funding-flip-reversal-v1",
        "phase": "ENTRY_ZONE",
        "user_note": "MATIC 역프 후 반등 기대. 결과 LOSS -5.1%",
        "entry_price": 0.62,
    },

    # ── whale-accumulation-reversal-v1 추가 케이스 (10개 목표) ────────────────
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

    # ── tradoor-oi-reversal-v1 추가 케이스 (10개 목표) ───────────────────────
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

    # ── liquidity-sweep-reversal-v1 케이스 (10개) ────────────────────────────
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

    # ── wyckoff-spring-reversal-v1 케이스 (10개) ─────────────────────────────
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
