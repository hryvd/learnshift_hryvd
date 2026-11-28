-- Item 1: Server-authoritative reward ledger and coin-freeze trigger.
-- Rewards are append-only in public.reward_events via public.claim_reward().
-- progress.coins is derived from reward_events; direct client updates to
-- progress.coins are silently ignored so older APKs keep syncing cleanly.

-- 1. Extend attempts.context to include 'module' and 'overlay'.
alter table public.attempts drop constraint if exists attempts_context_check;
alter table public.attempts
  add constraint attempts_context_check
  check (context in ('quiz', 'break', 'pretest', 'feed', 'module', 'overlay'));

-- 2. Append-only reward ledger (student-only; guardians & teachers see 0 rows).
create table if not exists public.reward_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (char_length(trim(key)) between 1 and 160),
  kind text not null check (kind in ('break', 'quiz', 'overlay_quiz', 'deck', 'focus', 'module', 'legacy')),
  amount int not null check (amount >= 0 and (kind = 'legacy' or amount <= 1000)),
  ref text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (student_id, key)
);

create index if not exists reward_events_student_created_idx
  on public.reward_events (student_id, created_at desc);

alter table public.reward_events enable row level security;

drop policy if exists "reward events: student reads own" on public.reward_events;
create policy "reward events: student reads own"
  on public.reward_events for select to authenticated
  using (student_id = (select auth.uid()));

revoke all on public.reward_events from anon, authenticated;
grant select on public.reward_events to authenticated;
grant all on public.reward_events to service_role;

-- 3. Backfill existing balances BEFORE attaching the credit trigger so
--    existing students keep their exact balance with zero double-counting.
insert into public.reward_events (student_id, key, kind, amount, ref, meta)
select p.student_id, 'legacy:opening', 'legacy', greatest(0, p.coins), 'backfill', '{}'::jsonb
from public.progress p
where p.coins > 0
on conflict (student_id, key) do nothing;

-- 4. Pure server-side reward calculation (must match src/lib/rewards.ts).
create or replace function private.reward_amount(p_kind text, p_meta jsonb) returns int
language plpgsql immutable set search_path = '' as $$
declare
  v_correct int;
  v_minutes numeric;
begin
  case p_kind
    when 'break' then
      return 20;
    when 'quiz', 'overlay_quiz' then
      v_correct := greatest(0, least(5, coalesce((p_meta ->> 'correct')::int, 0)));
      return v_correct * 10;
    when 'deck' then
      return 5;
    when 'focus' then
      v_minutes := greatest(0, least(120, coalesce((p_meta ->> 'minutes')::numeric, 0)));
      return round(v_minutes / 5.0)::int * 3;
    when 'module' then
      return 25;
    else
      return 0;
  end case;
end $$;

-- 5. AFTER INSERT trigger on reward_events credits progress.coins.
create or replace function private.trg_reward_event_credit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.reward_credit', '1', true);
  update public.progress
    set coins = coins + new.amount,
        updated_at = now()
    where student_id = new.student_id;
  perform set_config('app.reward_credit', '0', true);
  return new;
end $$;

drop trigger if exists on_reward_event_credit on public.reward_events;
create trigger on_reward_event_credit
  after insert on public.reward_events
  for each row execute function private.trg_reward_event_credit();

-- 6. BEFORE UPDATE trigger on progress freezes coins against direct client writes
--    without breaking older APKs that still include `coins` in progress updates.
create or replace function private.trg_progress_freeze_coins() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.reward_credit', true) = '1' and pg_trigger_depth() >= 2 then
    return new;
  end if;
  if current_user in ('service_role', 'supabase_admin') and (select auth.uid()) is null then
    return new;
  end if;
  new.coins := old.coins;
  return new;
end $$;

drop trigger if exists on_progress_freeze_coins on public.progress;
create trigger on_progress_freeze_coins
  before update on public.progress
  for each row execute function private.trg_progress_freeze_coins();

