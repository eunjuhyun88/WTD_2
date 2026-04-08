# STOCKCLAW 구조 정합성 액션 플랜

작성일: 2026-02-22
근거: `docs/references/active/structure-mismatch-audit-latest.md` 9개 불일치 항목
목표: v3 스펙(8-Agent/5-Phase/Spec/LP)과 실행 코드의 완전 정렬

---

## 실행 원칙

1. **파괴 최소화**: 기존 UI 렌더링을 유지하면서 점진적 치환
2. **하위 호환 어댑터**: 구형 → 신형 매핑 레이어를 두고 단계적 제거
3. **빌드 무중단**: 매 Step 완료 후 `vite build` + `svelte-check` 통과 확인

---

## Step 1: Agent 도메인 통합 (P0-1)

### 문제
- `src/lib/data/agents.ts` → 구형 7 Agent (AGDEFS: AgentDef[])
- `src/lib/engine/agents.ts` → 신형 8 Agent (AGENT_POOL: Record<AgentId, AgentDefinition>)
- UI 3곳이 AGDEFS 직접 참조: arena, terminal, oracle

### 액션

**1-1. 호환 어댑터 생성** `src/lib/data/agents.ts` 수정

```
// 기존 AGDEFS를 engine/agents.ts 기준으로 재생성
import { AGENT_POOL, getAllAgents } from '$lib/engine/agents';
import type { AgentDefinition } from '$lib/engine/types';

// 구형 AgentDef 인터페이스는 유지 (하위 호환)
export interface AgentDef { ... }

// AGDEFS를 engine 데이터에서 파생
export const AGDEFS: AgentDef[] = getAllAgents().map(toAgentDef);

function toAgentDef(a: AgentDefinition): AgentDef {
  return {
    id: a.id.toLowerCase(),
    name: a.name,
    nameKR: a.nameKR,
    icon: a.icon,
    color: a.color,
    role: a.descriptionKR,
    // ... 나머지 필드 기본값 매핑
  };
}
```

- CHARACTER_ART, SOURCES는 그대로 유지 (UI 전용 데이터)
- 구형 guardian/commander/scanner → 매핑 없음 (자연 제거)

**1-2. UI import 경로는 변경 없음**
- `import { AGDEFS } from '$lib/data/agents'` → 동일하게 동작
- 내부 데이터만 engine 기준으로 바뀜

**1-3. 점진적 직접 참조 전환** (후속)
- arena/+page.svelte → `AGENT_POOL` 직접 사용
- oracle/+page.svelte → `AGENT_POOL` 직접 사용
- WarRoom.svelte → `AGENT_POOL` 직접 사용

### 영향 파일
- `src/lib/data/agents.ts` — 재작성
- `src/routes/arena/+page.svelte` — import 유지, 후속 전환
- `src/routes/oracle/+page.svelte` — import 유지, 후속 전환
- `src/components/terminal/WarRoom.svelte` — import 유지, 후속 전환
- `src/components/arena/Lobby.svelte` — import 유지, 후속 전환

### 완료 기준
- [ ] AGDEFS가 8개 에이전트 반환
- [ ] 기존 UI 렌더링 정상 (빌드 통과)
- [ ] `engine/agents.ts`가 Single Source of Truth

---

## Step 2: Phase 모델 통합 (P0-2)

### 문제
- `types.ts` → 5 Phase (DRAFT/ANALYSIS/HYPOTHESIS/BATTLE/RESULT)
- `gameState.ts` → 11+ Phase (idle/config/scouting/voting/guardian/... )
- `phases.ts` → 11 Phase 정의 + 타이머
- Arena UI → 11 Phase 조건 분기

### 액션

**2-1. Phase 매핑 레이어** `src/lib/engine/phaseAdapter.ts` 신규

```ts
import type { MatchPhase } from './types';
import type { Phase } from '$lib/stores/gameState';

// 구형 11 Phase → 신형 5 Phase 매핑
export function toMatchPhase(oldPhase: Phase): MatchPhase {
  const map: Record<Phase, MatchPhase> = {
    idle: 'DRAFT', config: 'DRAFT', selecting: 'DRAFT',
    scouting: 'ANALYSIS', voting: 'ANALYSIS',
    guardian: 'HYPOTHESIS',
    consensus: 'BATTLE', revealing: 'BATTLE',
    result: 'RESULT', cooldown: 'RESULT', reviewing: 'RESULT',
  };
  return map[oldPhase] ?? 'DRAFT';
}

// 신형 5 Phase → 구형 Phase 초기값 (역매핑)
export function toOldPhase(matchPhase: MatchPhase): Phase { ... }
```

**2-2. Arena UI에서 어댑터 사용**
- 기존: `{#if state.phase === 'scouting'}`
- 변경: `{#if matchPhase === 'ANALYSIS'}`
- `$: matchPhase = toMatchPhase(state.phase)`

**2-3. 후속**: gameState.ts 자체를 5-Phase로 리팩터 (Step 1 안정화 후)

