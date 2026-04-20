"""Social signal layer — 딸깍 전략 정보 필터링.

Twitter(X) 기반 소셜 신호:
  - social_sentiment_spike: 심볼 언급량 급증 감지
  - kol_mention_detect:     KOL 화이트리스트 계정 언급 감지

GAME SDK (twitter_plugin_gamesdk) 사용.
GAME_TWITTER_ACCESS_TOKEN 없으면 빈 결과 반환 (graceful fallback).
토큰 복구 후 .env에 추가하면 자동 활성화.
"""
