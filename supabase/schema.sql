-- Run once in a new Supabase project, in SQL Editor.
begin;

create table public.nexonomy_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.nexonomy_list_assets (
  list_id uuid not null,
  user_id uuid not null default auth.uid(),
  osm_id text not null check (osm_id ~ '^(node|way|relation)/[0-9]+$'),
  feature jsonb not null check (
    jsonb_typeof(feature) = 'object'
    and (feature->>'type' is not distinct from 'Feature')
    and (feature->>'id' is not distinct from osm_id)
    and coalesce(feature#>>'{properties,kind}' in ('TREE','BUILDING','ROAD','POND'), false)
    and octet_length(feature::text) <= 200000
  ),
  primary key (list_id, osm_id),
  foreign key (list_id, user_id) references public.nexonomy_lists(id, user_id) on delete cascade
);

create index nexonomy_lists_owner_idx on public.nexonomy_lists(user_id);
create index nexonomy_assets_owner_idx on public.nexonomy_list_assets(user_id);

alter table public.nexonomy_lists enable row level security;
alter table public.nexonomy_list_assets enable row level security;

revoke all on public.nexonomy_lists, public.nexonomy_list_assets from public, anon, authenticated;
grant select, insert on public.nexonomy_lists to authenticated;
grant select, insert, delete on public.nexonomy_list_assets to authenticated;

create policy "Read own lists" on public.nexonomy_lists
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own lists" on public.nexonomy_lists
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "Read own assets" on public.nexonomy_list_assets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Add assets to own lists" on public.nexonomy_list_assets
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.nexonomy_lists as parent
      where parent.id = nexonomy_list_assets.list_id
        and parent.user_id = (select auth.uid())
    )
  );
create policy "Remove own assets" on public.nexonomy_list_assets
  for delete to authenticated using (user_id = (select auth.uid()));

commit;
