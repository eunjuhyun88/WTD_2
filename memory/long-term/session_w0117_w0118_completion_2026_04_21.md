---
name: W-0117/W-0118 완료 + PR #129 머지 (2026-04-21)
description: 드래그 구간 선택 + 지표 자동 수집 + COGOTCHI 레이아웃 완성 + PR 머지 완료
type: project
---

# W-0117 + W-0118 최종 완료 (2026-04-21)

## Status: ✅ COMPLETE

모든 기능 구현 완료, CI 통과, main 브랜치에 머지됨.

### PR #129: claude/eager-franklin-ab6805
**머지 커밋:** 13bf845a (2026-04-21)

## 구현 완료 항목

### W-0117: 드래그 구간 선택 + 지표 자동 수집 + SaveStrip
**Status:** ✅ DONE (PR #124 기반 확장)

**Slice A: CanvasHost 드래그 인터랙션**
- `chartSaveMode` store: `startDrag()`, `adjustAnchor()`, `enterRangeMode()`, `exitRangeMode()`
- `AppShell.svelte`: SELECT RANGE 버튼 클릭 → `chartSaveMode.enterRangeMode()`
- LWC 이벤트: mousedown/mousemove/mouseup → anchorA/anchorB 실시간 업데이트

**Slice B: 지표 자동 수집**
- `chartSaveMode.save()`: viewport 슬라이싱, 구간 내 OHLCV bars + 지표 포함
- `slicePayloadToViewport()`: ChartSeriesPayload indicator 데이터 추출
- PatternCaptureCreateRequest에 indicators 포함하여 API 저장

**Slice C: SaveStrip 렌더링**
- `SaveStrip.svelte`: ChartBoard.svelte 내부에 직접 렌더 (CenterPanel 경로 우회)
- 구간 레이블, 수집 지표 목록, 고가/저가/변동률 표시
- 메모 입력, 저장/취소 버튼

### W-0118: COGOTCHI 레이아웃 완성 + JudgePanel 3열
**Status:** ✅ DONE

**레이아웃 A/B/C 구현**
- Layout A: 차트 풀스크린
- Layout B: 차트 + AI 2분할 (가로)
- Layout C: 차트 + AI info 사이드바 (우측 240px)

**JudgePanel 3열 수평 레이아웃**
- Plan | Judge | AfterResult flex row (flex-1 각각)
- PeekDrawer 슬라이드 애니메이션

**W-0115 Slice 2/3 연계**
- evidence/proposal/α API 바인딩
- ChartBoard 차트 데이터 live 업데이트

## CI 수정 사항

### 2가지 실패 이슈 해결

**1. Engine Tests: test_library_count**
```python
# 수정 전: assert len(PATTERN_LIBRARY) == 15
# 수정 후: assert len(PATTERN_LIBRARY) == 16
# 원인: W-0110-A liquidity-sweep-reversal-v1 패턴 추가
```

**2. App Check And Test: hostSecurity.test.ts**
```typescript
// 포트 스트리핑 복구 (보안 정책)
// 이유: "api.cogotchi.dev" 허용 항목이 "api.cogotchi.dev:443" 요청도 매치되어야 함
function normalizeHost(raw) {
  const first = raw.split(',')[0]?.trim().toLowerCase();
  const withoutPort = first.replace(/:\d+$/, '');  // 포트 제거
  const withoutDot = withoutPort.replace(/\.$/, ''); // DNS dot 제거
  return withoutDot || null;
}

// 테스트 기대값: 포트 스트리핑 후 결과 ['app.cogotchi.dev', 'api.cogotchi.dev', 'localhost']
```

## 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `engine/tests/test_whale_accumulation_reversal.py` | +2 (library count 15→16) |
| `app/src/lib/server/hostSecurity.ts` | +6 (port-stripping 복구) |
| `app/src/lib/server/hostSecurity.test.ts` | -2 (expected 값 업데이트) |
| **총합** | 3 파일, +6 / -2 LOC |

## 다음 방향성

### P0: W-0119+ 다음 기능 설계
- Terminal 페이지 최종 폴리시 정의
- Lab autorun 최적화
- Dashboard Verdict 필터링

### P1: 성능 + 안정성
- Redis kline cache 도입 (W-0096 기반)
- 500+ 동시 사용자 부하 테스트
- API rate limit 세밀 조정

### P2: UX 폴리시
- Mobile 반응형 최종 다듬기
- Dark mode 테마 일관성
- 접근성(a11y) 감사

## 주요 학습

1. **CI 디버깅**: vitest/npm ci 캐시 동작 이해 → 포트 스트리핑 정책 수립
2. **보안 설계**: 호스트 검증 시 포트 제거 필요 (프로토콜 기본값 존중)
3. **멀티 패턴**: 16개 패턴 시스템 완성 (P0.5 기반)

---
**커밋 범위:** 7d02f51 ~ 13bf845a (PR #129)
**작업 일시:** 2026-04-21 05:43 ~ 06:12 KST
