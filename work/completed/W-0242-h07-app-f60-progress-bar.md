# W-0242 — H-07-app: F60GateBar Progress UI

> Wave 2.5 | Owner: app | Branch: `feat/H07-app-f60-progress-bar`
> **선행: W-0241 H-07-eng (engine endpoint 작동 후)**

## Goal

`F60GateBar.svelte` 컴포넌트로 사용자별 F-60 marketplace gate 진행률을 dashboard top section에 표시. verdict count + accuracy 시각화 + lock/unlock state 표시.

## Owner

app

## Primary Change Type

Product surface change (new component + dashboard integration)

## Scope

| 파일 | 변경 이유 |
|---|---|
| `app/src/components/dashboard/F60GateBar.svelte` | NEW — progress bar 컴포넌트 (LIS palette tokens) |
| `app/src/lib/api/terminalApi.ts` | `getF60Status(userId?)` 메서드 추가 |
| `app/src/routes/api/users/[user_id]/f60-status/+server.ts` | NEW — engine proxy (auth guard + 8s timeout) |
| `app/src/routes/dashboard/+page.svelte` | F60GateBar top section 통합 |
| `app/src/components/dashboard/__tests__/F60GateBar.test.ts` | NEW — vitest 6+ 케이스 |

## Non-Goals

- engine endpoint 구현 (W-0241에서)
- 알림 / Toast (unlock 시) — Wave 3에서 별도
- per-pattern accuracy 표시 — follow-up
- N-05 Marketplace 진입 버튼 — charter 회색지대, 별도 W-####

## Canonical Files

- `work/active/W-0242-h07-app-f60-progress-bar.md` (this)
- `work/active/W-0232-h07-f60-gate-design.md` (선행 설계)
- `work/active/W-0241-h07-eng-f60-status-api.md` (engine 의존)
- `app/src/lib/styles/tokens.css` (LIS palette)
- `app/src/components/dashboard/F60GateBar.svelte` (NEW)
- `app/src/routes/api/users/[user_id]/f60-status/+server.ts` (NEW proxy)
- `app/src/lib/api/terminalApi.ts`
- `app/src/routes/dashboard/+page.svelte`

## Facts

1. main = `c43a22ed`
2. W-0232 §UI Spec에 visual layout + LIS palette 토큰 명시됨
3. dashboard `+page.svelte` 이미 존재 (top section 추가만)
4. `terminalApi.ts` 패턴: `parseErrorMessage` + `AbortSignal.timeout(8_000)` 표준
5. engine proxy 표준 패턴: `app/src/routes/api/captures/[id]/watch/+server.ts` 참조

## Assumptions

1. W-0241 머지 후 `/users/{user_id}/f60-status` 작동
2. response shape = W-0232 §API Spec
3. user_id는 cookie auth에서 추출 (또는 `me` alias 사용)
4. Dashboard top section은 F60GateBar 추가에 충분한 공간

## Open Questions

1. `me` alias 사용 vs path user_id 명시? — 권고: 둘 다 지원 (`me` → auth user_id 매핑)
2. Polling interval? — 권고: cache 5-min과 align해 5-min interval (또는 verdict 제출 후 invalidate)
3. mobile에서 placement? — 권고: 데스크탑 dashboard top, mobile은 별도 collapse

## Decisions

- D-W-0242-1: F60GateBar = standalone 컴포넌트, props로 데이터 받음 (fetch는 parent)
- D-W-0242-2: `me` alias 지원 (`/api/users/me/f60-status`)
- D-W-0242-3: 5-min interval polling (cache TTL과 align)
- D-W-0242-4: LIS palette tokens 강제 (하드코딩 X)
- D-W-0242-5: dashboard top section만 (mobile은 W-0245 follow-up)

## Next Steps

1. `terminalApi.getF60Status(userId)` 메서드 추가
2. `/api/users/[user_id]/f60-status/+server.ts` proxy
3. `F60GateBar.svelte` 컴포넌트
4. `dashboard/+page.svelte` 통합
5. Vitest unit test 6+ 케이스
6. App CI pass

## Exit Criteria

- [ ] F60GateBar dashboard top section에 노출
- [ ] Progress bar fill % 정확 (count_pct vs acc_pct 중 작은 값)
- [ ] Lock icon (🔒) + reason 표시
- [ ] Unlock 상태 (✅) 표시
- [ ] LIS palette tokens 사용 (하드코딩 0)
- [ ] `me` alias 작동
- [ ] App CI pass
- [ ] Vitest 6+ 케이스 pass

