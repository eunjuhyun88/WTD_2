---
name: A072 session — PR cleanup + ADR collision detection + W-0280 design
description: A072 세션 (2026-04-28). 충돌 PR #524/#522 정리, backfill+sweep 도구 search bug fix, 5 zombie close, ADR-008 collision 발견 → W-0280 ADR numbering enforcement 설계.
type: project
---

# A072 Session — 2026-04-28

## Shipped (4 PRs merged)

| PR | 내용 | main SHA after |
|---|---|---|
| #530 | `fix(adr): renumber duplicate ADR-008-f60 → ADR-011` | e9c0212f |
| #537 | `chore(W-0272): backfill work-issue-map (20 entries) + fix search false-positive` | 393227e8 |
| #538 | `fix(W-0272): sweep_zombie_issues.sh — search false-positive + W-#### dedupe` | 55d102dc |
| #545 | `chore(W-0280): design — ADR numbering enforcement` | f0a89057 |

## Zombie issues closed (5)

#426 (W-0219 V-03 Ablation), #423 (W-0221 V-08 pipeline), #428 (W-0223 V-05),
#429 (W-0224 V-11), #501 (W-0270 Multi-Agent Theory) — 코드 머지됐지만 PR이 `Closes #N` 누락한 case들.

## Critical Findings (영구 가치)

### 1. Search false-positive 패턴
`gh issue list --search '"W-####"'` 가 issue body의 W-#### 텍스트도 매칭. 예:
issue #521 본문에 "W-0001~W-0268" 문자열 있어 모든 W-#### query가 #521 false-match.

**Fix pattern (영구 적용)**:
```python
gh issue list --search f'{w_id} in:title' --state all --json number,state,title --limit 10
# Then filter by first W-#### in title:
first_widx_re = re.compile(r"W-\d{4}")
for item in results:
    m = first_widx_re.search(item["title"])
    if m and m.group(0) == w_id:
        return item["number"]
```

`tools/_backfill_impl.py` + `tools/sweep_zombie_issues.sh` 양쪽 동일 fix 적용 (PR #537, #538).

### 2. Bash 3.2 호환 dedup
macOS 기본 bash가 `declare -A` 미지원. associative array 대신 space-delimited string:
```bash
seen=""
for x in items; do
  case " $seen " in *" $x "*) continue ;; esac
  seen="$seen $x"
done
```

### 3. ADR 번호 collision 발견
- PR #528 (다른 에이전트)이 ADR-008-chartboard 존재 모르고 ADR-008-f60-near-miss 추가
- PR #530 (내 fix)이 ADR-011로 rename
- PR #533 (다른 에이전트, stale branch)이 PR #530 직후 ADR-008-f60을 **재추가**
- 결과: main에 ADR-008-chartboard + ADR-008-f60 + ADR-011 동시 존재

→ **W-0280 (Issue #544)** ADR numbering enforcement 설계로 영구 차단 작업 등록.
W-0269 (issue lifecycle) 자매 작업: pre-push hook + CI gate.

## main SHA progression

`e95b2522` (start) → `f0a89057` (#545 머지 직후 내 마지막) → `d6c81ad7` (다른 에이전트 #543 머지)

## Next P0 candidates (다음 에이전트 첫 5분)

1. **W-0280 구현** (Issue #544, design PR #545): ADR numbering tools + pre-push hook + CI gate
   - 즉시 cleanup: `docs/decisions/ADR-008-f60-*.md` 삭제 (PR #533 재생성한 stale dup)
2. **W-0259/W-0279 V-track pipeline integration** (engine/research/validation/ wrapper)
3. **W-0272 Phase 2** (git hook 설치 안내 + F-7 ①②③ 잔여)

## Charter alignment

✅ In-Scope (F-7 메타 자동화 + L3-L7 doc lifecycle)
✅ Non-Goals 미해당 (copy_trading/chart_polish/memkraft_new 등 무관)

## Files of lasting value

- `state/work-issue-map.jsonl` — 22 entries (W-0269/W-0272 + 20 backfilled W-0215~W-0275)
- `tools/_backfill_impl.py` — search bug fixed
- `tools/sweep_zombie_issues.sh` — search bug fixed + dedupe
- `work/active/W-0280-adr-numbering-enforcement.md` — 다음 작업 설계

## Lesson

검색 도구 작성 시 **본문 매칭이 의도된 것이 아니면 항상 `in:title` scope + 첫 식별자 owner filter** 적용.
이 패턴은 ADR/W-####/F-#/H-# 등 모든 numbered identifier search에 적용 가능한 일반 원칙.
