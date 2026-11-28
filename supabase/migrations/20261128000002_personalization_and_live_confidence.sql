-- Item 2: Synced learning_subject on student_settings (student-editable only).
-- Item 8: live_status.confidence ('visible' | 'inferred') so guardians only see
--         LIVE when an app was actually observed in the foreground.

-- 1. student_settings.learning_subject
alter table public.student_settings
  add column if not exists learning_subject text null;

alter table public.student_settings
  drop constraint if exists student_settings_learning_subject_check;

alter table public.student_settings
  add constraint student_settings_learning_subject_check
  check (
    learning_subject is null
    or learning_subject in ('mixed', 'math', 'english', 'filipino', 'science', 'araling-panlipunan')
  );

-- Guardians may update bedtime/limit settings, never the student's learning_subject.
create or replace function private.trg_student_settings_guard_subject() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is not null and uid <> new.student_id then
    if tg_op = 'INSERT' and new.learning_subject is not null then
      raise exception 'Only the student can change learning subject' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.learning_subject is distinct from old.learning_subject then
      raise exception 'Only the student can change learning subject' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_student_settings_guard_subject on public.student_settings;
create trigger on_student_settings_guard_subject
  before insert or update on public.student_settings
  for each row execute function private.trg_student_settings_guard_subject();

revoke execute on function private.trg_student_settings_guard_subject()
  from public, anon, authenticated;

-- 2. live_status.confidence (defaults to 'visible' for backwards compatibility with older APKs)
alter table public.live_status
  add column if not exists confidence text not null default 'visible';

alter table public.live_status
  drop constraint if exists live_status_confidence_check;

alter table public.live_status
  add constraint live_status_confidence_check
  check (confidence in ('visible', 'inferred'));
