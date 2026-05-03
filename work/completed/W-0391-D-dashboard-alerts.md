# W-0391-D — Dashboard Alert Strip + Kimchi Phase 5

> Wave: 5 | Priority: P1 | Effort: S (1-2d)
> Charter: In-Scope
> Status: 🟡 Design Draft
> Parent: W-0391 #937
> Absorbs: W-0390 Phase 5
> Created: 2026-05-03

## Goal

Dashboard 최상단에 48px Alert Strip — OI 급등/FR 이상값 실시간 표시. 트레이더가 대시보드 진입 즉시 "지금 주목할 것"을 파악.

## Scope

### Phase D1 — AlertStrip 컴포넌트 + 데이터 (1d)
파일:
- `app/src/lib/hubs/dashboard/AlertStrip.svelte` (신규)
- `app/src/routes/dashboard/+page.svelte` (AlertStrip 마운트)

UI:
```
┌── 즉시 주목 (Alert Strip 48px) ───────────────────────────────────┐
│  ⚡ ETH OI +12%/30m (숏스퀴즈 선행)  │  ⚡ Kim +2.8% → 상단 저항  │
└────────────────────────────────────────────────────────────────────┘
```

발화 조건:
- OI 급등: 30m 대비 +10% 초과 — `feature_windows` 테이블 (이미 시계열 존재)
- FR 이상: `funding_rate > 0.05%` or `< -0.03%` (극단 포지션 쏠림)
- Kimchi: `/api/market/kimchi-premium` ≥ 2.5% (기존 API, 30s 캐시)

### Phase D2 — Kimchi + OI/FR 섹션 (0.5d)
파일: `app/src/routes/dashboard/+page.svelte`

```
┌── KimchiPremium (48px) ──────────────────────────────────────────┐
│  +2.34% ▲  업비트 95,450 KRW / 바이낸스 $95,123                  │
└──────────────────────────────────────────────────────────────────┘
```

### Phase D3 — 뮤트 + 모바일 (0.5d)
- 알림 타입별 mute 토글 (localStorage)
- 모바일: Alert Strip → horizontal scroll (2개 초과 시)

## Non-Goals

- Telegram/Push 알림 전송 (F-36 별도)
- Alert 커스텀 조건 설정 UI

## Exit Criteria

- [ ] AC1: AlertStrip 컴포넌트 렌더 + OI/FR/Kimchi 조건 각 1개 트리거 확인
- [ ] AC2: Dashboard 진입 시 AlertStrip p95 ≤ 200ms
- [ ] AC3: 뮤트 토글 localStorage 반영 확인
- [ ] AC4: `grep "AlertStrip" app/src/routes/dashboard/+page.svelte` 존재
- [ ] CI green

## Files Touched (stream-exclusive)

```
app/src/lib/hubs/dashboard/AlertStrip.svelte  (신규)
app/src/routes/dashboard/+page.svelte  (AlertStrip 마운트 + Kimchi 섹션)
```
