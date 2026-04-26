# W-0223 — Wave 1 Execution Design + Checklist-as-Truth Protocol

> **Design-first** (per feedback 2026-04-26). 본 문서가 사용자 검토 + 승인 받은 후 코드/Issue/CI 변경 시작.

## Goal

W-0220 PRD v2.2의 9 NOT BUILT 이슈 중 **Wave 1 (4개 독립 engine 이슈)** 을 4명 에이전트가 즉시 병렬 시작할 수 있는 **운영 골격** 정착.

3가지 산출:
1. **5개 D/Q 결정 lock-in** — 미정 차단 해소
2. **단일 진실(Source of Truth) = `docs/live/W-0220-status-checklist.md`** — 에이전트가 [ ] → [x] 토글
3. **CI 강제 (`.github/workflows/checklist-sync.yml`)** — PR diff에서 체크 토글이 `Closes #N`과 매칭되는지 검증

## Owner

contract

## Primary Change Type

Process / coordination change (코드 영향 최소 — 1 CI workflow + 4 markdown 파일)

## Background

**현 상태 (main: ee2060f9)**:
- `spec/PRIORITIES.md` — **스테일** (P0 = W-0215 ledger durability인데 이미 머지 완료)
- `work/active/CURRENT.md` — 활성 W-0214만 표시, W-0220 PRD v2.2 미반영
- GitHub Issues 4개 등록: #364 F-02, #365 A-03-eng, #366 A-04-eng, #367 D-03-eng
- `docs/live/W-0220-status-checklist.md` — 188항목 카탈로그 BUILT 163 / Partial 2 / Not Built 23
- `docs/live/branch-strategy.md` — 1:1:1:1 + Wave 모델 (A026 작성)
- `spec/CHARTER.md §🤝 Coordination` — Issue assignee mutex 합법화 (PR #361 W-0222)
- `.githooks/pre-commit` — unknown agent 차단 (PR #362 W-0221 F-7)

**갭**:
- D/Q 미정 → 에이전트가 작업 시작해도 결정 lock-in 필요
- PRIORITIES.md ↔ PRD v2.2 ↔ checklist ↔ Issues 사이 **단일 진실 부재**
- 체크리스트 토글이 voluntary → 누락/허위 체크 가능

## Scope

본 PR이 다루는 것 (1 PR로 머지):

| # | 파일 | 변경 |
|---|---|---|
| 1 | `work/active/W-0223-*.md` (this) | NEW — 설계 |
| 2 | `spec/PRIORITIES.md` | MODIFY — W-0220 PRD v2.2 정렬 (Wave 1/2/3 P0/P1/P2 매핑) |
| 3 | `work/active/CURRENT.md` | MODIFY — 활성 W-0220 (PRD) + 4 Wave 1 이슈 노출 |
| 4 | `docs/live/W-0220-status-checklist.md` | MODIFY — D8/Q1/Q3/Q4/Q5 [x] + 권고값 인라인 |
| 5 | `.github/workflows/checklist-sync.yml` | NEW — PR diff invariant 검증 |
| 6 | `docs/live/wave-execution-plan.md` | NEW — Wave 1→2→3 운영 가이드 |
| 7 | Issue #364-#367 (GitHub side) | UPDATE — body에 D/Q 결정 인라인, checklist 항목 링크, 브랜치명 명시 |

## Non-Goals

- Wave 1 4개 이슈 자체의 **구현** — 각 에이전트가 별도 PR로 진행
- W-#### 시스템 폐기 (별도 작업)
- charter 변경 (이번 PR은 정책 변경 없음, 운영 골격만)
- Wave 2/3 구현 (운영 가이드만 작성, 실제 시작은 Wave 1 머지 후)
- AI Parser/Chart Drag/Watch/Verdict 5-cat 코드 직접 수정

## Decisions (lock-in)

권고대로 채택. 변경 사항 있으면 본 문서 검토 시 알려주세요.

| ID | 질문 | 결정 | 영향 |
|---|---|---|---|
| **D8** | 5-cat verdict 즉시 P0? | ✅ **Yes** (P0 라벨) | #364 |
| **Q1** | missed vs too_late 분리? | ✅ **분리** (5종 valid/invalid/missed/too_late/unclear) | #364 enum |
| **Q3** | Chart drag UI: 실제 vs form? | **실제 마우스 드래그** (form은 fallback only) | #366 (engine 영향 X, Wave 2 app 영향) |
| **Q4** | AI Parser 입력: 자유 텍스트 vs 폼? | **자유 텍스트** (telegram refs 4채널 학습됨) | #365 prompt 설계 |
| **Q5** | AI Parser 모델: Sonnet 4.5 vs Haiku? | **Sonnet 4.5** (function calling + JSON schema 강제) | #365 model selection |

D1~D7, D9~D15는 본 PR scope 아님 (별도 PR). 단, Wave 1 작업이 **이들에 의존하지 않음**.

## Architecture — Checklist-as-Truth

### 1:1:1:1 Invariant

```
체크리스트 항목  ⟷  GitHub Issue  ⟷  브랜치  ⟷  PR
   [ ] F-02    ⟷    #364        ⟷  feat/F02-verdict-5cat  ⟷  PR #N (Closes #364)
```

| 1:1 매칭 강제 | 어디서 검증 |
|---|---|
| 체크리스트 항목 ↔ Issue | Issue body에 `Checklist: F-02` 라인 (regex) |
| Issue ↔ 브랜치 | 브랜치 정규식 `feat/{issue-id}-{slug}` (start.sh 기존 enforcement) |
| 브랜치 ↔ PR | PR body에 `Closes #N` (gh CLI 표준) |
| PR ↔ 체크리스트 | **CI workflow**가 PR diff에서 `- [x]` 토글된 항목과 `Closes #N` 매칭 검증 |

### Checklist 토글 규칙

| 누가 | 언제 | 어떻게 |
|---|---|---|
| 에이전트 | PR 마지막 커밋 | `docs/live/W-0220-status-checklist.md` 항목 `- [ ]` → `- [x]` 변경 (commit) |
| **금지** | PR 외부 | `[x]` 수동 편집 거절 (CI workflow가 차단) |
| 사용자 | 수동 | 가능하지만 이력 추적용으로만 (코드 없으면 의미 없음) |

### CI workflow (`.github/workflows/checklist-sync.yml`)

```yaml
name: Checklist Sync Verify

on:
  pull_request:
    paths:
      - 'docs/live/W-0220-status-checklist.md'

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - name: Verify checklist toggles match Closes #N
        run: |
          # 1. PR diff에서 새로 [x] 된 항목의 ID 추출 (예: F-02, A-03-eng)
          # 2. PR body에서 Closes #N 추출
          # 3. 각 #N의 Issue body에서 "Checklist: <ID>" 라인 추출
          # 4. (PR diff IDs) ⊆ (Issue Closes IDs) 검증
          # 매칭 실패 시 exit 1
          ./scripts/verify_checklist_sync.sh
```

상세 검증 스크립트 (Wave 1 실행 후 정밀화 가능, 본 PR은 골격만).

## Wave 시퀀스

### Wave 1 — 4 독립 engine 이슈 (즉시 시작 가능)

이미 등록됨, 본 PR이 D/Q 결정만 반영.

| Issue | Feature | 브랜치 | Effort | 검증 (Exit) |
|---|---|---|---|---|
| **#364** | F-02 Verdict 5-cat | `feat/F02-verdict-5cat` | S | DB enum 5값 + POST /captures/{id}/verdict 200 + 기존 3값 호환 + 통합 테스트 |
| **#365** | A-03-eng AI Parser engine | `feat/A03-ai-parser-engine` | M | POST /patterns/parse → ContextAssembler → Sonnet 4.5 → PatternDraftBody 200 + Validator 재시도 1회 |
| **#366** | A-04-eng Chart Drag engine | `feat/A04-chart-drag-engine` | M | POST /patterns/draft-from-range → 12 features 추출 (test fixture) |
| **#367** | D-03-eng 1-click Watch engine | `feat/D03-watch-engine` | M | POST /captures/{id}/watch → monitoring row idempotent insert |

**충돌 없음** — 4 다른 엔드포인트, 4 다른 모듈, 공통 파일 0.

### Wave 2 — 4 의존 UI (Wave 1 머지 후 시작)

| Issue (등록 예정) | Feature | 선행 머지 |
|---|---|---|
| (TBD) A-03-app | AI Parser UI (자유 텍스트 + Parse + Draft 미리보기) | #365 |
| (TBD) A-04-app | Chart Drag UI (실제 드래그 → 하이라이트 → 확인) | #366 |
| (TBD) D-03-app | 1-click Watch 버튼 (Verdict Inbox 카드) | #367 |
| (TBD) H-07 | F-60 Gate API + UI progress bar | #364 |

→ Wave 1 PR 머지 시점에 등록 (선행 코드 reference 준비 후).

### Wave 3 — P1 (DESIGN_V3.1 / Stats / Telegram bot 등)

`docs/live/wave-execution-plan.md`에 운영 가이드만 작성. Wave 2 진행 중 별도 설계.

## Open Questions

본 PR scope 내에서는 없음. (D/Q 5개 lock-in으로 해결)

향후 결정 필요 (별도 추적):
- D1~D7, D9~D15 — 사용자 lock-in, 별도 PR
- N-05 Marketplace charter 모순 (PRD = Phase 3 Monetize, Charter = Frozen Copy Trading) — Wave 3 직전 별도 ADR

## Decisions Recap (이 work item)

- **D-W-0223-1**: Single source of truth = `docs/live/W-0220-status-checklist.md`. PRIORITIES.md/CURRENT.md는 mirror.
- **D-W-0223-2**: 1:1:1:1 invariant 강제 — PR diff CI 검증.
- **D-W-0223-3**: D8/Q1/Q3/Q4/Q5 권고대로 채택 (사용자 명시 동의 시).
- **D-W-0223-4**: Wave 1 4개는 PR 4개로 분리 (1 issue = 1 PR 원칙).
- **D-W-0223-5**: 본 PR은 운영 골격만, 실제 Wave 1 구현은 4명 에이전트가 별도 PR.

## Next Steps (구현)

1. ✅ 본 설계 문서 작성 (this file) — 검토 대기
2. **사용자 검토 + 승인** ← 여기서 멈춤
3. spec/PRIORITIES.md 갱신 (Wave 1/2/3 P0/P1/P2)
4. work/active/CURRENT.md 동기화 (활성 = W-0220 PRD + 4 Wave 1 이슈)
5. docs/live/W-0220-status-checklist.md D/Q 항목 [x] 처리 + 권고값 인라인
6. `.github/workflows/checklist-sync.yml` 작성 (PR invariant 검증)
7. `docs/live/wave-execution-plan.md` 작성 (Wave 1→2→3 운영 가이드 + 에이전트 부팅 명령)
8. Issue #364-#367 body 업데이트 (D/Q 결정, 체크리스트 항목 링크, 브랜치명 명시)
9. Commit + PR 오픈
10. 사용자 머지 → Wave 1 4명 에이전트 즉시 부팅 가능

## Exit Criteria

- [ ] 본 설계 문서 사용자 승인
- [ ] spec/PRIORITIES.md = W-0220 PRD v2.2 정렬 완료
- [ ] CURRENT.md 활성 = W-0220 + Wave 1 4 이슈
- [ ] 체크리스트 D/Q 5개 [x] 처리
- [ ] checklist-sync workflow 작동 (dummy PR 검증 가능)
- [ ] wave-execution-plan.md 작성
- [ ] Issue #364-#367 body 업데이트 완료
- [ ] PR 머지 + main SHA 갱신
- [ ] mk.log_event 기록

## Handoff Checklist

다음 에이전트 (Wave 1 시작):
- 본 PR 머지된 main에서 `./tools/start.sh` → 활성 4 이슈 표시
- `gh issue list --search "no:assignee"` → unassigned 일감
- `gh issue edit N --add-assignee @me` → mutex 획득
- `git checkout -b feat/F02-...` (또는 본인 ID)
- 작업 → 마지막 커밋에 `docs/live/W-0220-status-checklist.md` 해당 항목 [x] 토글
- PR body에 `Closes #N` + 변경된 체크 항목 명시
- CI checklist-sync 통과 확인

## Risks

| 위험 | 완화 |
|---|---|
| `verify_checklist_sync.sh` 미작성 → CI workflow stub만 | 본 PR에서는 stub OK, Wave 1 진행 중 정밀화 |
| Issue body 업데이트 시 다른 에이전트가 동시 작업 | 사용자 직접 수행 (gh CLI) — 에이전트 간섭 X |
| D/Q 변경 시 본 PR 내용 모두 수정 | 검토 단계에서 명시, 머지 전 확정 |
| 4 에이전트 동시 시작 — 체크리스트 충돌 | 각자 다른 항목만 수정 (line-level merge OK) |

---

# §Per-Issue Detailed Spec

> 각 이슈가 spec 수준이 되도록 본 섹션을 Issue body에 동기화. Issue body가 단일 진실.

## #364 — F-02 Verdict 5-cat (전면 재작성)

### Goal

User가 capture된 패턴에 대해 5-category verdict를 제출할 수 있게 한다. 학습 라벨로 사용.
5값: `valid` / `invalid` / `missed` / `too_late` / `unclear` (Q1 결정: missed/too_late 분리).

### API Contract

```
POST /captures/{capture_id}/verdict
Body: {
  "verdict": "valid" | "invalid" | "missed" | "too_late" | "unclear",
  "note": string (optional, ≤ 500 chars),
  "submitted_at": ISO8601 (optional, 서버 시간 default)
}

Response 200: {
  "capture_id": string,
  "verdict": string,
  "submitted_at": string,
  "previous_verdict": string | null
}

Error 400: invalid verdict value (5값 아님)
Error 404: capture_id 없음
Error 401: auth 실패
Error 409: 이미 제출됨 + override 플래그 없음 (선택)
```

### DB Migration

**없음** (실측 결과: `pattern_outcomes.user_verdict` 컬럼은 `text` 타입 — migration 0014:20). text는 임의 string 허용 → backward compat 자동.

### 실측 발견 — 현재 상태

- `engine/ledger/types.py:54` → `user_verdict: Literal["valid", "invalid", "missed"] | None` (이미 3값)
- `engine/api/routes/captures.py:66` → `VerdictLabel = Literal["valid", "invalid", "missed"]` (Pydantic body type)
- `engine/api/routes/captures.py:436` → POST `/captures/{capture_id}/verdict` 이미 동작 중
- DB는 `text` 컬럼 → 어떤 string이든 저장 가능 (마이그 불필요)

→ **추가 작업: Literal에 `"too_late"`, `"unclear"` 2값만 추가 + 테스트**

### Files Touched

| 파일 | 변경 |
|---|---|
| `engine/ledger/types.py:54` | `user_verdict` Literal 5값으로 확장 |
| `engine/api/routes/captures.py:66` | `VerdictLabel` 5값으로 확장 |
| `engine/tests/test_verdict_5cat.py` (NEW) | 5값 200 + 잘못된 값 422 + 기존 3값 회귀 |
| (DB migration **불필요**) | — |

### Implementation Steps

- [ ] **F-02-1** `engine/ledger/types.py:54` `user_verdict` Literal 5값으로 확장
- [ ] **F-02-2** `engine/api/routes/captures.py:66` `VerdictLabel` Literal 5값으로 확장
- [ ] **F-02-3** 단위 테스트: Pydantic이 5값 허용 + 잘못된 값 422 + 기존 3값 회귀
- [ ] **F-02-4** 통합 테스트: outcome_ready capture → verdict 5값 → 저장 → stats invalidate 확인
- [ ] **F-02-5** Engine CI pass

### Training Pipeline Impact (AI Researcher)

5값 → ML 라벨 매핑 (refinement 단계):
- `valid` → positive (1)
- `invalid` → negative (0)
- `missed` → 학습 제외 (패턴 자체는 valid였지만 user가 못 잡은 경우)
- `too_late` → 학습 제외 또는 weak negative (entry timing 문제)
- `unclear` → 학습 제외 (명확한 라벨 아님)

**현재 LightGBM trainer**는 binary 가정 — `engine/scoring/lightgbm_engine.py` 호출 시 `valid` only positive로 매핑. **본 PR scope 아님**, Wave 3에서 다중 라벨 전략 별도 work item.

### Acceptance Criteria

- [ ] 5값 모두 200 OK + outcome.user_verdict 정확히 저장
- [ ] 6번째 값 (예: `bogus`) → 422 (Pydantic validation) + clear error
- [ ] 기존 `valid` / `invalid` / `missed` 회귀 없음
- [ ] App-side 호출자 변경 없이 서버는 5값 수용 (Wave 2 app에서 UI 추가)
- [ ] DB column이 text이므로 마이그 불필요 — 자동 backward compat

### Edge Cases / Risks

- **재제출 정책**: 동일 capture에 verdict 두 번 → 현재 코드(captures.py:474-478)는 최신만 유지. 변경 없음.
- **DB downstream**: `pattern_outcomes.user_verdict` text → 새 값 저장 OK. 단, 기존 dashboard/stats가 valid/invalid/missed만 가정하는 곳 확인 필요 (Wave 2).
- **Stats engine**: `engine/stats/engine.py`가 verdict 카운트할 때 5값 모두 카운트하는지 확인 (현재 binary 가정 가능성)

### Wave 의존

Wave 1 독립. Wave 2 의존: `H-07` F-60 Gate API (verdict count + accuracy 카운트), `L-04` Verdict Inbox 5-cat 버튼 UI.

---

## #365 — A-03-eng AI Parser engine (보강)

### Goal

자유 텍스트 메모 → PatternDraftBody JSON 변환 엔드포인트. ContextAssembler + Claude Sonnet 4.5 호출.

### API Contract

```
POST /patterns/parse
Body: {
  "text": string (required, 1~5000 chars, Q4: 자유 텍스트),
  "user_id": string (auth에서 추출 가능),
  "context_hints": { "pattern_family"?: string, "symbol"?: string } (optional)
}

Response 200: PatternDraftBody (engine/api/schemas_pattern_draft.py)
{
  "pattern_family": "oi_reversal" | ...,
  "pattern_label": string,
  "phases": [PatternDraftPhaseBody],
  "search_hints": PatternDraftSearchHintsBody,
  "signals_required": [string],
  "signals_preferred": [string],
  "signals_forbidden": [string]
}

Error 400: text 비었음 / 5000 chars 초과
Error 422: Claude 응답이 valid PatternDraftBody 아님 (재시도 2회 후 실패)
Error 500: Claude API 장애
Error 401: auth 실패
```

### Environment

- **API Key**: `ANTHROPIC_API_KEY` (실측: 이미 사용 중 — `engine/branding/kol_style_engine.py`, `engine/wiki/ingest.py`)
- **Model**: `claude-sonnet-4-6` (시스템 prompt 명시 latest. Q5 권고는 4.5+이므로 4-6 OK)
- **SDK Pattern**: `engine/branding/kol_style_engine.py:25-127` 참조 (lazy import + `anthropic.Anthropic(api_key=...)` + plain text fallback)
- **Token Budget**: ~10K input + ~2K output (PatternDraftBody schema 강제)
- **Cost Estimate**: 1 call ≈ $0.03~0.05 (Sonnet pricing)
- **Structured Output**: Anthropic Tool Use API 권장 (function calling으로 PatternDraftBody schema 강제)

### 실측 발견

- `ContextAssembler.for_parser()` **이미 존재** (engine/agents/context.py:189) — 호출만 하면 됨
- `PatternDraftBody` 스키마 **이미 존재** (engine/api/schemas_pattern_draft.py:31)
- `engine/api/routes/patterns.py` 24 routes 등록됨 (`/parse`만 빠짐)

### Files Touched

| 파일 | 변경 |
|---|---|
| `engine/api/routes/patterns.py` | POST `/patterns/parse` 라우트 추가 |
| `engine/agents/claude_client.py` (NEW) | Claude SDK wrapper (kol_style_engine 패턴 따름) |
| `engine/agents/context.py` | (변경 X — `for_parser()` 그대로 사용) |
| `engine/api/schemas_pattern_draft.py` | (변경 X — 스키마 그대로) |
| `engine/tests/test_ai_parser.py` (NEW) | mock Claude 응답 |

### Implementation Steps

- [ ] **A-03-eng-1** `engine/api/routes/patterns.py` POST `/patterns/parse` 라우트
- [ ] **A-03-eng-2** `ContextAssembler.for_parser()` 완성 — 토큰 ~10K 버짓, lazy load
- [ ] **A-03-eng-3** Claude Sonnet 4.5 호출 (`anthropic` SDK), function calling 또는 JSON mode
- [ ] **A-03-eng-4** PatternDraftBody validator + 재시도 (최대 2회, exponential backoff)
- [ ] **A-03-eng-5** Schema 검증 — 누락 필드 시 4xx 명확 메시지
- [ ] **A-03-eng-6** 단위 테스트 — mock Claude 응답 (성공 / 실패 / 형식 오류)
- [ ] **A-03-eng-7** Engine CI pass

### Acceptance Criteria

- [ ] `{"text": "OI가 급등하면서 funding이 양수로 전환..."}` POST → valid PatternDraftBody 200
- [ ] Claude 응답 형식 오류 → 1회 재시도 → 여전히 실패 → 422 + last error
- [ ] 토큰 예산 초과 시 graceful degrade (context 일부 잘림 OK, error 아님)
- [ ] Auth 없이 호출 → 401
- [ ] `ANTHROPIC_API_KEY` 미설정 → 500 + clear log

### Edge Cases / Risks

- **Rate limit**: Claude API rate limit 초과 → 429 → exponential backoff
- **비용**: 사용자 spam 방지 위해 user별 daily quota (Wave 2에서 추가 가능, Wave 1은 무제한)
- **JSON parsing**: Sonnet의 function calling 사용 시 schema 강제 (response_format 권장)
- **PatternFamily enum**: parser가 새 family 만들면? → 기존 enum만 허용 (validator)

### Wave 의존

Wave 1 독립. Wave 2 의존: `A-03-app` UI.

---

## #366 — A-04-eng Chart Drag engine (보강)

### Goal

차트 범위 (symbol + start_ts + end_ts) → 12 features 추출 → PatternDraftBody. 기존 feature_materialization 재사용.

### API Contract

```
POST /patterns/draft-from-range
Body: {
  "symbol": string (e.g. "BTCUSDT", required),
  "start_ts": int (Unix epoch seconds, required),
  "end_ts": int (Unix epoch seconds, required, > start_ts),
  "timeframe": "1m" | "5m" | "15m" | "1h" | "4h" | "1d" (default "15m")
}

Response 200: PatternDraftBody (A-03-eng와 동일)
+ 추가 필드: "extracted_features": { feature_name: value | null }

Error 400: 시간 역순 / 범위 너무 짧음 (< 1 candle)
Error 404: symbol 없음 / 데이터 없음
Error 422: feature 추출 실패 (모든 12개 null)
```

### 12 Features (실측 기존 모듈 매핑)

`engine/features/` 실제 파일: `materialization.py`, `compute.py`, `helpers.py`, `primitives.py`, `canonical_pattern.py`, `columns.py`, `corpus_bridge.py`, `registry.py`.

| # | Feature | Source 모듈 |
|---|---|---|
| 1-4 | oi_change / funding / cvd / liq_volume | `feature_windows` 테이블 (40+ col) via `materialization.py` |
| 5-6 | price / volume | OHLCV via `engine/data_cache/` |
| 7 | btc_corr | rolling correlation — `compute.py` 또는 신규 helper |
| 8-9 | higher_lows / lower_highs | structure analyzer — `primitives.py` 가능 |
| 10 | compression | bb_width / ATR — feature_windows 또는 `compute.py` |
| 11 | smart_money | feature_windows.smart_money_* (있으면) |
| 12 | venue_div | venue divergence — feature_windows 컬럼 |

**누락 시 정책**: feature 못 추출하면 `null`. 4 이상 null이면 422. 이하면 200 + null 유지.

### Files Touched

| 파일 | 변경 |
|---|---|
| `engine/api/routes/patterns.py` | POST `/patterns/draft-from-range` 라우트 추가 |
| `engine/features/range_extractor.py` (NEW) | 범위 → 12 features 추출 함수 (기존 materialization/compute/helpers 호출) |
| `engine/features/materialization.py` | (변경 X — 기존 함수 재사용) |
| `engine/tests/test_chart_drag.py` (NEW) | 범위 → features dict |

### Implementation Steps

- [ ] **A-04-eng-1** POST `/patterns/draft-from-range` 라우트
- [ ] **A-04-eng-2** `engine/features/range_extractor.py` — 12 features 추출 함수
- [ ] **A-04-eng-3** 기존 `feature_windows` materialization 재사용 (compute 호출)
- [ ] **A-04-eng-4** PatternDraftBody 변환 + extracted_features 부착
- [ ] **A-04-eng-5** 단위 테스트 — fixture 범위 → features dict 검증
- [ ] **A-04-eng-6** Engine CI pass

### Acceptance Criteria

- [ ] BTCUSDT 1h range → 12 features 모두 추출 (실제 데이터 있는 fixture)
- [ ] 데이터 없는 symbol → 404
- [ ] 너무 짧은 range (< 1 candle) → 400
- [ ] 부분 추출 (12 중 8개만) → 200 + null 4개

### Edge Cases / Risks

- **Range 길이**: 매우 긴 range (e.g. 30일) → 성능 이슈. 상한 24h or 1000 candles 권장.
- **Timeframe 자동 결정**: range 길이 따라 default 조정 (1m이면 짧은 range만)
- **Race**: feature_windows materialization이 늦으면 (해당 timeframe 미캐시) 즉시 compute → 응답 지연. 비동기 권장.

### Wave 의존

Wave 1 독립. Wave 2 의존: `A-04-app` 실제 드래그 UI (Q3).

---

## #367 — D-03-eng 1-click Watch engine (보강)

### Goal

Verdict Inbox / 검색 결과 카드의 capture를 1-click으로 watch list 추가. Idempotent.

### API Contract

```
POST /captures/{capture_id}/watch
Body: { "expiry_hours": int (optional, default null = 영구) }

Response 200: {
  "capture_id": string,
  "is_watching": true,
  "started_watching_at": ISO8601,
  "expires_at": ISO8601 | null
}

GET /captures?watching=true (필터)
Response 200: { "captures": [CaptureRecord], "next_cursor": string | null }

Error 404: capture_id 없음
Error 401: auth 실패
```

DELETE는 Wave 2/3에서 추가 (Wave 1은 set + filter만). Wave 1 unwatch 필요 시 POST + `is_watching=false` body 사용.

### DB / Schema 결정

**옵션 A**: `engine/capture/store.py`의 capture 테이블에 `is_watching: bool` + `started_watching_at: timestamp` 컬럼 추가
**옵션 B**: 별도 `pattern_watches` 테이블 — `capture_id PK`, `user_id`, `started_at`, `expires_at`

**결정: 옵션 A (capture 테이블 컬럼 추가)** — Wave 1 단순화. multi-user 확장 시 옵션 B로 마이그.

```sql
-- app/db/migrations/0XXX_capture_watching.sql
ALTER TABLE captures ADD COLUMN IF NOT EXISTS is_watching BOOLEAN DEFAULT FALSE;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS started_watching_at TIMESTAMPTZ;
ALTER TABLE captures ADD COLUMN IF NOT EXISTS watch_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_captures_watching ON captures(is_watching) WHERE is_watching = TRUE;
```

### Files Touched

| 파일 | 변경 |
|---|---|
| `engine/api/routes/captures.py` | POST/DELETE `/captures/{id}/watch` + GET filter `?watching=true` |
| `engine/capture/store.py` | `set_watching(capture_id, expiry_hours)` / `unset_watching(capture_id)` / `list_watching(user_id)` |
| `engine/capture/types.py` | CaptureRecord에 watching 필드 추가 |
| `app/db/migrations/0XXX_capture_watching.sql` (NEW) | 컬럼 추가 |
| `engine/tests/test_capture_watch.py` (NEW) | idempotent + filter 테스트 |

### Implementation Steps

- [ ] **D-03-eng-1** Migration 작성 + 적용 검증
- [ ] **D-03-eng-2** `engine/capture/store.py` set/unset/list 메서드 추가
- [ ] **D-03-eng-3** POST `/captures/{id}/watch` — idempotent (이미 watching → 200 OK)
- [ ] **D-03-eng-4** DELETE `/captures/{id}/watch` — idempotent (없으면 204)
- [ ] **D-03-eng-5** GET `/captures?watching=true` 필터 + cursor pagination
- [ ] **D-03-eng-6** 단위 테스트
- [ ] **D-03-eng-7** Engine CI pass

### Acceptance Criteria

- [ ] POST 두 번 호출 → 두 번 모두 200 (중복 에러 없음, started_watching_at 첫 번째만 유지)
- [ ] DELETE 후 GET → watching 목록에서 제외
- [ ] expiry_hours 설정 시 watch_expires_at 정확히 계산
- [ ] (선택) expired watch는 cron job이 자동 unwatch — Wave 2 대상

### Edge Cases / Risks

- **Race condition**: 동시 POST/DELETE → DB row lock 또는 atomic update
- **Expiry 처리**: Wave 1은 만료 자동 unwatch 안 함 (수동 cleanup). Wave 2에서 cron job 추가.
- **Multi-user**: 옵션 A는 단일 유저 가정. 다중 유저면 옵션 B로 마이그 필요 — 본 PR은 단일 유저만.

### Wave 의존

Wave 1 독립. Wave 2 의존: `D-03-app` Watch 버튼 UI.

---

# §Issue Body Template

각 Issue body는 본 §Per-Issue Detailed Spec의 해당 섹션 content로 교체.
+ 상단 metadata block:

```markdown
## Feature ID
{ID}

## Wave / 의존
Wave 1 (독립) | 다음 Wave 2: {next_id}

## 체크리스트 항목
`docs/live/W-0220-status-checklist.md` → {ID}-1 ~ {ID}-N

## Branch
`feat/{ID}-{slug}`

## Spec
{본 W-0223 §Per-Issue Detailed Spec/{ID} 본문 복사}

## Linked
- W-0223 design doc
- D8/Q1 (#364), Q4/Q5 (#365), Q3 (#366), N/A (#367) 결정 적용됨
```
