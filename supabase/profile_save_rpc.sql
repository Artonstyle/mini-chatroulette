create or replace function public.save_my_profile(
  p_username text default null,
  p_display_name text default null,
  p_phone_number text default null,
  p_avatar_url text default null,
  p_gender text default null,
  p_seeking_gender text default null,
  p_location_label text default null
)
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet';
  end if;

  select *
  into v_existing
  from public.profiles
  where id = v_user_id;

  if not found then
    insert into public.profiles (
      id,
      username,
      display_name,
      phone_number,
      avatar_url,
      gender,
      seeking_gender,
      location_label
    )
    values (
      v_user_id,
      coalesce(nullif(trim(p_username), ''), split_part((select email from auth.users where id = v_user_id), '@', 1)),
      nullif(trim(p_display_name), ''),
      nullif(trim(p_phone_number), ''),
      nullif(trim(p_avatar_url), ''),
      coalesce(nullif(trim(p_gender), ''), 'unknown'),
      coalesce(nullif(trim(p_seeking_gender), ''), 'unknown'),
      nullif(trim(p_location_label), '')
    );
  else
    update public.profiles
    set
      username = coalesce(nullif(trim(p_username), ''), v_existing.username),
      display_name = nullif(trim(p_display_name), ''),
      phone_number = nullif(trim(p_phone_number), ''),
      avatar_url = nullif(trim(p_avatar_url), ''),
      gender = coalesce(nullif(trim(p_gender), ''), v_existing.gender, 'unknown'),
      seeking_gender = coalesce(nullif(trim(p_seeking_gender), ''), v_existing.seeking_gender, 'unknown'),
      location_label = nullif(trim(p_location_label), '')
    where id = v_user_id;
  end if;

  return query
  select *
  from public.profiles
  where id = v_user_id;
end;
$$;

grant execute on function public.save_my_profile(text, text, text, text, text, text, text) to authenticated;
