# Active File-Domain Locks

> 다른 에이전트가 같은 domain에 claim 시도하면 `./tools/claim.sh`가 거절합니다.
> 세션 종료 시 `./tools/end.sh`가 자동으로 lock을 제거합니다.
> 1시간 이상 stale인 lock은 다른 에이전트가 강제 해제 가능 (조정 후).

| Agent | Domain | Branch | Started |
|---|---|---|---|
