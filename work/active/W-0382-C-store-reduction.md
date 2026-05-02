# W-0382-C — Phase C: Store Reduction (38 → ≤20)

> Parent: W-0382 | Priority: P1
> Status: 🔴 Blocked (W-0382-A merged 필요)
> Pre-conditions: W-0382-A merged
> Estimated files: ~50 | Estimated time: 3~4시간
> 병렬 실행 가능: W-0382-B와 동시 진행 가능 (서로 독립)

---

## 이 Phase가 하는 일

`lib/stores/` 38개를 분류하여:
1. Dead stores (usage 0 확인 후) 삭제
2. Hub-local stores → `lib/hubs/{hub}/stores/` 이주
3. Shared stores → `lib/shared/stores/` 이주 (≤8개)

---

## Pre-conditions Checklist

- [ ] W-0382-A merged (새 디렉토리 구조 존재)
- [ ] `git checkout -b feat/W-0382-C-store-reduction` (main 기준)
- [ ] `pnpm svelte-check` 0 errors 확인

---

## Store 분류표 (실측 기반)

에이전트 실행 전 `VERIFY` 열 명령어로 실제 usage 확인 후 처분.

| Store 파일 | 측정 usage | 분류 | 처분 | 이동 위치 |
|---|---|---|---|---|
| `activePairStore.ts` | grep 0 (재확인 필요) | ? | VERIFY → 0이면 DELETE | — |
| `agentData.ts` | 0 | DEAD | DELETE | — |
| `alphaBuckets.ts` | 1 | terminal | MOVE | `hubs/terminal/stores/` |
| `captureAnnotationsStore.ts` | 0 | DEAD | DELETE | — |
| `chartAIOverlay.ts` | 5 | terminal | MOVE | `hubs/terminal/stores/` |
| `chartFreshness.ts` | 1 | terminal | MOVE | `hubs/terminal/stores/` |
| `chartIndicators.ts` | 2 | terminal | MOVE | `hubs/terminal/stores/` |
| `chartNotesStore.svelte.ts` | (확인 필요) | terminal | MOVE | `hubs/terminal/stores/` |
| `chartSaveMode.ts` | 8 | terminal | MOVE | `hubs/terminal/stores/` |
| `communityStore.ts` | 0 | DEAD | DELETE | — |
| `comparisonStore.ts` | (확인 필요) | terminal | MOVE | `hubs/terminal/stores/` |
| `copyTradeStore.ts` | 1 | patterns | MOVE | `hubs/patterns/stores/` |
| `crosshairBus.ts` | 2 | shared | MOVE | `shared/stores/` |
| `douniRuntime.ts` | 2 | shared | MOVE | `shared/stores/` |
| `gameState.ts` | 0 | DEAD | DELETE | — |
| `hydration.ts` | (확인 필요) | shared | VERIFY | `shared/stores/` |
| `matchHistoryStore.ts` | 0 | DEAD | DELETE | — |
| `mobileMode.ts` | 1 | shared | MOVE | `shared/stores/` |
| `newsStore.ts` | 1 | terminal | MOVE | `hubs/terminal/stores/` |
| `notificationStore.ts` | 0 | DEAD | DELETE | — |
| `patternCaptureContext.ts` | (확인 필요) | terminal | MOVE | `hubs/terminal/stores/` |
| `positionStore.ts` | 0 | DEAD | DELETE | — |
| `predictStore.ts` | 0 | DEAD | DELETE | — |
| `priceStore.ts` | 6 | shared | MOVE | `shared/stores/` |
| `profileDrawerStore.ts` | 0 | DEAD | DELETE | — |
| `progressionRules.ts` | 0 | DEAD | DELETE | — |
| `quickTradeStore.ts` | 0 | DEAD | DELETE | — |
| `storageKeys.ts` | 0 | DEAD | DELETE | — |
| `strategyStore.ts` | 3 | patterns | MOVE | `hubs/patterns/stores/` |
| `terminalLayout.ts` | 1 | terminal | MOVE | `hubs/terminal/stores/` |
| `terminalMode.ts` | 2 | terminal | MOVE | `hubs/terminal/stores/` |
| `terminalState.ts` | 1 | terminal | MOVE | `hubs/terminal/stores/` |
| `trackedSignalStore.ts` | 1 | terminal | MOVE | `hubs/terminal/stores/` |
| `userProfileStore.ts` | 0 | DEAD | DELETE | — |
| `viewportTier.ts` | 2 | shared | MOVE | `shared/stores/` |
| `walletModalStore.ts` | 0 | DEAD | DELETE | — |
| `walletStore.ts` | 3 | shared | MOVE | `shared/stores/` |
| `whaleStore.ts` | (확인 필요) | terminal | MOVE | `hubs/terminal/stores/` |

