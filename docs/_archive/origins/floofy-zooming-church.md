# WTD v2 — 마스터 제품 설계서

> **버전**: 3.1 | **날짜**: 2026-04-22
> **기준선**: 2026-04-08 이후 UI 설계 문서 + 현재 진행 중인 work items
> **목적**: 지금 실행 중인 것 → 다음 2주 → 카피트레이딩까지 단일 진실 소스

---

## [완료] Work 디렉토리 정리

```
work/wip/      5개  — W-0120, W-0122, W-0124, W-0125-perf, W-0126
work/active/   2개  — W-0121, W-0125-vercel (백로그)
work/completed/ 175개 — 레거시 전체
```

---

## [운영 규칙] AGENTS.md 최신 구조 (2026-04-22 갱신)

> 단일 진실 소스: `AGENTS.md`. 아래는 핵심 운영 규칙 요약.

### Task Intake Contract (브랜치/편집 전 필수)

새 task를 시작하기 전에 work item 파일에 다음을 먼저 고정:

| 필드 | 설명 |
|------|------|
| **Owner** | `app` / `engine` / `contract` / `research` 중 하나 |
| **Primary Change Type** | product-surface / engine-logic / contract / research |
| **Goal** | 1~2문장, 완료 기준 명시 |
| **Canonical Files** | 실제로 바꿀 파일 경로 |
| **Verification Target** | 검증 명령 or 체크 방법 |

**핵심 원칙**: "애매한 요청을 바로 넓게 읽지 말고, 먼저 파일에 좁은 실행 단위로 고정하라"

### Stop / Split Rules

- 작업 중 범위가 변경되면 → work item을 업데이트하고 사용자 확인 후 재개
- 2개 이상의 Primary Change Type이 섞이면 → 별도 work item으로 분리
- 불명확한 Non-Goals → 명시적으로 기록하고 진행

### Work Item 필수 섹션

```markdown
## Owner
## Primary Change Type
## Goal
## Scope
## Non-Goals
## Verification Target
## Decisions
## Next Steps
## Exit Criteria
```

### Baseline 검증 스크립트

```bash
bash scripts/check-operating-baseline.sh
```

- `work/active/` 내 모든 work item이 위 필수 섹션을 갖춰야 통과
- **현재 blocker**: `work/wip/W-0125-engine-perf-hotpath-measurement.md`가 `## Owner`, `## Next Steps` 섹션 누락으로 check 실패 중
- 수정 후 re-run으로 확인

---

## [실행 예정] W-0125 Baseline Fix

`work/wip/W-0125-engine-perf-hotpath-measurement.md`에 누락 섹션 추가:

```markdown
## Owner
engine

## Next Steps
- timing instrumentation 추가 (stats/refinement endpoint)
- scan fan-out guard 구현
```

완료 후 `bash scripts/check-operating-baseline.sh` 통과 확인.

---

## [구버전 실행 명령 — 완료됨, 참고용]

### Step 1 — work/wip/ 생성

```bash
mkdir -p /Users/ej/Projects/wtd-v2/work/wip
```

### Step 2 — 현재 WIP 5개를 wip/로 이동

```bash
cd /Users/ej/Projects/wtd-v2/work/active
mv W-0120-flywheel-data-and-gcp-ops.md ../wip/
mv W-0122-free-indicator-stack.md ../wip/
mv W-0124-engine-ingress-auth-hardening.md ../wip/
mv W-0125-engine-perf-hotpath-measurement.md ../wip/
mv W-0126-app-engine-boundary-closure.md ../wip/
```

### Step 3 — 명확히 완료된 최근 항목을 completed/로 이동

```bash
cd /Users/ej/Projects/wtd-v2/work/active
mv W-0095-*.md ../completed/ 2>/dev/null
mv W-0110-*.md ../completed/ 2>/dev/null
mv W-0112-*.md ../completed/ 2>/dev/null
mv W-0115-*.md ../completed/ 2>/dev/null
mv W-0116-*.md ../completed/ 2>/dev/null
mv W-0117-*.md ../completed/ 2>/dev/null
mv W-0118-*.md ../completed/ 2>/dev/null
mv W-0119-*.md ../completed/ 2>/dev/null
mv W-0122-multi-agent-full-repo-audit.md ../completed/ 2>/dev/null
mv W-0123-*.md ../completed/ 2>/dev/null
```

### Step 4 — 레거시 W-0000~W-0088 일괄 이동

