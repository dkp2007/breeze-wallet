alter table public.wallets
  add column if not exists per_transaction_limit bigint,
  add column if not exists daily_limit bigint;

do $$
begin
  alter table public.wallets
    add constraint wallets_limits_positive check (
      (per_transaction_limit is null or per_transaction_limit > 0)
      and (daily_limit is null or daily_limit > 0)
    );
exception
  when duplicate_object then null;
end $$;
