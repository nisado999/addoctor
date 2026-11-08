-- AdDoctor saved ads: the ads a signed-in visitor keeps in My ads, so they show up on every computer.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
-- Each visitor can only see and change their own rows.

create table if not exists public.saved_ads (
  user_id      uuid not null references auth.users on delete cascade,
  id           text not null check (char_length(id) between 1 and 120),
  title        text not null default '' check (char_length(title) <= 120),
  category     text not null default '' check (char_length(category) <= 60),
  template_id  text not null default '' check (char_length(template_id) <= 120),
  thumb        text not null check (thumb like 'data:image/%' and char_length(thumb) <= 600000),
  saved_at     bigint not null,
  primary key (user_id, id)
);

alter table public.saved_ads enable row level security;

drop policy if exists "own saved ads" on public.saved_ads;
create policy "own saved ads" on public.saved_ads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.saved_ads from anon, authenticated;
grant select, insert, update, delete on public.saved_ads to authenticated;
