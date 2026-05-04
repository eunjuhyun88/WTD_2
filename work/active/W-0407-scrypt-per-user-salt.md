# W-0407 — scrypt per-user salt 마이그레이션 (Binance 키 암호화 강화)

> Wave: 6 | Priority: P1 | Effort: M
> Charter: 보안 강화 (W-0405 후속)
> Status: 🔵 분석 완료 / 구현 대기
> Created: 2026-05-05

## Goal

`binance_tools.py` scrypt KDF가 모든 사용자에 동일한 하드코딩 salt(`b"cogochi-salt"`)를 사용한다. per-user 랜덤 salt로 교체하여 `EXCHANGE_AES_KEY` 노출 시 rainbow table attack을 방지한다.

## Owner

미지정

## Scope

- `exchange_credentials` 테이블에 `kdf_salt BYTEA NOT NULL` 컬럼 추가 (migration)
- `engine/agents/tools/binance_tools.py` encrypt/decrypt 수정 (`_derive_wrapping_key(raw_key, salt)`, `lru_cache` 제거)
- 기존 rows 재암호화 스크립트 (`engine/scripts/migrate_scrypt_salt.py`)

## Non-Goals

- KMS/Vault 도입
- 키 rotation 자동화
- AES-256-GCM 외 알고리즘 교체
- TypeScript `binanceConnector.ts` 수정

## Canonical Files

- `engine/agents/tools/binance_tools.py:37` — `_derive_wrapping_key` (salt 하드코딩 위치)
- `engine/scripts/migrate_scrypt_salt.py` — 신규 마이그레이션 스크립트 (미존재, PR2에서 생성)
- `supabase/migrations/` — `kdf_salt BYTEA` 컬럼 추가 SQL

## Facts

- 현재 `salt=b"cogochi-salt"` 하드코딩 → 모든 사용자 동일 wrapping key
- `@functools.lru_cache(maxsize=1)` 사용 중 — salt 변경 시 캐싱 불가
- W-0405 완료: `exchange_credentials` 테이블 + AES-256-GCM 구현 존재

## Assumptions

- Supabase migration 권한 보유 (staging → prod)
- 기존 rows 재암호화 중 서비스 무중단 가능 (저빈도 암호화)
- `kdf_salt` NULL 허용 기간 최소화

## Open Questions

- 재암호화 실패 row: 삭제 후 재등록 요구 vs `needs_reauth` 컬럼 추가?
- migration 스크립트 실행 중 DB lock 범위?

## Decisions

- per-user 16 bytes `os.urandom()` salt 사용
- `lru_cache` 제거 (salt가 사용자마다 다르므로 캐싱 불가)
- Python one-shot 스크립트로 재암호화 (구 방식 decrypt → 신 방식 encrypt)

## Next Steps

1. PR1: DB migration + Python encrypt/decrypt 수정 + unit test
2. PR2: `migrate_scrypt_salt.py` + staging 검증
3. PR3: prod migration 실행 + `kdf_salt IS NULL` count = 0 확인

## Exit Criteria

- [ ] 신규 rows `kdf_salt IS NOT NULL`
- [ ] 기존 rows 재암호화 완료 (`kdf_salt IS NULL` = 0)
- [ ] 사용자 A wrapping key ≠ 사용자 B wrapping key (테스트)
- [ ] `lru_cache` 제거 확인

## Handoff Checklist

- [ ] W-0405 merged ✅
- [ ] 이 문서 리뷰 완료
- [ ] PR1 브랜치: `feat/W-0407-scrypt-salt-pr1`
- [ ] staging migration 테스트 후 prod 진행
