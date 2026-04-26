# Active Priorities

> 활성 P0/P1/P2만. 총 ≤ 50 lines. 50 lines 넘으면 archive로 이전.
> Charter 정합성: `spec/CHARTER.md` In-Scope 안에 들어가야 함. Non-Goal 진입 금지.
> Wave 전환 조건: 현재 Wave Exit 항목 전체 체크 + Engine CI + App CI green → 다음 Wave 시작.

---

## ✅ Wave 1 — 완료 (PR #370~#373)

F-02 / A-03-eng / A-04-eng / D-03-eng 전부 main.

## ✅ Wave 2 — 완료 (PR #377~#392)

H-07 / A-03-app / A-04-app / D-03-app / H-08 / F-17 / F-30 / L-3 전부 main.

## ✅ Wave 3 — 완료

H-08 / F-30 / F-17 Wave 2 내 병렬 완료.

## P0 — MM Hunter (현재)

| Work Item | Feature | 상태 |
|---|---|---|
| W-0214 | MM Hunter design D1~D8 LOCKED-IN | ✅ main (#396) |
| W-0215 | `pattern_search.py` audit (V-00) | 🟡 다음 — 즉시 시작 가능 |
| W-0216 | `validation/` 모듈 구현 | ⬜ W-0215 완료 후 |

---

## Frozen / Non-Goals (CHARTER §Frozen 참조)

- ❌ Copy Trading (대중형 소셜/카피)
- ❌ Chart UX polish / TradingView feature parity
- ❌ MemKraft / Multi-Agent OS 추가 개발
- ❌ AI 차트 분석 툴 / 범용 스크리너 / 자동매매 실행

## 확정된 결정 (D/Q)

Q1 missed vs too_late: **분리** | Q3 드래그 UI: **실제 드래그** | Q4 Parser 입력: **자유 텍스트** | Q5 Parser 모델: **Sonnet 4.5** | D8 5-cat verdict: **P0 즉시**
D1 Hunter framing(옵션4) | D2 4h horizon | D3 15bps cost | D4 5개측정+48개보존 | D5 Layer A AND B | D6 9주 | D7 전체공개+Glossary | D8 default Wyckoff
