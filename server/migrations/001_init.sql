create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  currency text not null default 'usd',
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'refund')),
  amount bigint not null check (amount > 0),
  status text not null check (status in ('pending', 'completed', 'flagged', 'failed', 'blocked')),
  counterparty text,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index transactions_reference_idx on public.transactions (reference);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index alerts_user_created_idx on public.alerts (user_id, created_at desc);

create table public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index login_events_user_idx on public.login_events (user_id, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.alerts;
exception when duplicate_object then null;
end $$;

create table public.webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.alerts enable row level security;
alter table public.login_events enable row level security;
alter table public.webhook_events enable row level security;

create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy wallets_select_own on public.wallets for select using (auth.uid() = user_id);
create policy transactions_select_own on public.transactions for select using (auth.uid() = user_id);
create policy alerts_select_own on public.alerts for select using (auth.uid() = user_id);
create policy login_events_select_own on public.login_events for select using (auth.uid() = user_id);