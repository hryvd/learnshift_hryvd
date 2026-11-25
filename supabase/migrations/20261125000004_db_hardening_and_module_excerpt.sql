-- Allow empty source_excerpt for P2P-hosted teacher modules (raw files stay off cloud tables).
alter table public.class_modules
  alter column source_excerpt set default '';
alter table public.class_modules
  drop constraint if exists class_modules_source_excerpt_check;
alter table public.class_modules
  add constraint class_modules_source_excerpt_check
  check (char_length(source_excerpt) between 0 and 12000);

-- Revoke direct EXECUTE from authenticated/anon/public on internal mutating SECURITY DEFINER
-- helpers in schema private that were re-granted by `grant execute on all functions in schema private`.
revoke execute on function
  private.take_link_attempt(uuid),
  private.take_rate(uuid, text, int, int),
  private.ensure_dm_conversation(uuid, uuid),
  private.create_or_accept_friendship(uuid, uuid),
  private.recompute_tide_day(uuid, date),
  private.recompute_tide_for_user(uuid, int),
  private.evaluate_archipelago_days(uuid),
  private.handle_new_user(),
  private.anonymize_deleted_student_messages(),
  private.handle_archipelago_member_delete(),
  private.trg_attempts_tide(),
  private.trg_usage_tide()
  from public, anon, authenticated;

grant execute on function
  private.take_link_attempt(uuid),
  private.take_rate(uuid, text, int, int),
  private.ensure_dm_conversation(uuid, uuid),
  private.create_or_accept_friendship(uuid, uuid),
  private.recompute_tide_day(uuid, date),
  private.recompute_tide_for_user(uuid, int),
  private.evaluate_archipelago_days(uuid)
  to service_role;
