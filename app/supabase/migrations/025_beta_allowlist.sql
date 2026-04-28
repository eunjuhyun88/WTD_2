-- Beta allowlist: controls which wallet addresses can access the app during beta.
-- wallet_address is lower-cased EVM address (normalized at insert time).
-- revoked_at IS NOT NULL → on waitlist (can see pending banner) but not granted access.
-- Admin grants access by setting revoked_at = NULL.

create table if not exists beta_allowlist (
  wallet_address text primary key,
  email          text,
  invited_by     text,
  note           text,
  added_at       timestamptz not null default now(),
  revoked_at     timestamptz,
  first_login_at timestamptz
);

create index if not exists idx_beta_allowlist_active
  on beta_allowlist (wallet_address)
  where revoked_at is null;
