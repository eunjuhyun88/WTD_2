# W-0120 — Flywheel Data Pipeline & GCP Ops

**Owner:** engine + infra
**Type:** Engine logic + infra
**Branch:** (new — start from main after PR #147 merge)
**Status:** DESIGNED (not started)
**Last updated:** 2026-04-22

---

## Goal

플라이휠이 데이터를 자동으로 누적·학습하기 위한 3가지 블로커 해소:

1. GCP Cloud Run scale-to-zero로 인한 스캐너 중단 방지
2. founder seeding 8→50건 완성 (ML axis 4 기반 데이터 확보)
3. outcome_resolver GCP 실동작 검증 및 p_win 파이프라인 연결

---

## Scope

| 축 | 작업 | 우선순위 |
|----|------|----------|
| GCP keep-alive | Cloud Scheduler warmup ping + min-instances 설정 | P0 |
| Founder seeding | bulk_import 42건 추가 (목표 50건) | P0 |
| outcome_resolver | GCP에서 pending→outcome_ready 전환 검증 | P1 |
| p_win 파이프라인 | engine_alerts.p_win 채우기 (LedgerStore → engine_alerts 피드) | P1 |
| Refinement UI 검증 | PR #147 머지 후 /lab 리더보드 실데이터 확인 | P2 |

---

## Non-Goals

- ML 모델 재학습 (데이터 50건 확보 후 별도 W 번호)
- UI 대규모 변경
- 새 패턴 추가

---

## Canonical Files

```
engine/api/routes/jobs.py           — db_cleanup 포함 job router
engine/scanner/scheduler.py         — pattern_scan_job, outcome_resolver_job
engine/ledger/store.py              — LedgerStore.compute_stats()
engine/scripts/founder_seed.py      — bulk_import 스크립트
cloudbuild.yaml                     — GCP Cloud Run 빌드 설정
app/src/routes/api/live-signals/    — live-signals proxy (ISR 120s)
app/src/routes/api/refinement/      — refinement proxy routes
app/src/components/lab/RefinementPanel.svelte
```

---

## Facts

1. engine_alerts 710건, 마지막 스캔 2026-04-21 08:28 UTC — 이후 Cloud Run 중단.
2. Cloud Run은 기본 min-instances=0 (scale-to-zero) → 트래픽 없으면 콜드스타트.
3. 현재 founder seeding: 8건 (TRADOOR/PTB 복기 케이스), 목표 50건.
4. outcome_resolver MIN_INTERVAL=3300s(55분), GCP에서 실행 여부 미확인.
5. engine_alerts.p_win 전부 null — ML 점수 파이프라인 미연결.

---

## Assumptions

1. Cloud Scheduler warmup ping (5분 간격) + min-instances=1이면 scale-to-zero 해소 가능.
2. founder_seed.py는 이미 존재하며 추가 케이스만 작성하면 됨.
3. outcome_resolver는 코드상 정상이나 Cloud Scheduler trigger 설정이 누락됐을 가능성 높음.

---

## Open Questions

1. Cloud Run min-instances=1 비용이 허용 가능한가? (항상 켜진 인스턴스 → 월 ~$20 추가)
2. p_win을 언제 engine_alerts에 쓸 것인가? (SCAN 시점 vs 별도 batch)
3. founder seeding 42건: 어떤 패턴/심볼 케이스로 채울 것인가?

---

## Decisions

- [x] live-signals TTL 120s로 변경 (PR #147) — scanner 15분 cadence 기준
- [x] db_cleanup job 추가 (PR #147) — engine_alerts/opportunity_scans 7일 TTL
- [ ] Cloud Run warmup 전략: **min-instances=1 vs 5분 ping** — 결정 필요

---

## Implementation Plan

### Phase A — GCP Keep-alive (P0, 1일)

**Option 1 (권장): min-instances=1**

`cloudbuild.yaml` 또는 Cloud Run service YAML에 추가:
```yaml
--min-instances=1
```
비용: ~$20/월. 장점: 완전한 always-on, 구현 단순.

**Option 2 (저비용): Scheduler warmup ping**

`/jobs/status` 엔드포인트를 Cloud Scheduler로 5분마다 호출.
비용: $0 추가. 단점: cold-start 5분 공백 여전히 발생 가능.

→ 두 옵션 병행 권장: min-instances=1 + warmup ping을 `/healthz` 별도 경량 엔드포인트로.

**실행 순서:**
```bash
# 1. Cloud Run 서비스 업데이트 (min-instances)
gcloud run services update wtd-2 \
  --region asia-southeast1 \
  --min-instances 1

# 2. Cloud Scheduler warmup job (신규 또는 기존 확인)
gcloud scheduler jobs list --location asia-southeast1
```

### Phase B — Founder Seeding 42건 추가 (P0, 2-3일)

패턴 분포 전략:
```
현재: TRADOOR/PTB 복기 8건 (모두 비슷한 패턴)
목표: 패턴 다양성 확보

권장 분포 (42건 추가):
  - volume_spike_breakout    × 10건 (강한 거래량 동반 돌파)
  - engulfing_reversal       × 10건 (반전 캔들 패턴)
  - ema_cross_momentum       × 8건  (EMA 교차 모멘텀)
  - range_squeeze_breakout   × 7건  (박스권 수렴 후 돌파)
  - funding_rate_divergence  × 7건  (펀딩레이트 역행 신호)
```

각 케이스 필드:
```python
{
    "symbol": "BTCUSDT",
    "timeframe": "4h",
    "pattern_slug": "volume_spike_breakout",
    "entry_time": "2024-01-15T08:00:00Z",
    "entry_price": 42500.0,
    "exit_time": "2024-01-18T16:00:00Z",
    "exit_price": 46200.0,
    "direction": "long",
    "verdict": "win",
    "note": "V자 거래량 동반 수평선 돌파, BTC 강세장"
}
```

### Phase C — outcome_resolver 검증 (P1, 0.5일)

1. Supabase에서 pending_outcome 건수 확인
2. `POST /jobs/outcome_resolver/run` 직접 트리거 (GCP endpoint)
3. 결과: outcome_ready 전환 여부 확인

```bash
curl -X POST https://wtd-2-3u7pi6ndna-uk.a.run.app/jobs/outcome_resolver/run \
  -H "Authorization: Bearer $SCHEDULER_SECRET"
```

### Phase D — p_win 파이프라인 (P1, 1일)

현재: LedgerStore가 stats(승률/EV) 계산 가능하지만 engine_alerts.p_win에 쓰지 않음.

목표: SCAN 시점에 `p_win = pattern_stats.success_rate`를 즉시 기록.

변경 위치:
- `engine/scanner/scheduler.py` — `_pattern_scan_job()` 내 Supabase insert 시 p_win 포함

```python
# scanner/scheduler.py 수정 예시
stats = _ledger.compute_stats(slug)
p_win = stats.success_rate if stats.total_instances >= 5 else None

sb.table("engine_alerts").insert({
    ...existing fields...,
    "p_win": p_win,
}).execute()
```

---

## Exit Criteria

- [ ] Cloud Run min-instances=1 적용, `/jobs/status` 5분 ping 스케줄러 동작 확인
- [ ] engine_alerts에 08:28 UTC 이후 데이터 재개 (24시간 내 100건 이상)
- [ ] founder seeding 총 50건 이상 Supabase 저장
- [ ] outcome_resolver GCP trigger 후 pending_outcome 0건 (또는 감소) 확인
- [ ] engine_alerts.p_win 에 null 아닌 값 포함된 행 존재

---

## Handoff Checklist

- [ ] PR #147 머지 확인
- [ ] Cloud Scheduler job 목록 검토 (`gcloud scheduler jobs list`)
- [ ] SCHEDULER_SECRET env var GCP에 설정됨 확인
- [ ] founder_seed.py 스크립트 경로 및 실행 방법 확인
- [ ] LedgerStore.compute_stats() 테스트 커버리지 확인

---

## Next Steps

1. PR #147 머지
2. `gcloud run services update` → min-instances=1
3. founder_seed.py 실행 (42건 추가)
4. outcome_resolver 수동 트리거 후 결과 확인
