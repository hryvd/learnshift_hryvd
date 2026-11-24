-- Privacy-safe qualitative learning profile for linked guardians.
-- Exposes only learner style and strong/growing topic IDs (never numeric grades,
-- scores, or raw answers), preserving LearnShift's strict role privacy boundary.

create function public.guardian_learning_profile(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_strong jsonb;
  v_growing jsonb;
  v_total int := 0;
  v_avg_sec numeric := 0;
  v_hint_rate numeric := 0;
  v_best_ctx text := null;
  v_style text := 'getting_started';
begin
  if not private.is_guardian_of(p_student_id) then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(s.skill_id), '[]'::jsonb) into v_strong
  from (
    select m.skill_id
    from public.mastery m
    where m.student_id = p_student_id and m.p >= 0.65
    order by m.p desc, m.updated_at desc
    limit 3
  ) s;

  select coalesce(jsonb_agg(g.skill_id), '[]'::jsonb) into v_growing
  from (
    select m.skill_id
    from public.mastery m
    where m.student_id = p_student_id and m.p < 0.65
    order by m.updated_at desc, m.p asc
    limit 2
  ) g;

  select
    count(*)::int,
    coalesce(avg(a.seconds), 0),
    coalesce(avg(case when a.hints > 0 then 1.0 else 0.0 end), 0)
  into v_total, v_avg_sec, v_hint_rate
  from public.attempts a
  where a.student_id = p_student_id
    and a.created_at >= now() - interval '30 days';

  select c.context into v_best_ctx
  from (
    select a.context, count(*) as cnt
    from public.attempts a
    where a.student_id = p_student_id
      and a.created_at >= now() - interval '30 days'
    group by a.context
    order by cnt desc
    limit 1
  ) c;

  if v_total < 3 then
    v_style := 'getting_started';
  elsif v_avg_sec > 0 and v_avg_sec <= 12 and v_hint_rate <= 0.2 then
    v_style := 'quick_solver';
  elsif v_avg_sec >= 22 or v_hint_rate >= 0.35 then
    v_style := 'reflective_deep';
  elsif v_best_ctx in ('break', 'feed') then
    v_style := 'visual_paced';
  else
    v_style := 'consistent_builder';
  end if;

  return jsonb_build_object(
    'learner_style', v_style,
    'strong_skills', v_strong,
    'growing_skills', v_growing,
    'best_context', v_best_ctx,
    'total_attempts', v_total
  );
end $$;

revoke execute on function public.guardian_learning_profile(uuid) from public, anon;
grant execute on function public.guardian_learning_profile(uuid) to authenticated;
