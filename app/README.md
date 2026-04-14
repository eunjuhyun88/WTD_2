# WTD Unified

> Single source of truth: this `README.md` is the canonical collaboration and project guide for all humans and agents.
> Mandatory gate: every task must log start/end in `docs/AGENT_WATCH_LOG.md` and pass `npm run check` + `npm run build` before push/merge.

AI 에이전트 기반 트레이딩 시뮬레이션 웹앱입니다.  
SvelteKit + TypeScript 기반으로 `Arena`, `Terminal (War Room/Intel)`, `Signals`, `Passport` 경험을 제공합니다.

## 0) Agent Collaboration Protocol (SSOT)

아래 규칙은 모든 에이전트/기여자 공통 강제 규칙입니다.

1. 매 작업(매 요청) 시작 시, 이 `README.md`를 다시 읽는다.
2. 코드/문서 수정 전에 `docs/AGENT_WATCH_LOG.md`에 시작 기록을 남긴다.
3. 작업 브랜치에서 `npm run check`와 `npm run build`를 모두 통과시킨다.
4. 둘 중 하나라도 실패하면 push/merge를 중단하고 먼저 에러를 수정한다.
5. push/merge 후에도 `docs/AGENT_WATCH_LOG.md`에 완료 기록(검증 결과, commit hash, merge hash, push 상태)을 남긴다.
6. `main` 머지 후 `main`에서 다시 `npm run check` + `npm run build`를 실행한다.
7. 한 요청(한 작업 단위)은 **하나의 atomic commit**으로 마감한다.  
   해당 요청에서 바뀐 코드/문서와 `docs/AGENT_WATCH_LOG.md` 기록을 같은 커밋에 포함한다.
8. 작업 종료 직전에 `git status --short --branch`를 실행해 워킹트리가 clean인지 확인하고, 결과를 로그에 남긴다.
9. `main` 머지/검증(`npm run check`, `npm run build`)은 **clean 상태의 main worktree**에서만 수행한다.  
   main worktree가 dirty면 기존 변경을 임의로 reset/revert하지 말고, 별도 clean worktree를 만들어 같은 절차를 수행한다.
9. push 전 워킹트리에 요청과 무관한 변경이 남아 있으면 먼저 정리한다.
   필요 시 `git stash push -u -m "wip/<task>"`로 백업 후 push하고, 이후 `git stash pop`으로 복원한다.
10. 모든 구현 작업은 반드시 설계안을 먼저 작성하고, 설계 검토/승인을 받은 뒤에만 실제 구현을 시작한다.
11. 매 작업 시작 메시지에서 현재 브랜치 위치를 먼저 보고한 뒤 작업을 시작한다.

참고:
- 에이전트 자동 실행 규칙 파일은 `AGENTS.md`다.
- 루트 아키텍처 맵은 `ARCHITECTURE.md`다.
- `docs/README.md`는 작업별 문서 라우팅용 컨텍스트 맵이다.

## 1) Overview

- 목적: 멀티 에이전트 시그널을 시각화하고, 배틀/카피트레이드 흐름으로 연결
- 핵심 경험
  - `Terminal`: 시장 인텔/에이전트 시그널 확인
  - `Arena`: phase 기반 배틀 루프
  - `Signals`: 시그널 탐색 및 추적
  - `Passport`: 유저/지갑/성과 프로필

## 1.1) Context Routing

긴 작업에서 문서를 많이 여는 것보다, 먼저 올바른 문서를 고르는 것이 더 중요합니다.

1. 협업/실행 규칙은 이 `README.md`와 `AGENTS.md`를 따른다.
2. 시스템 의도와 상위 구조는 `docs/SYSTEM_INTENT.md`와 `ARCHITECTURE.md`에서 먼저 잡는다.
3. 설계/스펙/리팩터 계획 탐색은 `docs/README.md`에서 시작한다.
4. canonical 얇은 진입점은 `docs/DESIGN.md`, `docs/FRONTEND.md`, `docs/PLANS.md`, `docs/PRODUCT_SENSE.md`, `docs/QUALITY_SCORE.md`, `docs/RELIABILITY.md`, `docs/SECURITY.md`다.
5. `docs/archive/`는 현재 정본이 아니라 과거 참조본이다.
6. `frontend` 외의 sibling clone 폴더는 레거시/비정본으로 간주하고, 새 작업을 중복 반영하지 않는다.

