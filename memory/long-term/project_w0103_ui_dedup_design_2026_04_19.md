---
name: W-0103 Terminal UI Dedup — 설계 완료, 구현 대기
description: W-0103 터미널 UI 중복 제거 설계 완료 (PR #102 open). Slice A-D 정규 위치 결정, 구현 미완료.
type: project
---

W-0103 Terminal UI Dedup 설계 완료 (2026-04-19, PR #102 open, branch: claude/stupefied-bhabha-018ee9)

**Why:** 터미널 데스크톱에서 심볼/가격/TF/변동률이 4-5회 중복 노출 → 사용자 피드백으로 정비 요청

**Slice 결정:**
- Slice A: `Header.svelte` — `.selected-ticker` div 전체 제거 (심볼/가격 nav pill)
- Slice B: `TerminalCommandBar.svelte` — TF pill strip 제거 (chart header에만 유지)
- Slice C: `VerdictHeader.svelte` — `{symbol} · {timeframe}` span 제거
- Slice D: 24H 변동률 단일 출처 통일 (`snapshot.change24hPct`)

**정규 위치:** ChartBoard header — 심볼+가격+변동률+TF 전부 여기서만

**Exit Criteria:**
- 심볼이 chart header에만 1회 표시
- TF pill strip chart header 1개만
- VerdictHeader에 심볼/TF 없음
- 24H 변동률 출처 불일치 없음
- ≥ 946 tests pass

**How to apply:** 다음 세션 시작 시 PR #102 체크아웃 후 Slice A부터 구현. 설계문서: `work/active/W-0103-terminal-ui-dedup.md`
