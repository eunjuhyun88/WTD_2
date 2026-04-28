# W-0280 — ADR 번호 자동 감시 + Document Lifecycle Drift Prevention

> Wave: Meta / Tooling | Priority: **P1** | Effort: S (0.5–1일)
> Parent: F-7 메타 자동화 (PRIORITIES.md §F-7) — W-0269 자매 작업
> Status: 📐 DESIGN
> Issue: #544

## Goal

ADR 번호 충돌(같은 번호로 다른 주제 ADR 2건 동시 존재)을 자동 감지·차단한다.
W-0269가 GitHub Issue lifecycle을 강제하듯, 이 작업은 ADR + 일반 numbered docs의
번호 collision을 pre-push hook + CI gate로 영구 차단한다.

## Owner

`engine` (실제로는 도구/CI라 도메인 외 — meta tooling)

## Scope

| 파일 | 역할 | 변경 유형 |
|---|---|---|
| `tools/check_adr_numbering.sh` | ADR 번호 중복 감지 (E-2 패턴 적용) | NEW |
| `tools/check_drift.sh` | E-5 항목 추가: ADR 번호 충돌 검사 | MODIFIED |
| `.githooks/pre-push` | ADR 신규/수정 시 ADR-numbering check 추가 | MODIFIED |
| `.github/workflows/adr-numbering-check.yml` | ADR 변경 시 CI gate | NEW |
| `docs/decisions/README.md` | ADR 작성 규칙 명시 (다음 사용 가능 번호 안내) | NEW or MODIFIED |
| `docs/decisions/ADR-008-f60-near-miss-denom-option-b.md` | **즉시 삭제** (PR #533 stale branch가 PR #530 fix 후 재추가) | DELETED |

## Non-Goals

- ADR 내용 자동 검증 (Status/Date/근거 완결성) — 별도 work item
- 다른 numbered docs (RFC, RUN-####) 검사 — ADR만 우선
- 번호 자동 발번 (스크립트가 다음 번호 추천만, 강제 발번은 Phase 2)
- ADR-008 기존 chartboard ↔ ADR-008-f60 충돌의 *원인 분석* (이건 PR #533 incident 별도 기록)

## Exit Criteria

수치 기준 포함 — 측정 방법 명시.

1. **`tools/check_adr_numbering.sh` 실행** → 현재 ADR 디렉터리에서 중복 0건 검출 (`ADR-008` 2개 → 1개로 수렴 후 측정).
2. **pre-push hook 가드 동작 검증**: 의도적으로 같은 번호로 새 ADR을 staging → push → hook이 exit 1로 차단 + 명확한 에러 메시지 (다음 사용 가능 번호 표시).
3. **CI gate 검증**: 같은 번호 ADR 추가하는 PR → "ADR Numbering Check" workflow가 fail 상태 (skipped 아님). 정상 PR은 pass.
4. **regression 측정**: PR #530 직후~현재까지 ADR-008 중복 발견까지 걸린 시간 (수동 detection latency); fix 후 시뮬레이션 — 같은 시나리오를 재현 시 push 시점에 즉시 차단(latency < 10s).
5. **문서**: `docs/decisions/README.md` 에 다음 ADR 번호 자동 표시 + numbering rule 명문화.

수치 없는 ❌: "ADR 충돌이 잘 차단된다"
수치 포함 ✅: "ADR 디렉터리에서 중복 번호 0건, pre-push hook가 collision PR을 < 10s 안에 reject"

## AI Researcher 리스크

### 훈련 데이터 영향
- ❌ 없음. ADR은 docs/ 영역만, LightGBM Layer C 훈련 데이터 (capture_records, feature_window) 와 분리.

### 통계적 유효성
- 번호 충돌 발생률은 작지만 발생 시 **데이터 무결성** 영향 (참조 깨짐, 검색 ambiguity).
- 표본: 11 ADR 중 1건 collision (PR #528 → PR #530 fix → PR #533 재추가) — 약 9% incident rate.
  자동화 없는 채로 5+ ADR 추가 시 추가 collision 발생 확률 비non-zero.

### 실데이터 검증 시나리오
- 현재 main: `ADR-008-chartboard-single-ws-ownership.md` + `ADR-008-f60-near-miss-denom-option-b.md` + `ADR-011-f60-near-miss-denom-option-b.md`
  → 3개 파일, 그 중 ADR-008-f60 + ADR-011 내용 동일 (ADR-011 = renumbered, ADR-008-f60 = 재추가된 stale dup).
- 시나리오 1: 즉시 ADR-008-f60 삭제 → 중복 해소.
- 시나리오 2: 향후 동일 사건 재발 → pre-push hook가 hash collision 처럼 즉시 reject.
- Edge case: PR이 origin/main의 새 ADR 모르고 동일 번호로 push — fetch 후 비교, fallback fail-safe.

## CTO 설계 결정

### 성능
- ADR 검사: O(N) — 디렉토리 listing + sort + uniq -c. N ~ 12 → < 50ms. 100 ADR 이상으로 늘어나도 < 200ms.
- pre-push hook: 변경된 ADR 파일 있을 때만 실행 (조건부) — 일반 push 영향 0ms.
- CI: 5초 이내 (체크아웃 + listing).

### 안정성
- 폴백: hook fail-safe — 검사 스크립트 자체가 깨졌을 때 경고만 표시하고 push는 차단하지 않음 (단, CI에서 catch).
- 멱등성: 같은 input → 같은 output. 상태 저장 없음.
- E-5 추가: `tools/check_drift.sh` 에 ADR-numbering 항목 추가 → /검증 흐름에 통합.

### 보안
- 외부 의존성 없음. shell + git ls-files만 사용.
- secret 처리 없음.

### 유지보수성
- 계층 준수: `tools/`만 변경, `engine/` `app/` 무관.
- 테스트: `tools/test_check_adr_numbering.sh` — bats 또는 inline assertion (5개 시나리오 — 0/1/2 dup, missing #, gap).
- 롤백: 모두 신규 파일 + 기존 hook 추가 라인. revert 단순.

## Facts (실측, 추측 금지)

```bash
# 현재 ADR 디렉토리 (main 55d102dc 기준, 2026-04-28 04:50)
$ ls docs/decisions/ADR-*.md | wc -l
13

$ ls docs/decisions/ADR-*.md | grep -oE 'ADR-[0-9]{3}' | sort | uniq -c | sort -rn
   2 ADR-008    ← 충돌!
   1 ADR-011
   1 ADR-010
   1 ADR-009
   1 ADR-007
   ... (000~006 각 1개)

# ADR-008 파일 2개 — 다른 주제
ADR-008-chartboard-single-ws-ownership.md       (2026-04-21)
ADR-008-f60-near-miss-denom-option-b.md         (2026-04-28, PR #533이 PR #530 fix 후 재추가)

# ADR-011 — PR #530이 ADR-008-f60를 renumber해서 만든 결과
ADR-011-f60-near-miss-denom-option-b.md         (2026-04-28, PR #530)

# 기존 도구
tools/check_drift.sh   ← E-1~E-4 검사 (W-####, CURRENT.md SHA 등)
tools/check_drift.sh:E-2 패턴 = `ls work/active/ | grep -oE '^W-[0-9]{4}' | sort | uniq -c | awk '$1 > 1'`
                                ↑ 이 패턴을 ADR-#### 으로 그대로 복사하면 됨

# pre-push hook 위치
.githooks/pre-push     ← W-0269가 만든 Closes-#N 검사 hook 존재
```

## Assumptions

- bash 3.2 호환 환경 (macOS 기본). associative array 미사용.
- `git config core.hooksPath .githooks` 설정됨 (W-0269 §Phase 3에서 설치 권장됨).
- gh CLI 사용 가능 (`gh issue/pr` API 호출 안 함, 검사는 로컬 파일만).
- ADR 파일명 규칙: `ADR-NNN-<slug>.md` (3자리 숫자) — 현재 디렉토리 100% 준수.

## Canonical Files

```
tools/check_adr_numbering.sh                                  [NEW]   ADR 번호 중복 감지 + 다음 번호 추천
tools/check_drift.sh                                          [MOD]   E-5 항목 추가 (ADR numbering)
.githooks/pre-push                                            [MOD]   ADR 변경 시 check_adr_numbering 호출
.github/workflows/adr-numbering-check.yml                     [NEW]   CI gate (W-0269의 issue-pr-link.yml 패턴 참고)
docs/decisions/README.md                                      [NEW]   ADR 작성 규칙 + 다음 사용 가능 번호
docs/decisions/ADR-008-f60-near-miss-denom-option-b.md        [DEL]   stale dup 즉시 삭제
work/active/W-0280-adr-numbering-enforcement.md               [NEW]   이 문서
```

## Implementation Phases

### Phase 1 — 즉시 정리 (5분)
- `git rm docs/decisions/ADR-008-f60-near-miss-denom-option-b.md` (PR #533이 만든 stale dup)
- ADR-011만 남아 단일 진실
- 단독 PR (`fix(adr): cleanup ADR-008-f60 stale duplicate`)

### Phase 2 — 가드 도구 구축
- `tools/check_adr_numbering.sh` 작성 (E-2 패턴 차용)
- `tools/check_drift.sh` E-5 추가
- `docs/decisions/README.md` 작성

### Phase 3 — Pre-push hook 통합
- `.githooks/pre-push` 에 ADR 변경 감지 로직 추가
- bats 또는 inline 테스트로 hook 동작 검증

### Phase 4 — CI gate
- `.github/workflows/adr-numbering-check.yml` 작성 (W-0269 issue-pr-link.yml 패턴 차용)
- ADR 추가/수정 PR에 워크플로우 트리거

## Test plan

```bash
# 1. 정리 후 중복 0건 확인
tools/check_adr_numbering.sh
# expected: ✅ 0 duplicates, next: ADR-012

# 2. 의도적 중복 → reject 확인
echo "# ADR-007 dup test" > docs/decisions/ADR-007-dup-test.md
tools/check_adr_numbering.sh
# expected: ❌ ADR-007 has 2 files; FAIL

# 3. pre-push 동작
git add docs/decisions/ADR-007-dup-test.md
git commit -m "test"
git push --dry-run
# expected: hook reject with message

# 4. CI gate (별도 PR 시나리오)
# expected: workflow fails on PR with dup ADR

# 5. drift check 통합
tools/check_drift.sh
# expected: E-5 결과 표시
```

## Refs

- W-0269 (`work/completed/W-0269-issue-lifecycle-auto.md`) — 자매 작업 (issue lifecycle)
- PR #530 (ADR-011 rename) — 이 작업의 trigger
- PR #533 — stale branch가 PR #530 직후 ADR-008-f60 재추가 (incident root cause)
- `tools/check_drift.sh` E-2 — pattern reuse source

## Charter alignment

✅ In-Scope (`spec/CHARTER.md` §F-7 메타 자동화)
✅ Non-Goal 키워드 미해당 (`copy_trading`, `chart_polish`, `memkraft_new`, `multi_agent`, `TradingView_replace`, `leaderboard` 무관)
✅ L3–L7 갭 직접 영향 없음 — 메타 도구이므로 dev velocity 개선

🤖 Designed by A072 — 2026-04-28
