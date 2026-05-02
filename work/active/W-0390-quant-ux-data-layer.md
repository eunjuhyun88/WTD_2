# W-0390 — 퀀트 UX 데이터 레이어 (OI/FR/Kimchi + 키보드 + WatchlistRail 신호강도)

> Wave: 5 | Priority: P1 | Effort: M (2-3d)
> Charter: In-Scope (Frozen 전면 해제 2026-05-01)
> Status: 🟡 Design Draft
> Created: 2026-05-02

## Goal

퀀트 트레이더가 TopBar에서 OI/FR/Kimchi를 보고 0.5초 안에 시장 편향을 판단하며, 키보드만으로 Hub 전환·종목 전환·모드 전환을 완료한다.

## Context

- OI/FR: engine `score_thread.py:87`, `patterns.py:401`에 이미 존재. `app/src/lib/types/terminal.ts:14 fundingRate: number` — 미노출
- Kimchi Premium: `/api/market/kimchi-premium` 이미 존재 (W-0363). `cogochi.ts:73 kimchiPremium` 타입 존재 — 미노출
- Keyboard shortcuts: TerminalHub.svelte에 `1-8(TF)`, `t/h/v/e/r/f/l(drawing)`, `b(range)` 이미 구현
- WatchlistRail: 심볼/가격/변동률만 표시 — 신호강도/FR/OI 없음
- CommandPalette: `app/src/lib/shared/panels/CommandPalette.svelte` 이미 존재 — ⌘K 미연결

## Scope

### Phase 1 — TopBar L2 퀀트 데이터 추가 (1d)
파일: `app/src/lib/hubs/terminal/TopBar.svelte`
```
L1: [BTC/USDT ▾]  $95,123.50  +1.24%  H:95,800  L:94,200  Vol:$2.3B
L2: OI:$8.1B ↑12%  │  FR:+0.012% (롱쏠림)  │  Kim:+2.3% ▲
```
- OI: `GET /api/terminal/signals` → `ticker_data.open_interest` (이미 있음)
- FR: `ticker_data.funding_rate` (이미 있음)
- Kimchi: `GET /api/market/kimchi-premium` (이미 있음, 30s 캐시)
- FR 색상: 양수(롱쏠림) amber, 음수(숏쏠림) sky, 중립 g6
- OI 변화: 화살표 ↑↓ + 색상 (30m 전 대비 delta)
- ≤1280px: Kim 숨김, ≤1024px: L2 전체 숨김 → icon ⓘ 탭

### Phase 2 — StatusBar 시장 지표 추가 (0.5d)
파일: `app/src/lib/hubs/terminal/StatusBar.svelte`
```
● live  285sym  │  BTC FR:+0.012% Kim:+2.3%  │  패턴 7 발화  │  신선도 4s  │  09:14:33 KST
```
- Kimchi + BTC FR 실시간 (30s poll, 기존 API)
- 패턴 발화 카운트 (scan_signal_events 24h 집계)

### Phase 3 — 키보드 단축키 확장 (0.5d)
파일: `app/src/lib/hubs/terminal/TerminalHub.svelte`

| 단축키 | 기능 | 충돌 여부 |
|---|---|---|
| `ctrl+1` | TRADE 모드 | 없음 (`1`은 TF=1m, modifier 추가) |
| `ctrl+2` | TRAIN 모드 | 없음 |
| `ctrl+3` | FLYWHEEL 모드 | 없음 |
| `j` | Watchlist 아래 이동 | 기존 drawing 없음 ✅ |
| `k` | Watchlist 위 이동 | 없음 ✅ |
| `space` | 현재 종목 Watching 추가 | 없음 ✅ |
| `enter` | 선택 종목 Terminal 열기 | 없음 ✅ |
| `⌘K` / `ctrl+K` | CommandPalette 열기 | 없음 ✅ |
| `escape` | CommandPalette 닫기 | 이미 있음 |
| `i` | IndicatorLibrary 열기 | 없음 ✅ |

참고: 기존 `t/h/v/e/r/f/l` = drawing tools, `1-8` = TF — 충돌 없도록 modifier 사용

파일: `app/src/lib/shared/panels/CommandPalette.svelte`
- ⌘K 트리거 연결 (현재 미연결)
- symbol 검색 + 최근 검색 히스토리 (localStorage)

### Phase 4 — WatchlistRail 신호강도 + FR (0.5d)
파일: `app/src/lib/hubs/terminal/WatchlistRail.svelte`
```
BTC/USDT  $95,123  +1.24%
████████░░  0.87  │  FR:+0.012%
```
- 신호강도 bar: `alpha_score` (0-1, 8-segment pixel bar)
- FR: 색상 코딩 (amber=롱, sky=숏)
- compact mode (icon-only 56px): 신호강도 bar만 표시
- 데이터: 기존 WatchlistRail store에 alpha_score 추가 (shell.store 경유)

