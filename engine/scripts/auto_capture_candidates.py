#!/usr/bin/env python3
"""
Auto Capture Candidates — 현재 패턴 매칭 후보들을 캡처 등록 → outcome_resolver 자동 추적.

사용법:
  cd engine
  python3 scripts/auto_capture_candidates.py              # 상위 10개 캡처
  python3 scripts/auto_capture_candidates.py --limit 20   # 상위 20개
  python3 scripts/auto_capture_candidates.py --dry-run    # 미리 보기
  python3 scripts/auto_capture_candidates.py --watch 900  # 15분마다 반복

동작:
  1. GET /patterns/candidates → 현재 entry candidate 목록 조회
  2. 중복 제거 (symbol+slug 기준, 최근 24h 이내 이미 캡처된 것 스킵)
  3. POST /captures 로 각 candidate 등록
  4. outcome_resolver(hourly)가 이후 가격 보고 win/loss 판정
  5. /patterns Verdict Inbox에서 확인
"""

import argparse
import json
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

ENGINE = "http://localhost:8000"

# 우선순위 패턴 (더 높은 확신도 패턴 먼저)
PRIORITY_ORDER = [
    "funding-flip-reversal-v1",      # 역프 — 벤치마크 패턴
    "radar-golden-entry-v1",         # 골든 진입
    "tradoor-oi-reversal-v1",        # TRADOOR 코어
    "wyckoff-spring-reversal-v1",    # 와이코프 스프링
    "liquidity-sweep-reversal-v1",   # 유동성 스윕
    "compression-breakout-reversal-v1",
    "volume-absorption-reversal-v1",
    "whale-accumulation-reversal-v1",
    "oi-presurge-long-v1",
    "alpha-presurge-v1",
    "alpha-confluence-v1",
    "institutional-distribution-v1", # SHORT 신호
    "funding-flip-short-v1",
    "gap-fade-short-v1",
]


def priority_score(slug: str) -> int:
    try:
        return PRIORITY_ORDER.index(slug)
    except ValueError:
        return len(PRIORITY_ORDER)


def fetch_candidates() -> list[dict]:
    resp = requests.get(f"{ENGINE}/patterns/candidates", timeout=60)
    resp.raise_for_status()
    records = resp.json().get("candidate_records", [])
    # 우선순위 + alert_visible=True 우선
    visible = [r for r in records if r.get("alert_visible", True)]
    sorted_records = sorted(visible, key=lambda r: priority_score(r["slug"]))
    return sorted_records


def fetch_recent_capture_keys(hours: int = 24) -> set[str]:
    """최근 N시간 이내 이미 캡처된 symbol+slug 쌍 반환."""
    try:
        resp = requests.get(
            f"{ENGINE}/captures/outcomes?status=pending_outcome&limit=200",
            timeout=10,
        )
        if not resp.ok:
            return set()
        items = resp.json().get("items", [])
        cutoff_ms = (time.time() - hours * 3600) * 1000
        keys = set()
        for item in items:
            cap = item.get("capture", {})
            if cap.get("captured_at_ms", 0) > cutoff_ms:
                keys.add(f"{cap['symbol']}::{cap['pattern_slug']}")
        return keys
    except Exception:
        return set()


def create_capture(record: dict, user_id: str) -> dict:
    """bulk_import lane — no transition_id validation needed for auto-tracking."""
    note = (
        f"auto_capture: {record.get('phase_label', record['phase'])} "
        f"| bars={record.get('bars_in_phase', '?')}"
    )
    payload = {
        "user_id": user_id,
        "rows": [{
            "symbol": record["symbol"],
            "timeframe": record.get("timeframe", "1h"),
            "captured_at_ms": int(time.time() * 1000),
            "pattern_slug": record["pattern_slug"],
            "phase": record["phase"],
            "user_note": note,
        }]
    }
    resp = requests.post(f"{ENGINE}/captures/bulk_import", json=payload, timeout=10)
    resp.raise_for_status()
    ids = resp.json().get("capture_ids", [])
    return {"capture": {"capture_id": ids[0] if ids else "?"}}


def run_once(limit: int, dry_run: bool, user_id: str) -> int:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n{'='*60}")
    print(f"Auto Capture Candidates — {now}")
    print(f"{'='*60}")

    candidates = fetch_candidates()
    recent_keys = fetch_recent_capture_keys(hours=24)

    # 중복 필터
    new_candidates = [
        r for r in candidates
        if f"{r['symbol']}::{r['slug']}" not in recent_keys
    ][:limit]

    if not new_candidates:
        print("  No new candidates (all already captured in last 24h)")
        return 0

    print(f"  {len(candidates)} total candidates → {len(new_candidates)} new (skipped {len(candidates)-len(new_candidates)} recent)")
    print()

    captured = 0
    for i, rec in enumerate(new_candidates, 1):
        label = f"[{i:02d}] {rec['symbol']:<16} {rec['slug']:<36} phase={rec['phase']} bars={rec.get('bars_in_phase','?')}"
        if dry_run:
            print(f"  {label}  [DRY RUN]")
            captured += 1
        else:
            try:
                result = create_capture(rec, user_id)
                cap_id = result.get("capture", {}).get("capture_id", "?")[:8]
                print(f"  ✓ {label}  id={cap_id}…")
                captured += 1
            except requests.HTTPError as e:
                body = e.response.text[:120] if e.response else str(e)
                print(f"  ✗ {label}  ERR: {body}")
            except Exception as e:
                print(f"  ✗ {label}  ERR: {e}")

    print(f"\n  → {captured} captures {'registered' if not dry_run else 'would be registered'}")
    print(f"  Next: outcome_resolver tracks win/loss on next hourly tick")
    print(f"  Check: GET {ENGINE}/captures/outcomes?status=pending_outcome")
    return captured


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto capture pattern candidates")
    parser.add_argument("--limit", type=int, default=10, help="Max candidates to capture per run")
    parser.add_argument("--user-id", default="founder", help="user_id tag for captures")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--watch", type=int, default=0, metavar="SECONDS",
                        help="Repeat every N seconds (0=once). e.g. --watch 900 = every 15min")
    args = parser.parse_args()

    if args.watch > 0:
        print(f"Watch mode: running every {args.watch}s. Ctrl+C to stop.")
        while True:
            try:
                run_once(args.limit, args.dry_run, args.user_id)
                print(f"\n  Sleeping {args.watch}s…")
                time.sleep(args.watch)
            except KeyboardInterrupt:
                print("\nStopped.")
                break
    else:
        run_once(args.limit, args.dry_run, args.user_id)


if __name__ == "__main__":
    main()