## 2) Tech Stack

- Svelte 5
- SvelteKit 2
- TypeScript
- Vite
- lightweight-charts

## 3) Quick Start

### Prerequisites

- Node.js 20+ (권장: 22 LTS)
- npm 10+

### Install

```bash
npm install
```

### Environment Variables

프로젝트 루트에 `.env` 생성:

```bash
COINALYZE_API_KEY=YOUR_KEY_HERE
```

참고:
- `COINALYZE_API_KEY`가 없으면 `/api/coinalyze`는 `500`을 반환합니다.
- `.env`는 커밋하지 않습니다.

### Run (Dev)

```bash
npm run dev
```

### Check / Build / Preview

```bash
npm run check
npm run build
npm run preview
```

## 4) NPM Scripts

- `npm run dev`: 개발 서버 실행
- `npm run docs:check`: 컨텍스트 문서 구조/핵심 진입점 검사
- `npm run check`: Svelte/TypeScript 정적 검사
- `npm run build`: 프로덕션 빌드
- `npm run preview`: 빌드 결과 로컬 프리뷰
- `npm run gate`: `docs:check + check + build` 통합 게이트
- `npm run safe:status`: 현재 브랜치/워크트리/변경 파일 점검
- `npm run safe:worktree -- <task-name> [base-branch]`: `codex/<task-name>` 브랜치 + 분리 워킹트리 생성
- `npm run safe:split -- <slice> --describe`: mixed WIP slice manifest, validation gate, mixed-file 목록 출력
- `npm run safe:split -- <slice> --create-worktree --stage`: target slice worktree 생성 후 whole-file carry 적용
- `npm run safe:hooks`: 로컬 pre-push/post-merge 훅 설치 (`.githooks/*`)
- `npm run safe:sync`: 브랜치 동기화 (`main`은 `pull --ff-only`, 작업 브랜치는 `origin/main` rebase + check)
- `npm run safe:sync:gate`: 동기화 후 `check + build`까지 실행
- `npm run ctx:save -- --title "<task>" --work-id "<W-ID>" --agent "<agent>"`: machine snapshot 저장
- `npm run ctx:checkpoint -- --work-id "<W-ID>" --surface "<surface>" --objective "<objective>"`: semantic working-memory checkpoint 저장
- `npm run contract:new -- --id "<task-id>" --surface "<surface>"`: active task contract scaffold 생성
- `npm run contract:check`: current branch task contract discipline 검사
- `npm run ctx:compact`: snapshot + checkpoint를 branch brief/handoff로 압축
- `npm run ctx:compact -- --docs-check pass --check pass --build pass --gate pass`: 검증 결과까지 포함해 brief/handoff 갱신
- `npm run ctx:check -- --strict`: local brief/handoff 품질 검사
- `npm run ctx:pin -- --add "<durable fact>"`: 리셋 시 유실되면 안 되는 고정 사실 저장
- `npm run ctx:restore -- --mode brief|handoff|files`: 복구(brief/handoff/파일 복구 의도 분리)
- `npm run ctx:auto -- <stage>`: 자동 저장/컴팩션 오케스트레이션 (hook/safe 스크립트에서 호출)
- `npm run eval:validate`: 실제 작업 기준 practical validation 보고서 생성
- `npm run memento:resume -- --agent <agent>`: 현재 브랜치 context + shared `.memento` agent memory를 한 번에 요약
- `npm run memento:relay -- --work-id "<W-ID>" --agent <agent> --summary "<text>"`: 현재 브랜치 handoff bundle을 shared `.memento` runtime inbox로 릴레이

### Solo Safety Routine (Recommended)

1. 한 번만 실행:
   ```bash
   npm run safe:hooks
   ```
2. 작업 시작 전:
   ```bash
   npm run safe:status
   npm run safe:worktree -- ui-refresh main
   ```
3. 작업 중 pull/merge 전후:
   ```bash
   npm run safe:sync
   ```
4. 작업 끝나기 전:
   ```bash
   npm run safe:sync:gate
   ```

참고:
- pre-push는 `ctx:auto(pre-push)` + `ctx:check -- --strict` + `npm run gate`를 자동 실행합니다.
- post-merge는 `npm run check` + `ctx:auto(post-merge)`를 자동 실행합니다.
- 긴급 상황에서만 `SKIP_PREPUSH=1 git push`로 일시 우회하세요.

### Zero-Command Context Mode (Default)

