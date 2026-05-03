# W-0392 — Chart Segment Selection UX + Judge-Save Flywheel

> Wave: 6 | Priority: P1 | Effort: M
> Charter: In-Scope (코어 갭)
> Status: 🟡 Design Draft
> Issue: #947
> Created: 2026-05-03

## Goal
사용자가 차트에서 구간을 드래그로 선택하면, 그 구간의 OHLCV·지표·시그널 요약이 즉시 패널에 뜨고, 한 번의 액션으로 `/agent/judge` 판정 → capture_record 저장까지 이어지는 단일 플로우를 제공한다.

## 현재 인프라 vs 추가 필요

| 이미 있음 | 추가 필요 |
|---|---|
| `chartSaveMode.ts` — anchorA/B, startDrag, save() | `selectedRange` derived store export |
| `CanvasHost.svelte` — RangePrimitive + click 2회 앵커 | pointerdown→move→up **드래그** 핸들러 |
| `RangeModeToast.svelte` — 범위 모드 진입 토스트 | `RangeSelectionPanel.svelte` **신규** (구간 정보 + Judge CTA) |
| `JudgeMode.svelte` — TerminalHub 내 judge UI | selectedRange prefill 통합 어댑터 |
| `/agent/judge` 엔드포인트 | `buildIndicatorSnapshotFromRange.ts` **신규** |
| `terminalPersistence.createPatternCapture` | verdict_json 필드 동봉 |
| `scrollAnalysis.ts` indicator_snapshot 타입 | outcome_resolver verdict 우선 사용 분기 |

## Scope

**포함**:
- 드래그 구간 선택 UX (데스크탑 drag / 모바일 long-press+drag)
- `RangeSelectionPanel`: 구간 OHLCV 요약 + 핵심 지표 + 매칭 패턴 top-3 + Judge/Save CTA
- `buildIndicatorSnapshotFromRange`: anchorA/B 슬라이스 → `record<string, number>`
- `/agent/judge` 호출 + verdict 인라인 표시 + 5분 캐시
- `capture_record.verdict_json JSONB NULL` migration (N+1)
- `outcome_resolver` verdict.entry/stop/target 우선 사용 + fallback
- `JudgeMode.svelte` selectedRange prefill

**파일 (기존 수정)**:
- `app/src/lib/stores/chartSaveMode.ts`
- `app/src/lib/shared/chart/CanvasHost.svelte`
- `app/src/lib/shared/panels/mobile/JudgeMode.svelte`
- `app/src/lib/hubs/terminal/TerminalHub.svelte`
- `app/src/lib/api/terminalPersistence.ts`
- `engine/scanner/jobs/outcome_resolver.py`

**파일 (신규)**:
- `app/src/lib/shared/chart/overlays/RangeSelectionPanel.svelte`
- `app/src/lib/terminal/buildIndicatorSnapshotFromRange.ts`
- `engine/tests/test_capture_with_verdict.py`

**DB**:
- `supabase/migrations/NNN_capture_record_verdict_json.sql`
  - `ALTER TABLE capture_records ADD COLUMN verdict_json JSONB NULL`

## Non-Goals
- patterns 페이지에 차트 추가 (별도 W)
- 멀티 구간 동시 선택, 저장 후 verdict overlay 영구 표시
- 모바일 핀치 선택, copy trading 연동
- gate_v2 / decision_event_ledger 연동 (W-0385 라인)

## UX Flow (step-by-step)

```
[1] ChartHeader "Save Setup" 클릭 → enterRangeMode() + RangeModeToast

[2] 차트 드래그(데스크탑) / long-press+drag(모바일)
    → anchorA~anchorB 음영 시각화 (기존 RangePrimitive)

[3] 드래그 완료 → RangeSelectionPanel 자동 등장 (차트 하단 / 모바일 Bottom Sheet)
     ┌─────────────────────────────────────────────────────────┐
     │ ▶ BTCUSDT · 4h · 12 bars (2024-04-01 ~ 2024-04-03)    │
     │ O:68420  H:71200  L:67800  C:70100  +2.5%  Vol:3.2B   │
     │ RSI:62  vol_z:+1.8  ATR%:1.2  MACD:+0.003            │
     │ 매칭 패턴: accumulation_v1 (0.82) / breakout_v3 (0.74) │
     │                              [판정]  [구간만 저장]      │
     └─────────────────────────────────────────────────────────┘

[4] [판정] 클릭 → buildIndicatorSnapshotFromRange() → /api/engine/agent/judge POST

[5] Verdict 인라인 표시:
     LONG  Entry:70,500  Stop:68,200  Target:75,800  RR:2.4
     "vol_z 급등 + RSI 60돌파, accumulation 완료 신호"
     [저장] 버튼 활성화

[6] [저장] → capture_record (verdict_json 동봉) + pending_outcome 자동 등록
     → 토스트 "저장됨 — 72h 후 결과 자동 평가"

[7] JudgeMode 통합: selectedRange 활성 시 JudgeMode 입력창 prefill·readonly
```

## CTO 관점

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| drag 핸들러가 LWC pan/zoom과 충돌 | M | H | range mode 활성 시에만 pointer capture, 비활성 시 기존 인터랙션 유지 |
| capture_records schema 변경 → outcome_resolver 회귀 | L | H | verdict_json NULL 허용, resolver NULL이면 기존 경로 fallback, migration up/down 테스트 |
| /agent/judge 호출량 급증 (스팸 클릭) | M | M | [판정] 버튼 cooldown 3s + verdict 캐시 (from_ts|to_ts|symbol|tf 키, 5분 TTL) |
| 모바일 드래그 = 차트 스크롤 충돌 | H | M | long-press 400ms 후 드래그 진입; 단순 drag는 스크롤 유지 |

