---
name: M-2 서버 에러 바디 노출 수정 완료
description: PR #145 머지 완료 (2026-04-21, main=e1a3052d): 14개 API 라우트에서 String(err)/err.message 클라이언트 노출 제거
type: project
originSessionId: 9804cbf4-bfdb-44f3-86c3-fa7953041d7d
---
M-2 완료 (2026-04-21, PR #145, main=e1a3052d).

14개 API 라우트에서 원시 에러 바디 클라이언트 노출 제거.

**Why:** DB 스택트레이스, 엔진 내부 메시지, 예외 문자열이 HTTP 응답 바디에 그대로 노출되면 공격자에게 내부 구조 힌트를 제공.

**How to apply:** 새 API 라우트 catch 블록 작성 시 `String(err)` / `err.message` 직접 반환 금지. 서버 `console.error(err)` + 제네릭 메시지 반환 패턴 사용.

## 수정 파일 (14개)
- `api/patterns/*` (8개) — `String(err)` → `'engine unavailable'`
- `api/chart/feed` — `String(err)` → `'chart data unavailable'`
- `api/market/funding|oi|ohlcv` — `err.message || fallback` → fallback only
- `api/lab/forward-walk` — `err.message ?? fallback` → fallback only
- `api/cogochi/alerts` — DB error message → `'query failed'`
- `api/cogochi/analyze` — EngineError reason + generic catch sanitized

## 보안 감사 전체 상태 (2026-04-21)
- C-1 `/api/cogochi/` 인증 게이트 → ✅ PR #142
- H-1 Preview 민감 키 격리 → ✅
- M-1 LLM 에러 바디 노출 → ✅ PR #144
- M-2 DB/엔진 에러 바디 노출 → ✅ PR #145
- 키 교체 (DATABASE_URL, SECRETS_ENCRYPTION_KEY) → 선택 사항
