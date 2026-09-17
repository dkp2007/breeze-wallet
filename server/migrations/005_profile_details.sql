alter table public.profiles
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists bio text,
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$
begin
  create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "avatars upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "avatars replace own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception
  when duplicate_object then null;
end $$;
