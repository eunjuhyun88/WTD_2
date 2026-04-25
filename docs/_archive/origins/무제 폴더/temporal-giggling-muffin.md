# COGOCHI IA 재설계 & 유저 저니 정비 계획

## Context

COGOCHI는 크립토 AI 에이전트 다마고치 게임. 현재 20개 라우트 중 **실제 콘텐츠가 있는 페이지는 9개뿐**이고 나머지 11개는 클라이언트 `goto()` 리다이렉트 껍데기. 네비게이션이 게임 루프를 반영하지 않으며 각 페이지의 책임이 불명확. 핵심 플로우 **Create → Train → Prove → Grow**가 코드에는 있지만 UI에서는 느껴지지 않음.

---

## 0. 현재 상태 (팩트 기반)

### 실제 콘텐츠가 있는 페이지 (9개)

| 라우트 | 파일 | 실제 콘텐츠 |
|--------|------|------------|
| `/` | `+page.svelte` (713줄) | Home — 저니 상태, Hero, Starter Roster 피커, CTA |
| `/create` | `+page.svelte` | 2-step 위자드 — 리드 선택 + 성장 경로 |
| `/terminal` | `+page.svelte` | TradingView 차트 + WarRoom + Intel 3패널 |
| `/arena` | `+page.svelte` | 5페이즈 배틀 — 로비, 4개 뷰, 결과 |
| `/agent` | `+page.svelte` | Agent HQ — Overview/Train/Record 3탭 |
| `/signals` | `+page.svelte` | 시그널 피드 — Community/SignalList/Oracle 3탭 |
| `/signals/[postId]` | `+page.svelte` | 개별 시그널 상세 |
| `/creator/[userId]` | `+page.svelte` | 크리에이터 프로필 |
| `/settings` | `+page.svelte` | 설정 (timeframe, SFX, language 등) |

### 리다이렉트 껍데기 (11개) — 자체 콘텐츠 없음

| 라우트 | 리다이렉트 방식 | 목적지 |
|--------|----------------|--------|
| `/world` | 클라이언트 `goto('/terminal')` | `/terminal` |
| `/agents` | 클라이언트 `goto('/agent')` | `/agent` |
| `/lab` | 클라이언트 `goto('/agent?tab=train')` | `/agent?tab=train` |
| `/passport` | 클라이언트 `goto('/agent?tab=record')` | `/agent?tab=record` |
| `/holdings` | 클라이언트 `goto('/agent?tab=record')` | `/agent?tab=record` (체인: holdings→passport 거쳐감) |
| `/oracle` | 클라이언트 `goto('/signals?view=oracle')` | `/signals?view=oracle` |
| `/arena-v2` | **이중**: 서버 307 + 클라이언트 `goto('/arena')` | `/arena` |
| `/arena-war` | 클라이언트 `goto('/arena')` | `/arena` |
| `/live` | 서버 307 `redirect(307, '/signals')` | `/signals` |
| (미래) `/signals` | — | → `/community`로 이름 변경 예정 |
| (미래) `/signals/[postId]` | — | → `/community/[postId]`로 이름 변경 예정 |

### 현재 네비게이션 구조

**Desktop header:** `MISSION | AGENT | MARKET`
- MISSION → `/create` (activePatterns: `/create`, `/terminal`, `/arena` 3개를 하나로 묶음)
- AGENT → `/agent`
- MARKET → `/signals` (activePatterns: `/signals`, `/market`, `/oracle`, `/creator`)

**Mobile bottom:** `HOME | MISSION | AGENT | MARKET`
- HOME → `/`

**문제:**
- MISSION이 create+terminal+arena를 하나로 묶어서 사용자가 어디에 있는지 모름
- "Market"이라는 이름이 시그널/커뮤니티 성격과 안 맞음
- `/create`와 `/terminal`이 같은 탭 아래 있어서 훈련 vs 생성 구분 불가

### 현재 deepLinks.ts 빌더 함수

```
buildDeepLink(path, params, hash)     ← 범용
buildTerminalLink(params)              ← /terminal
buildCreateLink(params)                ← /create
buildWorldLink(params)                 ← /world (제거 대상)
buildAgentLink(params)                 ← /agent
buildTerminalCopyTradeLink(params)     ← /terminal?copyTrade=1&...
buildSignalsLink(view)                 ← /signals
buildMarketLink(view)                  ← /signals (alias)
buildBattleLink(params)                ← /arena
buildLabLink(params)                   ← /agent?tab=train
buildPassportLink(tab)                 ← /agent?tab=train|record
buildArenaLink(mode)                   ← /arena?mode=...
```

