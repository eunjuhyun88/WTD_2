---
name: Copy Trading PRD 작성 완료
description: WTD v2 카피트레이딩 PRD + 기능명세서 (코드 없음, 설계문서 통합본)
type: project
---

카피트레이딩 PRD + 기능명세서가 `/Users/ej/.claude/plans/floofy-zooming-church.md`에 작성됨 (2026-04-22).

**Why:** a16z crypto 투자 논거 완성을 위한 네트워크 효과 레이어. 현재 1인용 분석 툴 → 트레이더 마켓플레이스 전환.

**How to apply:** 이 문서가 카피트레이딩 구현의 단일 진실 소스. 구현 시 이 문서 기준으로 work item 생성할 것.

## 핵심 설계 결정

- **JUDGE-first reputation**: 팔로워 수 아닌 verdict_ready 데이터로 트레이더 신뢰도 계산
- **3가지 카피 모드**: AUTO (즉시 자동진입) / ALERT (알림만) / REVIEW (1-click 진입)
- **Risk Circuit Breaker**: 일일 손실 한도 초과 시 카피 자동 일시정지 (필수, 옵션 아님)

## 구현 페이즈 요약

- **Phase 1**: Reputation 엔진 + 리더보드 UI + DB 스키마 (코드 없는 MVP)
- **Phase 2**: Alert 모드 + 팬아웃 job + Following 페이지
- **Phase 3**: 거래소 Adapter + Auto-Copy 실행 엔진
- **Phase 4**: 온체인 settlement + 토큰 스테이킹 (별도 설계)

## 신규 DB 테이블 (설계)

- `leader_profiles` — 리더 등록 + reputation 캐시
- `leader_subscriptions` — 팔로워 구독 + 리스크 설정 + 거래소 API Key (암호화)
- `copy_positions` — 실행된 카피 포지션 레코드
- `reputation_snapshots` — 시계열 reputation 기록

## 재사용 가능한 기존 코드

- `copyTradeStore.ts` — 리더 시그널 발행 UI 베이스
- `quickTradeStore.ts` + `trackedSignalStore.ts` — 카피 포지션 연동
- `refinement/leaderboard` — 유저 단위 leaderboard로 확장
- `captures.py` verdict 파이프라인 — Reputation 계산 데이터소스
- `jobs.py` 스케줄러 — 팬아웃 + reputation_update job 추가
