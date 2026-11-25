-- Phase 1: Minor-safe social foundation (friends, friend codes, blocks, reports,
-- encrypted/moderated chat, guardian social/chat switches, and deletion anonymization).

-- ── Guardian social & chat switches ──────────────────────────────────────

alter table public.guardian_controls
  add column if not exists social_enabled boolean not null default true,
  add column if not exists chat_enabled boolean not null default true;

-- ── Tables ───────────────────────────────────────────────────────────────

create table if not exists public.friend_codes (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  user_low uuid generated always as (least(requester_id, addressee_id)) stored,
  user_high uuid generated always as (greatest(requester_id, addressee_id)) stored,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (user_low, user_high),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete set null,
  message_id uuid,
  reason text not null check (reason in ('bullying', 'profanity', 'spam', 'inappropriate', 'other')),
  details text not null default '' check (char_length(details) <= 400),
  message_snapshot text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'archipelago')),
  dm_low uuid,
  dm_high uuid,
  archipelago_id uuid unique,
  created_at timestamptz not null default now(),
  unique (dm_low, dm_high)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_label text not null default 'Student',
  kind text not null default 'text' check (kind in ('text', 'sticker', 'phrase', 'study_invite', 'system')),
  body text not null check (char_length(body) between 1 and 500),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_time_idx on public.messages (conversation_id, created_at desc);

-- ── Private security & moderation helpers ────────────────────────────────

create or replace function private.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  )
$$;

create or replace function private.is_social_allowed(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select social_enabled from public.guardian_controls where student_id = uid), true)
$$;

create or replace function private.is_chat_allowed(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_social_allowed(uid)
    and coalesce((select chat_enabled from public.guardian_controls where student_id = uid), true)
$$;

create or replace function private.is_friend_of(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = pid)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = pid))
  )
  and not private.is_blocked((select auth.uid()), pid)
$$;

create or replace function private.has_friend_link_with(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status in ('pending', 'accepted')
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = pid)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = pid))
  )
  and not private.is_blocked((select auth.uid()), pid)
$$;

create or replace function private.is_classmate_of(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.class_members a
    join public.class_members b on b.class_id = a.class_id
    join public.profiles p on p.id = pid and p.role = 'student'
    where a.student_id = (select auth.uid())
      and b.student_id = pid
      and pid <> (select auth.uid())
  )
  and not private.is_blocked((select auth.uid()), pid)
$$;

create or replace function private.is_in_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = cid and cm.user_id = (select auth.uid())
  )
$$;

-- Bilingual EN + FIL profanity/harassment check (mirrors src/lib/profanity.ts).
create or replace function private.contains_profanity(msg text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  clean text := lower(coalesce(msg, ''));
  collapsed text;
begin
  -- Normalize leetspeak substitutions for word boundary check
  clean := translate(clean, '013457@$', 'oieastas');
  if clean ~* '(^|[^a-z])(fuck|fucker|fucking|shit|bitch|asshole|bastard|motherfucker|cunt|slut|whore|faggot|nigger|nigga|retard|kys|putangina|putang\s*ina|tangina|tang\s*ina|gago|gaga|tarantado|tarantada|ulol|bobo|inutil|kupal|punyeta|pakyu|hindot|kantot|pokpok|hayop\s+ka|tanga\s+ka)([^a-z]|$)' then
    return true;
  end if;
  -- Catch spaced-out obfuscations on high-severity slurs/profanity
  collapsed := regexp_replace(clean, '[^a-z]', '', 'g');
  if collapsed ~* '(putangina|tangina|motherfucker|faggot|nigger|nigga|tarantado|punyeta|kantot|hindot|fuckyou|pakyu)' then
    return true;
  end if;
  return false;
end $$;

create or replace function private.take_rate(p_user uuid, p_kind text, p_max int, p_window_s int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  return public.rate_take(p_user, p_kind, p_max, p_window_s);
end $$;

-- Preserve chat threads when an account is deleted by anonymizing sender labels.
create or replace function private.anonymize_deleted_student_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages
    set sender_label = 'Former student'
    where sender_id = old.id;
  return old;
end $$;

drop trigger if exists on_profile_delete_anonymize_messages on public.profiles;
create trigger on_profile_delete_anonymize_messages
  before delete on public.profiles
  for each row execute function private.anonymize_deleted_student_messages();

grant execute on all functions in schema private to authenticated, service_role;

-- ── Row level security ───────────────────────────────────────────────────

alter table public.friend_codes enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Extend profiles select policy so students see friends, pending requests & classmates (never guardians/teachers seeing friends).
drop policy if exists "profiles: read self and linked people" on public.profiles;
create policy "profiles: read self and linked people" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_guardian_of(id)
    or private.is_teacher_of(id)
    or private.is_adult_of_me(id)
    or (
      private.my_role() = 'student'
      and role = 'student'
      and (private.has_friend_link_with(id) or private.is_classmate_of(id))
    )
  );

create policy "friend_codes: read own" on public.friend_codes for select to authenticated
  using (student_id = (select auth.uid()));

create policy "friendships: read own" on public.friendships for select to authenticated
  using (
    (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()))
    and not private.is_blocked(requester_id, addressee_id)
  );