**예상 결과**: DELETE ~14개, MOVE terminal ~13개, MOVE shared ~7개, MOVE patterns ~2개 = 총 ~36개 처리, `lib/stores/` 비워서 삭제.

---

## Step 1 — Usage 재확인 (삭제 전 필수)

```bash
# 불확실한 store들 실제 사용처 확인
# 아래 각 store에 대해 실행 후 0이면 DELETE 확정

STORES_TO_VERIFY="activePairStore chartNotesStore comparisonStore hydration patternCaptureContext whaleStore"

for store in $STORES_TO_VERIFY; do
  echo "=== $store ==="
  grep -rn "$store" app/src/routes app/src/lib/hubs app/src/lib/shared \
       --include="*.svelte" --include="*.ts" 2>/dev/null \
       | grep -v "lib/stores/" | head -5
done
```

**규칙**: 1건이라도 나오면 DELETE 말고 MOVE. 0건 확정 시에만 DELETE.

---

## Step 2 — Dead Store 삭제

```bash
# 확정된 dead stores 삭제 (usage 0 확인 후)
cd app/src/lib/stores

# DELETE 목록 (확인 후 실행)
rm agentData.ts
rm captureAnnotationsStore.ts
rm communityStore.ts
rm gameState.ts
rm matchHistoryStore.ts
rm notificationStore.ts
rm positionStore.ts
rm predictStore.ts
rm profileDrawerStore.ts
rm progressionRules.ts
rm quickTradeStore.ts
rm storageKeys.ts
rm userProfileStore.ts
rm walletModalStore.ts

# Step 1에서 확인된 추가 dead stores
# rm ...
```

---

## Step 3 — Hub-local Store 이주

```bash
# terminal hub stores 이주
TERMINAL_STORES="alphaBuckets chartAIOverlay chartFreshness chartIndicators chartNotesStore chartSaveMode comparisonStore newsStore patternCaptureContext terminalLayout terminalMode terminalState trackedSignalStore whaleStore"

for store in $TERMINAL_STORES; do
  # 파일명 확인 (svelte.ts vs ts)
  if [ -f "app/src/lib/stores/${store}.svelte.ts" ]; then
    mv "app/src/lib/stores/${store}.svelte.ts" "app/src/lib/hubs/terminal/stores/${store}.svelte.ts"
  elif [ -f "app/src/lib/stores/${store}.ts" ]; then
    mv "app/src/lib/stores/${store}.ts" "app/src/lib/hubs/terminal/stores/${store}.ts"
  fi
done

# patterns hub stores
mv app/src/lib/stores/copyTradeStore.ts app/src/lib/hubs/patterns/stores/copyTradeStore.ts
mv app/src/lib/stores/strategyStore.ts  app/src/lib/hubs/patterns/stores/strategyStore.ts
```

---

## Step 4 — Shared Store 이주

```bash
SHARED_STORES="crosshairBus douniRuntime hydration mobileMode priceStore viewportTier walletStore"

for store in $SHARED_STORES; do
  mv app/src/lib/stores/${store}.ts app/src/lib/shared/stores/${store}.ts 2>/dev/null || true
done
```

---

## Step 5 — Import Path Codemod

이동한 모든 store의 import 경로를 업데이트한다.

