-- F-02-fix: rename verdict labels to match PRD canonical 5-cat
-- missed → near_miss, unclear → too_early
-- engine/ledger/types.py and stats/engine.py updated in same PR

UPDATE capture_records
SET user_verdict = 'near_miss'
WHERE user_verdict = 'missed';

UPDATE capture_records
SET user_verdict = 'too_early'
WHERE user_verdict = 'unclear';