create policy "blocks: read own" on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "reports: read own" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "conversations: member read when chat allowed" on public.conversations for select to authenticated
  using (private.is_in_conversation(id) and private.is_chat_allowed((select auth.uid())));

create policy "conversation_members: member read" on public.conversation_members for select to authenticated
  using (private.is_in_conversation(conversation_id) and private.is_chat_allowed((select auth.uid())));

create policy "messages: member read when chat allowed" on public.messages for select to authenticated
  using (
    private.is_in_conversation(conversation_id)
    and private.is_chat_allowed((select auth.uid()))
    and (sender_id is null or not private.is_blocked((select auth.uid()), sender_id))
  );

-- ── Grants (explicit; mutations through RPCs) ────────────────────────────

revoke all on public.friend_codes, public.friendships, public.blocks, public.reports,
  public.conversations, public.conversation_members, public.messages from anon, authenticated;
grant select on public.friend_codes, public.friendships, public.blocks, public.reports,
  public.conversations, public.conversation_members, public.messages to authenticated;
grant all on public.friend_codes, public.friendships, public.blocks, public.reports,
  public.conversations, public.conversation_members, public.messages to service_role;

-- ── RPCs ─────────────────────────────────────────────────────────────────

create or replace function public.my_friend_code(regenerate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c text;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students have a friend code' using errcode = '42501';
  end if;
  if not private.is_social_allowed(uid) then
    raise exception 'Social features are currently switched off by your guardian' using errcode = '42501';
  end if;
  if regenerate then delete from public.friend_codes where student_id = uid; end if;
  select code into c from public.friend_codes where student_id = uid;
  if c is not null then return c; end if;
  loop
    c := private.gen_join_code();
    begin
      insert into public.friend_codes (student_id, code) values (uid, c);
      return c;
    exception when unique_violation then
      -- retry with a fresh code
    end;
  end loop;
end $$;

create or replace function private.ensure_dm_conversation(a uuid, b uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lo uuid := least(a, b);
  hi uuid := greatest(a, b);
  cid uuid;
begin
  select id into cid from public.conversations where kind = 'dm' and dm_low = lo and dm_high = hi;
  if cid is null then
    insert into public.conversations (kind, dm_low, dm_high)
      values ('dm', lo, hi)
      on conflict (dm_low, dm_high) do update set kind = 'dm'
      returning id into cid;
  end if;
  insert into public.conversation_members (conversation_id, user_id)
    values (cid, lo), (cid, hi)
    on conflict do nothing;
  return cid;
end $$;

create or replace function private.create_or_accept_friendship(p_requester uuid, p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  lo uuid := least(p_requester, p_target);
  hi uuid := greatest(p_requester, p_target);
  existing public.friendships;
  target_prof public.profiles;
  dm_id uuid;
begin
  if p_requester = p_target then
    raise exception 'You cannot add yourself as a friend' using errcode = '22023';
  end if;
  select * into target_prof from public.profiles where id = p_target;
  if target_prof.id is null or target_prof.role <> 'student' then
    raise exception 'Friend code belongs to an unavailable account' using errcode = 'P0002';
  end if;
  if private.is_blocked(p_requester, p_target) then
    raise exception 'Cannot connect with this student' using errcode = '42501';
  end if;
  if not private.is_social_allowed(p_requester) or not private.is_social_allowed(p_target) then
    raise exception 'Social features are off for one of these accounts' using errcode = '42501';
  end if;

  select * into existing from public.friendships where user_low = lo and user_high = hi for update;
  if existing.id is not null then
    if existing.status = 'accepted' then
      dm_id := private.ensure_dm_conversation(p_requester, p_target);
      return jsonb_build_object(
        'id', existing.id,
        'status', 'accepted',
        'friend_id', p_target,
        'display_name', target_prof.display_name,
        'grade', target_prof.grade,
        'conversation_id', dm_id
      );
    end if;
    if existing.status = 'pending' and existing.addressee_id = p_requester then
      update public.friendships
        set status = 'accepted', accepted_at = now()
        where id = existing.id
        returning * into existing;
      dm_id := private.ensure_dm_conversation(p_requester, p_target);
      return jsonb_build_object(
        'id', existing.id,
        'status', 'accepted',
        'friend_id', p_target,
        'display_name', target_prof.display_name,
        'grade', target_prof.grade,
        'conversation_id', dm_id
      );
    end if;
    if existing.status = 'pending' then
      return jsonb_build_object(
        'id', existing.id,
        'status', 'pending',
        'friend_id', p_target,
        'display_name', target_prof.display_name,
        'grade', target_prof.grade
      );
    end if;
    update public.friendships
      set requester_id = p_requester, addressee_id = p_target, status = 'pending', accepted_at = null, created_at = now()
      where id = existing.id
      returning * into existing;
    return jsonb_build_object(
      'id', existing.id,
      'status', 'pending',
      'friend_id', p_target,
      'display_name', target_prof.display_name,
      'grade', target_prof.grade
    );
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
    values (p_requester, p_target, 'pending')
    returning * into existing;
  return jsonb_build_object(
    'id', existing.id,
    'status', 'pending',
    'friend_id', p_target,
    'display_name', target_prof.display_name,
    'grade', target_prof.grade
  );
end $$;

create or replace function public.send_friend_request_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  clean_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  target_id uuid;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can add friends' using errcode = '42501';
  end if;
  if not private.take_rate(uid, 'friend_code_try', 15, 3600) then
    raise exception 'Too many friend code tries. Wait a bit and try again.' using errcode = 'P0001';
  end if;
  if char_length(clean_code) <> 6 then
    raise exception 'Enter a 6-character friend code.' using errcode = '22023';
  end if;
  select student_id into target_id from public.friend_codes where code = clean_code;
  if target_id is null then
    raise exception 'No student matches that friend code.' using errcode = 'P0002';
  end if;
  return private.create_or_accept_friendship(uid, target_id);
end $$;

create or replace function public.send_friend_request(p_target_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can add friends' using errcode = '42501';
  end if;
  if not private.take_rate(uid, 'friend_req', 20, 3600) then
    raise exception 'Too many friend requests right now. Try again later.' using errcode = 'P0001';
  end if;
  if not private.is_classmate_of(p_target_id) then
    raise exception 'You can only add classmates directly, or use a friend code.' using errcode = '42501';
  end if;
  return private.create_or_accept_friendship(uid, p_target_id);
end $$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  f public.friendships;
  dm_id uuid := null;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can respond to friend requests' using errcode = '42501';
  end if;
  select * into f from public.friendships where id = p_friendship_id for update;
  if f.id is null or f.addressee_id <> uid then
    raise exception 'Friend request not found' using errcode = 'P0002';
  end if;
  if f.status <> 'pending' then
    if f.status = 'accepted' then dm_id := private.ensure_dm_conversation(f.requester_id, f.addressee_id); end if;
    return jsonb_build_object('id', f.id, 'status', f.status, 'conversation_id', dm_id);
  end if;
  if p_accept then
    if private.is_blocked(f.requester_id, f.addressee_id) then
      raise exception 'Cannot accept blocked user' using errcode = '42501';
    end if;
    if not private.is_social_allowed(uid) then
      raise exception 'Social features are off on your account' using errcode = '42501';
    end if;
    update public.friendships
      set status = 'accepted', accepted_at = now()
      where id = f.id
      returning * into f;
    dm_id := private.ensure_dm_conversation(f.requester_id, f.addressee_id);
  else
    update public.friendships
      set status = 'declined'
      where id = f.id
      returning * into f;
  end if;
  return jsonb_build_object('id', f.id, 'status', f.status, 'conversation_id', dm_id);
end $$;

create or replace function public.remove_friend(p_friend_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  delete from public.friendships
    where user_low = least(uid, p_friend_id) and user_high = greatest(uid, p_friend_id);
  return true;
end $$;

create or replace function public.block_user(p_target_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or p_target_id is null or uid = p_target_id then
    raise exception 'Invalid block request' using errcode = '22023';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (uid, p_target_id) on conflict do nothing;
  delete from public.friendships
    where user_low = least(uid, p_target_id) and user_high = greatest(uid, p_target_id);
  return true;
end $$;

create or replace function public.unblock_user(p_target_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  delete from public.blocks where blocker_id = uid and blocked_id = p_target_id;
  return true;
end $$;

create or replace function public.report_user(
  p_target_id uuid,
  p_reason text,
  p_details text default '',
  p_message_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  msg public.messages;
  snap text := null;
  rid uuid;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not private.take_rate(uid, 'report_user', 10, 3600) then
    raise exception 'Too many reports submitted. Please wait.' using errcode = 'P0001';
  end if;
  if p_reason not in ('bullying', 'profanity', 'spam', 'inappropriate', 'other') then
    raise exception 'Invalid report reason' using errcode = '22023';
  end if;
  if p_message_id is not null then
    select m.* into msg from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = uid
      where m.id = p_message_id;
    if msg.id is not null then
      snap := left(msg.body, 500);
      if p_target_id is null then p_target_id := msg.sender_id; end if;
    end if;
  end if;
  insert into public.reports (reporter_id, target_user_id, message_id, reason, details, message_snapshot)
    values (uid, p_target_id, p_message_id, p_reason, left(trim(coalesce(p_details, '')), 400), snap)
    returning id into rid;
  return rid;
end $$;

create or replace function public.open_dm_conversation(p_friend_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can open friend chats' using errcode = '42501';
  end if;
  if not private.is_chat_allowed(uid) then
    raise exception 'Chat is currently switched off by your guardian' using errcode = '42501';
  end if;
  if not private.is_friend_of(p_friend_id) then
    raise exception 'You can only chat with accepted friends' using errcode = '42501';
  end if;
  return private.ensure_dm_conversation(uid, p_friend_id);
end $$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_kind text default 'text',
  p_meta jsonb default '{}'::jsonb
) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  conv public.conversations;
  other_id uuid;
  trimmed text := left(trim(coalesce(p_body, '')), 500);
  sender_name text;
  row_out public.messages;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can send messages' using errcode = '42501';
  end if;
  if not private.is_chat_allowed(uid) then
    raise exception 'Messaging is switched off by your guardian' using errcode = '42501';
  end if;
  if not private.is_in_conversation(p_conversation_id) then
    raise exception 'You are not in this conversation' using errcode = '42501';
  end if;
  if p_kind not in ('text', 'sticker', 'phrase', 'study_invite') then
    raise exception 'Unsupported message type' using errcode = '22023';
  end if;
  if char_length(trimmed) < 1 then
    raise exception 'Message cannot be empty' using errcode = '22023';
  end if;
  if not private.take_rate(uid, 'chat_msg', 30, 60) then
    raise exception 'Slow down a little before sending more messages' using errcode = 'P0001';
  end if;

  select * into conv from public.conversations where id = p_conversation_id;
  if conv.kind = 'dm' then
    other_id := case when conv.dm_low = uid then conv.dm_high else conv.dm_low end;
    if other_id is null or not private.is_friend_of(other_id) then
      raise exception 'You can only message accepted friends' using errcode = '42501';
    end if;
    if not private.is_chat_allowed(other_id) then
      raise exception 'Your friend''s messaging is currently turned off' using errcode = '42501';
    end if;
  end if;

  if p_kind = 'text' and private.contains_profanity(trimmed) then
    raise exception 'Please keep messages kind and respectful' using errcode = 'P0003';
  end if;

  select split_part(display_name, ' ', 1) into sender_name from public.profiles where id = uid;
  insert into public.messages (conversation_id, sender_id, sender_label, kind, body, meta)
    values (p_conversation_id, uid, coalesce(nullif(sender_name, ''), 'Student'), p_kind, trimmed, coalesce(p_meta, '{}'::jsonb))
    returning * into row_out;

  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = uid;

  return row_out;
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then return; end if;
  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = uid;
end $$;

create or replace function public.get_social_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_social boolean;
  v_chat boolean;
  v_code text;
  v_friends jsonb;
  v_in jsonb;
  v_out jsonb;
  v_classmates jsonb;
  v_blocks jsonb;
  v_convs jsonb;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can access social overview' using errcode = '42501';
  end if;

  v_social := private.is_social_allowed(uid);
  v_chat := private.is_chat_allowed(uid);
  if v_social then
    v_code := public.my_friend_code(false);
  else
    v_code := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'friendship_id', f.id,
    'id', p.id,
    'display_name', p.display_name,
    'grade', p.grade,
    'accepted_at', f.accepted_at,
    'dm_conversation_id', (
      select c.id from public.conversations c
      where c.kind = 'dm' and c.dm_low = least(uid, p.id) and c.dm_high = greatest(uid, p.id)
      limit 1
    )
  ) order by p.display_name), '[]'::jsonb)
  into v_friends
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = uid or f.addressee_id = uid)
    and not private.is_blocked(uid, p.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'user_id', p.id,
    'display_name', p.display_name,
    'grade', p.grade,
    'created_at', f.created_at
  ) order by f.created_at desc), '[]'::jsonb)
  into v_in
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.status = 'pending' and f.addressee_id = uid and not private.is_blocked(uid, p.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'user_id', p.id,
    'display_name', p.display_name,
    'grade', p.grade,
    'created_at', f.created_at
  ) order by f.created_at desc), '[]'::jsonb)
  into v_out
  from public.friendships f
  join public.profiles p on p.id = f.addressee_id
  where f.status = 'pending' and f.requester_id = uid and not private.is_blocked(uid, p.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sub.id,
    'display_name', sub.display_name,
    'grade', sub.grade,
    'class_name', sub.name
  ) order by sub.display_name), '[]'::jsonb)
  into v_classmates
  from (
    select distinct on (p2.id) p2.id, p2.display_name, p2.grade, c2.name
    from public.class_members m1
    join public.class_members m2 on m2.class_id = m1.class_id and m2.student_id <> uid
    join public.classes c2 on c2.id = m1.class_id
    join public.profiles p2 on p2.id = m2.student_id and p2.role = 'student'
    where m1.student_id = uid
      and not private.is_blocked(uid, p2.id)
      and not exists (
        select 1 from public.friendships f
        where f.user_low = least(uid, p2.id) and f.user_high = greatest(uid, p2.id)
          and f.status in ('pending', 'accepted')
      )
    order by p2.id, c2.created_at desc
  ) sub;

  select coalesce(jsonb_agg(blocked_id), '[]'::jsonb) into v_blocks
  from public.blocks where blocker_id = uid;

  if v_chat then
    select coalesce(jsonb_agg(row_json order by last_at desc nulls last), '[]'::jsonb)
    into v_convs
    from (
      select
        jsonb_build_object(
          'id', c.id,
          'kind', c.kind,
          'archipelago_id', c.archipelago_id,
          'other_user_id', case when c.kind = 'dm' then (case when c.dm_low = uid then c.dm_high else c.dm_low end) else null end,
          'title', case
            when c.kind = 'dm' then coalesce(
              (select p.display_name from public.profiles p where p.id = case when c.dm_low = uid then c.dm_high else c.dm_low end),
              'Former student'
            )
            else 'Barkada Chat'
          end,
          'last_message', lm.body,
          'last_kind', lm.kind,
          'last_sender', lm.sender_label,
          'last_at', coalesce(lm.created_at, c.created_at),
          'unread', (
            select count(*)::int from public.messages m2
            where m2.conversation_id = c.id
              and m2.created_at > cm.last_read_at
              and (m2.sender_id is null or m2.sender_id <> uid)
              and (m2.sender_id is null or not private.is_blocked(uid, m2.sender_id))
          )
        ) as row_json,
        coalesce(lm.created_at, c.created_at) as last_at
      from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
      left join lateral (
        select m.body, m.kind, m.sender_label, m.created_at
        from public.messages m
        where m.conversation_id = c.id
          and (m.sender_id is null or not private.is_blocked(uid, m.sender_id))
        order by m.created_at desc
        limit 1
      ) lm on true
      where cm.user_id = uid
        and (
          c.kind = 'archipelago'
          or (c.dm_low is not null and c.dm_high is not null
              and not private.is_blocked(c.dm_low, c.dm_high))
        )
    ) q;
  else
    v_convs := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'my_code', v_code,
    'social_enabled', v_social,
    'chat_enabled', v_chat,
    'friends', v_friends,
    'incoming_requests', v_in,
    'outgoing_requests', v_out,
    'classmates', v_classmates,
    'blocked_ids', v_blocks,
    'conversations', v_convs
  );
