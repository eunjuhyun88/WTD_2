# 16 — Storage Map (실제 저장소 진실표)

**Status:** Reference · 2026-05-01 (실측 기반)
**Scope:** 데이터가 어디에 저장되는가 (provider가 아닌 storage)
**See also:** `14_DATA_INVENTORY.md` — 어디서 오는지 (API provider)

---

## 0. 한 줄 결론

> 로컬 CSV 589MB (107개 1h + 572개 perp, 2026-04-23 마지막 fetch).
> Supabase: feature_windows 138,915행. autoresearch_runs(036) + pattern_signals(035) migration 번호 충돌 수정 완료 — 적용 대기 중.

---

## 1. 저장소별 실측 현황

### Layer 1 — 로컬 파일 (engine/data_cache/)

| 경로 | 내용 | 실측 | 최신 바 |
|---|---|---|---|
| `cache/*_1h.csv` | OHLCV 1h (107 심볼) | 107개, 264MB | 2026-04-23~24 **(7일 stale)** |
| `cache/*_perp.csv` | Futures perp | 572개+ | 동일 stale |
| `cache/*_dex_bundle.csv` | DEX bundle | 있음 | 2026-04-30 |
| `market_data/derivatives/*.parquet` | Funding rate, OI | 일부 | - |
| `experiments/pattern_scan_results.parquet` | 스캔 결과 | 1개 | - |

**결론:** 1h OHLCV 전부 7일 stale → `fetch_binance.py` 미실행 상태.

---

### Layer 2 — GCS (gs://wtd-v2-market-data/)

| 경로 | 내용 | 실측 |
|---|---|---|
| `ohlcv/{symbol}_{tf}.parquet` | 설계 목표 | **버킷 존재, 데이터 없음 (empty)** |
| `derivatives/*.parquet` | 설계 목표 | **없음** |

**결론:** GCS sync 스크립트(`tools/sync_market_data_to_gcs.py`) 미구현. W-0361 설계 only.

---

### Layer 3 — Supabase PostgreSQL (migration 기준)

| 테이블 | Migration | 상태 | 용도 |
|---|---|---|---|
| `feature_windows` | 021 | ✅ 138,915행 | 패턴 feature 벡터 |
| `hypothesis_registry` | 031 | ✅ 있음 | BH-FDR 통과 패턴 등록 |
| `pattern_objects` | 033 | ✅ 있음 | PatternVariantSpec 저장 |
| `ledger_*` (4-table) | 024/033 | ✅ 있음 | Entry/Score/Outcome/Verdict |
| `captures` | 020 | ✅ 있음 | 유저 capture |
| `beta_allowlist` | 025 | ✅ 있음 | 알파/베타 게이팅 |
| `chart_notes` | 034 | ✅ 있음 | 차트 메모 |
| `autoresearch_runs` | 036 (수정됨) | ⏳ migration 적용 대기 | AutoResearch 실행 이력 |
| `pattern_signals` | 035 | ⏳ migration 적용 대기 | 심볼별 최신 signal |
| `scan_signal_events` | 037 | ❌ W-0367 미구현 | per-signal component_scores |
| `scan_signal_outcomes` | 037 | ❌ W-0367 미구현 | 1h/4h/24h/72h P&L outcome |

**결론:** 034 번호 충돌 수정 완료 (`034_autoresearch_runs.sql` → `036_autoresearch_runs.sql`). Supabase에 push 필요.

---

### Layer 4 — Redis (실시간 캐시)

| 키 패턴 | TTL | 상태 |
|---|---|---|
| `chart:klines:{symbol}:{tf}` | 15s | ✅ 작동 |
| `analyze:{symbol}:{tf}` | 5min | ✅ 작동 |
| `signals:{symbol}` | 1h | ❌ 미작동 (Supabase pattern_signals 없어서) |
| `autoresearch:lock` | 30m | ✅ 코드 있음 |

---

## 2. 실제 데이터 흐름

### Pipeline A — AutoResearch (autoresearch_loop.py, 4h 배치)

```
load_universe() [로컬 CSV, stale]
  → PatternScanner.scan_universe()
  → BH-FDR + OOS walkforward
  → hypothesis_registry.upsert(Supabase) ✅
  → [❌ pattern_signals 없음 → Redis signal write 불가]
```

### Pipeline B — 유저 검색 (on-demand, /cogochi/analyze)

```
collector.ts (Promise.allSettled 15개)
  ├── Binance FAPI klines → Redis 15s ✅
  ├── Coinbase spot [W-0362 ✅]
  ├── OI/funding/depth/taker ✅
  └── Redis.get("signals:*") [❌ 데이터 없음]
  → Engine /deep → Redis 5min ✅
```

---

## 3. 갭 목록

| ID | 갭 | 영향 | Work |
|---|---|---|---|
| G1 | 1h OHLCV 7일 stale | market_retrieval_index 빌드 불가 → 후보 0개 | W-0365 T1 |
| G2 | GCS sync 스크립트 없음 | AutoResearch 로컬 의존 | W-0361 (미구현) |
| G3 | `autoresearch_runs` 테이블 없음 | 실행 이력 감사 불가 | migration 035 필요 |
| G4 | `pattern_signals` 테이블 없음 | Redis signal cache 불가 | migration 035 필요 |
| G5 | market_retrieval_index 미빌드 | `/research/market-search` 후보 항상 0 | W-0365 T2 |

---

## 4. 즉시 실행 순서 (P0)

```bash
# G1 — 데이터 갱신 (~30분)
cd engine && uv run python data_cache/fetch_binance.py

# G5 — index 빌드 (~40분, G1 완료 후)
cd engine && uv run python -c "
from research.market_retrieval import build_market_retrieval_index
build_market_retrieval_index(window_bars=61)
"

# G3/G4 — migration 035 추가 (별도 작업)
# app/supabase/migrations/035_autoresearch_tables.sql
```
