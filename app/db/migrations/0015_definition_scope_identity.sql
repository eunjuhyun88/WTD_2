begin;

alter table if exists capture_records
    add column if not exists definition_id text;

alter table if exists capture_records
    add column if not exists definition_ref_json jsonb not null default '{}'::jsonb;

create index if not exists idx_capture_records_definition
    on capture_records (definition_id, captured_at_ms desc)
    where definition_id is not null;

alter table if exists pattern_outcomes
    add column if not exists definition_id text;

alter table if exists pattern_outcomes
    add column if not exists definition_ref jsonb;

create index if not exists idx_pattern_outcomes_definition
    on pattern_outcomes (pattern_slug, definition_id, created_at desc)
    where definition_id is not null;

commit;
