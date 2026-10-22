-- AdDoctor billing: one credit balance per account, a ledger of every change, and the functions the Worker calls.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
--
-- Credits come in two buckets:
--   plan_credits   the monthly allowance of the account's plan; reset (not added to) every month
--   extra_credits  bought as top-ups; kept for 12 months from the last top-up
-- Spending takes from plan_credits first. Only the Worker (service role) can change balances; a signed-in visitor
-- can read their own account and ledger, nothing else.

create table if not exists public.billing_accounts (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free', 'starter', 'pro', 'agency')),
  plan_credits           integer not null default 0 check (plan_credits >= 0),
  extra_credits          integer not null default 0 check (extra_credits >= 0),
  extra_expires_at       timestamptz,
  refill_at              timestamptz not null default now(),
  status                 text not null default 'active',
  billing_interval       text,
  current_period_end     timestamptz,
  paddle_customer_id     text,
  paddle_subscription_id text,
  segment                text check (segment in ('shop', 'freelancer', 'agency')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  delta        integer not null,                 -- plan_delta + extra_delta
  plan_delta   integer not null default 0,
  extra_delta  integer not null default 0,
  reason       text not null,
  ref          text unique,                       -- makes webhooks, spends and refunds idempotent
  created_at   timestamptz not null default now()
);
create index if not exists credit_ledger_user_time on public.credit_ledger (user_id, created_at desc);

alter table public.billing_accounts enable row level security;
alter table public.credit_ledger enable row level security;
drop policy if exists "read own billing account" on public.billing_accounts;
create policy "read own billing account" on public.billing_accounts for select using (auth.uid() = user_id);
drop policy if exists "read own ledger" on public.credit_ledger;
create policy "read own ledger" on public.credit_ledger for select using (auth.uid() = user_id);

-- Monthly credits per plan. Keep in step with PLAN_CREDITS in api/worker.js and src/plans.js.
create or replace function public.plan_allowance(p text) returns integer
language sql immutable as $$
  select case p when 'starter' then 200 when 'pro' then 900 when 'agency' then 2500 else 25 end
$$;

-- Creates the account on first use, ends a lapsed paid plan, refills the month, expires old top-ups.
-- Locks the row for the rest of the calling transaction.
create or replace function public.billing_refresh(uid uuid) returns public.billing_accounts
language plpgsql security definer set search_path = public as $$
declare a public.billing_accounts;
begin
  insert into public.billing_accounts (user_id, plan_credits, refill_at)
  values (uid, public.plan_allowance('free'), now() + interval '1 month')
  on conflict (user_id) do nothing;
  if found then
    insert into public.credit_ledger (user_id, delta, plan_delta, reason) values (uid, public.plan_allowance('free'), public.plan_allowance('free'), 'free credits');
  end if;

  select * into a from public.billing_accounts where user_id = uid for update;

  -- A cancelled or paused plan keeps working until the end of the paid period, then becomes free.
  if a.plan <> 'free' and a.status in ('canceled', 'paused') and (a.current_period_end is null or a.current_period_end <= now()) then
    a.plan := 'free';
    a.refill_at := now();
  end if;

  if a.refill_at <= now() then
    while a.refill_at <= now() loop a.refill_at := a.refill_at + interval '1 month'; end loop;
    insert into public.credit_ledger (user_id, delta, plan_delta, reason)
    values (uid, public.plan_allowance(a.plan) - a.plan_credits, public.plan_allowance(a.plan) - a.plan_credits, 'monthly credits (' || a.plan || ')');
    a.plan_credits := public.plan_allowance(a.plan);
  end if;

  if a.extra_credits > 0 and a.extra_expires_at is not null and a.extra_expires_at <= now() then
    insert into public.credit_ledger (user_id, delta, extra_delta, reason) values (uid, -a.extra_credits, -a.extra_credits, 'top-up credits expired');
    a.extra_credits := 0;
  end if;

  update public.billing_accounts
     set plan = a.plan, plan_credits = a.plan_credits, extra_credits = a.extra_credits, refill_at = a.refill_at, updated_at = now()
   where user_id = uid
  returning * into a;
  return a;
end $$;

-- Takes `amount` credits for one action. Returns ok=false (and changes nothing) when the balance is too low.
-- The same `ref` twice spends once.
create or replace function public.billing_spend(uid uuid, amount integer, why text, ref_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.billing_accounts; p integer; e integer;
begin
  a := public.billing_refresh(uid);
  if amount <= 0 or exists (select 1 from public.credit_ledger l where l.ref = ref_id) then
    return jsonb_build_object('ok', true, 'plan', a.plan, 'plan_credits', a.plan_credits, 'extra_credits', a.extra_credits);
  end if;
  if a.plan_credits + a.extra_credits < amount then
    return jsonb_build_object('ok', false, 'plan', a.plan, 'plan_credits', a.plan_credits, 'extra_credits', a.extra_credits, 'needed', amount);
  end if;
  p := least(a.plan_credits, amount);
  e := amount - p;
  update public.billing_accounts
     set plan_credits = plan_credits - p, extra_credits = extra_credits - e, updated_at = now()
   where user_id = uid
  returning * into a;
  insert into public.credit_ledger (user_id, delta, plan_delta, extra_delta, reason, ref) values (uid, -amount, -p, -e, why, ref_id);
  return jsonb_build_object('ok', true, 'plan', a.plan, 'plan_credits', a.plan_credits, 'extra_credits', a.extra_credits);
end $$;

-- Gives back what a spend took, to the same buckets, when the action failed. Safe to call twice.
create or replace function public.billing_refund(uid uuid, ref_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.credit_ledger; a public.billing_accounts;
begin
  select * into s from public.credit_ledger where ref = ref_id and user_id = uid and delta < 0;
  if not found or exists (select 1 from public.credit_ledger where ref = ref_id || ':refund') then
    select * into a from public.billing_accounts where user_id = uid;
    return jsonb_build_object('ok', true, 'plan_credits', a.plan_credits, 'extra_credits', a.extra_credits);
  end if;
  update public.billing_accounts
     set plan_credits = plan_credits - s.plan_delta, extra_credits = extra_credits - s.extra_delta, updated_at = now()
   where user_id = uid
  returning * into a;
  insert into public.credit_ledger (user_id, delta, plan_delta, extra_delta, reason, ref)
  values (uid, -s.delta, -s.plan_delta, -s.extra_delta, 'refund: ' || s.reason, ref_id || ':refund');
  return jsonb_build_object('ok', true, 'plan_credits', a.plan_credits, 'extra_credits', a.extra_credits);
end $$;

-- Records the plan from a Paddle subscription event. `reset` (a new payment) restarts the month with the plan's
-- full allowance. The same `ref` (the Paddle event id) applies once.
create or replace function public.billing_set_plan(
  uid uuid, new_plan text, new_status text, new_interval text, period_end timestamptz,
  customer text, subscription text, reset boolean, ref_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.billing_accounts; was_pc integer;
begin
  a := public.billing_refresh(uid);
  if exists (select 1 from public.credit_ledger where ref = ref_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  was_pc := a.plan_credits;
  update public.billing_accounts
     set plan = coalesce(new_plan, plan), status = coalesce(new_status, status), billing_interval = coalesce(new_interval, billing_interval),
         current_period_end = coalesce(period_end, current_period_end),
         paddle_customer_id = coalesce(customer, paddle_customer_id), paddle_subscription_id = coalesce(subscription, paddle_subscription_id),
         plan_credits = case when reset then public.plan_allowance(coalesce(new_plan, plan)) else plan_credits end,
         refill_at = case when reset then now() + interval '1 month' else refill_at end,
         updated_at = now()
   where user_id = uid
  returning * into a;
  insert into public.credit_ledger (user_id, delta, plan_delta, reason, ref)
  values (uid, a.plan_credits - was_pc, a.plan_credits - was_pc, 'plan ' || a.plan || ' (' || a.status || ')' || case when reset then ', credits reset' else '' end, ref_id);
  return jsonb_build_object('ok', true, 'plan', a.plan, 'plan_credits', a.plan_credits);
end $$;

-- Adds top-up credits, valid for 12 months from this top-up. The same `ref` (the Paddle transaction id) adds once.
create or replace function public.billing_add_extra(uid uuid, amount integer, ref_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.billing_accounts;
begin
  a := public.billing_refresh(uid);
  if exists (select 1 from public.credit_ledger where ref = ref_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  update public.billing_accounts
     set extra_credits = extra_credits + amount, extra_expires_at = now() + interval '12 months', updated_at = now()
   where user_id = uid
  returning * into a;
  insert into public.credit_ledger (user_id, delta, extra_delta, reason, ref) values (uid, amount, amount, 'top-up', ref_id);
  return jsonb_build_object('ok', true, 'extra_credits', a.extra_credits);
end $$;

create or replace function public.billing_set_segment(uid uuid, seg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.billing_refresh(uid);
  update public.billing_accounts set segment = seg, updated_at = now() where user_id = uid and seg in ('shop', 'freelancer', 'agency');
end $$;

-- Only the Worker's service role may call these.
revoke all on function public.billing_refresh(uuid) from public, anon, authenticated;
revoke all on function public.billing_spend(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.billing_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_set_plan(uuid, text, text, text, timestamptz, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.billing_add_extra(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.billing_set_segment(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_refresh(uuid) to service_role;
grant execute on function public.billing_spend(uuid, integer, text, text) to service_role;
grant execute on function public.billing_refund(uuid, text) to service_role;
grant execute on function public.billing_set_plan(uuid, text, text, text, timestamptz, text, text, boolean, text) to service_role;
grant execute on function public.billing_add_extra(uuid, integer, text) to service_role;
grant execute on function public.billing_set_segment(uuid, text) to service_role;
