# W-0102 Checkpoint — 2026-04-19 Prompt Agent + Chart Discipline Session

**Branch:** `claude/w-0102-prompt-agent` (5 commits, not merged to main)
**Worktree:** `.claude/worktrees/wizardly-black`

## Shipped this session

| hash | description |
|------|-------------|
| `2852b47` | feat(W-0102) Slice 1+2: URL `?q=` auto-submit + `chart_action` SSE handler |
| `4c6620b` | feat(W-0102 Slice 3): shared `chartIndicators` store (SSE + popover + × 버튼 single source of truth) |
| `f867969` | style(terminal): Bloomberg-style pane header density — 10px mono, 4/8px rhythm, 16px × hit target |
| `48f3484` | fix(ChartBoard): CVD를 메인 차트에서 서브페인으로 분리 (user feedback: "보조지표만 같이, 나머지는 하단 스택") |

**Plus** (pre-existing, carried into this branch):
- `5abbfb3` fix(test): update test_capture_routes verdict field name
- `6c1285e` feat(W-0100): WYCKOFF_SPRING_REVERSAL pattern

## Verified end-to-end

- 홈 composer / Dashboard Watching → `/terminal?q=...` → **auto-submit**, 새로고침 시 재실행 안 됨.
- "ETH 4h로 전환해줘" → LLM이 `chart_control` tool 호출 → `chart_action` SSE event → `selectAsset` + `setActiveTimeframe` 반영 (TF pill 4H active 확인).
- "SOL로 전환해줘" → 헤더/레일/분석 패널 전부 SOL로 갱신.
- CVD pane × 버튼 → localStorage 반영 + 차트에서 제거 (즉시).
- 메인 차트에 CVD cumulative 더 이상 안 그려짐 (derivativesOnMain=true일 때 Funding % 만 overlay).

## Next session: UI/UX audit — 중복 정보 재배치

사용자 지적 (2026-04-19 session end):
> "중복된 차트의 숫자 보이는거랑, 토큰가격보이는거랑 다 최고의 위치를 재정비하고,
>  중복을 최소화, 그리고 올바른 정보 배치를 위해 최고의 선택해서 완료할때까지 진행"

### 현재 확인된 중복 패턴 (terminal 데스크톱 스크린샷)

| 정보 | 노출 위치 | 상태 |
|------|----------|------|
| **심볼 (SOL)** | top nav pill / left rail 헤더 / chart sub-header / 워치리스트 row / right panel 제목 | 4-5회 중복 |
| **가격 ($86.xx)** | top nav pill / left rail 헤더 / chart "LAST 86.31" / 워치리스트 row | 4회 중복 |
| **24H 변동률** | left rail "▼54.03%" / chart sub-header "+3.18%" (서로 다른 숫자!) | 2회, **값 불일치** |
| **TF pill 스트립** | top rail / chart header | 2회, 둘 다 active 클래스 동기화 |

### 디자인 방향 (W-0103 예정)

1. **Canonical 심볼 헤더** 하나로 통일:
   - 위치: chart top (SingleAssetBoard header 내부)
   - 내용: `SOL/USDT · 86.31 · +3.18% · 4H · BALANCED`
   - top nav는 브랜드 + 네비게이션만 (심볼 표시 제거)
2. **TF pill strip** 1개만:
   - chart header 안에 둠. top rail의 중복 제거.
3. **24H 변동률** 출처 일원화:
   - snapshot.change24hPct 하나로 통일. kline 1-bar 변화와 구분.
4. **Watchlist row**: 가격+변화율 유지 (여기선 여러 심볼 비교 목적 → 중복 허용).
5. **Right panel 제목**: "SUMMARY / ENTRY / RISK ..." 만 노출, "SOL/USDT · 4H"는 제거 (헤더와 중복).

### Slice 계획

- **Slice A**: top nav 심볼 pill 제거 — nav는 COGOCHI + Terminal/Patterns/Lab/Dashboard만.
- **Slice B**: TF pill 중복 제거 — top rail 쪽 삭제, chart header 쪽만 유지.
- **Slice C**: Right panel 헤더에서 심볼 중복 제거.
- **Slice D**: 24H 변동률 출처 통일 — `normalizedChangePct` 헬퍼로 수렴.

각 slice 커밋 + preview 스크린샷으로 증명.

## 미해결 이슈

### "끊이지 않는 캔들" 의심 — 데이터 vs 렌더 범위 불일치
- `/api/chart/klines?tf=4h&limit=500` 는 500 bars 반환 확인 (Jan 26 → Apr 19).
- 하지만 chart visible range는 "Mar 9 → Apr 13 · 6-8 bars" 만 캡처.
- 예상: lightweight-charts `timeScale().fitContent()` 이후 scroll/zoom 상태 기본값이 너무 좁거나, kline payload 에 gap 있음.
- **조사 필요**: 실제 payload의 bar간격 uniformity, `setData` 순서, time 타입 (unix sec vs ms).
- 다음 세션 설계 때 병행.

### Slice 4 보류
- `contextBuilder`에 Terminal state 주입 (active indicators + symbol + tf) — 설계만 완료, 구현 미착수.
- 이유: 도중에 사용자 피드백으로 chart discipline + UI 중복 제거가 우선순위 올라감.

## 파일 리스트

- `app/src/routes/terminal/+page.svelte` — `?q=` 파싱 + chart_action handler
- `app/src/components/terminal/workspace/ChartBoard.svelte` — store 바인딩 + pane × + main discipline
- `app/src/lib/stores/chartIndicators.ts` (신규) — 단일 인디케이터 스토어
- `work/active/W-0102-prompt-agent-chart-control.md` — 비전/설계문서

## Merge-to-main 체크리스트

- [ ] engine test_capture_routes 통과 확인 (이미 `5abbfb3`에서 field rename 처리)
- [ ] 787 tests green
- [ ] Preview 스크린샷 최종 한 번 첨부
- [ ] 중복 정보 Slice A-D 완료 후 함께 merge 고려
