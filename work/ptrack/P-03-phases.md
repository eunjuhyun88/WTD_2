# PropFirm — 3-Phase Implementation Roadmap v1.2

> Status: 🟡 Design Draft
> Created: 2026-04-30 (v1.0) / Revised 2026-04-30 (v1.2)
> Author: ej + Claude
> Related: P-01-prd.md, P-02-architecture.md
> Index: [P-00-master.md](P-00-master.md)
>
> **v1.1**: P1 별도 `paper_*` 테이블 폐기 → 통합 `trading_accounts` (`account_type='INTERNAL_RUN'`). P3 한국 법무 → Entry Gate 격상.
> **v1.2**: Q-PF-003 확정 — P1 surface = `/lab` "패턴 런" 탭. `/scanner` overlay 제거.

---

## Phase 개요

| Phase | 목적 | 사용자 | 자금 | 목표 기간 |
|---|---|---|---|---|
| **P1** | 우리 패턴이 실시간으로 진짜 작동하는지 **내부 검증** | 우리만 | 가상 | 2주 |
| **P2** | 외부 베타 사용자가 구독·평가·신호 체험 | 베타 유저 | 가상 | 4주 |
| **P3** | 실거래 통합 (HL funded + 수익배분) | 통과자 | 실제 USDC | 4주+ |

각 Phase는 앞 Phase 산출물 위에 얹는 구조. P1의 패턴→자동주문→차트 라인은 P2/P3에서 동일하게 재사용됨.

---

# Phase 1 — Internal Validation Loop

## 목표 (1줄)

WTD 패턴이 실시간으로 fire되면 가상 계정에 자동 진입 → 차트에 마커 표기 → 우리가 보고 검증.

## 입력/출력

```
[INPUT]  engine/scanner/realtime.py 의 ScanSignal (기존, 92 features → ensemble → emit)
[PERSIST] pattern_fires (영속 신호 로그)
[CORE]   ScanSignal → PatternFireRouter → EntryDecider → Order/Position/Fill
[OUTPUT] /scanner 차트에 entry/exit 마커 + EquityCurve 패널
```

## Scope

**포함**

- 신규 마이그레이션 `031_propfirm_p1_core.sql`: `trading_accounts`, `orders`, `positions`, `fills`, `daily_performance`, `pattern_fires`
- `engine/propfirm/hl/market_feed.py` — HL WS → Redis mid price
- `engine/propfirm/router.py` — `PatternFireRouter`: ScanSignal → pattern_fires + fan-out
- `engine/propfirm/entry.py` — `EntryDecider`: account+fire → ENTRY order
- `engine/propfirm/match.py` — `LimitMatcher`: Paper/Internal limit fill 시뮬
- `engine/propfirm/exit.py` — `ExitMonitor`: TP/SL/TTL → exit order
- `engine/api/routes/propfirm_paper.py` — `/api/propfirm/accounts`, `/api/propfirm/accounts/[id]/pattern-fires`, `/api/propfirm/accounts/[id]/positions`
- `engine/scanner/realtime.py` 끝에 `PatternFireRouter.on_scan_signal(...)` hook
- `app/src/routes/lab/+page.svelte` — 기존 탭 패널에 **"패턴 런"** 탭 추가 (Q-PF-003 확정)
- `app/src/components/lab/PatternRunPanel.svelte` — INTERNAL_RUN 계정 상태 + pattern_fires 피드 + 오픈 포지션
- `app/src/components/lab/EquityCurve.svelte` — 잔고 equity curve (Lab LabChart에 오버레이 마커)

**P1 에서는 INTERNAL_RUN 만 사용**:
- `trading_accounts.account_type = 'INTERNAL_RUN'`, `user_id IS NULL`
- 우리가 admin/CLI 로 run 1~N 개 생성 (label, strategy_id, symbols, exit_policy 지정)
- mode 는 항상 `'INTERNAL_RUN'` (P2 의 AUTO 와 별개 분기)

**불포함 (P2)**

- 회원가입, 결제, 평가 룰 (Profit Goal/MLL/Consistency)
- user_id 필수 계정 (PAPER), 사용자 화면
- Verification, Funded, Payout

## 데이터 모델 (P1)

스키마는 architecture-v1.md §3 참조. P1 에서 사용하는 테이블은 통합 모델 그대로:

