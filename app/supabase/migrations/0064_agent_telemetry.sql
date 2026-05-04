-- 0064_agent_telemetry.sql
-- Agent conversation telemetry for eval + fine-tune dataset

create table if not exists agent_telemetry (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  session_id    text,
  symbol        text,
  timeframe     text,
  user_message  text not null,
  tools_invoked text[] default '{}',
  final_response text,
  user_reaction text check (user_reaction in ('thumbs_up', 'thumbs_down', 'copy', 'save', null)),
  latency_ms    integer,
  tokens_in     integer,
  tokens_out    integer,
  cost_usd      numeric(10,6),
  model_id      text,
  created_at    timestamptz not null default now()
);

alter table agent_telemetry enable row level security;

-- Users can only see their own telemetry
create policy "agent_telemetry_select_own"
  on agent_telemetry for select
  using (user_id = auth.uid());

-- Insert is allowed (BFF injects user_id)
create policy "agent_telemetry_insert"
  on agent_telemetry for insert
  with check (true);

create index agent_telemetry_user_id_idx on agent_telemetry(user_id);
create index agent_telemetry_created_at_idx on agent_telemetry(created_at desc);
