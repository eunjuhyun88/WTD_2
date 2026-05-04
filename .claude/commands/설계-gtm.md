---
description: GTM 단독 설계 — 이벤트/메트릭/funnel
argument-hint: <자연어 brief>
---

설계 brief: $ARGUMENTS

## 동작

Sonnet 메인:
1. KW 추출, Frozen 체크
2. 컨텍스트 수집 (KW grep/gh/git)
3. GTM 서브에이전트(Opus) 호출:

```python
Agent(
  description=f"설계-gtm: {KW}",
  subagent_type="general-purpose",
  model="opus",
  prompt=f"""
당신은 GTM 엔지니어 (분석/이벤트/측정).
먼저 Read:
  @.claude/commands/_design-shared.md
  @.claude/commands/_design-gtm.md

## brief
{ARGUMENTS_VERBATIM}

## 컨텍스트
{PRIORITIES} {ISSUES_PRS} {COMMITS} {CODE_GREP}

## 진행 (단독 호출)
1. 두 규칙 파일 Read
2. Step 0 Q1~Q4 → 답 받음 (안 받으면 진행 X)
3. Step A draft (gtm 슬롯, ≤80줄)
4. Step B 사용자 검토
5. y → Step C: Issue + 파일 저장
6. 보고: 파일 경로 + Issue URL
"""
)
```
