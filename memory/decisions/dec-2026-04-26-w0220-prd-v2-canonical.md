---
tier: core
status: accepted
source: manual
tags: ["product", "prd", "w-0220", "core"]
---

# W-0220 Product PRD v2.2 — canonical truth로 채택

## What

`work/active/W-0220-product-prd-master.md` (v2.2 CTO+AI Researcher Edition)을 product의 단일 PRD truth로 채택. 부속 문서 2개도 함께 core tier로 등록:

- `docs/live/feature-implementation-map.md` v3.0 (NOT BUILT 카탈로그)
- `work/active/W-0220-telegram-refs-analysis.md` (signal vocabulary + F-60 메시지 schema)

해당 3 문서를 memory/live-notes/ 아래 core tier live-note로 등록 — `prd-master.md`, `feature-impl-map.md`, `telegram-refs.md`.

## Why

- 30+ 캐노니컬 후보 문서가 흩어져 있고 (00_MASTER 3 버전, 01_PATTERN 3 버전, product-prd-v1, -1_PRODUCT_PRD …) 진짜 truth가 어디인지 합의 없었음
- v1 PRD가 코드 실측을 안 해서 "이미 만들어진 것"을 갭으로 잘못 잡음 (Sequence Matcher / Durable State / Phase A+B AutoResearch / Stats Engine 등)
- v2.2는 ① -1_PRODUCT_PRD 캐노니컬 + ② 코드 실측 (53패턴 × 92블록 × 11 jobs × 24 patterns routes 등) + ③ telegram refs 4채널 + ④ feature-implementation-map v3.0을 통합한 단일 truth
- 9개 이슈 + Q1-Q5 + D1-D15 명확화 → 모든 에이전트가 동일 우선순위 공유 가능

## How

- 새 작업은 본 PRD §8 Feature Priority + §9 Roadmap 따름
- 새 NOT BUILT 작업은 feature-impl-map의 도메인 ID 라벨 사용 (A-XX, B-XX, …)
- D1-D15 + Q1-Q5는 사용자 lock-in 후 spec/PRIORITIES.md 갱신
- 이전 PRD 후보 (product-prd-v1.md, -1_PRODUCT_PRD.md original 등)은 historical reference로 격하
- 검증: `memory/live-notes/prd-master.md` + `feature-impl-map.md` + `telegram-refs.md` 셋 다 tier:core 표시

## Linked

- `prd-master.md` (live-note, core)
- `feature-impl-map.md` (live-note, core)
- `telegram-refs.md` (live-note, core)
- 부속 design docs cross-ref: 본 PRD §12.6