-- 7. Server-authoritative idempotent reward claim RPC.
create or replace function public.claim_reward(
  p_key text,
  p_kind text,
  p_ref text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_key text := trim(coalesce(p_key, ''));
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_coins int := 0;
  v_existing_amount int;
  v_session_id text;
  v_att_count int := 0;
  v_correct int := 0;
  v_module_id uuid;
  v_module_ok boolean := false;
  v_focus_mins int := 0;
  v_focus_today int := 0;
  v_kind_count int := 0;
  v_today_coins int := 0;
  v_amount int := 0;
  v_inserted_id uuid;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can claim rewards' using errcode = '42501';
  end if;

  if char_length(v_key) < 1 or char_length(v_key) > 160 then
    raise exception 'Invalid reward key' using errcode = '22023';
  end if;

  if p_kind not in ('break', 'quiz', 'overlay_quiz', 'deck', 'focus', 'module') then
    raise exception 'Invalid reward kind' using errcode = '22023';
  end if;

  -- Serialize per student so concurrent claims cannot race daily caps.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 2701));

  select coalesce(coins, 0) into v_coins from public.progress where student_id = uid;

  -- Idempotency check first: an already-applied key always returns duplicate.
  select amount into v_existing_amount
  from public.reward_events
  where student_id = uid and key = v_key;
  if found then
    return jsonb_build_object('status', 'duplicate', 'amount', v_existing_amount, 'coins', v_coins);
  end if;

  -- Reuse private rate-limit helper (generous for real use, stops abuse).
  if not private.take_rate(uid, 'claim_reward', 60, 3600) then
    raise exception 'Too many reward requests. Try again later.' using errcode = 'P0001';
  end if;

  -- Evidence checks per kind.
  if p_kind in ('quiz', 'overlay_quiz') then
    v_session_id := coalesce(
      nullif(trim(v_meta ->> 'sessionId'), ''),
      nullif(trim(p_ref), ''),
      case
        when v_key like 'quiz:%' then substr(v_key, 6)
        when v_key like 'overlay:%' then substr(v_key, 9)
        else ''
      end
    );
    if char_length(v_session_id) < 1 then
      return jsonb_build_object('status', 'pending_evidence', 'amount', 0, 'coins', v_coins);
    end if;

    select
      count(*)::int,
      count(*) filter (where correct)::int
    into v_att_count, v_correct
    from public.attempts
    where student_id = uid
      and left(client_id, char_length(v_session_id) + 1) = v_session_id || ':';

    if v_att_count = 0 then
      return jsonb_build_object('status', 'pending_evidence', 'amount', 0, 'coins', v_coins);
    end if;

    v_correct := greatest(0, least(5, v_correct));
    v_meta := jsonb_set(v_meta, '{correct}', to_jsonb(v_correct));
  elsif p_kind = 'module' then
    begin
      v_module_id := nullif(trim(coalesce(p_ref, '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid module reference' using errcode = '22023';
    end;
    if v_module_id is null or v_key <> ('module:' || v_module_id::text) then
      raise exception 'Invalid module reward key' using errcode = '22023';
    end if;
    select exists (
      select 1
      from public.class_modules m
      where m.id = v_module_id
        and m.published = true
        and private.is_member_of(m.class_id)
    ) into v_module_ok;
    if not v_module_ok then
      raise exception 'Module is not assigned to your class' using errcode = '42501';
    end if;
  elsif p_kind = 'focus' then
    v_focus_mins := greatest(0, least(120, coalesce((v_meta ->> 'minutes')::int, 0)));
    select coalesce(sum(greatest(0, least(120, coalesce((meta ->> 'minutes')::int, 0)))), 0)::int
    into v_focus_today
    from public.reward_events
    where student_id = uid
      and kind = 'focus'
      and (created_at at time zone 'Asia/Manila')::date = v_today;

    if v_focus_mins <= 0 or v_focus_today >= 240 then
      return jsonb_build_object('status', 'capped', 'amount', 0, 'coins', v_coins);
    end if;
    v_focus_mins := least(v_focus_mins, 240 - v_focus_today);
    v_meta := jsonb_set(v_meta, '{minutes}', to_jsonb(v_focus_mins));
  end if;

  -- Per-kind daily caps (Asia/Manila day).
  if p_kind = 'break' then
    select count(*)::int into v_kind_count
    from public.reward_events
    where student_id = uid
      and kind = 'break'
      and (created_at at time zone 'Asia/Manila')::date = v_today;
    if v_kind_count >= 12 then
      return jsonb_build_object('status', 'capped', 'amount', 0, 'coins', v_coins);
    end if;
  elsif p_kind = 'deck' then
    select count(*)::int into v_kind_count
    from public.reward_events
    where student_id = uid
      and kind = 'deck'
      and (created_at at time zone 'Asia/Manila')::date = v_today;
    if v_kind_count >= 30 then
      return jsonb_build_object('status', 'capped', 'amount', 0, 'coins', v_coins);
    end if;
  end if;

  v_amount := private.reward_amount(p_kind, v_meta);

  -- Total daily cap: 600 coins/day per student (Asia/Manila), excluding legacy backfill.
  select coalesce(sum(amount), 0)::int into v_today_coins
  from public.reward_events
  where student_id = uid
    and kind <> 'legacy'
    and (created_at at time zone 'Asia/Manila')::date = v_today;

  if v_amount > 0 then
    if v_today_coins >= 600 then
      return jsonb_build_object('status', 'capped', 'amount', 0, 'coins', v_coins);
    end if;
    v_amount := least(v_amount, 600 - v_today_coins);
  end if;

  insert into public.reward_events (student_id, key, kind, amount, ref, meta)
  values (uid, v_key, p_kind, v_amount, p_ref, v_meta)
  on conflict (student_id, key) do nothing
  returning id into v_inserted_id;

  select coalesce(coins, 0) into v_coins from public.progress where student_id = uid;

  if v_inserted_id is null then
    return jsonb_build_object('status', 'duplicate', 'amount', v_amount, 'coins', v_coins);
  end if;

  return jsonb_build_object('status', 'applied', 'amount', v_amount, 'coins', v_coins);
end $$;

-- 8. Explicit function privileges (keep private helpers unexposed).
revoke execute on function
  private.reward_amount(text, jsonb),
  private.trg_reward_event_credit(),
  private.trg_progress_freeze_coins()
  from public, anon, authenticated;

grant execute on function
  private.reward_amount(text, jsonb)
  to service_role;

revoke execute on function public.claim_reward(text, text, text, jsonb) from public, anon;
grant execute on function public.claim_reward(text, text, text, jsonb) to authenticated;
