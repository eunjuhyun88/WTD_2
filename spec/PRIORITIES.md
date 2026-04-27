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

---

## 🛤 2-트랙 병렬 실행 (2026-04-27 분리)

> Wave UX 트랙과 MM Hunter 검증 트랙은 **파일 영역 disjoint** → 동시 실행 가능.
> 다른 에이전트는 시작 전 본인이 어느 트랙인지 확인하고 해당 트랙 work item만 픽업.
> 상세: `docs/live/track-separation-2026-04-27.md`

### Track 1 — Wave (Surface UI / Gate / 입구)

| W-# | Feature | Owner | 상태 |
|---|---|---|---|
| W-0241 | H-07-eng F-60 Gate Status API | engine | 다음 즉시 시작 |
| W-0242 | H-07-app F60GateBar UI | app | W-0241 후 |
| W-0243 | Wave 3 Phase 1.1 W-0102 Slice 1+2 | app | 독립, 즉시 시작 |
| W-0244 | SaveSetupModal × DraftFromRangePanel | app | 독립, 즉시 시작 |
| W-0234 | F-3 Telegram → Verdict deep link | app+engine | 별도 |

→ 영역: `app/`, `engine/api/routes/users.py`, `engine/stats/engine.py`

### Track 2 — MM Hunter (Engine Core 검증)

| W-# | Feature | Owner | 상태 |
|---|---|---|---|
| W-0214 | MM Hunter Core Theory v1.3 | contract | ✅ LOCKED-IN (#396) |
| W-0215 | V-00 `pattern_search.py` audit (3283줄) | engine | 다음 즉시 시작 |
| W-0216 | `validation/` 모듈 구현 | engine | W-0215 후 |

→ 영역: `engine/research/`, `engine/validation/`

### 트랙 충돌 방지 룰

- Track 1 작업 → `app/src/components/`, `app/src/routes/api/users/`, `app/src/routes/api/captures/`, `engine/api/routes/users.py`, `engine/stats/engine.py`만
- Track 2 작업 → `engine/research/pattern_search.py`, `engine/validation/`, MM Hunter 도메인만
- 두 트랙 모두 `docs/live/W-0220-status-checklist.md` 토글 가능 (line-level merge OK)