```bash
cd /Users/ej/Projects/wtd-v2/work/active
# W-0000 ~ W-0088 범위 파일 전체 이동 (W-0009-terminal-ux-progressive-disclosure.md 제외)
for f in W-000*.md W-001*.md W-002*.md W-003*.md W-004*.md W-005*.md W-006*.md W-007*.md W-008*.md; do
  mv "$f" ../completed/ 2>/dev/null
done
# W-0009-terminal-ux는 백로그 유지 (active에 남김)
cp ../completed/W-0009-terminal-ux-progressive-disclosure.md . 2>/dev/null
```

### Step 5 — 이름 없는 레거시 파일 이동

```bash
cd /Users/ej/Projects/wtd-v2/work/active
mv AKA-ALPHA-TERMINAL-LOGIC-DECOMP.md ../completed/ 2>/dev/null
mv COGOCHI_REAL_PERSONALIZATION_UX.md ../completed/ 2>/dev/null
mv "H1_PARALLEL_VERIFICATION_PLAN (1).md" ../completed/ 2>/dev/null
mv W-0000-template.md ../completed/ 2>/dev/null
```

### 결과 (목표)

```
work/wip/      — 5개 (W-0120, W-0122, W-0124, W-0125, W-0126)
work/active/   — ~5개 백로그 (W-0009, W-0121, W-0125-vercel, 등)
work/completed/— 170+개 (레거시 전체)
```

---

## 0. 북스타

**지금**: "주어진 시장 데이터에서, 이 레짐과 리스크 규칙 하에 지금 여기서 트레이드를 열어야 하는가?"

**최종**: "JUDGE flywheel로 검증된 트레이더의 판단을 팔로워가 안전하게 복제하는 네트워크"

---

## 1. 문서 Navigation Guide

> **원칙**: 한 작업 = 최대 3개 문서. 그 이상은 컨텍스트 오염.
> **기준선**: Apr 8 이후 문서만 최신. 이전 문서는 코드에 이미 반영 → 읽지 말 것.

### 1.1 최신 UI 설계 문서 맵 (가장 중요)

| 문서 | 갱신 | 용도 |
|------|------|------|
| `docs/product/core-loop-surface-wireframes.md` | Apr 21 | Terminal/Lab/Dashboard 와이어프레임 전체 |
| `docs/product/terminal-attention-workspace.md` | Apr 21 | Terminal 레이아웃 + 정보 밀도 원칙 |
| `docs/product/indicator-visual-design.md` | Apr 22 | 6 archetype 렌더러 + 색상 규칙 |
| `docs/product/pages/02-terminal.md` | Apr 21 | Terminal 페이지 상세 스펙 |
| `docs/product/pages/03-lab.md` | Apr 18 | Lab 페이지 상세 스펙 |
| `docs/product/pages/04-dashboard.md` | Apr 18 | Dashboard 페이지 상세 스펙 |
| `docs/product/pages/00-system-application.md` | Apr 18 | 전체 앱 공통 규칙 |
| `docs/domains/terminal.md` | Apr 18 | Terminal 도메인 경계 |
| `docs/domains/dashboard.md` | Apr 18 | Dashboard 도메인 경계 |
| `docs/domains/lab.md` | Apr 15 | Lab 도메인 경계 |
| `docs/domains/indicator-registry.md` | Apr 22 | 80+ 블록 + 6 archetype 정의 |
| `docs/domains/contracts.md` | Apr 18 | App-engine 타입 계약 |

### 1.2 작업별 필독 조합

| 작업 | 읽을 것 (최대 3개) |
|------|-----------------|
| **Cogochi (메인)** | `core-loop-agent-execution-blueprint.md` + `terminal-attention-workspace.md` + work item |
| **Cogochi AI Agent** | `pages/02-terminal.md` + `domains/indicator-registry.md` + work item |
| **Dashboard UI** | `pages/04-dashboard.md` + `domains/dashboard.md` + `wireframes.md` |
| **Lab UI** | `pages/03-lab.md` + `domains/lab.md` + `wireframes.md` |
| **Indicator 렌더러** | `domains/indicator-registry.md` + `indicator-visual-design.md` + work item |
| **Chart/TradingView** | `domains/terminal.md` + ADR-008 + work item |
| **Capture/Verdict** | `domains/contracts.md` + `core-loop-object-contracts.md` + work item |
| **API 계약** | `domains/contracts.md` + `core-loop-route-contracts.md` + work item |
| **Engine 로직** | `domains/engine-pipeline.md` + work item |
| **카피트레이딩** | 이 문서 섹션 5 + `domains/contracts.md` + work item |
| **GCP/배포** | `runbooks/cloud-run-engine-deploy.md` + work item |

