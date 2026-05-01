# W-0363 — 월렛 로그인 UX + GTM 전면 개선

> Wave: 4 | Priority: P1 | Effort: L
> Charter: In-Scope (사용자 온보딩 마찰 제거)
> Status: 🟡 Design Draft
> Issue: #807
> Created: 2026-05-01

## Goal

WalletModal을 EIP-6963 자동감지 + Base Smart Wallet(passkey) 부각 + WalletConnect 정상화 3축으로 재설계하여 land→signup 4% → 10%+ 달성. 동시에 dead code 제거, ESC/focus trap, 성공 toast, GTM funnel 풀-커버리지로 베타 코호트 텔레메트리 베이스라인 확보.

## Background

**GTM funnel 현황**: `land→signup 4%` — 이후 단계(`signup→capture 55%`)에 비해 압도적으로 낮음. 드랍 추정 원인:
1. 5개 하드코딩 지갑 중 사용자 설치 지갑 미포함 → 이탈
2. WalletConnect 버튼 → dev 에러 문자열 노출 → 신뢰 하락
3. 서명 성공 후 침묵 close → "됐나?" 불확실 → 재시도 이탈
4. Base Smart Wallet(passkey 지원)이 목록 맨 아래에 묻혀 있음

**코드 실측 (WalletModal.svelte 1,075줄)**:
- `connected`/`signup`/`login` step → wallet-first auth로 인해 도달 불가 dead code
- `setAuthMode()` 호출처 없음 → authMode 항상 `signup` 고정
- `.wh-left` flex:1 누락 → 닫기 버튼 우측 정렬 불안정 (desktop)
- ESC 핸들러·focus trap·autocomplete 없음

**설치된 패키지 실측**:
```
@base-org/account ^2.5.3      ← Base Smart Wallet (passkey-based) ✅
@coinbase/wallet-sdk ^4.3.7   ← Coinbase Wallet
@metamask/sdk ^0.34.0
@phantom/browser-sdk ^2.0.0
@walletconnect/ethereum-provider ^2.23.6
```
- `@privy-io/*` 미설치. `@dogeos/dogeos-sdk`는 vendor.d.ts CDN stub (실제 미설치).
- Privy 백엔드(`POST /api/auth/privy`) 완전 구현되어 있으나 클라이언트 SDK 없음 → 별도 W에서 활성화.
- **Base Smart Wallet = passkey 로그인의 실체** (EIP-4337 smart account, WebAuthn 기반, seed phrase 없음)

## Scope

### In-Scope
1. **EIP-6963 wallet discovery** — `detectInjectedProviders()` 구현, 설치된 지갑 자동 목록화
2. **Base Smart Wallet 상단 배치** — "패스키 · 계정 생성 불필요" 설명 배지로 passkey 진입점 명시
3. **WalletConnect projectId 미설정 시 옵션 숨김** (에러 문자열 노출 차단)
4. **dead steps 제거** — `connected`/`signup`/`login` 분기 삭제 (~200줄)
5. **이모지 → SVG 교체** — 각 프로바이더 공식 색상 기하 SVG (inline)
6. **성공 toast** — `notificationStore.addSystemToast()` + `SystemToastStack.svelte` 신규
7. **ESC 닫기 + focus trap** — `<svelte:window on:keydown>`, 첫 요소 focus on mount, Tab cycle
8. **헤더 레이아웃 fix** — `.wh-left { flex: 1 }`
9. **카피 개선** — hero-sub, placeholder dev 문구 제거
10. **GTM 이벤트 확장** — passkey/EIP-6963 경로 포함 7종 신규

### Files

**신규**
- `app/src/lib/wallet/eip6963.ts` — `detectInjectedProviders()` 헬퍼
- `app/src/components/shared/SystemToastStack.svelte` — auth/system toast 전용

