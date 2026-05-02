# W-0386 — Engine Core-Loop Modularization & Reusable Pipeline Spine

> Wave: 5+1 | Priority: P1 | Effort: L (4 phases, 4 PRs)
> Charter: In-Scope (ADR-001 engine-is-canonical)
> Status: 🟡 Design Draft
> Created: 2026-05-02
> Issue: #877
> Sub-tickets: W-0386-A, W-0386-B, W-0386-C, W-0386-D

## Goal

퀀트 운영자가 **단일 facade 호출**로 `data → scan → validate → persist → signal → outcome → feedback` 전체 코어루프를 재현 가능하게 실행하고, 각 stage를 독립 모듈로 교체할 수 있다 — 행위 변경 0, 결과 byte-equal.

## Why Now

- **W-0377(2일전)** scan_signal_events 3-break 응급 수술 완료 — 배관은 뚫렸으나 구조 정리 아님.
- **W-0379 ratchet** 6-layer orchestrator 추가 — 또 다른 진입점이 생겨 현재 **17개+** 경쟁 진입점 존재.
- **engine.research** 가 내부 import 45회 허브 → 새 시그널 도메인(W-0370/0378/0384/0385) 추가 때마다 결합 누적. 지금 막지 않으면 Phase 3 규모로 폭발.
- **pattern_search.py 3143 / feature_calc.py 1897 / scheduler.py 611** — 단일 파일 크기가 코드 리뷰 불가 수준.

## Scope

**포함:**
- `engine/core_loop/` 신규 패키지 — Stage Protocol + facade + ports
- `engine/pipeline.py` 458 → ≤120 lines (facade화, backward-compat 유지)
- `engine/research/` → 4 sub-packages 재배치 (discovery / validation / ensemble / artifacts)
- `engine/scanner/scheduler.py` 611 → ≤350 lines + Job Protocol
- `import-linter` CI gate 등록
- ADR-012 신규 + ADR-006/009 cross-link
- Integration golden test (5 sym × 30d, parquet sha256 고정)

**제외 (이유):**
- `pattern_search.py` 3143 lines 분해 → 별도 W-#### (알고리즘 로직 포함, 행위 변경 위험)
- `feature_calc.py` 1897 lines 분해 → 별도 W-#### (scanner 핵심, 단독 범위)
- migration 추가 → 스키마 동결 (행위 변경 0 원칙)
- W-0370/0378/0384/0385 기능 변경 → 해당 ticket 스코프

## Architecture Decision

### 핵심 결정

| ID | 결정 | 선택 이유 | 거절 옵션 + 이유 |
|---|---|---|---|
| D-1 | facade + 단계 이전 | W-0370/0378 락 충돌 없이 Phase 단위 머지 가능 | 빅뱅 rename: 50+ 파일 동시 변경 → 머지 충돌 폭발 |
| D-2 | 4 sub-package 분해 | `from engine.research` 45→≤12, 새 도메인 추가 위치 명확 | 모노 유지 + 내부 정리: 결합 해소 불가, 재발 100% |
| D-3 | import-linter CI gate | drift 재발 방지 (ADR-006 이후 진입점 8→17 증가 사례) | convention 가이드만: drift 100% 재발 보장 |
| D-4 | golden snapshot (parquet sha256) | 50+ 파일 이동 후 비트 동일성 증명 필요 | behavior trust: BH-FDR/random seed 미세 drift 잡지 못함 |
| D-5 | `engine/core_loop/` 신규 패키지 | spine + contracts + ports + builder SRP 분리 필요 | pipeline.py 단일 파일 확장: 458 → 다시 비대화 |

### 최종 디렉토리 구조 (after Phase D)

