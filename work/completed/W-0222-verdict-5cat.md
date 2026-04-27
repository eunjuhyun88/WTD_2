# W-0222 — Verdict 5-cat 설계

**Owner**: engine + app | **Branch**: `feat/F02-verdict-5cat` | **Issue**: #364

---

## 무엇을 만드는가

verdict 라벨 3종 → 5종 확장. 사용자가 패턴 결과를 더 정밀하게 라벨링하도록 한다.

**라벨 의미**

| 라벨 | 한국어 | 의미 |
|------|--------|------|
| `valid` | 성공 | 진입 → 수익 발생 |
| `invalid` | 실패 | 진입 → 손실 또는 패턴 틀림 |
| `missed` | 놓침 | 패턴 맞았으나 진입 못함 (타이밍 놓침) |
| `too_late` | 늦은진입 | 이미 많이 올라서 리스크/리워드 없음 |
| `unclear` | 불명확 | 판단 보류 |

---

## 변경 명세

### 1. Python 타입 변경

**파일**: `engine/ledger/types.py`

```python
# Before
VerdictLabel = Literal["valid", "invalid", "unclear"]

# After
VerdictLabel = Literal["valid", "invalid", "missed", "too_late", "unclear"]
```

### 2. Engine API 변경

**파일**: `engine/api/routes/captures.py`

엔드포인트: `POST /captures/{capture_id}/verdict`

```python
class VerdictRequest(BaseModel):
    verdict: VerdictLabel  # 5종 허용
    note: str | None = None

# Response
class VerdictResponse(BaseModel):
    capture_id: str
    verdict: VerdictLabel
    recorded_at: str  # ISO 8601
```

**기존 3종 호환**: Literal 확장이므로 기존 `valid`/`invalid`/`unclear` 그대로 동작.

### 3. DB 변경

Supabase `captures` 테이블의 `verdict` 컬럼은 **`text` 타입** → 변경 없음.
새 문자열 값(`missed`, `too_late`) 그대로 저장 가능.

마이그레이션 불필요. 기존 rows backfill 불필요.

### 4. App 프록시 변경

**파일**: `app/src/routes/api/captures/[id]/verdict/+server.ts`

```typescript
// 타입 업데이트
type VerdictLabel = 'valid' | 'invalid' | 'missed' | 'too_late' | 'unclear'

// 유효성 검사
const VALID_VERDICTS: VerdictLabel[] = ['valid', 'invalid', 'missed', 'too_late', 'unclear']
if (!VALID_VERDICTS.includes(body.verdict)) {
  return error(400, 'invalid verdict')
}
```

### 5. UI 변경

**파일**: `app/src/routes/dashboard/+page.svelte`

`submitVerdict()` 함수 주변 버튼 5개로 확장:

```
[성공 ✓]  [실패 ✗]  [놓침 ⚡]  [늦은진입 ⏰]  [불명확 ?]
  valid    invalid    missed    too_late      unclear
```

버튼 색상:
- `valid` → `#22c55e` (초록)
- `invalid` → `#ef4444` (빨강)
- `missed` → `#f97316` (주황)
- `too_late` → `#f59e0b` (노랑)
- `unclear` → `#6b7280` (회색)

---

## 데이터 흐름

```
사용자 클릭 [놓침]
  → app POST /api/captures/{id}/verdict {verdict: "missed"}
  → engine POST /captures/{id}/verdict
  → CaptureStore.update_verdict("missed")
  → Supabase UPDATE captures SET verdict='missed'
  → refinement_trigger 10+ verdicts 게이트 통과 시 AutoResearch 실행
```

---

## AutoResearch 연동

`missed` / `too_late` 라벨은 훈련 데이터에서 어떻게 처리할지:
- 1차: 훈련 제외 (`unclear`와 동일 처리) — 추후 Hill Climbing에서 "진입 타이밍 파라미터" 조정 힌트로 활용 가능

---

## Exit Criteria
- 5종 POST 200 OK
- 기존 3종 호환
- Engine CI 1480+ passed
- App CI 0 TS errors
