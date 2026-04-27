# Wave Execution Plan — W-0220 Roadmap

> **Source of truth**: `docs/live/W-0220-status-checklist.md` (체크리스트가 진실)
> **Design**: `work/active/W-0223-wave1-execution-design.md`
> **Updated**: 2026-04-26

---

## 1. 1:1:1:1 Invariant

```
체크리스트 항목   ⟷   GitHub Issue   ⟷   브랜치              ⟷   PR
[F-02]            #364               feat/F02-verdict-5cat    PR (Closes #364)
```

| 매칭 | 검증 위치 |
|---|---|
| 체크리스트 ↔ Issue | Issue body에 `Feature ID`, `Checklist:` 라인 |
| Issue ↔ Branch | 브랜치명 정규식 `feat/{ID}-{slug}` |
| Branch ↔ PR | PR body에 `Closes #N` |
| PR ↔ 체크리스트 | CI workflow `checklist-sync.yml` 자동 검증 |

→ 체크리스트 [ ] → [x] 토글은 **PR diff 에서만**. 외부 수동 편집 금지.

---

## 2. 운영 명령 (에이전트 라이프사이클)

### 부팅
```bash
git checkout main && git pull
./tools/start.sh                                          # Agent ID 발번
gh issue list --search "no:assignee" --state open         # 비어있는 일감
```

### 작업 시작 (mutex 획득)
```bash
gh issue edit N --add-assignee @me                        # mutex
git checkout -b feat/{Feature-ID}-{slug}
```

### 작업 중
- 코드 작성 + 테스트
- 마지막 커밋 직전: `docs/live/W-0220-status-checklist.md` 본인 항목 `- [ ]` → `- [x]`

### PR 오픈
```bash
gh pr create --title "feat({ID}): ..." --body "$(cat <<EOF
## Summary
...

Closes #N

## Checklist
- [x] {ID}-1
- [x] {ID}-2
- ...
EOF
)"
```

### PR 머지 → 자동
- Issue close (Closes #N)
- assignee mutex 해제
- 다른 에이전트가 다음 일감 잡을 수 있음

---

## 3. Wave 시퀀스

### Wave 1 — 4 독립 engine 이슈 (즉시 시작 가능)

| Issue | Feature | Branch | 정밀 spec |
|---|---|---|---|
| **#364** | F-02 Verdict 5-cat | `feat/F02-verdict-5cat` | W-0223 §#364 |
| **#365** | A-03-eng AI Parser engine | `feat/A03-ai-parser-engine` | W-0223 §#365 |
| **#366** | A-04-eng Chart Drag engine | `feat/A04-chart-drag-engine` | W-0223 §#366 |
| **#367** | D-03-eng 1-click Watch engine | `feat/D03-watch-engine` | W-0223 §#367 |

**충돌 없음**: 4 다른 엔드포인트, 4 다른 모듈. 4명 에이전트 동시 시작 가능.

### Wave 2 — UI/Gate (Wave 1 머지 후)

| Feature | 선행 | 등록 시점 |
|---|---|---|
| A-03-app AI Parser UI | #365 머지 | #365 머지 직후 |
| A-04-app Chart Drag UI (실제 드래그, Q3) | #366 머지 | #366 머지 직후 |
| D-03-app 1-click Watch 버튼 | #367 머지 | #367 머지 직후 |
| H-07 F-60 Gate API + UI | #364 머지 | #364 머지 직후 |
| H-08 per-user verdict accuracy | #364 머지 | 선택 |
| F-3 Telegram → Verdict deep link | #364 머지 | 선택 |

### Wave 3 — P2 (별도 설계, Wave 2 진행 중)

- F-30 Ledger 4-table 분리
- F-31 LightGBM Reranker 1차 학습 (verdict 50+)
- F-12 DESIGN_V3.1 features
- F-17 Visualization Intent Router
- F-39 Screener Sprint 2

---

## 4. 결정 lock-in (Wave 1 진입 게이트)

W-0223 PR로 lock-in:

| ID | 결정 | 영향 |
|---|---|---|
| **D8** | 5-cat verdict 즉시 P0 | #364 |
| **Q1** | missed vs too_late **분리** | #364 enum |
| **Q3** | Chart Drag UI **실제 마우스 드래그** (form fallback) | #366 (engine X, Wave 2 app) |
| **Q4** | AI Parser 입력 **자유 텍스트** | #365 |
| **Q5** | Parser 모델 **claude-sonnet-4-6** (function calling) | #365 |

D1~D7, D9~D15는 Wave 1 작업에 영향 없음. 별도 PR로 lock-in.

---

## 5. 안전망 (이미 main에 있음)

- **PR #361 W-0222**: GitHub Issue assignee = mutex (병렬 충돌 차단)
- **PR #362 W-0221**: pre-commit hook (silent agent loss 차단)
- **CHARTER §🤝 Coordination**: Issue/assignee/Project 사용 합법화
- **이번 PR (W-0223)**: checklist invariant CI

---

## 6. FAQ

**Q. 체크리스트 직접 [x] 편집해도 되나?**
A. ❌ — CI workflow가 PR diff에서만 토글 인식. 수동 편집은 다음 PR에서 자동 무효화.

**Q. Wave 2 이슈는 언제 등록?**
A. Wave 1 PR 머지 직후 — 선행 코드 reference 준비 완료 시점.

**Q. 같은 Issue를 두 에이전트가 동시 클릭하면?**
A. GitHub assignee multi-assignee 허용. 보이는 즉시 한쪽이 양보 (`gh issue edit N --remove-assignee`).

**Q. 1시간 이상 stale assignee?**
A. 다른 에이전트가 조정 후 강제 해제 가능 — `docs/runbooks/multi-agent-coordination.md` §4.

**Q. 새 work item이 생기면 W-#### 또 충돌하지 않나?**
A. 단기적으로 W-#### 유지. 장기적으로 Issue 번호로 이전 (별도 ADR 후속).

---

## 7. 2-트랙 분리 (2026-04-27 추가)

본 Wave Execution Plan은 **Track 1 (Wave UX)** 만 다룹니다.
**Track 2 (MM Hunter Engine Core)** 는 별도 트랙으로 분리되어 동시 실행 가능합니다.

### Track 분리 명세

- 상세: `docs/live/track-separation-2026-04-27.md`
- Track 1 영역: `app/`, `engine/api/routes/users.py`, `engine/stats/engine.py`
- Track 2 영역: `engine/research/`, `engine/validation/`
- 두 트랙은 파일 영역 disjoint → 충돌 0

### Wave 트랙 차기 작업 (W-0241~W-0244, 본 PR #430)

| W-# | Feature | Effort |
|---|---|---|
| W-0241 | H-07-eng F-60 Gate Status API | M |
| W-0242 | H-07-app F60GateBar UI | M |
| W-0243 | Wave 3 Phase 1.1 W-0102 Slice 1+2 | S |
| W-0244 | SaveSetupModal × DraftFromRangePanel | S-M |

### MM Hunter 트랙 차기 작업 (W-0215, W-0216)

| W-# | Feature | Effort |
|---|---|---|
| W-0215 | V-00 pattern_search.py audit | L |
| W-0216 validation/ 모듈 | L |

### 충돌 방지

- 에이전트는 트랙 결정 후 **자기 트랙 영역만** 작업
- 트랙 간 파일 변경 금지 (필요시 PR 분리 + 다른 에이전트 할당)
- 두 트랙 모두 `docs/live/W-0220-status-checklist.md`는 토글 가능 (line-level merge OK)
