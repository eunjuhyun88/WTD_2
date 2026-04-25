# W-0120 완료 / W-0121+W-0123+W-0124 설계 + 캡처 UI 반응형 설계

## Context

W-0120 (ChartBoard wire-up + engine 재배포 + Supabase migration) 완료.
이제 (1) 완료된 것들 정리/커밋, (2) 다음 3개 W 태스크 실행, (3) 캡처 어노테이션 UI를 PC/태블릿/모바일 각각 완성.

현재 상태:
- `cogotchi-00174` (100% traffic): APP_ORIGIN fix + route collision fix live
- `capture_records` Supabase 테이블 생성 완료 (21 cols, RLS)
- ChartBoard에 CaptureAnnotationLayer + CaptureReviewDrawer 와이어링 완료
- **Gap 1:** captures.py route fix가 `claude/cto-security-perf-refactor` 브랜치에 있음 → PR 필요
- **Gap 2:** 모바일(ChartMode)에 CaptureAnnotationLayer 없음 (ChartMode는 CanvasHost 직접, ChartBoard 미사용)
- **Gap 3:** chart click handler 없음 → marker 클릭해도 drawer 안 열림
- **Gap 4:** CaptureReviewDrawer 모바일에서 width:300px fixed-right → 화면 가득 덮음

---

## 1. 커밋 / PR 정리

### 해야 할 것
```bash
# captures.py route fix는 claude/cto-security-perf-refactor 브랜치에 커밋됨
# (commit 1b4a3e22 — engine에만 영향, 이미 live)
# → 해당 브랜치에서 captures.py만 cherry-pick해서 PR or main에 push
cd /Users/ej/projects/wtd-v2
git cherry-pick 1b4a3e22   # on main
```
또는 이미 live이므로 다음 engine 배포 시 함께 포함. 긴급 아님.

**체크포인트 저장:** W-0120 완료 메모리 이미 저장됨 (project_capture_chart_annotations_2026_04_21.md).

---

## 2. W-0123 — cogotchi-worker 삭제 (30분)

Cloud Scheduler가 이미 cogotchi API를 직접 호출하므로 worker 서비스 불필요.

```bash
gcloud run services delete cogotchi-worker \
  --project=notional-impact-463709-e3 \
  --region=us-east4 \
  --quiet
```

확인: `gcloud run services list --project=... --region=...` → cogotchi-worker 없어야 함.

---

## 3. W-0121 — Supabase capture_records sync (2h)

**목표:** outcome_resolver 완료 시 fire-and-forget으로 capture_records Supabase 테이블에 mirror.

### 수정 파일
1. `engine/capture/store.py` — `save()` 메서드 끝에 upsert 추가
2. `engine/scanner/scheduler.py` — `_outcome_resolver_job()` 완료 후 upsert (status 변경 시)

### 구현 패턴 (fire-and-forget)

**`engine/capture/store.py`에 추가:**
```python
import asyncio, os, logging
log = logging.getLogger("engine.capture")

def _supabase_upsert_bg(record: CaptureRecord) -> None:
    """Fire-and-forget Supabase mirror. Failures logged, never raised."""
    try:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            return
        sb = create_client(url, key)
        sb.table("capture_records").upsert(record.to_supabase_dict()).execute()
    except Exception as exc:
        log.warning("Supabase upsert failed (non-fatal): %s", exc)

# CaptureRecord에 to_supabase_dict() 추가:
def to_supabase_dict(self) -> dict:
    return {
        "capture_id": self.capture_id,
        "capture_kind": self.capture_kind,
        "user_id": self.user_id or "auto",
        "symbol": self.symbol,
        "pattern_slug": self.pattern_slug,
        "pattern_version": self.pattern_version,
        "phase": self.phase,
        "timeframe": self.timeframe,
        "captured_at_ms": self.captured_at_ms,
        "candidate_transition_id": self.candidate_transition_id,
        "candidate_id": self.candidate_id,
        "scan_id": self.scan_id,
        "user_note": self.user_note,
        "chart_context_json": self.chart_context or {},
        "feature_snapshot_json": self.feature_snapshot,
        "block_scores_json": self.block_scores or {},
        "verdict_id": self.verdict_id,
        "outcome_id": self.outcome_id,
        "status": self.status,
    }
```

`save()` 끝에:
```python
threading.Thread(target=_supabase_upsert_bg, args=(record,), daemon=True).start()
```

### 검증
- `_auto_capture_job()` 실행 → `capture_records` Supabase 테이블에 행 생성 확인
- `outcome_resolver` 실행 후 status → `outcome_ready` 변경 확인

