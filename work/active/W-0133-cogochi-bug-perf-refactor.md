# W-0133 — Cogochi Bug Fix + Performance Refactor

**Owner:** app
**Type:** Bug fix + performance (surface change)
**Branch:** claude/W-0133-cogochi-perf (new, from main)
**Status:** DESIGNED — 2026-04-22
**Priority:** P0 (클릭 안 됨) → P1 (느림) → P2 (리팩토링)

---

## Goal

현재 `http://127.0.0.1:5175/cogochi` 에서 확인된 **클릭 불가 / 런타임 크래시** 버그를 수정하고,
이후 W-0122 Pillar 확장이 안전하게 붙을 수 있도록 TradeMode 업데이트 루프를 정리한다.
UI/UX baseline 은 이 worktree가 띄우는 `5175` shell 그대로 유지한다.

---

## Scope

3개 슬라이스로 분리. 각 슬라이스는 단일 PR.

### Slice A — 클릭 버그 수정 (P0, 소형)
**파일:** `app/src/lib/cogochi/AppShell.svelte`

**버그:** `Cmd+W` (탭 닫기) 가 동작하지 않음.
- `shellState`는 `$state(null)` 로 선언됨.
- `$effect` 안에서 `shellStore.subscribe(s => (shellState = s))()` — 괄호 `()` 가 즉시 unsubscribe를 호출. subscription이 첫 번째 emit 이후 즉시 해제됨.
- 결과: `shellState` 는 초기값(initial load 1회)만 반영. 탭을 새로 열어도 `shellState.tabs.length`가 stale → `Cmd+W` 조건 `shellState?.tabs?.length > 1` 이 잘못 평가됨.

**수정:**
```svelte
// Before (broken):
$effect(() => {
  shellStore.subscribe(s => (shellState = s))();
});

// After: $shellStore 직접 바인딩으로 교체
// 마크업에서 $shellStore 를 이미 쓰고 있으므로 shellState 변수 자체를 제거하고
// onMount 의 참조를 $shellStore 로 교체.
// 단, onMount 는 reactive context가 아니므로 별도 writable 파생 방식 사용.
```

실제 수정 방향:
1. `shellState` 를 `$state` 에서 제거.
2. `onMount` 의 `Cmd+W` 핸들러를 클로저로 최신 상태 참조하도록 수정:
   ```ts
   // onMount 내부:
   if (mod && e.key.toLowerCase() === 'w') {
     const current = get(shellStore); // svelte/store 의 get() 사용
     if (current.tabs.length > 1) {
       e.preventDefault();
       shellStore.closeTab(current.activeTabId);
     }
   }
   ```
3. `import { get } from 'svelte/store'` 추가.
4. 이미 마크업에서 `$shellStore.aiVisible` 등을 직접 쓰고 있으므로 충돌 없음.

**Exit:** `Cmd+W` 로 탭 닫기 동작 확인. `shellState` 변수 참조 0건.

---

### Slice B — 성능: TradeMode 업데이트 루프 정리 (P1, 소형)
**파일:** `app/src/lib/cogochi/modes/TradeMode.svelte`

**현재 문제 3가지:**

**B1. analyze + venue + liq 가 순차 실행**
```ts
// handleCandleClose — 현재:
const res = await fetch('/api/cogochi/analyze?...');  // await
analyzeData = ...;
void refreshVenueDivergence();  // fire-and-forget (순차)
void refreshLiqClusters();      // fire-and-forget (순차)
```
analyze fetch 가 완료된 후에야 venue/liq가 시작됨. 3개는 완전히 독립적이므로 병렬화 가능.

**B2. 60s 폴링과 candleClose 가 동시에 같은 state를 수정하는 race condition**
- 폴링 interval 에서 venue/liq를 갱신하는 동시에 candle close 도 갱신함.
- 두 경로가 동일한 `$state` 를 writes → interleaved updates.
- `in-flight` 가드 없음.

**B3. 60s 폴링이 symbol 변경 시 즉시 이중 호출**
```ts
$effect(() => {
  void symbol; // symbol change
  void refreshVenueDivergence(); // 즉시 호출
  void refreshLiqClusters();     // 즉시 호출
  const iv = setInterval(() => { // 60초 후 또 호출
    void refreshVenueDivergence();
    void refreshLiqClusters();
  }, 60_000);
```
symbol 변경 즉시 fetch + 60초 뒤 또 fetch. 첫 fetch 결과가 도착하면 60초 안에 이미 stale인 값으로 덮어쓸 수 있음.

