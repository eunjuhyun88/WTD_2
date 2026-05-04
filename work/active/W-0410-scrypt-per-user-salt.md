# W-0410 — scrypt per-user salt (Binance 키 암호화 강화)

> Wave: 6 | Priority: P1 | Effort: M
> Charter: 보안 강화 (W-0405 후속)
> Status: 🔵 설계 완료 / 구현 대기
> Issue: #1172
> Created: 2026-05-05

## Goal

exchange_connections 암호화 키의 hardcoded `'cogochi-salt'` → per-user random salt로 교체.
`EXCHANGE_ENCRYPTION_KEY` 유출 시 rainbow table로 전 사용자 키 일괄 복호화 방지.

## Owner

미지정

## Scope

### In-Scope
- `app/src/lib/server/exchange/binanceConnector.ts` — encryptApiKey/decryptApiKey 수정
- `engine/agents/tools/binance_tools.py` — _decrypt_api_key 수정
- `engine/scripts/migrate_scrypt_salt.py` — 기존 rows 재암호화 스크립트
- 테스트: TS unit test + Python unit test

### Non-Goals
- DB 컬럼 추가 없음 (salt를 ciphertext에 내장)
- KMS/Vault 도입
- 키 rotation 자동화
- 다른 암호화 알고리즘 교체 (AES-256-GCM 유지)

## Canonical Files

- `app/src/lib/server/exchange/binanceConnector.ts` — TS encrypt/decrypt
- `engine/agents/tools/binance_tools.py` — Python decrypt
- `engine/scripts/migrate_scrypt_salt.py` — 재암호화 스크립트 (신규)

## Facts

### 현황 수정 (초기 문서 오류)

| 항목 | 초기 문서 (오류) | 실제 코드 |
|---|---|---|
| 테이블명 | `exchange_credentials` | `exchange_connections` |
| 암호화 위치 | Python side | **TypeScript** `binanceConnector.ts` |
| `lru_cache` | 존재 | **없음** |
| Python 역할 | 암호화+복호화 | **복호화만** |

### 위험도
| Risk | Severity |
|---|---|
| `EXCHANGE_ENCRYPTION_KEY` 유출 시 전 사용자 키 일괄 복호화 | HIGH |
| Rainbow table pre-computation 가능 | HIGH |

### 현재 ciphertext 포맷 (3-part)
```
{iv_hex}:{authTag_hex}:{encrypted_hex}
```
salt = `'cogochi-salt'` hardcoded → 모든 사용자 동일 derived key

## 아키텍처 결정

**DB 컬럼 추가 없이 ciphertext 포맷 확장** (4-part):

| 포맷 | 파트 수 | 구조 |
|---|---|---|
| 구 (legacy) | 3 | `{iv_hex}:{authTag_hex}:{encrypted_hex}` |
| 신 (per-user) | 4 | `{salt_hex}:{iv_hex}:{authTag_hex}:{encrypted_hex}` |

파트 수로 자동 감지 → 무중단 마이그레이션. salt가 ciphertext에 내장되므로 desync 위험 없음.

## 구현 계획 (3-PR)

### PR1 — 코드 수정 (DB 변경 없음)

**`binanceConnector.ts`**:
```typescript
// Before
function deriveEncryptionKey(): Buffer {
  return crypto.scryptSync(getEncryptionKey(), ENCRYPTION_SALT, 32);
}

// After
function deriveEncryptionKey(salt: string | Buffer): Buffer {
  return crypto.scryptSync(getEncryptionKey(), salt, 32);
}

export function encryptApiKey(plaintext: string): string {
  const salt = crypto.randomBytes(16);
  const key = deriveEncryptionKey(salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptApiKey(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length === 4) {
    // New 4-part format with per-user salt
    const [saltHex, ivHex, authTagHex, encrypted] = parts;
    const key = deriveEncryptionKey(Buffer.from(saltHex, 'hex'));
    // ... AES-GCM decrypt
  } else {
    // Legacy 3-part: fixed salt fallback
    const key = deriveEncryptionKey(ENCRYPTION_SALT);
    // ... AES-GCM decrypt
  }
}
```

**`binance_tools.py`**:
```python
def _decrypt_api_key(ciphertext: str) -> str:
    parts = ciphertext.split(":")
    if len(parts) == 4:
        salt = bytes.fromhex(parts[0])
        iv, auth_tag, encrypted = parts[1], parts[2], parts[3]
    elif len(parts) == 3:
        salt = b"cogochi-salt"  # legacy fallback
        iv, auth_tag, encrypted = parts[0], parts[1], parts[2]
    else:
        raise ValueError("Invalid ciphertext format")
    # ... scrypt(key, salt) → AES-GCM decrypt
```

파일 수: 2개 + 테스트 2개.
검증 포인트: 같은 plaintext encrypt 2번 → salt_hex 두 값이 달라야 함.

### PR2 — 재암호화 스크립트

**`engine/scripts/migrate_scrypt_salt.py`**:
- `exchange_connections` 전체 iterate
- 3-part 감지: `len(ciphertext.split(':')) == 3`
- 구 방식 decrypt → 신 방식 re-encrypt → UPDATE
- 실패 rows: `status = 'invalid'` 업데이트 (삭제 아님, 사용자 재등록 유도)
- Idempotent: 4-part rows skip

Staging 검증:
```sql
SELECT count(*) FROM exchange_connections
WHERE array_length(string_to_array(api_key_encrypted, ':'), 1) = 3;
-- 결과 = 0이면 완료
```

### PR3 — 프로덕션 실행

1. 스크립트 prod 실행
2. 검증 쿼리 실행 → count = 0 확인
3. `status='invalid'` rows → 사용자 재등록 안내

## Assumptions

- beta 제품: `exchange_connections` active rows < 50개 추정
- 마이그레이션 실패 = UX 불편 (보안 사고 아님)
- scrypt ~50ms + Binance REST p95 ~500ms → SLO 영향 허용 범위

## Open Questions

- `status='invalid'` 된 사용자에게 UI 알림 방법 (별도 work item 가능)

## Decisions

- **DB 컬럼 추가 없음**: salt를 ciphertext에 내장 → 포맷이 자기 서술적, atomic
- **Dual-format decode**: 3-part(legacy) / 4-part(new) 자동 감지 → 무중단
- **실패 rows 보존**: `status='invalid'` (삭제 아님) — 재등록 요구

거절 옵션: DB `kdf_salt BYTEA` 컬럼 추가 방식 — 포맷 내장 방식 대비 복잡도 높고 desync 위험 있어 기각.

## Next Steps

1. PR1 구현 (브랜치: `feat/W-0410-scrypt-salt`)
2. PR2 스크립트 작성 + staging 검증
3. PR3 prod 실행

## Exit Criteria

- [x] 신규 encrypt → 4-part, salt_hex 매번 다름 (테스트 통과)
- [x] 구 3-part ciphertext → dual-path decrypt 정상 (기존 rows 읽기 가능)
- [ ] 마이그레이션 후 3-part rows = 0 (PR merge 후 prod 실행 필요)
- [x] 실패 rows → `status='invalid'` (삭제 아님)
- [x] TS + Python 테스트 통과

## Handoff Checklist

- [x] 설계 완료 (Issue #1172)
- [x] PR1 구현 (PR #1173 — binanceConnector.ts + binance_tools.py + tests)
- [x] PR2 스크립트 (PR #1173 — engine/scripts/migrate_scrypt_salt.py)
- [ ] PR3 prod 실행 (PR merge 후: `python engine/scripts/migrate_scrypt_salt.py --dry-run` → 확인 → 실 실행)