### 영향 파일
- `src/lib/engine/phaseAdapter.ts` — 신규
- `src/routes/arena/+page.svelte` — matchPhase 반응형 추가
- `src/lib/stores/gameState.ts` — 후속 리팩터
- `src/lib/engine/phases.ts` — 후속 리팩터

### 완료 기준
- [ ] Arena가 5-Phase 기준으로 렌더링
- [ ] 기존 타이머/진행 로직 정상 동작

---

## Step 3: Spec 해금 + Progression 연결 (P0-3 + P1-3)

### 문제
- `specs.ts` 존재하지만 런타임에서 import 0건
- walletStore.phase (max 4) ≠ userProfileStore.tier ≠ 스펙 P0~P5+Master
- 에이전트 경험치가 agentData에서 별도 관리

### 액션

**3-1. 단일 진행 스토어** `src/lib/stores/progressionStore.ts` 신규

```ts
// Single Source of Truth for user progression
// - LP (from constants.ts LP_REWARDS)
// - Tier (from constants.ts TIER_TABLE)
// - Agent match counts → Spec unlock
// - 6 Passport metrics

import { writable, derived } from 'svelte/store';
import { getTierForLP } from '$lib/engine/constants';
import { getUnlockedSpecs } from '$lib/engine/specs';
import type { AgentId, Tier, Passport } from '$lib/engine/types';

interface ProgressionState {
  lp: number;
  agentMatchCounts: Record<AgentId, number>;
  passport: Passport;
}
```

**3-2. Draft UI에 Spec 선택 연결**
- Arena Draft 화면에서 에이전트 선택 시 → 해금된 Spec 표시
- `getUnlockedSpecs(agentId, matchCount)` 호출

**3-3. walletStore/userProfileStore/agentData의 진행값을 progressionStore로 위임**
- walletStore.phase → `derived(() => getTierForLP(lp))`
- userProfileStore.tier → progressionStore에서 파생
- agentData.level/xp → agentMatchCounts 기반 재계산

### 영향 파일
- `src/lib/stores/progressionStore.ts` — 신규
- `src/lib/stores/walletStore.ts` — phase 로직 위임
- `src/lib/stores/userProfileStore.ts` — tier 로직 위임
- `src/lib/stores/agentData.ts` — level/xp 로직 위임
- `src/routes/arena/+page.svelte` — Draft UI에 Spec 선택 추가

### 완료 기준
- [ ] LP → Tier 계산이 constants.ts TIER_TABLE 기준
- [ ] Spec 해금이 실제 Draft에 반영
- [ ] 화면마다 다른 티어/레벨 표시 없음

---

## Step 4: API 계약 정렬 (P0-4)

### 문제
- 스펙: `/api/arena/match/*`, `/api/live/sessions/*`
- 실제: `/api/matches`, `/api/agents/stats`, `/api/profile/passport`

### 액션

**4-1. 신규 API Route Scaffold**

```
src/routes/api/arena/
  match/
    create/+server.ts       → POST
    [id]/
      draft/+server.ts      → POST
      hypothesis/+server.ts → POST
      result/+server.ts     → GET

src/routes/api/live/
  sessions/+server.ts       → GET/POST
  sessions/[id]/+server.ts  → GET
```

**4-2. 기존 API는 어댑터 또는 redirect**
- `/api/matches` → 내부적으로 `/api/arena/match` 호출
- `/api/agents/stats` → progressionStore 데이터 반환

**4-3. 후속**: 기존 route 점진적 deprecated 처리

### 영향 파일
- `src/routes/api/arena/**` — 신규 다수
- `src/routes/api/live/**` — 신규
- `src/routes/api/matches/+server.ts` — 어댑터 추가

### 완료 기준
- [ ] FlowSpec v2.0 기준 핵심 5개 엔드포인트 동작
- [ ] 기존 /api/matches 호출 시 하위 호환

---

## Step 5: 가격 파이프라인 단일화 (P1-2)

### 문제
- Header: miniTicker WebSocket
- ChartPanel: klines WS + miniTicker WS
- Terminal: 주기적 interval sync
- 3곳이 각각 gameState.prices 갱신 → 경합

### 액션

**5-1. 중앙 가격 서비스** `src/lib/services/priceService.ts` 신규

```ts
// Single ingest point: one miniTicker WS connection
// Fan-out to all subscribers via Svelte store
import { writable } from 'svelte/store';

export const livePrice = writable<Record<string, number>>({});

let ws: WebSocket | null = null;

export function startPriceStream(symbols: string[]) {
  // 단일 WS 연결, livePrice store 갱신
  // Header, ChartPanel, Terminal 모두 이 store 구독
}

export function stopPriceStream() { ... }
```

**5-2. 기존 갱신 로직 제거**
- Header.svelte: 자체 WS 연결 제거 → priceService 구독
- ChartPanel.svelte: miniTicker 연결 제거 → priceService 구독 (klines WS는 차트 전용으로 유지)
- terminal/+page.svelte: interval sync 제거 → priceService 구독

### 영향 파일
- `src/lib/services/priceService.ts` — 신규
- `src/components/layout/Header.svelte` — WS 로직 제거
- `src/components/arena/ChartPanel.svelte` — miniTicker 제거
- `src/routes/terminal/+page.svelte` — interval 제거