사용자가 매번 `현재를 저장`, `컴팩션`을 말하지 않아도 machine snapshot과 branch brief가 자동으로 갱신됩니다.
다만 semantic intent는 자동 추론하지 않으므로, 비사소한 작업은 직접 checkpoint를 남겨야 합니다.

- `npm run safe:status` 실행 시: `ctx:auto(safe-status)`
- `npm run safe:sync` 실행 시: `ctx:auto(safe-sync-start/end)`
- `git push` 시(pre-push): `ctx:auto(pre-push)`
- `git merge/pull` 후(post-merge): `ctx:auto(post-merge)`

자동화 제어 환경 변수:

- `CTX_AUTO_DISABLED=1`: 자동 저장/컴팩션 비활성화
- `CTX_AUTO_MIN_INTERVAL_SEC=300`: stage별 최소 실행 간격(스냅샷 과다 생성 방지)
- `CTX_AUTO_STRICT=1`: 자동화 실패 시 호출 명령도 실패 처리
- `CTX_AUTO_SKIP_COMPACT=1`: snapshot만 저장하고 brief/handoff 생성은 건너뜀

### Model Setup (Recommended)

현재 권장 운영:

- `gpt5.2 xhigh`: TL 역할 (planning, review, orchestration)
- `gpt-5.3-codex xhigh`: 실행 역할 (implementation, integration, fixing)

이 분리는 의사결정 품질과 실행 속도를 동시에 높이는 기본값입니다.

### Context Memory Routine (Token/Cost Control)

긴 대화/작업에서 토큰 비용과 컨텍스트 오염을 줄이기 위한 표준 루틴입니다. 핵심은 `snapshot`과 `semantic checkpoint`를 분리하는 것입니다.

1. 작업 시작 직후(초기 상태 저장):
   ```bash
   npm run ctx:save -- --title "task start" --work-id "W-YYYYMMDD-HHMM-<repo>-<agent>" --agent "codex"
   ```
2. semantic working-memory checkpoint 기록:
   ```bash
   npm run ctx:checkpoint -- \
     --work-id "W-YYYYMMDD-HHMM-<repo>-<agent>" \
     --surface "cross-cutting" \
     --objective "implement second-generation context workflow" \
     --doc "README.md" \
     --doc "docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md" \
     --next "update scripts/dev/context-*.sh"
   ```
3. 비사소한 작업은 task contract를 만든다:
   ```bash
   npm run contract:new -- --id "chart-container-race" --surface "arena"
   ```
3. 핵심 결정사항 고정:
   ```bash
   npm run ctx:pin -- --add "Do not merge without required write-access approval"
   ```
4. 핸드오프/푸시 직전 brief/handoff 생성:
   ```bash
   npm run ctx:save -- --title "pre-handoff" --work-id "W-..." --agent "codex"
   npm run ctx:compact
   ```
   검증 결과를 이미 알고 있으면:
   ```bash
   npm run ctx:compact -- --docs-check pass --check pass --build pass --gate pass
   ```
5. 리셋 후 복구:
   ```bash
   npm run ctx:restore -- --mode brief
   npm run ctx:restore -- --mode handoff
   ```
6. 모호한 `복구` 요청 방지:
   - 세션/대화 빠른 복구: `--mode brief`
7. shared `memento` 레이어와 연결:
   ```bash
   npm run memento:resume -- --agent implementer-ui
   npm run memento:relay -- --work-id "W-..." --agent implementer-ui --summary "slice handoff"
   ```
   - 자세한 인계 복구: `--mode handoff`
   - 파일 상태 복구: `--mode files`
   - `--mode context`는 기존 흐름 호환을 위한 alias이며 실제로는 `brief`를 의미
   - mode 없이 실행하면 실패하도록 설계되어 혼선 방지
7. 실제로 컨텍스트 시스템이 시간을 아끼는지 측정:
   ```bash
   npm run agent:start -- --agent planner --surface terminal --task-id "TASK-001"
   npm run agent:event -- --type doc_open --path docs/README.md
   npm run agent:event -- --type first_edit --path src/components/arena/ChartPanel.svelte
   npm run agent:finish -- --status success --baseline-minutes 20
   npm run agent:report
   npm run eval:validate
   ```

### Context Artifact Model

