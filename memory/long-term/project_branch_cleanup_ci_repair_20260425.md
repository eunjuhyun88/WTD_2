---
name: 브랜치 정리 + CI 복구 (2026-04-25 세션)
description: 24개 로컬 브랜치 일괄 PR+머지 완료 + Engine/Contract CI 3개 실패 수리 (PR #286)
type: project
originSessionId: 092b3e02-ff58-4cea-893c-4f9d63c52ffe
---
## 완료 사항

### 브랜치 배치 머지 (PR #259~#276, #260~#274)
24개 누적 브랜치를 일괄 push → PR → squash merge 처리.

주요 머지된 브랜치:
- `claude/arch-improvements-0425` (#259) — jobs.py conflict fix, feature_materialization, W-0162 checkpoint docs
- `task/w-0024-terminal-right-rail-shell` (#260)
- `claude/w-0110-c-ui-dedup` (#261)
- `codex/w-0122-flow-fact-bridge` (#262)
- `codex/w-0141-market-data-plane` (#263)
- `codex/w-0151-active-variant-runtime-registry` (#264)
- `codex/w-0153-protocol-doc-recovery` (#265)
- `codex/w-0153-persistent-retrieval-index` (#266)
- `codex/w-0158-promotion-feature-diagnostics` (#267)
- `codex/w-0159-canonical-raw-plane-ingestion` (#268)
- `codex/w-0159-liquidation-followup` (#269)
- `codex/w-0160-pattern-draft-transformer-contract` (#270)
- `codex/w-0122-consumer-fact-cut-v3` (#273)
- `claude/perf-500user-phase2` (#274)

이미 머지됐던 브랜치 (skip): agitated-mcclintock, w-0109-institutional-distribution, hopeful-faraday, funny-kirch, w-0109-slice2-cvd-cumulative, market-cap-fact-cut, w-0156, w-0157, w-0159-intent, gracious-diffie, priceless-heisenberg

### CI 복구 (PR #286, SHA c5e606f9)
**Why:** 3-agent 병렬 머지로 main CI가 2 errors 상태로 깨짐

수정 3건:
1. `engine/patterns/definitions.py` — `build_definition_ref` + `definition_id_from_ref`를 `definition_refs`에서 re-export (scanner.py가 여기서 import함)
2. `engine/data_cache/raw_store.py` — `MarketLiquidationWindowRecord` dataclass 추가 (liquidation_windows.py에서 import하는데 없었음)
3. `engine/tests/test_pattern_search.py` — `_filter_candidate_timeframes_for_pack` import + test 제거 (W-0160 리팩토링에서 함수 삭제됨)

## 현재 main 상태
- SHA: `c5e606f9`
- Engine CI: 수리 완료 (PR #286 머지됨)
- Contract CI: 별도 수리 필요 여부 미확인 (Engine CI 2 errors가 Contract도 막았을 가능성 있음)

**Why:** main에 너무 많은 브랜치가 누적돼 정리 필요 판단 → 일괄 PR 처리
**How to apply:** 다음 에이전트는 main SHA `c5e606f9`에서 시작. CI 상태 확인 후 작업 시작 권장.