---

## 1. 라우트 정리 (현재 → 목표)

### 목표: 정규 라우트 8개

| 라우트 | 역할 (한 문장) | 네비 표시 |
|--------|---------------|----------|
| `/` | 저니 대시보드 — "지금 어디야, 다음은 뭐야" | Mobile: HOME |
| `/create` | 에이전트 생성 위자드 | TRAIN 하위 (미생성 시) |
| `/terminal` | 훈련장 — 차트, 스캔, 인텔 | TRAIN |
| `/arena` | 증명 배틀 — 5페이즈 매치 | PROVE |
| `/agent` | Agent HQ — 개요/훈련/기록 3탭 | GROW |
| `/community` | 시그널 피드 + 오라클 리더보드 | COMMUNITY |
| `/community/[postId]` | 개별 시그널 상세 | (COMMUNITY 하위) |
| `/creator/[userId]` | 크리에이터 프로필 | (링크로만 접근) |

### 제거 대상: 리다이렉트 껍데기 → 서버 301로 교체 후 파일 삭제

모든 클라이언트 `goto()` 리다이렉트를 `src/hooks.server.ts`의 서버 301로 교체.
이유: 클라이언트 리다이렉트는 JS 로드 후 실행되어 느리고, SEO에 안 좋고, 빈 페이지 플래시 발생.

```ts
// src/hooks.server.ts에 추가
const PERMANENT_REDIRECTS: Record<string, string> = {
  '/world': '/terminal',
  '/agents': '/agent',
  '/lab': '/agent?tab=train',
  '/passport': '/agent?tab=record',
  '/holdings': '/agent?tab=record',
  '/oracle': '/community?view=oracle',
  '/arena-v2': '/arena',
  '/arena-war': '/arena',
  '/live': '/community',
};
// prefix match: /signals/* → /community/*
```

삭제할 디렉토리 (11개):
```
src/routes/world/        ← goto('/terminal')
src/routes/agents/       ← goto('/agent')
src/routes/lab/          ← goto('/agent?tab=train')
src/routes/passport/     ← goto('/agent?tab=record')
src/routes/holdings/     ← goto('/agent?tab=record')
src/routes/oracle/       ← goto('/signals?view=oracle')
src/routes/arena-v2/     ← 서버 307 + goto('/arena')
src/routes/arena-war/    ← goto('/arena')
src/routes/live/         ← 서버 307 → /signals
src/routes/settings/     ← 모달로 전환
```

이름 변경:
```
src/routes/signals/          → src/routes/community/
src/routes/signals/[postId]/ → src/routes/community/[postId]/
```

### deepLinks.ts 변경

| 함수 | 변경 |
|------|------|
| `buildWorldLink` | **삭제** |
| `buildSignalsLink` | → `buildCommunityLink` 이름 변경, path `/community`로 |
| `buildMarketLink` | → `buildCommunityLink`의 alias로 유지 |
| `buildLabLink` | 유지 (내부적으로 `/agent?tab=train` 생성) |
| `buildPassportLink` | 유지 (내부적으로 `/agent?tab=record` 생성) |
| 나머지 | 유지 |

---

## 2. 네비게이션 재설계

### 새 구조

**Desktop header:**
```
[Cogochi logo → /]   TRAIN   PROVE   GROW   COMMUNITY   [wallet]
```

**Mobile bottom nav:**
```
HOME(⌂)    TRAIN(~)    PROVE(⚔)    GROW(@)
```
(COMMUNITY는 Desktop에서만 탭. Mobile에서는 GROW 내 링크로 접근)

### appSurfaces.ts 새 정의

```ts
type AppSurfaceId = 'home' | 'train' | 'prove' | 'grow' | 'community';

// train의 href는 동적: journeyState === 'no-agent' ? '/create' : '/terminal'
```

| ID | label | shortLabel | icon | href | activePatterns |
|----|-------|------------|------|------|----------------|
| home | Home | HOME | ⌂ | `/` | `['/']` |
| train | Train | TRAIN | ~ | `/terminal` (동적) | `['/terminal', '/create']` |
| prove | Prove | PROVE | ⚔ | `/arena` | `['/arena']` |
| grow | Grow | GROW | @ | `/agent` | `['/agent']` |
| community | Community | COMM | # | `/community` | `['/community', '/creator']` |

