# W-0389 — UX 시각/타이포 정규화 (Bloomberg 5-Hub Readability Pass)

> Wave: 5 | Priority: P1 | Effort: L (4-5d)
> Charter: In-Scope (Frozen 전면 해제 2026-05-01)
> Status: 🟡 Design Draft
> Created: 2026-05-02

## Goal

트레이더가 5-Hub 어디서든 모든 숫자를 ≥11px tabular-nums로 즉시 읽고, L1 컨트롤(symbol/price/H/L/Vol/mode)을 첫 fold에서 클릭 없이 발견한다.

## Context

- W-0381 (#889) typography.css token 생성 완료 — 그러나 미적용 (86 files / 730 violations)
- `--ui-text-xs: 11px` 정의됨, 실제 파일들은 여전히 `9px`/`8px`/`7px` 하드코딩
- AIAgentPanel 탭: `DEC/PAT/VER/RES/JDG` 9px 약어 — 의미 파악 불가
- TopBar: H/L/Vol 없음, 모드선택 없음
- StatusBar: 모드선택 9px 매몰, 8px verdict pill
- ChartToolbar: native `<select>`, emoji 버튼, export=console.log 스텁
- Dashboard: LP 게이미피케이션 + FlywheelHealth 혼재 — 트레이더 홈 아님

## Scope

### Phase 1A — terminal/ 폰트 치환 (1d)
- `app/src/lib/hubs/terminal/**/*.svelte` (47개 파일)
- `7px`/`8px`/`9px`/`10px` → `var(--ui-text-xs)` (11px)
- 화이트리스트 예외: chart tooltip 내부 7px legend (2개 파일, 명시적 주석)

### Phase 1B — dashboard+lab+patterns+settings 폰트 치환 (0.5d)
- `app/src/lib/hubs/{dashboard,lab,patterns,settings}/**/*.svelte` (39개 파일)
- 동일 치환 규칙

### Phase 2 — TopBar L1+L2 재구성 (1d)
파일: `app/src/lib/hubs/terminal/TopBar.svelte`
```
L1: [Symbol ▾]  $95,123.50  +1.24%  │  H:95,800  L:94,200  Vol:$2.3B
L2: [1m][3m][5m][15m][30m][1h][4h][1D]  11px bold amber underline (active)
RIGHT: [● TRADE ▾]  [Pro]  [⚙]
```
- 24h H/L/Vol 신규 추가 (engine `GET /api/terminal/signals` → `ticker_data` 이미 포함)
- 모드 segmented control TopBar 우측 이동 (StatusBar에서 제거)
- TF 버튼 `9px` → `11px bold`
- ≤1280px: H/L/Vol collapse → `More ▾` dropdown

### Phase 3 — AIAgentPanel + ChartToolbar (0.5d)
파일: `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte`
- 탭 순서: Research → Pattern → Verdict → Decision → Judge (퀀트 워크플로 순)
- 탭 라벨: 풀워드 11px (`Research / Pattern / Verdict / Decision / Judge`)
- 숫자 배지 추가: `Pattern (7)`, `Verdict (2)`
- `8px` more-button → `11px`

파일: `app/src/lib/hubs/terminal/workspace/ChartToolbar.svelte`
- native `<select>` → button strip (TopBar TF와 일관성)
- emoji 버튼 → LucideSvelte SVG (이미 dep 존재 확인 필요)
- export `console.log` 스텁 → PNG canvas.toBlob() 구현 또는 버튼 숨김

### Phase 4 — StatusBar 정보 전용화 (0.5d)
파일: `app/src/lib/hubs/terminal/StatusBar.svelte`
- 모드 selector 제거 (TopBar Phase 2로 이전됨)
- `9px` → `var(--ui-text-xs)` 일괄
- `8px` verdict pill → `12px bold` amber
- 정보 재배열: `● live  285sym │ 신선도 4s │ LONG ■ │ drift +0.003 │ 09:14:33 KST`
- 모바일은 변경 보류 (W-0374 D-8 충돌 회피)

### Phase 5 — Dashboard Trader Home 재목적 (1d)
파일: `app/src/routes/dashboard/+page.svelte`
```
┌── Portfolio Strip (64px) ─────────────────────────────────────────────┐
│  Day P&L: +$1,234 (+2.3%)  │  Win 7/9 (78%)  │  Max DD: -0.8%       │
└───────────────────────────────────────────────────────────────────────┘
┌── Today KPIs (80px) ──────────────────────────────────────────────────┐
│  Captures: 3  │  Pending: 2  │  Win Rate: 68%  │  LP: 420             │
└───────────────────────────────────────────────────────────────────────┘
┌── Watching 50% ────────────────┬── Scanner 50% ──────────────────────┐
│  BTC/1h  ████ 0.87  +920 +48m │  BTC  0.87  High                    │
│  SOL/4h  ███  0.74  watching  │  SOL  0.74  Med                     │
└────────────────────────────────┴────────────────────────────────────┘
```
신규 파일: `app/src/routes/lab/health/+page.svelte`
- FlywheelHealth 이전 destination
- `/dashboard` → `/lab/health` redirect 1주 유지 (notice banner)
- Passport/LP → `/settings/profile` 이전

### Phase 6 — stylelint + 5-Hub QA (0.5d)
- `app/.stylelintrc.cjs` 신규: `declaration-property-value-disallowed-list: { "font-size": ["/(7|8|9|10)px/"] }`
- `app/package.json` scripts: `"lint:style": "stylelint 'src/**/*.svelte'"`
- vitest snapshot 7개 (5 hub + TopBar + AIAgentPanel)

## Non-Goals

- OI/FR/Kimchi 데이터 추가 (→ W-0390)
- 키보드 단축키 확장 (→ W-0390)
- WatchlistRail 신호강도 (→ W-0390)
- 모바일 레이아웃 재설계 (W-0374 D-8 이후 별도 wave)
- 새 차트 기능 (이유: 본 W는 placement+typography만)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 730 치환 시 의도된 작은 폰트(legend/tooltip) 깨짐 | M | M | 치환 전 화이트리스트 grep, snapshot 비교 |
| Dashboard 재목적 → 운영팀 워크플로 장애 | M | H | `/lab/health` 이전 + 1주 301 redirect |
| TopBar L1 9개 ≤1280px overflow | H | M | 1024-1280px: Vol collapse, <1024: MobileTopBar |
| AIAgentPanel 탭 순서 변경 → 사용자 혼란 | L | M | localStorage 기반 last-active-tab 유지 |
| stylelint Svelte 호환성 | L | L | `stylelint-config-standard` + svelte processor 확인 |

### Dependencies / Rollback

- 선행: W-0381 (#889) 이미 머지됨 ✅
- 후행: W-0390 퀀트 데이터 레이어 (본 W 머지 후 착수)
- Rollback: 6개 PR 독립 — 각각 revert 가능, token CSS var 기반이라 부분 revert 가능

### Files Touched (실측 기반)

- 86개 .svelte 치환 (Phase 1A+1B)
- TopBar.svelte, StatusBar.svelte, AIAgentPanel.svelte, ChartToolbar.svelte (Phase 2-4)
- dashboard/+page.svelte 재작성, lab/health/+page.svelte 신규 (Phase 5)
- .stylelintrc.cjs 신규, package.json +1 script (Phase 6)

## AI Researcher 관점

### Data Impact

- 폰트 분포: 9-10px 730 spots → 0 (100% ≥11px)
- Hub 진입 후 트레이더 정보 가용성: Dashboard 현재 0% → 100%
- TopBar L1 항목: 5 → 8 (+H, +L, +Vol, +Mode)

### Statistical Validation

- 5-trial 수동 task 시간 ("Hub 전환 → 가격 확인 → mode 변경") ≥30% 단축
- Dashboard DAU: 트레이더 사용 ↑ / 운영자 `/lab/health` 이전 후 7일 비교

### Failure Modes

- 치환 후 레거시 9px 잔존: CI `stylelint src/**/*.svelte` exit 1
- Dashboard 운영지표 분실: `/lab/health` redirect 모니터링 1주

## Decisions

- [D-3901] stylelint vs grep CI: stylelint 선택 (정확도, Svelte 호환)
- [D-3902] AIAgentPanel 탭 순서 변경: Research→Pattern→Verdict→Decision→Judge (퀀트 워크플로)
- [D-3903] TopBar 모드: segmented control (TV/Bloomberg 표준). 거절: dropdown (2-click)
- [D-3904] AIAgentPanel 탭: 풀워드. 거절: icon (onboarding cost)
- [D-3905] FlywheelHealth: `/lab/health` 신설. 거절: `/settings/ops` (운영자 정체성 혼재)
- [D-3906] Passport/LP: `/settings/profile` 이전. 거절: 삭제 (게이미피케이션 요구사항 유지)
- [D-3907] ChartToolbar export: PNG canvas.toBlob() 구현. 거절: 스텁 유지 (신뢰 저해)

## Open Questions

- [ ] [Q-3901] TopBar ≤1280px: H/L/Vol 중 숨김 우선순위 (Vol 먼저?)
- [ ] [Q-3902] StatusBar 모바일: mode selector 유지 vs MobileBottomNav 슬롯?
- [ ] [Q-3903] Dashboard "Today Captures" 데이터: scan_signal_events 직접 조회 vs 신규 `/api/dashboard/summary` endpoint?
- [ ] [Q-3904] LucideSvelte 번들 영향 (현재 emoji 0KB → tree-shaken ~5KB) — 허용?

## Implementation Plan

1. **PR-A** Phase 1A: terminal/ 47파일 폰트 치환 + snapshot
2. **PR-B** Phase 1B: 나머지 39파일 폰트 치환
3. **PR-C** Phase 2: TopBar L1+L2 재구성
4. **PR-D** Phase 3: AIAgentPanel 풀워드+순서 + ChartToolbar cleanup
5. **PR-E** Phase 4: StatusBar 정보 전용화
6. **PR-F** Phase 5: Dashboard Trader Home + /lab/health
7. **PR-G** Phase 6: stylelint rule + QA

## Exit Criteria

- [ ] AC1: `stylelint 'src/**/*.svelte'` exit 0 (신규 위반 0)
- [ ] AC2: `grep -rE "font-size:\s*(7|8|9|10)px" app/src/lib/hubs/ --include="*.svelte" | wc -l` = 0
- [ ] AC3: TopBar L1+L2 항목 ≥8 (symbol, price, chg, H, L, Vol, TF, mode)
- [ ] AC4: AIAgentPanel 5탭 모두 풀워드 ≥11px, 탭 순서 Research→Pattern→Verdict→Decision→Judge
- [ ] AC5: AIAgentPanel Pattern/Verdict 탭 숫자 배지 렌더
- [ ] AC6: ChartToolbar emoji 0개, native `<select>` 0개
- [ ] AC7: StatusBar 모드 button 0개 (desktop)
- [ ] AC8: `/dashboard` Trader Home 4 section visible
- [ ] AC9: `/lab/health` 렌더 성공 + FlywheelHealth 정상 표시
- [ ] AC10: stylelint rule active, CI 신규 위반 차단
- [ ] AC11: svelte-check error 증가 = 0
- [ ] AC12: vitest snapshot 7개 PASS
- [ ] AC13: 7개 PR merged + CURRENT.md SHA 업데이트

## Facts

- sub-11px 위반: 86 files / 730 occurrences
- 최다 위반: IntelPanel.svelte(52), TradeMode.svelte(34), TrainMode.svelte(28)
- typography.css 정의됨, 미사용 확인
- engine ticker: funding_rate, open_interest 이미 존재 (W-0390에서 노출)
- TerminalHub.svelte 기존 단축키: 1-8(TF), t/h/v/e/r/f/l(drawing), b(range)
- kimchi premium API: `/api/market/kimchi-premium` 존재 (W-0390에서 노출)

## Canonical Files

- `app/src/lib/styles/typography.css`
- `app/src/lib/hubs/terminal/TopBar.svelte`
- `app/src/lib/hubs/terminal/StatusBar.svelte`
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte`
- `app/src/lib/hubs/terminal/workspace/ChartToolbar.svelte`
- `app/src/routes/dashboard/+page.svelte`
- `app/src/routes/lab/health/+page.svelte` (신규)
- `app/.stylelintrc.cjs` (신규)
- `app/src/lib/hubs/**/*.svelte` (86파일 치환)

## Owner

app

## Assumptions

- W-0381 (#889) typography.css token 이미 머지됨 — 선행 조건 충족
- LucideSvelte: `app/package.json` dep 확인 후 없으면 추가 (Phase 3 착수 전)
- Dashboard `/lab/health` redirect: 1주 유지 (운영팀 공지 필요)
- mobile StatusBar mode: 변경 보류 (W-0374 D-8 이후 별도)
- 치환 화이트리스트: chart tooltip legend 7px 2개 파일 명시적 예외 처리

## Next Steps

1. PR-A: terminal/ 47파일 폰트 치환 (Phase 1A)
2. PR-B: 나머지 39파일 폰트 치환 (Phase 1B)
3. PR-C: TopBar L1+L2 재구성 (H/L/Vol + Mode segmented)
4. PR-D: AIAgentPanel 풀워드 탭 + ChartToolbar cleanup
5. PR-E: StatusBar 정보 전용화
6. PR-F: Dashboard Trader Home + /lab/health 신설
7. PR-G: stylelint rule + 5-Hub QA

## Handoff Checklist

- [ ] W-0381 (#889) 머지 확인
- [ ] terminal/ 47파일 치환 후 svelte-check 0 errors 확인
- [ ] TopBar L1: H/L/Vol 데이터 engine API 응답 확인 (`/api/terminal/signals`)
- [ ] AIAgentPanel 탭 순서 변경 → 사용자에게 공지 필요 (localStorage last-tab 유지)
- [ ] Dashboard FlywheelHealth → `/lab/health` redirect 배너 1주 유지
- [ ] CURRENT.md 에이전트 락 테이블 등재
