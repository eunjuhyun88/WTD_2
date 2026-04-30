# Ptrack: PropFirm MVP — Master

> Issue: [#769](https://github.com/ej-wtd/wtd-v2/issues/769)
> Wave: 5 | Priority: P0 | Effort: XL (P1=M, P2=L, P3=L+legal)
> Status: 🟡 P1 설계 완료 / 구현 대기
> Created: 2026-04-30

---

## 관련 문서

| 파일 | 내용 |
|---|---|
| [P-01-prd.md](P-01-prd.md) | Product Requirements Document v1.1 |
| [P-02-architecture.md](P-02-architecture.md) | System Architecture v1.1 (HL 연동, 데이터 모델) |
| [P-03-phases.md](P-03-phases.md) | 3-Phase Roadmap v1.2 (Work Items + Exit Criteria) |

---

## Phase 상태

| Phase | 목적 | 자금 | 상태 |
|---|---|---|---|
| **P1** | 내부 검증 Loop (INTERNAL_RUN) | 가상 | 🟡 설계 완료 |
| **P2** | 베타 사용자 챌린지 (구독·평가) | 가상 | ⏸ P1 완료 후 |
| **P3** | HL 실거래 + Payout | 실 USDC | 🔴 Entry Gate (법무 7개) 미통과 |

---

## P1 Work Items

| W-# | 제목 | 이슈 | Effort | 상태 |
|---|---|---|---|---|
| W-PF-101 | 031_propfirm_p1_core.sql 통합 스키마 | [#770](https://github.com/ej-wtd/wtd-v2/issues/770) | S | ⏸ |
| W-PF-102 | HL market feed worker (BTC/ETH/SOL → Redis) | [#771](https://github.com/ej-wtd/wtd-v2/issues/771) | M | ⏸ |
| W-PF-103 | PatternFireRouter + scanner hook | [#772](https://github.com/ej-wtd/wtd-v2/issues/772) | M | ⏸ Q-PF-001,004 차단 |
| W-PF-104 | EntryDecider + LimitMatcher (시뮬 fill) | [#773](https://github.com/ej-wtd/wtd-v2/issues/773) | M | ⏸ Q-PF-002 차단 |
| W-PF-105 | ExitMonitor (TP/SL/TTL) | [#774](https://github.com/ej-wtd/wtd-v2/issues/774) | S | ⏸ Q-PF-002 차단 |
| W-PF-106 | PatternRunPanel (Lab "패턴 런" 탭) + EquityCurve | [#775](https://github.com/ej-wtd/wtd-v2/issues/775) | M | ⏸ |

---

## Open Questions (P1 착수 전 답변 필요)

- [ ] **[Q-PF-001]** P1 SUPPORTED_STRATEGIES 목록 — 10개 패턴 중 어떤 것? → 차단: W-PF-103
- [ ] **[Q-PF-002]** exit_policy 기본값 — tp_bps / sl_bps / ttl_min → 차단: W-PF-104, W-PF-105
- [ ] **[Q-PF-004]** blocks_triggered → strategy_id 매핑 룰 → 차단: W-PF-103
- [x] ~~**[Q-PF-003]** Surface 위치~~ → 확정: `/lab` "패턴 런" 탭

---

## P3 Entry Gate (7개 모두 PASS 시에만 W-PF-301~ 착수)

**법무 4**:
- [ ] 가상자산이용자보호법 (2024-07-19 시행) 적용 범위 검토
- [ ] FX마진/유사수신 규제 위배 여부 확인
- [ ] 한국 사용자 차단 vs 허용 정책 결정 + 차단 메커니즘 구현
- [ ] 약관·위험고지 한글 법무 검토 + 유사수신 여부 법률 자문

**운영 3**:
- [ ] HL sub-account API 권한 확인 + 운영 절차 문서화
- [ ] USDC 지급 운영 매뉴얼 (수동 → 자동 단계적)
- [ ] 다계정/카피트레이딩 탐지 룰 베이스라인 설정

---

## Key Decisions

- **[D-PF-001]** trading_accounts 단일 + account_type 분기 (INTERNAL_RUN/PAPER/FUNDED)
- **[D-PF-002]** ScanSignal → pattern_fires 단일 영속화 라인
- **[D-PF-003]** 5컴포넌트 분리: Router / Entry / Match / Exit / Live
- **[D-PF-004]** P3 Entry Gate 격상 (법무 7-checklist)
- **[D-PF-005]** strategy_id = `wtd.{ledger_record_dirname}`
- **[D-PF-006]** P1 Surface = `/lab` "패턴 런" 탭
- **[D-PF-007]** Migration 031 → 032 → 033 순차 additive

---

## Exit Criteria 요약

상세: [P-03-phases.md](P-03-phases.md)

- [ ] P1 AC1~AC6: 24h 연속 실행, slippage ≤ 5 bps, Lab 탭 렌더, equity delta < $0.01, 영속화율 100%, CI green
- [ ] P2 AC1~AC3: 베타 ≥ 10명, 룰 탐지율 100%, 결제 양쪽 정상
- [ ] P3 Entry Gate: 법무 4 + 운영 3 모두 PASS
- [ ] P3 AC: HL funded → 실 USDC payout 1건 성공