```
engine/
├── core_loop/               # 신규 (Phase B)
│   ├── __init__.py
│   ├── spine.py             # Stage Protocol (data/scan/validate/persist/report)
│   ├── contracts.py         # PipelineRequest / PipelineResult / StageResult
│   ├── ports.py             # DataPort / SignalStorePort / OutcomeStorePort / LedgerPort
│   └── builder.py           # CoreLoopBuilder fluent API (Phase D)
├── pipeline.py              # facade ≤120 lines (Phase B에서 축소)
├── research/
│   ├── __init__.py          # backward-compat re-export shim (DeprecationWarning)
│   ├── discovery/           # 신규 sub-package (Phase C)
│   │   ├── __init__.py
│   │   ├── autoresearch_loop.py
│   │   ├── autoresearch_runner.py
│   │   ├── orchestrator.py
│   │   ├── discovery_agent.py
│   │   ├── pattern_discovery_agent.py
│   │   ├── query_transformer.py
│   │   ├── candidate_search.py
│   │   ├── sweep_parameters.py
│   │   ├── paradigm_framework.py
│   │   ├── event_tracker/   (이동)
│   │   ├── pattern_scan/    (이동)
│   │   └── proposer/        (이동)
│   ├── validation/          # 기존 → 보강 (Phase C)
│   │   ├── __init__.py
│   │   ├── runner.py
│   │   ├── facade.py
│   │   ├── ablation.py
│   │   ├── alpha_quality.py
│   │   ├── eval_protocol.py
│   │   ├── stats.py
│   │   └── ratchet.py       (이동)
│   ├── ensemble/            # 기존 → 보강 (Phase C)
│   │   ├── __init__.py
│   │   ├── role_pipeline.py
│   │   ├── backtest.py      (이동)
│   │   ├── backtest_cache.py(이동)
│   │   ├── pattern_refinement.py (이동)
│   │   ├── market_retrieval.py   (이동)
│   │   └── similarity_ranker.py  (이동)
│   └── artifacts/           # 신규 sub-package (Phase C)
│       ├── __init__.py
│       ├── finding_store.py
│       ├── blocked_candidate_store.py
│       ├── blocked_patterns.py
│       ├── autoresearch_ledger_store.py
│       ├── signal_event_store.py    # W-0370 머지 후 이동
│       ├── state_store.py
│       ├── feature_catalog.py
│       ├── feature_windows.py
│       ├── feature_windows_builder.py
│       ├── feature_windows_supabase.py
│       ├── tracker.py
│       ├── dlq_replay.py
│       └── capture_benchmark.py
├── scanner/
│   ├── scheduler.py         # 611 → ≤350 lines (Phase D)
│   └── jobs/
│       ├── protocol.py      # Job Protocol 신규 (Phase D)
│       ├── registry.py      # job 등록부 신규 (Phase D)
│       ├── universe_scan.py # Protocol 채택
│       ├── alpha_observer.py
│       ├── alpha_warm.py
│       └── outcome_resolver.py
└── tests/
    └── integration/
        └── test_core_loop_spine.py  # golden test (Phase D)
```

### 명명 규칙

- sub-package `__init__.py`는 `__all__` ≥ 5 심볼 export
- Phase C 이동 파일: git mv 사용 (history 보존)
- Job Protocol: `name: str`, `schedule: str (cron)`, `run(ctx: JobContext) -> JobResult`
- backward-compat shim: `from engine.research.discovery.orchestrator import ...` (DeprecationWarning 부착)

### 데이터 흐름

```
CoreLoopBuilder
  .with_data(DataPort)           # data_cache.backfill_async
  .with_signal_store(port)       # research.artifacts.signal_event_store
  .with_outcome_store(port)      # scanner.jobs.outcome_resolver
  .with_ledger(LedgerPort)       # ledger.store
  .build()
  → CoreLoop.run(PipelineRequest) → PipelineResult

# 기존 호환 경로 (DeprecationWarning)
engine.pipeline.ResearchPipeline.run() → core_loop.spine.Stage 순서 위임
```

### 컴포넌트 경계 규칙

- `core_loop/spine.py`: Stage Protocol만 정의. 구현 없음.
- `core_loop/ports.py`: I/O 인터페이스만. 구체 스토어 import 금지.
- `research/discovery/`: "새 패턴 후보 발견" 책임만.
- `research/validation/`: "통계적 유효성 검증" 책임만. 발견/저장 없음.
- `research/ensemble/`: "기존 패턴 조합/백테스트" 책임만.
- `research/artifacts/`: "저장소 I/O" 책임만. 비즈니스 로직 없음.

## Sub-ticket 목록