- `snapshot`: git/worktree/head 상태를 남기는 machine record
- `checkpoint`: objective, owned files, decisions, open questions, next actions를 남기는 semantic record
- `brief`: 다음 세션이 60초 안에 복귀하기 위한 짧은 요약
- `handoff`: 다른 에이전트나 다음 세션에 넘기는 정식 인계본
- `watch log`: evidence, not working memory

### Multi-Agent Parallel Routine (Conflict-Avoidance)

동시에 여러 스레드/에이전트가 작업할 때는 아래 절차를 기본값으로 사용합니다.

1. `main` 직접 개발 금지
   - 모든 구현은 `codex/<task-name>` 브랜치에서만 진행합니다.
   - `main`은 통합(merge) 전용 브랜치로 유지합니다.

2. 에이전트별 분리 워크트리 생성
   ```bash
   npm run safe:worktree -- pattern-engine main
   npm run safe:worktree -- chart-overlay main
   npm run safe:worktree -- api-pattern-feed main
   ```
   - 각 스레드는 서로 다른 worktree 경로를 사용합니다.
   - 같은 worktree에서 브랜치만 바꿔 병렬 작업하지 않습니다.
   - 이미 섞인 WIP 브랜치를 slice별로 분해할 때는:
     ```bash
     npm run safe:split -- context-validation-rollup --describe
     npm run safe:split -- context-validation-rollup --create-worktree --stage
     ```

3. 작업 시작 전 오너십(파일 범위) 고정
   - `docs/AGENT_WATCH_LOG.md` 시작 기록에 담당 파일/디렉터리를 명시합니다.
   - 대형 파일(예: `src/components/arena/ChartPanel.svelte`)은 한 시점에 한 에이전트만 수정합니다.
   - 공통 타입/계약 변경이 필요하면 해당 변경을 먼저 작은 커밋으로 분리합니다.

4. 각 브랜치 작업 루프
   ```bash
   npm run safe:status
   npm run safe:sync
   # code changes
   npm run gate
   git push -u origin codex/<task-name>
   ```
   - push 직전 `safe:sync`로 `origin/main` 기준 rebase 상태를 맞춥니다.
   - `gate` 실패 시 push/merge를 중단하고 먼저 수정합니다.

#### `main` vs `origin/main` 빠른 구분

- `origin`: 원격 저장소 별칭(대부분 GitHub 원본)
- `main`: 내 로컬 저장소의 로컬 브랜치
- `origin/main`: 원격 `origin`의 `main`을 추적하는 로컬 참조(원격 추적 브랜치)
- 표기 주의: `origin/main`은 브랜치 이름이 아니라 `원격/브랜치` 경로입니다.

상태 확인:

```bash
git status --short --branch
git fetch origin
git rev-list --left-right --count main...origin/main
```

해석(`main...origin/main` 결과):

- `0 0`: 로컬 `main`과 `origin/main` 완전 동일
- `1 0`: 로컬 `main`이 1커밋 앞섬(아직 push 안 됨)
- `0 1`: 로컬 `main`이 1커밋 뒤처짐(먼저 pull/fetch+rebase 필요)
- `N M` (`N>0` and `M>0`): 서로 갈라짐(diverged), 통합/충돌 해결 필요

안전 기본 동작:

```bash
# main에서 작업하지 않는 기본 원칙
git switch codex/<task-name>
git fetch origin
git rebase origin/main
npm run gate
git push -u origin codex/<task-name>
```

`main` 반영(Integrator만):

```bash
git switch main
git pull --ff-only
git merge --no-ff origin/codex/<task-name>
npm run gate
git push origin main
```

5. 통합은 Integrator 1인만 수행
   ```bash
   git switch main
   git pull --ff-only
   git merge --no-ff origin/codex/<task-1>
   npm run gate
   git merge --no-ff origin/codex/<task-2>
   npm run gate
   git push origin main
   ```
   - 머지는 한 번에 하나씩 순차 진행합니다.
   - 각 merge 직후 `gate`를 실행해 문제를 조기 차단합니다.

6. 충돌 발생 시 기준
   - 먼저 `git status --short --branch`와 충돌 파일 목록을 로그에 남깁니다.
   - 충돌 파일 오너가 우선 해결하고, Integrator가 최종 검증합니다.
   - 임의 덮어쓰기 대신 필요한 변경만 수동 병합합니다.

## 5) Project Structure

