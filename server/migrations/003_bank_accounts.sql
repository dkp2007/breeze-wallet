alter table public.profiles
  add column if not exists stripe_account_id text,
  add column if not exists payouts_enabled boolean not null default false;

create unique index if not exists profiles_stripe_account_idx on public.profiles (stripe_account_id) where stripe_account_id is not null;