**수정 — 단일 `refreshAll()` 함수로 통합:**
```ts
let refreshing = false; // in-flight guard

async function refreshAll() {
  if (refreshing) return; // dedup
  refreshing = true;
  try {
    const [analyzeRes, venueRes, liqRes] = await Promise.allSettled([
      fetch(`/api/cogochi/analyze?symbol=${symbol}&tf=${timeframe}`),
      fetch(`/api/market/venue-divergence?symbol=${symbol}`),
      fetch(`/api/market/liq-clusters?symbol=${symbol}&window=4h`),
    ]);
    if (analyzeRes.status === 'fulfilled' && analyzeRes.value.ok)
      analyzeData = await analyzeRes.value.json();
    if (venueRes.status === 'fulfilled' && venueRes.value.ok)
      venueDivergence = await venueRes.value.json();
    if (liqRes.status === 'fulfilled' && liqRes.value.ok)
      liqClusters = await liqRes.value.json();
  } finally {
    refreshing = false;
  }
}
```

- `handleCandleClose` → `void refreshAll()`
- 폴링 `$effect` → `void refreshAll()` + 60s interval 도 `void refreshAll()`
- candle close dedup (`lastCandleTime`) 유지.

**Exit:** 3개 fetch 가 동시에 시작됨 (network 탭에서 확인). race condition 없음.

---

### Slice C — 성능: shell.store.ts localStorage 디바운스 (P2, 소형)
**파일:** `app/src/lib/cogochi/shell.store.ts`

**현재 문제:**
```ts
subscribe(state => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('cogochi_shell_v5', JSON.stringify(state));
  }
});
```
매 store update (탭 open/close, 사이드바 토글, 리사이즈 등) 마다 동기 localStorage write.
모바일에서 viewport 리사이즈 시 연속 write.

**수정:**
```ts
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
subscribe(state => {
  if (typeof window === 'undefined') return;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    localStorage.setItem('cogochi_shell_v5', JSON.stringify(state));
  }, 300); // 300ms debounce
});
```

**modelDelta 단일 패스 개선 (같은 파일, 1줄):**
```ts
// Before:
export const modelDelta = derived(allVerdicts, $v =>
  Object.values($v).filter(v => v === 'agree').length * 0.03 -
  Object.values($v).filter(v => v === 'disagree').length * 0.01
);

// After:
export const modelDelta = derived(allVerdicts, $v => {
  let a = 0, d = 0;
  for (const v of Object.values($v)) { if (v === 'agree') a++; else if (v === 'disagree') d++; }
  return a * 0.03 - d * 0.01;
});
```

**Exit:** 연속 클릭 시 localStorage write 횟수 < 5회/초 (DevTools 에서 확인).

---

## Non-Goals

- venue-divergence / liq-clusters API 내부 변경 — Phase 1 scaffold 는 그대로.
- scan engine 업스트림 fan-out 재구조화 — 현재 `Promise.allSettled` + 5s timeout 으로 충분.
- Coinalyze 5→1 배치 호출 통합 — 별도 work item (scan engine 변경).
- 새 기능 추가.

---

## Canonical Files

```
app/src/lib/cogochi/AppShell.svelte        — Slice A: shellState 버그
app/src/lib/cogochi/modes/TradeMode.svelte  — Slice B: 병렬화 + race fix
app/src/lib/cogochi/shell.store.ts          — Slice C: localStorage 디바운스
```

---

## Facts

1. `shellStore.subscribe(...)()` — 즉시 unsubscribe 호출이 버그 원인. Svelte 5 `$effect` 에서는 cleanup을 return 으로 반환해야 함.
2. venue-divergence + liq-clusters API route 모두 존재 (`app/src/routes/api/market/`).
3. `5175` 의 `/cogochi` 는 desired UI/UX baseline 이며, 다른 worktree의 shell/auth flow 와 혼합하면 안 된다.
4. 브라우저 검증에서 `AIPanel SEND disabled`, `CaptureAnnotationLayer` 구독 예외, `ChartBoard` marker API 예외가 재현됐다.
5. 3개 fetch (`analyze`, `venue-divergence`, `liq-clusters`) 는 완전히 독립적 — `Promise.allSettled` 로 병렬화 가능.
6. scan engine 은 18개 upstream 을 `Promise.allSettled` + 5s timeout 으로 이미 올바르게 처리 중.
7. `$shellStore` 는 마크업에서 이미 올바르게 subscribed (auto `$` 표기법).

