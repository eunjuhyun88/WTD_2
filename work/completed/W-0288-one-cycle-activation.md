# W-0288 — 1사이클 패턴찾기 완전 작동 활성화

> Wave: MM | Priority: P0 | Effort: S
> Charter: In-Scope L5 (Research/Validation pipeline quality) + L7 (Refinement loop)
> Status: 🟢 Design Approved
> Created: 2026-04-29 by Agent A076
> Issue: #563
> Depends on: W-0284 (GateV2DecisionStore, 병렬 구현 필요)

---

## Goal (1줄)

프로덕션 Cloud Run에서 **패턴 탐지 → 검증 → 게이트 판정 → 알림 억제**가 1사이클로 실제 동작하도록 3개 차단 갭(offline BTC fetch, refinement job 비활성, 코퍼스 고착)을 제거한다.

---

## 현재 1사이클 상태 (코드 실측)

```
Feature Materialization  ✅ ENABLE_FEATURE_MATERIALIZATION_JOB=true (default)
Universe Scan            ✅ always_on_jobs 에 포함
Pattern Scan             ✅ always_on_jobs 에 포함
Outcome Resolver         ✅ always_on_jobs 에 포함
Refinement Trigger       ✅ always_on_jobs — 10건+7일 조건 체크
─────────────────────────────────────────────────────────────────
V-05 BTC Regime Gate     ❌ GAP-A: offline=True → CacheMiss 항상 발생 → 건너뜀
Pattern Refinement Job   ❌ GAP-B: ENABLE_PATTERN_REFINEMENT_JOB="false" (default)
gate_v2_result 반영      ❌ GAP-C: log-only, completion_disposition 미반영 (→ W-0284)
Search Corpus 갱신       ⚠️ GAP-D: ENABLE_SEARCH_CORPUS_JOB="false" (default)
```

---

## Facts (코드 실측)

### GAP-A: V-05 BTC Regime 항상 건너뜀

```
engine/research/validation/runner.py:40
  klines = load_klines("BTCUSDT", "1d", offline=True)
  # Cloud Run persistent disk 없음 → CSV cache 항상 empty → CacheMiss
  # → btc_returns=None → run_validation_pipeline(btc_returns=None) → V-05 skip

engine/data_cache/loader.py
  offline=True + cache miss → raise CacheMiss immediately (Binance 미호출)
  offline=False + cache miss → Binance API fetch → persist to cache → return
```

**수정**: `offline=True` → `offline=False` (1줄 변경)

```python
# runner.py:40 — 변경 후
klines = load_klines("BTCUSDT", "1d", offline=False)
```

**위험**: Binance API rate limit. `1d` 캔들 100일 = 100 rows, 단일 REST call. Cloud Run cold start마다 호출 가능성 → `@lru_cache` 또는 `functools.cache` + TTL 래핑 필요.

### GAP-B: pattern_refinement_job 비활성

```
engine/scanner/scheduler.py:70
  PATTERN_REFINEMENT_ENABLED = os.environ.get("ENABLE_PATTERN_REFINEMENT_JOB", "false")
  # GCP Cloud Run env var에 설정 안 됨 → 누적 verdict 기반 재검증 없음
  # 결과: refinement_trigger는 조건 충족해도 아무 일도 안 함

engine/scanner/scheduler.py:356 (PATTERN_REFINEMENT_ENABLED 조건부 등록)
  _pattern_refinement_job → pattern_refinement_job() → run_validation_pipeline()
  # 이 경로가 완전히 비활성
```

**수정**: GCP Cloud Run 서비스 환경변수 추가 — **코드 변경 없음, 인프라 설정만**

### GAP-C: gate_v2_result 미반영

```
engine/worker/research_jobs.py:116-136
  gate_v2_result = run_full_validation(search_run.research_run_id)
  log.info("GateV2Result: slug=%s overall_pass=%s ...")
  # completion_disposition 결정에 gate_v2_result 영향 없음
  # → V-track 실패해도 패턴이 promote 됨
```

**수정**: W-0284 GateV2DecisionStore 구현 (별도 work item, 병렬 진행)

### GAP-D: search corpus 고착

```
engine/scanner/scheduler.py:78
  SEARCH_CORPUS_ENABLED = os.environ.get("ENABLE_SEARCH_CORPUS_JOB", "false")
  # feature_windows 신규 행이 쌓여도 search corpus 미갱신
  # corpus_bridge_sync_job은 always_on 이지만 search index rebuild는 별도
```

**수정**: GCP Cloud Run 환경변수 추가 (GAP-B와 동시 적용)

---

## Scope

- **포함 (코드 변경)**:
  - `engine/research/validation/runner.py:40` — `offline=True` → `offline=False`
  - `engine/research/validation/runner.py` — `_fetch_btc_returns()` 에 TTL 캐시 래핑
  - `engine/research/validation/test_runner.py` — `_fetch_btc_returns` 테스트 1개 추가
- **포함 (인프라 설정)**:
  - GCP Cloud Run 서비스: `ENABLE_PATTERN_REFINEMENT_JOB=true` 추가
  - GCP Cloud Run 서비스: `ENABLE_SEARCH_CORPUS_JOB=true` 추가 (권장)
  - `docs/runbooks/deploy-engine.md` — 환경변수 체크리스트 갱신

## Non-Goals

- W-0284 GateV2DecisionStore 구현 — 별도 work item (병렬 P0)
- BTC kline 장기 스토리지 (Supabase 적재) — 별도 후속 작업
- W-0287 BH cross-pattern FDR — 별도 P2 work item
- pattern_refinement_job 자체 로직 변경 없음

---

## CTO 설계 결정

### offline=False 전환 시 Binance rate limit 방어

