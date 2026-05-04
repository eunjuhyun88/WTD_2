"""Binance perp futures data ingest pipeline.

Modules:
    universe   — symbol + timeframe definitions (TIER1/TIER2/TIER3)
    binance_perp — HTTP client with rate-limit guard
    backfill   — full historical backfill CLI
    incremental — append-only cron-friendly updater
"""
