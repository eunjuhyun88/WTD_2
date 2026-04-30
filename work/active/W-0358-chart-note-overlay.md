# W-0358 — Chart Note Overlay (Personal Trade Journal Markers)

> Wave: 4 | Priority: P1 | Effort: M
> Charter: In-Scope (개인 거래 기록 / journal)
> Status: 🟡 Design Draft
> Issue: #790
> Created: 2026-05-01

## Goal
트레이더가 차트 우하단 ✏️ 버튼으로 현재 심볼·가격·바 시간을 자동 캡처한 개인 메모를 남기고, 같은 심볼+TF 차트에서 해당 바 위에 마커로 다시 보며 의사결정을 복기할 수 있다.

## Scope

**포함:**
- 플로팅 ✏️ 버튼 (차트 우하단, 클릭 시 NotePanel 오픈)
- 자동 캡처 메타: `symbol`, `timeframe`, `price` (= `liveTick.price` 클릭 시점), `bar_time` (= 최근 closed bar UTC seconds), `created_at`
- 메모 본문 (text 최대 500자) + `tag` enum: `idea | entry | exit | mistake | observation`
- Supabase `chart_notes` 테이블 + RLS (`user_id = auth.uid()`)
- ChartBoard 헤더 `📝 Notes` 토글 (show/hide, default ON)
- `candleMarkerApi.setMarkers()` 배열에 note markers concat (line 1069 기존 호출 확장)
- 마커 클릭 → `chart.subscribeClick(param)` → NotePanel view 모드 오픈
- Tier cap: free ≤ 50개, pro 무제한 (클라이언트 pre-check + DB CHECK 양면)

**파일:**
```
app/supabase/migrations/033_chart_notes.sql              (NEW)
app/src/components/chart/FloatingNoteButton.svelte       (NEW)
app/src/components/chart/NotePanel.svelte                (NEW)
app/src/lib/stores/chartNotesStore.svelte.ts             (NEW — Svelte 5 runes)
app/src/lib/db/chartNotes.ts                             (NEW)
app/src/components/terminal/workspace/ChartBoard.svelte  (MODIFY — line 1069 + 헤더 토글)
app/src/components/terminal/workspace/__tests__/W0358_chart_note_overlay.test.ts (NEW)
```

**API:** Supabase direct (engine 변경 없음)

## Non-Goals
- 소셜 공유 / 다른 유저 메모 열람 — **Frozen §영구** (PRIORITIES.md: "social comments")
- 자유 텍스트 LLM chat 통합 — **Frozen §영구**
- 이미지/스크린샷 첨부 — Wave 5 (Supabase Storage 의존)
- LLM 자동 메모 요약 — 별도 설계 필요
- 차트 freeform 그리기 — W-0289 책임
- 알림(메모 트리거 시 푸시) — Wave 5 알림 시스템 의존

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| ChartBoard line 1069 markers concat 충돌 (CVD/Alpha와) | 중 | 중 | `[...markers, ...noteMarkers]` 후 `time` asc 정렬. 기존 배열 무변경 |
| bar_time forming bar 혼입 | 중 | 저 | `candleSeries.data().slice(-2,-1)[0]?.time` (confirmed closed bar) |
| 마커 클릭 이벤트 — LightweightCharts 직접 노출 안 함 | 중 | 중 | `chart.subscribeClick(param)` → `param.time` ↔ `bar_time` ±0.5 bar interval 매칭 |
| RLS 미설정 시 타 유저 메모 노출 | 저 | 치명 | migration에 4 policy 강제 + CI grep gate |
| free 50개 silent drop | 중 | 저 | DB CHECK + 클라이언트 49번째부터 UI 경고 |
| markers 100+개 렌더 perf | 저 | 중 | visibleRange 내 bars만 marker 변환 |

