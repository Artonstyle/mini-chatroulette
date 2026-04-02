-- Mini Chatroulette - Supabase Grundschema
-- In Supabase unter "SQL Editor" komplett ausfuehren.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  gender text check (gender in ('male', 'female', 'diverse', 'unknown')) default 'unknown',
  seeking_gender text check (seeking_gender in ('male', 'female', 'everyone', 'unknown')) default 'unknown',
  age integer check (age is null or (age >= 18 and age <= 120)),
  city text,
  region text,
  country text,
  location_label text,
  latitude double precision,
  longitude double precision,
  avatar_url text,
  bio text,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  reason text not null check (
    reason in (
      'Nacktheit',
      'Belästigung',
      'Hassrede',
      'Spam / Fake',
      'Minderjährige Gefahr',
      'Sonstiges'
    )
  ),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz not null default timezone('utc', now()),
  current_city text,
  current_country text,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_country_city on public.profiles(country, city);
create index if not exists idx_reports_target_id on public.reports(target_id);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_admin_messages_recipient_id on public.admin_messages(recipient_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    username,
    display_name
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_presence (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_presence_updated_at on public.user_presence;
create trigger trg_presence_updated_at
  before update on public.user_presence
  for each row execute function public.set_updated_at();

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = check_user_id),
    false
  );
$$;

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.admin_messages enable row level security;
alter table public.user_presence enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
on public.reports
for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin"
on public.reports
for select
to authenticated
using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists "reports_admin_update" on public.reports;
create policy "reports_admin_update"
on public.reports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "blocks_select_own_or_admin" on public.blocks;
create policy "blocks_select_own_or_admin"
on public.blocks
for select
to authenticated
using (blocker_id = auth.uid() or blocked_id = auth.uid() or public.is_admin());

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
on public.blocks
for insert
to authenticated
with check (blocker_id = auth.uid());

drop policy if exists "blocks_delete_own_or_admin" on public.blocks;
create policy "blocks_delete_own_or_admin"
on public.blocks
for delete
to authenticated
using (blocker_id = auth.uid() or public.is_admin());

drop policy if exists "admin_messages_select_own_or_admin" on public.admin_messages;
create policy "admin_messages_select_own_or_admin"
on public.admin_messages
for select
to authenticated
using (
  recipient_id = auth.uid()
  or sender_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "admin_messages_insert_admin" on public.admin_messages;
create policy "admin_messages_insert_admin"
on public.admin_messages
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admin_messages_update_recipient_or_admin" on public.admin_messages;
create policy "admin_messages_update_recipient_or_admin"
on public.admin_messages
for update
to authenticated
using (recipient_id = auth.uid() or public.is_admin())
with check (recipient_id = auth.uid() or public.is_admin());

drop policy if exists "presence_select_authenticated" on public.user_presence;
create policy "presence_select_authenticated"
on public.user_presence
for select
to authenticated
using (true);

drop policy if exists "presence_insert_own" on public.user_presence;
create policy "presence_insert_own"
on public.user_presence
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "presence_update_own_or_admin" on public.user_presence;
create policy "presence_update_own_or_admin"
on public.user_presence
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

comment on table public.profiles is 'Benutzerprofile fuer Mini Chatroulette';
comment on table public.reports is 'Meldungen von Nutzern an Admin/Moderation';
comment on table public.blocks is 'Geblockte Nutzerbeziehungen';
comment on table public.admin_messages is 'Nachrichten von Admin an Nutzer';
comment on table public.user_presence is 'Online-/Zuletzt-gesehen-Status';