- `trading_accounts` (account_type='INTERNAL_RUN', user_id=NULL, label/strategy_id/symbols/exit_policy/sizing_pct 활용)
- `pattern_fires` (ScanSignal 영속화)
- `orders` (source='INTERNAL_RUN', intent ENTRY/EXIT_*, pattern_fire_id FK)
- `positions`
- `fills`
- `daily_performance` (P1 에서는 옵셔널)

P1 셋업 예시:

```sql
INSERT INTO trading_accounts (account_type, mode, label, strategy_id,
                              symbols, sizing_pct, exit_policy,
                              initial_balance, current_equity, status)
VALUES ('INTERNAL_RUN', 'INTERNAL_RUN',
        '2026-04-30 radar-golden-entry BTC/ETH/SOL',
        'wtd.radar-golden-entry-v1',
        ARRAY['BTC','ETH','SOL'],
        0.05,
        '{"tp_bps":30,"sl_bps":20,"ttl_min":60}'::jsonb,
        10000, 10000, 'ACTIVE');
```

## 핵심 로직

### PatternFireRouter (architecture §5)

`engine/scanner/realtime.py` 의 ScanSignal emit 마지막에 호출:

```python
# engine/scanner/realtime.py 끝부분 (신규 hook)
from propfirm.router import PatternFireRouter
_router = PatternFireRouter()

async def _scan_emit(signal: ScanSignal, scan_run_id: str):
    asyncio.create_task(_router.on_scan_signal(signal, scan_run_id))  # fire-and-forget
```

라우터 구현은 architecture-v1.md §5 참조.

### EntryDecider

```python
# engine/propfirm/entry.py
class EntryDecider:
    async def on_fire(self, account, fire_id, sig, cfg):
        if await self._has_open(account.id, sig.symbol): return  # 중복 진입 방지
        size_usd = account.current_equity * account.sizing_pct
        mark = float(await redis.get(f"hl:mid:{sig.symbol}"))
        qty = size_usd / mark
        side = "BUY" if sig.direction.endswith("long") else "SELL"

        order_id = await self._insert_order(
            account_id=account.id, source="INTERNAL_RUN", intent="ENTRY",
            pattern_fire_id=fire_id, coin=sig.symbol, side=side,
            order_type="MARKET", qty=qty
        )
        # account_type 분기
        if account.account_type in ('INTERNAL_RUN', 'PAPER'):
            await self.matcher.fill_market(order_id, sig.symbol, side, qty, size_usd, mark)
        else:  # FUNDED
            await self.live_executor.submit(account, sig.symbol, side, qty, "MARKET")
```

### ExitMonitor

```python
# engine/propfirm/exit.py
# 우선순위: SL > TP > TTL > MLL
class ExitMonitor:
    async def on_tick(self, coin, mark_px):
        for pos in await self._open_positions(coin):
            account = await self._account(pos.account_id)
            policy = account.exit_policy or {}
            bps = self._unrealized_bps(pos, mark_px)
            if bps <= -policy.get("sl_bps", 9999):
                await self._close(pos, mark_px, "EXIT_SL")
            elif bps >= policy.get("tp_bps", 9999):
                await self._close(pos, mark_px, "EXIT_TP")
            elif self._elapsed_min(pos) >= policy.get("ttl_min", 1e9):
                await self._close(pos, mark_px, "EXIT_SL")
            elif self._elapsed_min(pos) >= policy["ttl_min"]:
                await self._close(pos, mark_px, "EXIT_TTL")
```

### Scanner hook

```python
# engine/scanner/realtime.py 끝부분에 추가
async def emit_signal(snap: SignalSnapshot):
    await db.insert_signal_snapshot(snap)
    for run in await active_paper_runs(strategy_id=snap.source):
        if snap.symbol in run.symbols:
            asyncio.create_task(paper_executor.on_signal(run, snap))  # fire-and-forget
```

## Frontend Surface (Q-PF-003 확정: `/lab` 탭)

```
/lab (기존 Challenge Lab)
  ├─ 탭: [챌린지] [런 결과] [리더보드] [패턴 런]  ← 추가
  │
  └─ PatternRunPanel.svelte (새 탭 콘텐츠)
       ├─ 계정 카드: equity / initial_balance / realized_pnl / open_count
       ├─ pattern_fires 피드: 최근 20건 (strategy_id / symbol / direction / filled?)
       └─ 오픈 포지션: symbol / side / entry_px / unrealized_pnl

LabChart (기존) ← chartMarkers 주입으로 진입/청산 포인트 표기
  entry: arrowUp(green) / arrowDown(red)
  exit TP: circle(green), exit SL: circle(red), exit TTL: circle(grey)
```

