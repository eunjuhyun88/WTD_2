# Archived Agent Handoff — 2026-04-25

Archived by W-0163 because `work/active/CURRENT.md` is the live index and
`work/active/AGENT-HANDOFF-*` snapshots can override the current state for
future agents.

Original content follows.

---

# Agent Handoff — 2026-04-25

다음 에이전트가 컨텍스트 없이 시작해도 이 파일 하나로 현황 파악 가능.

---

## 지금 상태 (main = e2fba18b)

### 머지 완료된 PR
| PR | 내용 |
|---|---|
| #252 | `/jobs/feature_materialization/run` + `/jobs/raw_ingest/run` HTTP endpoints |
| #253 | JWT P0 hardening — JWKS cache + circuit breaker |
| #254 | W-0200 Core Loop: range select → auto-analyze → find similar → outcome → save |
| #256 | Pattern similarity search UI |

### 이번 세션 코드 변경 (claude/strange-proskuriakova 브랜치, PR 대기)
| 파일 | 변경 내용 |
|---|---|
| `cloudbuild.yaml` | `--min-instances 1` 추가 |
| `cloudbuild.worker.yaml` | `--concurrency 1 --timeout 900s` 추가 |
| `engine/search/similar.py` | Layer A 3→40+ 차원, weighted L1, FeatureWindowStore enrichment |
| `engine/api/auth/jwt_validator.py` | structured JSON logging + latency_ms |
| `engine/api/routes/jobs.py` | git conflict marker 3곳 제거 + 중복 endpoint 제거 |
| `docs/runbooks/cloud-scheduler-setup.md` | 신규: gcloud 명령어 runbook |

---

## 사람이 해야 할 것 (블로커)

1. **GCP Cloud Build trigger 확인**
   - Cloud Build → Triggers에 `cloudbuild.worker.yaml` 트리거가 없으면 추가
   - 없으면 `cogotchi-worker` 서비스가 자동 배포 안 됨 = scheduler jobs 안 돌아감

2. **Cloud Scheduler 2개 job 등록**
   - `docs/runbooks/cloud-scheduler-setup.md` 참조
   - feature_materialization: 15분, raw_ingest: 60분

3. **Vercel 환경변수**
   - `EXCHANGE_ENCRYPTION_KEY` 프로덕션 설정

---

## 다음 에이전트가 해야 할 코드 작업

### 우선순위 1 — W-0162 나머지 (소)
**목표**: SearchCorpusStore 자동 채우기 (현재 수동/비어있음)

`engine/scanner/jobs/feature_materialization.py`의 `materialize_symbol_window()` 가 klines를 이미 로드한다.
이 시점에 `build_corpus_windows(symbol, timeframe, bars_df)` 호출 후 `SearchCorpusStore().upsert_windows()` 하면
feature_materialization job이 돌 때마다 corpus가 자동 확장됨.

또는 `engine/scanner/scheduler.py`의 `_feature_materialization_refresh_job()` 끝에 `search_corpus_refresh_job()` 호출 추가.

### 우선순위 2 — W-0160 (중)
JSON ledger (`engine/ledger/`) → Supabase `pattern_ledger_records` 테이블로 write-through.
현재 로컬 JSON에만 쓰고 Supabase는 별도. 멀티유저 환경에서 레이스컨디션 위험.

### 우선순위 3 — W-0151 (중)
Pattern ML `active` 전환 경로: shadow → candidate → active promotion workflow.
`engine/scoring/lightgbm_engine.py`의 `is_trained` 체크 이후 실제 alert gating 로직 필요.

### 우선순위 4 — W-0124 (소)
engine-api JWT 게이팅. 현재 `--allow-unauthenticated`. `/jobs/*` 제외 나머지에 JWT 미들웨어 강제화.

---

## 아키텍처 핵심 이해

```text
raw_ingest (60분) → data_cache (CSV)
    ↓
feature_materialization (15분) → FeatureWindowStore (SQLite, 40+ 신호)
    ↓ (search time enrichment — 이미 구현됨)
SearchCorpusStore (6 OHLCV 통계) → run_similar_search()

검색 시:
  _fetch_feature_signals_batch() → FeatureWindowStore에서 40+ 신호 조회
  _extract_reference_sig() → capture feature_snapshot 40+ 신호
  _layer_a() weighted L1 (OI/funding 2x)
  _layer_b() LCS phase path
  _layer_c() LightGBM p_win (shadow)
```

**핵심 원칙**: engine이 진실. app은 소비만. search plane은 engine에 있음.

---

## 테스트 현황 (2026-04-25 기준)
- engine: 1374 passed, 5 skipped (W-0200 머지 시점)
- search tests: 34 passed (이번 세션 확인)

## 파일 경로 참조
- `work/active/CURRENT.md` — 최신 상태 index
- `docs/runbooks/cloud-scheduler-setup.md` — GCP Scheduler 등록
- `docs/runbooks/cloud-run-engine-deploy.md` — GCP 배포 runbook
- `engine/search/similar.py` — 3-layer search 핵심
- `engine/api/routes/jobs.py` — HTTP trigger endpoints
