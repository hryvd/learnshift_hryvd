-- Google (and other OAuth) sign-ups carry no role, so handle_new_user makes
-- them students. The teacher desktop app calls claim_teacher_role() right
-- after a first OAuth sign-in to become a teacher.
--
-- Guard rails (the role stays non-updatable for everyone else):
--   * only the caller's own account, signed in;
--   * the account has no email/password identity (email sign-ups pick
--     their role at sign-up already);
--   * created within the last 30 minutes;
--   * still an untouched student: no class, guardian link or answers.
-- Choosing "teacher" this way grants nothing more than picking Teacher on
-- the email sign-up form does today: teachers only see students who join
-- their class with its code.
create or replace function public.claim_teacher_role() returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  current_role_ text;
  created timestamptz;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select role into current_role_ from public.profiles where id = uid for update;
  if current_role_ = 'teacher' then
    return json_build_object('role', 'teacher');
  end if;
  if current_role_ is distinct from 'student' then
    return json_build_object('error', 'This account already has another role.', 'code', 'role_taken');
  end if;

  select u.created_at into created from auth.users u where u.id = uid;
  if created < now() - interval '30 minutes'
     or exists (select 1 from auth.identities i where i.user_id = uid and i.provider = 'email')
     or exists (select 1 from public.class_members m where m.student_id = uid)
     or exists (select 1 from public.guardian_links g where g.student_id = uid)
     or exists (select 1 from public.attempts a where a.student_id = uid) then
    return json_build_object(
      'error', 'This account is already set up as a student. Use another account for teaching.',
      'code', 'student_account');
  end if;

  update public.profiles set role = 'teacher', grade = null where id = uid;
  delete from public.student_settings where student_id = uid;
  delete from public.progress where student_id = uid;
  return json_build_object('role', 'teacher');
end $$;

revoke all on function public.claim_teacher_role() from public, anon;
grant execute on function public.claim_teacher_role() to authenticated;
