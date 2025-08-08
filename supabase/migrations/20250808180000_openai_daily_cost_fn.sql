-- Single-source function for getting OpenAI daily cost (UTC day window)
create or replace function public.get_openai_daily_cost(p_user uuid)
returns table(daily_cost numeric)
language sql
stable
as $$
  select coalesce(sum(estimated_cost), 0)::numeric as daily_cost
  from public.openai_usage
  where user_id = p_user
    and created_at >= date_trunc('day', now() at time zone 'utc')
    and created_at  < date_trunc('day', now() at time zone 'utc') + interval '1 day';
$$;

revoke all on function public.get_openai_daily_cost(uuid) from public;
grant execute on function public.get_openai_daily_cost(uuid) to authenticated;

comment on function public.get_openai_daily_cost(uuid) is
'Returns today''s total OpenAI cost for a user using created_at (UTC). Always numeric (0 if none).';