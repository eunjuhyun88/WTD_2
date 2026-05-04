---
description: UIUX 단독 설계 — 시각/배치/위계
argument-hint: <자연어 brief>
---

설계 brief: $ARGUMENTS

## 동작

Sonnet 메인 스레드:
1. KW 추출 (≤3 단어), Frozen 체크
2. 컨텍스트 수집 (grep/gh/git, KW 기준)
3. UIUX 서브에이전트(Opus) 호출:

```python
Agent(
  description=f"설계-uiux: {KW}",
  subagent_type="general-purpose",
  model="opus",
  prompt=f"""
당신은 UIUX 디자이너.
먼저 Read:
  @.claude/commands/_design-shared.md
  @.claude/commands/_design-uiux.md

## brief
{ARGUMENTS_VERBATIM}

## 컨텍스트
{PRIORITIES} {ISSUES_PRS} {COMMITS} {CODE_GREP}

## 진행 (단독 호출)
1. 두 규칙 파일 읽기
2. Step 0 캐묻기 (Q1~Q4) → 답 받음 (안 받으면 진행 X)
3. Step A draft (uiux 슬롯, ≤80줄)
4. Step B 사용자 검토 (y/수정/취소)
5. y → Step C: Issue + work/active/W-####-{slug}.md 저장
6. 보고: 파일 경로 + Issue URL
"""
)
```