---

## Assumptions

1. `get(shellStore)` (svelte/store) 는 SvelteKit SSR 환경에서도 안전하게 동작.
2. 300ms localStorage 디바운스는 사용자가 인지할 수 없는 수준 — UX 영향 없음.
3. Slice B 의 `refreshing` flag 는 단일 컴포넌트 인스턴스 범위이므로 멀티탭 race 위험 없음.

---

## Open Questions

1. **TradeMode `$effect` 초기 analyze fetch (line 41-56) 도 `refreshAll()` 로 통합?** — 초기 fetch는 `chartPayload` 도 포함하므로 별도 유지가 맞음. `refreshAll()` 은 candle-close refresh 용으로만 사용.
2. **Slice A 적용 후 `shellState` 변수 사용처가 더 있는지 확인 필요.** — `AppShell.svelte` 전체 grep 필요.

---

## Decisions

- `5175` shell layout / copy / navigation / indicator placement 는 canonical baseline 으로 간주하고 유지한다.
- Slice A: `get(shellStore)` 패턴 사용. `$effect` 완전 제거.
- Slice B: `refreshAll()` + `Promise.allSettled` + `refreshing` in-flight guard.
- Slice C: 300ms debounce (500ms 는 너무 길어 다중 rapid-tab 케이스에서 data loss 가능).
- 3개 슬라이스를 동일 PR 에 묶어도 무방 (모두 app 내부, contract 변경 없음).

---

## Next Steps

1. Slice A 구현 → `Cmd+W` 수동 테스트.
2. Slice B 구현 → network 탭에서 3개 fetch 병렬 시작 확인.
3. Slice C 구현 → localStorage 라이트 빈도 확인.
4. 단일 PR 생성 → 리뷰 후 main 머지.

---

## Exit Criteria

- [ ] `Cmd+W` 탭 닫기 동작 (2탭 이상 오픈 후 확인)
- [ ] `handleCandleClose` 호출 시 analyze/venue/liq 3개 fetch 동시 시작 (network 탭 기준 ≤50ms 차이)
- [ ] symbol 변경 시 refreshing guard 작동 (연속 변경 시 이전 fetch 중복 없음)
- [ ] 5초간 연속 store 조작 시 localStorage write ≤ 20회 (현재는 매 update마다 write)
- [ ] `svelte-check` 에러 0건, 기존 tests pass

---

## CTO 관점 추가 설계 메모

### 왜 지금 이걸 먼저 하는가

W-0122 Pillar 2 (Deribit) + Pillar 4 (Arkham) 가 붙으면 TradeMode의 `refreshAll()` 에
추가 fetch 가 들어온다. 지금 루프가 정리되지 않으면 Pillar 추가마다 race condition 이 누적됨.
Slice B 가 이 공간을 만드는 선행 작업.

### 인프라 블로커 (사용자 실행 필요, 코드 무관)

다음 순서로 실행해야 스캐너가 정상 작동:
```
1. Supabase migration 018 실행 (대시보드 SQL)
2. gcloud run services update cogotchi \
     --update-env-vars ENGINE_INTERNAL_SECRET=X,EXCHANGE_ENCRYPTION_KEY=Y
3. gcloud run deploy cogotchi --source engine/ --region asia-southeast1
4. Vercel → EXCHANGE_ENCRYPTION_KEY 추가 → redeploy
```

### 다음 work item 순서 (본 PR 이후)

| 번호 | 작업 | 의존성 |
|------|------|--------|
| W-0134 | ML 학습 파이프라인 검증 (61건 seed → train-model 호출) | 인프라 완료 후 |
| W-0135 | Scan fan-out 계측 (Coinalyze 5→2 배치, Yahoo 3→1 배치) | W-0133 완료 후 |
| W-0122-A | Venue Divergence strip 실데이터 연결 | W-0133 Slice B 완료 후 |
| W-0122-B2 | Liq 전용 WS worker (forceOrder@arr) | W-0133 Slice B 완료 후 |