---

## 4. W-0124 + UI — 캡처 어노테이션 반응형 설계

### 4A. Desktop (≥1024px) — CaptureReviewDrawer 개선

**현재 문제:** drawer가 chart 위에 overlay → chart가 가려짐
**해결:** chart wrapper에 `padding-right` 추가

**`ChartBoard.svelte`에 추가:**
```svelte
<!-- 기존 .chart-stack 래퍼에 class 조건 추가 -->
<div class="chart-stack" class:drawer-open={selectedCapture !== null}>
```

**CSS:**
```css
.chart-stack { transition: padding-right 240ms cubicOut; }
.chart-stack.drawer-open { padding-right: 304px; }
```

**Click handler (W-0124):** ChartBoard에서 `mainChart.subscribeClick()` 추가.

파일: `app/src/components/terminal/workspace/ChartBoard.svelte`
위치: chart init 블록 (candleSeries 생성 직후, line ~770)

```typescript
// Capture annotation click: find nearest within ±2 bars
mainChart.subscribeClick((param) => {
  if (!param.time) return;
  const ts = param.time as number;
  const tfSecs = tfToSeconds(tf);  // 기존 헬퍼 재사용
  const threshold = tfSecs * 2;
  // annotations은 captureAnnotationsStore에서 읽음
  // CaptureAnnotationLayer의 annotations를 ChartBoard로 올려야 함
  // → CaptureAnnotationLayer에 onAnnotationsChange 콜백 추가
});
```

**또는 더 단순하게:** CaptureAnnotationLayer 자체에서 subscribeClick 처리.
```typescript
// CaptureAnnotationLayer.svelte 내부
$effect(() => {
  if (!series) return;
  const chart = (series as any)._chart; // internal ref
  // ...
});
```

**권장 방식:** ChartBoard에서 annotationsRef 상태를 유지하고 click handler에서 매핑.

---

### 4B. Tablet (768–1023px)

**현재 CaptureReviewDrawer:**  300px fixed right — tablet에서는 PeekDrawer review 슬롯 활용 권장.

**설계:**
- `CenterPanel.svelte`의 PeekDrawer에 `review` slot 이미 있음
- CaptureReviewDrawer를 PeekDrawer의 review 슬롯에 렌더링
- Annotation 선택 시 → PeekDrawer를 review 탭으로 강제 open
- `selectedCapture` state를 CenterPanel 레벨로 올려서 PeekDrawer에 전달

**수정 파일:**
- `app/src/components/terminal/peek/CenterPanel.svelte` (selectedCapture 상태 추가, PeekDrawer review 슬롯 연결)
- `app/src/components/terminal/workspace/ChartBoard.svelte` (onSelect prop으로 bubbling)

---

### 4C. Mobile (<768px) — Bottom Sheet

**현재 문제:**
1. ChartMode.svelte는 CanvasHost 직접 사용 → ChartBoard의 CaptureAnnotationLayer 없음
2. CaptureReviewDrawer (fixed-right 300px) 모바일에서 화면 가득 덮음

**설계:**

#### Step 1: CaptureReviewDrawer 반응형 variant
`CaptureReviewDrawer.svelte`에 `variant: 'drawer' | 'sheet'` prop 추가.

```svelte
<script>
  let { annotation, onClose, onVerdict, variant = 'drawer' } = $props();
  // transition: drawer = fly x:320, sheet = fly y:600
  const flyProps = $derived(variant === 'sheet'
    ? { y: 600, duration: 280, easing: cubicOut }
    : { x: 320, duration: 240, easing: cubicOut }
  );
</script>

<!-- sheet variant -->
{#if variant === 'sheet'}
  <div class="capture-sheet" transition:fly={flyProps}>
    <!-- same content, bottom sheet layout -->
  </div>
{:else}
  <div class="capture-drawer" transition:fly={flyProps}>
    <!-- existing right drawer -->
  </div>
{/if}
```

**CSS (추가):**
```css
.capture-sheet {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  max-height: 72vh;
  border-radius: 16px 16px 0 0;
  background: var(--sc-bg-1);
  z-index: 60;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}
.capture-sheet::before {
  content: '';
  display: block;
  width: 48px; height: 4px;
  background: var(--sc-text-3);
  border-radius: 2px;
  margin: 8px auto 12px;
}
```

#### Step 2: ChartMode에 CaptureAnnotationLayer 추가

ChartMode.svelte는 CanvasHost를 사용. CanvasHost가 series를 expose하도록 수정 필요.