```svelte
<!-- PatternRunPanel.svelte — 탭 내부 -->
{#each patternFires as f}
  <div class="fire-row">
    <span>{f.strategy_id.replace('wtd.','')}</span>
    <span>{f.symbol} {f.direction}</span>
    <span class:filled={f.order_id}>{f.order_id ? '진입' : '스킵'}</span>
  </div>
{/each}
```

## Work Items (P1)

| W-# | 제목 | Effort |
|---|---|---|
| W-PF-101 | `031_propfirm_p1_core.sql` 통합 스키마 (trading_accounts/orders/positions/fills/pattern_fires) | S |
| W-PF-102 | HL market feed worker (BTC/ETH/SOL → Redis) | M |
| W-PF-103 | PatternFireRouter + scanner hook | M |
| W-PF-104 | EntryDecider + LimitMatcher (시뮬 fill) | M |
| W-PF-105 | ExitMonitor (TP/SL/TTL) | S |
| W-PF-106 | PatternRunPanel (Lab 탭) + EquityCurve 마커 + `/api/propfirm/accounts` | M |

## Exit Criteria (P1)

- [ ] **AC1**: `wtd.radar-golden-entry-v1` 등 P1 전략으로 BTC/ETH/SOL 24시간 연속 실행, fill 누락 0
- [ ] **AC2**: HL mid vs 시뮬 fill 슬리피지 평균 ≤ 5 bps
- [ ] **AC3**: Lab "패턴 런" 탭에 pattern_fires 피드 + 오픈 포지션 렌더링 확인, LabChart 마커 fill 시점 좌표 오차 ≤ 1 캔들
- [ ] **AC4**: equity curve = Σ(realized) + Σ(open unrealized), delta < $0.01
- [ ] **AC5**: ScanSignal → pattern_fires 영속화율 100%, ENTRY 변환율 ≥ 95% (skip 로그 기록)
- [ ] **AC6**: `engine/tests/propfirm/` 신규 테스트 ≥ 12개 PASS, CI green

## Risk Matrix (P1)

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| HL WS 끊김 → mark price stale | 중 | 중 | 30s TTL + reconnect + stale 시 신규 진입 중단 |
| 동일 코인 중복 진입 | 중 | 저 | `has_open(account, coin)` lock |
| SL/TP 동시 충족 | 저 | 저 | 우선순위 고정: SL > TP > TTL |
| scanner hook이 scanner 속도 저하 | 저 | 중 | asyncio.create_task (fire-and-forget) |
| ~~`_derive_strategy_id` 매핑 부재~~ | — | — | ✅ `patterns/scanner._on_entry_signal(transition.pattern_slug)` 직접 사용 |

## Open Questions (P1)

- [x] **Q-PF-001** ✅ `library.py` 53개 패턴 전부. `wtd.{slug}`.
- [x] **Q-PF-002** ✅ exit_policy = PatternRunPanel UI에서 계정 생성 시 사용자 직접 입력.
- [x] **Q-PF-003** ✅ `/lab` "패턴 런" 탭.
- [x] **Q-PF-004** ✅ hook = `patterns/scanner._on_entry_signal(transition)`. slug 직접 사용.

---

# Phase 2 — User Beta

## 목표 (1줄)

베타 사용자가 가입·구독하고 자기 가상 계정에서 MANUAL/ASSISTED/AUTO 모드로 평가에 도전.

## P1 위에 추가하는 것 (additive only — P1 객체 변경 없음)

```
[NEW migration 032_propfirm_p2_eval.sql]
+ users (테이블 신규)
+ subscriptions
+ evaluations
+ verifications
+ risk_events

[NEW columns on existing tables (additive)]
+ trading_accounts.mll_level / max_loss_limit / profit_goal / best_day_realized_pnl /
  total_realized_pnl / trading_days_count / winning_days_count / failed_at /
  failure_code / passed_at  (P2부터 채움)

[NEW account_type & mode 값 (DB 제약 변경 없이 추가)]
+ account_type='PAPER' (user_id NOT NULL 제약은 앱 레이어에서)
+ mode ∈ {MANUAL, AUTO, ASSISTED} (P2)

[NEW code]
+ engine/propfirm/risk_engine.py (MLL/Consistency/ProfitGoal)
+ engine/propfirm/eod.py (UTC 00:00 aggregator)
+ Auth + Stripe + USDC 수동 입금
+ /dashboard /trade /verify 사용자 화면
+ /admin/users /admin/evaluations 관리자
+ 알림 (MLL 근접, Profit Goal 달성, 검증 요청)
```

