-- Item 7: Private module sources, editable teacher quiz drafts, and immutable
-- versioned class assignments via public.assign_quiz().

-- 1. Private Storage bucket for teacher-uploaded originals (max 20 MB, 6 safe MIME types).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'module-sources',
  'module-sources',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "module-sources: owner select" on storage.objects;
create policy "module-sources: owner select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'module-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "module-sources: teacher owner insert" on storage.objects;
create policy "module-sources: teacher owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'module-sources'
    and private.my_role() = 'teacher'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "module-sources: owner delete" on storage.objects;
create policy "module-sources: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'module-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 2. Teacher-owned original file metadata (owner-only RLS; never visible to students/guardians).
create table if not exists public.module_sources (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique check (char_length(trim(storage_path)) between 1 and 500),
  file_name text not null check (char_length(trim(file_name)) between 1 and 255),
  mime text not null check (mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html'
  )),
  size_bytes int not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  extracted_text text not null default '' check (char_length(extracted_text) <= 200000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists module_sources_teacher_idx
  on public.module_sources (teacher_id, created_at desc);

alter table public.module_sources enable row level security;

drop policy if exists "module sources: owner only" on public.module_sources;
create policy "module sources: owner only"
  on public.module_sources for all to authenticated
  using (teacher_id = (select auth.uid()) and private.my_role() = 'teacher')
  with check (teacher_id = (select auth.uid()) and private.my_role() = 'teacher');

revoke all on public.module_sources from anon;
grant select, insert, update, delete on public.module_sources to authenticated;
grant all on public.module_sources to service_role;

-- 3. Private teacher quiz drafts (owner-only RLS; never visible to students/guardians).
create table if not exists public.quiz_drafts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source_id uuid references public.module_sources (id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  subject text not null default 'general' check (char_length(trim(subject)) between 1 and 40),
  summary text not null default '' check (char_length(summary) <= 4000),
  flashcards jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists quiz_drafts_teacher_updated_idx
  on public.quiz_drafts (teacher_id, updated_at desc);

alter table public.quiz_drafts enable row level security;

drop policy if exists "quiz drafts: owner only" on public.quiz_drafts;
create policy "quiz drafts: owner only"
  on public.quiz_drafts for all to authenticated
  using (teacher_id = (select auth.uid()) and private.my_role() = 'teacher')
  with check (teacher_id = (select auth.uid()) and private.my_role() = 'teacher');

revoke all on public.quiz_drafts from anon;
grant select, insert, update, delete on public.quiz_drafts to authenticated;
grant all on public.quiz_drafts to service_role;

-- Bump version and updated_at on every draft update.
create or replace function private.trg_quiz_drafts_bump_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists on_quiz_draft_bump_version on public.quiz_drafts;
create trigger on_quiz_draft_bump_version
  before update on public.quiz_drafts
  for each row execute function private.trg_quiz_drafts_bump_version();

-- 4. Content validator for quiz drafts and assignments.
create or replace function private.validate_quiz_content(
  p_title text,
  p_questions jsonb,
  p_flashcards jsonb
) returns void
language plpgsql immutable set search_path = '' as $$
declare
  q jsonb;
  opt jsonb;
  v_idx int := 0;
  v_ans int;
begin
  if char_length(trim(coalesce(p_title, ''))) < 1 or char_length(trim(coalesce(p_title, ''))) > 120 then
    raise exception 'Title must be between 1 and 120 characters' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_flashcards, '[]'::jsonb)) <> 'array' then
    raise exception 'Flashcards must be a list' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_questions, 'null'::jsonb)) <> 'array' then
    raise exception 'Questions must be a list' using errcode = '22023';
  end if;

  if jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 30 then
    raise exception 'Quizzes must have between 1 and 30 questions' using errcode = '22023';
  end if;

  for q in select value from jsonb_array_elements(p_questions) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(q) <> 'object' then
      raise exception 'Question % is invalid', v_idx using errcode = '22023';
    end if;
    if char_length(trim(coalesce(q ->> 'prompt', ''))) < 1 then
      raise exception 'Question % needs a prompt', v_idx using errcode = '22023';
    end if;
    if jsonb_typeof(q -> 'options') <> 'array' or jsonb_array_length(q -> 'options') <> 4 then
      raise exception 'Question % must have 4 options', v_idx using errcode = '22023';
    end if;
    for opt in select value from jsonb_array_elements(q -> 'options') loop
      if jsonb_typeof(opt) <> 'string' or char_length(trim(opt #>> '{}')) < 1 then
        raise exception 'Question % has an empty option', v_idx using errcode = '22023';
      end if;
    end loop;
    begin
      v_ans := (q ->> 'answer')::int;
    exception when invalid_text_representation then
      raise exception 'Question % answer must be between 0 and 3', v_idx using errcode = '22023';
    end;
    if v_ans is null or v_ans < 0 or v_ans > 3 then
      raise exception 'Question % answer must be between 0 and 3', v_idx using errcode = '22023';
    end if;
  end loop;
end $$;

-- 5. Extend class_modules for versioned immutable snapshots.
alter table public.class_modules
  add column if not exists quiz_id uuid references public.quiz_drafts (id) on delete set null,
  add column if not exists quiz_version int check (quiz_version is null or quiz_version >= 1),
  add column if not exists assigned_at timestamptz,
  add column if not exists share_source boolean not null default false,
  add column if not exists source_id uuid references public.module_sources (id) on delete set null;

create unique index if not exists class_modules_quiz_ver_class_uidx
  on public.class_modules (quiz_id, quiz_version, class_id)
  where quiz_id is not null and quiz_version is not null;

-- 6. Backfill existing class_modules into quiz_drafts (version 1) BEFORE attaching immutability guard.
do $$
declare
  m record;
  v_draft_id uuid;
begin
  for m in
    select id, teacher_id, title, subject, summary, flashcards, questions, created_at
    from public.class_modules
    where quiz_id is null
  loop
    insert into public.quiz_drafts (
      teacher_id, title, subject, summary, flashcards, questions, version, created_at, updated_at
    )
    values (
      m.teacher_id, m.title, m.subject, m.summary, m.flashcards, m.questions, 1, m.created_at, m.created_at
    )
    returning id into v_draft_id;

    update public.class_modules
      set quiz_id = v_draft_id,
          quiz_version = 1,
          assigned_at = m.created_at
      where id = m.id;
  end loop;
end $$;

-- 7. Guard class_modules: rows with a quiz_id are immutable snapshots written ONLY by assign_quiz().
drop policy if exists "class modules: owning teacher inserts" on public.class_modules;
create policy "class modules: owning teacher inserts" on public.class_modules
  for insert to authenticated
  with check (
    quiz_id is null
    and teacher_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  );

drop policy if exists "class modules: owning teacher updates" on public.class_modules;
create policy "class modules: owning teacher updates" on public.class_modules
  for update to authenticated
  using (
    quiz_id is null
    and teacher_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  )
  with check (
    quiz_id is null
    and teacher_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  );

create or replace function private.trg_class_modules_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.assign_quiz', true) = '1' then
    return new;
  end if;
  if (select auth.uid()) is null and current_user in ('service_role', 'supabase_admin') then
    return new;
  end if;
  if new.quiz_id is not null or (tg_op = 'UPDATE' and old.quiz_id is not null) then
    raise exception 'Assigned quizzes can only be published via assign_quiz' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists on_class_modules_immutable on public.class_modules;
create trigger on_class_modules_immutable
  before insert or update on public.class_modules
  for each row execute function private.trg_class_modules_immutable();

-- 8. RPC: assign_quiz(p_quiz_id, p_expected_version, p_class_ids, p_share_source)
create or replace function public.assign_quiz(
  p_quiz_id uuid,
  p_expected_version int,
  p_class_ids uuid[],
  p_share_source boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_draft public.quiz_drafts;
  v_source_name text := null;
  v_cids uuid[];
  v_cid uuid;
  v_mod public.class_modules;
  v_out jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if uid is null or private.my_role() <> 'teacher' then
    raise exception 'Only teachers can assign quizzes' using errcode = '42501';
  end if;

  select * into v_draft
  from public.quiz_drafts
  where id = p_quiz_id and teacher_id = uid and archived_at is null
  for update;

  if v_draft.id is null then
    raise exception 'Quiz draft not found' using errcode = 'P0002';
  end if;

  if v_draft.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'current_version', v_draft.version
    );
  end if;

  perform private.validate_quiz_content(v_draft.title, v_draft.questions, v_draft.flashcards);

  select array_agg(distinct x) into v_cids
  from unnest(coalesce(p_class_ids, array[]::uuid[])) as x
  where x is not null;

  if v_cids is null or array_length(v_cids, 1) is null then
    raise exception 'Choose at least one class' using errcode = '22023';
  end if;

  -- Verify ownership of every target class.
  foreach v_cid in array v_cids loop
    if not exists (select 1 from public.classes c where c.id = v_cid and c.teacher_id = uid) then
      raise exception 'You do not own one of the selected classes' using errcode = '42501';
    end if;
  end loop;

  if v_draft.source_id is not null then
    select file_name into v_source_name
    from public.module_sources
    where id = v_draft.source_id and teacher_id = uid and deleted_at is null;
  end if;

  perform set_config('app.assign_quiz', '1', true);

  foreach v_cid in array v_cids loop
    -- Unpublish previous versions of this quiz in this class; student attempts stay intact.
    update public.class_modules
      set published = false,
          updated_at = v_now
      where class_id = v_cid
        and quiz_id = v_draft.id
        and quiz_version is distinct from v_draft.version
        and published = true;

    insert into public.class_modules (
      class_id, teacher_id, title, subject, source_name, source_excerpt,
      summary, flashcards, questions, published,
      quiz_id, quiz_version, assigned_at, share_source, source_id, updated_at
    )
    values (
      v_cid, uid, trim(v_draft.title), trim(v_draft.subject), v_source_name,
      left(coalesce(nullif(trim(v_draft.summary), ''), trim(v_draft.title)), 600),
      v_draft.summary, v_draft.flashcards, v_draft.questions, true,
      v_draft.id, v_draft.version, v_now, coalesce(p_share_source, false), v_draft.source_id, v_now
    )
    on conflict (quiz_id, quiz_version, class_id)
      where quiz_id is not null and quiz_version is not null
    do update set
      published = true,
      share_source = excluded.share_source,
      updated_at = v_now
    returning * into v_mod;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_mod.id,
      'class_id', v_mod.class_id,
      'title', v_mod.title,
      'subject', v_mod.subject,
      'source_name', v_mod.source_name,
      'summary', v_mod.summary,
      'flashcards', v_mod.flashcards,
      'questions', v_mod.questions,
      'published', v_mod.published,
      'quiz_id', v_mod.quiz_id,
      'quiz_version', v_mod.quiz_version,
      'assigned_at', v_mod.assigned_at,
      'share_source', v_mod.share_source,
      'source_id', v_mod.source_id,
      'created_at', v_mod.created_at
    ));
  end loop;

  perform set_config('app.assign_quiz', '0', true);

  return jsonb_build_object(
    'status', 'assigned',
    'quiz_id', v_draft.id,
    'version', v_draft.version,
    'modules', v_out
  );
end $$;

-- 9. Explicit function privileges.
revoke execute on function
  private.trg_quiz_drafts_bump_version(),
  private.validate_quiz_content(text, jsonb, jsonb),
  private.trg_class_modules_immutable()
  from public, anon, authenticated;

grant execute on function
  private.validate_quiz_content(text, jsonb, jsonb)
  to service_role;

revoke execute on function public.assign_quiz(uuid, int, uuid[], boolean) from public, anon;
grant execute on function public.assign_quiz(uuid, int, uuid[], boolean) to authenticated;

-- 10. Realtime publication for teacher drafts.
do $$
begin
  alter publication supabase_realtime add table public.quiz_drafts;
exception when duplicate_object then
  null;
end $$;
