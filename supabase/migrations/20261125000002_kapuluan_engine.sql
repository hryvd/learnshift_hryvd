-- Phase 3 & 5: Kapuluan shared streak archipelagos, server-computed Agos tide
-- scoring, Anod drift, weekly bridge freeze, Sagwan paddle nudges, and nightly close.

-- ── Tables ───────────────────────────────────────────────────────────────

create table if not exists public.archipelagos (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_by uuid references public.profiles (id) on delete set null,
  streak_days int not null default 0 check (streak_days >= 0),
  best_streak int not null default 0 check (best_streak >= 0),
  last_counted_day date,
  last_evaluated_day date,
  freeze_week_start date,
  freeze_used_day date,
  created_at timestamptz not null default now()
);

create table if not exists public.archipelago_members (
  archipelago_id uuid not null references public.archipelagos (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (archipelago_id, student_id)
);
create index if not exists archipelago_members_student_idx on public.archipelago_members (student_id);

create table if not exists public.archipelago_invites (
  id uuid primary key default gen_random_uuid(),
  archipelago_id uuid not null references public.archipelagos (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (archipelago_id, invitee_id),
  check (inviter_id <> invitee_id)
);
create index if not exists archipelago_invites_invitee_idx on public.archipelago_invites (invitee_id, status);

create table if not exists public.tide_daily (
  student_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  breaks_count int not null default 0,
  attempts_count int not null default 0,
  correct_count int not null default 0,
  effort_pts real not null default 0,
  accuracy_pts real not null default 0,
  improvement_pts real not null default 0,
  tide_score real not null default 0,
  goal_met boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (student_id, day)
);
create index if not exists tide_daily_day_idx on public.tide_daily (student_id, day desc);

create table if not exists public.sagwan_nudges (
  id uuid primary key default gen_random_uuid(),
  archipelago_id uuid not null references public.archipelagos (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default 'Kaya mo ''yan!' check (char_length(trim(message)) between 1 and 80),
  day date not null default ((now() at time zone 'Asia/Manila')::date),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists sagwan_recipient_idx on public.sagwan_nudges (recipient_id, created_at desc);
create index if not exists sagwan_sender_day_idx on public.sagwan_nudges (sender_id, day);

-- Link archipelago group conversations to archipelagos with cascade cleanup.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_archipelago_fk'
  ) then
    alter table public.conversations
      add constraint conversations_archipelago_fk
      foreign key (archipelago_id) references public.archipelagos (id) on delete cascade;
  end if;
end $$;

-- ── Private helpers ──────────────────────────────────────────────────────

create or replace function private.is_archipelago_member(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.archipelago_members m
    where m.archipelago_id = aid and m.student_id = (select auth.uid())
  )
$$;

create or replace function private.shares_archipelago(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.archipelago_members a
    join public.archipelago_members b on b.archipelago_id = a.archipelago_id
    where a.student_id = (select auth.uid())
      and b.student_id = pid
      and pid <> (select auth.uid())
  )
  and not private.is_blocked((select auth.uid()), pid)
$$;

create or replace function private.has_archipelago_invite_with(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.archipelago_invites i
    where i.status = 'pending'
      and ((i.inviter_id = (select auth.uid()) and i.invitee_id = pid)
        or (i.invitee_id = (select auth.uid()) and i.inviter_id = pid))
  )
  and not private.is_blocked((select auth.uid()), pid)
$$;

-- Transfer archipelago ownership or remove empty groups when a user deletes their account.
create or replace function private.handle_archipelago_member_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec record;
  next_owner uuid;
begin
  for rec in
    select m.archipelago_id, m.role
    from public.archipelago_members m
    where m.student_id = old.id
  loop
    delete from public.archipelago_members
      where archipelago_id = rec.archipelago_id and student_id = old.id;
    select student_id into next_owner
      from public.archipelago_members
      where archipelago_id = rec.archipelago_id
      order by joined_at asc
      limit 1;
    if next_owner is null then
      delete from public.archipelagos where id = rec.archipelago_id;
    elsif rec.role = 'owner' then
      update public.archipelago_members
        set role = 'owner'
        where archipelago_id = rec.archipelago_id and student_id = next_owner;
      update public.archipelagos
        set created_by = next_owner
        where id = rec.archipelago_id;
    end if;
  end loop;
  return old;
end $$;

drop trigger if exists on_profile_delete_transfer_archipelago on public.profiles;
create trigger on_profile_delete_transfer_archipelago
  before delete on public.profiles
  for each row execute function private.handle_archipelago_member_delete();

-- Recompute a single Manila day of tide_daily from server-side attempts + usage_daily.
create or replace function private.recompute_tide_day(p_student_id uuid, p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_attempts int := 0;
  v_correct int := 0;
  v_breaks int := 0;
  v_recent_att int := 0;
  v_recent_acc real := 0;
  v_base_att int := 0;
  v_base_acc real := 0;
  v_effort real := 0;
  v_acc real := 0;
  v_imp real := 0;
  v_score real := 0;
  v_goal boolean := false;
begin
  select
    count(*)::int,
    count(*) filter (where correct)::int
  into v_attempts, v_correct
  from public.attempts
  where student_id = p_student_id
    and (created_at at time zone 'Asia/Manila')::date = p_day;

  select coalesce(breaks, 0)
  into v_breaks
  from public.usage_daily
  where student_id = p_student_id and day = p_day;
  v_breaks := coalesce(v_breaks, 0);

  v_goal := (v_breaks >= 1 or v_attempts >= 3);

  -- Effort (0..45): breaks + questions completed, so showing up matters most.
  v_effort := least(45.0, v_breaks * 15.0 + least(10, v_attempts) * 3.0);

  -- Accuracy (0..35): rewards strong accuracy without zeroing out effort-only breaks.
  if v_attempts > 0 then
    v_acc := (v_correct::real / v_attempts::real) * 35.0;
  elsif v_breaks > 0 then
    v_acc := 18.0;
  else
    v_acc := 0.0;
  end if;

  -- Personal improvement (0..20): compares 7-day rolling accuracy vs prior 14-day baseline.
  select count(*)::int, coalesce(avg(case when correct then 1.0 else 0.0 end), 0.0)::real
  into v_recent_att, v_recent_acc
  from public.attempts
  where student_id = p_student_id
    and (created_at at time zone 'Asia/Manila')::date between (p_day - 6) and p_day;

  select count(*)::int, coalesce(avg(case when correct then 1.0 else 0.0 end), 0.0)::real
  into v_base_att, v_base_acc
  from public.attempts
  where student_id = p_student_id
    and (created_at at time zone 'Asia/Manila')::date between (p_day - 20) and (p_day - 7);

  if v_attempts = 0 and v_breaks = 0 then
    v_imp := 0.0;
  elsif v_base_att >= 5 and v_recent_att > 0 then
    v_imp := greatest(0.0, least(20.0, (v_recent_acc - v_base_acc) * 80.0 + 10.0));
  else
    v_imp := 12.0;
  end if;

  v_score := greatest(0.0, least(100.0, v_effort + v_acc + v_imp));

  insert into public.tide_daily (
    student_id, day, breaks_count, attempts_count, correct_count,
    effort_pts, accuracy_pts, improvement_pts, tide_score, goal_met, updated_at
  )
  values (
    p_student_id, p_day, v_breaks, v_attempts, v_correct,
    v_effort, v_acc, v_imp, v_score, v_goal, now()
  )
  on conflict (student_id, day) do update set
    breaks_count = excluded.breaks_count,
    attempts_count = excluded.attempts_count,
    correct_count = excluded.correct_count,
    effort_pts = excluded.effort_pts,
    accuracy_pts = excluded.accuracy_pts,
    improvement_pts = excluded.improvement_pts,
    tide_score = excluded.tide_score,
    goal_met = excluded.goal_met,
    updated_at = now();
end $$;

create or replace function private.recompute_tide_for_user(p_student_id uuid, p_days int default 7) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  d date;
begin
  for i in 0..(greatest(1, p_days) - 1) loop
    d := v_today - i;
    perform private.recompute_tide_day(p_student_id, d);
  end loop;
end $$;

create or replace function private.trg_attempts_tide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.recompute_tide_day(new.student_id, (new.created_at at time zone 'Asia/Manila')::date);
  return new;
end $$;

drop trigger if exists on_attempt_recompute_tide on public.attempts;
create trigger on_attempt_recompute_tide
  after insert on public.attempts
  for each row execute function private.trg_attempts_tide();

create or replace function private.trg_usage_tide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.breaks is distinct from old.breaks then
    perform private.recompute_tide_day(new.student_id, new.day);
  end if;
  return new;
end $$;

drop trigger if exists on_usage_recompute_tide on public.usage_daily;
create trigger on_usage_recompute_tide
  after insert or update on public.usage_daily
  for each row execute function private.trg_usage_tide();

-- Evaluate all closed Manila days up through yesterday for one archipelago.
create or replace function private.evaluate_archipelago_days(p_arch_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.archipelagos;
  v_yesterday date := (now() at time zone 'Asia/Manila')::date - 1;
  v_start date;
  d date;
  v_member_count int;
  v_met_count int;
  v_week_start date;
begin
  select * into a from public.archipelagos where id = p_arch_id for update;
  if a.id is null then return; end if;

  v_start := coalesce(a.last_evaluated_day + 1, (a.created_at at time zone 'Asia/Manila')::date);
  if v_start > v_yesterday then return; end if;

  d := v_start;
  while d <= v_yesterday loop
    select count(*)::int into v_member_count
    from public.archipelago_members m
    where m.archipelago_id = p_arch_id
      and (m.joined_at at time zone 'Asia/Manila')::date <= d;

    if v_member_count >= 2 then
      select count(*)::int into v_met_count
      from public.archipelago_members m
      join public.tide_daily td on td.student_id = m.student_id and td.day = d
      where m.archipelago_id = p_arch_id
        and (m.joined_at at time zone 'Asia/Manila')::date <= d
        and td.goal_met = true;

      if v_met_count = v_member_count then
        a.streak_days := a.streak_days + 1;
        a.best_streak := greatest(a.best_streak, a.streak_days);
        a.last_counted_day := d;
      else
        v_week_start := date_trunc('week', d)::date;
        if a.streak_days > 0 and (a.freeze_week_start is null or a.freeze_week_start <> v_week_start) then
          a.freeze_week_start := v_week_start;
          a.freeze_used_day := d;
        else
          a.streak_days := 0;
        end if;
      end if;
    end if;

    a.last_evaluated_day := d;
    d := d + 1;
  end loop;

  update public.archipelagos
  set
    streak_days = a.streak_days,
    best_streak = a.best_streak,
    last_counted_day = a.last_counted_day,
    last_evaluated_day = a.last_evaluated_day,
    freeze_week_start = a.freeze_week_start,
    freeze_used_day = a.freeze_used_day
  where id = p_arch_id;
end $$;

create or replace function public.run_nightly_kapuluan_close() returns int
language plpgsql security definer set search_path = '' as $$
declare
  rec record;
  cnt int := 0;
begin
  for rec in select id from public.archipelagos loop
    perform private.evaluate_archipelago_days(rec.id);
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

grant execute on all functions in schema private to authenticated, service_role;

-- ── RLS & Policies ───────────────────────────────────────────────────────

alter table public.archipelagos enable row level security;
alter table public.archipelago_members enable row level security;
alter table public.archipelago_invites enable row level security;
alter table public.tide_daily enable row level security;
alter table public.sagwan_nudges enable row level security;

-- Extend profiles select policy to include archipelago co-members and pending invitees.
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
      and (
        private.has_friend_link_with(id)
        or private.is_classmate_of(id)
        or private.shares_archipelago(id)
        or private.has_archipelago_invite_with(id)
      )
    )
  );

create policy "archipelagos: member read" on public.archipelagos for select to authenticated
  using (private.is_archipelago_member(id));

create policy "archipelago_members: member read" on public.archipelago_members for select to authenticated
  using (private.is_archipelago_member(archipelago_id));

create policy "archipelago_invites: participant read" on public.archipelago_invites for select to authenticated
  using (
    (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()) or private.is_archipelago_member(archipelago_id))
    and not private.is_blocked(inviter_id, invitee_id)
  );

-- Students read only their own raw tide rows; friends receive derived bands via get_my_archipelagos().
create policy "tide_daily: own read" on public.tide_daily for select to authenticated
  using (student_id = (select auth.uid()));

create policy "sagwan: participant read" on public.sagwan_nudges for select to authenticated
  using (
    (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()) or private.is_archipelago_member(archipelago_id))
    and not private.is_blocked(sender_id, recipient_id)
  );

revoke all on public.archipelagos, public.archipelago_members, public.archipelago_invites,
  public.tide_daily, public.sagwan_nudges from anon, authenticated;
grant select on public.archipelagos, public.archipelago_members, public.archipelago_invites,
  public.tide_daily, public.sagwan_nudges to authenticated;
grant all on public.archipelagos, public.archipelago_members, public.archipelago_invites,
  public.tide_daily, public.sagwan_nudges to service_role;

-- ── RPCs ─────────────────────────────────────────────────────────────────

create or replace function public.create_archipelago(
  p_name text,
  p_friend_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_name text := left(trim(coalesce(p_name, '')), 40);
  v_arch_id uuid;
  v_conv_id uuid;
  fid uuid;
  v_invited int := 0;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can create a Kapuluan pact' using errcode = '42501';
  end if;
  if not private.is_social_allowed(uid) then
    raise exception 'Social features are switched off by your guardian' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'Give your barkada pact a name' using errcode = '22023';
  end if;
  if private.contains_profanity(v_name) then
    raise exception 'Choose a friendly barkada name' using errcode = 'P0003';
  end if;
  if (select count(*) from public.archipelago_members where student_id = uid) >= 10 then
    raise exception 'You can join up to 10 barkada pacts' using errcode = 'P0001';
  end if;

  insert into public.archipelagos (name, created_by)
    values (v_name, uid)
    returning id into v_arch_id;

  insert into public.archipelago_members (archipelago_id, student_id, role)
    values (v_arch_id, uid, 'owner');

  insert into public.conversations (kind, archipelago_id)
    values ('archipelago', v_arch_id)
    returning id into v_conv_id;

  insert into public.conversation_members (conversation_id, user_id)
    values (v_conv_id, uid);

  if p_friend_ids is not null then
    foreach fid in array p_friend_ids loop
      exit when v_invited >= 4;
      if fid is not null and fid <> uid and private.is_friend_of(fid) and private.is_social_allowed(fid) then
        insert into public.archipelago_invites (archipelago_id, inviter_id, invitee_id, status)
          values (v_arch_id, uid, fid, 'pending')
          on conflict (archipelago_id, invitee_id) do nothing;
        v_invited := v_invited + 1;
      end if;
    end loop;
  end if;

  perform private.recompute_tide_for_user(uid, 7);

  return jsonb_build_object(
    'id', v_arch_id,
    'name', v_name,
    'conversation_id', v_conv_id,
    'invited_count', v_invited
  );
end $$;

create or replace function public.invite_to_archipelago(p_archipelago_id uuid, p_friend_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  a public.archipelagos;
  v_cnt int;
  v_inv public.archipelago_invites;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can invite friends' using errcode = '42501';
  end if;
  select * into a from public.archipelagos where id = p_archipelago_id for update;
  if a.id is null or not private.is_archipelago_member(p_archipelago_id) then
    raise exception 'Archipelago not found' using errcode = 'P0002';
  end if;
  if not private.is_social_allowed(uid) or not private.is_social_allowed(p_friend_id) then
    raise exception 'Social features are off for one of these accounts' using errcode = '42501';
  end if;
  if not private.is_friend_of(p_friend_id) then
    raise exception 'Invite accepted friends first' using errcode = '42501';
  end if;
  if exists (select 1 from public.archipelago_members where archipelago_id = p_archipelago_id and student_id = p_friend_id) then
    raise exception 'This friend is already in the barkada' using errcode = '22023';
  end if;
  select count(*)::int into v_cnt from public.archipelago_members where archipelago_id = p_archipelago_id;
  if v_cnt >= 5 then
    raise exception 'This barkada already has the 5-island maximum' using errcode = 'P0001';
  end if;

  insert into public.archipelago_invites (archipelago_id, inviter_id, invitee_id, status)
    values (p_archipelago_id, uid, p_friend_id, 'pending')
    on conflict (archipelago_id, invitee_id) do update
      set inviter_id = uid, status = 'pending', created_at = now()
    returning * into v_inv;

  return jsonb_build_object(
    'id', v_inv.id,
    'archipelago_id', v_inv.archipelago_id,
    'invitee_id', v_inv.invitee_id,
    'status', v_inv.status
  );
end $$;

create or replace function public.respond_archipelago_invite(p_invite_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.archipelago_invites;
  v_cnt int;
  v_conv_id uuid;
  v_name text;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can respond to pact invites' using errcode = '42501';
  end if;
  select * into inv from public.archipelago_invites where id = p_invite_id for update;
  if inv.id is null or inv.invitee_id <> uid then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    return jsonb_build_object('id', inv.id, 'archipelago_id', inv.archipelago_id, 'status', inv.status);
  end if;

  if not p_accept then
    update public.archipelago_invites set status = 'declined' where id = inv.id returning * into inv;
    return jsonb_build_object('id', inv.id, 'archipelago_id', inv.archipelago_id, 'status', inv.status);
  end if;

  if not private.is_social_allowed(uid) then
    raise exception 'Social features are switched off by your guardian' using errcode = '42501';
  end if;
  if private.is_blocked(inv.inviter_id, uid) then
    raise exception 'Cannot join this barkada' using errcode = '42501';
  end if;
  if (select count(*) from public.archipelago_members where student_id = uid) >= 10 then
    raise exception 'You can join up to 10 barkada pacts' using errcode = 'P0001';
  end if;

  perform 1 from public.archipelagos where id = inv.archipelago_id for update;
  select count(*)::int into v_cnt from public.archipelago_members where archipelago_id = inv.archipelago_id;
  if v_cnt >= 5 then
    raise exception 'This barkada already reached 5 islands' using errcode = 'P0001';
  end if;

  update public.archipelago_invites set status = 'accepted' where id = inv.id returning * into inv;
  insert into public.archipelago_members (archipelago_id, student_id, role)
    values (inv.archipelago_id, uid, 'member')
    on conflict do nothing;

  select id into v_conv_id from public.conversations where archipelago_id = inv.archipelago_id;
  if v_conv_id is not null then
    insert into public.conversation_members (conversation_id, user_id)
      values (v_conv_id, uid) on conflict do nothing;
    select split_part(display_name, ' ', 1) into v_name from public.profiles where id = uid;
    insert into public.messages (conversation_id, sender_id, sender_label, kind, body)
      values (v_conv_id, uid, coalesce(nullif(v_name, ''), 'Student'), 'system', coalesce(nullif(v_name, ''), 'A friend') || ' built a Tulay bridge to the barkada!');
  end if;

  perform private.recompute_tide_for_user(uid, 7);

  return jsonb_build_object(
    'id', inv.id,
    'archipelago_id', inv.archipelago_id,
    'status', 'accepted',
    'conversation_id', v_conv_id
  );
end $$;

create or replace function public.leave_archipelago(p_archipelago_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_role text;
  v_next uuid;
  v_conv_id uuid;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select role into v_role from public.archipelago_members
    where archipelago_id = p_archipelago_id and student_id = uid;
  if v_role is null then return true; end if;

  delete from public.archipelago_members where archipelago_id = p_archipelago_id and student_id = uid;
  select id into v_conv_id from public.conversations where archipelago_id = p_archipelago_id;
  if v_conv_id is not null then
    delete from public.conversation_members where conversation_id = v_conv_id and user_id = uid;
  end if;

  select student_id into v_next from public.archipelago_members
    where archipelago_id = p_archipelago_id order by joined_at asc limit 1;
  if v_next is null then
    delete from public.archipelagos where id = p_archipelago_id;
  elsif v_role = 'owner' then
    update public.archipelago_members set role = 'owner'
      where archipelago_id = p_archipelago_id and student_id = v_next;
    update public.archipelagos set created_by = v_next where id = p_archipelago_id;
  end if;
  return true;
end $$;

create or replace function public.send_sagwan(
  p_archipelago_id uuid,
  p_recipient_id uuid,
  p_message text default 'Kaya mo ''yan!'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_msg text := left(trim(coalesce(p_message, '')), 80);
  v_sent_today int;
  v_row public.sagwan_nudges;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can throw a Sagwan paddle' using errcode = '42501';
  end if;
  if not private.is_social_allowed(uid) then
    raise exception 'Social features are switched off by your guardian' using errcode = '42501';
  end if;
  if uid = p_recipient_id then
    raise exception 'Cheer for a barkada mate instead' using errcode = '22023';
  end if;
  if not private.is_archipelago_member(p_archipelago_id)
     or not exists (select 1 from public.archipelago_members where archipelago_id = p_archipelago_id and student_id = p_recipient_id) then
    raise exception 'Both students must be in this barkada' using errcode = '42501';
  end if;
  if private.is_blocked(uid, p_recipient_id) then
    raise exception 'Cannot send a paddle to this student' using errcode = '42501';
  end if;
  if char_length(v_msg) < 1 then v_msg := 'Kaya mo ''yan!'; end if;
  if private.contains_profanity(v_msg) then
    raise exception 'Keep Sagwan cheers encouraging' using errcode = 'P0003';
  end if;

  select count(*)::int into v_sent_today
  from public.sagwan_nudges
  where sender_id = uid and day = v_today;
  if v_sent_today >= 5 then
    raise exception 'You already sent 5 paddles today. More tomorrow!' using errcode = 'P0001';
  end if;

  insert into public.sagwan_nudges (archipelago_id, sender_id, recipient_id, message, day)
    values (p_archipelago_id, uid, p_recipient_id, v_msg, v_today)
    returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'archipelago_id', v_row.archipelago_id,
    'sender_id', v_row.sender_id,
    'recipient_id', v_row.recipient_id,
    'message', v_row.message,
    'created_at', v_row.created_at
  );
end $$;

create or replace function public.get_my_archipelagos() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_week date := date_trunc('week', (now() at time zone 'Asia/Manila')::date)::date;
  m_rec record;
  a_rec record;
  v_arches jsonb := '[]'::jsonb;
  v_invites jsonb;
  v_sagwan_today int;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students have Kapuluan archipelagos' using errcode = '42501';
  end if;

  -- Refresh 14-day tide snapshots for caller and their barkada co-members.
  perform private.recompute_tide_for_user(uid, 14);
  for m_rec in
    select distinct am2.student_id
    from public.archipelago_members am1
    join public.archipelago_members am2 on am2.archipelago_id = am1.archipelago_id
    where am1.student_id = uid and am2.student_id <> uid
  loop
    perform private.recompute_tide_for_user(m_rec.student_id, 14);
  end loop;

  for a_rec in
    select a.*
    from public.archipelagos a
    join public.archipelago_members m on m.archipelago_id = a.id
    where m.student_id = uid
    order by a.created_at asc
  loop
    perform private.evaluate_archipelago_days(a_rec.id);

    v_arches := v_arches || jsonb_build_array(
      (
        with refreshed as (
          select * from public.archipelagos where id = a_rec.id
        ),
        raw_members as (
          select
            m.student_id,
            m.role,
            m.joined_at,
            p.display_name,
            p.grade,
            coalesce(pr.built, array['bahay']) as built,
            greatest(
              1,
              least(7, (v_today - least(v_today, (m.joined_at at time zone 'Asia/Manila')::date)) + 1)
            )::real as active_days_7d,
            coalesce((
              select sum(td.tide_score)
              from public.tide_daily td
              where td.student_id = m.student_id
                and td.day between greatest(v_today - 6, (m.joined_at at time zone 'Asia/Manila')::date) and v_today
            ), 0)::real as sum_7d,
            (
              select case when count(*) filter (where td.breaks_count > 0 or td.attempts_count > 0) > 0
                then avg(td.tide_score)::real
                else null
              end
              from public.tide_daily td
              where td.student_id = m.student_id
                and td.day between (v_today - 13) and (v_today - 7)
            ) as prev_7d_agos,
            coalesce((
              select td.goal_met from public.tide_daily td
              where td.student_id = m.student_id and td.day = v_today
            ), false) as goal_met_today,
            coalesce((
              select sum(td.breaks_count)::int from public.tide_daily td
              where td.student_id = m.student_id and td.day between (v_today - 6) and v_today
            ), 0) as breaks_7d
          from public.archipelago_members m
          join public.profiles p on p.id = m.student_id
          left join public.progress pr on pr.student_id = m.student_id
          where m.archipelago_id = a_rec.id
            and (m.student_id = uid or not private.is_blocked(uid, m.student_id))
        ),
        with_agos as (
          select
            rm.*,
            (rm.sum_7d / rm.active_days_7d)::real as agos_7d
          from raw_members rm
        ),
        stats as (
          select
            greatest(30.0, coalesce(percentile_cont(0.5) within group (order by agos_7d), 30.0))::real as anchor,
            max(agos_7d)::real as top_agos,
            max(case when prev_7d_agos is not null then agos_7d - prev_7d_agos else 0.0 end)::real as top_imp
          from with_agos
        ),
        scored as (
          select
            wa.*,
            (case when wa.prev_7d_agos is not null then wa.agos_7d - wa.prev_7d_agos else 0.0 end)::real as improvement_delta,
            greatest(0.0, (st.anchor - wa.agos_7d))::real as drift_gap,
            case
              when st.top_agos <= 0 then 0.0
              when (st.anchor - wa.agos_7d) < 12.0 then 0.0
              else least(1.0, ((st.anchor - wa.agos_7d) - 10.0) / 36.0)
            end::real as drift_level,
            case
              when st.top_agos > 0 and wa.agos_7d = st.top_agos then true
              else false
            end as is_lighthouse_leader,
            case
              when wa.prev_7d_agos is not null
                and (wa.agos_7d - wa.prev_7d_agos) >= 5.0
                and (wa.agos_7d - wa.prev_7d_agos) = st.top_imp then true
              else false
            end as is_most_improved
          from with_agos wa
          cross join stats st
        ),
        recent_sn as (
          select sn2.*
          from public.sagwan_nudges sn2
          where sn2.archipelago_id = a_rec.id
            and sn2.created_at >= now() - interval '3 days'
            and not private.is_blocked(uid, sn2.sender_id)
          order by sn2.created_at desc
          limit 12
        )
        select jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'created_at', r.created_at,
          'streak_days', r.streak_days,
          'best_streak', r.best_streak,
          'today_complete', (
            select count(*) >= 2 and bool_and(goal_met_today) from scored
          ),
          'freeze_available', (r.freeze_week_start is null or r.freeze_week_start <> v_week),
          'freeze_used_this_week', (r.freeze_week_start = v_week),
          'freeze_used_day', r.freeze_used_day,
          'conversation_id', (select c.id from public.conversations c where c.archipelago_id = r.id limit 1),
          'members', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'student_id', s.student_id,
              'is_me', (s.student_id = uid),
              'role', s.role,
              'display_name', s.display_name,
              'grade', s.grade,
              'built', s.built,
              'goal_met_today', s.goal_met_today,
              'breaks_7d', s.breaks_7d,
              'agos_7d', round(s.agos_7d::numeric, 1),
              'improvement_delta', round(s.improvement_delta::numeric, 1),
              'drift_level', round(s.drift_level::numeric, 2),
              'tide_band', case
                when s.drift_level >= 0.65 then 'far_adrift'
                when s.drift_level >= 0.25 then 'drifting'
                when s.agos_7d >= 70 then 'riding_high'
                when s.agos_7d >= 35 then 'steady'
                else 'calm'
              end,
              'is_lighthouse_leader', s.is_lighthouse_leader,
              'is_most_improved', s.is_most_improved
            ) order by (s.student_id = uid) desc, s.agos_7d desc, s.joined_at asc), '[]'::jsonb)
            from scored s
          ),
          'recent_sagwans', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', sn.id,
              'sender_id', sn.sender_id,
              'sender_name', coalesce((select split_part(p.display_name, ' ', 1) from public.profiles p where p.id = sn.sender_id), 'Friend'),
              'recipient_id', sn.recipient_id,
              'recipient_name', coalesce((select split_part(p.display_name, ' ', 1) from public.profiles p where p.id = sn.recipient_id), 'Friend'),
              'message', sn.message,
              'created_at', sn.created_at
            ) order by sn.created_at desc), '[]'::jsonb)
            from recent_sn sn
          )
        )
        from refreshed r
      )
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'archipelago_id', i.archipelago_id,
    'archipelago_name', a.name,
    'inviter_id', i.inviter_id,
    'inviter_name', p.display_name,
    'member_count', (select count(*)::int from public.archipelago_members m where m.archipelago_id = a.id),
    'streak_days', a.streak_days,
    'created_at', i.created_at
  ) order by i.created_at desc), '[]'::jsonb)
  into v_invites
  from public.archipelago_invites i
  join public.archipelagos a on a.id = i.archipelago_id
  join public.profiles p on p.id = i.inviter_id
  where i.invitee_id = uid
    and i.status = 'pending'
    and not private.is_blocked(uid, i.inviter_id);

  select count(*)::int into v_sagwan_today
  from public.sagwan_nudges
  where sender_id = uid and day = v_today;

  return jsonb_build_object(
    'archipelagos', v_arches,
    'incoming_invites', v_invites,
    'sagwan_sent_today', v_sagwan_today,
    'sagwan_daily_limit', 5
  );
