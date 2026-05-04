# W-0407 — scrypt per-user salt 마이그레이션 (Binance 키 암호화 강화)

> Wave: 6 | Priority: P1 | Effort: M
> Charter: 보안 강화 (W-0405 후속 — Binance 키 암호화 보안 결함 수정)
> Status: 🔵 분석 완료 / 구현 대기
> Created: 2026-05-05

## Goal

현재 `binance_tools.py`의 scrypt KDF가 모든 사용자에 대해 동일한 하드코딩 salt(`b"cogochi-salt"`)를 사용한다. 이를 per-user 랜덤 salt로 교체하여, `EXCHANGE_AES_KEY` 노출 시 rainbow table attack으로 모든 사용자 키를 한 번에 복호화할 수 없도록 한다.

## 현재 상태 분석

### 취약점 위치
- `engine/agents/tools/binance_tools.py:37`
- `@functools.lru_cache(maxsize=1)` + `_derive_wrapping_key(raw_key: str)` 에 `salt=b"cogochi-salt"` 하드코딩

### 위험도
| Risk | Severity | 설명 |
|---|---|---|
| `EXCHANGE_AES_KEY` 유출 시 전 사용자 키 일괄 복호화 | HIGH | salt가 고정이므로 유도된 wrapping key가 모든 사용자에 동일 |
| Rainbow table pre-computation 가능 | HIGH | 공격자가 salt를 알면 오프라인으로 wrapping key 사전 계산 가능 |

### 현재 흐름 (단순화)
```
encrypt: AES-GCM(key=scrypt(EXCHANGE_AES_KEY, salt=b"cogochi-salt"), iv=random)
  → DB에 {iv, ciphertext} 저장
decrypt: AES-GCM(key=scrypt(EXCHANGE_AES_KEY, salt=b"cogochi-salt"), iv=from_db)
```

## 목표 흐름

```
encrypt: salt = os.urandom(16)
         wrapping_key = scrypt(EXCHANGE_AES_KEY, salt=salt, ...)
         ciphertext = AES-GCM(key=wrapping_key, iv=random)
         → DB에 {salt, iv, ciphertext} 저장   ← salt 컬럼 추가 필요

decrypt: salt = from_db.salt
         wrapping_key = scrypt(EXCHANGE_AES_KEY, salt=salt, ...)
         → AES-GCM decrypt
```

## Scope

### In-Scope
- `exchange_credentials` 테이블에 `kdf_salt BYTEA NOT NULL` 컬럼 추가 (migration)
- `engine/agents/tools/binance_tools.py` encrypt/decrypt 함수 수정
  - `_derive_wrapping_key` → `_derive_wrapping_key(raw_key: str, salt: bytes) -> bytes` (salt 인자 추가)
  - `lru_cache` 제거 (salt가 사용자마다 다르므로 캐싱 불가 — 대신 process-level cache 제거, 암호화 횟수 자체가 저빈도)
  - encrypt: `os.urandom(16)` salt 생성 → DB 저장
  - decrypt: DB에서 salt 읽어 사용
- 기존 rows 재암호화 마이그레이션 스크립트 (Python one-shot script)
  - 구 방식으로 decrypt → 신 방식으로 re-encrypt → `kdf_salt` 컬럼 채움
  - 마이그레이션 실패 시 row 삭제(재등록 요구) 또는 별도 fallback 컬럼
- TypeScript `binanceConnector.ts` 변경 없음 (암호화/복호화는 서버 전담)

### Non-Goals
- KMS/Vault 도입
- 키 rotation 자동화
- 다른 암호화 알고리즘 교체 (AES-256-GCM 유지)

## 구현 계획 (3-PR)

### PR1 — DB schema + Python encrypt/decrypt 수정
1. Migration: `ALTER TABLE exchange_credentials ADD COLUMN kdf_salt BYTEA`
2. `_encrypt_api_key`: salt 생성, DB에 저장
3. `_decrypt_api_key`: DB에서 salt 로드, `_derive_wrapping_key(key, salt)` 호출
4. `lru_cache` 제거
5. Unit test: encrypt → decrypt round-trip (per-user salt 사용 시 두 rows의 wrapping_key ≠)

### PR2 — 기존 rows 재암호화 마이그레이션 스크립트
1. `engine/scripts/migrate_scrypt_salt.py`
2. 모든 exchange_credentials rows iterate
3. 구 방식(b"cogochi-salt") decrypt → 신 방식(random salt) re-encrypt → UPDATE
4. 실패 rows: `needs_reauth = true` 컬럼(또는 삭제 후 사용자에게 재등록 요구)
5. idempotent: `kdf_salt IS NOT NULL` 인 row는 skip

### PR3 — 마이그레이션 실행 + 검증
1. Supabase migration 배포
2. 스크립트 실행 (staging → prod)
3. 검증: `SELECT count(*) FROM exchange_credentials WHERE kdf_salt IS NULL` = 0

## Exit Criteria

- [ ] 모든 신규 rows는 `kdf_salt IS NOT NULL`으로 저장됨
- [ ] 기존 rows 재암호화 완료 (`kdf_salt IS NULL` count = 0)
- [ ] `lru_cache` 제거 → 사용자 A의 wrapping key ≠ 사용자 B의 wrapping key (테스트 통과)
- [ ] `EXCHANGE_AES_KEY` 동일 + ciphertext 동일 상황에서 salt 다르면 복호화 실패 확인

## 의존성

- W-0405 완료 (✅ — exchange_credentials 테이블 및 encrypt/decrypt 이미 존재)
- Supabase migration 권한 (staging 먼저)

## 참고 코드

```python
# 현재 (취약)
@functools.lru_cache(maxsize=1)
def _derive_wrapping_key(raw_key: str) -> bytes:
    kdf = Scrypt(salt=b"cogochi-salt", length=32, n=16384, r=8, p=1,
                 backend=default_backend())
    return kdf.derive(raw_key.encode())

# 수정 후
def _derive_wrapping_key(raw_key: str, salt: bytes) -> bytes:
    kdf = Scrypt(salt=salt, length=32, n=16384, r=8, p=1,
                 backend=default_backend())
    return kdf.derive(raw_key.encode())
```
