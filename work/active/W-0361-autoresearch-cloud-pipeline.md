# W-0361 — AutoResearch Cloud Pipeline

> Wave: 5 | Priority: P1 | Effort: L
> Charter: In-Scope (L7 AutoResearch acceleration)
> Status: 🟡 Design Draft
> Created: 2026-05-01
> Issue: #795
> Depends-on: W-0341 (hypothesis_registry deploy), W-0358 (multi-exchange Tier 1 data)

## Goal
백그라운드 AI 에이전트가 Cloud Run에서 4h 주기로 패턴 스캔(572 symbols × 12 patterns)을 돌려, OOS 검증된 가설을 hypothesis_registry에 자동 promote하고 `GET /research/signals/{symbol}`로 라이브 서빙한다.

## Scope
- 포함:
  - APScheduler hook in `engine/api/main.py` (Cloud Run lifespan)
  - `engine/research/autoresearch_runner.py` (loop wrapper, idempotent + advisory lock)
  - 데이터 접근 추상화 `engine/data/parquet_provider.py` (local FS / GCS dual-mode)
  - `engine/persistence/hypothesis_store.py` (upsert to Supabase hypothesis_registry)
  - API: `POST /research/autoresearch/trigger`, `GET /research/signals/{symbol}`, `GET /research/runs/{run_id}`
  - OOS wiring: Cloud Run env에서 `RESEARCH_OOS_WIRING=on` 강제
  - Supabase migration 034 `autoresearch_runs` + 035 `pattern_signals`
  - GCS sync script `tools/sync_market_data_to_gcs.py`
- 파일:
  - `engine/research/autoresearch_loop.py` (진입점 분리만)
  - `engine/research/autoresearch_runner.py` (신규)
  - `engine/data/parquet_provider.py` (신규 — local/GCS 추상화)
  - `engine/persistence/hypothesis_store.py` (신규)
  - `engine/api/main.py` (lifespan APScheduler 추가)
  - `engine/api/routes/research.py` (3 엔드포인트 추가)
  - `app/supabase/migrations/034_autoresearch_runs.sql` (신규)
  - `app/supabase/migrations/035_pattern_signals.sql` (신규)
  - `tools/sync_market_data_to_gcs.py` (신규)
- API:
  - `POST /research/autoresearch/trigger` → run_id (admin, X-API-Key)
  - `GET /research/signals/{symbol}?lookback=24h` → promoted hypotheses
  - `GET /research/runs/{run_id}` → {status, scanned, promoted, errors}

## Non-Goals
- 실시간 sub-1min 신호 푸시 — 본 W는 4h batch 기반
- 신규 패턴 추가 — 기존 12 LIBRARY_COMBOS만 사용
- Tier 2/3 전 거래소 백필 — Binance Futures + W-0358 Tier 1 한정
- AI 차트 분석 툴 / TradingView 대체 — Charter Frozen

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Cloud Run 메모리 OOM (572 symbols 동시 로딩) | 中 | 高 | batch=64 streaming, Cloud Run instance memory 4GB |
| 스케줄러 중복 실행 (multi-instance) | 高 | 中 | Postgres advisory lock `pg_try_advisory_lock`, 또는 min_instances=1 |
| Parquet stale (GCS 미동기화) | 高 | 高 | GCS sync 1h cron + Sentry stale alert (데이터 >2h면 run abort) |
| hypothesis_registry write storm | 低 | 中 | Upsert ON CONFLICT, run당 max_promotions=50 cap |
| Cloud Run cold start로 4h 스케줄 miss | 中 | 低 | min_instances=1 또는 Cloud Scheduler HTTP trigger |

### Dependencies
- Supabase `hypothesis_registry` (migration 031) — W-0341 완료 전제
- Cloud Run env: `RESEARCH_OOS_WIRING=on`, `AUTORESEARCH_ENABLED=true`
- GCS bucket `wtd-v2-market-data` + service account RW 권한
- ccxt>=4.0, W-0358 Tier 1 Parquet 완료

### Rollback
- Env flag `AUTORESEARCH_ENABLED=false` → scheduler skip
- 마이그레이션 034/035 rollback SQL 동봉
- API 엔드포인트는 feature gate로 410 반환

