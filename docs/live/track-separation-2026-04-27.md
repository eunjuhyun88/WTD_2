# Track Separation — Wave UX vs MM Hunter (2026-04-27)

> **Status**: Active operating model.
> **Goal**: 2개 다른 도메인을 다른 에이전트가 동시에 진행할 수 있게 명확히 분리.
> **Author**: A036 session (2026-04-27).

## Why this exists

Wave UX 트랙(parser/drag/watch/verdict UI 등)과 MM Hunter 트랙(pattern_search.py validation)은
- 파일 영역 disjoint
- Owner role 다름 (app vs engine)
- 의존성 없음

→ **두 트랙을 동시에 다른 에이전트가 실행해도 충돌 0**.

문서로 명시하지 않으면:
- 새 에이전트가 트랙 모름 → 양쪽 건드림 → 머지 충돌
- W-#### 번호 충돌 (3회 발생, 본 세션에서)
- 작업 우선순위 혼선

## Track 1 — Wave (Surface UI / Gate / Funnel)

### 의도
사용자 입구(parser/drag/watch) + 라벨(verdict) + 게이트(F-60) + 알림(Telegram) → 플라이휠 닫기.

### 현재 P0/P1
| W-# | Feature | Effort | 선행 |
|---|---|---|---|
| **W-0241** | H-07-eng F-60 Gate Status API | M | W-0232 ✅ |
| **W-0242** | H-07-app F60GateBar UI | M | W-0241 |
| **W-0243** | Wave 3 Phase 1.1 W-0102 Slice 1+2 | S | 없음 |
| **W-0244** | SaveSetupModal × DraftFromRangePanel | S-M | A-04-app ✅ |
| **W-0234** | F-3 Telegram → Verdict deep link | M-L | F-02 ✅ |

### 파일 영역 (claim 가능)
- `app/src/components/` (terminal/, peek/, workspace/, dashboard/, modals/)
- `app/src/routes/` (api/users/, api/captures/, api/patterns/, terminal/, dashboard/, verdict/)
- `app/src/lib/api/terminalApi.ts`
- `app/src/lib/stores/chartActionBus.ts` (NEW)
- `engine/api/routes/users.py` (F-60 endpoint만)
- `engine/api/routes/captures.py` (verdict 관련만)
- `engine/stats/engine.py` (compute_f60_status 추가만)
- `engine/notifications/telegram_notifier.py` (W-0234 deep link 추가만)
- `app/db/migrations/02X_*.sql` (Wave 관련 migration만)

### 금지 영역 (다른 트랙 침범)
- ❌ `engine/research/pattern_search.py` (Track 2 V-00)
- ❌ `engine/research/validation/*` (Track 2)
- ❌ MM Hunter 관련 새 파일

### Spec 문서
- `work/active/W-0220-product-prd-master.md` (PRD v2.2)
- `docs/live/wave-execution-plan.md` (Wave 1→2→3 운영)
- `work/active/W-0230-tradingview-grade-viz-design.md` (TradingView-grade)
- `work/active/W-0232-h07-f60-gate-design.md` (H-07 spec)
- `work/active/W-0241~W-0244-*.md` (이번 세션 신규)

---

## Track 2 — MM Hunter (Engine Core 검증)

### 의도
PRD v2.2의 **MM Hunter** 비전. `pattern_search.py` 3283줄 audit + augment-only 정책 + Falsifiable Test로 코어 검증.

