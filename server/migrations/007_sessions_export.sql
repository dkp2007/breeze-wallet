create table public.server_sessions (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Unknown device',
  device_type text not null default 'browser',
  browser text,
  os text,
  ip text,
  current_jti text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index server_sessions_user_idx on public.server_sessions (user_id, last_seen_at desc);

alter table public.server_sessions enable row level security;

create policy server_sessions_select_own on public.server_sessions for select using (auth.uid() = user_id);
