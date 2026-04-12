---
id: base-params-v1
name: Base Parameter Optimization
description: Tune core V4 engine parameters for maximum risk-adjusted returns
version: 1
author: system
archetype: all
---

# Objective
primary: compositeScore
direction: maximize
compositeWeights: {"winRate": 0.4, "pnl": 0.3, "sharpe": 0.2, "noTrade": 0.1}

# Parameters
- ABSTAIN_CONFIDENCE_THRESHOLD [0.3, 0.7] step=0.05
- ABSTAIN_RISK_THRESHOLD [0.5, 0.9] step=0.05
- AUTO_SL_PERCENT [0.02, 0.10] step=0.01
- cvdDivergence [0.1, 1.0] step=0.1
- fundingRate [0.1, 1.0] step=0.1
- openInterest [0.1, 1.0] step=0.1
- htfStructure [0.1, 1.0] step=0.1

# Scenarios
ids: ftx-crash-2022-4h, luna-crash-2022-4h, covid-crash-2020-4h, bull-ath-2021-4h, btc-range-2023-1h
perRound: 3

# Search
strategy: hill_climbing
rounds: 30
maxTime: 300
patience: 8

# Acceptance
maxDegradation: 0.15
splitRatio: 0.7
minImprovement: 0.02
