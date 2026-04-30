# PropFirm MVP — Product Requirements Document v1.1

> Status: 🟡 Design Draft
> Created: 2026-04-30 (v1.0) / Revised 2026-04-30 (v1.1)
> Author: ej + Claude
> Related: P-02-architecture.md, P-03-phases.md
> Index: [P-00-master.md](P-00-master.md)
>
> **v1.1 변경점**: 한국 법무 항목을 P3 Entry Gate 로 격상 (§12 참조). 본문 룰 변경 없음.

---

## 1. 제품 한 줄 정의

사용자가 구독료를 내고 가상자금으로 트레이딩 평가를 통과하면, 회사 소유 펀딩 계정 운용 자격을 심사받고, 펀딩 계정에서 발생한 실현수익에 대해 조건 충족 시 수익배분을 신청할 수 있는 플랫폼.

---

## 2. 참고 모델

AceTrader (크립토 Prop Firm): Paper Trading 평가 → Trade Fund 배정 → Profit Split 구조.

핵심 수식:
```
Base Profit = min(Total PnL, Realized PnL)
Original Payout Balance = Base Profit - Safety Net
Adjusted Payout Balance = min(Original Payout Balance, Withdrawable Balance)
Trader Payout = Adjusted Payout Balance × Profit Split
```

---

## 3. MVP 목표 (5가지 검증)

1. 사용자가 구독료를 내고 평가에 참여하는가
2. Paper Trading 룰을 이해하고 계속 거래하는가
3. Profit Goal / MLL / Consistency Rule이 정상 작동하는가
4. 통과자에 대해 수동 검증·계약·펀딩 전환 플로우가 가능한가
5. 펀딩 계정의 수익배분 신청과 지급 심사가 운영 가능한가

---

## 4. MVP에서 만들지 않을 것

| 제외 기능 | 이유 |
|---|---|
| 3단계 대회/토너먼트 | 운영 복잡도 |
| 라이브 스트리밍 결승 | MVP 검증 무관 |
| 완전 자동 KYC | 초기 수동 가능 |
| 완전 자동 payout | 지급 사고 리스크 |
| 다중 플랜 10개 이상 | 룰 복잡도 |
| 모바일 앱 | 웹 MVP 먼저 |
| 카피트레이딩 고급 탐지 AI | 룰 기반으로 시작 |

---

## 5. MVP Standard Plan (단일 플랜)

| 항목 | 값 |
|---|---|
| 구독료 | $99 / 30일 |
| Paper Trading Capital | $10,000 |
| Profit Goal | $3,000 |
| Max Loss Limit (MLL) | $1,000 |
| 최소 거래일 | 5일 |
| Consistency Rule | 최고 수익일 ≤ 전체 수익의 50% |
| 평가 수익 지급 | 없음 |
| Funded Profit Split | 트레이더 80% / 회사 20% |
| 최소 Payout | $100 |
| Winning Days | 5일 |
| Winning Day 기준 | 하루 실현수익 $100 이상 |
| 지급 통화 | USDC |
| 결제수단 | Stripe + USDC 수동 결제 |

---

## 6. 전체 플로우

```
회원가입 → 구독 결제 → Paper 계정 생성 → 거래
→ Profit Goal + MLL + Consistency + Min Trading Days 체크
→ 평가 통과 → 포지션 종료 → Verification Form 제출
→ 관리자 심사 → 펀딩 계정 활성화 → 펀딩 계정 거래
→ Winning Days + Safety Net + Payout 조건 충족
→ 수익배분 신청 → 관리자 승인 → 지급 기록 생성
```

---

## 7. Stage 1 — Paper Trading Evaluation

### 7.1 핵심 원칙

> Paper Trading에서 발생하는 모든 PnL, ROI, 수익률, 랭킹 점수는 평가 목적의 가상 지표이며, 현금 지급·출금권·투자수익 청구권을 부여하지 않습니다.

### 7.2 평가 통과 조건

| 조건 | 값 |
|---|---|
| 시작 가상자금 | $10,000 |
| 목표수익 | +$3,000 (종료 잔고 $13,000 이상) |
| MLL 위반 | 없어야 함 |
| 최소 거래일 | 5일 |
| 최고 수익일 비중 | 총수익의 50% 이하 |
| 미청산 포지션 | 없어야 함 |
| 구독 상태 | Active |

### 7.3 MLL Rule

