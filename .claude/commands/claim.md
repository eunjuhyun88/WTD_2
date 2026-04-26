---
description: file-domain lock — 다른 에이전트와 충돌 차단
argument-hint: "engine/X, app/Y"
---

`./tools/claim.sh "$ARGUMENTS"`를 실행해서 작업할 file-domain을 잠급니다.

## 동작

1. `spec/CONTRACTS.md`에 자기 줄 추가
2. 같은 domain이 이미 잡혀 있으면 거절 + 충돌 정보 표시
3. 성공 시 다음 에이전트가 `./tools/start.sh`에서 내 lock을 봄

## 인자 없으면

사용자에게 질문:
- 어느 디렉토리/파일을 변경할 예정인가?
- 예: "engine/copy_trading/, app/src/routes/api/copy-trading/"

claim 후, 사용자에게 다음 단계 안내:
- `git checkout -b feat/...` 새 브랜치 생성
- 작업 완료 시 `/save` 또는 `/end`