| 티켓 | 작업 | 선행 조건 | 예상 PR 크기 |
|---|---|---|---|
| W-0386-A | Boundary Audit — import-linter + 그래프 캡처 | 없음 | ~4 파일 |
| W-0386-B | Core Loop Spine + facade | W-0386-A merged | ~8 파일 |
| W-0386-C | research/ 4-subpackage 분해 | W-0386-B merged + **W-0370 merged** | ~60 파일 (git mv 위주) |
| W-0386-D | Scanner 의존 역전 + Golden Test | W-0386-C merged + **W-0378 merged** | ~12 파일 |

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 전략 |
|---|---|---|---|
| import cycle 발생 | 중 | 고 | Phase A import-linter 룰 ≥ 6, CI gate. Phase B에서 cycle 없는 spine 설계 |
| W-0370/0378 파일 충돌 | 중 | 중 | Phase C는 W-0370 머지 후, Phase D는 W-0378 머지 후 게이트 |
| Cloud Run scheduler 깨짐 | 중 | 고 | facade DeprecationWarning 4주 유지. `python -m engine.pipeline` CLI 호환 |
| 거대 PR 리뷰 불가 | 고 | 중 | Phase별 분리 (각 PR ≤ 800 line diff), Phase C는 git mv 위주라 diff 신뢰도 높음 |
| silent regression | 중 | 고 | golden snapshot (parquet sha256) + BH-FDR atol=0 |

### Rollback Plan

각 Phase는 독립 revert 가능.
- Phase A revert: `.importlinter` + `tools/import_audit.py` 제거
- Phase B revert: `engine/core_loop/` 제거, `engine/pipeline.py` 원복
- Phase C revert: git mv 역방향 (history 있으므로 `git mv` 역으로)
- Phase D revert: `scheduler.py` 원복, integration test 제거

### Files Touched (실측 기반)

Phase A: 4 (tools/import_audit.py, .importlinter, pyproject.toml, docs/architecture/import_graph_2026-05-02.md)
Phase B: 8 (core_loop/ 4파일, pipeline.py 축소, engine/tests/test_pipeline_compat.py)
Phase C: ~60 (research/ 내 git mv 위주)
Phase D: ~12 (scheduler.py, jobs/protocol.py, jobs/registry.py, jobs/ 4개 표준화, tests/integration/test_core_loop_spine.py, ADR-012.md)

## AI Researcher 관점

### 데이터 흐름 무결성

- 행위 변경 0 보장: 파일 이동만, 알고리즘 로직 수정 없음
- BH-FDR p-value vector: Phase B snapshot test에서 atol=0 확인
- triple-barrier P&L 계산: outcome_resolver 수정 없음 (Phase D Job Protocol은 schedule 메타만)
- live monitor cadence: scheduler 인터페이스 재구성만, cron 표현식 동일

### 마이그레이션 안전성

1. Phase B snapshot test → parquet sha256 byte-equal (5 sym × 30d)
2. Phase C: `pytest --collect-only` → ImportError 0 확인 후 merge
3. Phase D: KS-test p>0.99 (pattern_outcomes 분포 전후 동일)

## Open Questions

- [ ] [Q-1] `pattern_search.py` 3143 lines — 별도 W-####로 분리? (현재 Non-Goal, 확인 필요)
- [ ] [Q-2] `feature_calc.py` 1897 lines — `engine/features/`와 중첩 책임 정리, 별도 W-####?
- [ ] [Q-3] Cloud Run deprecation window: 4주 vs 8주?
- [ ] [Q-4] `live_monitor.py` / `event_tracker/` / `pattern_scan/` → discovery/ 배치 확정?
- [ ] [Q-5] ADR-012 신규 vs ADR-006/009 갱신?

## Exit Criteria (전체 W-0386)

- [ ] AC1: import-linter rules ≥ 6 등록, CI gate green
- [ ] AC2: `engine/pipeline.py` ≤ 120 lines, `python -m engine.pipeline` 호환 유지
- [ ] AC3: `from engine.research` (직접 top-level) 45 → ≤ 12
- [ ] AC4: 4 sub-packages 각자 README + `__all__` ≥ 5 심볼
- [ ] AC5: `scanner/scheduler.py` ≤ 350 lines, 4/4 jobs Job Protocol 채택
- [ ] AC6: golden test 1개 (5 sym × 30d, parquet sha256 고정), BH-FDR atol=0, KS-test p>0.99
- [ ] AC7: 신규 테스트 ≥ 13개 (12 unit + 1 integration)
- [ ] AC8: 4 PR 모두 merged + CURRENT.md SHA 4회 업데이트
- [ ] AC9: ADR-012 신규 + ADR-006/009 cross-link
- [ ] CI green (lint + type + test) 전 PR
- [ ] Contract CI green 전 PR
