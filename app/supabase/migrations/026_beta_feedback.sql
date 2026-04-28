-- Beta feedback table
create table if not exists beta_feedback (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_beta_feedback_wallet
  on beta_feedback (wallet_address);

create index if not exists idx_beta_feedback_created
  on beta_feedback (created_at desc);