end $$;

-- Privacy-safe friend list for linked guardians (names & grades only, never messages or scores).
create or replace function public.guardian_child_friends(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_guardian_of(p_student_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'grade', p.grade,
      'accepted_at', f.accepted_at
    ) order by p.display_name), '[]'::jsonb)
    from public.friendships f
    join public.profiles p on p.id = case when f.requester_id = p_student_id then f.addressee_id else f.requester_id end
    where f.status = 'accepted'
      and (f.requester_id = p_student_id or f.addressee_id = p_student_id)
      and not private.is_blocked(p_student_id, p.id)
  );
end $$;

revoke execute on function
  public.my_friend_code(boolean),
  public.send_friend_request_by_code(text),
  public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.report_user(uuid, text, text, uuid),
  public.open_dm_conversation(uuid),
  public.send_message(uuid, text, text, jsonb),
  public.mark_conversation_read(uuid),
  public.get_social_overview(),
  public.guardian_child_friends(uuid)
  from public, anon;

grant execute on function
  public.my_friend_code(boolean),
  public.send_friend_request_by_code(text),
  public.send_friend_request(uuid),
  public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.report_user(uuid, text, text, uuid),
  public.open_dm_conversation(uuid),
  public.send_message(uuid, text, text, jsonb),
  public.mark_conversation_read(uuid),
  public.get_social_overview(),
  public.guardian_child_friends(uuid)
  to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table
  public.friendships,
  public.messages;
