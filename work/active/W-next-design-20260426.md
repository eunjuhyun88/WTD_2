# 다음 작업 설계 — A010 이후 (2026-04-26 업데이트)

> 작성: A010 세션 종료. main=`4c02cd0f`. 엔진 1448 passed, 0 failed.

---

## 현황 요약

| 레이어 | 상태 |
|---|---|
| 엔진 인프라 P0-P2 | ✅ PR #281 머지 |
| PromotionReport canonical features (W-0202) | ✅ PR #291 머지 |
| Active Variant Registry upsert (W-0151) | ✅ store.upsert() 구현 / Live Monitor 자동연동 없음 |
| PatternSeedScoutPanel UI | ✅ UI + state vars / 백엔드 API 없음 |
| JWT Security (W-0162) | ✅ PR #253 머지 / P1-P2 추가 미완 |
| 인프라 (GCP/Vercel) | ❌ 사람이 직접 실행 필요 |

---

## W-0204 — Active Variant → Live Monitor 자동 연동

### 목표
`active_variant_store.upsert()` 후 `live_monitor.py`가 동적으로 watch 리스트를 갱신.

### 현재 흐름
```
run_pattern_benchmark_search() → active_variant_store.upsert(entry)
                                  ↓
live_monitor는 수동 설정된 variant만 watch (reload 없음)
```

### 목표 흐름
```
run_pattern_benchmark_search() → active_variant_store.upsert(entry)
                                  ↓ callback
live_monitor.reload_active_variants() → 동적 watch 리스트 갱신
```

### 구현 계획
1. `ActivePatternVariantStore.list_all()` 존재 여부 확인 → 없으면 추가
2. `live_monitor.py` — `reload_active_variants()` 메서드:
   - `active_variant_store.list_all()` 호출
   - 현재 slugs와 diff → 추가/제거
3. `run_pattern_benchmark_search()` upsert 후 callback 파라미터로 전달 (옵션 A, 단순)

### Exit Criteria
- `active_variant_store.upsert()` 후 `live_monitor` watch_slugs에 자동 반영
- 테스트: monkeypatch upsert → reload 호출 확인

---

## W-0205 — PromotionReport → PatternSeedScoutPanel UI

### 목표
Scout 패널에서 검색 실행 → `canonical_feature_score`, gate 결과 카드 표시.

### 구현 계획

**Step 1: API 엔드포인트**
```
POST /api/research/benchmark-search
  body: { pattern_slug, benchmark_pack_id, variants?, ... }
  → run_pattern_benchmark_search() 호출
  → { promotion_report, winner_variant_slug, handoff_payload } 반환
```

**Step 2: Svelte 연동**
```svelte
// PatternSeedScoutPanel.svelte
async function runSearch(config) {
  currentRunId = crypto.randomUUID();
  const res = await fetch('/api/research/benchmark-search', {
    method: 'POST', body: JSON.stringify(config)
  });
  const artifact = await res.json();
  // 결과: promotion_report.decision, canonical_feature_score, gate_results
}
```

**Step 3: 결과 카드 표시**
- `decision` badge: `promote_candidate` (녹색) / `reject` (빨간색)
- `canonical_feature_score` 퍼센트 바 (0~1)
- `gate_results` 테이블: reference_recall, phase_fidelity, holdout_passed

### Exit Criteria
- Scout 패널에서 검색 실행 → 결과 카드 표시
- `decision == "promote_candidate"` 시 배지 + active variant 자동 등록

---

## 인프라 체크리스트 (사람이 직접)

- [ ] GCP Cloud Build trigger — cogotchi-worker 자동 빌드
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY` — 프로덕션 환경변수
- [ ] Cloud Scheduler — HTTP jobs 5개 (`docs/runbooks/cloud-scheduler-setup.md`)

---

## A011 권장 실행 순서

```
1. git pull origin main (4c02cd0f)
2. 새 브랜치: feat/w-0204-live-monitor-auto-sync
3. W-0204 구현 → 테스트 → 커밋
4. W-0205 API 엔드포인트 → Svelte 연동 → 커밋
5. PR → 머지 → CURRENT.md 업데이트
```
