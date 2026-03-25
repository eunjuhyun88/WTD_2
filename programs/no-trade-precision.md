---
id: no-trade-precision-v1
name: NO_TRADE Precision Tuning
description: Optimize abstain gate to maximize correct skip rate while minimizing missed opportunities
version: 1
author: system
archetype: GUARDIAN
regimeFilter: range, compressed, volatile
---

# Objective
primary: noTradePrecision
direction: maximize

# Parameters
- ABSTAIN_CONFIDENCE_THRESHOLD [0.3, 0.65] step=0.05
- ABSTAIN_RISK_THRESHOLD [0.4, 0.85] step=0.05

# Scenarios
ids: btc-range-2023-1h, ftx-crash-2022-4h
perRound: 2

# Search
strategy: hill_climbing
rounds: 20
maxTime: 120
patience: 5

# Acceptance
maxDegradation: 0.20
splitRatio: 0.7
minImprovement: 0.03
