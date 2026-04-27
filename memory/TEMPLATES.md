# TEMPLATES.md — WTD MemKraft 페이지 템플릿

## Live Note

```markdown
# {slug} (Live Note)

**Tier:** core
**Source:** {canonical file path}
**Updated:** YYYY-MM-DD

## Current State
- {latest durable fact}

## Decisions
- {decision or policy, if any}

## Next
- {1-3 restartable next actions}
```

## Decision

```markdown
---
tier: core
status: accepted
source: manual
tags: ["domain", "w-xxxx"]
---

# {decision title}

## What
{decision}

## Why
{constraints, alternatives, trade-offs}

## How
{implementation shape and verification}
```

## Incident

```markdown
---
tier: core
severity: medium
source: manual
tags: ["incident", "w-xxxx"]
---

# {incident title}

## Symptoms
- {observable failure}

## Root Cause
{cause}

## Resolution
{fix}

## Prevention
{future guardrail}
```

## Source Rules

- Durable facts need a source path, PR number, commit SHA, CI run, or command output.
- Work intent stays in `work/active/*.md`; MemKraft stores searchable summaries.
- Prefer replacing stale bullets over appending historical noise to live notes.