### Canonical Files
- `engine/research/autoresearch_loop.py`
- `engine/api/main.py`
- `engine/api/routes/research.py`
- `app/supabase/migrations/031_hypothesis_registry.sql`

## AI Researcher 관점

### Data Impact
- Input: Binance Futures 572 + W-0358 Tier 1 multi-exchange
- 가설 수 per run: 6,864 (572 × 12) → BH-FDR 후 예상 promote 30~80
- OOS holdout: walkforward 70/30, embargo=24h
- GCS 데이터: 500MB compressed, read latency ~100ms/file 허용

### Statistical Validation
- BH-FDR α=0.10 (이미 구현)
- Min hit_rate ≥ 0.55, periods_per_year=365
- Promote 조건: pass_oos AND hit_rate≥0.55 AND n_trades≥30
- promote_rate > 40% 시 Sentry alert (overfit 의심)

### Failure Modes
- F1: OOS wiring=off 잔존 → fail-fast assert at startup
- F2: 데이터 갭 >2h stale → run abort + Sentry
- F3: 단일 패턴 100% promote → run당 cap=50 + promote_rate alert
- F4: hypothesis_key 폭주 → upsert ON CONFLICT 중복 제거

## Decisions
- **[D-0001]**: 데이터 접근 = **GCS sync** (옵션 B: 실시간 Binance fetch 거절 — rate-limit, 옵션 C: 로컬만 거절 — cloud 실행 불가)
- **[D-0002]**: 스케줄 주기 = **4h** (1h 거절 — 노이즈, 1d 거절 — latency 너무 큼)
- **[D-0003]**: Write path = **Direct Supabase upsert** (Redis pub/sub 거절 — 불필요 인프라)

## Open Questions
- [ ] [Q-0001]: GCS egress 비용 — 500MB × 6 read/일 × 30d = ~90GB/월, 허용 가능 수준?
- [ ] [Q-0002]: APScheduler vs Cloud Scheduler + HTTP trigger — single instance면 APScheduler 단순
- [ ] [Q-0003]: hypothesis_key 정의 — `{symbol}|{pattern}|{timeframe}|{detected_at_4h_bucket}` 충분?

## Implementation Plan
1. (1d) `engine/data/parquet_provider.py` — local/GCS dual + integration test
2. (1d) `tools/sync_market_data_to_gcs.py` GCS sync script + cron 등록
3. (2d) `engine/research/autoresearch_runner.py` — lock + idempotent + Sentry
4. (1d) `engine/persistence/hypothesis_store.py` — upsert + cap=50
5. (1d) Migrations 034 `autoresearch_runs` + 035 `pattern_signals`
6. (1d) `engine/api/routes/research.py` — 3 endpoints + X-API-Key auth
7. (1d) `engine/api/main.py` lifespan APScheduler hook
8. (1d) E2E test: trigger → run → promote → GET /signals/BTCUSDT 응답
9. (0.5d) Cloud Run env 업데이트 + min_instances=1

## Exit Criteria
- [ ] AC1: Cloud Run 4h 주기 autoresearch run 자동 실행, 14일 연속 무중단 (≥84 runs, fail rate ≤ 5%)
- [ ] AC2: 단일 run 완료시간 ≤ 25분
- [ ] AC3: `GET /research/signals/{symbol}` p95 latency ≤ 300ms
- [ ] AC4: run당 promote 30~80개, promote_rate ≤ 40%
- [ ] AC5: OOS wiring=off 시 process exit 1 (startup assert)
- [ ] AC6: 중복 실행 방지 — advisory lock 검증
- [ ] AC7: Cloud Run memory peak ≤ 3GB
- [ ] AC8: pytest ≥ 12 tests green
- [ ] CI green
- [ ] PR merged

## Owner
engine

## Facts
- `engine/research/autoresearch_loop.py` — CLI only, API 엔드포인트 없음 (실측)
- `engine/api/routes/research.py` — `POST /research/validate` 존재 (실측)
- `app/supabase/migrations/031_hypothesis_registry.sql` — 스키마 존재 (실측)
- `RESEARCH_OOS_WIRING=off` 기본값 (실측)
- `engine/api/main.py` — APScheduler 미통합 (실측)
- 다음 migration 번호: 034 (033_propfirm_p1_core.sql 최신)