### Dependencies / Rollback
- 의존: `terminalPersistence`, `/agent/judge` (기존), RangePrimitive (기존)
- Rollback: feature flag `PUBLIC_RANGE_JUDGE_FLYWHEEL=false` → RangeSelectionPanel mount skip, JudgeMode 기존 입력창 사용. DB 컬럼 NULL이라 무해

## AI Researcher 관점

### Feature Snapshot Integrity
- 슬라이스 윈도우: `[anchorA, anchorB]` inclusive, 시간 단조 보장
- snapshot 필수 키 7개: `rsi_14`, `vol_z_20`, `atr_pct_14`, `macd_hist`, `bb_width`, `ret_5b`, `ret_20b`
- 모든 값은 **anchorB 마감봉 기준** (진행중봉 제외, look-ahead 금지)
- payload에 없는 지표는 omit (NaN 삽입 금지)
- 7키 중 3개 미만 → judge 호출 차단, "지표 부족" 안내

### Failure Modes
1. 구간 < 3 bars → "구간 너무 짧음" + Judge 버튼 비활성
2. payload null (데이터 미로드) → 패널 진입 차단, "차트 로딩 대기" 토스트
3. judge 5xx → 에러 표시, [구간만 저장]은 여전히 가능
4. feature_snapshot null → outcome_resolver에서 metric increment + skip 로그 (silent break 방지)
5. user_id 없는 anonymous 호출 → "anonymous" 기본값으로 저장

## Decisions

**[D-0392-1] 패널 위치**
- 채택: 차트 하단 도킹 (모바일: Bottom Sheet)
- 거절: floating overlay → 캔들 가림
- 거절: 사이드바 → 모바일 미사용

**[D-0392-2] Judge 트리거**
- 채택: 명시적 [판정] 버튼
- 거절: anchor 확정 시 자동 호출 → /agent/judge 비용 폭증 + rate limit
- 거절: hover preview → 모바일 미지원

**[D-0392-3] verdict 저장 위치**
- 채택: `capture_records.verdict_json JSONB NULL` 컬럼 추가
- 거절: 별도 verdict_record + FK → 조인 비용, outcome_resolver 2단 lookup
- 거절: decision_event_ledger 합치기 → W-0385 frozen 영역 침해

**[D-0392-4] JudgeMode 통합**
- 채택: selectedRange 있으면 JudgeMode 입력창 prefill·readonly
- 거절: JudgeMode 제거 후 패널이 대체 → 차트 없는 컨텍스트에서 judge 불가

**[D-0392-5] 드래그 vs 클릭 2회**
- 채택: 데스크탑 drag + 클릭 2회 fallback 유지 / 모바일 long-press+drag
- 거절: 드래그만 → 모바일 스크롤 충돌
- 거절: 클릭만 유지 → UX 후퇴

## Open Questions
- [ ] [Q-0392-1] `capture_records` 테이블이 SQLite와 Supabase 양쪽 있음 — verdict_json migration이 SQLite schema도 같이 수정해야 하는지?
- [ ] [Q-0392-2] 매칭 패턴 top-3 cosine sim 계산은 프론트? 엔진? (engine에 `/patterns/candidates?symbol=X` 이미 있으면 재사용 가능)

## Implementation Plan

### Phase 1 (PR1) — Selection Panel + Snapshot Builder (1.5d)
1. `buildIndicatorSnapshotFromRange.ts` 신규 + 단위 테스트 5케이스 (정상/짧은구간/payload null/키 누락/경계봉)
2. `chartSaveMode.ts` `selectedRange` derived store export
3. `RangeSelectionPanel.svelte` 신규 — 구간 요약 표시 (Judge 버튼 disabled stub)
4. TerminalHub에 RangeSelectionPanel 마운트 슬롯

### Phase 2 (PR2) — Drag UX + Judge 호출 (1.5d)
1. CanvasHost pointerdown/move/up 드래그 핸들러 (click 2회 fallback 유지)
2. 모바일 long-press 400ms 진입
3. RangeSelectionPanel [판정] → `/api/engine/agent/judge` 호출 + verdict 인라인 표시
4. verdict 캐시 (from_ts|to_ts|symbol|tf 키, 5분 TTL)

### Phase 3 (PR3) — Save + Flywheel (1d)
1. `supabase/migrations/049_capture_record_verdict_json.sql`
2. SQLite schema 동기화 (Q-0392-1 확인 후)
3. `terminalPersistence.createPatternCapture` verdict_json 통과
4. `outcome_resolver.py` verdict.entry/stop/target 우선 사용 + fallback
5. `JudgeMode.svelte` selectedRange prefill 통합
6. E2E 테스트: select → judge → save → pending_outcome 1건 검증

## Exit Criteria

- [ ] E1: 드래그 선택 → 패널 표시 ≤ 80ms P50 / ≤ 200ms P95
- [ ] E2: indicator_snapshot 7키 중 ≥5 충족률 ≥ 95% (실데이터 100 구간 샘플)
- [ ] E3: judge 클릭 → verdict 표시 ≤ 4.0s P95
- [ ] E4: capture_record.verdict_json 동봉 저장 성공률 ≥ 99%
- [ ] E5: outcome_resolver pending_outcome 자동 등록률 = 100% (스케줄러 1사이클 내)
- [ ] E6: 모바일 long-press false-positive ≤ 2% (수동 50회)
- [ ] E7: 신규/수정 테스트 ≥ 18개, svelte-check 0 errors, pytest green
- [ ] E8: `PUBLIC_RANGE_JUDGE_FLYWHEEL=false` 시 기존 차트 인터랙션 회귀 0건 (Playwright smoke 5 시나리오)
- [ ] PR1/PR2/PR3 merged, CURRENT.md SHA 업데이트
