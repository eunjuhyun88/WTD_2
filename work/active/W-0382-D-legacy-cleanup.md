# W-0382-D — Phase D: Legacy Route Cleanup (6개 redirect + 정리)

> Parent: W-0382 | Priority: P1
> Status: 🔴 Blocked (W-0382-B + W-0382-C merged 필요)
> Pre-conditions: W-0382-B merged AND W-0382-C merged
> Estimated files: ~20 | Estimated time: 1~2시간

---

## 이 Phase가 하는 일

5-Hub 외 legacy route 6개에 301 redirect를 추가하고 파일을 정리한다.
사용자 bookmark / 외부 링크 보존 (301 permanent redirect).

---

## Pre-conditions Checklist

- [ ] W-0382-B merged
- [ ] W-0382-C merged
- [ ] `git checkout -b feat/W-0382-D-legacy-cleanup` (main 기준)

---

## Route 처분 결정표

| Route | 현재 LOC | 처분 | 목적지 | 이유 |
|---|---|---|---|---|
| `/terminal` | 2003 | 301 redirect | `/cogochi` | 5-Hub 공식 = cogochi |
| `/analyze` | 566 | 301 redirect | `/lab?tab=analyze` | lab 산하 |
| `/scanner` | (확인 필요) | 301 redirect | `/patterns?mode=scan` | patterns 흡수 |
| `/verdict` | (확인 필요) | 301 redirect | `/lab?tab=verdict` | lab 흡수 |
| `/strategies` | (확인 필요) | 301 redirect | `/patterns?tab=strategies` | patterns 흡수 |
| `/benchmark` | (확인 필요) | 301 redirect | `/lab?tab=benchmark` | lab 흡수 |
| `/research` | (하위 다수) | 301 redirect | `/lab?tab=research` | 외부 링크 보존 확정 (Q-4) |
| `/agent` | — | **보존** | — | 내부 도구 |
| `/passport` | — | **보존** | — | 인증 entry |
| `/status` | — | **보존** | — | ops |
| `/healthz`, `/readyz` | — | **보존** | — | infra probe |

---

## Step 1 — Route 실측 (처분 전 확인)

```bash
# 현재 LOC 확인
wc -l app/src/routes/terminal/+page.svelte
wc -l app/src/routes/analyze/+page.svelte 2>/dev/null || echo "없음"
wc -l app/src/routes/scanner/+page.svelte 2>/dev/null || echo "없음"
wc -l app/src/routes/verdict/+page.svelte 2>/dev/null || echo "없음"
wc -l app/src/routes/strategies/+page.svelte 2>/dev/null || echo "없음"
wc -l app/src/routes/benchmark/+page.svelte 2>/dev/null || echo "없음"

# 외부 링크 추적 (analytics, sitemap 등에 있는지)
grep -rn "terminal\|/analyze\|/scanner\|/verdict\|/strategies\|/benchmark" \
     app/src/routes/sitemap.xml app/static/ 2>/dev/null | head -20
```

---

## Step 2 — 301 Redirect 추가

SvelteKit 방식: 각 route의 `+page.server.ts` 에서 redirect.

```bash
# /terminal → /cogochi
cat > app/src/routes/terminal/+page.server.ts << 'EOF'
import { redirect } from '@sveltejs/kit';
export function load() {
  throw redirect(301, '/cogochi');
}
EOF

# /analyze → /lab?tab=analyze
cat > app/src/routes/analyze/+page.server.ts << 'EOF'
import { redirect } from '@sveltejs/kit';
export function load() {
  throw redirect(301, '/lab?tab=analyze');
}
EOF

# /scanner (디렉토리 없으면 생성)
mkdir -p app/src/routes/scanner
cat > app/src/routes/scanner/+page.server.ts << 'EOF'
import { redirect } from '@sveltejs/kit';
export function load() {
  throw redirect(301, '/patterns?mode=scan');
}
EOF

# /verdict
mkdir -p app/src/routes/verdict
cat > app/src/routes/verdict/+page.server.ts << 'EOF'
import { redirect } from '@sveltejs/kit';
export function load() {
  throw redirect(301, '/lab?tab=verdict');
}
EOF

# /strategies
mkdir -p app/src/routes/strategies
cat > app/src/routes/strategies/+page.server.ts << 'EOF'
import { redirect } from '@sveltejs/kit';
export function load() {
  throw redirect(301, '/patterns?tab=strategies');
}
EOF

# /benchmark
mkdir -p app/src/routes/benchmark
cat > app/src/routes/benchmark/+page.server.ts << 'EOF'
import { redirect } from '@sveltejs/kit';
export function load() {
  throw redirect(301, '/lab?tab=benchmark');
}
EOF
```

---

## Step 3 — terminal/+page.svelte 처리