### Phase 5 — Dashboard Kimchi + 즉시 주목 섹션 (0.5d)
파일: `app/src/routes/dashboard/+page.svelte` (W-0389 Phase 5 이후)
```
┌── 즉시 주목 (Alert Strip 48px) ────────────────────────────────────┐
│  ⚡ ETH OI +12%/30m (숏스퀴즈 선행)  ⚡ Kim +2.8% → 상단 저항    │
└────────────────────────────────────────────────────────────────────┘
┌── KimchiPremium (48px) ─────────────────────────────────────────────┐
│  +2.34% ▲  업비트 95,450 KRW / 바이낸스 $95,123                     │
└─────────────────────────────────────────────────────────────────────┘
```
- Alert Strip: OI 급등(30m +10% 초과) + FR 이상값(>0.05% or <-0.03%) 자동 표시
- Kimchi: `/api/market/kimchi-premium` (기존 API, 30s poll)

## Non-Goals

- OI/FR 차트 인디케이터 신규 추가 (indicatorRegistry에 이미 있음 — 연결만)
- Kimchi 알림 (Telegram/Push) — F-36으로 분리
- 키보드 단축키 커스터마이즈 UI (사용자 설정 — 후속 wave)
- 모바일 제스처 키보드 대체 (W-0374 D-8 이후)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `j/k` 키 입력 중 textarea 포커스 이동 | H | M | `isInputActive()` guard 이미 있음 — 그대로 적용 |
| OI delta 계산 30m 전 대비 — DB 쿼리 추가 | M | L | feature_windows 테이블 이미 시계열 저장 — last_30m row |
| Kimchi API rate limit (업비트 공개 API) | L | M | 현재 30s 캐시 + CDN 이미 적용 확인 |
| WatchlistRail alpha_score 추가 시 성능 | L | L | store 이미 symbol별 batch — 추가 1필드 |
| ⌘K와 브라우저 북마크 단축키 충돌 | L | L | `e.preventDefault()` + Chrome 기본 단축키 조사 |

### Dependencies

- 선행: W-0389 Phase 2 TopBar (L1 재구성 후 L2 추가)
- 선행: W-0389 Phase 5 Dashboard (Trader Home 후 Alert Strip 추가)
- 후행: 없음

### Rollback

- 단축키: TerminalHub.svelte 단일 함수 분리 — revert 1줄
- OI/FR TopBar: `#if showQuantLayer` feature flag (off by default until verified)

## AI Researcher 관점

### Data Impact

- TopBar 정보 항목: 8 (W-0389) → 11 (+OI, +FR, +Kimchi)
- WatchlistRail: 종목당 3개 → 5개 정보 (price/chg/signal/FR 추가)
- Alert Strip: 자동 이상치 탐지 (OI ±10%/30m, FR ±0.05%)

### Statistical Validation

- FR 표시 후 트레이더 방향 일치율 추적 (verdict vs FR 방향 비교, 2주 수집)
- 키보드 사용률: `j/k` 클릭 이벤트 카운트 vs 마우스 클릭 비교 (localStorage stat)
- Alert Strip CTR: 배너 클릭 → 종목 이동 전환율 ≥15% 목표

### Failure Modes

- OI delta 계산 오류 → 항상 `↑` 표시: `null` guard + "—" fallback
- Kimchi API 응답 없음 → 빈 표시 + 30s retry (기존 로직 재사용)
- `j/k` input 포커스 중 이동: isInputActive() 누락 시 textarea 오동작

## Decisions

- [D-4001] OI delta 기준: 30m vs 1h → 30m 선택 (단기 트레이더 기준)
- [D-4002] FR 표시 형식: `+0.012%` 숫자 vs `롱쏠림` 텍스트 → 둘 다 (숫자 + 색상)
- [D-4003] `j/k` 단축키 범위: WatchlistRail만 vs 전체 Hub → WatchlistRail만 (포커스 명확)
- [D-4004] ⌘K CommandPalette: 기존 CommandPalette.svelte 재사용. 거절: 신규 작성 (중복)
- [D-4005] alpha_score bar: 8-segment discrete vs continuous gradient → discrete (Bloomberg 미학)
- [D-4006] Alert Strip 임계값: OI ±10%/30m, FR >0.05%/<-0.03% → 실측 후 조정 가능

## Open Questions

- [ ] [Q-4001] OI delta: `feature_windows` 테이블 30m 이전 row 쿼리 비용? index 있는지 확인
- [ ] [Q-4002] `space` 키 Watching 추가 시 어느 symbol? (WatchlistRail 현재 hover 종목 vs TopBar 종목)
- [ ] [Q-4003] WatchlistRail alpha_score 데이터 — 실시간 poll 주기? (현재 가격은 몇 초?)
- [ ] [Q-4004] Kimchi 표시 위치 우선순위: TopBar L2 vs StatusBar vs Dashboard만?