end $$;

revoke execute on function
  public.create_archipelago(text, uuid[]),
  public.invite_to_archipelago(uuid, uuid),
  public.respond_archipelago_invite(uuid, boolean),
  public.leave_archipelago(uuid),
  public.send_sagwan(uuid, uuid, text),
  public.get_my_archipelagos()
  from public, anon;

grant execute on function
  public.create_archipelago(text, uuid[]),
  public.invite_to_archipelago(uuid, uuid),
  public.respond_archipelago_invite(uuid, boolean),
  public.leave_archipelago(uuid),
  public.send_sagwan(uuid, uuid, text),
  public.get_my_archipelagos()
  to authenticated;

revoke execute on function public.run_nightly_kapuluan_close() from public, anon, authenticated;
grant execute on function public.run_nightly_kapuluan_close() to service_role;

-- ── Realtime ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table
  public.archipelagos,
  public.archipelago_members,
  public.archipelago_invites,
  public.sagwan_nudges;

-- ── Nightly Manila-time cron (00:05 Asia/Manila = 16:05 UTC) ──────────────

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('kapuluan-nightly-close')
    where exists (select 1 from cron.job where jobname = 'kapuluan-nightly-close');
  perform cron.schedule(
    'kapuluan-nightly-close',
    '5 16 * * *',
    'select public.run_nightly_kapuluan_close();'
  );
exception when others then
  -- Continue cleanly if pg_cron permissions are unavailable; get_my_archipelagos() catches up deterministically.
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
