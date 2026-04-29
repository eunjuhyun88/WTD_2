# W-0307 — F-12: Kimchi Premium UI 노출 (Dashboard + Terminal HUD)

> Wave: 4 | Priority: P2 | Effort: S
> Charter: In-Scope L0
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: #635

## Goal

Jin이 터미널 또는 Dashboard에서 현재 한국 시장 김치 프리미엄(%) 배지를 한눈에 확인하여, 한국 거래소 우위/디스카운트 기반의 entry timing을 참조한다.

## Owner

engine + app

## Scope

### 포함

**Engine (이미 존재 — 노출만 필요)**:
- `engine/api/routes/ctx.py:7` — `L8 kimchi : Korean exchange premium (USD/KRW + Upbit/Bithumb prices)` 주석 존재
- migration 027에 `kimchi_premium_pct` DB 컬럼 추가됨 (사용자 컨텍스트)
- 신규 endpoint 또는 기존 endpoint 확장:
  - `GET /api/market/indicator-context` — kimchi_premium_pct + ts + source 반환
  - 기존 `/ctx` 응답에 포함되어 있다면 그대로 사용

**파일 변경**:
- `engine/api/routes/ctx.py` 또는 신규 `engine/api/routes/market.py` — `GET /api/market/kimchi-premium` (단일 endpoint, 30s cache)
- `app/src/lib/components/market/KimchiPremiumBadge.svelte` (신규) — 배지 컴포넌트
- `app/src/routes/dashboard/+page.svelte` — 배지 마운트
- `app/src/lib/components/terminal/hud/DecisionHUD.svelte` 또는 RightRail — 배지 마운트 (선택, mode=Observe 우선)
- `app/src/lib/api/market.ts` (신규 또는 확장) — fetch wrapper

**배지 디자인**:
- 색: positive(>0) 빨강, negative(<0) 파랑, ±0.5% 이내 회색
- 표시: "🇰🇷 +2.34%" 또는 "🇰🇷 KP -1.20%"
- tooltip: "Upbit BTC vs Binance BTC × USD/KRW"
- 5분마다 자동 새로고침

## Non-Goals

- **alert 발송**: 김치프리미엄 임계값 알림은 별도 W-item (Watching candidates와 연동 가능 → W-0283).
- **historical chart**: 시계열 차트는 후속. 단일 % 표시만.
- **다른 거래소 (Coinone, Korbit)**: Upbit/Bithumb만 (engine 기존 source).
- **stablecoin pair (KRW vs USDT)**: 현재 USD/KRW + USDT/KRW만. KRW perp는 별도.

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Upbit/Bithumb API rate limit | L | M | engine 측 30s 캐시 + 클라이언트 polling 5min |
| USD/KRW source 장애 → premium 계산 불가 | M | M | fallback API (네이버/한국은행) + stale data 표시 |
| migration 027 컬럼이 실제로는 비어있을 가능성 | M | H | DB 검증 SQL 실행 (실측 필요 — Q-0307-1) |
| 사용자가 premium → 실제 차익거래로 오해 | L | L | tooltip에 "참고용 지표" disclaimer |
| 음수/양수 색상 표준 (한국 빨강=상승) vs 글로벌 | L | L | 한국 표준 따름 (사용자 한국인) |

### Dependencies
- 선행: engine kimchi compute 존재 (`engine/api/routes/ctx.py:7` 주석 확인)
- 선행: migration 027 (사용자 컨텍스트)
- 후행: W-0306 Observe 모드 HUD에 마운트

### Rollback Plan
- 배지 component를 `{#if showKimchi}` flag로 감싸서 toggle (env `PUBLIC_KIMCHI_BADGE_ENABLED`)
- 또는 단순 PR revert

### Files Touched
- `engine/api/routes/market.py` 또는 `ctx.py` (수정)
- `app/src/lib/components/market/KimchiPremiumBadge.svelte` (신규)
- `app/src/lib/api/market.ts` (신규 또는 확장)
- `app/src/routes/dashboard/+page.svelte` (수정 — 마운트)
- `app/src/lib/components/terminal/hud/DecisionHUD.svelte` (수정 — 마운트, 선택)
- `app/src/lib/components/market/__tests__/W0307_kimchi_badge.test.ts` (신규)

## AI Researcher 관점

### Data Impact
- 김치 프리미엄은 BTC/USDT 외 알트에도 의미 있는 신호 (한국 거래량 우세 알트는 +5%~+10% 흔함)
- 패턴 검색 결과의 metadata 필드로 추가 가능 (kimchi_at_signal 기록 → F-16 Layer C)
- 가설: 김치프리미엄 +3% 이상에서 발생한 ACCUMULATION 패턴은 hit_rate가 다르다 → 후속 분석

### Statistical Validation
- M0~M3 단계: 단순 표시만, 통계 검증 X
- M6+: kimchi_premium_pct를 feature로 추가하여 패턴 hit_rate 분석

