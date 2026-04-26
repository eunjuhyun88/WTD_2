# W-0214 — Product Charter Gate

**Status**: in-progress
**Owner**: contract
**Branch**: `feat/w-0214-product-charter-gate`
**Created**: 2026-04-26

---

## Goal

코어가 아닌 작업이 시작조차 못 하게 막는 **얇은 가드레일** 1개를 추가한다.
"소통 시스템"을 만들지 않는다. 기존 도구(`start.sh`, `claim.sh`, `CONTRACTS.md`,
`PRIORITIES.md`)에 1페이지짜리 Charter와 Non-Goal 키워드 차단만 얹는다.

## 왜 지금

지난 24시간 PR 8개 중 product feature = 0, 메타(MemKraft / multi-agent OS / agent
session 기록) = 8. PR #335~#342가 전부 야크쉐이빙. 동시에 `spec/PRIORITIES.md`가
PRD §1.3 Non-Goal인 **Copy Trading을 P0**, polish-tier인 **Chart UX를 P1**로
선언하고 있어 다음 에이전트도 같은 잘못을 반복할 구조다.

## Scope

In:
- `spec/CHARTER.md` 신규 — Goals (PRD §1.1) + In-Scope (Master §4 L1-L7 갭) + **Frozen/Non-Goals** (PRD §1.3)
- `spec/PRIORITIES.md` 정렬 — W-0132/W-0212 제거, 진짜 코어 P0/P1로 교체
- `tools/claim.sh` 패치 — Non-Goal 키워드 감지 시 차단 + CHARTER 인용
- `tools/start.sh` 패치 — "🎯 Core" / "🧊 Frozen" 두 섹션 출력 추가

Out:
- `state/active_claims.json` 새 저장소 (CONTRACTS.md로 충분)
- `scripts/sync_current_md.py` + GitHub Action (start.sh stale 감지로 충분)
- 새 슬래시 커맨드, 새 cron, 새 디렉토리
- worktree cleanup 자동화 시스템
- `tools/start.sh` 전체 재작성 (출력 추가만)

## Non-Goals

- "에이전트 간 소통 시스템" 완성 — 가드레일만 만든다
- MemKraft / Multi-Agent OS 추가 개발
- 기존 도구의 동작 변경 (출력 추가만)

## Canonical Files

- `-1_PRODUCT_PRD.md` (Goals, Non-Goals 원본)
- `00_MASTER_ARCHITECTURE.md` §4 (L1-L7 갭)
- `docs/design/11_CTO_DATA_ARCHITECTURE_REALITY.md` §7 (P0/P1/P2 큐)
- `spec/CHARTER.md` (이 PR로 신규 생성)
- `spec/PRIORITIES.md` (이 PR로 재정렬)
- `tools/claim.sh`, `tools/start.sh` (이 PR로 패치)

## Facts

- main: `a4279381` 기준 작업
- `tools/start.sh` 220줄 이미 main에 존재 (PR #345)
- `spec/CONTRACTS.md` lock 시스템 작동 중
- `memkraft 2.0.0` 정상 설치 (engine/uv.lock + uv run)
- 현재 PRIORITIES.md의 P0(W-0132)는 PRD Non-Goal 위반

## Assumptions

- Non-Goal 키워드 차단은 강경 차단(exit 1)이 아닌 경고 + 확인 프롬프트로 시작 (false positive 우려)
- CHARTER.md는 PRD가 변할 때만 변한다 (저빈도 갱신)

## Open Questions

- Non-Goal 차단을 hard exit으로 할지, `--force` 플래그 옵션을 둘지?
- 현재 `feat/w-0132-*`, `feat/w-0212-*` 같은 진행중 브랜치는 어떻게 처리?
  (이 PR scope 밖 — 별도 정리)

## Decisions

- Non-Goal 차단은 **경고 + 확인 프롬프트** (`--force` 시 통과). 강경 차단은
  false positive 시 모든 작업이 막힐 위험이 큼.
- `CHARTER.md`를 PRIORITIES.md와 분리: CHARTER = 영구 진실 (PRD 미러), PRIORITIES = 현재 active 큐.

## Next Steps

1. `spec/CHARTER.md` 작성 (PRD §1.1 + §1.3 + Master §4)
2. `spec/PRIORITIES.md` 재정렬 (코어 P0/P1로 교체)
3. `tools/claim.sh` 패치 — Non-Goal 키워드 감지 + 확인 프롬프트
4. `tools/start.sh` 패치 — Core / Frozen 섹션 추가
5. 동작 검증 + small PR

## Exit Criteria

- [ ] `spec/CHARTER.md` 1페이지 안에 Goals/In-Scope/Frozen 모두 들어감
- [ ] `spec/PRIORITIES.md`가 CHARTER와 일치 (Non-Goal 0개)
- [ ] `./tools/claim.sh "copy trading"` → 차단/경고 출력
- [ ] `./tools/start.sh` 출력에 Core / Frozen 섹션 표시
- [ ] 변경 라인 수 < 250 (가드레일이 시스템이 되지 않게)

## Handoff Checklist

- [ ] PR 본문에 "이 PR은 가드레일이지 시스템이 아니다" 명시
- [ ] CHARTER.md를 PR 본문에 인용
- [ ] 다음 에이전트가 `/start` 시 Core/Frozen 즉시 보이는지 확인