## P1 → P2 마이그레이션 (v1.1 — 단순)

**별도 데이터 마이그레이션 없음.** P1 의 INTERNAL_RUN row는 그대로 유지.
P2 부터 새로운 PAPER row 가 동일 테이블에 추가되며, EntryDecider/Router 는 mode/account_type 만 보고 분기:

- `account_type='INTERNAL_RUN'` & `mode='INTERNAL_RUN'` → P1 검증 run (지속)
- `account_type='PAPER'` & `mode IN (MANUAL, AUTO, ASSISTED)` → P2 사용자 계정

## Mode 동작 요약

| Mode | 진입 | UI |
|---|---|---|
| INTERNAL_RUN | 신호 fire 즉시 (우리 검증용) | 차트 overlay, EquityCurve |
| MANUAL | 사용자 REST 주문 | 주문 패널 |
| AUTO | 신호 fire 즉시 자동 체결 | 패시브 모니터링 |
| ASSISTED | 신호 fire → 카드 표시 → 사용자 클릭 | 신호 카드 |

## Work Items (P2)

| W-# | 제목 | Effort |
|---|---|---|
| W-PF-201 | Auth + Subscription (Stripe + USDC 수동) | M |
| W-PF-202 | trading_accounts + mode (MANUAL/AUTO/ASSISTED) | M |
| W-PF-203 | Risk engine (MLL/Consistency/ProfitGoal) | M |
| W-PF-204 | EOD aggregator + Trading/Winning days | S |
| W-PF-205 | Dashboard + Trade UI + 신호 카드 (ASSISTED) | L |
| W-PF-206 | Verification + admin 심사 | M |

## Exit Criteria (P2)

- [ ] **AC1**: 결제 → Paper 계정 생성 → 첫 거래까지 5분 이내
- [ ] **AC2**: MLL 위반 시 100ms 이내 OPEN 포지션 전량 청산
- [ ] **AC3**: 평가 PASS 6항목 자동 판정 + 통과 시 Verification 라우팅
- [ ] **AC4**: AUTO fan-out 5계정 동시, 신호당 fill 누락 0
- [ ] **AC5**: 차지백 webhook → 24h 내 계정 freeze
- [ ] **AC6**: 베타 유저 10명 CSAT ≥ 4/5

---

# Phase 3 — Real Hyperliquid Integration

## ⚠️ Entry Gate (v1.1 — 선행 차단 조건)

다음을 **모두 충족하기 전까지 P3 work item (W-PF-301~305) 생성·착수 금지**:

- [ ] **법무-1**: 가상자산이용자보호법 적용 범위 검토 완료 (한국 사용자 대상 여부)
- [ ] **법무-2**: FX마진/유사수신 규제 위배 여부 확인 (수익배분 구조)
- [ ] **법무-3**: 한국 사용자 차단 vs 허용 정책 결정 + IP/KYC 차단 메커니즘
- [ ] **법무-4**: 약관·위험고지 한글 버전 법무 검토 완료
- [ ] **운영-1**: HL master 계정 자기자본 vs 외부 LP 결정 (Q-PF-010)
- [ ] **운영-2**: KYC vendor 선정 또는 수동 운영 절차 lock
- [ ] **운영-3**: payout 운영 SLA 및 관리자 인력 배치 결정

**P2 까지는 영향 없음** (실거래 아니므로 법무 리스크 낮음).

## 목표 (1줄)

Verification 통과자에게 HL sub-account 발급 → 실거래 → Payout 신청/지급.

## P2 위에 추가하는 것

```
[NEW migration 033_propfirm_p3_funded.sql]
+ hl_order_ledger (hl_oid ↔ funded_acct_id)
+ payouts
+ audit_logs

[NEW columns]
+ trading_accounts.hl_subaccount_addr (account_type='FUNDED' 시 NOT NULL)
+ trading_accounts.funded_mode ∈ {STRATEGY_LOCKED, DISCRETIONARY}

[NEW code]
+ engine/propfirm/hl/sub_account.py (sub-account 생성/관리)
+ engine/propfirm/hl/live.py (LiveExecutor — 실거래 발주)
+ engine/propfirm/payout.py (계산 + 워커)
+ Abuse detection 강화 (다계정/카피/봇)
+ KYC 통합 (수동 또는 Sumsub)
+ 약관/위험고지 법무 lock 한글/영문
```