### 1.3 읽지 말아야 하는 것

```
docs/archive/                              — 폐기된 설계
work/completed/                            — git log로 대체
work/active/ W-0001~W-0088                 — 코드에 이미 반영
docs/product/pages/06-screener.md          — Deferred, 미구현
app/docs/COGOCHI.md                        — 내부 레거시
docs/domains/multi-agent-*.md              — 에이전트 조율용
docs/domains/terminal-html-backend-parity.md — 레거시 HTML 호환
```

### 1.4 Work 디렉토리 구조 (목표 상태)

```
work/
  wip/      (MAX 5 — 지금 실행 중)
    W-0120  flywheel-data-gcp-ops
    W-0122  free-indicator-stack
    W-0124  engine-ingress-auth
    W-0125  engine-perf-hotpath
    W-0126  app-engine-boundary-closure

  active/   (백로그 — 시작 전)
    W-0009  terminal-ux-progressive-disclosure
    W-0121  ledger-outcome-recovery
            vercel-branch-deploy-guardrails
            [카피트레이딩 Phase B~D — 신규 생성 예정]

  completed/ (읽지 말 것 — 아래 일괄 이동 대상)
    W-0115, W-0116, W-0117, W-0118×2
    W-0119×2, W-0122-audit, W-0123
    W-0095, W-0110, W-0112
    W-0001~W-0088 레거시 전체 (~162개)
```

---

## 2. 현재 UI 서피스 현황

### 2.1 서피스 구조 (2026-04-22 실제 기준)

**메인 서피스**: `/cogochi` — Core Loop 허브. 플라이휠 전 단계가 여기서 돌아감.

```
/           Home         — Frozen (수정 금지)
/cogochi    Cogochi      — ★ 메인 서피스 (Terminal 기능 통합, 플라이휠 허브)
/lab        Lab          — 패턴 평가 + 백테스트 workbench
/dashboard  Dashboard    — 알림 + Verdict Inbox
/patterns   Patterns     — 패턴 라이브러리
/settings   Settings     — 설정
/passport   Passport     — 유저 진행도
/terminal   Terminal     — 레거시 라우트 (Cogochi로 통합 예정)
```

### 2.2 Cogochi — 메인 서피스 레이아웃

```
+──────────────────+──────────────────────────────────+──────────────────+
| 좌측 레일         | 중앙: ChartBoard                 | 우측: AI Agent   |
| - LIBRARY        | - 차트 + 인디케이터               | - 자연어 입력    |
| - VERDICTS       | - SELECT RANGE (드래그 캡처)      | - 분석 on-demand |
| - RULES          | - 저장 패턴 카드 (빈 상태 시)     | - 인디케이터 블록|
|                  |                                  | - Entry/Risk 카드|
+──────────────────+──────────────────────────────────+──────────────────+
하단: TRADE / TRAIN / FLYWHEEL 탭  |  scanner live · 300 sym
```

**핵심 전환**: 기존 Terminal 고정 패널(Summary/Entry/Risk/Catalysts/Metrics)
→ AI Agent 우측에서 **자연어 요청에 따라 on-demand 렌더링**

```
사용자: "OI 급등 후 번지대 accumulation 분석해줘"
AI Agent → indicator 블록 + entry/risk/catalysts 카드 렌더링
```

**설계 진실 소스** (기존 Terminal 스펙 → Cogochi에 그대로 적용):
- `docs/product/core-loop-agent-execution-blueprint.md` — AI Agent 실행 스펙
- `docs/product/core-loop-system-spec.md` — 11단계 시스템 루프
- `docs/product/terminal-attention-workspace.md` — 레이아웃 원칙
- `docs/product/pages/02-terminal.md` — Capture 3가지 등록 모드

**3가지 Capture 등록 모드** (중앙 ChartBoard에서):
1. Reviewed range only — 드래그 → SELECT RANGE
2. Reviewed range + hint/note
3. Explicit query/condition input — AI Agent 통해

**ChartBoard 규칙** (ADR-008, 변경 없음):
- 모든 Binance kline WS = DataFeed 단독 소유
- raw `new WebSocket` 금지

