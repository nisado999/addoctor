-- AdDoctor agency leads: people who finished the Meta Ads Plan and asked to work with you.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
-- Visitors (signed in or not) can only ADD a row. Nobody can read the table from the site; you read it in the
-- Supabase dashboard (Table Editor > agency_leads). To get an email for each new lead, add a Database Webhook
-- (Database > Webhooks) on INSERT, or connect the table to Zapier/Make.

create table if not exists public.agency_leads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 200 and email like '%@%'),
  phone       text check (phone is null or char_length(phone) <= 40),
  message     text check (message is null or char_length(message) <= 2000),
  brand       text check (brand is null or char_length(brand) <= 200),
  site        text check (site is null or char_length(site) <= 300),
  monthly_budget numeric check (monthly_budget is null or monthly_budget >= 0),
  currency    text check (currency is null or char_length(currency) <= 3),
  answers     jsonb check (answers is null or pg_column_size(answers) <= 8000),
  plan        text check (plan is null or char_length(plan) <= 12000),
  user_id     uuid,
  status      text not null default 'new'
);

alter table public.agency_leads enable row level security;

drop policy if exists "anyone can send a lead" on public.agency_leads;
create policy "anyone can send a lead" on public.agency_leads
  for insert to anon, authenticated
  with check (status = 'new' and (user_id is null or user_id = auth.uid()));

-- No select, update or delete policy: the site can write a lead but never read one back.
revoke all on public.agency_leads from anon, authenticated;
grant insert on public.agency_leads to anon, authenticated;