## Visual Spec (W-0232 §UI Spec)

### Locked
```
┌────────────────────────────────────────────────┐
│ F-60 Marketplace Gate                           │
│ Verdicts: 142 / 200    ████████░░░░ 71%         │
│ Accuracy: 65.5% (target 55%)                    │
│ Status: 🔒 Locked — 58 more verdicts needed     │
└────────────────────────────────────────────────┘
```

### Unlocked
```
┌────────────────────────────────────────────────┐
│ F-60 Marketplace Gate                  ✅       │
│ Verdicts: 234 / 200    ████████████ ✓           │
│ Accuracy: 72.3% (target 55%)                    │
│ Status: 🟢 Unlocked — Marketplace 진입 가능       │
└────────────────────────────────────────────────┘
```

### Color tokens (LIS palette)

| State | Token |
|---|---|
| Progress fill (locked, <80%) | `--lis-accent` (#db9a9f) |
| Progress fill (≥80%) | `--sc-yellow-400` (#facc15) |
| Progress fill (unlocked) | `--lis-positive` (#4ade80) |
| Progress bg | `--sc-grey-3` (#1a1a1a) |
| Lock icon | `--sc-grey-7` (#666666) |
| Unlock icon | `--lis-positive` |

### Typography

- Title: mono 11px, uppercase letter-spacing
- Verdict count: mono 12px tabular-nums
- Accuracy %: mono 12px tabular-nums
- Status text: mono 10px

## API 호출

```typescript
// terminalApi.ts
export interface F60Status {
  user_id: string;
  verdict_count: number;
  verdict_count_target: number;
  valid_count: number;
  invalid_count: number;
  accuracy: number;
  accuracy_target: number;
  f60_unlocked: boolean;
  progress_pct: number;
  lock_reason: 'verdict_count_below_target' | 'accuracy_below_target' | null;
  calculated_at: string;
}

export async function getF60Status(
  userId: string = 'me',
  signal?: AbortSignal
): Promise<F60Status> {
  const res = await fetch(`/api/users/${userId}/f60-status`, {
    signal: signal ?? AbortSignal.timeout(8_000),
  });
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(parseErrorMessage(payload, res.status));
  }
  if (!isRecord(payload)) {
    throw new Error(`Invalid f60-status response (${res.status})`);
  }
  return payload as F60Status;
}
```

## Component skeleton

```svelte
<script lang="ts">
  import { getF60Status, type F60Status } from '$lib/api/terminalApi';

  let status = $state<F60Status | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      status = await getF60Status('me');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load F-60 status';
    } finally {
      loading = false;
    }
  }

  $effect(() => { load(); });
  // 5-min interval polling
  $effect(() => {
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  });

  const progressPct = $derived(status ? Math.round(status.progress_pct * 100) : 0);
  const fillClass = $derived(
    status?.f60_unlocked ? 'fill-unlocked' :
    progressPct >= 80 ? 'fill-near' : 'fill-locked'
  );
</script>

<!-- Bar UI with class={fillClass} -->
```

## CTO 설계 원칙 적용

### 성능
- 5-min polling (cache TTL과 align) → 서버 부하 ↓
- Lazy load: dashboard 진입 시 첫 fetch
- AbortSignal.timeout(8s)

### 안정성
- Loading / error state 명시
- 5-min interval 정리 (cleanup)
- Optimistic update 없음 (read-only)

### 보안
- user_id `me` alias → server에서 auth user_id 매핑
- Proxy route: `requireAuth()` 적용
- Path param 검증

### 유지보수성
- 계층: app/ 단독 (engine은 W-0241)
- 계약: F60Status interface = engine response shape
- 테스트: 6+ vitest (locked / near / unlocked / 0 verdicts / error / loading)
- 롤백: dashboard에서 컴포넌트 제거만 → 영향 0

## Handoff Checklist

- 본 PR 머지 후 W-0241 endpoint 정상 작동 확인 필수
- N-05 Marketplace 진입 버튼은 charter confirm 후 별도 PR

## Risks

| 위험 | 완화 |
|---|---|
| W-0241 endpoint 미머지 | W-0241 → W-0242 직렬, head depend |
| 5-min polling이 사용자 idle 시 부하 | visibility API로 inactive 시 pause (follow-up) |
| `me` alias 보안 | server-side auth user 추출 시 user_id 강제 |
| Mobile 좁은 화면에서 progress bar 깨짐 | flex-wrap + 최소 width 240px |
