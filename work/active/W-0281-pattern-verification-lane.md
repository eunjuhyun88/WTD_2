# W-0281 — Pattern Verification Lane (Paper Trading)

> **ID 이력**: 초기 W-0280으로 작성됨 → main에 머지된 `feat(W-0279/W-0280): V-track core loop closure` (commit ce1ed0be) 와 ID 충돌 발견 → **W-0281로 정정** (2026-04-28).

> **상태**: 설계 lock-in only. 구현은 W-0254 H-07/H-08 머지 후.
> **저자**: A066 (relaxed-chatelet worktree, 2026-04-28)
> **부모 문서**: `docs/live/W-0220-product-prd-master.md` § 0.3
> **CHARTER**: `spec/CHARTER.md` §Frozen Pattern Verification Lane 예외 절
> **Base SHA**: 6aeafff9

---

## Goal

WTD 검증 루프를 **사람 판단 (JUDGE/Verdict)** 에서 **시장 판단 (Paper P&L)** 까지 확장한다. 패턴이 "사람이 보기에 좋은가"와 "진짜 시장에서 먹히는가"를 동시에 측정해서, refinement 학습 라벨을 2배로 만든다.

**한 줄 요약**: "그래야 맞는지 알잖아."

---

## Scope

### 포함 (In-Scope)

- `engine/verification/` 신규 모듈 (paper executor, backtest engine, signal card builder)
- `app/routes/paper/` 신규 라우트 (시그널 카드 UI, 백테스트 결과 뷰, paper 포트폴리오)
- 패턴 → entry/exit/stop 변환기 3-mode (수동 / AI 자동 / rule-based archetype)
- 시뮬 체결 (고정 bps 슬리피지 + maker/taker 수수료 모델)
- paper P&L 추적 + 포지션·포트폴리오 뷰
- JUDGE × Paper 신호 비교 라벨 (refinement 학습 입력)

### 비포함 (Out-of-Scope)

- 실자금 주문 / 거래소 API key 보관 / 키 관리 시스템
- `engine/copy_trading/` (Frozen W-0132) 수정·import — **격리 의무**
- N-05 Copy Signal Marketplace 자체 (paper-verified 게이트만 추가, marketplace 본체는 별도 lane)
- 모바일 앱 / 알림 채널 (Telegram bot은 기존 사용)
- 옵션 / 스팟 / 현물 — Day-1은 perp 선물 한 종목 (BTC/USDT, ETH/USDT)

---

## Non-Goals (격리 선언)

| 금지 | 이유 |
|---|---|
| 실자금 주문 처리 | CHARTER §Frozen 위반 — paper는 검증 도구 |
| 거래소 API 키 입력 폼 / DB 저장 | 보안 사고 표면 + Frozen 정신 위반 |
| `engine/copy_trading/` 디렉토리 코드 수정 | W-0132 Frozen lane 격리 |
| 자동 라우팅 (시뮬에서 실자금 promote) | "검증 → 실행" 자동화는 별 lane (Phase 2+) |
| 사용자 간 paper 시그널 공유/구독 | marketplace 본체는 N-05, 여기서는 검증만 |

---

## Exit Criteria

각 phase는 독립 머지 가능. 전체 lane 완성 = 모든 phase 머지.

### Phase 1: Signal Card (`V-PV-01`, `V-PV-02`)
- [ ] `engine/verification/signal_card.py` — PatternObject → SignalCardSpec(entry, exit, stop, size_hint)
- [ ] `POST /verification/signal-card` API
- [ ] `app/routes/paper/signal-card/+page.svelte` — 카드 렌더 + 사용자 entry/exit 편집 UI
- [ ] 단위 테스트: 10 archetype × signal card 변환 확인
- [ ] **KPI**: 시그널 카드 본 사용자 중 entry/exit 직접 정의해본 비율 ≥ 30%

### Phase 2: Backtest Engine (`V-PV-03`)
- [ ] `engine/verification/backtest.py` — corpus seed-search × 과거 hit rate / Sharpe / max DD
- [ ] `POST /verification/backtest` (pattern_id + horizon → 결과 JSON)
- [ ] `app/routes/paper/backtest/+page.svelte` — 결과 차트 + 메트릭
- [ ] **KPI**: 백테스트 hit rate가 corpus seed-search hit rate와 ±5%p 일치

### Phase 3: Paper Execution (`V-PV-04`)
- [ ] `engine/verification/paper_executor.py` — 시뮬 체결 + 슬리피지(10 bps) + 수수료(maker 0.02%/taker 0.05%)
- [ ] `engine/verification/portfolio.py` — 포지션 / P&L 곡선 / 누적 성과
- [ ] `POST /verification/paper/open`, `POST /verification/paper/close` API
- [ ] live 가격 피드 연동 (기존 WS 재사용)
- [ ] `app/routes/paper/portfolio/+page.svelte` — 포지션 / P&L / 히스토리 뷰
- [ ] **KPI**: paper P&L과 JUDGE valid 비율 상관계수 ≥ 0.5

### Phase 4: Mode 비교 (`V-PV-05`, `V-PV-06`)
- [ ] Mode A (수동) / B (AI Sonnet 4.5) / C (rule-based archetype) 변환기
- [ ] 동일 패턴 × 3-mode → P&L 비교 메트릭 export
- [ ] JUDGE × Paper 신호 비교 라벨 → refinement 학습 입력 추가
- [ ] **KPI**: Mode B P&L이 Mode A 대비 -5%p 이내