```ts
DESKTOP_NAV_SURFACES = [train, prove, grow, community]
MOBILE_NAV_SURFACES = [home, train, prove, grow]
HOME_SURFACES = [train, prove, grow]
```

### TRAIN 탭 동적 href 로직
- `journeyState === 'no-agent'` → `/create`
- 그 외 → `/terminal`
- Header/MobileBottomNav에서 `agentJourneyStore`를 구독하여 href 동적 결정

### 수정 파일
- `src/lib/navigation/appSurfaces.ts` — surface 재정의 (SSOT)
- `src/components/layout/Header.svelte` — 탭 렌더링 + TRAIN 동적 href
- `src/components/layout/MobileBottomNav.svelte` — 탭 렌더링 + TRAIN 동적 href
- `src/routes/+layout.svelte` — isFixedViewportRoute, isLightHeader 조건 업데이트

---

## 3. 페이지별 책임 재정의

### Home `/` — "지금 어디야, 다음은 뭐야"

| 요소 | 현재 상태 | 조치 |
|------|----------|------|
| 저니 4-state 표시 | ✅ 있음 (line 87-103) | 유지 |
| 다음 액션 CTA | ✅ 있음 (line 118-131) | 유지 |
| Hero copy (타이틀, 설명) | ✅ 있음 | 유지 |
| LP/티어/승률 카드 | ❌ 없음 | **추가** — active 상태에서 표시 |
| **Starter Roster 피커** | ⚠️ 있음 (line 134-177, companion-bay) | **→ /create로 이동** |
| **가격 티커 (live-line)** | ⚠️ 있음 (line 111-115) | **제거** (Header에 이미 있음) |

**조치 상세:**
- `companion-bay` 전체 섹션 (roster-grid, pinned-row, bay-visual) → `/create` Step 0으로 이동
- `live-line`의 `gs.pair`, `selectedPriceText`, `starterCount/3 pinned` → 제거
- active 상태에서 LP, 티어 뱃지, 승률, 최근 매치 결과 카드 추가

### Create `/create` — "에이전트 만들기"

| 요소 | 현재 상태 | 조치 |
|------|----------|------|
| Step 1: 리드 선택 + 이름 | ✅ 있음 | 유지 |
| Step 2: 성장 경로 | ✅ 있음 | 유지 |
| **Starter Roster 피커** | ❌ Home에 있음 | **← Home에서 가져옴** (Step 1 전 or Step 1 통합) |
| Model Source (Advanced) | ✅ 있음 (접힘) | 유지, 용어 단순화 |
| Doctrine/Temperament (Advanced) | ✅ 있음 (접힘) | 유지, 용어 단순화 |
| 완료 → Terminal CTA | ✅ 있음 | 유지 |
| 미리보기 카드 | ✅ 있음 (AgentDNAPreview) | 유지 |

### Terminal `/terminal` — "에이전트 훈련"

| 요소 | 현재 상태 | 조치 |
|------|----------|------|
| ChartPanel (캔들차트) | ✅ 있음 | 유지 |
| WarRoom (좌측 시그널) | ✅ 있음 | 유지 |
| IntelPanel (우측 뉴스/챗) | ✅ 있음 | 유지 |
| MissionFlowShell (상단 배너) | ✅ 있음 | 유지 |
| TokenDropdown (페어 선택) | ✅ 있음 | 유지 |
| **에이전트 이름/성격 표시** | ❌ 없음 | **추가** — 상단 배너에 에이전트 컨텍스트 |
| **Readiness 진행도** | ⚠️ 배너에 텍스트만 | **강화** — 3-step 프로그레스 바 |
| **StrategyVariantWorkbench** | ⚠️ 있음 (여기 있으면 안 됨) | **→ /agent?tab=train으로 이동** |
| **훈련 완료 → Arena CTA** | ⚠️ 약함 | **강화** — readiness 3/3 시 토스트 + 배너 |

### Arena `/arena` — "에이전트 증명"

