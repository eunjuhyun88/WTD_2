# W-0297 — Harness Command Model Tiering (검증/검색 → Haiku)

> Wave: MM (Maintenance) | Priority: P1 | Effort: S (1~2시간)
> Charter: In-Scope (인프라 툴링 — Frozen 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-29 by A078
> Issue: (생성 예정)

---

## Goal

검증/검색 slash commands를 Haiku 모델로 실행해 세션당 토큰 비용 30~50% 절감, 응답속도 개선. 설계 commands(설계.md)는 이미 Opus — 나머지 반복 실행 commands를 tiering 완성.

---

## Scope

- 포함:
  - `.claude/commands/검증.md` — `model: claude-haiku-4-5-20251001` frontmatter 추가
  - `.claude/commands/빠른검증.md` — 동일
  - `.claude/commands/검색.md` — 동일
  - (선택) `.claude/commands/열기.md` — 동일 (단순 조회)
- 파일/모듈: `.claude/commands/*.md` (frontmatter 1줄 추가)
- API surface: 없음

## Non-Goals

- 설계.md, 닫기.md — 이미 Opus/현재 모델 (변경 불필요)
- context:fork 격리 — W-0298로 별도 분리 (이번엔 model만)
- 검증 로직 자체 변경 — tools/verify.py는 그대로

---

## Facts (코드 실측)

```
$ head -5 .claude/commands/설계.md
---
description: CTO + AI Researcher 2-perspective 설계문서 작성 + GitHub Issue 생성
argument-hint: <Feature ID 또는 자연어 주제>
model: claude-opus-4-7
---

$ head -3 .claude/commands/검증.md
---
description: 종합 검증 — 변경 스코프 자동 감지 + 적절한 테스트 실행
# model 없음 → 기본 모델(Sonnet) 사용 중

$ head -3 .claude/commands/빠른검증.md
---
description: 빠른 검증 — pytest + 품질 grep만
# model 없음

$ head -3 .claude/commands/검색.md
---
description: 과거 의미 기록 검색
# model 없음
```

검증/검색은 현재 Sonnet으로 실행 → Haiku로 전환 가능.

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Haiku가 복잡한 검증 판단 오류 | 낮음 | 중 | verify.py가 실제 로직 담당 — 모델은 출력 해석만 |
| frontmatter 파싱 실패 | 매우 낮음 | 낮음 | projects/src/skills/loadSkillsDir.ts가 이미 model 필드 지원 |
| 비용 절감 미미 | 낮음 | 낮음 | 검증은 세션당 평균 3~5회 → Haiku 전환 시 70% 가격 절감 |

### Rollback Plan

frontmatter에서 `model:` 줄 1개 삭제 → 즉시 복원.

### Files Touched

- `.claude/commands/검증.md`: +1줄 (frontmatter)
- `.claude/commands/빠른검증.md`: +1줄
- `.claude/commands/검색.md`: +1줄

---

## AI Researcher 관점

### Data Impact

없음 — 모델 라우팅 변경만. 훈련 데이터/라벨 무영향.

### Statistical Validation

- 검증 Pass/Fail 판정은 verify.py(Python subprocess)가 exit code로 결정
- 모델은 출력 포맷팅/요약만 담당 → Haiku로도 동일 결과

### Failure Modes

- Haiku가 verify.py 출력을 잘못 해석 → 수동 `./tools/verify.py` 직접 실행으로 우회 가능

---

## Decisions

- [D-001] Haiku 선택 (Sonnet 유지 거절: 비용 절감 없음 / Opus 거절: 과잉)
- [D-002] context:fork는 W-0298로 분리 (이번 PR 범위 최소화)

---

## Open Questions

- [ ] [Q-001] 검색.md 외 열기.md도 포함? (단순 조회라 Haiku 적합하나 사용 빈도 낮음)

---

## Implementation Plan

1. `.claude/commands/검증.md` frontmatter에 `model: claude-haiku-4-5-20251001` 추가
2. `.claude/commands/빠른검증.md` 동일
3. `.claude/commands/검색.md` 동일
4. `/검증` 실행해서 정상 동작 확인
5. 커밋 + PR

---

## Exit Criteria

- [ ] AC1: `/검증` 실행 시 로그에 `claude-haiku` 모델 표시
- [ ] AC2: verify.py exit code 0 (PASS) 동일하게 반환
- [ ] AC3: 3개 commands frontmatter에 model 필드 존재 (`grep model .claude/commands/검증.md` ≥1줄)
- [ ] CI green
- [ ] PR merged + CURRENT.md SHA 업데이트

---

## Owner

app (`.claude/commands/` — engine 변경 없음)

---

## Facts

```
$ grep "model:" .claude/commands/*.md
.claude/commands/설계.md:model: claude-opus-4-7   ← 유일하게 model 지정됨
검증/빠른검증/검색: model 필드 없음 → Sonnet 기본 사용 중
```

---

## Assumptions

- Claude Code CLI가 slash command frontmatter `model:` 필드를 파싱 (projects/src/skills/loadSkillsDir.ts 확인됨)
- `claude-haiku-4-5-20251001` 모델 ID 유효 (2026-04-29 기준)

---

## Canonical Files

- `.claude/commands/검증.md`
- `.claude/commands/빠른검증.md`
- `.claude/commands/검색.md`

---

## Next Steps

1. 위 3개 파일 frontmatter에 `model: claude-haiku-4-5-20251001` 추가
2. `/검증` 실행 확인
3. PR 머지

---

## Handoff Checklist

- [ ] `./tools/start.sh` 실행
- [ ] `/claim ".claude/commands/"` 도메인 lock
- [ ] 3개 파일 편집 후 `/검증` 테스트
- [ ] PR merged + CURRENT.md SHA 업데이트