### 현재 P0/P1
| W-# | Feature | Effort | 선행 |
|---|---|---|---|
| **W-0214** | MM Hunter Core Theory v1.3 | — | ✅ LOCKED-IN (#396) |
| **W-0215** | V-00 `pattern_search.py` audit | L | W-0214 ✅ |
| **W-0216** | `validation/` 모듈 구현 (Falsifiable Test) | L | W-0215 |

### 파일 영역 (claim 가능)
- `engine/research/pattern_search.py` (audit 대상)
- `engine/research/*` (MM Hunter 관련)
- `engine/research/validation/*` (9 모듈 + 6 테스트 존재 — V-track 통합 검증 영역)
- `engine/tests/test_validation_*.py`
- `docs/design/MM_HUNTER_*.md` (기존 + 추가)
- `work/active/W-0214-mm-hunter-*.md`
- `work/active/W-0215-pattern-search-py-audit.md`
- `work/active/W-0216-verdict-loop.md` (validation/ 매핑)

### 금지 영역 (다른 트랙 침범)
- ❌ `app/src/components/`, `app/src/routes/api/users/`, `app/src/routes/api/captures/`
- ❌ Verdict UI (F-02-app, A-03-app, A-04-app, D-03-app, H-07-app, F-3-app)
- ❌ Wave roadmap 변경

### Spec 문서
- `work/active/W-0214-mm-hunter-core-theory-and-validation.md`
- `work/active/W-0215-pattern-search-py-audit.md`
- `work/active/W-0216-verdict-loop.md`

---

## 공유 영역 (양쪽 트랙 모두 토글 OK)

### `docs/live/W-0220-status-checklist.md`
- 188 항목 체크리스트는 **단일 진실**
- 양쪽 트랙 작업 시 자기 항목만 `[ ]` → `[x]` 토글
- line-level git merge가 자동으로 처리 (서로 다른 줄이면)
- CI invariant (`.github/workflows/checklist-sync.yml`)가 PR ↔ 토글 매칭 검증

### `work/active/CURRENT.md`
- Active work items index
- 각 트랙은 자기 항목만 추가 (table row 단위)

### `memory/sessions/agents/A###.jsonl`
- 각 에이전트 자기 jsonl만 기록
- per-agent 분리 → 충돌 0

---

## 에이전트 부팅 시 트랙 결정 룰

```bash
# 1. 부팅
./tools/start.sh

# 2. 활성 GitHub Issue 또는 work item 확인
gh issue list --search "no:assignee" --state open

# 3. 트랙 결정
#    - W-0241/W-0242/W-0243/W-0244/W-0234 → Track 1 (Wave)
#    - W-0215/W-0216 → Track 2 (MM Hunter)
#    - 그 외 → 본 문서 다시 확인 또는 사용자 확인

# 4. mutex 획득
gh issue edit N --add-assignee @me

# 5. 본인 트랙 spec 문서 읽기
cat work/active/W-####-*.md

# 6. 브랜치 생성
git checkout -b feat/W-####-<slug>

# 7. 작업
```

---

## 충돌 방지 invariant

| 룰 | 적용 위치 |
|---|---|
| 트랙 간 파일 disjoint | 본 문서 §파일 영역 |
| Issue assignee = mutex | PR #361 W-0222 |
| pre-commit unknown-agent gate | PR #362 W-0221 F-7 |
| checklist 토글 ↔ Closes #N invariant | PR #369 W-0223 + `.github/workflows/checklist-sync.yml` |
| W-#### 번호 atomic 보장 | (미해결) — `tools/next_w_id.sh` 도입 검토 중 |

---

## 트랙 전환 룰

- 작업 도중 다른 트랙 영역을 건드려야 하면 → **PR 분리 + 다른 에이전트 할당**
- 하나의 PR에 두 트랙 변경 혼합 금지
- 트랙 변경 결정은 work item 작성 시점에 명시 (Owner 필드)

---

## 진행 시그널

### Track 1 진행 시그널
- F-60 unlock 사용자 수
- Verdict Inbox dismiss rate (verdict 제출률)
- AI Parser modal 사용률
- Chart drag → Save Setup 비율

### Track 2 진행 시그널
- pattern_search.py audit % 진척
- Falsifiable Test 통과율
- Engine CI 안정성 (1488+ tests)

---

## 참조

- `spec/PRIORITIES.md` §2-트랙 병렬 실행
- `spec/CHARTER.md` (Frozen 정책)
- `docs/live/wave-execution-plan.md` (Wave 운영 가이드)
- `work/active/W-0214-mm-hunter-core-theory-and-validation.md` (MM Hunter 디자인)
- `work/active/W-0230-tradingview-grade-viz-design.md` (Wave 시각 시스템)
