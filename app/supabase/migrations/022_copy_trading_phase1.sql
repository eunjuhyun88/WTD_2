-- Migration 022: Copy Trading Phase 1
-- trader_profiles: JUDGE score aggregation per user
-- copy_subscriptions: follower → leader subscription tracking

create table if not exists trader_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  judge_score numeric not null default 0,
  win_count integer not null default 0,
  loss_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table trader_profiles enable row level security;

create policy "trader_profiles_public_read"
  on trader_profiles for select
  using (true);

create policy "trader_profiles_owner_update"
  on trader_profiles for update
  using (auth.uid() = user_id);

create index if not exists trader_profiles_judge_score_idx
  on trader_profiles (judge_score desc);


create table if not exists copy_subscriptions (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  leader_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (follower_id, leader_id),
  check (follower_id <> leader_id)
);

alter table copy_subscriptions enable row level security;

create policy "copy_subscriptions_owner_all"
  on copy_subscriptions for all
  using (auth.uid() = follower_id);

create index if not exists copy_subscriptions_follower_idx
  on copy_subscriptions (follower_id, active);

create index if not exists copy_subscriptions_leader_idx
  on copy_subscriptions (leader_id, active);