### Dependencies / Rollback
- `candleMarkerApi` (ChartBoard.svelte:914) — 이미 존재, 확장만
- `liveTick` state (ChartBoard.svelte:173) — 이미 존재
- migration 032 확인됨 → 033 사용 가능
- **Rollback**: 헤더 토글 OFF → markers 빈 배열. 강한 rollback: `DROP TABLE chart_notes CASCADE` 1줄

## AI Researcher 관점

### Data Impact / Failure Modes
- **학습 사용 금지** — schema에 `is_training_eligible boolean default false` 예약 컬럼 (현 wave 항상 false)
- **F1. TF mismatch**: 5m 작성 메모 → 1h 차트에서는 마커 숨김, NotePanel 리스트엔 "5m TF에서 작성됨" 라벨
- **F2. price 캡처 race**: 클릭 시점 snapshot fix, 모달에 "캡처 가격: $X (Y초 전)" 표시
- **F3. 심볼 정규화**: `BTCUSDT` 통일 (대문자 + 구분자 `- / _` 제거), DB/클라이언트 동일 함수 `normalizeSymbol()`
- **F4. 빈 본문 차단**: trim 후 0자 → 클라이언트 reject + DB CHECK `length(trim(body)) >= 1`

## Decisions
| # | 선택 | 거절 + 이유 |
|---|---|---|
| D-0001 | Supabase direct | engine 경유 — 분석 파이프라인과 분리 불필요, RLS 보안 충분 |
| D-0002 | bar_time = closed bar | forming bar — TF 매칭 실패 가능 |
| D-0003 | price = 클릭 시점 snapshot | 저장 완료 시점 — 작성 중 가격 변동 시 의도 불일치 |
| D-0004 | TF 일치 시에만 마커 표시 | 전 TF 표시 — grid 좌표 깨짐 |
| D-0005 | 심볼 정규화 대문자+구분자제거 | 원본 유지 — 거래소별 표기 충돌 |
| D-0006 | free 50개 cap, pro 무제한 | 제한 없음 — tier 남용 방지 |
| D-0007 | fetch only (심볼 변경 시 1회) | realtime subscribe — 단일 디바이스 패턴, 비용 |
| D-0008 | `.svelte.ts` runes store | legacy store — 프로젝트 컨벤션 (W-0341 참조) |
| D-0009 | 태그별 마커 차별화 | 단색 통일 — `idea`=파랑원, `entry`=초록↑, `exit`=빨강↓, `mistake`=주황□, `observation`=회색원 |
| D-0010 | 본문 max 500자 | 무제한 — tooltip 표시 제약 |

## Open Questions
- [ ] [Q-0001] free 50개 초과 시 — 자동 삭제 vs 신규 차단? → **차단 + pro CTA** 안, 사용자 컨펌 필요
- [ ] [Q-0002] 마커 오픈 방식 — 클릭 vs hover? → **클릭** 안 (모바일 호환), 사용자 컨펌 필요
- [ ] [Q-0003] 멀티 디바이스 realtime 동기화 필요? → W-0359로 분리 가능
- [ ] [Q-0004] timeframe enum 범위 — `1m|5m|15m|1h|4h|1d` 6종 고정?

## Implementation Plan
1. **migration 033** (`033_chart_notes.sql`): `chart_notes` 테이블 + RLS 4 policy (select/insert/update/delete) + CHECK constraints + index `(user_id, symbol, timeframe, bar_time)`
2. **db layer** (`chartNotes.ts`): `insertNote()`, `listNotes(symbol, timeframe)`, `updateNote(id, patch)`, `deleteNote(id)`, `countNotes()`, `normalizeSymbol()`
3. **store** (`chartNotesStore.svelte.ts`): `$state notes[]`, `loadNotes(symbol, tf)`, `addNote()`, `updateNote()`, `deleteNote()`, `showNotes` boolean, `$derived markers` (SeriesMarker[])
4. **FloatingNoteButton.svelte**: 우하단 absolute ✏️, 클릭 시 캡처 메타 계산 후 NotePanel create 모드 트리거
5. **NotePanel.svelte**: create/edit/view 3모드, 본문 textarea (500자 카운터), tag selector, 캡처 메타 표시, free tier 49+ 경고 + pro CTA
6. **ChartBoard.svelte 수정**:
   - line 75 근처: `showNotes: boolean = $bindable(true)` prop 추가
   - line 173 근처: `$effect` — `chartNotesStore.loadNotes(symbol, timeframe)` (symbol/tf 변경 시)
   - line 1069: `if (showNotes) markers.push(...chartNotesStore.markers)` 후 `markers.sort((a,b) => a.time - b.time)`
   - 헤더: `📝` 토글 버튼 + `showNotes` bind
   - `chart.subscribeClick(param)` → `param.time` 매칭 → NotePanel view 모드
   - FloatingNoteButton mount (lastClosedBarTime, liveTick.price 전달)
