# STOCKCLAW v3 API Contract

작성일: 2026-02-22  
수정일: 2026-02-23 (응답 포맷 코드 실태 반영 + Arena v3 PvP/Tournament 계약)  
목적: FE/BE 분리 개발을 위해 Arena/Live/Market API 계약을 고정한다.
Doc index: `docs/README.md`

## 1. Conventions

1. Base path: `/api`
2. Content type: `application/json`
3. 시간: epoch ms (`createdAt: 1760000000000`) 또는 ISO8601 UTC — 라우트별 상이
4. 에러 형식 통일:

```json
{ "error": "Human-readable error message" }
```

HTTP status code가 에러 유형을 전달한다 (400/401/404/409/500 등).
에러 body는 항상 `{ "error": string }` 단일 필드.

5. 성공 형식 — 2가지 패턴:

**패턴 A: 리스트 엔드포인트** (matches, activity, chat/messages, notifications 등)

```json
{
  "success": true,
  "total": 42,
  "records": [ ... ],
  "pagination": { "limit": 50, "offset": 0 }
}
```

**패턴 B: 액션/단건 엔드포인트** (terminal/scan, market/snapshot, arena/* 등)

```json
{
  "ok": true,
  "data": { ... }
}
```

> 참고: 레거시 CRUD 라우트(Section 9 Chat 등)는 패턴 A를 사용.
> 신규 라우트(Arena, Scan, Snapshot)는 패턴 B를 사용.
> 향후 통합 시 패턴 B로 수렴 예정.

## 2. Arena / PvP / Tournament API

Arena v3 모드 enum:
1. `PVE`
2. `PVP`
3. `TOURNAMENT`

Arena phase enum (서버 authoritative):
1. `DRAFT`
2. `ANALYSIS`
3. `HYPOTHESIS`
4. `BATTLE`
5. `RESULT`

## 2.1 POST `/api/arena/match/create`

요청:

```json
{
  "pair": "BTC/USDT",
  "timeframe": "4h",
  "mode": "PVE",
  "entryContext": {
    "source": "lobby"
  }
}
```

모드별 추가 필드:
1. `mode=PVP`: `entryContext.pvpPoolId` 선택적 사용
2. `mode=TOURNAMENT`: `entryContext.tournamentId`, `entryContext.round` 필요

응답:

```json
{
  "ok": true,
  "data": {
    "matchId": "uuid",
    "mode": "PVE",
    "phase": "DRAFT",
    "pair": "BTC/USDT",
    "timeframe": "4h",
    "draftDeadlineAt": "2026-02-22T10:01:00.000Z",
    "createdAt": "2026-02-22T10:00:00.000Z"
  }
}
```

에러:
1. `400 INVALID_PAIR`
2. `400 INVALID_MODE`
3. `401 UNAUTHORIZED`
4. `404 PVP_POOL_NOT_FOUND`
5. `404 TOURNAMENT_NOT_FOUND`
6. `500 INTERNAL_ERROR`

## 2.2 POST `/api/arena/match/:id/draft`

요청:

```json
{
  "orpoModel": "BASE65",
  "draft": [
    { "agentId": "STRUCTURE", "specId": "structure_base", "weight": 40 },
    { "agentId": "DERIV", "specId": "deriv_squeeze_hunter", "weight": 35 },
    { "agentId": "FLOW", "specId": "flow_base", "weight": 25 }
  ],
  "submitReason": "manual"
}
```

검증:
1. agent 3개 고정
2. 중복 agent 금지
3. weight 합계 100
4. 개별 weight 10~80
5. spec unlock 여부 확인
6. 토너먼트 매치면 ban된 agent 포함 금지

응답:

```json
{
  "ok": true,
  "data": {
    "matchId": "uuid",
    "mode": "PVE",
    "phase": "ANALYSIS",
    "acceptedDraft": [
      { "agentId": "STRUCTURE", "specId": "structure_base", "weight": 40 },
      { "agentId": "DERIV", "specId": "deriv_squeeze_hunter", "weight": 35 },
      { "agentId": "FLOW", "specId": "flow_base", "weight": 25 }
    ],
    "adjustments": {
      "synergyBonusPct": 3,
      "conflictPenaltyPct": 0
    }
  }
}
```

에러:
1. `400 INVALID_DRAFT`
2. `400 SPEC_LOCKED`
3. `400 BANNED_AGENT_SELECTED`
4. `404 MATCH_NOT_FOUND`
5. `409 INVALID_PHASE`

## 2.3 POST `/api/arena/match/:id/analyze`

요청:

```json
{
  "forceRefresh": false
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "matchId": "uuid",
    "mode": "PVE",
    "phase": "HYPOTHESIS",
    "outputs": [
      {
        "agentId": "STRUCTURE",
        "specId": "structure_base",
        "direction": "LONG",
        "confidence": 71,
        "thesis": "EMA trend and MTF alignment are bullish.",
        "factors": [
          {
            "name": "EMA_TREND",
            "weight": 0.35,
            "signal": "BULL",
            "score": 74,
            "detail": "EMA20 > EMA60 > EMA120",
            "contribution": 25.9
          }
        ],
        "bullScore": 68.1,
        "bearScore": 31.9
      }
    ],
    "aggregate": {
      "direction": "LONG",
      "confidence": 66,
      "reasonTags": ["MTF_ALIGNED", "FLOW_SUPPORT"]
    }
  }
}
```

에러:
1. `409 INVALID_PHASE`
2. `422 INSUFFICIENT_MARKET_DATA`
3. `500 ANALYSIS_FAILED`

## 2.4 POST `/api/arena/match/:id/hypothesis`

`overrideMode` 정의:
1. `"AGENT_FOLLOW"`: 에이전트 합산 방향을 그대로 수용
2. `"USER_OVERRIDE"`: 유저가 에이전트와 다른 방향을 선택 (LP 보상에 영향 가능)

요청:

```json
{
  "direction": "LONG",
  "overrideMode": "AGENT_FOLLOW",
  "userConfidence": 4,
  "evidenceTags": ["EMA_UP", "OI_SUPPORT"],
  "entry": 68100.2,
  "tp": 69150.0,
  "sl": 67520.5,
  "rr": 1.8,
  "exitProfile": "BALANCED",
  "autoSubmitted": false
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "matchId": "uuid",
    "phase": "BATTLE",
    "battleEndsAt": "2026-02-23T10:00:00.000Z",
    "userPrediction": {
      "direction": "LONG",
      "overrideMode": "AGENT_FOLLOW",
      "userConfidence": 4,
      "entry": 68100.2,
      "tp": 69150.0,
      "sl": 67520.5,
      "rr": 1.8
    }
  }
}
```

에러:
1. `400 INVALID_PREDICTION`
2. `409 INVALID_PHASE`
3. `404 MATCH_NOT_FOUND`

## 2.5 GET `/api/arena/match/:id/battle` (SSE)

SSE 이벤트:
1. `battle_snapshot`
2. `decision_window`
3. `price_tick`
4. `pnl_update`
5. `battle_end`

`decision_window` payload 예시:

```json
{
  "type": "decision_window",
  "windowIndex": 3,
  "startedAt": "2026-02-22T10:30:00.000Z",
  "endsAt": "2026-02-22T10:30:10.000Z",
  "actions": ["BUY", "SELL", "HOLD"]
}
```

## 2.6 GET `/api/arena/match/:id/result`

응답:

```json
{
  "ok": true,
  "data": {
    "matchId": "uuid",
    "mode": "PVP",
    "phase": "RESULT",
    "outcome": {
      "won": true,
      "lpDelta": 25,
      "eloDelta": 14,
      "entryPrice": 68100.2,
      "exitPrice": 69210.0,
      "priceChangePct": 1.63,
      "fbs": 84.2
    },
    "progression": {
      "lpTotal": 1246,
      "tier": "DIAMOND",
      "tierLevel": 1,
      "unlockedSpecs": [
        { "agentId": "DERIV", "specId": "deriv_position_reader" }
      ]
    },
    "agentBreakdown": [
      { "agentId": "STRUCTURE", "correct": true, "direction": "LONG", "confidence": 71 },
      { "agentId": "DERIV", "correct": true, "direction": "LONG", "confidence": 64 },
      { "agentId": "FLOW", "correct": false, "direction": "SHORT", "confidence": 58 }
    ]
  }
}
```

## 2.7 POST `/api/pvp/pool/create`

요청:

```json
{
  "pair": "BTC/USDT",
  "timeframe": "4h",
  "autoAccept": true
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "poolId": "uuid",
    "status": "WAITING",
    "pair": "BTC/USDT",
    "timeframe": "4h",
    "expiresAt": "2026-02-22T14:00:00.000Z"
  }
}
```

에러:
1. `403 PVP_LOCKED`
2. `409 ACTIVE_PVP_LIMIT_REACHED`
3. `422 INVALID_POOL_REQUEST`

## 2.8 GET `/api/pvp/pool/available?pair=BTC/USDT&limit=20`

응답:

```json
{
  "ok": true,
  "data": {
    "records": [
      {
        "poolId": "uuid",
        "pair": "BTC/USDT",
        "timeframe": "4h",
        "creatorTier": "SILVER",
        "creatorElo": 1420,
        "status": "WAITING",
        "createdAt": "2026-02-22T10:00:00.000Z",
        "expiresAt": "2026-02-22T14:00:00.000Z"
      }
    ]
  }
}
```

## 2.9 POST `/api/pvp/pool/:id/accept`

응답:

```json
{
  "ok": true,
  "data": {
    "poolId": "uuid",
    "status": "MATCHED",
    "matchId": "uuid",
    "opponent": {
      "userId": "uuid",
      "nickname": "jin",
      "tier": "SILVER",
      "elo": 1420
    }
  }
}
```

에러:
1. `404 POOL_NOT_FOUND`
2. `409 POOL_NOT_AVAILABLE`
3. `409 SELF_MATCH_FORBIDDEN`

## 2.10 GET `/api/tournaments/active`

응답:

```json
{
  "ok": true,
  "data": {
    "records": [
      {
        "tournamentId": "uuid",
        "type": "DAILY_SPRINT",
        "pair": "BTC/USDT",
        "status": "REG_OPEN",
        "maxPlayers": 8,
        "registeredPlayers": 6,
        "entryFeeLp": 50,
        "startAt": "2026-02-23T18:00:00.000Z"
      }
    ]
  }
}
```

## 2.11 POST `/api/tournaments/:id/register`

응답:

```json
{
  "ok": true,
  "data": {
    "tournamentId": "uuid",
    "registered": true,
    "seed": 12,
    "lpDelta": -50
  }
}
```

에러:
1. `403 TOURNAMENT_LOCKED`
2. `409 ALREADY_REGISTERED`
3. `422 INSUFFICIENT_LP`

## 2.12 GET `/api/tournaments/:id/bracket`

응답:

```json
{
  "ok": true,
  "data": {
    "tournamentId": "uuid",
    "round": 2,
    "matches": [
      {
        "matchIndex": 1,
        "userA": { "userId": "uuid", "nickname": "kim" },
        "userB": { "userId": "uuid", "nickname": "park" },
        "winnerId": null,
        "matchId": "uuid"
      }
    ]
  }
}
```

## 2.13 POST `/api/tournaments/:id/ban`

요청:

```json
{
  "matchId": "uuid",
  "bannedAgentId": "DERIV"
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "matchId": "uuid",
    "banPhase": {
      "myBan": "DERIV",
      "opponentBan": null,
      "pickStartsAt": "2026-02-23T18:00:20.000Z"
    }
  }
}
```

## 2.14 POST `/api/tournaments/:id/draft`

요청:

```json
{
  "matchId": "uuid",
  "orpoModel": "BASE65",
  "draft": [
    { "agentId": "FLOW", "specId": "flow_base", "weight": 35 },
    { "agentId": "SENTI", "specId": "senti_base", "weight": 35 },
    { "agentId": "MACRO", "specId": "macro_base", "weight": 30 }
  ]
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "matchId": "uuid",
    "phase": "ANALYSIS",
    "acceptedDraft": [
      { "agentId": "FLOW", "specId": "flow_base", "weight": 35 },
      { "agentId": "SENTI", "specId": "senti_base", "weight": 35 },
      { "agentId": "MACRO", "specId": "macro_base", "weight": 30 }
    ]
  }
}
```

## 3. Live API

## 3.1 GET `/api/live/sessions/active`

응답:

```json
{
  "ok": true,
  "data": {
    "sessions": [
      {
        "sessionId": "uuid",
        "matchId": "uuid",
        "pair": "BTC/USDT",
        "timeframe": "4h",
        "stage": "POSITION_OPEN",
        "startedAt": "2026-02-22T10:00:00.000Z"
      }
    ]
  }
}
```

## 3.2 POST `/api/live/sessions/:matchId/start`

요청:

```json
{
  "streamMode": "SSE"
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "sessionId": "uuid",
    "streamUrl": "/api/live/sessions/uuid/stream"
  }
}
```

## 3.3 GET `/api/live/sessions/:id/stream`

SSE 이벤트:
1. `price_tick`
2. `position_update`
3. `stage_change`
4. `session_end`

## 4. Market Data API

## 4.1 GET `/api/market/snapshot`

설명:
1. 외부 데이터 수집기 진입점
2. `indicator_series`, `market_snapshots` 업데이트

응답:

```json
{
  "ok": true,
  "data": {
    "updated": ["RSI_14", "EMA_20", "OI", "FUNDING_RATE"],
    "pair": "BTC/USDT",
    "timeframe": "4h",
    "at": "2026-02-22T10:00:00.000Z"
  }
}
```

## 4.2 Proxy routes

1. GET `/api/feargreed`
2. GET `/api/coingecko/global`
3. GET `/api/yahoo/:symbol`

## 4.3 DexScreener Proxy routes (B-11 확장)

rate-limit 참고:
1. latest 계열: 60 req/min (DexScreener 문서 기준)
2. 서버는 클라이언트 직접호출 대신 아래 프록시를 사용

엔드포인트:
1. GET `/api/market/dex/token-profiles?limit=20`
2. GET `/api/market/dex/community-takeovers?limit=20`
3. GET `/api/market/dex/ads?limit=20`
4. GET `/api/market/dex/token-boosts?mode=latest|top&limit=20`
5. GET `/api/market/dex/search?q=BTC`
6. GET `/api/market/dex/pairs/:chainId/:pairId`
7. GET `/api/market/dex/token-pairs/:chainId/:tokenAddress`
8. GET `/api/market/dex/tokens/:chainId/:tokenAddresses`
9. GET `/api/market/dex/orders/:chainId/:tokenAddress`

## 5. Progression API (Optional Read Endpoint)

## 5.1 GET `/api/profile/progression`

응답:

```json
{
  "ok": true,
  "data": {
    "lpTotal": 1246,
    "matches": 52,
    "wins": 30,
    "losses": 22,
    "tier": "DIAMOND",
    "tierLevel": 1,
    "agentMatchCounts": {
      "STRUCTURE": 21,
      "VPA": 3,
      "ICT": 5,
      "DERIV": 22,
      "VALUATION": 1,
      "FLOW": 16,
      "SENTI": 7,
      "MACRO": 2
    }
  }
}
```

## 6. Legacy Compatibility

1. 기존 `GET/POST /api/matches`는 당분간 유지한다.
2. 내부에서는 `arena/match` API를 호출하는 adapter로 구현한다.
3. deprecated 기간 종료 시점은 별도 공지한다.

## 7. Status Codes

1. `200` 성공
2. `400` 검증 오류
3. `401` 인증 필요
4. `403` 권한 부족
5. `404` 리소스 없음
6. `409` phase 충돌/상태 충돌
7. `422` 데이터 부족/도메인 검증 실패
8. `429` 외부 API 레이트리밋
9. `500` 서버 내부 오류

## 8. Contract Test Checklist

1. create -> draft -> analyze -> hypothesis -> battle -> result 순서 강제
2. draft weight 합 100 + agent 3개 + unlock + ban 적용 검증
3. phase mismatch 시 409 반환
4. PVP pool 상태 전이(`WAITING -> MATCHED -> EXPIRED/CANCELLED`) 검증
5. Tournament register/ban/draft/bracket 흐름 검증
6. legacy `/api/matches` 경로 정상 응답

## 9. Terminal Scan / Intel / Chat Contract

## 9.1 CURRENT: Chat Message API

### GET `/api/chat/messages?channel=terminal&limit=50&offset=0`

응답:

```json
{
  "success": true,
  "total": 12,
  "records": [
    {
      "id": "uuid",
      "userId": "uuid",
      "channel": "terminal",
      "senderKind": "user",
      "senderId": null,
      "senderName": "YOU",
      "message": "scan summary?",
      "meta": {},
      "createdAt": 1760000000000
    }
  ],
  "pagination": { "limit": 50, "offset": 0 }
}
```

### POST `/api/chat/messages`

요청:

```json
{
  "channel": "terminal",
  "senderKind": "user",
  "senderId": null,
  "senderName": "YOU",
  "message": "@STRUCTURE 지금 근거 뭐야?",
  "meta": {
    "pair": "BTC/USDT",
    "timeframe": "4h"
  }
}
```

저장소 호환 규칙:
1. 마이그레이션 기간에는 `/api/chat/messages`가 내부적으로 `chat_messages` 또는 `agent_chat_messages`를 adapter로 사용할 수 있다.
2. 외부 계약(요청/응답 JSON)은 변경하지 않는다.

응답:

```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "channel": "terminal",
    "senderKind": "user",
    "senderName": "YOU",
    "message": "@STRUCTURE 지금 근거 뭐야?",
    "meta": { "pair": "BTC/USDT", "timeframe": "4h" },
    "createdAt": 1760000000000
  }
}
```

## 9.2 TARGET: Terminal Scan Run API

### POST `/api/terminal/scan`

요청:

```json
{
  "pair": "BTC/USDT",
  "timeframe": "4h",
  "source": "chart-button"
}
```

해석 규칙:
1. `consensus`/`avgConfidence`는 스캔 보조 신호다.
2. 이 응답만으로 자동 주문 확정으로 취급하지 않는다.
3. 최종 진입 결정은 별도 사용자 액션(예: hypothesis 입력/트레이드 확인)에서 확정된다.

응답:

```json
{
  "ok": true,
  "data": {
    "scanId": "uuid",
    "pair": "BTC/USDT",
    "timeframe": "4h",
    "token": "BTC",
    "createdAt": 1760000000000,
    "label": "18:09",
    "consensus": "long",
    "avgConfidence": 67,
    "summary": "3/5 long consensus with moderate derivative stress.",
    "highlights": [
      { "agent": "STRUCTURE", "vote": "long", "conf": 71, "note": "EMA alignment bullish." }
    ],
    "signals": [
      {
        "id": "uuid",
        "agentId": "structure",
        "pair": "BTC/USDT",
        "vote": "long",
        "conf": 71,
        "entry": 68100.2,
        "tp": 69150.0,
        "sl": 67520.5
      }
    ]
  }
}
```

### GET `/api/terminal/scan/history?pair=BTC/USDT&timeframe=4h&limit=20`

응답:

```json
{
  "ok": true,
  "data": {
    "records": [
      {
        "scanId": "uuid",
        "pair": "BTC/USDT",
        "timeframe": "4h",
        "createdAt": 1760000000000,
        "consensus": "long",
        "avgConfidence": 67,
        "summary": "3/5 long consensus"
      }
    ],
    "pagination": { "limit": 20, "offset": 0, "total": 183 }
  }
}
```

## 9.3 TARGET: Multimodal Chat Upload API

### POST `/api/chat/uploads`

요청:

```json
{
  "channel": "terminal",
  "files": [
    { "name": "chart.png", "mime": "image/png", "size": 184233 }
  ]
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "uploads": [
      {
        "uploadId": "uuid",
        "signedUrl": "https://...",
        "publicUrl": "https://...",
        "mime": "image/png"
      }
    ]
  }
}
```

전송 규칙:
1. 업로드 완료 후 `POST /api/chat/messages`의 `meta.attachments[]`에 `uploadId/publicUrl`을 포함한다.
2. `meta.context`에 `pair/timeframe/scanId`를 포함한다.

## 9.4 Terminal 전용 테스트 체크

1. 동일 pair/timeframe 재스캔 시 history 레코드가 누락 없이 append 된다.
2. scan 결과가 좌측 history/우측 intel/chat에 동시에 반영된다.
3. chat 메시지에 `scanId` 컨텍스트를 넣어도 조회가 일관된다.
4. attachments가 포함된 chat 메시지가 저장/조회 모두 가능하다.