**수정**
- `app/src/components/modals/WalletModal.svelte` — 전면 재설계
- `app/src/lib/wallet/providers.ts` — EIP-6963 통합, WC 가드
- `app/src/lib/stores/notificationStore.ts` — `addSystemToast()` 추가
- `app/src/routes/+layout.svelte` — `<SystemToastStack />` 마운트

### API
변경 없음. `POST /api/auth/wallet-auth` + `POST /api/auth/privy` 기존 그대로.

### npm 패키지
추가 없음. 기존 설치 패키지만 활용.

## Non-Goals
- **Privy SDK 클라이언트 활성화**: 백엔드는 완성됐으나 SDK 미설치. 별도 W-0364 후보.
- **이메일 OTP / 소셜 로그인**: 별도 wave.
- **공통 Modal primitive 추출**: WalletModal에만 ESC/focus trap. 다른 모달은 별도 W.
- **2-column Hoppin 스타일 레이아웃**: WTD 페르소나(Jin) = 지갑 보유자, 설명 패널 불필요.
- **다중 체인 선택 UI**: Base 단일 유지.
- **Settings 페이지 nickname edit**: toast "Settings →" 링크만 추가.

## 아키텍처 — Modal 재설계

### Before
```
[//WALLET AUTH] [CONNECT WALLET]                    [X]  ← 닫기 버튼 위치 불안정
[1 CONNECT] [2 SIGN] [3 ACCOUNT]

🦊 MetaMask          EVM
🔵 WalletConnect     SETUP REQUIRED ← dev 에러 노출
🔷 Coinbase Wallet   EVM
🔵 Base Smart Wallet BASE            ← 이모지 중복
👻 Phantom           EVM

           ↓ sign-message ↓
    walletAuth 성공/실패 양쪽 closeModal() (침묵)
    [dead] connected / signup / login steps
```

### After
```
[//WALLET AUTH] [CONNECT WALLET]              [X]  ← 우측 고정
[1 CONNECT] [2 SIGN]

── passkey ──────────────────────────
[⬡ Base Smart Wallet   패스키 · 시드 없음]   ← 최상단, 배지 강조
─────────────────────────────────────
[● MetaMask            Detected     ]   ← EIP-6963 자동감지
[● Rabby               Detected     ]
[◈ Coinbase Wallet                  ]   ← 항상 표시
[⊙ Phantom                          ]
[≋ WalletConnect                    ]   ← projectId 있을 때만

           ↓ sign-message ↓
    성공: closeModal + addSystemToast("Connected as {nickname}")
    실패: 모달 유지 + inline error + retry
```

## CTO 관점

### EIP-6963 구현

```ts
// eip6963.ts
export interface DetectedWallet {
  rdns: string;   // 'io.metamask', 'io.rabby', etc.
  name: string;
  icon: string;   // data: URL
  provider: EIP1193Provider;
}

export function detectInjectedWallets(timeoutMs = 300): Promise<DetectedWallet[]> {
  return new Promise((resolve) => {
    const found: DetectedWallet[] = [];
    const handler = (e: Event) => {
      const { info, provider } = (e as CustomEvent).detail;
      if (!found.find(f => f.rdns === info.rdns)) {
        found.push({ rdns: info.rdns, name: info.name, icon: info.icon, provider });
      }
    };
    window.addEventListener('eip6963:announceProvider', handler as EventListener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handler as EventListener);
      resolve(found);
    }, timeoutMs);
  });
}
```

WalletModal `onMount`에서 호출 → reactive list. fallback: 감지 0 + `window.ethereum` 존재 시 "Browser Wallet" 단일 항목.

### WalletConnect 정상화

```ts
// providers.ts 추가
export function isWalletConnectAvailable(): boolean {
  const id = PUBLIC_ENV.PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';
  return !isPlaceholderWalletConnectProjectId(id);
}
```

WalletModal: `{#if isWalletConnectAvailable()}` 조건부 렌더.

### SystemToast

```ts
// notificationStore.ts 추가
export interface SystemToast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
  action?: { label: string; href: string };
  durationMs?: number;
}
export const systemToasts = writable<SystemToast[]>([]);
export function addSystemToast(t: Omit<SystemToast, 'id'>) { ... }
```

