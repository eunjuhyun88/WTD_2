# CURRENT — 2026-05-01

> 신규 진입자: `./tools/start.sh` 출력 확인 후 아래 활성 work item만 본다.

---

## main SHA

`3509373d` — origin/main (2026-05-01) — W-0365+W-0366 (#814) + W-0367 (#813) + W-0368 패턴 hardening + wallet fix (#822)

---

## 활성 Work Items

| Work Item | Priority | 상태 |
|---|---|---|
| `W-0352-pipeline-top-patterns-api` | P1 | 🟡 Design Draft |
| `W-0364-500ccu-perf-extension` | P1 | 🟡 In Progress |
| `W-0304-multichart-per-pane-indicator-scope` | P2 | 🟡 Design Draft |

---

## Wave 5 실행 계획 (2026-05-01)

```
완료:  W-0365 P&L verdict ✅ | W-0366 indicator filters ✅ | W-0367 alpha loop ✅ | W-0368 hardening ✅
즉시:  W-0352 top-patterns API → alpha 1cycle 완성
다음:  W-0364 500ccu perf extension → W-0304 per-pane indicator
```

---

## 핵심 lesson (이번 세션)

- **worktree CACHE_DIR 버그**: `list_cached_symbols`가 worktree-local 빈 디렉토리 참조 → `_primary_cache_dir()` 사용으로 해결. git 기반 shared cache 경로 확인 필수
- **Contract CI**: engine 엔드포인트 추가 시 `npm run contract:sync:engine-types` + 커밋 필수 (자동 sync 있어도 CI 트리거 타이밍 문제 가능)
- **migration 테이블 혼용**: `pattern_outcomes`(legacy) vs `ledger_outcomes`(canonical) — migration은 canonical 테이블에 적용

---

## Frozen (Wave 5 기간 중 비접촉)

- Copy Trading Phase 1+
- Chart UX polish (W-0212류)
- Phase C/D ORPO/DPO (GPU 필요)
- AI 차트 분석, 자동매매, 신규 메모리 stack

---

## 다음 실행

```bash
./tools/start.sh
cat work/active/W-0352-pipeline-top-patterns-api.md
# W-0369 설계: alpha invite gating + 4 telemetry events
```
