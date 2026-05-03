# W-PF-100 — PropFirm MVP 3-Phase Master Epic

> Wave: 5 | Priority: P0 | Effort: XL (P1=✅ 완료, P2=L, P3=L+legal)
> Charter: In-Scope (Paper trading 검증 도구) + P3 Entry Gate (실자금 별도 레인)
> Status: 🟢 P1 완료 (PR #783 #787 #802) | P2 대기
> Created: 2026-04-30
> Issue: #769
> Ptrack: [work/ptrack/P-00-master.md](../ptrack/P-00-master.md)
> Related: [P-01-prd](../ptrack/P-01-prd.md) · [P-02-architecture](../ptrack/P-02-architecture.md) · [P-03-phases](../ptrack/P-03-phases.md)

## Goal

WTD 시그널을 사용자가 직접 손대지 않아도 paper account 에서 자동 집행되는 모습을 `/lab` 의 "패턴 런" 탭에서 실시간으로 확인할 수 있고(P1), 평가 챌린지를 결제·통과하여(P2), Entry Gate 통과 후 실 USDC funded 계정까지 받을 수 있는(P3) 3단계 PropFirm 검증 라인을 단일 Epic 으로 추적한다.

## Scope (Phase 별)

### P1 — Paper Auto-Execution (Charter In-Scope)

**포함**:
- ScanSignal → PatternFireRouter → EntryDecider → LimitMatcher → ExitMonitor 5-컴포넌트 라인
- HyperLiquid public WS market feed (mid/last/funding)
- pattern_fires 영속화 + orders/positions/fills (account_type='INTERNAL_RUN')
- `/lab` 신규 "패턴 런" 탭 (PatternRunPanel + EquityCurve, LabChart chartMarkers 재사용)
- BTC/ETH/SOL 3개 심볼, SUPPORTED_STRATEGIES whitelist (Q-PF-001 답변 후 확정)

**파일**:
- `app/supabase/migrations/031_propfirm_p1_core.sql` (신규)
- `engine/propfirm/router.py`, `entry.py`, `match.py`, `exit.py` (신규)
- `engine/propfirm/hl/market_feed.py` (신규)
- `engine/scanner/realtime.py` (hook 추가, ScanSignal emit 후 router.on_scan_signal)
- `app/src/routes/lab/+page.svelte` (탭 1개 추가)
- `app/src/components/lab/PatternRunPanel.svelte`, `EquityCurve.svelte` (신규)
- `engine/api/routes/propfirm_paper.py` (신규)

**API**:
- `GET /api/propfirm/accounts` — 활성 INTERNAL_RUN 계정 목록
- `GET /api/propfirm/accounts/{id}/pattern-fires` — 최근 pattern_fires
- `GET /api/propfirm/accounts/{id}/positions` — 오픈 포지션 + equity

**Frontend Surface (Q-PF-003 확정)**:
```
/lab (기존 Challenge Lab)
  탭 패널: [챌린지] [런 결과] [리더보드] [패턴 런]  ← 신규
                                               ↑
                                        PatternRunPanel.svelte
                                        - 계정 equity / realized pnl
                                        - pattern_fires 피드 (최근 20건)
                                        - 오픈 포지션 목록

LabChart (기존) ← chartMarkers 주입으로 진입/청산 포인트 표기
  entry: arrowUp(green) / arrowDown(red)
  exit TP: circle(green), exit SL: circle(red), exit TTL: circle(grey)
```

### P2 — Evaluation Challenge (Charter In-Scope)

**포함**:
- users / subscriptions / evaluations / verification_runs / rule_violations
- MLL / Consistency / Profit Goal / Min Trading Days 룰 엔진
- Stripe ($) + x402 USDC 결제 (W-0248 재사용)
- `/dashboard`, `/trade`, `/verify` 라우트
- 베타 모집 (whitelist 기반 ≥ 10명)

**파일**:
- `app/supabase/migrations/032_propfirm_p2_eval.sql` (additive only)
- `engine/propfirm/rules/{mll,consistency,profit_goal,min_days}.py`
- `engine/propfirm/evaluation.py`
- `app/src/routes/{dashboard,trade,verify}/+page.svelte`

**API**:
- `POST /api/propfirm/challenges/start`
- `GET /api/propfirm/evaluations/{id}`
- `POST /api/propfirm/payment/{stripe|x402}/checkout`

### P3 — Funded Account (Frozen-인접, Entry Gate 7개 PASS 필수)

**포함 (Entry Gate 통과 후에만)**:
- HL sub-account 자동 생성·자금 충전
- funded_accounts / payouts / payout_requests
- 다계정·카피트레이딩 탐지 룰
- USDC 지급 운영 매뉴얼 → 자동화 단계적 전환

**파일**:
- `app/supabase/migrations/033_propfirm_p3_funded.sql`
- `engine/propfirm/hl/sub_account.py`, `engine/propfirm/hl/live.py`
- `engine/propfirm/payout.py`
- `app/src/routes/funded/+page.svelte`

**API**:
- `POST /api/propfirm/funded/activate`
- `POST /api/propfirm/funded/payout/request`

## Non-Goals

- **Copy trading / Leaderboard** — Charter Frozen
- **AI 차트 분석 자동매매** — Charter Frozen
- **사용자 직접 주문 인터페이스** — PropFirm 은 시그널 자동 집행 검증 도구
- **3개 초과 심볼 P1 지원** — P2 이후 검토
- **백테스트 UI** — 기존 Lab Challenge 가 담당, PropFirm 은 forward-only
- **신규 메모리 stack 도입** — Charter Frozen

## CTO 관점

### Risk Matrix

| Phase | Risk | Severity | Mitigation |
|---|---|---|---|
| P1 | HL WS stale → fill 시점 왜곡 | High | heartbeat 5s 초과 시 router halt + alert |
| P1 | ScanSignal 중복 emit → 이중 entry | High | (strategy_id, symbol, signal_ts) UNIQUE + idempotent insert |
| P1 | LimitMatcher mid-mark 슬리피지 누락 | Med | 5-bps 슬리피지 보수적 가산, 24h 통계로 보정 |
| P1 | Lab 탭 추가 → 기존 LabChart 회귀 | Med | feature flag `propfirm_tab_enabled`, 기존 탭 무수정 |
| P2 | Stripe 결제 실패 → eval stuck | Med | webhook 재시도 + manual reconcile CLI |
| P2 | MLL 룰 race condition | High | 룰 평가는 fill 단위 atomic transaction |
| P3 | 한국 유사수신 규제 위배 | **Critical** | Entry Gate 법무 4-checklist 외부 자문 |
| P3 | HL sub-account API 권한 박탈 | High | 운영 매뉴얼 + fallback manual payout |
| P3 | 카피트레이딩 의심 → 지급 분쟁 | High | 다계정 탐지 베이스라인 + 약관 명시 |

### Dependencies / Rollback

**Dependencies**:
- W-0248 (Stripe + x402 tier) — P2 결제 재사용
- W-0298 V-PV-01 engine/verification scaffold — 통계 재사용
- `engine/scanner/realtime.py:60 ScanSignal` — P1 진입점
- `engine/ledger_records/*` — strategy_id catalog source (10개 패턴)

**Rollback**:
- P1: feature flag `propfirm_p1_enabled=false` + migration 031 additive (drop 불필요)
- P2: subscriptions.active = 0 확인 후 라우트 비활성화
- P3: Entry Gate 미통과 시 migration 033 미적용 (별도 PR)

### Migration 순서 (additive only)

1. **031**: trading_accounts(INTERNAL_RUN), pattern_fires, orders, positions, fills, daily_performance
2. **032**: users, subscriptions, evaluations, verification_runs, rule_violations + 031 테이블에 additive columns
3. **033**: funded_accounts, payouts, payout_requests, fraud_signals (Entry Gate 통과 후)

## AI Researcher 관점

### Data Impact

**단일 라인**:
```
ScanSignal (in-memory)
  → pattern_fires (영속화)
  → orders (ENTRY intent, pattern_fire_id FK)
  → fills (LimitMatcher 시뮬)
  → positions (open/closed)
  → equity_snapshots (1분 cadence)
  → EquityCurve UI + chartMarkers
```

**strategy_id 컨벤션**: `wtd.{ledger_record_dirname}` (예: `wtd.radar-golden-entry-v1`)

### Statistical Validation (P1 24h)

- fill 누락 0건: `pattern_fires.status='ENTRY' AND orders 미생성 = 0`
- 슬리피지 평균 ≤ 5 bps: `|fill_price - hl_mid| / hl_mid * 10000` 24h 평균
- ENTRY 변환율 ≥ 95%: EntryDecider ENTRY 결정 / pattern_fires total (filter 거부 제외)
- 마커 1캔들 이내: `fills.fill_ts` vs `chartMarker.time` 차이 ≤ candle_interval

### Failure Modes

| 모드 | 탐지 | 대응 |
|---|---|---|
| HL WS stale | heartbeat > 5s | router halt, in-flight 주문 cancel |
| 중복 진입 | (strategy_id, symbol, signal_ts) UNIQUE 위반 | INSERT IGNORE + log |
| ScanSignal storm | 1분 내 동일 strategy_id N>10 | rate limit + alert |
| equity 음수 발산 | equity_snapshots.equity < 0 | 강제 flatten + run halt |
| 카피트레이딩 의심 (P3) | 동일 IP/시그널 타이밍 상관 | fraud_signals 적재 + manual review |

## Decisions

- **[D-PF-001] GAP-1: trading_accounts 단일 + account_type 분기** — 거절: paper_accounts/eval_accounts 별도 (마이그레이션 비용 + 코드 이중화)
- **[D-PF-002] GAP-2: ScanSignal → pattern_fires 단일 라인** — 거절: signal_events 신설 (SignalSnapshot/ScanSignal/RagScanSignal 3-way naming collision)
- **[D-PF-003] GAP-3: 5컴포넌트 분리 Router/Entry/Match/Exit/Live** — 거절: PaperExecutor 단일 클래스 (entry filter 와 exit monitor 책임 모호)
- **[D-PF-004] GAP-4: P3 Entry Gate 격상** — 거절: AC 한 줄 처리 (한국 가상자산이용자보호법/유사수신 리스크 가시성 부족)
- **[D-PF-005] strategy_id = `wtd.{ledger_record_dirname}`** — 거절: UUID 자동생성 (ledger_records 카탈로그 역매핑 불가)
- **[D-PF-006] P1 Surface = `/lab` "패턴 런" 탭 (Q-PF-003 closed)** — 거절: `/scanner` overlay (기존 신호 UX 충돌), 거절: 별도 `/propfirm` 라우트 (P1 단계 과잉)
- **[D-PF-007] Migration 031/032/033 순차 additive** — 거절: 한 번에 완료 (P1 검증 전 P2/P3 스키마 잠금)

## Sub Work Items

| W-# | 제목 | Effort | 차단 Q |
|---|---|---|---|
| W-PF-101 | 031_propfirm_p1_core.sql 통합 스키마 | S | - |
| W-PF-102 | HL market feed worker (BTC/ETH/SOL → Redis) | M | - |
| W-PF-103 | PatternFireRouter + scanner hook | M | Q-PF-001, Q-PF-004 |
| W-PF-104 | EntryDecider + LimitMatcher | M | Q-PF-002 |
| W-PF-105 | ExitMonitor (TP/SL/TTL) | S | Q-PF-002 |
| W-PF-106 | PatternRunPanel (Lab "패턴 런" 탭) + EquityCurve 마커 | M | - |

상세 구현: [work/ptrack/P-03-phases.md](../ptrack/P-03-phases.md)

## Open Questions (P1 착수 전 답변 필요)

- [ ] **[Q-PF-001]** P1 SUPPORTED_STRATEGIES 목록 — 10개 패턴 중 어떤 것? 추천: `radar-golden-entry-v1` + `compression-breakout-reversal-v1` → 차단: W-PF-103
- [ ] **[Q-PF-002]** exit_policy 기본값 — tp_bps / sl_bps / ttl_min (백테스트 기준 vs conservative 임의 값) → 차단: W-PF-104, W-PF-105
- [ ] **[Q-PF-004]** blocks_triggered → strategy_id 매핑 룰 — ledger_records 에 manifest.json 추가 필요? → 차단: W-PF-103

(Q-PF-003 closed: `/lab` "패턴 런" 탭)

## P3 Entry Gate (착수 차단 조건 — 7개 모두 PASS 시에만 W-PF-301~ 시작)

**법무 4**:
- [ ] 가상자산이용자보호법 (2024-07-19 시행) 적용 범위 검토 완료
- [ ] FX마진/유사수신 규제 위배 여부 확인 (금융투자협회 가이드)
- [ ] 한국 사용자 차단 vs 허용 정책 결정 + 차단 메커니즘 (IP/KYC) 구현
- [ ] 약관·위험고지 한글 법무 검토 완료 + 수익배분 "유사수신" 해당 여부 법률 자문

**운영 3**:
- [ ] HL sub-account API 권한 확인 + 운영 절차 문서화
- [ ] USDC 지급 운영 매뉴얼 (수동 → 자동 단계적)
- [ ] 다계정/카피트레이딩 탐지 룰 베이스라인 설정

## Implementation Plan

1. **P1 (2주)**: W-PF-101 → 102 → 103+104 병렬 → 105 → 106 → 24h 검증
2. **P2 (4주)**: 032 additive → users/subs/eval/verif → /dashboard /trade /verify → 베타 ≥ 10명
3. **P3 Entry Gate** (P1/P2 병렬, 법무 외부 자문) → 7-checklist PASS → W-PF-301~ 착수

## Exit Criteria

- [ ] **P1 AC1**: `wtd.{전략}` BTC/ETH/SOL 24시간 연속 실행, fill 누락 0
- [ ] **P1 AC2**: HL mid vs 시뮬 fill 슬리피지 평균 ≤ 5 bps
- [ ] **P1 AC3**: Lab "패턴 런" 탭 렌더링 + LabChart 마커 fill 시점 ≤ 1 캔들 오차
- [ ] **P1 AC4**: equity curve 정확도 delta < $0.01
- [ ] **P1 AC5**: ScanSignal → pattern_fires 영속화율 100%, ENTRY 변환율 ≥ 95%
- [ ] **P1 AC6**: engine/tests/propfirm/ ≥ 12 PASS, CI green
- [ ] **P2 AC1**: 베타 사용자 ≥ 10명 가입 → 5명 첫 거래
- [ ] **P2 AC2**: MLL/Consistency/ProfitGoal 룰 위반 탐지율 100% (테스트 시나리오)
- [ ] **P2 AC3**: Stripe + USDC 결제 양쪽 정상 처리
- [ ] **P3 Entry Gate**: 법무 4 + 운영 3 모두 PASS → W-PF-301~ 착수
- [ ] **P3 AC**: HL funded → 실 USDC payout 1건 이상 성공
- [ ] CI green, CURRENT.md SHA 업데이트