7. **테스트** (`W0358_chart_note_overlay.test.ts`):
   - markers concat 정렬 (CVD/Alpha 공존)
   - 심볼 정규화 round-trip
   - bar_time = closed bar (forming bar 제외)
   - 다른 TF에서 markers 0개
   - free 50개 초과 시 insert reject

## Owner
app (ChartBoard.svelte + FloatingNoteButton + NotePanel + chartNotesStore + chartNotesRepository + migration 034)

## Canonical Files
- `app/supabase/migrations/034_chart_notes.sql`
- `app/src/components/chart/FloatingNoteButton.svelte`
- `app/src/components/chart/NotePanel.svelte`
- `app/src/lib/stores/chartNotesStore.svelte.ts`
- `app/src/lib/server/chartNotesRepository.ts`
- `app/src/routes/api/chart/notes/+server.ts`
- `app/src/routes/api/chart/notes/[id]/+server.ts`
- `app/src/components/terminal/workspace/ChartBoard.svelte`

## Facts
- Supabase `chart_notes` 테이블: `id, user_id, symbol, timeframe, bar_time, price, body, tag, created_at, is_training_eligible` (확인: migration 034)
- RLS 4 policy (select/insert/update/delete — `user_id = auth.uid()`)
- `candleMarkerApi` (ChartBoard.svelte:914 기준) 이미 존재 — 확장만
- free tier cap 50개: DB CHECK + 클라이언트 pre-check

## Assumptions
- Supabase auth (`supabaseClient.auth.getUser()`) 동작 중
- `candleMarkerApi.setMarkers()` LightweightCharts 5.x API 안정적
- migration 033 배포 완료 (033_pattern_objects + 033_propfirm_p1_core)

## Next Steps
- migration 034 Supabase prod 적용 (`supabase db push`)
- RLS pgTAP 또는 2-account 수동 검증 (AC4)
- ChartBoard.svelte markers concat 회귀 테스트 (AC6)

## Handoff Checklist
- [ ] migration 034 prod 적용 확인
- [ ] FloatingNoteButton 우하단 위치 확인 (모바일 safe-area 포함)
- [ ] free tier 50개 cap UI 경고 확인
- [ ] RLS 타 계정 격리 수동 확인

## Exit Criteria
- [ ] AC1: 메모 저장 성공률 ≥ 99% (10회 시도, 네트워크 정상 환경)
- [ ] AC2: 심볼+TF 로드 후 markers 렌더 ≤ 500ms (50개 기준 p95)
- [ ] AC3: 마커 클릭 → NotePanel view 오픈 정확도 100% (10회, ±0.5 bar tolerance)
- [ ] AC4: 다른 계정 로그인 시 타인 메모 0개 노출 (RLS pgTAP or 2-account manual)
- [ ] AC5: free tier 51번째 insert → 차단 확인
- [ ] AC6: CVD divergence + Alpha phase markers 회귀 없음 (W-0287/0288 테스트 통과)
- [ ] AC7: markers 100개 렌더 시 FPS ≥ 30 (Chrome DevTools)
- [ ] AC8: pnpm check 0 errors
- [ ] CI green + PR merged + CURRENT.md SHA 업데이트