기존 `ToastStack`(패턴 알림 전용, score 필드 결합)과 별도 유지. `SystemToastStack.svelte`는 우상단 4초 auto-dismiss.

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| EIP-6963 미지원 구버전 지갑 | 중 | 저 | `window.ethereum` fallback |
| dead step 제거 후 실제 사용 중이었음 | 낮음 | 중 | grep `step === 'connected'` 호출처 0 확인 후 삭제 |
| WalletConnect QR z-index 충돌 | 저 | 중 | z-index 200 이상으로 고정 |
| EIP-6963 응답 0 + no window.ethereum (모바일 Safari) | 중 | 중 | WalletConnect primary, Base Smart Wallet 항상 표시 |
| Base Smart Wallet popup 없는 브라우저 | 저 | 저 | `@base-org/account` feature detect → 없으면 숨김 |

### Dependencies / Rollback
- 백엔드 API 변경 없음, DB 스키마 변경 없음
- Rollback: `git revert` 1커밋으로 완전 복구
- `eip6963.ts`·`SystemToastStack.svelte`는 isolated → 별도 revert 가능

## AI Researcher 관점

### GTM Funnel Impact

| 가설 | 예상 효과 | 측정 방법 |
|---|---|---|
| H1: EIP-6963으로 "내 지갑" 바로 보임 | modal→connect 전환 60% → 80% | `wallet_connect_attempt` / `modal_open` |
| H2: 성공 toast → 확신 제공 | 7일 재방문 +5~10pp | auth_success → D+7 재접속 |
| H3: Base Smart Wallet 패스키 부각 | 무지갑 신규 유저 캡처 | `auth_method=base_smart` 비율 |
| H4: 침묵 close 제거 | `abandoned` rate 감소 | `modal_dismiss` 이벤트 |

**목표**: 배포 후 14일 `land→signup ≥ 10%` (4% → 10% = +150%)

### GTM 이벤트 신규

| event | 신규 properties |
|---|---|
| `wallet_modal_open` | `trigger: 'header'|'cta'|'gated'` |
| `eip6963_detected` ← NEW | `count: number, rdns_list: string[]` |
| `auth_method_select` ← NEW | `method: 'base_smart'|'eip6963'|'coinbase'|'walletconnect'|'phantom'` |
| `wallet_connect_attempt` | `method, rdns?` |
| `auth_sign_failed` ← NEW | `error_code: 'rejected'|'timeout'|'network'` |
| `auth_success` | `method, is_new_user: boolean` ← NEW |
| `modal_dismiss` | `stage, reason: 'esc'|'overlay'|'x_button'` ← NEW |

## Decisions

### [D-1] WalletConnect — 항상 표시 (env 설정 완료)
`PUBLIC_WALLETCONNECT_PROJECT_ID=af0c49471ce93fc0242c8bc88e366c26` (app: cogotchi) 설정됨.
로컬 `.env` + Vercel Development 환경 모두 추가. 조건부 숨김 로직 불필요.

### [D-2] 성공 피드백 → SystemToast ✅
거절(모달 내 success 화면): dead connected step 부활. 1.5초 강제 대기 = 마찰.

### [D-3] dead steps 완전 삭제 ✅
거절(유지): 도달 불가 코드는 검증 불가 → fallback 신뢰 보장 안 됨. 필요 시 별도 명시 설계로 부활.

### [D-4] passkey = Base Smart Wallet ✅
Privy SDK 별도 설치 없이 기존 `@base-org/account`로 passkey 커버. Privy 클라이언트 활성화는 W-0364로 분리.
거절(Privy SDK 이번에 설치): scope 팽창 + CDN stub → 실제 SDK 교체 작업 추가. backend는 이미 됐으니 frontend는 다음 W에서.