| 요소 | 현재 상태 | 조치 |
|------|----------|------|
| 로비 (Quick Start, 모드 선택) | ✅ 있음 | 유지 |
| Phase Guide 모달 | ✅ 있음 (첫 방문) | 유지 |
| 5페이즈 매치 시스템 | ✅ 있음 | 유지 |
| SquadConfig | ✅ 있음 | 유지 |
| HypothesisPanel | ✅ 있음 | 유지 |
| **ViewPicker 4개 뷰** | ⚠️ 과다 (Chart War/Mission Control/Agent Arena/Card Duel) | **→ 2개로 축소** (Chart War + Agent Arena) |
| **결과 → Agent HQ CTA** | ❌ 없음 | **추가** |
| **결과 → Play Again CTA** | ❌ 없음 | **추가** |
| MatchHistory | ✅ 있음 | 유지 |

**삭제 대상 컴포넌트:**
- `src/components/arena/views/MissionControlView.svelte`
- `src/components/arena/views/CardDuelView.svelte`

### Agent HQ `/agent` — "에이전트 성장 & 관리"

| 요소 | 현재 상태 | 조치 |
|------|----------|------|
| Overview 탭 (크루, 스탯, 미션) | ✅ 있음 | 유지 |
| Train 탭 (Readiness, 전략) | ✅ 있음 | 유지 |
| Record 탭 (증명 기록) | ✅ 있음 | 유지 |
| **StrategyVariantWorkbench** | Terminal에 있음 | **← Terminal에서 이동** (Train 탭에 배치) |
| **Community 바로가기** | ❌ 없음 | **추가** — Overview에 "View Community" 링크 |
| **"Enter Arena" CTA** | ⚠️ 약함 | **강화** — Overview에서 prominently 표시 |

### Community `/community` (현재 `/signals`) — "소셜 시그널 & 리더보드"

| 요소 | 현재 상태 | 조치 |
|------|----------|------|
| 시그널 피드 | ✅ 있음 | 유지 |
| Oracle 리더보드 | ✅ 있음 (탭) | 유지 |
| **3중 네비게이션** | ⚠️ pills(War Room/Community/CopyTrade) + tabs(Community/SignalList/Oracle) + filters(All/Crypto/Arena/Trade/Tracked) | **→ 2탭(Feed/Oracle) + 인라인 필터 1줄** |
| **War Room 탭** | ⚠️ `/terminal`로 리다이렉트됨 | **제거** (War Room은 Terminal의 일부) |
| **CopyTrade 탭** | ⚠️ 별도 탭 | **→ Feed 안의 시그널 카드에서 직접 액션** |
| **라이브 사이드바** | ⚠️ 가격+아레나세션+피드 3개 | **축소** — 가격만 유지, 나머지 제거 |

---

## 4. 유저 저니 & Soft Gates

### 4-State Journey Machine (이미 `src/routes/+page.svelte:31-36`에 존재)

```ts
const journeyState = $derived(
  !journey.minted ? 'no-agent'      // 에이전트 없음
  : !journey.terminalReady ? 'training'   // 훈련 중
  : records.length === 0 ? 'arena-ready'  // 아레나 준비됨
  : 'active'                              // 활성 (1매치 이상)
);
```

### Soft Gate 매트릭스

| 페이지 | no-agent | training | arena-ready | active |
|--------|----------|----------|-------------|--------|
| **Home** | "Start Mission" CTA → /create | "Resume Training" CTA → /terminal | "Enter Arena" CTA → /arena | Full dashboard (LP, tier, WR) |
| **Terminal** | 🔒 배너: "Create agent first" (탐색만 가능, scan 비활성) | ✅ 풀 기능 | ✅ 풀 기능 | ✅ 풀 기능 |
| **Arena** | 🔒 배너: "Create & train first" (관전만) | 🔒 배너: "Complete training (X/3)" | ✅ 풀 기능 | ✅ 풀 기능 |
| **Agent HQ** | 🔒 배너: "Create agent first" → /create | ✅ 풀 기능 | 💡 배너: "Run your first Arena match" | ✅ 풀 기능 |
| **Community** | ✅ 항상 접근 | ✅ 항상 접근 | ✅ 항상 접근 | ✅ 항상 접근 |

- 🔒 = Soft lock: 배너 표시 + 핵심 액션 비활성. 스크롤/탐색은 가능.
- 💡 = 가이드: 배너로 다음 단계 제안. 기능 제한 없음.

### 구현
- `ContextBanner.svelte` (이미 존재) 확장 — `gateLevel: 'blocked' | 'guided' | 'open'` prop
- 각 페이지에서 `journeyState` 기반으로 배너 조건부 렌더링
- `agentJourneyStore`는 이미 모든 페이지에서 import 가능

