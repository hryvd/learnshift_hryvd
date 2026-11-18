-- Add grade-school accounts without invalidating existing senior-high profiles.
alter table public.profiles drop constraint profiles_grade_check;
alter table public.profiles add constraint profiles_grade_check check (grade between 1 and 12);
alter table public.classes drop constraint classes_grade_check;
alter table public.classes add constraint classes_grade_check check (grade between 1 and 12);

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
  n text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 60);
  l text := coalesce(new.raw_user_meta_data ->> 'lang', 'en');
  grade_text text := new.raw_user_meta_data ->> 'grade';
  g smallint;
begin
  if r not in ('student', 'guardian', 'teacher') then r := 'student'; end if;
  if l not in ('en', 'fil') then l := 'en'; end if;
  if grade_text ~ '^(0?[1-9]|1[0-2])$' then g := grade_text::smallint; end if;
  insert into public.profiles (id, role, display_name, grade, lang) values (new.id, r, n, g, l);
  if r = 'student' then
    insert into public.student_settings (student_id) values (new.id);
    insert into public.progress (student_id) values (new.id);
  end if;
  return new;
end $$;

-- The old RPCs inserted an attempt and then raised an exception: PostgreSQL
-- rolled back that insert, so wrong codes were never counted. Return a normal
-- error result after accounting for every attempt. Serialize concurrent calls
-- for the same account so parallel requests cannot evade the shared limit.
create function private.take_link_attempt(uid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 1701));
  delete from private.link_attempts where user_id = uid and at <= now() - interval '1 hour';
  if (select count(*) from private.link_attempts where user_id = uid) >= 10 then
    return false;
  end if;
  insert into private.link_attempts (user_id) values (uid);
  return true;
end $$;
revoke all on function private.take_link_attempt(uuid) from public, anon, authenticated;

create or replace function public.link_student(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  sid uuid;
  sname text;
begin
  if uid is null or private.my_role() <> 'guardian' then
    raise exception 'Only guardians can link to a student' using errcode = '42501';
  end if;
  if not private.take_link_attempt(uid) then
    return json_build_object('error', 'Too many tries. Wait an hour and try again.', 'code', 'rate_limited');
  end if;
  select student_id into sid from public.link_codes where code = trim(coalesce(p_code, ''));
  if sid is null then
    return json_build_object('error', 'That code does not match a student.', 'code', 'invalid_code');
  end if;
  insert into public.guardian_links (guardian_id, student_id) values (uid, sid) on conflict do nothing;
  insert into public.guardian_controls (student_id, updated_by) values (sid, uid) on conflict do nothing;
  select display_name into sname from public.profiles where id = sid;
  return json_build_object('student_id', sid, 'name', sname);
end $$;

create or replace function public.join_class(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cl public.classes;
begin
  if uid is null or private.my_role() <> 'student' then
    raise exception 'Only students can join a class' using errcode = '42501';
  end if;
  if not private.take_link_attempt(uid) then
    return json_build_object('error', 'Too many tries. Wait an hour and try again.', 'code', 'rate_limited');
  end if;
  select * into cl from public.classes where join_code = upper(trim(coalesce(p_code, '')));
  if cl.id is null then
    return json_build_object('error', 'That class code does not exist.', 'code', 'invalid_code');
  end if;
  insert into public.class_members (class_id, student_id) values (cl.id, uid) on conflict do nothing;
  return json_build_object('class_id', cl.id, 'name', cl.name, 'grade', cl.grade);
end $$;
