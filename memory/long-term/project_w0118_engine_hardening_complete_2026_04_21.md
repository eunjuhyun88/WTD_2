---
name: W-0118 Engine Structural Hardening — COMPLETE (2026-04-21)
description: 엔진 구조 갭 6개 완전 완료. PR #138 main 머지 (a38e4473). 1193 tests pass.
type: project
---

W-0118 완전 완료. PR #138 main 머지 (2026-04-21).
Commit: `a38e4473`

**Why:** 엔진 피처 95% + 보안 완료 후, 구조 내구성(40%) 갭 6개 순서대로 닫음.

**How to apply:** 엔진 완성 상태. patterns/registry.py, ledger/types.py typed planes, capture endpoint 모두 사용 가능.

## 3개 커밋 내용

| 커밋 | 내용 |
|------|------|
| c7a4729e | Slice 2: entry_scorer.py pattern-keyed ML (5-dim identity) |
| eaff134a | Slice 3: POST /{slug}/capture + SvelteKit proxy + 2 tests |
| fc871f2f | Slice 4+5+6: registry.py + typed ledger planes + adaptEngineStats() |

## 신규 파일

- `engine/patterns/registry.py` — PatternRegistryStore (JSON-backed, slug당 1파일, startup 시딩)
- `app/src/routes/api/patterns/[slug]/capture/+server.ts` — capture 프록시
- `app/src/lib/types/patternStats.ts` — PatternStats 타입 + adaptEngineStats()

## 수정 파일

- `engine/patterns/entry_scorer.py:76-80` — pattern-keyed model id
- `engine/patterns/library.py` — registry seed on import
- `engine/api/routes/patterns.py` — capture + registry 엔드포인트 추가
- `engine/ledger/types.py` — EntryPayload/ScorePayload/OutcomePayload/VerdictPayload/ModelPayload/TrainingRunPayload
- `app/src/routes/api/patterns/stats/+server.ts` — adaptEngineStats() 사용
- `.gitignore` — engine/pattern_registry/*.json 제외
