-- Giveaway Pulse — creators table for Supabase Auth
-- Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run (once).

create table if not exists public.creators (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null check (char_length(name) between 2 and 60),
  channel_url text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- one account per YouTube channel (case-insensitive)
create unique index if not exists creators_channel_url_key on public.creators (lower(channel_url));

alter table public.creators enable row level security;

drop policy if exists "creators read own"   on public.creators;
drop policy if exists "creators update own" on public.creators;
create policy "creators read own"   on public.creators for select using (auth.uid() = id);
create policy "creators update own" on public.creators for update using (auth.uid() = id) with check (auth.uid() = id);
-- no insert/delete policy: rows are created only by the trigger below

-- create the profile row automatically when someone signs up
create or replace function public.handle_new_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.creators (id, email, name, channel_url)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    coalesce(trim(new.raw_user_meta_data->>'channel'), '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_creator();

-- signup page uses this to say "this channel already has an account" before creating the user
create or replace function public.channel_taken(p_channel text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.creators where lower(channel_url) = lower(trim(p_channel)));
$$;
revoke all on function public.channel_taken(text) from public;
grant execute on function public.channel_taken(text) to anon, authenticated;
