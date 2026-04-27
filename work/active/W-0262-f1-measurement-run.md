# W-0262 — F1 Measurement Run: V-08 Pipeline으로 P0 패턴 5종 실측

**Owner:** research (engine)
**Status:** Ready — V-08 pipeline.py 머지됨 (PR #485, 2026-04-28)
**Type:** Measurement script + result artifact
**Depends on:** W-0221 V-08 ✅, W-0219 V-03 ✅, W-0217 V-01 ✅, W-0218 V-02 ✅, W-0220 V-06 ✅
**Estimated effort:** 1.5일 (script 0.5d + 실측 0.5d + 결과 분석 0.5d)
**Parallel-safe:** ✅ read-only (pattern_search.py augment-only, kline cache read-only)

---

## Goal

W-0216 F1 Falsifiable Kill Criteria의 **첫 번째 실측 실행**:
`run_validation_pipeline`으로 P0 패턴 5종 × 3 horizon (1h/4h/24h) = 15 sub-eval을 돌려
BH-corrected t-test 통과율을 측정한다. 통과율 0% → F1 KILL (system frame 재설계).

사용자 가치: "MM Hunter가 실제로 edge를 찾는지 1주 안에 확인" — 스펙이 아닌 데이터.

---

## Owner

research

---

## Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/scripts/run_f1_measurement.py` | new | CLI entry — 5 P0 패턴 × 3 horizon 실행 |
| `engine/research/validation/falsifiable_kill.py` | new | F1 KILL 판정 함수 (W-0216 §6.1 spec 이행) |
| `engine/research/results/f1_measurement_YYYYMMDD.json` | new (artifact) | ValidationReport JSON 저장 |
| `engine/research/validation/__init__.py` | edit | falsifiable_kill export 추가 |

---

## Non-Goals

- ❌ pattern_search.py 수정 (V-00 augment-only)
- ❌ V-05/V-11 gate 통합 (별도 W-0223/W-0224)
- ❌ F2/F3/F4 측정 (이번은 F1만)
- ❌ UI 시각화 (V-10 Hunter UI 별도)
- ❌ 재측정 cron 스케줄러 (V-09 별도)

---

## Exit Criteria

```
[ ] engine/research/scripts/run_f1_measurement.py 실행 가능
[ ] 5 P0 패턴 슬러그 config 주입 가능
[ ] ValidationReport JSON artifact 생성됨 (engine/research/results/)
[ ] f1_kill 필드 True/False 확정
[ ] falsifiable_kill.py: check_f1_kill(reports) → F1KillResult(killed, pass_rate, pattern_results)
[ ] pass_rate > 0.0 → PASS / == 0.0 → KILL (W-0216 §6.1)
[ ] BH-corrected p-value 결과 콘솔 출력 (패턴별 horizon별)
[ ] 실행 시간 <5분 (kline cache hit 전제)
```

---

## Facts (현재 코드 실측)

```
engine/research/validation/pipeline.py   ✅ merged PR #485
  run_validation_pipeline(pack, phase_name, config, entry_timestamps)
  → ValidationReport.f1_kill: bool
  → ValidationReport.to_dashboard_json()

engine/research/validation/baselines.py  ✅ merged PR #485
  measure_b0_random, measure_b1_buy_hold

engine/research/validation/ablation.py   ✅ merged PR #484
  run_ablation, get_signal_list, AblationResult

engine/research/pattern_search.py:576
  BenchmarkPackStore.ensure_default_pack(pattern_slug) → ReplayBenchmarkPack

engine/research/pattern_search.py:163
  class ReplayBenchmarkPack (NOT BenchmarkPack)
```

---

## Assumptions

- kline cache에 BTCUSDT 1h 최소 365일 데이터 존재
- `BenchmarkPackStore.ensure_default_pack(slug)` 로 pack 자동 생성/로드
- P0 패턴 5종 슬러그: `patterns/library.py` 또는 `spec/PRIORITIES.md §3` 에서 확인 필요
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 환경변수 설정됨

---

## Performance / Security (CTO)

- **성능**: kline 1회 로드 후 재사용. 15 sub-eval <5분 (cache hit)
- **N+1**: 없음 — pack 일괄 로드 후 loop
- **안정성**: CacheMiss → f1_kill=True + 경고 출력 (graceful)
- **보안**: 내부 CLI 전용, 외부 API 미노출, secret env var
- **멱등성**: result JSON 날짜 suffix (덮어쓰기 없음)

---

## Canonical Files

```
engine/research/scripts/run_f1_measurement.py    (신규)
engine/research/validation/falsifiable_kill.py   (신규)
engine/research/results/                         (디렉터리 신규)
engine/research/validation/__init__.py           (export 추가)
```

---

## Open Questions

- Q1: P0 패턴 5종 슬러그 정확한 위치? (`patterns/library.py` 확인 필요)
- Q2: F1 KILL 발동 시 escalation — 자동 알림 vs 수동 보고?
- Q3: BenchmarkPackStore cold start 시 pack 생성 시간?

---

## Next (F1 측정 완료 후)

- pass_rate > 0 → V-11 Gate v2 (W-0224) 착수
- pass_rate == 0 (F1 KILL) → CTO 재설계 세션 소집
- F2/F3/F4 측정 일정 (W-0216 §6 table)

---

*W-0262 v1.0 created 2026-04-28 by Agent A054 — /검증 수정 시 W-0261 충돌 해소로 재번호.*