```python
# runner.py에 추가 — 모듈 레벨 캐시 (Cloud Run 인스턴스 생애 내)
import time
_BTC_CACHE: tuple[float, "pd.Series"] | None = None
_BTC_CACHE_TTL = 3600  # 1h — 1d candles는 1일 1회 갱신이면 충분

def _fetch_btc_returns() -> "pd.Series | None":
    global _BTC_CACHE
    if _BTC_CACHE is not None:
        ts, series = _BTC_CACHE
        if time.time() - ts < _BTC_CACHE_TTL:
            return series
    try:
        klines = load_klines("BTCUSDT", "1d", offline=False)  # ← 변경
        ...
        _BTC_CACHE = (time.time(), returns)
        return returns
    except Exception as exc:
        log.debug("_fetch_btc_returns: unavailable — %s", exc)
        return None
```

- `offline=False` 1회 Binance call → 캐시 → 1시간 동안 재사용
- 인스턴스 재시작 시에만 API 재호출 (Cloud Run min-instances=1이면 실사용 ~1회/일)

### PATTERN_REFINEMENT_JOB 활성화 위험도

| 항목 | 현재 | 활성화 후 |
|---|---|---|
| CPU 부하 | 0 | ~5-10분 validation run/패턴 (조건부) |
| Binance API 호출 | 0 | 최대 53 × 1회/7일 |
| DB 쓰기 | 0 | PatternSearchArtifactStore.update × N |
| 장애 시 영향 | 없음 | refinement_trigger → 빈 결과 (non-fatal) |

**결론**: 위험도 낮음. refinement_trigger가 조건(verdict_count≥10 AND days_since≥7) 충족 시에만 실행됨. 신규 패턴은 즉시 트리거 안 됨.

### 인프라 설정 절차 (runbook)

```bash
# GCP Cloud Run — engine 서비스 환경변수 추가
gcloud run services update cogotchi-engine \
  --region asia-northeast3 \
  --set-env-vars "ENABLE_PATTERN_REFINEMENT_JOB=true,ENABLE_SEARCH_CORPUS_JOB=true"

# 확인
gcloud run services describe cogotchi-engine \
  --region asia-northeast3 \
  --format="yaml(spec.template.spec.containers[0].env)"
```

**주의**: 배포 없이 환경변수만 변경. `--set-env-vars`는 기존 env var를 덮어쓰므로 전체 env 목록을 확인 후 적용.

---

## AI Researcher 관점

### V-05 활성화 효과 (BTC regime gate)

V-05는 BTC 가격이 **하락 regime** (-10%/30일 미만) 일 때 `regime_penalty` 적용:
- 하락장 패턴의 hit_rate 임계값 ↑ (0.55 → 0.60~0.65)
- 패턴 overall_pass 감소 → 알림 억제
- 현재: V-05 없이 상승/하락 구분 없이 단일 임계값 적용 중

**현실 데이터 예상 영향**: BTC 30일 수익률 기준, 2024-2026 데이터에서 하락 regime 비중 ~30-40%. V-05 활성화 시 이 구간 패턴 10-20% 추가 탈락 예상.

### PATTERN_REFINEMENT_JOB 활성화 통계 영향

활성화 시 **누적 verdict 기반 재검증** 가능:
- 초기 validation: verdict 적어 샘플 부족 (n < 30) → 높은 불확실성
- 재검증 (10건+): 더 많은 샘플 → G1 t-stat 신뢰성 증가
- 기대 효과: 초기 pass 패턴 중 일부 revoke (더 엄격한 기준)

### Failure Modes

- `offline=False` 전환 후 Binance 장애 → V-05 skip (기존과 동일 동작, non-fatal)
- PATTERN_REFINEMENT_JOB 폭주 → refinement_trigger 조건 재확인 (hard limit=10건/7일)
- TTL 캐시 race condition → Cloud Run min-instances=1 + 단일 worker 구조로 무해

---

## 구현 계획

1. `engine/research/validation/runner.py` — `_fetch_btc_returns()` TTL 캐시 + `offline=False` (≈ 15줄)
2. `engine/research/validation/test_runner.py` — `_fetch_btc_returns` mock 테스트 1개
3. `docs/runbooks/deploy-engine.md` — 환경변수 체크리스트 2줄 추가
4. GCP Cloud Run env var 적용 (사용자가 gcloud 명령 직접 실행 또는 확인 후 적용)

**W-0284 병렬**: actuator.py 구현 (별도 에이전트 권장)

---

## Exit Criteria

- [ ] AC1: `_fetch_btc_returns()` 가 `offline=False`로 호출됨 — `grep -n "offline=False" engine/research/validation/runner.py` 확인
- [ ] AC2: TTL 캐시 적용 — 2회 연속 `_fetch_btc_returns()` 호출 시 Binance API 1회만 호출 (mock test)
- [ ] AC3: `pytest engine/research/validation/test_runner.py` PASS
- [ ] AC4: GCP Cloud Run 서비스에 `ENABLE_PATTERN_REFINEMENT_JOB=true` 설정 확인 (gcloud describe)
- [ ] AC5: `docs/runbooks/deploy-engine.md` 에 env var 체크리스트 포함
- [ ] CI green (기존 1624 tests 포함)

---

## References

- `engine/research/validation/runner.py:40` — `offline=True` 실측
- `engine/scanner/scheduler.py:70,78` — 비활성 env var 실측
- `engine/worker/research_jobs.py:116` — gate_v2_result log-only 실측
- `engine/data_cache/loader.py` — offline=True → CacheMiss 즉시 발생 실측
- W-0284 (`work/active/W-0284-gate-v2-promote-actuator.md`) — GAP-C 처리
- W-0280 (PR #541) — run_full_validation 구현
- PR #560 (main `1e0cc514`) — 8-axis quant hardening (선행 완료)
