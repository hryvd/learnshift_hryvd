-- Enforce full DM isolation (both conversations and messages) whenever either side blocks the other.
create or replace function private.is_in_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.conversation_id = cid
      and cm.user_id = (select auth.uid())
      and (
        c.kind = 'archipelago'
        or (
          c.dm_low is not null
          and c.dm_high is not null
          and not private.is_blocked(c.dm_low, c.dm_high)
        )
      )
  )
$$;
