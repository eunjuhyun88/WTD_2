---
description: 현재 에이전트 상태 + 모든 활성 lock + 최근 5개 에이전트 한눈에
---

다음을 한 화면에 출력:

1. **내 Agent ID** (`state/current_agent.txt` 또는 `./tools/start.sh --quiet`)
2. **현재 main SHA + 내 브랜치**
3. **활성 file-domain locks** (`spec/CONTRACTS.md`)
4. **최근 5개 에이전트 이력** (각 agent jsonl 마지막 줄)
5. **내 jsonl 최근 3개 이벤트** (있으면)

```bash
echo "=== 나 ==="
cat state/current_agent.txt 2>/dev/null || echo "Agent ID 미발번 — /start 실행"

echo "=== 위치 ==="
echo "main: $(git rev-parse --short origin/main)"
echo "branch: $(git rev-parse --abbrev-ref HEAD)"

echo "=== Active locks ==="
grep -E "^\| A[0-9]+" spec/CONTRACTS.md 2>/dev/null || echo "(none)"

echo "=== 최근 에이전트 5명 ==="
ls -t memory/sessions/agents/*.jsonl 2>/dev/null | head -5 | while read f; do
  aid=$(basename "$f" .jsonl)
  last=$(tail -1 "$f" | jq -r '.event // "?"')
  echo "  $aid — $last"
done

AGENT=$(cat state/current_agent.txt 2>/dev/null)
if [ -n "$AGENT" ] && [ -f "memory/sessions/agents/${AGENT}.jsonl" ]; then
  echo "=== 내 ($AGENT) 이력 (최근 3개) ==="
  tail -3 "memory/sessions/agents/${AGENT}.jsonl" | jq -r '"  [\(.ts)] \(.event)"'
fi
```

이 명령은 read-only — 아무것도 수정하지 않음.