`/terminal` 은 2003 LOC의 실제 라이브 페이지. redirect 추가 후:
- `+page.svelte` 는 **삭제하지 않음** — redirect는 server에서 처리, 기존 파일은 도달하지 않음
- W-0382-A 에서 이미 import 경로가 `lib/hubs/terminal/` 로 업데이트됨
- 추후 별도 cleanup PR에서 삭제 가능 (이 Phase에서는 redirect만)

---

## Step 4 — ESLint Hub Import Rule 추가

```bash
# .eslintrc.cjs 또는 eslint.config.js 에 추가
# (현재 eslint 설정 파일 위치 확인)
ls app/.eslintrc* app/eslint.config* 2>/dev/null
```

추가할 규칙:
```js
// no-restricted-imports: hub 간 직접 import 금지
"no-restricted-imports": ["warn", {  // 처음엔 warn, 수정 후 error로 올리기
  "patterns": [
    {
      "group": ["**/hubs/terminal/**"],
      "importNames": [],
      "message": "terminal hub 직접 import 금지. lib/hubs/terminal/index.ts 경유 또는 shared/ 사용."
    },
    {
      "group": ["**/hubs/dashboard/**"],
      "message": "dashboard hub 직접 import 금지."
    },
    {
      "group": ["**/hubs/patterns/**"],
      "message": "patterns hub 직접 import 금지."
    },
    {
      "group": ["**/hubs/lab/**"],
      "message": "lab hub 직접 import 금지."
    },
    {
      "group": ["**/hubs/settings/**"],
      "message": "settings hub 직접 import 금지."
    }
  ]
}]
```

**주의**: rule 추가 후 기존 위반 수 확인:
```bash
cd app && pnpm lint 2>&1 | grep "no-restricted-imports" | wc -l
```
위반이 많으면 W-0382-D에서 전부 수정하지 말고 후속 Phase에서 처리.
이 Phase에서는 rule 추가 + 숫자 보고만.

---

## Step 5 — Sitemap 업데이트

```bash
# sitemap에서 redirect 대상 URL 제거/교체
grep -n "terminal\|/analyze\|/scanner\|/verdict\|/strategies\|/benchmark" \
     app/src/routes/sitemap.xml 2>/dev/null
# 발견된 항목을 /cogochi, /patterns, /lab 으로 교체
```

---

## Verification Commands

```bash
# 1. 301 redirect 동작 확인 (dev server 실행 중)
curl -I http://localhost:5173/terminal  | grep "301\|Location"
# Location: /cogochi

curl -I http://localhost:5173/analyze   | grep "301\|Location"
# Location: /lab?tab=analyze

curl -I http://localhost:5173/scanner   | grep "301\|Location"
# Location: /patterns?mode=scan

# 2. svelte-check
cd app && pnpm svelte-check 2>&1 | grep "^Error" | wc -l
# 결과: 0

# 3. ESLint rule 위반 수 보고 (warn 모드)
cd app && pnpm lint 2>&1 | grep "no-restricted-imports" | wc -l
```

---

## Commit & PR

```bash
git add app/src/routes/ app/.eslintrc* app/eslint.config* app/src/routes/sitemap.xml

git commit -m "refactor(W-0382-D): legacy route redirects + hub import ESLint rule

- /terminal → 301 /cogochi
- /analyze  → 301 /lab?tab=analyze
- /scanner  → 301 /patterns?mode=scan
- /verdict  → 301 /lab?tab=verdict
- /strategies → 301 /patterns?tab=strategies
- /benchmark  → 301 /lab?tab=benchmark
- ESLint no-restricted-imports rule added (warn mode)"

gh pr create \
  --title "[W-0382-D] Phase D: Legacy route cleanup + hub import rule" \
  --body "$(cat <<'EOF'
## Changes
- 6 legacy routes → 301 redirect to 5-Hub equivalents
- ESLint `no-restricted-imports` rule for hub independence (warn mode)

## Verification
- [ ] curl /terminal → 301 /cogochi
- [ ] curl /analyze → 301 /lab
- [ ] svelte-check 0 errors
- [ ] ESLint rule count reported

Closes #ISSUE_NUM
EOF
)"
```

---

## Exit Criteria

- [ ] AC-D1: `curl -I localhost:5173/terminal` → 301 Location: /cogochi
- [ ] AC-D2: `curl -I localhost:5173/analyze` → 301 Location: /lab?tab=analyze
- [ ] AC-D3: `curl -I localhost:5173/scanner` → 301
- [ ] AC-D4: `curl -I localhost:5173/verdict` → 301
- [ ] AC-D5: `curl -I localhost:5173/strategies` → 301
- [ ] AC-D6: `curl -I localhost:5173/benchmark` → 301
- [ ] AC-D7: ESLint `no-restricted-imports` rule 활성화 + 위반 수 N건 보고
- [ ] AC-D8: `pnpm svelte-check` 0 errors
- [ ] AC-D9: PR merged
- [ ] AC-D10: CURRENT.md main SHA 업데이트 + W-0382 → completed/ 이동