### 2.3 Dashboard (Verdict Inbox)

`pages/04-dashboard.md` 기준 — 구조 변경 없음.

### 2.4 Indicator 렌더러 (6 Archetype) — AI Agent가 on-demand 렌더링

(`docs/product/indicator-visual-design.md` + `docs/domains/indicator-registry.md` 기준)

| Archetype | 렌더 방식 | 대표 지표 |
|-----------|---------|---------|
| A | Percentile Gauge + Sparkline | OI change, funding, ATR |
| B | Actor-Stratified Multi-Line | CVD by size, LS ratio |
| C | Price×Time Heatmap | Liquidations, orderbook depth |
| D | Divergence Indicator | CVD↔price, OI↔price |
| E | Regime Badge + Flip Clock | Funding flip, CVD flip |
| F | Venue Divergence Strip | OI/funding per exchange |

---

## 3. 지금 2주 실행 계획 (wip)

### W-0122 — Free Indicator Stack (4 Pillars)

**목표**: $400/month 프리미엄 스택의 70~80%를 무료 API로 커버

| Pillar | 소스 | 신규 블록 |
|--------|------|---------|
| 1. Multi-Venue Liq | Binance/Bybit/OKX WS | liq_magnet, liq_cluster_density |
| 2. Deribit Options | IV, GEX, skew, DVOL | gamma_flip, skew_extreme |
| 3. Venue Divergence ⭐ | Coinalyze + 4거래소 | venue_oi_diverge, basis_spread |
| 4. Exchange Netflow | Arkham Intelligence | exchange_inflow/outflow |

**Confluence Engine**: 4 pillar 가중 합산 → flywheel axis 4 학습
**슬라이스**: W-0122-A~D (6주, 각 슬라이스 = 별도 브랜치/PR)
**비용**: $0~$10/month

---

### W-0124 — Engine Ingress Auth Hardening

**목표**: 엔진 내부 라우트에 인증 게이트 추가 (non-meta routes)
**상태**: 설계 완료, 구현 대기

---

### W-0125 — Engine Perf Hotpath

**목표**: 가장 느린 엔드포인트 병목 식별 + 1순위 수정

**진단된 병목**:
- `/api/patterns/stats` → N+1 fan-out (ledger JSON 반복 스캔)
- `refinement` 라우트 → `compute_stats()` 중복 호출
- `scanEngine.ts` → 2 core + 15 external fan-out

**완료**: PR #160 (record scan 3→1, refinement snapshot 캐시)
**남은 것**: timing instrumentation 추가

---

### W-0126 — App-Engine Boundary Closure

**목표**: 브라우저 → `/api/engine/captures/*` 직접 호출 제거
**현황**: `/api/captures/outcomes`, `/api/captures/[id]/verdict` first-party 존재. 브라우저 코드가 아직 proxy 경유.
**Exit Criteria**: slug 검증 pre-ledger, proxy 최소화, tests pass

---

### W-0120 — Flywheel Data + GCP Ops

**목표**: GCP 운영 안정화 + flywheel 데이터 파이프라인
**3개 블로커**: keep-alive, founder seeding 확인, outcome_resolver 검증
**현재 상태**: founder seeding 61건, pending_outcome=0 ✅

---

## 4. 핵심 플라이휠 (변경 불가 구조)

```
① 차트 리뷰 → Save Setup (Terminal에서 Capture 기록)
② Lab 평가 → 패턴 매칭 + 블록 점수
③ SCAN → 전 종목 페이즈 추적
   (FAKE_DUMP → ARCH_ZONE → REAL_DUMP → ACCUMULATION → BREAKOUT)
④ 액션 알림 → ACCUMULATION 구간
⑤ 결과 기록 → Capture outcome
⑥ Verdict Inbox → 유저 판정 (valid/invalid/missed)
⑦ Refinement → 블록 임계값 + ML 모델 보정
⑧ ① 로 돌아감
```

**4축 Flywheel (모두 완성)**:

| 축 | 내용 | 상태 |
|----|------|------|
| 1 | Capture store | ✅ |
| 2 | Outcome resolver | ✅ |
| 3 | Verdict API | ✅ |
| 4 | Refinement trigger | ✅ |

---

## 5. 카피트레이딩 로드맵

### 현재 기반 (재사용 가능)

