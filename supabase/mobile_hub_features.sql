-- Mini Chatroulette - Mobile Hub Features
-- Im Supabase SQL Editor nach schema.sql ausfuehren.

alter table public.profiles
  add column if not exists phone_number text;

create index if not exists idx_profiles_phone_number on public.profiles(phone_number);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz,
  constraint direct_messages_not_self check (sender_id <> recipient_id)
);

create index if not exists idx_direct_messages_pair_time
  on public.direct_messages(sender_id, recipient_id, created_at desc);

create table if not exists public.status_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text_content text,
  media_url text,
  media_type text check (media_type in ('image', 'video') or media_type is null),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '24 hours',
  constraint status_posts_content_required check (
    coalesce(length(trim(text_content)), 0) > 0
    or coalesce(length(trim(media_url)), 0) > 0
  )
);

create index if not exists idx_status_posts_expires_at
  on public.status_posts(expires_at desc);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null check (call_type in ('voice', 'video')),
  status text not null default 'completed' check (status in ('completed', 'missed', 'declined', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint call_logs_not_self check (caller_id <> recipient_id)
);

create index if not exists idx_call_logs_created_at
  on public.call_logs(created_at desc);

alter table public.direct_messages enable row level security;
alter table public.status_posts enable row level security;
alter table public.call_logs enable row level security;

drop policy if exists "direct_messages_select_participants" on public.direct_messages;
create policy "direct_messages_select_participants"
on public.direct_messages
for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

drop policy if exists "direct_messages_insert_sender" on public.direct_messages;
create policy "direct_messages_insert_sender"
on public.direct_messages
for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists "direct_messages_update_participants" on public.direct_messages;
create policy "direct_messages_update_participants"
on public.direct_messages
for update
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin())
with check (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

drop policy if exists "status_posts_select_active_authenticated" on public.status_posts;
create policy "status_posts_select_active_authenticated"
on public.status_posts
for select
to authenticated
using (expires_at > timezone('utc', now()) or public.is_admin());

drop policy if exists "status_posts_insert_own" on public.status_posts;
create policy "status_posts_insert_own"
on public.status_posts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "status_posts_update_own_or_admin" on public.status_posts;
create policy "status_posts_update_own_or_admin"
on public.status_posts
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "status_posts_delete_own_or_admin" on public.status_posts;
create policy "status_posts_delete_own_or_admin"
on public.status_posts
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "call_logs_select_participants" on public.call_logs;
create policy "call_logs_select_participants"
on public.call_logs
for select
to authenticated
using (caller_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

drop policy if exists "call_logs_insert_caller" on public.call_logs;
create policy "call_logs_insert_caller"
on public.call_logs
for insert
to authenticated
with check (caller_id = auth.uid());

drop policy if exists "call_logs_update_participants" on public.call_logs;
create policy "call_logs_update_participants"
on public.call_logs
for update
to authenticated
using (caller_id = auth.uid() or recipient_id = auth.uid() or public.is_admin())
with check (caller_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

comment on table public.direct_messages is 'Direktnachrichten zwischen registrierten Nutzern';
comment on table public.status_posts is '24h Status-Posts fuer Mobile Hub';
comment on table public.call_logs is 'Anrufhistorie fuer Sprach- und Videoanrufe';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'status-media',
  'status-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/ogg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "status_media_public_read" on storage.objects;
create policy "status_media_public_read"
on storage.objects
for select
to public
using (bucket_id = 'status-media');

drop policy if exists "status_media_auth_upload_own" on storage.objects;
create policy "status_media_auth_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'status-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "status_media_auth_update_own" on storage.objects;
create policy "status_media_auth_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'status-media'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'status-media'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "status_media_auth_delete_own" on storage.objects;
create policy "status_media_auth_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'status-media'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