---

## 신규 lane 등록 (이슈 단위)

| 이슈 ID | 기능 | Effort | 선행 | F-매핑 |
|---|---|---|---|---|
| **V-PV-01** | `engine/verification/` scaffold + paper_executor 인터페이스 | M | W-0254 H-07/H-08 | F-VERIFY-CORE |
| **V-PV-02** | Signal Card UI | M | V-PV-01 | F-VERIFY-P1 |
| **V-PV-03** | Backtest engine | L | V-PV-01 | F-VERIFY-P2 |
| **V-PV-04** | Paper executor + portfolio | L | V-PV-03 | F-VERIFY-P3 |
| **V-PV-05** | Mode A/B/C 변환기 + 비교 메트릭 | L | V-PV-04 | F-VERIFY-P4 |
| **V-PV-06** | JUDGE × Paper 라벨 export → refinement 통합 | M | V-PV-04, F-02 | F-VERIFY-LOOP |

---

## Open Questions (구현 전 결정 필요)

| # | 질문 | 영향 | 권고 |
|---|---|---|---|
| **PV-Q1** | 슬리피지 모델 — 고정 bps vs orderbook depth 시뮬? | V-PV-04 | 고정 10 bps로 시작, depth는 P5 |
| **PV-Q2** | 수수료 — maker/taker 분리 vs 단일 평균? | V-PV-04 | maker 0.02% / taker 0.05% (Bybit 기준) |
| **PV-Q3** | 포지션 사이즈 기본값 — fixed notional vs Kelly vs 사용자 설정? | V-PV-04 | 사용자 설정, 기본 1000 USDT notional |
| **PV-Q4** | Mode 비교 horizon — 7d / 30d / 패턴별? | V-PV-05 | 패턴별 (PatternObject.expected_horizon) |
| **PV-Q5** | JUDGE × Paper 불일치 시 우선순위? | V-PV-06 | 둘 다 라벨 보존, 우선순위 X (학습 차원 추가) |
| **PV-Q6** | live 가격 피드 — 기존 WS 재사용 vs 별 채널? | V-PV-04 | 기존 재사용 (TradeMode WS) |
| **PV-Q7** | paper 포지션 영속화 — Supabase vs SQLite? | V-PV-04 | Supabase (cross-device 필요) |

---

## 검증 루프 통합도

```
[INPUT]    Capture (manual/drag/AI parse)
              ↓
[REFINE]   Refinement (사용자 신호)
              ↓
[VERDICT]  JUDGE 5-cat (사람 라벨, F-02)              ──┐
              ↓                                         │
[VERIFY]   Signal Card → Backtest → Paper Execution     │
              ↓                                         │
[OUTCOME]  Paper P&L (시장 라벨)                      ──┤
                                                        ↓
                                              refinement 학습 라벨 (2 차원)
                                                        ↓
                                              Hill Climbing / LightGBM 입력
                                                        ↓
                                              패턴 정확도 향상 → F-60 gate
```

→ V-PV-06이 닫히는 지점. **paper P&L = 새 학습 라벨** = JUDGE에 의존하지 않는 ground truth.

---

## Risk & Mitigation

| Risk | 영향 | Mitigation |
|---|---|---|
| 사용자가 paper를 실자금처럼 착각 | 신뢰 손실 / 법적 회색지대 | UI 헤더에 "PAPER ONLY" 항상 노출 + 첫 진입 시 onboarding 모달 |
| 슬리피지 모델 비현실 → P&L 부풀림 | KPI 지표 무효화 | Phase 5에서 orderbook depth 시뮬 추가 / 실제 체결 데이터와 backtesting 비교 |
| `engine/copy_trading/` 의존성 sneak in | Frozen 위반 | CI 가드: `import.*copy_trading` grep으로 PR 차단 |
| Paper 데이터로 marketplace 사기 가능 (paper만 좋은 척) | 신뢰 손실 | N-05 marketplace 게이트에 "live 검증 N건 이상" 추가 (별 lane) |
| 3-mode 모두 구현 비용 큼 | 일정 지연 | Phase 1-3 먼저 머지, Mode 비교는 Phase 4로 분리 — 부분 가치 보존 |

---

## 의존성

- **선행**: W-0254 (H-07/H-08 F-60 Gate) 머지 — F-60 게이트가 paper-verified 시그널 진입 조건에 포함됨
- **병행 가능**: V-08 pipeline (별 lane, 충돌 없음)
- **후행**: N-05 Copy Signal Marketplace (paper-verified 게이트 추가만)

---

## References

- 부모 PRD: `docs/live/W-0220-product-prd-master.md` § 0.3
- Canonical PRD: `docs/live/PRD.md` § 5b
- CHARTER 예외: `spec/CHARTER.md` §Frozen Pattern Verification Lane 예외
- 트리거 세션: 2026-04-28 (relaxed-chatelet, A066) — 사용자 메시지 "Minara 같은 페이퍼 트레이딩 넣자 / 그래야 맞는지 알잖아"
- 비교 레퍼런스: Minara Strategy Studio (https://minara.ai/app/trade/strategy-studio) — **자동매매 실행 프로덕트**, WTD verification은 **검증 도구**라는 점에서 본질 다름