### 플로우 다이어그램

```
[첫 방문] → HOME (/)
  │ "Start Mission" CTA
  ↓
[에이전트 생성] → CREATE (/create)
  │ Step 0: Roster 피커 (Home에서 이동해옴)
  │ Step 1: 리드 선택 + 이름
  │ Step 2: 성장 경로 + (Advanced: 모델, 독트린)
  │ → journeyState: no-agent → training
  ↓
[훈련] → TERMINAL (/terminal)
  │ 차트 분석, 패턴 스캔, 시그널 탐색
  │ Readiness: Model ✓ → Doctrine ✓ → Validation ✓
  │ → journeyState: training → arena-ready
  │ 🔔 토스트: "Arena Unlocked! Time to prove your agent."
  ↓
[증명] → ARENA (/arena)
  │ Draft → Analysis → Hypothesis → Battle → Result
  │ → journeyState: arena-ready → active
  │ CTA: "Review in Agent HQ" / "Play Again"
  ↓
[성장] → AGENT HQ (/agent)
  │ Record: 증명 확인, 승률 확인
  │ Train: 전략 조정, Workbench
  │ Overview: 다음 미션 제안
  │ CTA: "Enter Arena" (루프 반복)
  ↓
[핵심 루프] → ARENA ↔ AGENT HQ (반복)
  ↕
[소셜] → COMMUNITY (/community)
  │ 시그널 탐색, 트래킹, 복사 거래
  │ Oracle 리더보드
  │ (어느 단계에서든 접근 가능)
```

---

## 5. 실행 단계 (6 Phases)

### Phase 1: 라우트 정리 (저위험, 파일 삭제 중심)

**변경:**
- `src/hooks.server.ts` — `PERMANENT_REDIRECTS` map 추가 (서버 301)
- `src/routes/signals/` → `src/routes/community/`로 mv (디렉토리 이름 변경)
- `src/routes/signals/[postId]/` → `src/routes/community/[postId]/`로 mv

**삭제 (10개 디렉토리):**
```
rm -rf src/routes/world/
rm -rf src/routes/agents/
rm -rf src/routes/lab/
rm -rf src/routes/passport/
rm -rf src/routes/holdings/
rm -rf src/routes/oracle/
rm -rf src/routes/arena-v2/
rm -rf src/routes/arena-war/
rm -rf src/routes/live/
rm -rf src/routes/settings/   ← Phase 6에서 모달 전환 후
```

**수정:**
- `src/lib/utils/deepLinks.ts` — `buildWorldLink` 삭제, `buildCommunityLink` 추가, `buildSignalsLink` path 변경
- `src/lib/navigation/appSurfaces.ts` — import에서 `buildWorldLink` 제거

**모든 `goto()` 및 deepLink 호출 업데이트:**
- grep으로 `/signals`, `/world`, `/oracle` 등 하드코딩된 경로 찾아서 새 경로로

### Phase 2: 네비게이션 재구조 (중위험)

**수정 파일 4개:**
- `src/lib/navigation/appSurfaces.ts` — 새 surface 정의 (위 섹션 2 참조)
- `src/components/layout/Header.svelte` — DESKTOP_NAV_SURFACES 렌더링, TRAIN 동적 href
- `src/components/layout/MobileBottomNav.svelte` — MOBILE_NAV_SURFACES 렌더링, TRAIN 동적 href
- `src/routes/+layout.svelte` — `isFixedViewportRoute`, `isLightHeader` 조건 업데이트

### Phase 3: 페이지 책임 이동 (중위험, 각 페이지 독립)

1. **Home → Create: Starter Roster 이동**
   - `src/routes/+page.svelte`에서 `companion-bay` 섹션 제거 (line 134-177 + 관련 CSS)
   - `src/routes/create/+page.svelte`에 Roster 피커 통합 (Step 1에 합치기 or Step 0)
   - Home에 active 상태 대시보드 카드 (LP, tier, WR) 추가

2. **Terminal → Agent HQ: StrategyVariantWorkbench 이동**
   - `src/routes/terminal/+page.svelte`에서 Workbench import/렌더링 제거
   - `src/routes/agent/+page.svelte` Train 탭에서 이미 사용 중인지 확인 → 없으면 추가

