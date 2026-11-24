-- Teacher curriculum modules (AI-generated flashcards & quizzes) and
-- Guardian break-timer / instant total-lockdown controls.

alter table public.guardian_controls
  add column if not exists break_interval_sec integer check (break_interval_sec between 15 and 3600),
  add column if not exists lock_now boolean not null default false;

create table if not exists public.class_modules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  subject text not null default 'general' check (char_length(subject) between 1 and 40),
  source_name text,
  source_excerpt text not null check (char_length(source_excerpt) between 1 and 12000),
  summary text not null default '',
  flashcards jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_modules_class_created_idx on public.class_modules (class_id, created_at desc);
create index if not exists class_modules_teacher_idx on public.class_modules (teacher_id);

alter table public.class_modules enable row level security;

-- Privacy rule: only the owning teacher and students enrolled in that class see
-- published modules. Guardians receive 0 rows (habits only, never coursework/grades).
create policy "class modules: teacher and enrolled students read" on public.class_modules
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (published = true and private.is_member_of(class_id))
  );

create policy "class modules: owning teacher inserts" on public.class_modules
  for insert to authenticated
  with check (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  );

create policy "class modules: owning teacher updates" on public.class_modules
  for update to authenticated
  using (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  )
  with check (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  );

create policy "class modules: owning teacher deletes" on public.class_modules
  for delete to authenticated
  using (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.class_modules to authenticated;
grant all on public.class_modules to service_role;

alter publication supabase_realtime add table public.class_modules;