```txt
src/
  routes/
    +page.svelte                          # 홈
    arena/+page.svelte                    # Arena 메인
    terminal/+page.svelte                 # Terminal 메인
    signals/+page.svelte                  # Signal 룸
    passport/+page.svelte                 # 프로필/지갑
    settings/+page.svelte                 # 설정
    api/
      auth/                               # register/session/wallet
      coinalyze/                          # Coinalyze 프록시
      polymarket/                         # markets/orderbook 프록시
      matches/                            # 매치 기록 API

  components/
    arena/                                # Chart, Lobby, Squad, Match UI
    terminal/                             # WarRoom, Intel, BottomPanel
    modals/                               # Wallet/Settings/CopyTrade 등
    shared/                               # 공통 컴포넌트

  lib/
    api/                                  # binance/coinalyze/polymarket client
    stores/                               # app state (localStorage persisted)
    engine/                               # game loop/scoring/replay
    data/                                 # agents/tokens/warroom fixtures
```

## 6) Runtime Architecture

### Client

- 주요 상태는 Svelte store에서 관리됩니다.
- 다수 store가 localStorage에 debounce 저장합니다.
- 차트는 `lightweight-charts` + Binance WS 업데이트로 구동됩니다.

### Server (SvelteKit API Routes)

- 외부 API CORS 우회를 위해 프록시 라우트 사용
  - `/api/coinalyze`
  - `/api/polymarket/*`
- 주요 도메인 액션(트레이드/시그널/프로필/알림/커뮤니티)은 PostgreSQL API 라우트로 기록됩니다.

## 7) Data Flow (요약)

1. `WarRoom`/`ChartPanel`이 가격 데이터(Binance + proxy API)를 조회/구독
2. 유저 액션(트레이드/시그널/복제/알림/프로필)이 API 라우트로 저장
3. store는 UI 반응성과 오프라인 복원을 위해 localStorage를 캐시로 유지
4. 세션 기반 유저 컨텍스트로 DB 상태를 재조회해 화면을 복원

## 8) API Endpoints

### Auth

