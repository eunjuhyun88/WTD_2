---
name: 보안 강화 + LLM 키 관리 완료 (2026-04-21)
description: /api/cogochi/ 인증 게이트, Preview 환경 민감 키 분리, ENGINE_URL Singapore→새URL 업데이트, kimi-k2.6 업그레이드
type: project
originSessionId: f6ac7757-c82f-437b-9da3-1f118e6d4eb1
---
# 보안 강화 + LLM 키 관리 (2026-04-21)

## 완료된 작업

### C-1 Critical 수정 — /api/cogochi/ 인증 게이트 (PR #142, main=0f83c721)
- `app/src/hooks.server.ts` PUBLIC_API_PREFIXES에서 `/api/cogochi/` 제거
- cogochi 6개 라우트(terminal/message, analyze, thermometer, outcome, alerts, alpha/world-model) 모두 로그인 필수
- 이전: 익명 사용자가 Groq/Cerebras/Kimi 키를 무제한 소모 가능

### H-1 High 수정 — Preview 환경 민감 키 격리
- Preview에서 28개 민감 키 삭제 후 REST API로 재추가 (인증 게이트 수정 후)
- Preview에 남긴 것: PUBLIC_*, 설정값(모델명, rate limit 파라미터), ENGINE_URL
- Vercel 비밀번호 보호는 Pro 유료 플랜 필요 → 방법B(키 분리) 선택

### LLM API 키 동기화 (Vercel Production + Preview)
- GROQ_API_KEY + GROQ_API_KEYS(13개) → Production + Preview 최신화
- CEREBRAS_API_KEY, KIMI_API_KEY, MISTRAL_API_KEY, DEEPSEEK_API_KEY → 최신화
- 기존 Vercel 키는 10일 전 설정으로 일부 만료 상태였음

### Kimi 모델 업그레이드 (PR #141)
- kimi-k2.5 → kimi-k2.6 (기본값 코드 변경)
- 사용 가능한 Moonshot 모델 확인: kimi-k2.5, kimi-k2.6, moonshot-v1-*

### ENGINE_URL 업데이트
- Production: https://wtd-2-3u7pi6ndna-uk.a.run.app
- Preview: 동일 URL
- 이전 Singapore URL: cogotchi-103912432221.asia-southeast1.run.app

## Vercel 인증 토큰 위치
`~/Library/Application Support/com.vercel.cli/auth.json`
Preview 환경변수 bulk 추가는 REST API 필요 (`POST /v9/projects/{id}/env?upsert=true`)

## LLM Provider 상태 (2026-04-21 기준)
- Groq 13키: 정상 (200)
- Kimi: 정상 (429 rate limit, 유효)
- Cerebras: 정상 (429 traffic, 유효)
- Provider 우선순위: Cerebras → Groq → Mistral → HF → OpenRouter → Grok → Kimi

## 남은 보안 항목
- M-1: Provider 에러 바디 클라이언트 전달 (terminal/message/+server.ts:122)
- 키 교체 (10일 노출): DATABASE_URL(Supabase 비밀번호 리셋), SECRETS_ENCRYPTION_KEY

**Why:** 익명 LLM 프록시 취약점(C-1) + Preview 환경 키 노출(H-1) 수정
**How to apply:** 다음 보안 작업 시 남은 M-1 항목 참조
