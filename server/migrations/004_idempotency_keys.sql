create table public.idempotency_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  endpoint text not null,
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index idempotency_keys_created_idx on public.idempotency_keys (created_at);

alter table public.idempotency_keys enable row level security;

create policy idempotency_keys_select_own on public.idempotency_keys for select using (auth.uid() = user_id);
