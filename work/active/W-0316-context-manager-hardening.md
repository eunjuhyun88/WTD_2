# W-0316 — Cursor-style Context Manager Hardening

> Wave: 5 (Productivity) | Priority: P1 | Effort: XS
> Charter: In-Scope (개발 에이전트 컨텍스트 관리 품질 보강)
> Status: 🟢 Completed — slash/MCP restart checks deferred
> Created: 2026-04-30

---

## Goal

이미 만든 Cursor식 컨텍스트 관리(`/컨텍스트`, serena MCP, LSP allow, context-pack fallback)를 실제 파일 기준으로 재검증하고, 설계 문서가 구현 상태를 정확히 설명하게 만든다.

---

## Owner

meta / context tooling

---

## Scope

- `tools/context-pack.sh` smoke 검증 및 macOS bash 호환성 수정
- W-0299/W-0300 설계 문서의 canonical 관계 정리
- W-0297 serena MCP 설정 문서와 실제 `.mcp.json` 불일치 정정
- W-0295 context boot trim의 현재 토큰 실측 반영

---

## Non-Goals

- 제품 코드 변경 없음
- 자동 컨텍스트 주입(SessionStart hook) 구현 없음
- 벡터 인덱서 직접 빌드 없음
- 현재 앱 contract cleanup 브랜치 변경과 혼합 없음

---

## Canonical Files

- `.claude/commands/컨텍스트.md`
- `tools/context-pack.sh`
- `.mcp.json`
- `.claude/settings.json`
- `work/completed/W-0297-cursor-grade-code-accuracy.md`
- `work/completed/W-0299-cursor-context-manager.md`
- `work/completed/W-0300-cursor-context-manager.md`
- `work/completed/W-0295-context-boot-trim.md`

---

## Facts

- W-0299가 실제 구현 기준 canonical 문서이고, W-0300은 같은 기능의 stale draft다.
- `.claude/commands/컨텍스트.md`, `tools/context-pack.sh`, `.mcp.json`, LSP allow는 이미 main에 존재한다.
- 재검증 전 `tools/context-pack.sh`는 macOS `/bin/bash` 3.2에서 `${var,,}` 때문에 실패했다.
- `W-0299` 번호는 cursor-context와 harness-reliability 양쪽에 존재한다. helper는 정렬된 경로 기준으로 deterministic하게 선택해야 한다.
- `tools/measure_context_tokens.sh` 현재 실측은 4,173 tokens로 목표 ≤5,000을 만족한다.

---

## Assumptions

- Claude/Codex slash command 인식은 앱 재시작 후 수동 확인이 필요하다.
- serena MCP는 `.mcp.json` 설정이 맞아도 실제 tool 노출 여부는 클라이언트 재시작 후 확인해야 한다.

---

## Open Questions

- [ ] [Q-0316-1] Serena MCP 실제 tool call이 현재 Codex/Claude 세션에서 노출되는가?
- [ ] [Q-0316-2] `/컨텍스트` slash command가 재시작 후 자동 등록되는가?

---

## Decisions

- **[D-0316-1]** W-0299를 canonical implementation doc으로 유지하고 W-0300은 superseded draft로 표시한다.
- **[D-0316-2]** `tools/context-pack.sh`는 fallback smoke 도구로 유지한다. 완전한 6-layer semantic pack은 slash command + MCP 조합의 책임이다.
- **[D-0316-3]** macOS 기본 bash 3.2 호환성을 필수 AC로 둔다. 로컬 개발자의 기본 셸/유틸 환경에서 바로 돌아야 한다.

---

## Next Steps

1. `./tools/save.sh`로 체크포인트 저장
2. 변경 diff 확인
3. 필요 시 PR 생성/머지 단계로 넘김

---

## Exit Criteria

- [x] AC1: `bash tools/context-pack.sh "GateV2DecisionStore" engine` 성공
- [x] AC2: `bash tools/context-pack.sh W-0299`가 completed cursor-context work item을 찾음
- [x] AC3: `bash tools/context-pack.sh "차트 그리기 툴"`가 app domain sub-file을 포함
- [x] AC4: W-0299/W-0300 canonical 관계가 문서에 명시됨
- [x] AC5: W-0297 `.mcp.json` snippet이 실제 파일과 일치
- [x] AC6: W-0295 현재 토큰 실측이 문서에 반영됨

---

## Handoff Checklist

- [x] context-pack macOS bash 호환성 수정
- [x] smoke 검증 결과 기록
- [x] 설계 문서 개선
- [x] save checkpoint 기록 (A087)
