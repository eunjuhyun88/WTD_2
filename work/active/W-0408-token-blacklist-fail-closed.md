# W-0408 — Token Blacklist Fail-Closed (Redis 장애 시 보안 강화)

> Wave: 6 | Priority: P1 | Effort: S
> Charter: 보안 강화 (Auth 레이어 보완)
> Status: ✅ 구현 완료 (PR #1166)
> Created: 2026-05-05

## Goal

Redis 다운 시 `is_revoked()` fail-open → 로그아웃 토큰 재사용 가능 취약점 수정. in-memory LRU fallback으로 Redis 장애 중에도 이 인스턴스에서 revoke된 토큰을 차단한다.

## Owner

미지정

## Scope

- `engine/api/auth/token_blacklist.py` 단일 파일 수정
- `_mem_blacklist`: `OrderedDict` 500개 LRU, `threading.Lock` 보호
- `revoke_token`: Redis 전 항상 메모리 선기록
- `is_revoked`: 메모리 fast-path → Redis fallback
- `engine/tests/test_token_blacklist.py` 신규 (14 tests)

## Non-Goals

- Redis HA (Sentinel/Cluster) — P2 roadmap
- 다중 인스턴스 cross-coverage (Redis HA 없이는 불가)
- JWT 만료 시간 단축
- Refresh token 도입

## Canonical Files

- `engine/api/auth/token_blacklist.py` — 구현 (PR #1166에서 완료)
- `engine/tests/test_token_blacklist.py` — 신규 테스트 파일

## Facts

- 기존 코드: Redis 없으면 `return False` (fail-open) — `lines 82-100`
- 기존 주석: `"availability beats security for this tier — see P2 roadmap for Redis HA"`
- 14 unit/integration tests 통과 (PR #1166)
- 한계: 다중 인스턴스에서 Redis 장애 시 cross-instance revoke 불가

## Assumptions

- 단일 인스턴스 또는 sticky session 환경에서는 메모리 fallback으로 충분
- `_MEM_MAX = 500` JTI 보관량은 동시 활성 로그아웃 세션 대비 충분

## Open Questions

- 다중 인스턴스 완전 보장이 필요한 시점에 Redis HA 도입 방식 (Sentinel vs Cluster)?

## Decisions

- in-memory LRU fallback 선택 (Option A) — 가용성 유지 + 단일 인스턴스 보안 강화
- fail-closed (Option B) 미채택 — Redis SLA = 서비스 SLA이므로 수용 불가
- `OrderedDict.popitem(last=False)` LRU eviction — stdlib만 사용, 의존성 없음

## Next Steps

- PR #1166 머지 후 완료
- Redis HA 필요 시 W-0408-P2 생성

## Exit Criteria

- [x] `revoke_token` Redis 실패 시 메모리에 기록됨
- [x] Redis 다운 상태에서 `is_revoked(recently_revoked_jti)` = `True`
- [x] Redis 다운 상태에서 `is_revoked(unknown_jti)` = `False`
- [x] LRU 500개 초과 시 eviction 동작 (테스트)
- [x] 14 tests 통과

## Handoff Checklist

- [x] 구현 완료 (PR #1166)
- [x] 테스트 14개 통과
- [ ] PR #1166 머지
