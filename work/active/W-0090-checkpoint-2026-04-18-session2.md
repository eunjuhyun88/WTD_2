# W-0090 Checkpoint — 2026-04-18 Session 2 (Post-CI Fix)

## What happened this session

### 1. 사업성 분석 + 설계 문서화

- 제품 정체성 재정의: "AI 시그널" → "Tesla-style 라벨링 플라이휠 + Bloomberg형 크립토 퍼프 터미널"
- 플라이휠 비완결 원인 진단: app과 engine이 capture store를 따로 가지며 서로 호출하지 않음
- 설계 문서 3개 저장 + main 머지 (`d8831d9`)

| 파일 | 내용 |
|---|---|
| `docs/product/flywheel-closure-design.md` | 4축 파이프라인 설계 (capture→outcome→verdict→refinement), A-E phase 로드맵, 6-KPI |
| `docs/product/business-viability-and-positioning.md` | 제품 wedge, 6-KPI 사업 게이트, cold-start 전략, 가격 tiers, feature freeze 목록 |
| `docs/decisions/ADR-007-work-item-wip-discipline.md` | 3-tier 구조 (wip/active/completed), WIP cap 5, 아카이브 규율 |
| `work/active/W-0088-flywheel-closure-capture-wiring.md` | Phase A 액션 work item |

### 2. Vercel 빌드 전면 실패 수정

- **원인**: `SaveSetupModal.svelte` 라인 76-114와 116-153 동일 블록 중복 (머지 충돌 해결 실수)
- **증상**: PR #77 이후 모든 Vercel 배포 `Error`
- **수정**: 39줄 삭제 → `vite build` 통과 (43초)
- **커밋**: `78374df` → main 직접 머지 (hotfix)

### 3. Engine CI 테스트 전면 수정

이전에 알려진 2개 실패 + 신규 발견 6개 = 총 8개 → 0개로 수정.

| 테스트 파일 | 실패 원인 | 수정 |
|---|---|---|
| `test_security_runtime.py` (7개) | `get_public_runtime_security_errors` 미구현, `build_allowed_origins/hosts` 시그니처 불일치, warning 메시지 다름 | `security_runtime.py` 전면 재작성 |
| `test_research_inspection.py` (1개) | `record_operator_decision`, `upsert_pattern_control_state` 등 4개 메서드 + SQLite 테이블 미구현 | `state_store.py` — `OperatorDecision`, `PatternControlState` 추가 |
| `test_ops_reconcile.py` (5개), `test_ops_cli.py` (1개) | tmp git repo에서 commit 시 Claude Code 서명 서버 400 오류 | `_init_repo`에 `commit.gpgsign=false` 추가 |

**최종**: `741 passed, 0 failed` → main 머지

## 현재 main 상태

```
d2e0d31  research: update experiment log (session artifact)
2cc55f3  fix(engine/tests): disable commit signing in tmp git repos
a2ca2eb  hotfix: repair 2 pre-existing engine CI test failures
78374df  hotfix: remove duplicate viewportPreview block
d8831d9  Merge claude/summarize-work-4kTb1 (flywheel design + positioning + ADR)
```

## 엔진 테스트 현황

- **전체**: 741 passed, 4 skipped, 0 failed
- **Vercel 배포**: 다음 트리거부터 정상 복구 예상
- **Engine CI**: engine/** 변경 시 자동 실행, 서명 문제 해결로 전 케이스 통과

## 다음 우선순위

1. **W-0088 Phase A 실행**: `app/src/lib/server/terminalPersistence.createPatternCapture` → engine HTTP dual-write 교체. 플라이휠 1축 닫기.
2. **outcome_resolver 스케줄러 잡** (Phase B): `pending_outcome` capture를 자동으로 outcome으로 닫는 잡 신규 작성
3. **outcome_policy.py** 신규: `entry_profitable_at_N` 첫 구현 (W-0086 next step #1)
4. **W-0088 work item 번호 충돌 정리**: main에 `W-0088-promotion-gate-trading-edge-metric.md`와 `W-0088-flywheel-closure-capture-wiring.md` 두 개 존재. 후자를 W-0092로 rename 필요.

## 결정 사항

- `commit.gpgsign=false` 를 test fixture `_init_repo`에 추가하는 것이 올바른 패턴 (CI에 영향 없음, 로컬 환경 격리)
- Vercel hotfix와 engine test fix 모두 PR 없이 main 직접 머지 (hotfix 정책)
- 플라이휠 미완결 원인은 code bug가 아니라 wiring gap (두 capture store 분리)