- `POST /api/auth/register`
  - body: `{ email, nickname, walletAddress?, walletSignature? }`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/auth/nonce`
  - body: `{ address, provider? }`
- `POST /api/auth/verify-wallet`
  - body: `{ address, message, signature, provider? }`
- `POST /api/auth/wallet`
  - body: `{ address, signature?, provider }`

### Matches

- `GET /api/matches?limit=50&offset=0&userId=...`
- `POST /api/matches`

### Quick Trades

- `GET /api/quick-trades?limit=50&offset=0&status=open`
- `POST /api/quick-trades/open`
- `POST /api/quick-trades/{id}/close`
- `PATCH /api/quick-trades/prices`

### Signals / Actions

- `GET /api/signals?limit=50&offset=0&status=tracking`
- `POST /api/signals/track`
- `POST /api/signals/{id}/convert`
- `DELETE /api/signals/{id}`
- `GET /api/signal-actions?limit=50&offset=0`
- `POST /api/signal-actions`

### Copy Trades

- `GET /api/copy-trades/runs?limit=50&offset=0`
- `GET /api/copy-trades/runs/{id}`
- `POST /api/copy-trades/publish`

### PnL / Predictions / Agents

- `GET /api/pnl?limit=50&offset=0`
- `POST /api/pnl`
- `GET /api/pnl/summary`
- `GET /api/predictions?limit=50&offset=0`
- `POST /api/predictions/vote`
- `POST /api/predictions/positions/open`
- `POST /api/predictions/positions/{id}/close`
- `GET /api/agents/stats`
- `PATCH /api/agents/stats/{agentId}`

### Profile / Preferences / UI State

- `GET /api/profile`
- `PATCH /api/profile`
- `GET /api/profile/passport`
- `GET /api/preferences`
- `PUT /api/preferences`
- `GET /api/ui-state`
- `PUT /api/ui-state`

### Community / Notifications / Activity / Chat

- `GET /api/community/posts?limit=50&offset=0`
- `POST /api/community/posts`
- `POST /api/community/posts/{id}/react`
- `DELETE /api/community/posts/{id}/react`
- `GET /api/notifications?limit=50&offset=0&unreadOnly=true`
- `POST /api/notifications/read`
- `DELETE /api/notifications/{id}`
- `GET /api/activity?limit=50&offset=0`
- `POST /api/activity/reaction`
- `GET /api/chat/messages?channel=terminal&limit=50&offset=0`
- `POST /api/chat/messages`

### External Proxy

- `GET /api/coinalyze?endpoint=<allowed>&...params`
- `GET /api/polymarket/markets?limit=20&category=crypto`
- `GET /api/polymarket/orderbook?token_id=...`

## 9) Configuration Notes

- timeframe 표기가 코드 전반에 `1h/4h`와 `1H/4H` 혼재되어 있습니다.
- 새 기능 추가 시 timeframe enum/mapper를 먼저 정규화하는 것을 권장합니다.

## 10) Known Issues (현재 기준)

- `auth_nonces` 마이그레이션(`003`) 미적용 환경에서는 wallet verify API가 실패합니다.
- store는 DB와 localStorage를 병행(dual-write/dual-read)하므로 완전 서버 단일화 전까지 동기화 이슈 여지가 있습니다.
- localStorage reset 시 일부 키 불일치 가능성
- 대형 컴포넌트(`ChartPanel`, `arena/+page`)에 책임이 집중되어 디버깅 난이도 상승

## 11) Refactoring Roadmap

1. Domain Type 정규화
   - timeframe/direction/tier 단일 타입 체계화
   - 변환 함수 중앙화
2. API Contract 강화
   - request/response 스키마 검증 도입
   - session 검증 강화
3. Persistence Layer 통합
   - localStorage adapter + key 상수화
   - 버전 마이그레이션 도입
4. Component Decomposition
   - ChartPanel 로직 분리 (`data/ws/indicator/drawing`)
   - arena page phase orchestration 분리
5. Test Baseline
   - timeframe mapping
   - session parsing
   - store reset/restore
   - indicator 계산 최소 케이스

## 12) Execution Tickets (Actionable)

아래 티켓은 바로 작업 가능한 최소 단위로 쪼갠 실행 계획입니다.

### Sprint 1 (Stabilize / P0)

- `T1-1` Timeframe 표준화
  - 대상 파일: `src/lib/stores/gameState.ts`, `src/lib/api/binance.ts`, `src/lib/api/coinalyze.ts`, `src/components/arena/SquadConfig.svelte`, `src/components/terminal/WarRoom.svelte`
  - 작업: `1h/4h` vs `1H/4H` 혼재 제거, 단일 타입 + 매핑 유틸 도입
  - 완료 기준: pair/timeframe 변경 시 Binance/Coinalyze 요청이 일관된 interval로 전송

- `T1-2` Session 검증 강화
  - 대상 파일: `src/routes/api/auth/session/+server.ts`, `src/routes/api/auth/register/+server.ts`
  - 작업: 쿠키 파싱 실패/비정상 포맷 방어, 최소 사용자 조회 검증 추가
  - 완료 기준: 임의 문자열 쿠키로 `authenticated: true`가 되지 않음

- `T1-3` Reset key 불일치 수정
  - 대상 파일: `src/routes/settings/+page.svelte`, `src/lib/stores/*.ts`
  - 작업: 실제 저장 키와 reset 로직 키 동기화
  - 완료 기준: Reset 실행 시 주요 store 데이터가 의도대로 초기화

### Sprint 2 (Persistence / P1)

- `T2-1` Storage Adapter 도입
  - 대상 파일: `src/lib/stores/` 하위 공통 유틸 신설
  - 작업: `load/save/remove` 공통 함수 + 에러 핸들링 통합
  - 완료 기준: store에서 localStorage 직접 접근 코드 감소

- `T2-2` Key 상수화 + 스키마 버전
  - 대상 파일: `src/lib/stores/` 전반
  - 작업: key 상수 모듈과 `schemaVersion` 마이그레이션 루틴 추가
  - 완료 기준: 구버전 데이터 로딩 시 안전하게 기본값/변환 적용

### Sprint 3-4 (Decompose / P2)

- `T3-1` ChartPanel 분리
  - 대상 파일: `src/components/arena/ChartPanel.svelte`, `src/lib/` 신규 모듈
  - 작업: `data(ws/fetch)`, `indicator`, `drawing`, `tv-mode` 책임 분리
  - 완료 기준: `ChartPanel.svelte` 라인 수/책임 축소, 기능 회귀 없음

- `T3-2` Arena Page 오케스트레이션 분리
  - 대상 파일: `src/routes/arena/+page.svelte`, `src/lib/engine/` 신규 모듈
  - 작업: phase 처리, replay, feed 업데이트 로직을 서비스 레이어로 이동
  - 완료 기준: UI 컴포넌트는 상태 바인딩/이벤트 위주로 단순화

### Sprint 5 (API Contract / P3)

- `T5-1` Request/Response 스키마 검증
  - 대상 파일: `src/routes/api/auth/*`, `src/routes/api/matches/+server.ts`, `src/routes/api/coinalyze/+server.ts`
  - 작업: 입력 파라미터 검증, 에러 응답 포맷 표준화
  - 완료 기준: 잘못된 요청에 대해 일관된 4xx 응답

- `T5-2` In-memory 의존도 축소 준비
  - 대상 파일: `src/routes/api/auth/register/+server.ts`, `src/routes/api/matches/+server.ts`
  - 작업: 저장소 인터페이스 추출(향후 DB 교체 가능 구조)
  - 완료 기준: 핸들러가 저장 구현체와 느슨하게 결합

### Sprint 6 (Tests / P4)

- `T6-1` 핵심 단위 테스트
  - 대상 파일: `src/lib/api/*`, `src/lib/stores/*`, `src/routes/api/*` 관련 테스트
  - 작업: timeframe mapping/session parsing/storage migration 테스트 추가
  - 완료 기준: 회귀가 잦은 구간에 자동 검증 확보

- `T6-2` 계산 로직 테스트
  - 대상 파일: indicator/scoring 관련 모듈
  - 작업: 지표 계산값 최소 fixture 기반 테스트
  - 완료 기준: 계산 변경 시 테스트로 영향 감지 가능

## 13) Definition of Done (Refactor)

- `npm run check` 통과
- 주요 화면(`home/terminal/arena/signals/passport`) 진입 회귀 없음
- timeframe/pair 전환 시 데이터 fetch 오류 없음
- reset 동작과 persistence 동작이 문서화된 키와 일치
- API 에러 응답 형태가 문서와 일치

## 14) Troubleshooting

### `Missing API key` (Coinalyze)

- `.env`에 `COINALYZE_API_KEY`를 설정했는지 확인
- dev 서버 재시작 후 재확인

### 차트가 OFFLINE으로 표시됨

- 네트워크 연결 확인
- Binance API/WS 접근 가능 여부 확인
- 브라우저 콘솔에서 `/api/coinalyze` 또는 Binance fetch 에러 확인

### 데이터가 초기화됨

- 현재 일부 API 데이터는 in-memory 저장
- 서버 재시작 시 유실될 수 있음

## 15) Security

- API 키는 반드시 `.env`로만 관리
- 키가 노출되었으면 즉시 폐기(rotate) 후 교체
- 프로덕션에서는 인증/세션/매치 저장소를 영속 DB로 이전 필요

## 16) Contribution Guide (Internal)

- 변경 전 `npm run check` 통과 기준으로 작업
- store key 추가/변경 시 reset/migration 경로 함께 업데이트
- 외부 API 추가 시 프록시 라우트 + 에러 매핑 + 캐시 정책 명시

## 17) License

Private project.

## 18) Performance Change Log

### 2026-02-23 (Deployment latency fix)

- 변경 파일: `src/hooks.server.ts`
- 변경 내용: 앱 레벨 수동 gzip(`gzipSync` + `response.arrayBuffer()`) 제거
- 이유: 모든 응답을 서버에서 동기 압축하면 CPU 사용량/TTFB가 증가하고 스트리밍 이점이 사라짐
- 운영 정책: 압축은 앱 코드가 아닌 CDN/리버스 프록시에서 처리 (`br`/`gzip`)

검증 방법:

```bash
curl -I -H 'Accept-Encoding: br,gzip' https://<your-domain>/
```

- `Content-Encoding: br` 또는 `Content-Encoding: gzip` 헤더가 보이면 정상

### 2026-02-23 — Server Performance Hardening (`9ddc4b3`)

- 서버 모듈 캐싱 5건 추가 (yahoo/feargreed/defillama/coingecko/marketFeed)
- persistSnapshots N+1 → 배치 INSERT (24쿼리 → 2쿼리)
- battleInterval 메모리 누수 수정 (onDestroy cleanup)
- walletStore localStorage 디바운스 300ms
- quickTradeStore 즉시 hydration 제거 → terminal onMount
- 터미널 3초 폴링 최적화 (가격 해시 비교)

상세 변경 파일: `docs/AGENT_WATCH_LOG.md` → W-20260223-002 참조
