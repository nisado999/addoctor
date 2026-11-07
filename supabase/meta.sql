-- Meta (Facebook) connection. Run once in the Supabase SQL editor.
-- Row level security is on and there are no policies, so only the Worker (service role) can read or write these tables.
-- The access token is stored encrypted (AES-GCM, key META_TOKEN_KEY in the Worker); this file never holds a plain token.

create table if not exists public.meta_connections (
  user_id          uuid primary key references auth.users on delete cascade,
  fb_user_id       text not null,
  token_enc        text not null,
  token_expires_at timestamptz,
  ad_account_id    text,
  page_id          text,
  instagram_id     text,
  pixel_id         text,
  currency         text,
  updated_at       timestamptz not null default now()
);
create index if not exists meta_connections_fb_user_id on public.meta_connections (fb_user_id);

-- One row per launch. request_id comes from the browser and makes a double click or a retry create one campaign, not two.
create table if not exists public.meta_launches (
  request_id  text primary key,
  user_id     uuid not null references auth.users on delete cascade,
  campaign_id text,
  status      text not null default 'creating',   -- creating, created, active, failed
  result      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists meta_launches_user on public.meta_launches (user_id);

alter table public.meta_connections enable row level security;
alter table public.meta_launches enable row level security;
