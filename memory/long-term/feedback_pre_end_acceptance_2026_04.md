---
name: Pre-end real-acceptance verification
description: Before /end of any session that opens engine PRs, run real-data acceptance tests + perf profiling — pytest unit-green is NOT enough.
type: feedback
---

세션 종료(`/end`) 전에 engine PR을 머지 대기로 두기 전 **실데이터 acceptance + perf 검증**을 반드시 수행한다.

**Why:** 2026-04-27 세션에서 V-01/V-02/V-04/V-06 4 PR 동시 오픈 후 사용자가 "제대로 성능검사까지한거임?"이라 묻자, 실제로는 unit pytest + augment-only diff만 통과시킨 상태였음을 인정해야 했음. PRD §11 acceptance / 실데이터 벤치마크 / latency-memory profiling / dependency import side-effects는 **단위 테스트 green ≠ 성능 OK**이지만 그 갭이 사용자에게 사후에 노출됐음. 사용자 신뢰 손상 위험.

**How to apply:** engine/research/validation/, engine/research/, engine/api/ 등 실데이터 의존 모듈에 PR을 열고 `/end`로 가기 직전, 다음 5개를 의무 체크:
1. **실데이터 acceptance**: PRD §11에 명시된 시나리오 (예: "1 P0 pattern × replay → Result") 실제 실행
2. **Latency 측정**: synthetic 1개 assert 말고 corpus/캐시 데이터로 throughput 측정
3. **메모리 프로파일링** (해당 시): tracemalloc 또는 memory_profiler
4. **Dependency import side-effects**: 새 모듈을 다른 모듈이 import 했을 때 충돌·side-effect 확인
5. **Cross-PR merge conflict 잠재**: 동일 파일 수정 PR 다중일 때 merge 순서 + 통합 PR 검토

**불통과 시**: PR을 open으로 두고 통합/acceptance PR을 별도로 만들어 evidence를 첨부 후에만 사용자가 머지 결정 가능하게 한다. 그냥 "engine CI green이라 OK"라고 보고하지 않는다.
