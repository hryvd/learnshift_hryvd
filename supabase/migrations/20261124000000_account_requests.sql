-- Student sign-out & remove-account approval requests (linked guardian approves)
-- plus 'messaging' app category support so messenger/chat apps don't trigger quiz popups.

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('sign_out', 'delete_account')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'completed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);

create index if not exists account_requests_student_idx on public.account_requests (student_id, created_at desc);

alter table public.account_requests enable row level security;

create policy "account requests: read" on public.account_requests
  for select to authenticated
  using (student_id = (select auth.uid()) or private.is_guardian_of(student_id));

create policy "account requests: student asks" on public.account_requests
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'pending'
    and private.my_role() = 'student'
  );

revoke all on public.account_requests from anon;
grant select on public.account_requests to authenticated;
grant insert (kind) on public.account_requests to authenticated;
grant all on public.account_requests to service_role;

create or replace function public.decide_account_request(p_id uuid, p_approve boolean) returns public.account_requests
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r public.account_requests;
begin
  select * into r from public.account_requests where id = p_id for update;
  if r.id is null or not private.is_guardian_of(r.student_id) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    return r;
  end if;
  update public.account_requests
    set status = case when p_approve then 'approved' else 'declined' end,
        decided_at = now(),
        decided_by = uid
    where id = p_id
    returning * into r;
  return r;
end $$;

create or replace function public.complete_account_request(p_id uuid) returns public.account_requests
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r public.account_requests;
begin
  select * into r from public.account_requests where id = p_id for update;
  if r.id is null or r.student_id <> uid then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status = 'approved' then
    update public.account_requests
      set status = 'completed'
      where id = p_id
      returning * into r;
  end if;
  return r;
end $$;

revoke execute on function public.decide_account_request(uuid, boolean), public.complete_account_request(uuid) from public, anon;
grant execute on function public.decide_account_request(uuid, boolean), public.complete_account_request(uuid) to authenticated;

alter publication supabase_realtime add table public.account_requests;

alter table public.app_usage drop constraint if exists app_usage_category_check;
alter table public.app_usage add constraint app_usage_category_check
  check (category in ('video', 'social', 'games', 'messaging', 'study', 'other'));

alter table public.live_status drop constraint if exists live_status_category_check;
alter table public.live_status add constraint live_status_category_check
  check (category in ('video', 'social', 'games', 'messaging', 'study', 'other'));
