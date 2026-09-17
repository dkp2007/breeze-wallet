alter table public.transactions add column if not exists currency text not null default 'inr';

update public.transactions t
set currency = w.currency
from public.wallets w
where w.user_id = t.user_id
  and t.currency <> w.currency;

update public.wallets set currency = 'inr' where currency <> 'inr';

alter table public.wallets drop constraint if exists wallets_currency_check;
alter table public.wallets add constraint wallets_currency_check check (currency in ('inr', 'usd', 'eur', 'gbp'));

alter table public.transactions drop constraint if exists transactions_currency_check;
alter table public.transactions add constraint transactions_currency_check check (currency in ('inr', 'usd', 'eur', 'gbp'));

create index if not exists transactions_user_currency_idx on public.transactions (user_id, currency, created_at desc);