## Implementation Plan

1. **PR-H** Phase 1: TopBar L2 OI/FR/Kimchi (feature flag off → on)
2. **PR-I** Phase 2: StatusBar Kimchi+FR strip
3. **PR-J** Phase 3: TerminalHub 키보드 확장 + CommandPalette ⌘K 연결
4. **PR-K** Phase 4: WatchlistRail 신호강도 bar + FR
5. **PR-L** Phase 5: Dashboard Alert Strip + Kimchi bar

## Exit Criteria

- [ ] AC1: TopBar에 OI/FR/Kimchi 3개 모두 렌더 (live 데이터, null 아님)
- [ ] AC2: FR 양수 amber, 음수 sky 색상 CSS 적용
- [ ] AC3: OI 30m delta ↑↓ 화살표 + 색상 정확
- [ ] AC4: `j/k` WatchlistRail 이동 동작, input 포커스 중 비동작 확인
- [ ] AC5: `ctrl+1/2/3` 모드 전환 동작
- [ ] AC6: `⌘K` CommandPalette 열기 + `escape` 닫기
- [ ] AC7: `i` IndicatorLibrary 열기
- [ ] AC8: `space` Watching 추가 동작
- [ ] AC9: WatchlistRail alpha_score bar 렌더 + FR 색상 표시
- [ ] AC10: Dashboard Alert Strip OI/FR 이상치 자동 표시 (threshold 테스트)
- [ ] AC11: Dashboard Kimchi Premium bar 렌더
- [ ] AC12: svelte-check error 증가 = 0
- [ ] AC13: vitest snapshot 5개 (TopBar/StatusBar/WatchlistRail/CommandPalette/Dashboard) PASS
- [ ] AC14: 5개 PR merged + CURRENT.md SHA 업데이트

## Facts

- `engine/api/routes/score_thread.py:87`: `funding_rate` float 존재
- `engine/api/routes/patterns.py:401`: `funding_rate_last` 집계 존재
- `app/src/lib/types/terminal.ts:14`: `fundingRate: number` 타입 존재
- `app/src/lib/contracts/ids.ts:116`: `FUNDING_RATE: 'raw.symbol.funding_rate'`
- `app/src/lib/contracts/ids.ts:117`: `OPEN_INTEREST_POINT: 'raw.symbol.open_interest.point'`
- `app/src/hooks.server.ts:71`: `/api/market/kimchi-premium` public route, 30s 캐시
- `TerminalHub.svelte:129`: TV-style shortcuts 기존 구현 (`1-8`, `t/h/v/e/r/f/l`, `b`)
- `CommandPalette.svelte`: `app/src/lib/shared/panels/CommandPalette.svelte` 존재, ⌘K 미연결

## Canonical Files

- `app/src/lib/hubs/terminal/TopBar.svelte`
- `app/src/lib/hubs/terminal/StatusBar.svelte`
- `app/src/lib/hubs/terminal/TerminalHub.svelte`
- `app/src/lib/hubs/terminal/WatchlistRail.svelte`
- `app/src/lib/shared/panels/CommandPalette.svelte`
- `app/src/routes/dashboard/+page.svelte`

## Assumptions

- W-0389 Phase 2+5 완료 후 착수 (TopBar L1 + Dashboard Trader Home 전제)
- OI/FR feature flag 기본 OFF → 2일 soak 후 ON
- `feature_windows` 테이블 30m 이전 row 접근 가능 (Q-4001 확인 필요)

## Owner

app + engine

## Next Steps

1. PR-H: TopBar L2 OI/FR/Kimchi (feature flag off → on after 2d soak)
2. PR-I: StatusBar Kimchi+FR strip
3. PR-J: TerminalHub 키보드 확장 + CommandPalette ⌘K 연결
4. PR-K: WatchlistRail 신호강도 bar + FR
5. PR-L: Dashboard Alert Strip + Kimchi bar

## Handoff Checklist

- [ ] W-0389 Phase 2 TopBar L1 완료 확인 (선행 의존)
- [ ] engine `GET /api/terminal/signals` → `ticker_data.open_interest` + `funding_rate` 응답 확인
- [ ] `/api/market/kimchi-premium` 30s 캐시 정상 동작 확인
- [ ] `feature_windows` 테이블 30m 이전 row 쿼리 성능 확인 (Q-4001)
- [ ] `j/k` input focus guard 테스트 (isInputActive() 적용 확인)
- [ ] CURRENT.md 에이전트 락 테이블 등재 (TerminalHub.svelte 락)