## TradeExecutor 인터페이스 (v1.1)

architecture-v1.md §11.3 참조. P1/P2 의 LimitMatcher 와 P3 의 LiveExecutor 가 동일 Protocol 구현:

```python
class TradeExecutor(Protocol):
    async def submit(self, account, coin, side, qty, order_type, price=None) -> Order: ...
    async def close(self, position) -> Order: ...

# 라우팅:
#   account_type ∈ {INTERNAL_RUN, PAPER} → LimitMatcher (시뮬)
#   account_type == FUNDED                → LiveExecutor (HL 실거래)
```

## Work Items (P3)

| W-# | 제목 | Effort |
|---|---|---|
| W-PF-301 | HL sub-account provisioning | L |
| W-PF-302 | HL Live Executor + ledger | L |
| W-PF-303 | Funded account 활성화 (STRATEGY_LOCKED/DISCRETIONARY) | M |
| W-PF-304 | Payout 계산 + 신청/승인 + 지급 워커 | M |
| W-PF-305 | Abuse detection + KYC + 약관 법무 lock | M |

## Exit Criteria (P3)

- [ ] **AC1**: HL testnet sub-account 자동 생성 + USDC transfer 성공률 100% (10회)
- [ ] **AC2**: live 발주 → 체결 latency p95 ≤ 800ms
- [ ] **AC3**: ledger PnL = HL clearinghouseState PnL, delta < $0.10
- [ ] **AC4**: payout 신청 → 지급 완료 24h 이내 (관리자 승인 후)
- [ ] **AC5**: MLL 위반 → HL reduce-only 청산 + sub-account freeze 자동화
- [ ] **AC6**: 약관/위험고지 법무 검토 완료

## Open Questions (P3)

- [ ] **Q-PF-010**: HL master 계정 자기자본 vs 외부 LP?
- [ ] **Q-PF-011**: Stripe + USDC 둘 다 → KYC 트리거 임계금액?
- [ ] **Q-PF-012**: 한국 사용자 허용 여부 (가상자산이용자보호법 검토 필요)
- [ ] **Q-PF-013**: STRATEGY_LOCKED strategy 변경 정책 (재평가 강제 vs 부분 인정)?

---

## 전체 Work Item 목록

| Phase | W-# | 제목 | Effort | 선행 조건 |
|---|---|---|---|---|
| P1 | W-PF-101 | `031_propfirm_p1_core.sql` 통합 스키마 (pattern_fires 포함) | S | - |
| P1 | W-PF-102 | HL market feed worker | M | - |
| P1 | W-PF-103 | PatternFireRouter + scanner hook | M | 101, 102 |
| P1 | W-PF-104 | EntryDecider + LimitMatcher | M | 103 |
| P1 | W-PF-105 | ExitMonitor (TP/SL/TTL) | S | 104 |
| P1 | W-PF-106 | PaperTradeOverlay + EquityCurve + /api/propfirm | M | 104 |
| P2 | W-PF-201 | Auth + Subscription | M | P1 done |
| P2 | W-PF-202 | trading_accounts + mode | M | 201 |
| P2 | W-PF-203 | Risk engine | M | 202 |
| P2 | W-PF-204 | EOD aggregator | S | 203 |
| P2 | W-PF-205 | Dashboard + Trade UI + ASSISTED | L | 202, 204 |
| P2 | W-PF-206 | Verification + admin 심사 | M | 203 |
| P3 | W-PF-301 | HL sub-account provisioning | L | P2 done |
| P3 | W-PF-302 | HL Live Executor + ledger | L | 301 |
| P3 | W-PF-303 | Funded account 활성화 | M | 302 |
| P3 | W-PF-304 | Payout 계산 + 신청/승인 | M | 303 |
| P3 | W-PF-305 | Abuse + KYC + 법무 lock | M | 303 |

---

## 관련 문서

- [P-01-prd.md](P-01-prd.md) — 제품 요구사항
- [P-02-architecture.md](P-02-architecture.md) — 시스템 아키텍처 + HL 연동