| 코드 | 카피트레이딩 역할 |
|------|----------------|
| `copyTradeStore.ts` 3-step wizard | 리더 시그널 발행 UI 확장 베이스 |
| `quickTradeStore.ts` | 카피 포지션 → QuickTrade 변환 |
| `trackedSignalStore.ts` source 필드 | 리더 attribution 추가 |
| `refinement/leaderboard` | 유저 단위 leaderboard 확장 |
| `captures.py` verdict 파이프라인 | Reputation 계산 데이터소스 |
| `jobs.py` 스케줄러 | 팬아웃 + reputation_update job |
| AES-256 암호화 (PR#151) | 거래소 API Key 암호화 동일 방식 |
| SSE 실시간 패턴 | 시그널 실시간 알림 |

---

### Phase B — Foundation (복제 없이 데이터 레이어)

**목표**: 리더가 존재하고, 실적이 보이고, 팔로우 가능. 실제 복제는 Phase C.

#### B-1. Reputation Engine (engine)

```
Reputation Score = f(
  win_rate,          // verdict_ready → valid/total
  expected_value,    // avg pnl_pct × confidence
  consistency,       // avg_return / std_return
  recency,           // 최근 30일 가중치
  sample_size,       // 신뢰도 보정
  pattern_diversity  // 단일 패턴 과의존 페널티
)
```

- 0–100점
- Verified 뱃지: 50건 이상 + score ≥ 65
- Elite 뱃지: 200건 이상 + score ≥ 80 + 90일 연속
- 재사용: `engine/api/routes/refinement.py` leaderboard 구조 확장
- 신규 엔드포인트: `GET /reputation/score/[user_id]`, `GET /reputation/leaderboard`

#### B-2. 신규 DB 테이블 (Supabase migration)

```sql
-- leader_profiles
id UUID PK | user_id FK | display_name | bio | trading_style
is_verified BOOL | is_elite BOOL | reputation_score FLOAT
win_rate FLOAT | avg_pnl_pct FLOAT | total_signals INT | follower_count INT

-- leader_subscriptions
id UUID PK | follower_user_id FK | leader_user_id FK
copy_mode TEXT ('auto'|'alert'|'review')
size_pct FLOAT | max_leverage INT | max_loss_per_trade FLOAT | max_daily_loss FLOAT
excluded_pairs TEXT[] | min_confidence FLOAT | min_rr_ratio FLOAT
exchange TEXT | exchange_api_key_encrypted TEXT | exchange_secret_encrypted TEXT
simulation_mode BOOL DEFAULT true
UNIQUE(follower_user_id, leader_user_id)

-- copy_positions
id UUID PK | subscription_id FK | original_signal_id FK
pair TEXT | direction TEXT | entry_price FLOAT | leverage INT
tp_prices FLOAT[] | sl_price FLOAT | exchange_order_id TEXT
status TEXT ('pending'|'open'|'closed'|'failed'|'skipped')
pnl_pct FLOAT | pnl_usd FLOAT | is_manual_override BOOL | simulation_mode BOOL

-- reputation_snapshots
id UUID PK | user_id FK | snapshot_at TIMESTAMPTZ
win_rate FLOAT | avg_pnl_pct FLOAT | consistency_score FLOAT
sample_size INT | reputation_score FLOAT
```

**기존 테이블 확장**:
```sql
-- tracked_signals 추가
visibility TEXT ('private'|'followers'|'public')
leader_user_id UUID | pattern_slug TEXT
signal_ttl_hours INT DEFAULT 24 | fanout_count INT

-- quick_trades 추가
copy_position_id UUID
```

#### B-3. Leaderboard + 리더 프로필 UI

**신규 라우트**:
```
/leaderboard           — 공개 리더보드
/leaders/[username]    — 리더 프로필
```

**리더보드 카드** (각 리더):
- 순위 + 아바타 + Verified/Elite 뱃지
- Reputation Score 원형 게이지
- 승률 | 평균 PnL% | 트레이드 수
- 30일 수익 스파크라인
- "팔로우" 버튼

**리더 프로필 페이지**:
- Reputation Score + 뱃지 + 팔로워 수
- 성과 (JUDGE-backed): 승률, PnL%, Drawdown
- 패턴 분포 Top 5 + 선호 페어 Top 5
- 최근 시그널 피드 20건
- Capture Annotation 투명성 (왜 진입했는지 링크)

#### B-4. 시그널 퍼블리시 확장

**`copyTradeStore.ts` Step 1 추가**:
- 공개 범위 (private / followers / public)
- TTL (1h / 4h / 24h / custom)
- 최대 슬리피지 %

**Step 2 추가**:
- 추천 포지션 크기 % (팔로워 기본값)
- 레버리지 권장값
- 패턴 태그

#### B-5. 사용자 역할

| 역할 | 조건 | 기능 |
|------|------|------|
| Leader | captures ≥ 10건 + 계정 30일 | 시그널 퍼블리시, 리더보드 |
| Verified Leader | verdict_ready ≥ 50 + score ≥ 65 | Verified 뱃지 |
| Elite Leader | verdict_ready ≥ 200 + score ≥ 80 + 90일 | Priority 팬아웃 |
| Follower | 누구나 | 구독 + 복제 |
| Observer | 누구나 | 피드 읽기 전용 |

---

### Phase C — Alert Mode (알림 + 수동 진입)

**목표**: 팔로워가 시그널 받고 수동으로 진입 가능

#### C-1. 구독 설정 모달

**카피 모드**:
- `ALERT`: 알림만, 수동 확인 후 진입
- `REVIEW`: 요약 카드 + 1-click 진입
- `AUTO`: Phase D에서 활성화

**리스크 설정**:
- 포지션 크기 % 또는 고정 USDT
- 최대 레버리지 캡
- 1회 최대 손실 한도 (USD)
- 일일 최대 손실 한도 (USD)
- 최대 동시 오픈 포지션

**필터**:
- 제외 페어
- 최소 confidence
- 최소 R:R 비율

#### C-2. 시그널 팬아웃 Job

```
리더 발행 → signal_fanout_job 트리거
  → active 구독자 필터 평가
  → copy_position 레코드 생성 (pending)
  → SSE 알림 발송
```
- 팬아웃 지연 목표: < 500ms

#### C-3. Following 페이지 + 공개 피드

**`/following`**:
- 팔로잉 목록 + 시그널 카드 (REVIEW: 1-click 진입)
- 활성화/일시정지 토글

**`/signals`** (공개 피드):
- 필터: 전체 / Following / Verified only
- 피드 카드: 리더 + Reputation + 페어/방향/TP/SL + 결과 + 근거 요약

---

### Phase D — Auto Mode (완전 자동)

**목표**: 거래소 연동 + 자동 실행

#### D-1. 거래소 Adapter

```
ExchangeAdapter:
  connect(key, secret) → ConnectionStatus
  get_balance() → BalanceInfo
  place_order(pair, dir, size, leverage, tp, sl) → OrderResult
  close_position(id) → CloseResult
  modify_order(id, tp, sl) → ModifyResult
```

- 지원: Binance Futures (USDT-M), Bybit (Linear)
- API Key: AES-256 → Supabase vault (앱 서버에서만 복호화)
- 최소 권한: 거래+조회, 출금 불가

#### D-2. Risk Circuit Breaker (필수, 옵션 아님)

- 일일 손실 한도 초과 → 해당 리더 일시정지
- 총 잔고 -20% → 전체 카피 일시정지 + 알림
- API 오류 3회 → 실패 알림 + 수동 유도
- 거래소 오류율 목표: < 1%

#### D-3. 포지션 크기 계산

```python
copy_size = min(
  follower_balance * follower_size_pct,
  follower_max_per_trade_usd,
  leader_recommended_size * scale_factor
)
leverage = min(leader_leverage, follower_max_leverage_cap)
```

#### D-4. `/settings/exchange` 페이지

- API Key 등록 + 연결 테스트 + 잔고 확인
- 시뮬레이션 모드 기본 활성화 (드라이런 먼저)
- 실제 주문 전환 = 명시적 확인 필요

---

### Phase E — Ecosystem (수익화 + 온체인)

- 팔로워 구독료 → 리더 자동 배분
- Reputation 토큰 스테이킹
- 온체인 settlement 레이어
- *(별도 설계 문서 필요)*

---

## 6. 신규 API Surface

### 6.1 App Layer (Phase B~D)

```
GET  /api/leaders                      — 리더 목록
GET  /api/leaders/[username]           — 리더 프로필
GET  /api/leaders/[username]/signals   — 리더 최근 시그널
POST /api/leaders/register             — 리더 등록
GET  /api/subscriptions                — 내 팔로우 목록
POST /api/subscriptions                — 팔로우 + 설정
PUT  /api/subscriptions/[id]           — 설정 수정
DELETE /api/subscriptions/[id]         — 언팔로우
POST /api/subscriptions/[id]/pause     — 일시정지
GET  /api/copy-positions               — 카피 포지션 목록
POST /api/copy-positions/[id]/close    — 수동 종료
PUT  /api/copy-positions/[id]/modify   — TP/SL 수정
POST /api/exchange/connect             — API Key 등록
GET  /api/exchange/balance             — 잔고 조회
GET  /api/signals/feed                 — 공개 피드
GET  /api/signals/feed/following       — 팔로잉 피드
```

### 6.2 Engine Layer (Phase B~D)

```
GET  /reputation/score/[user_id]       — Reputation 계산
GET  /reputation/leaderboard           — 유저 리더보드
POST /reputation/snapshot              — 스냅샷 저장
POST /jobs/signal-fanout               — 팬아웃 트리거 (internal)
POST /jobs/copy-close                  — 종료 동기화 (internal)
POST /jobs/reputation-update           — 일괄 재계산 (스케줄러)
```

---

## 7. 아키텍처 원칙 (불변)

### 3-Plane 런타임

```
app-web      — SvelteKit, UI, auth, SSE, 공개 API 오케스트레이션
engine-api   — FastAPI, scoring, 평가, 패턴/챌린지 (GCP asia-southeast1)
worker-ctrl  — 스케줄러, 큐, 리포트, 트레이닝
```

### 핵심 경계

| 규칙 | 내용 |
|------|------|
| Engine is truth | backend 로직, feature 계산, 평가 = engine만 |
| App = surface | 렌더링 + 오케스트레이션만. 비즈니스 로직 복제 금지 |
| Contract-first | 모든 app-engine 결합 = 타입 계약 먼저 |
| ChartBoard WS 단독 | Binance kline WS = DataFeed 경유만 (ADR-008) |
| 작업당 문서 3개 이하 | 컨텍스트 오염 방지 |

### 확정된 ADR (8개)

| ADR | 결정 |
|-----|------|
| ADR-000 | AI OS baseline (read order, work item) |
| ADR-001 | Engine = canonical backend truth |
| ADR-002 | App-Engine boundary |
| ADR-003 | Challenge contract = integration spine |
| ADR-004 | 3-plane runtime |
| ADR-005 | Bridge ownership |
| ADR-006 | Runtime adapter boundary (local vs remote) |
| ADR-007 | WIP discipline (wip/active/completed) |
| ADR-008 | ChartBoard = 단독 WS 오너 |

---

## 8. 성공 지표

### 플라이휠 건강도

| 지표 | 현재 | 목표 |
|------|------|------|
| verdict_ready captures | 61건 | 500건 |
| PROMOTED 패턴 | 4개 | 10개 |
| 패턴 평균 승률 | 측정 중 | ≥ 60% |

### 카피트레이딩 성장

| 지표 | Phase B | Phase C | Phase D |
|------|---------|---------|---------|
| Verified 리더 | 5 | 20 | 50 |
| 활성 팔로워 | 10 | 100 | 500 |
| 팔로워 retention 30일 | — | 50% | 60% |
| 팬아웃 지연 | — | < 500ms | < 500ms |
| 자동 진입 지연 | — | — | < 2s |

---

## 9. Non-Goals

- 현물 거래 카피 (선물/퍼프만)
- 옵션 카피
- 소셜 피드 / 댓글 / 좋아요
- 리더 KYC
- 모바일 앱 (반응형 웹으로 커버)
- 자동 트레이딩 봇 (Human-in-the-loop 원칙)
- 온체인 settlement (Phase E, 별도 설계)

---

## 10. 경쟁사 포지셔닝

| 경쟁사 | 약점 | WTD 차별점 |
|--------|------|-----------|
| Bitget | 수익률 숫자만, 블랙박스 | JUDGE 자동 검증 + Capture 투명성 |
| Binance | 거래소 이익 우선 | 중립 플랫폼, 검증이 moat |
| Bybit Elite | 리더 자기 보고 기반 | 독립 JUDGE 판정 |
| 3Commas | 봇 기반, 인간 판단 없음 | Human-in-the-loop, 근거 공개 |
| Covesting | 검증 불투명 | 92 feature 패턴 일치도 공개 |

**핵심 moat**: JUDGE verdict 누적 데이터 → 시간이 지날수록 복제 불가
