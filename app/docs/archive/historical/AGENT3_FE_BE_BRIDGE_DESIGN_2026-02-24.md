# Agent3 FE-BE Bridge Design (2026-02-24)

## Goal

백엔드 API 작업이 프론트 호출 레이어와 실제로 붙도록, 계약 불일치를 흡수하는 중간 브리지를 도입한다.

## Findings

1. Terminal Scan API 계약 불일치
- 클라이언트 `src/lib/api/terminalApi.ts`는 `success` 기반 응답을 기대했다.
- 서버 `src/routes/api/terminal/scan*`는 `ok + data` 형태를 반환했다.
- 결과적으로 WarRoom 스캔/히스토리 동기화에서 런타임 실패 가능성이 있었다.

2. Market Snapshot 호출 방식 불일치
- 클라이언트는 `POST /api/market/snapshot`를 호출했다.
- 서버는 `GET /api/market/snapshot`만 구현되어 있었다.

3. Envelope 표준 혼재
- 프로젝트 전반에 `success`와 `ok` 응답 형식이 혼재되어 FE/BE 분리 시 회귀 위험이 컸다.

## Bridge Strategy

1. Dual-envelope compatibility
- 핵심 엔드포인트에서 `success`와 `ok`를 동시에 제공한다.
- 기존 `data` 구조는 유지해 구형 소비자 호환성을 보장한다.

2. Dual-shape client adapter
- `terminalApi.ts`에서 `success || ok`를 성공 조건으로 허용한다.
- 응답이 `root` 또는 `data`에 있어도 안전하게 해석한다.

3. Method compatibility for snapshot
- `/api/market/snapshot`에 `POST`를 추가하고 기존 `GET`도 유지한다.
- 동일 로직을 사용해 기능/캐시 동작을 일치시킨다.

## Implemented Scope

1. 서버 응답 브리지
- `terminal/scan` 4개 엔드포인트: `success + ok` 동시 반환.
- `market/snapshot`: `GET` + `POST` 동시 지원, `success + ok` 반환.
- `feargreed`, `coingecko/global`, `yahoo/[symbol]`, `terminal/opportunity-scan`: `success` 호환 필드 추가.

2. 클라이언트 브리지
- `terminalApi.ts`를 호환 파서 기반으로 개편.
- `scan/history/detail/signals`를 `root/data` 양쪽 구조에서 파싱.
- `market/snapshot/feargreed/coingecko/yahoo`의 계약 차이를 정규화.

## Validation Gate

1. `npm run check`: pass
- env 주입: `COINALYZE_API_KEY`, `PUBLIC_EVM_CHAIN_ID`, `PUBLIC_EVM_RPC_URL`, `PUBLIC_WALLETCONNECT_PROJECT_ID`

2. `npm run build`: pass
- 초기 실패 원인: `ENOSPC` (디스크 공간 부족)
- 조치: `npm cache clean --force` 후 재시도 성공

## Next (for full close)

1. API 공통 응답 유틸(`ok/success/error`)을 서버 공용 모듈로 승격.
2. 프론트 직fetch 구간(`IntelPanel`, `terminal/+page`)을 공용 API adapter로 통일.
3. FE/BE 분리 배포를 고려한 CORS + 쿠키 정책(`sameSite/secure/domain`) 명시.