### Failure Modes
- KRW 환율 급변 (e.g. 외환 위기) → premium 비현실적 값 → UI에서 ±50% clip
- Upbit 단독 장애 → Bithumb fallback (engine 측 처리 가정)

## Decisions

- [D-0307-1] **신규 단일 endpoint `/api/market/kimchi-premium`**, 기존 `/ctx` 확장 거절.
  - 거절 이유 (`/ctx` 확장): `/ctx`는 LLM 컨텍스트용, 빈도 다름. UI polling용은 별도 가벼운 endpoint.
- [D-0307-2] **30s server cache + 5min client polling**.
  - 거절 옵션 (websocket): real-time 가치 낮음 (premium은 분 단위). polling이 단순.
- [D-0307-3] **Dashboard + Terminal HUD 둘 다 마운트**, 단일 위치 거절.
  - 거절 이유 (Dashboard only): Observe 모드에서 차트 보면서 KP 확인 흐름이 자연스러움.

## Open Questions

- [ ] [Q-0307-1] migration 027 `kimchi_premium_pct` 컬럼이 실제로 데이터를 적재 중인가? (DB 검증 SQL 필요)
- [ ] [Q-0307-2] engine compute가 Upbit/Bithumb 둘 다 사용하는지, 또는 Upbit only?
- [ ] [Q-0307-3] tier-gate 적용? (Free에도 표시 — D1 lock-in 측면 자유 노출 권장)

## Implementation Plan

1. **DB 검증** — Q-0307-1 답변 (migration 027 데이터 적재 확인)
2. **engine endpoint** — `GET /api/market/kimchi-premium` 신규 또는 `/ctx` 응답 확인
   - response: `{ premium_pct: number, source: 'upbit', usd_krw: number, ts: ISO8601 }`
3. **app api wrapper** — `app/src/lib/api/market.ts`
4. **KimchiPremiumBadge.svelte** — 색상 분기 + tooltip + 5min refresh
5. **마운트** — Dashboard + DecisionHUD (선택, W-0306과 병합 가능)
6. **테스트**:
   - vitest: 색상 분기 (양수 빨강, 음수 파랑)
   - vitest: stale data 표시 (ts > 5min ago)
   - pytest: endpoint cache 30s 검증
7. PR 머지 + CURRENT.md SHA 업데이트

## Exit Criteria

- [ ] **AC1**: `/dashboard` 접근 시 kimchi_premium_pct 배지 표시 (P95 latency ≤ 500ms)
- [ ] **AC2**: 5분 후 자동 새로고침 → 갱신된 값 반영 (vitest fake timer)
- [ ] **AC3**: 양수/음수 색상 한국 표준 적용 (양수 #FF3B30 류 빨강, 음수 #007AFF 류 파랑)
- [ ] **AC4**: tooltip "Upbit BTC vs Binance BTC × USD/KRW" hover 시 표시
- [ ] **AC5**: API 장애 시 stale data + ⚠️ 표시, UI crash X
- [ ] CI green (pytest + vitest)
- [ ] PR merged + CURRENT.md SHA 업데이트

## Facts

(grep 실측 결과 — 2026-04-29)
1. `engine/api/routes/ctx.py:7` — `L8 kimchi : Korean exchange premium (USD/KRW + Upbit/Bithumb prices)` 주석
2. migration 027에 kimchi_premium_pct 컬럼 (사용자 컨텍스트, 미실측 → Q-0307-1)
3. UI에서 kimchi_premium_pct 표시 0건 (gap 확인)
4. `app/src/lib/components/` 아래 market/ 디렉토리 미존재 (신규 생성 필요)

## Assumptions

- engine kimchi compute가 정상 작동 (실데이터 검증 필요 — Q-0307-1)
- USD/KRW 환율 source 안정 (네이버/한국은행 또는 외부 API)
- 한국 색상 표준 (빨강=상승)을 글로벌 사용자도 이해 가능 (또는 향후 i18n)
- engine endpoint 응답 형식은 단순 JSON (websocket 불필요)

## Canonical Files

- 코드 truth: `engine/api/routes/market.py` (또는 ctx.py)
- UI: `app/src/lib/components/market/KimchiPremiumBadge.svelte`
- 도메인 doc: `docs/domains/market-context.md` (있는 경우 갱신)

## Next Steps

1. Q-0307-1 DB 검증 SQL 실행 (사용자 또는 운영자)
2. engine endpoint 구현 (단순)
3. UI 마운트 (W-0306과 병합 가능)

## Handoff Checklist

- [ ] migration 027 데이터 검증 결과 첨부
- [ ] Upbit API 호출 빈도 모니터링 (rate limit)
- [ ] 한국어 tooltip 텍스트 (i18n key 사용)
- [ ] stale data UI 처리 검증
