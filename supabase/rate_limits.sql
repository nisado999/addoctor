-- AdDoctor rate limits: one counter per key and time window, shared by every Cloudflare data centre.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
--
-- Why: the Worker used to count requests in Cloudflare's edge cache, which every data centre keeps on its own, so a
-- burst spread over many locations could get many times the limit. Here every count is one atomic row update.
-- Until this file has been run the Worker keeps using the edge-cache counters, so nothing breaks in between.
-- Row level security is on and there are no policies: only the Worker (service role) can touch the table.

create table if not exists public.rate_counters (
  key         text primary key check (char_length(key) <= 200),
  hits        integer not null default 0,
  expires_at  timestamptz not null
);
create index if not exists rate_counters_expires on public.rate_counters (expires_at);
alter table public.rate_counters enable row level security;

-- Adds one to each counter in turn and stops at the first that goes over its limit, so a caller already over their
-- own limit does not also use up a shared one further down the list. Returns that counter's position (1, 2, ...),
-- or 0 when every counter is within its limit. ttls are seconds; a counter whose window has passed starts again at 1.
create or replace function public.rate_check(keys text[], ttls integer[], limits integer[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if keys is null or array_length(keys, 1) is null then return 0; end if;
  if array_length(keys, 1) > 10 or array_length(ttls, 1) <> array_length(keys, 1) or array_length(limits, 1) <> array_length(keys, 1) then
    raise exception 'rate_check: keys, ttls and limits must be the same length, at most 10';
  end if;
  for i in 1..array_length(keys, 1) loop
    insert into public.rate_counters as r (key, hits, expires_at)
    values (keys[i], 1, now() + make_interval(secs => greatest(ttls[i], 1)))
    on conflict (key) do update
      set hits       = case when r.expires_at <= now() then 1 else r.hits + 1 end,
          expires_at = case when r.expires_at <= now() then now() + make_interval(secs => greatest(ttls[i], 1)) else r.expires_at end
    returning hits into n;
    if n > limits[i] then return i; end if;
  end loop;
  -- Old windows are cleared now and then, so the table stays small without a scheduled job.
  if random() < 0.01 then delete from public.rate_counters where expires_at < now() - interval '1 hour'; end if;
  return 0;
end $$;

revoke all on public.rate_counters from public, anon, authenticated;
revoke all on function public.rate_check(text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.rate_check(text[], integer[], integer[]) to service_role;
