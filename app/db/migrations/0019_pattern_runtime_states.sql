-- Pattern runtime state tables for Cloud Run restart durability.
-- These mirror the SQLite tables in pattern_runtime.sqlite on the engine,
-- but survive container restarts. The engine writes to SQLite (fast local)
-- and syncs to these tables in the background via supabase_state_sync.py.
-- On startup, the engine hydrates SQLite from these tables.

create table if not exists pattern_states (
    symbol              text        not null,
    pattern_slug        text        not null,
    pattern_version     integer     not null default 1,
    timeframe           text        not null,
    current_phase       text        not null,
    current_phase_idx   integer     not null,
    entered_at          timestamptz,
    bars_in_phase       integer     not null default 0,
    last_eval_at        timestamptz,
    last_transition_id  text,
    active              boolean     not null default true,
    invalidated         boolean     not null default false,
    updated_at          timestamptz not null,
    primary key (symbol, pattern_slug, timeframe)
);

create table if not exists phase_transitions (
    transition_id       text        primary key,
    symbol              text        not null,
    pattern_slug        text        not null,
    pattern_version     integer     not null default 1,
    timeframe           text        not null,
    from_phase          text,
    to_phase            text        not null,
    from_phase_idx      integer,
    to_phase_idx        integer     not null,
    transition_kind     text        not null,
    reason              text        not null,
    transitioned_at     timestamptz not null,
    trigger_bar_ts      timestamptz,
    scan_id             text,
    confidence          real        not null,
    block_scores        jsonb       not null default '{}',
    blocks_triggered    jsonb       not null default '[]',
    feature_snapshot    jsonb,
    data_quality        jsonb,
    created_at          timestamptz not null
);

create index if not exists idx_phase_transitions_symbol_slug_time
    on phase_transitions(symbol, pattern_slug, timeframe, transitioned_at desc);

create index if not exists idx_phase_transitions_scan_id
    on phase_transitions(scan_id) where scan_id is not null;

create index if not exists idx_pattern_states_active_updated
    on pattern_states(active, updated_at desc) where active = true;

-- RLS: engine writes via service role key, app reads via anon key
alter table pattern_states enable row level security;
alter table phase_transitions enable row level security;

create policy "service role full access on pattern_states"
    on pattern_states for all
    to service_role using (true) with check (true);

create policy "anon read pattern_states"
    on pattern_states for select
    to anon using (true);

create policy "service role full access on phase_transitions"
    on phase_transitions for all
    to service_role using (true) with check (true);

create policy "anon read phase_transitions"
    on phase_transitions for select
    to anon using (true);
