# W-PF-100-P2 — PropFirm Evaluation Challenge (Sub Work Items W-PF-201~207)

> Wave: 6 | Priority: P0 | Effort: L (총 7 sub PR)
> Charter: In-Scope (Paper trading 검증 도구)
> Issue: #1005
> Master Epic: #769
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Depends on: W-PF-100 P1 완료 (#783 #787 #802), W-0248 (Stripe + x402)

## Goal
사용자가 결제하고 평가 챌린지를 시작해, MLL/Consistency/ProfitGoal/MinTradingDays 룰을 위반 없이 통과하면 `/verify` 페이지에서 PASS 인증서를 받을 수 있다 — 베타 ≥10명, 첫 거래 ≥5명.

## Owner
engine + app

## Sub Work Items (7 PR)

| W-# | 제목 | Effort | 의존 | 목표 AC |
|---|---|---|---|---|
| W-PF-201 | migration 052_propfirm_p2_eval.sql | S | — | 5 테이블 additive |
| W-PF-202 | rules/mll.py + rules/min_days.py + fill hook | M | 201 | 24 시나리오 100% 탐지, P95 ≤50ms |
| W-PF-203 | rules/consistency.py + rules/profit_goal.py | M | 201 | Consistency≤40%, ProfitGoal≥8% 탐지 100% |
| W-PF-204 | evaluation.py 상태기계 | M | 202+203 | 12 전이 케이스 PASS, 200 동시 fill 0 race |
| W-PF-205 | Stripe checkout + webhook (W-0248 재사용) | M | 201 | 결제 성공 → eval ≤5초, webhook 재시도 3회 |
| W-PF-206 | x402 USDC checkout + dual-payment toggle | M | 205 | USDC 결제 → eval 동일 행 생성, tx_hash UNIQUE |
| W-PF-207 | /dashboard /trade /verify SSR + 베타 whitelist | L | 204+206 | 3 라우트 SSR, /verify e2e ≥6 PASS, 베타 ≥10명 |

## Scope

**포함:**
- users / subscriptions / evaluations / verification_runs / rule_violations 5 테이블
- MLL / Consistency / ProfitGoal / MinTradingDays 룰 엔진
- Stripe ($) + x402 USDC 결제 (W-0248 재사용)
- `/dashboard`, `/trade`, `/verify` 라우트 SSR
- 베타 whitelist 기반 모집 ≥10명

**파일:**
- `app/supabase/migrations/052_propfirm_p2_eval.sql` (W-PF-201)
- `engine/propfirm/rules/{mll,consistency,profit_goal,min_days}.py` (202+203)
- `engine/propfirm/evaluation.py` (204)
- `engine/propfirm/cli/reconcile.py` (205)
- `engine/api/routes/propfirm_payment.py` (205+206)
- `app/src/routes/{dashboard,trade,verify}/+page.svelte` (207)
- `app/src/routes/{dashboard,trade,verify}/+page.server.ts` (207)
- `app/src/lib/components/propfirm/{ChallengeStatusCard,RuleViolationsList,VerifyCertCard}.svelte` (207)
- `engine/tests/propfirm/p2/test_rules_*.py` (202+203)
- `engine/tests/propfirm/p2/test_evaluation_state.py` (204)
- `engine/tests/propfirm/p2/test_payment_flow.py` (205+206)
- `app/tests/e2e/propfirm-verify.spec.ts` (207)

## Non-Goals
- Copy trading / Leaderboard (Frozen)
- PDF 인증서 (JSON + signed hash로 충분, PDF는 P3)
- /dashboard SSR 없이 CSR (SEO + 첫 paint 성능)
- Stripe만, x402 P3 이연 (USDC가 PropFirm 핵심 가치)
- P3 Funded Account (Entry Gate 7개 PASS 후)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| MLL 룰 race (동시 fill 2건 임계값 동시 통과) | 중 | High | row-level lock + atomic check-then-update, 200 동시 fill 테스트 |
| Stripe 결제 실패 → eval stuck PENDING | 중 | 중 | webhook 재시도 3회 + manual reconcile CLI |
| x402 USDC double-spend | 저 | High | tx_hash UNIQUE + on-chain 컨펌 ≥2 대기 |
| **한국 유사수신 규제 P2 영향** | 중 | High | **P2 위배 없음**: 결제 = 검증 fee, 수익배분 없음. 약관에 "결제는 검증 fee이며 수익 배분 약속 아님" 명시. 한국 IP 차단/KYC는 P3 Entry Gate로 이연 |
| 베타 ≥10명 미달 | 중 | 중 | discord 5채널 + X 공지 + 사전 컨펌 5명 |
| 상태기계 버그 → 잘못된 PASS | 저 | High | 12 전이 케이스 fixture, append-only verification_runs |

### Dependencies
- W-PF-100 P1 (PR #783 #787 #802): ScanSignal→pattern_fires 파이프라인 완료
- W-0248 (Stripe tier): 결제 기반 코드 재사용

## AI Researcher 관점

### Statistical Validation
- 룰 탐지: 4룰 × 6 시나리오 = 24 fixture, 100% 탐지 (FP=0, FN=0)
- 평가 latency: fill 단위 P95 ≤50ms
- 베타 코호트: 가입 ≥10명, 첫 거래 ≥5명, 24h 내 첫 룰 평가 ≥3명
- 결제 성공률: Stripe ≥95%, x402 USDC ≥90%

## Decisions
- [D-1] migration 052 (051_tv_imports.sql까지 확인, 다음 가용 번호)
- [D-2] 룰 평가 = fill hook (atomic transaction)
- [D-3] verification_runs = append-only (감사 추적)
- [D-4] Stripe (W-PF-205) → x402 (W-PF-206) 순차
- [D-5] 베타 whitelist = subscriptions.beta_invited=true 컬럼
- [D-6] PASS 인증서 = JSON + signed hash (PDF는 P3)
- [D-7] **한국 P2 위배 없음** — P3 Funded 단계에서 IP차단/KYC 발동
- [D-8] /dashboard = challenge 요약, /trade = pattern_fires + positions (no manual order), /verify = PASS 인증서

### 거절 옵션
- migration 1개 통합 (P2+P3) — 거절: P3 entry gate 미통과 시 unused migration 발생
- Stripe만 P2, USDC P3 이연 — 거절: USDC가 PropFirm 핵심 가치, 베타 wallet 친숙도 높음
- 룰 엔진 Postgres trigger — 거절: 디버깅 어렵고 Python 단위 테스트 용이
- PASS 인증서 PDF P2 — 거절: PDF 생성 의존성 추가, JSON hash로 충분

## Open Questions
- [ ] [Q-1] 챌린지 fee 가격대 — $99 / $199 / $299 중 어디?
- [ ] [Q-2] MLL 임계값 — 일일 5% vs 4%
- [ ] [Q-3] Profit Goal — 8% vs 10% (8주 챌린지 기준)
- [ ] [Q-4] 베타 모집 채널 비율 (discord/X/친구)
- [ ] [Q-5] x402 USDC wallet — Coinbase + WalletConnect만? Phantom 추가?

## Exit Criteria
- [ ] AC1: 베타 ≥10명 가입, ≥5명 첫 거래 (24h 내)
- [ ] AC2: 4룰 탐지율 100% (24 시나리오 fixture)
- [ ] AC3: Stripe + x402 결제 ≥1건 정상, 성공 → eval 생성 ≤5초
- [ ] AC4: 상태기계 12 전이 케이스 PASS, 200 동시 fill 0 race
- [ ] AC5: /dashboard /trade /verify SSR, /verify PASS e2e ≥6 PASS
- [ ] AC6: 룰 평가 latency P95 ≤50ms
- [ ] AC7: engine/tests/propfirm/p2/ ≥40 PASS, CI green
- [ ] AC8: 7 sub PR 머지, master epic #769 P2 체크박스 클로즈
- [ ] AC9: 약관 한글 P2 버전 (수익배분 미포함) 게시
- [ ] AC10: CURRENT.md SHA 업데이트

## Next Steps
1. W-PF-201: `app/supabase/migrations/052_propfirm_p2_eval.sql` 작성
2. W-PF-202+203: 4룰 엔진 Python 모듈 + fill hook
3. W-PF-204: evaluation.py 상태기계
4. W-PF-205: Stripe checkout 라우트 (W-0248 재사용)
5. W-PF-206: x402 USDC 라우트
6. W-PF-207: /dashboard /trade /verify 라우트 + 베타 whitelist

## Handoff Checklist
- [ ] migration 052 번호 실측 재확인 (`ls app/supabase/migrations/ | tail -5`)
- [ ] W-0248 Stripe 코드 위치 확인 (`grep -rn "stripe" engine/api/routes/`)
- [ ] pattern_fires 테이블 스키마 (P1 migration 031) 확인
- [ ] 약관 작성 선행 필요 (법무 검토 불필요, 단 수익배분 미포함 명시)
- [ ] W-0401 베타 코호트와 시작일 동기화