```
MLL Level = Initial Balance - Max Loss Limit = 10,000 - 1,000 = 9,000

if Current Equity <= 9,000:
    account_status = FAILED (FAIL_MLL)
```

### 7.4 Consistency Rule

```
Consistency Ratio = Best Day Realized Profit / Total Realized Profit
통과: Consistency Ratio <= 50%
```

### 7.5 Trading Day 인정 기준

| 조건 | 인정 |
|---|---|
| 포지션 오픈 | O |
| 포지션 청산 | O |
| 포지션 일부 청산 | O |
| 단순 보유 | X |
| 주문만 넣고 미체결 | X |

### 7.6 평가 실패 코드

| 코드 | 사유 |
|---|---|
| FAIL_MLL | MLL 위반 |
| FAIL_SUB_EXPIRED | 구독 만료 |
| FAIL_UNLISTED_ASSET | 지정 외 자산 거래 |
| FAIL_ABUSE | 시스템 악용 |
| FAIL_MULTI_ACCOUNT | 다계정 |
| FAIL_CHARGEBACK | 결제 취소 |
| FAIL_ADMIN | 관리자 수동 실패 |

### 7.7 평가 통과 후 처리

```
1. "평가 통과 조건 달성" 표시
2. 모든 포지션 청산 요청
3. 거래 중지 안내
4. 자동 검증 실행
5. Verification Form 제출 요청
6. 관리자 리뷰 큐 생성
```

---

## 8. Stage 2 — Verification

### 8.1 Form 항목

필수: 이름, 이메일, 국가, 생년월일, 지갑주소, 거래전략 설명, 자동매매 여부, 카피트레이딩 여부, 타인 계정 운용 여부, 금지국가 거주 여부, 수익배분 구조 이해 동의, Paper 수익 미지급 동의, 펀딩 자금 소유권 회사 보유 동의

### 8.2 Verification 결과 상태

```
REVIEW_PENDING → APPROVED | REJECTED | NEEDS_MORE_INFO | BANNED
```

### 8.3 거절 코드

| 코드 | 설명 |
|---|---|
| REJECT_MULTI_ACCOUNT | 다계정 의심 |
| REJECT_COPY_TRADING | 카피트레이딩 의심 |
| REJECT_KYC_FAIL | 신원 확인 실패 |
| REJECT_PAYMENT_RISK | 결제 위험 |
| REJECT_STRATEGY_RISK | 과도한 몰빵 전략 |
| REJECT_COUNTRY | 서비스 불가 국가 |
| REJECT_ADMIN | 기타 관리자 판단 |

---

## 9. Stage 3 — Funded Account

### 9.1 핵심 문구

> 펀딩 계정은 현금 지급이 아니며, 회사 소유 자금 또는 회사가 지정한 운용 한도에 대한 제한적·철회가능·양도불가 운용 권한입니다.

### 9.2 Funded Account 파라미터

| 항목 | 값 |
|---|---|
| Funded Account Size | $10,000 |
| MLL | $600 (Level = $9,400) |
| Profit Split | 80% |
| 최소 Payout | $100 |
| Winning Days | 5일 |
| Winning Day 기준 | 하루 실현수익 $100 이상 |
| Safety Net | MLL + $200 = $800 |
| 지정 자산 | BTC, ETH, SOL (perp) |
| 최대 레버리지 | 5x |
| 포지션 모드 | One-way, Isolated |

### 9.3 Funded Account 상태

```
FUNDED_PENDING → FUNDED_ACTIVE
→ PAYOUT_REQUESTED → PAYOUT_APPROVED → PAYOUT_REJECTED
→ FUNDED_FAILED | FUNDED_TERMINATED
```

### 9.4 위반 코드

| 코드 | 사유 | 처리 |
|---|---|---|
| BREACH_MLL | MLL 위반 | 계정 종료 |
| BREACH_UNLISTED_ASSET | 비지원 자산 | 계정 종료 |
| BREACH_MULTI_ACCOUNT | 다계정 | 종료 + 지급 보류 |
| BREACH_COPY_TRADING | 카피트레이딩 | 지급 보류 |
| BREACH_ABUSE | 버그/오류 악용 | 영구정지 |

---

## 10. Stage 4 — Payout

### 10.1 원칙

```
Paper Trading Profit → 지급 X (평가 지표만)
Funded Account Realized Profit → 지급 O (조건 충족 시)
```

