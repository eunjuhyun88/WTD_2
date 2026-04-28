---
name: W-0097 P0.5/P0/P2/P1 멀티 슬라이스 세션 (2026-04-19)
description: W-0097 로드맵 4개 항목(P0.5 채널패턴 / P0 Verdict Inbox / P2 SYMBOL_CHAIN_MAP / P1 CFTC COT parser) 구현, PR 머지, 946 tests pass.
type: project
---

## 세션 결과

4개 항목 모두 완료, 별도 PR로 main 머지:

| 항목 | PR | 파일 | 테스트 |
|------|-----|------|-------|
| P0.5 whale-accumulation-reversal-v1 | #92 | library.py + live_monitor + 신규 test | 19 new |
| P0 Verdict Inbox | #93 | captures.py + 신규 test | 13 new |
| P2 SYMBOL_CHAIN_MAP + TRUMP/POPCAT + validator | #94 | fetch_okx_smart_money.py + 신규 test | 11 new |
| P1 CFTC COT parser (CME OI) | #95 | fetch_cme_cot.py (신규) + fetch_exchange_oi.py 통합 + 신규 test | 22 new |

+ hotfix commit on main: test_capture_routes.py — `user_verdict` → `verdict` field rename (P0 _VerdictBody 정렬)

**946 tests pass, 4 skipped** (main, 2026-04-19)

## 핵심 기술 결정

1. **브랜치당 1축** — CLAUDE.md atomic-axis 원칙 준수. P0/P0.5/P1/P2 를 한 PR 로 묶지 않음.
2. **CME_OI_ENABLED feature flag** — CFTC Socrata endpoint 가 검증되기 전까지 기본 off, 기존 `cme_oi=0.0` 시맨틱 보존.
3. **SYMBOL_CHAIN_MAP 검증 helper** — import-time assert 대신 `validate_symbol_chain_map()` 로 CI 게이트. 서비스 부팅 실패 대신 CI 실패.
4. **Verdict Inbox = capture-centric** — GET /captures/outcomes + POST /captures/{id}/verdict. `_VerdictBody.verdict` (not `user_verdict`). Returns 409 for missing outcome (not 422).
5. **whale-accumulation PROMOTED_PATTERNS 에 넣지 않음** — 벤치마크 검증 전이므로. live_monitor PHASE_ORDER 만 확장.

## conflict 해결 메모

captures.py merge conflict — main 이 먼저 `label_capture_verdict` (VerdictBody.user_verdict)를 추가했기 때문.
P0 branch 의 `set_capture_verdict` (_VerdictBody.verdict) 로 대체. test_capture_routes.py 4개 테스트도 업데이트.

## 다음 세션 우선순위

1. whale-accumulation 벤치마크 pack (BTC/FARTCOIN 사례) → promote_candidate
2. CME_OI_ENABLED=1 staging 검증 (Socrata 실제 응답 스키마 확인)
3. Verdict Inbox app UI (app/ 측 `/captures/outcomes` 연동)
4. MELANIA/MOODENG/NEIRO 등 meme coin 주소 2차 검증 → SYMBOL_CHAIN_MAP 확장
