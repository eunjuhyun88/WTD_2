---
name: 다음 실행 설계 (2026-04-26 세션 종료)
description: main=092a50de 기준, W-0145 corpus 107symbols 확장 + W-0132 copy trading P1 설계 저장
type: project
---

# 다음 실행 설계 — 2026-04-26 세션 종료

**Why:** 세션 종료 후 다음 에이전트가 컨텍스트 없이도 어디서 시작할지 알기 위해.

**How to apply:** 다음 세션 시작 시 CURRENT.md + 이 메모리로 상태 복원.

## 현재 상태

| 항목 | 값 |
|---|---|
| main SHA | `092a50de` |
| App CI | 250 tests, 0 TS errors |
| Engine CI | 1448 passed |
| Supabase feature_windows | 138,915 rows (29 symbols × 3 tf) |
| GCP | cogotchi-00013-c7n 서빙 중 |

## 우선순위 1: W-0145 Corpus 107 symbols 확장

현재 29 symbols → 목표 107 symbols.
근본 원인: data_cache에 78 symbols의 klines 없음 → feature_windows_builder 스킵.

실행 순서:
1. `list_cached_symbols()` 로 현재 캐시 목록 확인
2. 없는 symbols: Binance API에서 1h/4h/1d klines pull (backfill script)
3. `feature_windows_builder` 재실행 → Supabase upsert
4. GCP `/search/similar` 검증

설계문서: `work/active/W-next-design-20260426.md`

## 우선순위 2: W-0132 Copy Trading Phase 1

실행 순서:
1. Migration 019 SQL (`trader_profiles`, `copy_subscriptions`) → Supabase apply
2. `engine/copy_trading/leader_score.py` (JUDGE → ELO score)
3. App API routes (leaderboard GET, subscribe POST/DELETE)
4. UI panel (CopyTradingLeaderboard.svelte)

Branch: `claude/w-0132-copy-trading-p1` (base: main, 미생성)
설계문서: `work/active/W-next-design-20260426.md`

## 인프라 미완 (사람이 직접)

- GCP cogotchi-worker Cloud Build trigger
- Vercel `EXCHANGE_ENCRYPTION_KEY` (프로덕션)
