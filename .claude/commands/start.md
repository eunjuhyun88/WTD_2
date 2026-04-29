---
description: 세션 시작 — Agent ID 발번 + state + P0 + 직전 handoff
---

```bash
# tools/ 없으면 자동 sync
[ ! -f tools/start.sh ] && {
  git fetch origin main
  git stash push -u -m "auto-sync-$(date +%s)" 2>/dev/null || true
  git merge origin/main --no-edit || { echo "❌ merge conflict — git status 확인"; exit 1; }
  git stash pop 2>/dev/null || true
}
./tools/start.sh
```

시작 후 할 일:
1. Agent ID + 직전 handoff 확인
2. P0 픽업 → `/claim "engine/X"` → 브랜치 생성
3. 작업 완료 → `/닫기` 또는 `/end`

| 증상 | 해결 |
|------|------|
| `tools/start.sh: not found` | 위 auto-sync가 처리 |
| `merge conflict` | `git status` → 수동 resolve → `git commit` |
| `permission denied` | `chmod +x tools/*.sh` |
