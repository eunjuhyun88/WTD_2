# W-0210 — Terminal Data Visualization Layers 완료

**날짜**: 2026-04-25  
**브랜치**: `feat/agent-execution-protocol` (origin에 push 안 됨)  
**HEAD SHA**: `0433ccd7`  
**상태**: ✅ 4개 레이어 전부 완료, **PR #283 머지됨**  
**main SHA**: `38ce46a8`

---

## 커밋 이력 (3개)

| SHA | 내용 |
|---|---|
| `68112f6e` | Layer 1 + Layer 3: AlphaOverlayLayer + BTC comparison overlay |
| `7f0038db` | Layer 2: Whale Watch (Hyperliquid leaderboard) |
| `0433ccd7` | Layer 4: News flash bar + chart news markers |

---

## 신규 파일 목록

### Layer 1 — AlphaOverlayLayer
- `app/src/components/terminal/chart/AlphaOverlayLayer.ts`
  - lightweight-charts `createSeriesMarkers` 2번째 플러그인 독립 운용
  - `apply(analysis)`: price lines(TP1/Stop/Entry) + phase markers + breakout arrows
  - 기존 CVD 마커 플러그인과 충돌 없음

### Layer 2 — Whale Watch
- `app/src/routes/api/cogochi/whales/+server.ts`
  - `POST https://api.hyperliquid.xyz/info { type: 'leaderboard' }` 프록시
  - $100K 이상 포지션 Top 10, 60초 서버 캐싱
- `app/src/lib/types/whale.ts` — `WhalePosition` 인터페이스
- `app/src/lib/stores/whaleStore.ts` — 60초 클라이언트 캐싱
- `app/src/components/terminal/workspace/WhaleWatchCard.svelte`
  - 오른쪽 패널 하단, 롱/숏 방향 + 사이즈 + 30d PnL 표시

### Layer 3 — BTC Comparison Overlay
- `app/src/lib/stores/comparisonStore.ts`
  - 기준값 100 정규화, 클라이언트 O(n) 연산, 60초 캐싱
- `chartIndicators.ts`에 `'comparison'` IndicatorKey 추가

### Layer 4 — News Flash Bar
- `app/src/routes/api/cogochi/news/+server.ts`
  - CryptoPanic 무료 공개 API 프록시, 5분 서버 캐싱
  - votes 비율로 sentiment 분류 (positive/negative/neutral)
  - stale fallback 지원
- `app/src/lib/stores/newsStore.ts`
  - 5분 클라이언트 캐싱, `newsEventsToAlphaMarkers()` 헬퍼
  - 최대 8개 마커, 24시간 이내 뉴스만, 감성 색상 코딩
- `app/src/components/terminal/workspace/NewsFlashBar.svelte`
  - 22px 스크롤 티커, 뉴스 없으면 자동 숨김

---

## 수정된 기존 파일

| 파일 | 변경 내용 |
|---|---|
| `app/src/components/terminal/workspace/ChartBoard.svelte` | AlphaOverlayLayer 인스턴스 관리, comparison 시리즈 렌더, whale price lines |
| `app/src/components/terminal/peek/CenterPanel.svelte` | `analysisData` prop 추가 → ChartBoard 전달 |
| `app/src/components/terminal/peek/RightRailPanel.svelte` | `WhaleWatchCard` 추가 (heroAsset && heroVerdict 상태) |
| `app/src/routes/terminal/+page.svelte` | NewsFlashBar 삽입, newsStore fetch $effect, alphaMarkersWithNews $derived |
| `app/src/lib/stores/chartIndicators.ts` | `IndicatorKey`에 `'comparison'` 추가, normalizeIndicatorKey 확장 |

---

## 비용 모델

| 레이어 | 비용 |
|---|---|
| L1 AlphaOverlay | $0 — 기존 analyze 응답 재활용 |
| L2 Whale Watch | $0 — Hyperliquid 공개 API |
| L3 BTC Comparison | $0 — 클라이언트 연산 |
| L4 News | $0 — CryptoPanic 무료 공개 API |
| **합계** | **$0 net-new** |

---

## 다음 에이전트가 할 일

1. **PR 오픈**: `feat/agent-execution-protocol` → `main` (또는 `release`)
   - 3개 커밋 포함: 68112f6e, 7f0038db, 0433ccd7
2. **CURRENT.md 업데이트**: W-0210 완료 항목 추가, 브랜치 상태 갱신
3. **검증**: 터미널 로드 → 심볼 선택 → 우측 패널 고래카드 + 뉴스바 확인
4. **engine 미수정 파일** `engine/patterns/definitions.py`, `engine/uv.lock` unstaged 상태 — 무관 파일, 건드리지 말 것

---

## 주의사항 (혼선 방지)

- **AlphaOverlayLayer** vs 기존 `candleMarkerApi`: 둘 다 `createSeriesMarkers` 플러그인이지만 **독립 인스턴스**. 건드리면 마커 충돌 가능.
- **chartIndicators.ts의 `'comparison'`**: `PANE_INDICATORS` 배열에는 **포함하지 말 것** (서브패인 아닌 메인차트 오버레이).
- **RightRailPanel.svelte의 WhaleWatchCard**: `heroAsset && heroVerdict` 블록 내부에만 렌더링됨. scan mode에서는 안 보임 (의도된 동작).
- **뉴스 API**: `auth_token=free` 파라미터로 CryptoPanic 무료 엔드포인트 호출 중. 인증 없음 — 별도 env 불필요.
