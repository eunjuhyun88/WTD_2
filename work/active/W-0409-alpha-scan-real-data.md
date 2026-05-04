# W-0409 — alpha_scan 제거 + similar tool 실데이터 배선

> Wave: 6 | Priority: P2 | Effort: M
> Charter: AI Agent 품질 + 보안 (환각 tool 제거)
> Status: ✅ 구현 완료 (PR #1168)
> Created: 2026-05-05

## Goal

`alpha_scan`, `similar` 두 tool이 실제 데이터 없이 LLM만 호출하여 환각 출력을 반환한다. `alpha_scan`은 제거하고, `similar`는 실제 `search_similar_patterns` DB 검색으로 교체한다.

## Owner

미지정

## Scope

- `engine/agents/tools/registry.py`: `alpha_scan` TOOL_SCHEMAS + dispatcher + `_call_alpha_scan` 제거
- `engine/agents/tools/registry.py`: `similar` → `fetch_indicator_snapshot` + `_build_query_spec` + `search_similar_patterns` (3-layer DB 검색)
- `engine/agents/tier.py`: free tier `allowed_tools`에서 `alpha_scan` 제거

## Non-Goals

- `/agent/alpha-scan` HTTP 경로 제거 (별도 pre-computed scores 입력 경로 — 유지)
- Binance Futures OI/funding 공개 API 배선 (별도 work item으로 분리 가능)

## Canonical Files

- `engine/agents/tools/registry.py` — TOOL_SCHEMAS + dispatch_tool + helpers
- `engine/agents/tier.py` — free tier allowed_tools

## Facts

- `alpha_scan` 기존 구현: `generate_llm_text(prompt="심볼: {symbol} 알파 스캔")` — 실데이터 없음
- `similar` 기존 구현: 동일 패턴 — LLM에 symbol만 전달
- `search_similar_patterns` 실제 구현 존재: `engine/research/discovery/candidate_search.py:116`
- `_build_query_spec` 존재: `engine/alpha/scroll_similar_compose.py:52`
- `/agent/alpha-scan` HTTP 경로는 별도 pre-computed scores 수신 경로 (제거 대상 아님)
- 14 tests 통과 (PR #1168)

## Assumptions

- `search_similar_patterns`는 동기 함수 → `asyncio.to_thread()` 래핑 필요
- DB에 충분한 패턴 데이터 존재 시 `similar` candidates 반환

## Open Questions

- `similar` candidates가 없을 때 UX: 빈 배열 반환 vs 메시지?

## Decisions

- `alpha_scan` 완전 제거 (실데이터 없는 환각 tool은 신뢰 위해 제거)
- `similar` 실데이터 교체 (기존 3-layer search engine 활용)
- LLM 중첩 호출 제거 → 레이턴시 개선 + 할루시네이션 제거

## Next Steps

- PR #1168 머지 후 완료
- Binance OI/funding 실데이터 추가가 필요하면 별도 work item 생성

## Exit Criteria

- [x] `alpha_scan` TOOL_SCHEMAS 미포함
- [x] `similar` → `search_similar_patterns` DB 검색 (LLM 호출 없음)
- [x] `tier.py` free tier `allowed_tools`에서 `alpha_scan` 제거
- [x] 14 tests 통과

## Handoff Checklist

- [x] 구현 완료 (PR #1168)
- [x] 테스트 14개 통과
- [ ] PR #1168 머지
