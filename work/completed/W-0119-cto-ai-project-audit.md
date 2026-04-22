# W-0119 — CTO + AI Research Project Audit

## Goal
프로젝트 전반을 감사해 리팩토링 우선순위, 성능 병목, 보안 리스크를 증거 기반으로 식별한다.

## Owner
research

## Scope
- `app/`와 `engine/`의 실제 실행 경로 전반 감사
- 아키텍처 경계, 서버 핫패스, 데이터/계약 결합도, 연구 파이프라인 안정성 검토
- 보안·성능·리팩토링 관점의 우선순위 보고

## Non-Goals
- 이번 작업에서 기능 구현 또는 대규모 리팩토링 선행 수행
- `docs/archive/`, 생성 산출물, 빌드 출력물 전수 열람
- 사용자 승인 없는 파괴적 변경 및 브랜치 작업

## Canonical Files
- `README.md`
- `docs/product/brief.md`
- `docs/domains/contracts.md`
- `docs/domains/engine-pipeline.md`
- `docs/domains/app-route-inventory.md`
- `app/package.json`
- `engine/pyproject.toml`

## Facts
1. 저장소는 `app/`(SvelteKit/TypeScript)와 `engine/`(FastAPI/Python) 이중 구조다.
2. 루트 `AGENTS.md`는 `engine/`을 backend truth, `app/`을 surface/orchestration boundary로 고정한다.
3. 활성 work item 중 `W-0004`는 app-engine contract hardening, `W-0117`은 app 서버 보안·성능 하드닝을 다룬다.
4. 이번 요청은 단일 버그 수정이 아니라 전체 프로젝트 감사를 요구한다.
5. 원본 worktree가 크게 더러워져 있어 `fetch + rebase + review`는 `/tmp/wtd-v2-review-w0119` clean review worktree에서 수행했다.

## Assumptions
1. 현재 감사는 읽기/분석 중심이며, 필요한 경우에만 후속 수정 제안을 남긴다.
2. 빌드/테스트는 저장소 기본 스크립트와 범위가 맞는 최소 검증 위주로 실행한다.

## Open Questions
1. 현재 실제 프로덕션 트래픽이 가장 집중되는 사용자 경로가 `cogochi analyze` 외에 더 있는가.
2. 데이터베이스/Redis/외부 API 자격 증명 처리 중 문서화되지 않은 운영 제약이 있는가.

## Decisions
- 이번 감사의 1차 산출물은 코드 수정이 아닌 우선순위가 매겨진 리뷰 보고다.
- 앱/엔진 경계, 서버 핫패스, 보안 제어지점부터 먼저 본다.
- 증거 없는 일반론 대신 파일/라인 기준으로 지적한다.
- P0 후보는 `hooks.server.ts` 공개 API 분류와 실제 mutating/LLM route 노출 여부다.
- P0 후보는 `exchange/binanceConnector.ts` 기본 암호화 키 fallback 제거 여부다.
- 성능은 `scanEngine.ts`, `patterns/stats`, `ledger/store.py`의 fan-out / file-scan 구조를 우선 본다.
- 현재 실행 브랜치 작업트리가 크게 더러워져 있어 in-place rebase는 피한다.
- 사용자 요청의 `fetch + rebase + full review`는 clean review worktree에서 수행한다.
- rebase 후 실제 diff는 `app/src/lib/cogochi/modes/TradeMode.svelte` 1파일로 축소되었다.
- rebase 후 핵심 회귀는 `JUDGE` auto-save의 reactive replay와 `SCAN` phase enum mismatch다.

## Next Steps
1. rebase review 결과를 우선순위/영향/라인 근거와 함께 사용자에게 전달한다.
2. 사용자가 원하면 `TradeMode.svelte` 회귀 2건부터 즉시 패치한다.
3. 이후 기존 감사 보고의 P0 보안 항목을 별도 수정 작업으로 분리한다.

## Exit Criteria
- 보안, 성능, 리팩토링 영역별 우선순위 감사 결과가 정리된다.
- 각 핵심 지적사항은 실제 파일 근거와 영향 설명을 포함한다.
- 수행한 검증과 미검증 영역이 명시된다.

## Handoff Checklist
- 활성 work item, 감사 범위, 사용한 검증 명령이 최신 상태다.
- 후속 수정이 필요한 경우 파일 단위 우선순위가 남아 있다.
