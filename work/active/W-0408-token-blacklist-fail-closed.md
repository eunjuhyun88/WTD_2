# W-0408 — Token Blacklist Fail-Closed (Redis 장애 시 보안 강화)

> Wave: 6 | Priority: P1 | Effort: S
> Charter: 보안 강화 (Auth 레이어 보완)
> Status: 🔵 분석 완료 / 구현 대기
> Created: 2026-05-05

## Goal

현재 Redis가 다운되면 `is_revoked()`가 `False`를 반환(fail-open)하여 로그아웃된 토큰이 유효해진다. 이를 in-memory fallback blacklist + short TTL 방식으로 교체하여 Redis 장애 시에도 최소한의 보안을 유지한다.

## 현재 상태 분석

### 취약점 위치
- `engine/api/auth/token_blacklist.py:82-100`

### 현재 코드 (핵심)
```python
async def is_revoked(jti: str) -> bool:
    pool = _get_pool()
    if pool is None:          # Redis 없으면
        return False          # ← fail-open: 로그아웃 토큰이 유효해짐
    try:
        return bool(await pool.exists(f"bl:{jti}"))
    except Exception:
        logger.warning("token_blacklist check failed: %s", exc)
        return False          # ← Redis 에러 시에도 fail-open
```

파일 내 주석: `"availability beats security for this tier — see P2 roadmap for Redis HA"`

### 위험도
| Risk | Severity | 설명 |
|---|---|---|
| Redis 다운 시 로그아웃 토큰 재사용 | HIGH | 세션 탈취 후 Redis 다운 타이밍에 replay 가능 |
| 장기 Redis 중단 시 전체 blacklist 무력화 | HIGH | 공격자가 Redis를 타겟팅하면 all sessions replayable |

## 옵션 분석

### Option A — In-memory fallback blacklist (권장)
**방식**: Redis 장애 시 프로세스 메모리에 최근 N개 JTI를 LRU cache로 유지. revoke 시 Redis + 메모리 양쪽에 기록.

**장점**:
- Redis 장애 중에도 해당 프로세스에서 revoke된 토큰은 차단됨
- 가용성 유지 (서비스 중단 없음)
- 구현 단순 (50줄 미만)

**단점**:
- 다중 인스턴스 환경에서 메모리는 인스턴스별 — 다른 인스턴스에서 revoke된 토큰은 메모리에 없음
- Redis 장애 + 다중 인스턴스 = 동일 인스턴스로 재요청 오지 않으면 차단 불가

### Option B — 완전 Fail-Closed (Redis 다운 시 401)
**방식**: Redis 장애 시 모든 토큰 검증 실패 → 401 반환

**장점**: 보안 완전 보장

**단점**: Redis SLA = 서비스 SLA. Redis 다운 = 전체 인증 불가. 현재 아키텍처에서 수용 불가.

### Option C — Short-lived JWT (만료 5분) + Refresh Token
**방식**: access token TTL을 5분으로 줄임 → blacklist 의존도 낮춤

**장점**: blacklist 자체가 불필요해질 수 있음

**단점**: 기존 클라이언트 수정 범위 큼. 장기 작업.

## 권장 구현: Option A (in-memory LRU fallback)

### 구현 계획 (1-PR)

```python
# token_blacklist.py 수정안

from collections import OrderedDict
import threading

_MEM_MAX = 500  # 최대 500개 JTI 인메모리 보관
_mem_blacklist: OrderedDict[str, float] = OrderedDict()  # jti → revoked_at timestamp
_mem_lock = threading.Lock()

def _mem_revoke(jti: str) -> None:
    with _mem_lock:
        _mem_blacklist[jti] = time.time()
        if len(_mem_blacklist) > _MEM_MAX:
            _mem_blacklist.popitem(last=False)  # LRU evict

def _mem_is_revoked(jti: str) -> bool:
    with _mem_lock:
        return jti in _mem_blacklist

async def revoke(jti: str, ttl: int = TOKEN_TTL) -> None:
    _mem_revoke(jti)           # 항상 메모리에 먼저 기록
    pool = _get_pool()
    if pool is None:
        return
    try:
        await pool.setex(f"bl:{jti}", ttl, "1")
    except Exception:
        logger.warning("token_blacklist revoke to Redis failed, memory-only")

async def is_revoked(jti: str) -> bool:
    if _mem_is_revoked(jti):   # 메모리 먼저 확인 (빠름)
        return True
    pool = _get_pool()
    if pool is None:
        return False           # Redis 없으면 메모리만으로 판단 (fail-soft)
    try:
        return bool(await pool.exists(f"bl:{jti}"))
    except Exception:
        logger.warning("token_blacklist Redis check failed, falling back to memory")
        return False           # Redis 에러 시 메모리만 사용
```

### 한계 명시 (주석 + 문서)
- 다중 인스턴스 환경에서 Redis 장애 시: 인스턴스 A에서 로그아웃 → 인스턴스 B로 재요청 시 차단 불가
- 이 위험을 완전히 제거하려면 Redis HA(Sentinel/Cluster) 필요 — 별도 인프라 작업

## Exit Criteria

- [ ] `revoke()` 호출 시 Redis 성공 여부와 무관하게 메모리에 기록됨
- [ ] Redis 다운 상태에서 `is_revoked(recently_revoked_jti)` = `True` (메모리 hit)
- [ ] Redis 다운 상태에서 `is_revoked(unknown_jti)` = `False` (서비스 정상 운영)
- [ ] 메모리 크기 500개 초과 시 LRU eviction 동작 확인 (테스트)
- [ ] 기존 unit test 통과

## 의존성

- 없음 (독립 수정)

## 파일

- `engine/api/auth/token_blacklist.py` (단일 파일 수정)
- `engine/tests/test_token_blacklist.py` (신규 테스트 추가)