### 10.2 Payout 신청 조건

| 조건 | 값 |
|---|---|
| Funded Account 상태 | ACTIVE |
| Winning Days | 5일 이상 |
| 각 Winning Day 수익 | $100 이상 |
| 최소 Payout 가능액 | $100 이상 |
| MLL 위반 | 없음 |
| KYC/Verification | 승인 완료 |
| 관리자 승인 | 필요 |

### 10.3 Payout 계산식

```python
base_profit = min(total_pnl, realized_pnl)
original_payout = base_profit - safety_net          # safety_net = 800
adjusted_payout = min(original_payout, withdrawable_balance)
trader_payout = adjusted_payout * 0.80
```

### 10.4 Payout 예시

```
Realized PnL = $2,000
Total PnL = $1,800
Safety Net = $800
Withdrawable Balance = $1,500

Base = min(1,800, 2,000) = 1,800
Original = 1,800 - 800 = 1,000
Adjusted = min(1,000, 1,500) = 1,000
Trader Payout = 1,000 × 80% = $800
```

### 10.5 Payout 보류 코드

| 코드 | 설명 |
|---|---|
| PAYOUT_LOW_WINNING_DAYS | Winning Days 부족 |
| PAYOUT_SAFETY_NET | Safety Net 부족 |
| PAYOUT_WITHDRAWABLE_LOW | Withdrawable 부족 |
| PAYOUT_INVESTIGATION | 이상거래 조사 중 |
| PAYOUT_KYC | KYC 문제 |
| PAYOUT_RULE_BREACH | 룰 위반 |
| PAYOUT_ADMIN_HOLD | 관리자 보류 |

---

## 11. 거래 시스템

### 11.1 지원 주문

| 주문 | Phase 1 | Phase 2+ |
|---|---|---|
| Market Order | O | O |
| Limit Order | O | O |
| Close Position | O | O |
| Stop Loss | - | v1.1 |
| Take Profit | - | v1.1 |

### 11.2 지원 자산

```
BTC-USD, ETH-USD, SOL-USD (Hyperliquid perp)
```

### 11.3 포지션 모드

```
One-way Mode, Isolated Margin, Max Leverage 5x
```

### 11.4 거래 수수료 (시뮬)

```
Fee = Notional Value × 0.05%
```

---

## 12. 법무/컴플라이언스

### 12.1 필수 고지 (모든 Phase)

1. 본 서비스는 투자상품이 아님
2. Paper Trading 수익은 지급 대상이 아님
3. 펀딩 계정은 현금 지급이 아님
4. 펀딩 자금 소유권은 회사에 있음
5. 사용자는 운용 권한만 보유
6. 수익배분은 실현수익 기준
7. 모든 payout은 조건 충족 및 심사 후 지급
8. 룰 위반 시 payout 보류/취소 가능
9. 수익은 보장되지 않음

### 12.2 ⚠️ P3 Entry Gate — 한국 법무 (v1.1)

**P3 (실거래) 착수 전 다음을 모두 통과해야 함**:

- [ ] 가상자산이용자보호법 (2024-07-19 시행) 적용 범위 검토 완료
- [ ] FX마진/유사수신 규제 (금융투자협회 가이드) 위배 여부 확인
- [ ] 한국 사용자 차단 vs 허용 정책 결정 + 차단 메커니즘 (IP/KYC) 구현
- [ ] 약관·위험고지 한글 법무 검토 완료
- [ ] 수익배분 구조의 "유사수신" 해당 여부 법률 자문

**미충족 시 P3 work item (W-PF-301~305) 생성·착수 금지.** P2 까지는 영향 없음 (가상자금만 사용).

상세 운영 게이트는 phases-v1.md §"Phase 3 → ⚠️ Entry Gate" 참조.

---

## 13. MVP 성공 지표

| 지표 | 목표 |
|---|---|
| 가입 → 결제 전환 | 3% 이상 |
| 결제 후 첫 거래 | 70% 이상 |
| 최종 평가 통과율 | 1~5% |
| Verification 승인율 | 50~80% |
| 환불률 | 5% 이하 |
| 차지백률 | 1% 이하 |

---

## 14. 관련 문서

- [P-02-architecture.md](P-02-architecture.md) — 시스템 아키텍처, HL 연동, 데이터 모델
- [P-03-phases.md](P-03-phases.md) — Phase 1/2/3 구현 로드맵
