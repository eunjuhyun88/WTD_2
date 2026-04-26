# W-0225 — Watch Engine 설계

**Owner**: engine | **Branch**: `feat/D03-watch-engine` | **Issue**: #367

---

## 무엇을 만드는가

`POST /captures/{id}/watch`: Verdict Inbox 패턴을 1-click으로 watching 목록에 추가.
`GET /captures?watching=true`: watching 중인 captures만 반환.

**사용 시나리오**:
> 사용자가 Verdict Inbox에서 흥미로운 패턴 카드 보고 [Watch] 클릭
> → 대시보드 WATCHING 섹션에 표시됨
> → 추후 패턴 전환(ACCUMULATION→BREAKOUT) 시 알림 수신 (F-36, P2)

---

## API 명세

### POST /captures/{capture_id}/watch

**Request**: body 없음 (URL 파라미터만)

**Response (200)**

```json
{
  "ok": true,
  "status": "watching",
  "capture_id": "cap_abc123",
  "is_watching": true
}
```

**Error Responses**

| 상태 | 원인 |
|------|------|
| 404 | capture_id 존재하지 않음 |

**Idempotent**: 이미 watching=true인 경우도 200 OK (에러 없음).

---

### GET /captures

기존 엔드포인트에 `watching` 쿼리 파라미터 추가:

```
GET /captures?watching=true   → is_watching=true인 것만
GET /captures?watching=false  → is_watching=false인 것만
GET /captures                 → 전체 (기존 동작 유지)
```

**Response**: 기존 CaptureRecord 배열, `is_watching` 필드 추가됨

---

## DB 명세

### Supabase captures 테이블 변경

```sql
-- Migration: add is_watching column
ALTER TABLE captures
ADD COLUMN IF NOT EXISTS is_watching boolean NOT NULL DEFAULT false;

-- Partial index: watching인 것만 인덱스 (watching 수 << 전체)
CREATE INDEX IF NOT EXISTS idx_captures_is_watching
ON captures(is_watching, captured_at_ms DESC)
WHERE is_watching = true;
```

### SQLite (로컬 캐시) 변경

`engine/capture/store.py` CREATE TABLE DDL에 컬럼 추가:
```sql
is_watching INTEGER NOT NULL DEFAULT 0
```

기존 DB는 `_ensure_column()` 헬퍼로 안전하게 추가:
```python
def _ensure_column(self, col: str, col_def: str):
    try:
        self._conn.execute(f"ALTER TABLE captures ADD COLUMN {col} {col_def}")
    except sqlite3.OperationalError:
        pass  # 이미 존재
```

---

## 내부 구조

### CaptureRecord 변경

**파일**: `engine/capture/types.py`

```python
@dataclass
class CaptureRecord:
    # 기존 필드들...
    is_watching: bool = False   # 신규 추가
```

### set_watching() 메서드

**파일**: `engine/capture/store.py`

```python
def set_watching(self, capture_id: str, watching: bool = True) -> bool:
    """
    Returns: True if found and updated, False if capture_id not found
    """
    # SQLite UPDATE (동기)
    cur = self._conn.execute(
        "UPDATE captures SET is_watching = ? WHERE id = ?",
        (1 if watching else 0, capture_id)
    )
    if cur.rowcount == 0:
        return False  # 존재하지 않음

    # Supabase UPDATE (비동기 fire-and-forget)
    asyncio.create_task(self._supabase_set_watching(capture_id, watching))
    return True
```

### list() 필터 추가

```python
def list(
    self,
    symbol: str | None = None,
    is_watching: bool | None = None,   # 신규 파라미터
    limit: int = 50,
) -> list[CaptureRecord]:
    query = "SELECT * FROM captures WHERE 1=1"
    params = []
    if symbol:
        query += " AND symbol = ?"
        params.append(symbol)
    if is_watching is not None:
        query += " AND is_watching = ?"
        params.append(1 if is_watching else 0)
    query += " ORDER BY captured_at_ms DESC LIMIT ?"
    params.append(limit)
    ...
```

---

## 데이터 흐름

```
사용자 [Watch] 클릭
  → app POST /api/captures/{id}/watch
  → engine POST /captures/{id}/watch
  → CaptureStore.set_watching(id, True)
  → SQLite UPDATE (동기, 즉시)
  → Supabase UPDATE (비동기, fire-and-forget)
  → 200 OK

사용자 WATCHING 섹션 로드
  → app GET /api/captures?watching=true
  → engine GET /captures?watching=true
  → CaptureStore.list(is_watching=True)
  → SQLite SELECT WHERE is_watching=1 (partial index 사용)
  → CaptureRecord[] 반환
```

---

## 성능 설계

| 항목 | 목표 |
|------|------|
| POST latency | ≤ 100ms (SQLite UPDATE 1건) |
| GET latency | ≤ 50ms (partial index 조회) |
| 비용 | DB write 1회, $0.000001 미만 |

**Partial index 선택 이유**: watching=true인 captures는 전체의 10% 미만 예상. full index 대비 크기 90% 감소, scan 속도 10배 향상.

---

## 파일별 변경 목록

| 파일 | 변경 |
|------|------|
| `engine/capture/types.py` | `is_watching: bool = False` 추가 |
| `engine/capture/store.py` | `set_watching()`, `list(is_watching=)`, `_ensure_column()`, Supabase mirror |
| `engine/api/routes/captures.py` | `POST /{id}/watch`, `GET /?watching=` 파라미터 |
| `supabase/migrations/` (또는 engine/migrations/) | `add_is_watching.sql` |
| `engine/tests/test_watch.py` | 7개 테스트 |

---

## Exit Criteria
- POST idempotent (2번 호출 → 2번 모두 200)
- GET `?watching=true` 필터 동작
- Supabase migration SQL 파일 포함
- Engine CI pass