**수정 파일:** `app/src/components/terminal/chart/CanvasHost.svelte`
```svelte
<!-- 기존 -->
<script>
  export let chartRef: IChartApi | null = null;  // 이미 있을 가능성
</script>
```

**확인 필요:** CanvasHost가 series ref를 expose하는지. 없으면 `let candleSeries: ISeriesApi<'Candlestick'> | null = $state(null)` 추가 + `bind:candleSeries` 지원.

**ChartMode.svelte에 추가:**
```svelte
<script>
  import CaptureAnnotationLayer from '../chart/CaptureAnnotationLayer.svelte';
  import CaptureReviewDrawer from '../chart/CaptureReviewDrawer.svelte';

  let { symbol, timeframe, onSelect } = $props();
  let candleSeries = $state(null);
  let selectedCapture = $state(null);
</script>

<CanvasHost bind:candleSeries ... />

<CaptureAnnotationLayer
  series={candleSeries}
  {symbol}
  {timeframe}
  onSelect={(ann) => { selectedCapture = ann; }}
/>

{#if selectedCapture}
  <CaptureReviewDrawer
    annotation={selectedCapture}
    variant="sheet"
    onClose={() => { selectedCapture = null; }}
    onVerdict={(id, v) => { selectedCapture = null; }}
  />
{/if}
```

---

## 5. 반응형 요약 설계도

```
PC (≥1024px)
  차트: CaptureMarkerPrimitive (vertical line + price lines)
       EvalWindowPrimitive (shaded zone)
  클릭: mainChart.subscribeClick → selectedCapture
  Drawer: CaptureReviewDrawer variant="drawer" (fixed right 300px)
  chart push: .chart-stack.drawer-open { padding-right: 304px }

Tablet (768–1023px)
  차트: 동일 primitives
  클릭: 동일
  Drawer: PeekDrawer review 슬롯에 CaptureReviewDrawer 렌더
         (annotation 선택 → PeekDrawer.openTab('review'))

Mobile (<768px)
  차트: ChartMode ← CanvasHost(bind:candleSeries)
       CaptureAnnotationLayer (series={candleSeries})
  터치: subscribeClick or marker primitive onClick → selectedCapture
  Sheet: CaptureReviewDrawer variant="sheet"
         (fixed bottom, 72vh max, border-radius 16px top, fly y:600)
         drag handle (4px × 48px centered at top)
         padding-bottom: safe-area-inset-bottom
```

---

## 6. 실행 순서 (CTO 우선순위)

| 순서 | 태스크 | 파일 | 예상 시간 |
|------|--------|------|-----------|
| 1 | **W-0123** cogotchi-worker 삭제 | GCP only | 5분 |
| 2 | **W-0124 desktop click** | ChartBoard.svelte | 30분 |
| 3 | **desktop chart push** | ChartBoard.svelte CSS | 15분 |
| 4 | **W-0121** Supabase sync | capture/store.py | 1h |
| 5 | **CaptureReviewDrawer sheet variant** | CaptureReviewDrawer.svelte | 30분 |
| 6 | **CanvasHost expose series** | CanvasHost.svelte | 20분 |
| 7 | **ChartMode wire-up** | ChartMode.svelte | 30분 |
| 8 | **Tablet PeekDrawer integration** | CenterPanel.svelte | 45분 |

---

## 7. 검증 체크리스트

- [ ] W-0123: `gcloud run services list` → cogotchi-worker 없음
- [ ] W-0121: auto_capture 실행 후 `SELECT * FROM capture_records LIMIT 5` → 행 확인
- [ ] Desktop click: 차트 마커 클릭 → drawer 열림 + chart padding 확인
- [ ] Mobile: ChartMode에서 마커 탭 → bottom sheet 열림
- [ ] Tablet: 마커 클릭 → PeekDrawer review 탭 강제 오픈
- [ ] All: onVerdict submit → POST /api/engine/captures/{id}/verdict → 200 + drawer/sheet 닫힘
- [ ] Engine: `/jobs/status` redis_connected: true 유지

---

## 수정 대상 파일 목록

```
engine/
  capture/store.py          — to_supabase_dict() + fire-and-forget upsert
  requirements.txt          — (supabase already included)

app/src/components/terminal/
  chart/CanvasHost.svelte                    — bind:candleSeries expose
  chart/CaptureReviewDrawer.svelte           — variant prop + bottom sheet CSS
  mobile/ChartMode.svelte                    — CaptureAnnotationLayer + sheet wiring
  peek/CenterPanel.svelte                    — tablet: selectedCapture → PeekDrawer review
  workspace/ChartBoard.svelte                — subscribeClick + padding-right on open
```
