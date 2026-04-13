-- Unique index on wallet_address (case-insensitive) for wallet-first auth
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_wallet_address_lower
  ON public.users (lower(wallet_address))
  WHERE wallet_address IS NOT NULL;