### 완료 기준
- [ ] 앱 전역에서 WS 연결 1개만 존재
- [ ] 헤더/차트/터미널 가격 완전 동일

---

## Step 6: 스캔/분석 책임 재배치 (P1-1)

### 문제
- WarRoom.svelte (1478줄)에서 캔들 조회→지표 계산→점수 합성→신호 생성 수행
- 테스트 불가, 서버 비용 절감 기회 상실

### 액션

**6-1. 분석 서비스 분리** `src/lib/services/scanService.ts` 신규

```ts
// WarRoom에서 추출한 스캔 로직
export async function runScan(pair: string, timeframe: string): Promise<ScanResult> {
  const candles = await fetchCandles(pair, timeframe, 240);
  const indicators = computeIndicators(candles);
  const derivatives = await fetchDerivatives(pair);
  const signals = scoreAgents(indicators, derivatives);
  return { signals, indicators, derivatives };
}
```

**6-2. 지표 계산 분리** `src/lib/engine/indicators.ts` 신규
- RSI, SMA, ATR, OBV, MACD, CVD 등 순수 함수

**6-3. WarRoom은 UI 렌더링만 담당**
- `runScan()` 호출 → 결과 표시
- 상태 관리/이벤트 디스패치만 남김

### 영향 파일
- `src/lib/services/scanService.ts` — 신규
- `src/lib/engine/indicators.ts` — 신규
- `src/components/terminal/WarRoom.svelte` — 대폭 축소

### 완료 기준
- [ ] WarRoom.svelte 800줄 이하
- [ ] scanService 단독 테스트 가능

---

## Step 7: Terminal IA + Mock 데이터 정리 (P2-1 + P2-2)

### 문제
- 모바일 4탭 vs 코드 3탭
- 패널 폭/접힘 상태 미영속
- warroom.ts 정적 데이터 잔존

### 액션

**7-1. 모바일 탭 확정**
- 4탭(Chart/WarRoom/Intel/Position) vs 3탭 — 유저와 확인 후 결정
- 결정 후 `terminal/+page.svelte` 수정

**7-2. 패널 상태 영속화**
```ts
// localStorage에 패널 폭/접힘 저장
const PANEL_STATE_KEY = 'stockclaw.terminal.panels.v1';
interface PanelState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}
```

**7-3. Mock 데이터 점진적 교체**
- `warroom.ts` AGENT_SIGNALS → scanService 결과로 대체
- HEADLINES → API 또는 LunarCrush 연동
- COMMUNITY → communityStore 실데이터

### 영향 파일
- `src/routes/terminal/+page.svelte` — 탭/영속화
- `src/lib/data/warroom.ts` — mock 축소
- `src/components/terminal/IntelPanel.svelte` — 실데이터 연결

### 완료 기준
- [x] 패널 폭 새로고침 후 복원 — cogochi + terminal-legacy 모두 서버 영속화 연결 완료
- [x] mock 데이터 → "No data" empty state 또는 실데이터 — warroom.ts 타입만 남음, IntelPanel 라이브 데이터 연결 완료

### 완료 노트 (2026-04-08)
- **7-1 모바일 탭**: 새 `/terminal`은 chat UI로 탭 불필요. legacy는 3탭(warroom/chart/intel) 유지.
- **7-2 패널 영속화**: `fetchUiStateApi` / `updateUiStateApi` 연결 — 리사이즈 완료 시 600ms 디바운스 저장, onMount 시 복원.
  - `cogochi/+page.svelte`: leftWidth, rightWidth 영속화
  - `terminal-legacy/+page.svelte`: leftW, rightW, leftCollapsed, rightCollapsed 영속화
- **7-3 Mock 정리**: warroom.ts에 mock 데이터 이미 제거됨 (타입 + getConsensus만 유지). IntelPanel은 라이브 API 사용 중.

---

## 실행 순서 총정리

```
Step 1 (Agent 통합)      ← 모든 것의 기반. 먼저.
  ↓
Step 2 (Phase 통합)      ← Arena 동작의 핵심
  ↓
Step 3 (Spec/Progression) ← 성장 시스템 연결
  ↓
Step 4 (API 계약)        ← Step 2, 3과 병렬 가능
  ↓
Step 5 (가격 단일화)      ← 독립적, 언제든 가능
  ↓
Step 6 (스캔 분리)       ← Step 1 이후
  ↓
Step 7 (IA + Mock)       ← 마지막 정리
```

**크리티컬 패스**: Step 1 → Step 2 → Step 3
**병렬 가능**: Step 4, Step 5 (Step 1 완료 후 독립 진행)

---

## 리스크

| 리스크 | 완화 |
|--------|------|
| AGDEFS 제거 시 UI 깨짐 | 어댑터 패턴으로 점진적 치환 |
| Phase 전환 시 타이머 오동작 | 어댑터 레이어 + 기존 phases.ts 보존 |
| Spec 연결 시 기존 레벨업 UX 변경 | progressionStore가 기존 값도 파생 |
| API 변경 시 클라이언트 호출 깨짐 | 기존 route에 redirect/adapter 유지 |