### [D-5] Modal 레이아웃 → single-column ✅
거절(Hoppin 2-column): WTD 페르소나는 지갑 보유자. 설명 패널 land→signup 기여 가설 약함. 모바일 분기 코드 0.

### [D-6] 지갑 목록 구성
`[Base Smart Wallet 항상] + [EIP-6963 detected] + [Coinbase 항상] + [WalletConnect if projectId]`
Coinbase: EIP-6963 announce 시 dedupe (rdns=`com.coinbase.wallet` 감지되면 static 숨김).

### [D-7] notificationStore → SystemToast 별도 ✅
기존 Toast schema(`score` 필드)와 완전 분리. ToastStack 책임 비대 방지.

## Open Questions
- [ ] [Q-1] `is_new_user` GTM용 — `POST /api/auth/wallet-auth` 응답에 `is_new_user: boolean` 소규모 추가 여부 (현재 `action: 'login'|'register'`로 대체 가능, 클라이언트에서 파싱)
- [ ] [Q-2] Privy 클라이언트 활성화 타임라인 — W-0364로 분리 확정 시 CURRENT.md에 등록

## Implementation Plan

### Step 1 — Foundation (0.5d)
- `eip6963.ts` 작성 + vitest unit test (mock CustomEvent)
- `notificationStore.addSystemToast()` + `SystemToastStack.svelte` + layout 마운트

### Step 2 — WalletModal 재설계 (1d)
- dead steps 삭제 (connected/signup/login)
- EIP-6963 detected list + Base Smart Wallet 상단 고정
- WalletConnect 가드 (`isWalletConnectAvailable()`)
- 이모지 → inline SVG (6종)
- 성공: `addSystemToast` + close / 실패: 모달 유지 + retry
- `.wh-left { flex: 1 }` 헤더 fix
- 카피 개선 (hero-sub, placeholder)

### Step 3 — 접근성 + 텔레메트리 (0.5d)
- `<svelte:window on:keydown>` ESC 핸들러
- focus trap (onMount 첫 버튼 focus, Tab cycle 내부 한정)
- GTM 이벤트 7종 추가

### Step 4 — QA (0.5d)
- vitest: eip6963 × 4, SystemToast × 3, WalletModal smoke × 5
- 수동 E2E 3 시나리오 (신규 유저 / 서명 거부 / WC 미설정)
- svelte-check 0 errors

## Exit Criteria

### 기능
- [ ] AC1: EIP-6963 detected 지갑 자동 목록화 (설치 지갑 ≥ 1개 환경에서 DOM 확인)
- [ ] AC2: Base Smart Wallet 목록 최상단 + 패스키 배지 노출
- [ ] AC3: `PUBLIC_WALLETCONNECT_PROJECT_ID` 미설정 시 WalletConnect 옵션 DOM 미존재
- [ ] AC4: `connected`/`signup`/`login` step 코드 0줄 (`grep -E "step === '(connected|signup|login)'"` empty)
- [ ] AC5: 이모지 0개 (`grep -P '[\x{1F300}-\x{1FAFF}]' WalletModal.svelte` empty)
- [ ] AC6: ESC → modal close + GTM `modal_dismiss { reason: 'esc' }` fire
- [ ] AC7: focus trap — modal 외부로 Tab 이탈 없음
- [ ] AC8: 성공 후 SystemToast `"Connected as {nickname}"` 표시

### Telemetry
- [ ] AC9: GTM dataLayer에 신규 7종 이벤트 fire (DevTools 확인)
- [ ] AC10: `auth_success` payload에 `method` + `is_new_user` 포함

### KPI (배포 후 14일 관찰 — blocker 아님)
- [ ] AC11: land→signup ≥ 10% (현재 4%)
- [ ] AC12: `auth_error` rate < 3%

### 코드 품질
- [ ] AC13: svelte-check 0 errors / 0 warnings
- [ ] AC14: vitest 신규 12건 PASS
- [ ] AC15: WalletModal.svelte ≤ 850줄 (현재 1,075줄)
- [ ] AC16: CI green
