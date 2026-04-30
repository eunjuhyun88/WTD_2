# Ptrack — PropFirm Platform Track

> Status: 🟡 P1 Design Lock-in / P2–P3 Draft
> Created: 2026-04-30
> Master Issue: [#769](https://github.com/eunjuhyun88/WTD_2/issues/769) — W-PF-100 Master Epic

---

## 한 줄 정의

WTD 패턴 → 가상자금 자동 집행 검증(P1) → 사용자 평가 챌린지(P2) → HL funded + 수익배분(P3)

---

## 설계 문서 (work/design/)

| 문서 | 버전 | 핵심 내용 |
|---|---|---|
| [propfirm-prd-v1.md](../design/propfirm-prd-v1.md) | v1.1 | 제품 정의, Standard Plan ($99/30d, $10K, $3K goal), 4단계 플로우, P3 Entry Gate |
| [propfirm-architecture-v1.md](../design/propfirm-architecture-v1.md) | v1.2 | 데이터 모델, 5컴포넌트 분리, §11 통합 모델 (GAP 4개 해소), WTD 모노레포 구조 정합 (§1/§8/§9) |
| [propfirm-phases-v1.md](../design/propfirm-phases-v1.md) | v1.2 | P1/P2/P3 로드맵, Lab "패턴 런" 탭 확정 (Q-PF-003 closed) |

---

## Phase 현황

```
P1 — Internal Validation (2주)   ← 지금 착수 가능 (Q-PF-001/002/004 답변 후)
P2 — User Beta (4주)             ← P1 AC1~AC6 완료 후
P3 — Funded + Payout (4주+)      ← Entry Gate 7개 PASS 후 (법무 외부 자문 필요)
```

---

## P1 Work Items

| Issue | W-# | 제목 | Effort | 차단 |
|---|---|---|---|---|
| [#770](https://github.com/eunjuhyun88/WTD_2/issues/770) | W-PF-101 | 033_propfirm_p1_core.sql 통합 스키마 | S | — |
| [#771](https://github.com/eunjuhyun88/WTD_2/issues/771) | W-PF-102 | HL market feed worker (BTC/ETH/SOL → Redis) | M | — |
| [#772](https://github.com/eunjuhyun88/WTD_2/issues/772) | W-PF-103 | PatternFireRouter + patterns/scanner hook | M | — (Q-PF-001/004 ✅) |
| [#773](https://github.com/eunjuhyun88/WTD_2/issues/773) | W-PF-104 | EntryDecider + LimitMatcher | M | Q-PF-002 |
| [#774](https://github.com/eunjuhyun88/WTD_2/issues/774) | W-PF-105 | ExitMonitor (TP/SL/TTL) | S | Q-PF-002 |
| [#775](https://github.com/eunjuhyun88/WTD_2/issues/775) | W-PF-106 | PatternRunPanel (Lab "패턴 런" 탭) + EquityCurve | M | — |

**즉시 착수 가능**: W-PF-101 ~ W-PF-106 전부 (Q-PF-001/002/004 ✅ — Open Questions 전부 해소)

---

## Open Questions (P1 착수 전)

- [x] **Q-PF-001** ✅ `library.py` 53개 패턴 전부 지원. `wtd.{slug}` 컨벤션. 사용자 추가 예정.
- [x] **Q-PF-002** ✅ exit_policy는 PatternRunPanel UI에서 계정 생성 시 사용자가 직접 입력. `trading_accounts.exit_policy` JSONB. 코드 하드코딩 없음.
- [x] **Q-PF-004** ✅ hook = `patterns/scanner.py _on_entry_signal(transition)`. `strategy_id = f"wtd.{transition.pattern_slug}"` 직접 사용. 매핑 불필요.

---

## P3 Entry Gate (7개 PASS 시에만 W-PF-301~ 착수)

**법무 4** (외부 자문 필요):
- [ ] 가상자산이용자보호법 적용 범위
- [ ] FX마진/유사수신 규제 위배 여부
- [ ] 한국 사용자 차단 vs 허용 + 메커니즘
- [ ] 약관·위험고지 한글 법무 + 유사수신 자문

**운영 3**:
- [ ] HL sub-account API 권한 + 절차 문서화
- [ ] USDC 지급 운영 매뉴얼 (수동 → 자동)
- [ ] 다계정/카피트레이딩 탐지 베이스라인

---

## Key Decisions (기록)

| ID | 결정 |
|---|---|
| D-PF-001 | trading_accounts 단일 + account_type 분기 (INTERNAL_RUN / PAPER / FUNDED) |
| D-PF-002 | PhaseTransition(entry_phase) → pattern_fires 단일 라인. hook = `patterns/scanner._on_entry_signal()`. ScanSignal 미사용. |
| D-PF-003 | 5컴포넌트 분리: Router / Entry / Match / Exit / Live |
| D-PF-004 | P3 Entry Gate 격상 (법무 미완료 시 P3 착수 불가) |
| D-PF-005 | strategy_id = `wtd.{ledger_record_dirname}` |
| D-PF-006 | P1 Surface = `/lab` "패턴 런" 탭 (Q-PF-003 closed) |
| D-PF-007 | Migration 033(propfirm_p1_core) → 034(p2_eval) → 035(p3_funded) 순차 additive. 031=hypothesis_registry, 032=llm_cost_records (main 선점) |

---

## Charter 상태

- ✅ P1/P2: Paper trading 검증 도구 — In-Scope (PRD v3 §0.3, W-0281 lock-in)
- ⚠️ P3: 실자금 자동매매 Frozen-인접 → **Entry Gate 격리**
- ❌ leaderboard / copy_trading / tournament — Charter Frozen (P2+ 별도 레인)