3. **Arena: 4뷰 → 2뷰 축소**
   - `src/routes/arena/+page.svelte`의 ViewPicker에서 MissionControl, CardDuel 옵션 제거
   - 컴포넌트 파일은 Phase 6에서 삭제

4. **Community: 3중 네비 → 2탭 + 필터**
   - `src/routes/community/+page.svelte`에서 War Room/CopyTrade 탭 제거
   - signalsView를 `'feed' | 'oracle'`로 단순화
   - SIGNAL_FILTERS + COMMUNITY_FILTERS 두 배열을 하나로 합침

### Phase 4: Soft Gates 적용 (저위험)

**수정 파일 ~4개:**
- `src/components/shared/ContextBanner.svelte` — `gateLevel` prop 확장
- `src/routes/terminal/+page.svelte` — no-agent 배너 추가
- `src/routes/arena/+page.svelte` — no-agent/training 배너 추가
- `src/routes/agent/+page.svelte` — no-agent/arena-ready 배너 추가

### Phase 5: 플로우 연결 강화 (저위험)

**수정 파일 ~3개:**
- `src/routes/arena/+page.svelte` — RESULT 페이즈에 "Review in Agent HQ" + "Play Again" CTA 추가
- `src/routes/terminal/+page.svelte` — readiness 3/3 달성 시 "Arena Unlocked" 토스트
- `src/routes/agent/+page.svelte` — Overview에 "Enter Arena" CTA 강화, Community 링크 추가

### Phase 6: 정리 (저위험)

- Settings 모달 전환: `src/routes/settings/` 삭제, Header에서 SettingsModal 트리거
- 미사용 컴포넌트 삭제:
  - `src/components/arena/views/MissionControlView.svelte`
  - `src/components/arena/views/CardDuelView.svelte`
- appSurfaces.ts에서 제거된 surface (world, mission, create, battle, market) 타입/상수 정리

---

## 6. 핵심 수정 파일 목록 (총 ~15개 수정, ~12개 삭제)

| 파일 | Phase | 변경 내용 |
|------|-------|----------|
| `src/hooks.server.ts` | 1 | PERMANENT_REDIRECTS map + prefix match |
| `src/lib/utils/deepLinks.ts` | 1 | buildWorldLink 삭제, buildCommunityLink 추가 |
| `src/lib/navigation/appSurfaces.ts` | 2 | surface 재정의 (5개: home/train/prove/grow/community) |
| `src/components/layout/Header.svelte` | 2 | 새 탭 + TRAIN 동적 href |
| `src/components/layout/MobileBottomNav.svelte` | 2 | 새 탭 + TRAIN 동적 href |
| `src/routes/+layout.svelte` | 2 | 라우트 조건 업데이트 |
| `src/routes/+page.svelte` | 3 | Roster 제거, active 대시보드 추가 |
| `src/routes/create/+page.svelte` | 3 | Roster 통합 |
| `src/routes/terminal/+page.svelte` | 3,4,5 | Workbench 제거, 게이트 배너, Arena Unlocked 토스트 |
| `src/routes/arena/+page.svelte` | 3,4,5 | 2뷰 축소, 게이트 배너, 결과 CTA |
| `src/routes/agent/+page.svelte` | 3,4,5 | Workbench 통합, 게이트 배너, CTA 강화 |
| `src/routes/community/+page.svelte` | 1,3 | signals→community 이름변경, 2탭+필터 단순화 |
| `src/components/shared/ContextBanner.svelte` | 4 | gateLevel prop 확장 |

---

## 7. 검증 방법

1. `npm run dev` 실행
2. **리다이렉트 검증:** `/world`, `/agents`, `/lab`, `/passport`, `/holdings`, `/oracle`, `/arena-v2`, `/arena-war`, `/live`, `/signals` 접속 → 각각 올바른 목적지로 301
3. **정규 라우트 검증:** 8개 정규 라우트 직접 접속 → 렌더링 확인
4. **네비 검증:** Desktop/Mobile에서 각 탭 클릭 → 올바른 페이지 이동, active 하이라이트 정상
5. **TRAIN 동적 href:** 에이전트 미생성 → `/create`, 생성 후 → `/terminal`
6. **Soft gates:** journeyState 4가지 상태별로 Terminal/Arena/AgentHQ 배너 확인
7. **플로우:** Create → Terminal → Arena → Agent HQ 전체 사이클 수동 테스트
8. **빌드:** `npm run build` 에러 없이 완료
