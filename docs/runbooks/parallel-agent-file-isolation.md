# Parallel Agent File Isolation Runbook

> W-1003 | 병렬 에이전트 간 파일 충돌 방지 가이드

## 왜 이 런북이 필요한가

실측 사례 (2026-05-04):
- Agent A (W-0399-p2): `mountIndicatorPanes.ts`, `ChartBoard.svelte` 수정
- Agent B (W-0395): 동일 파일 수정 (다른 API 설계)
- 결과: B 먼저 merge → A rebase 충돌 → 수동 병합 (est. 10k tok 낭비)

**근본 원인**: CURRENT.md 락 테이블이 Work Item 단위만 잠금, 파일 단위 충돌 미감지.

---

## 새 탭 에이전트 시작 체크리스트

### 1. 락 테이블 상태 확인 (30초)

```bash
./tools/file-lock-check.sh
```

출력 예시 (충돌 있음):
```
▶ 현재 락 테이블:
  | W-0399-p2 | clever-wilson | ... | ChartBoard.svelte, mountIndicatorPanes.ts | 🔴 진행중 |

충돌 검사 대상: ChartBoard.svelte
  ❌ CONFLICT: ChartBoard.svelte → 락됨 (Work Item: W-0399-p2, Agent: clever-wilson)
```

**충돌 발견 시**: 해당 Work Item PR 머지 대기 OR 다른 파일로 작업 분리.

### 2. 내 작업 파일 명시적 확인 (30초)

```bash
./tools/file-lock-check.sh MyFile.svelte AnotherFile.ts
```

0 exit = 시작 가능. 1 exit = 대기.

### 3. 락 등록 (작업 시작 즉시)

`work/active/CURRENT.md` 락 테이블에 행 추가:

```markdown
| W-XXXX | {에이전트ID} | {worktree-slug} | {file1.ts, file2.svelte} | 🔴 진행중 |
```

- Files: basename만 (경로 없이)
- 4파일 초과 = Work Item 분해 검토 (≤3 파일 권장)

### 4. 작업 중 충돌 방지

도메인 분리 원칙:

| 도메인 | 경로 | 담당 분리 권장 |
|---|---|---|
| Chart | `app/src/lib/features/chart/**` | Chart 전담 에이전트 |
| Hubs | `app/src/lib/hubs/**` | Hubs 전담 에이전트 |
| Engine | `engine/**` | Engine 전담 에이전트 |
| Shared | `app/src/lib/components/shared/**` | 충돌 위험 — 먼저 락 확인 |
| API Routes | `app/src/routes/api/**` | Work Item당 1 route |

### 5. PR 머지 후 락 해제

PR 머지 완료 시 CURRENT.md 락 테이블에서 내 행 삭제.

```bash
# 확인
./tools/file-lock-check.sh
# 내 행 찾아서 CURRENT.md 편집 후 삭제
```

### 6. 종료 체크 (선택)

```bash
# /닫기 명령 실행 시 자동 호출됨
./tools/file-lock-check.sh  # 내 락이 해제됐는지 확인
```

---

## Work Item 파일 경계 분해 가이드 (D-7008)

**언제**: 계획 파일이 4개 이상일 때 분해 검토.

**원칙**:
- ≤3 파일/Work Item (강제 아님, 가이드라인)
- 순서 의존성 있는 작업 = 직렬 Phase
- 독립적인 작업 = 병렬 Work Item

**예시** (W-0399-p2 올바른 분해):
```
W-0399-p2-A: mountIndicatorPanes.ts (API 설계 — 선행)
W-0399-p2-B: ChartBoard.svelte (A 완료 후 — 직렬)
W-0399-p2-C: IndicatorLibrary.svelte (독립 — 병렬 가능)
```

---

## 충돌 발생 시 해결 순서

1. `git log --oneline origin/main -3` — 누가 먼저 merge했는지 확인
2. `git fetch origin && git rebase origin/main` — 최신 main 기준 rebase
3. 충돌 파일 열어서: **나중에 merge된 쪽(내 변경)이 맞는가? 먼저 merge된 쪽이 맞는가?** 판단
4. 판단 기준: API 설계가 더 완성된 쪽 채택 + NAMING.md 준수 여부
5. 해결 후 `./tools/pre-pr-check.sh` 통과 확인
