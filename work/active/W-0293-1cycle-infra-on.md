# W-0293 — 1사이클 인프라 ON (GAP-B/D Cloud Run env vars)

> Wave: MM | Priority: P0 | Effort: XS (5분)
> Charter: In-Scope L7 (Refinement loop)
> Status: 🟡 Design Approved
> Created: 2026-04-29
> Issue: #581
> Depends on: W-0288 (offline=False, PR #564 ✅), W-0284 (GateV2DecisionStore, PR #565 ✅)

---

## Goal

`ENABLE_PATTERN_REFINEMENT_JOB=true` + `ENABLE_SEARCH_CORPUS_JOB=true` GCP Cloud Run 환경변수 적용으로 refinement loop + corpus 갱신을 실제 가동, 패턴→검증→gate→알림 1사이클을 완성한다.

---

## 현재 상태 (실측)

```
engine/scanner/scheduler.py:70
  PATTERN_REFINEMENT_ENABLED = os.environ.get("ENABLE_PATTERN_REFINEMENT_JOB", "false")
  → GCP 미적용 → refinement_trigger 조건 충족해도 아무 일도 안 함

engine/scanner/scheduler.py:78
  SEARCH_CORPUS_ENABLED = os.environ.get("ENABLE_SEARCH_CORPUS_JOB", "false")
  → corpus_bridge_sync_job은 always_on이지만 search index rebuild는 비활성
```

코드는 PR #564/#565 (main `cc84df95`)에서 완전히 빌드됨. **env var만 ON하면 된다.**

---

## Scope

**포함 (인프라 설정만 — 코드 변경 0줄)**
- GCP Cloud Run `cogotchi-engine` 서비스 env var 2개 추가
- `docs/runbooks/cloud-run-env-vars.md` 신규 (apply/verify/rollback)

**제외**
- scheduler.py 코드 변경 없음 (default "false"는 로컬 테스트용으로 유지)
- refinement job 자체 로직 변경 없음

---

## 구현

```bash
# 적용 (--update-env-vars 사용 — 기존 env var 보존)
gcloud run services update cogotchi-engine \
  --region asia-northeast3 \
  --update-env-vars "ENABLE_PATTERN_REFINEMENT_JOB=true,ENABLE_SEARCH_CORPUS_JOB=true"

# 검증
gcloud run services describe cogotchi-engine \
  --region asia-northeast3 \
  --format="yaml(spec.template.spec.containers[0].env)" \
  | grep -E "ENABLE_PATTERN|ENABLE_SEARCH"

# rollback (필요 시)
gcloud run services update cogotchi-engine \
  --region asia-northeast3 \
  --update-env-vars "ENABLE_PATTERN_REFINEMENT_JOB=false,ENABLE_SEARCH_CORPUS_JOB=false"
```

**주의**: `--set-env-vars`는 기존 env var 전체를 교체함. 반드시 `--update-env-vars` 사용.

---

## CTO 관점

### 위험도

| 항목 | 현재 | 활성화 후 |
|---|---|---|
| CPU 부하 | 0 | ~5-10분 validation run/패턴 (조건부) |
| Binance API 호출 | 0 (offline=False + TTL 1h 캐시) | 최대 53패턴 × 1회/7일 |
| DB 쓰기 | 0 | PatternSearchArtifactStore.update × N |
| 장애 시 영향 | 없음 | refinement_trigger → 빈 결과 (non-fatal) |

### Hard Limits (이미 코드에 설치됨)
- `refinement_trigger`: verdict_count ≥ 10 AND days_since ≥ 7 조건부 실행
- 신규 패턴은 즉시 트리거 안 됨 → 초기 폭주 없음

---

## AI Researcher 관점

- **V-05 활성화 효과**: BTC 하락 regime (-10%/30일) 시 hit_rate 임계값 ↑ → 하락장 패턴 10-20% 추가 탈락 예상
- **Refinement 효과**: 초기 validation n<30 → 재검증 n≥10 → G1 t-stat 신뢰성 증가 → 초기 pass 패턴 일부 revoke
- **Failure mode**: `offline=False` 전환 후 Binance 장애 → V-05 skip (기존과 동일 동작, non-fatal)

---

## Exit Criteria

- [ ] AC1: `gcloud run services describe cogotchi-engine` 출력에 `ENABLE_PATTERN_REFINEMENT_JOB=true` + `ENABLE_SEARCH_CORPUS_JOB=true` 둘 다 포함
- [ ] AC2: 24h 후 Cloud Run logs에 `pattern_refinement_job` invocation 1+ 회 기록 (`gcloud logging read`)
- [ ] AC3: refinement queue 폭주 없음 (invoke count ≤ 10/24h, hard limit 준수)

---

## 실행 (사용자 직접)

```bash
! gcloud run services update cogotchi-engine \
  --region asia-northeast3 \
  --update-env-vars "ENABLE_PATTERN_REFINEMENT_JOB=true,ENABLE_SEARCH_CORPUS_JOB=true"
```

`!` prefix로 이 세션에서 직접 실행 가능.

---

## References

- `engine/scanner/scheduler.py:70,78` — env var 위치 실측
- W-0288 (PR #564) — offline=False + TTL cache
- W-0284 (PR #565) — GateV2DecisionStore
- W-0289 (PR #573) — 스케줄러 ON, hybrid role 확인