```bash
# 영향받는 파일 찾기 (terminal stores)
grep -rn "from.*lib/stores/chartSaveMode\|from.*lib/stores/terminalMode\|from.*lib/stores/terminalState" \
     app/src --include="*.svelte" --include="*.ts"

# 공통 sed 패턴 (각 store 이름별로 반복)
# terminal stores
find app/src -name "*.svelte" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\$lib/stores/chartSaveMode'|from '\$lib/hubs/terminal/stores/chartSaveMode'|g" 2>/dev/null

find app/src -name "*.svelte" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\$lib/stores/terminalMode'|from '\$lib/hubs/terminal/stores/terminalMode'|g" 2>/dev/null

# ... (각 store별 반복)

# shared stores
find app/src -name "*.svelte" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\$lib/stores/priceStore'|from '\$lib/shared/stores/priceStore'|g" 2>/dev/null

find app/src -name "*.svelte" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\$lib/stores/viewportTier'|from '\$lib/shared/stores/viewportTier'|g" 2>/dev/null

find app/src -name "*.svelte" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\$lib/stores/walletStore'|from '\$lib/shared/stores/walletStore'|g" 2>/dev/null

find app/src -name "*.svelte" -o -name "*.ts" | xargs sed -i '' \
  "s|from '\$lib/stores/douniRuntime'|from '\$lib/shared/stores/douniRuntime'|g" 2>/dev/null
```

---

## Step 6 — lib/stores/ 비우기

```bash
# 모두 이주 후 lib/stores/ 비어있는지 확인
ls app/src/lib/stores/

# 비어있으면 디렉토리 삭제
rmdir app/src/lib/stores/
```

---

## Verification Commands

```bash
# 1. svelte-check 0 errors
cd app && pnpm svelte-check 2>&1 | grep "^Error" | wc -l
# 결과: 0

# 2. 구 stores/ 경로 import 없음
grep -rn "from.*lib/stores/" app/src --include="*.svelte" --include="*.ts" | wc -l
# 결과: 0

# 3. 새 store 위치 파일 수 확인
ls app/src/lib/hubs/terminal/stores/ | wc -l  # ~13개
ls app/src/lib/shared/stores/ | wc -l         # ~7개
ls app/src/lib/hubs/patterns/stores/ | wc -l  # ~2개

# 4. 총 store 수 (hub-local + shared)
find app/src/lib/hubs -path "*/stores/*.ts" | wc -l
find app/src/lib/shared/stores -name "*.ts" | wc -l
# 합계 ≤ 25

# 5. 빌드
cd app && pnpm build 2>&1 | tail -5
```

---

## Commit & PR

```bash
git add app/src/lib/stores/ app/src/lib/hubs/ app/src/lib/shared/ app/src/

git commit -m "refactor(W-0382-C): store reduction 38 → ~22

- deleted 14 dead stores (0 usage)
- moved ~13 terminal-local stores → hubs/terminal/stores/
- moved ~7 shared stores → shared/stores/
- moved ~2 patterns stores → hubs/patterns/stores/
- lib/stores/ directory removed
- import paths updated via sed codemod"

gh pr create \
  --title "[W-0382-C] Phase C: Store reduction 38 → ~22" \
  --body "$(cat <<'EOF'
## Changes
- 14 dead stores deleted (0 usage confirmed)
- Remaining stores organized into hub-local and shared tiers
- `lib/stores/` directory removed

## Verification
- [ ] svelte-check 0 errors
- [ ] grep lib/stores/ = 0 imports
- [ ] pnpm build success

Closes part of #ISSUE_NUM
EOF
)"
```

---

## Exit Criteria

- [ ] AC-C1: `lib/stores/` 디렉토리 삭제 완료 (또는 빈 상태)
- [ ] AC-C2: `grep -rn "from.*lib/stores/" app/src` → 0건
- [ ] AC-C3: `find lib/hubs -path "*/stores/*.ts" && find lib/shared/stores -name "*.ts"` 합계 ≤ 25
- [ ] AC-C4: `pnpm svelte-check` 0 errors
- [ ] AC-C5: `pnpm build` 성공
- [ ] PR merged
