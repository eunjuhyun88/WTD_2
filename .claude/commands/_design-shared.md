# Design Shared Rules

> 모든 `/설계-{role}` 서브에이전트가 이 파일을 먼저 Read.
> role-specific 슬롯/질문은 `_design-{role}.md`에 있음.

---

## 강제 규칙 (위반 = 반려)

| 항목 | 강제 |
|---|---|
| Step 0 답 | 답 안 받으면 Step 1 진행 거부 (헛돔 방지) |
| 추상어 | role 블랙리스트 검출 → 구체 수치/요소로 재질문 |
| 길이 | role draft ≤ 80줄, 통합 설계 ≤ 200줄, Issue body ≤ 30줄 |
| Frozen | `spec/CHARTER.md` Frozen 항목 진입 → 즉시 중단 보고 |
| 거절 옵션 | Decisions에 거절 옵션 + 거절 이유 명시 |
| 충돌 trade-off | AI 임의 결정 금지 → 무조건 사용자 질문 |
| Exit Criteria | 모든 AC에 수치 또는 `(est.)` / `PR3 실측 후 채움` 명시 |

---

## PR 분해 6원칙 (위반 시 반려)

1. **각 PR 독립 배포 가능** — 이전 PR 없이도 CI green
2. **순서 고정** — shell → data → GTM → 확장
   - PR1: UI 구조만 (mock 허용)
   - PR2: 실 API + migration
   - PR3: GTM/분석 → 1주 후 실측으로 AC 확정
   - PR4+: 실측 후 확장
3. **PR당 파일 ≤ 8개**
4. **AC 수치** — PR1-2는 `(est.)`, PR4+는 `PR3 실측 후 채움`
5. **검증 포인트 1줄** — 각 PR에 "머지 후 알게 되는 것"
6. **목표치 고정 금지** — 배포→측정→조정 루프

---

## Step 흐름 (role 공통)

```
Step 0 캐묻기 (role-specific 4문항)
  ↓ 답 받음 (안 받으면 진행 X)
Step 1 컨텍스트 수집 (이미 parent가 KW grep/gh 수집해서 전달)
  ↓
Step A 초안 (role 슬롯 형식, ≤80줄)
  ↓
Hard constraint 1~3개 export (Round 2용)
  ↓ parent에 draft + constraint 반환
```

단독 호출(`/설계-{role}`)인 경우 추가:
```
Step B 사용자 검토 (y/수정/취소)
  ↓
Step C Issue + 파일 저장
```

---

## Step C — Issue + 파일 저장 (atomic)

```bash
ISSUE_URL=$(gh issue create \
  --title "[Wave-{N}] W-#### — {Title}" \
  --body "## Goal\n{1줄}\n\n## PR 분해\n{PR1/2/3 1줄씩}\n\n## Exit Criteria\n{AC ≤5개}\n\nSee work/active/W-####-{slug}.md" \
  --label "{wave-N},{priority}")
```

- Issue 생성 실패 → 파일 저장 X, 중단
- 성공 → 파일 frontmatter `> Issue: #N` 추가
- map 등록: `tools/work_issue_map.sh add W-#### "$ISSUE_NUM" --status design`
- 보고: 파일 경로 + Issue URL

---

## 호출 조건

- 3+ 파일 / 새 시스템 / 정책 변경 / 인프라 변경 → 필수
- 1파일 수정 → 생략 가능
