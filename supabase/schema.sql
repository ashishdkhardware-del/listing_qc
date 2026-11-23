-- Listing QC database. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Items mirror the R2 layout  <folder>/<item id>/<images>; only rejected images are stored as review data.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null
);

create table if not exists public.folders (
  id text primary key,                 -- folder name, e.g. Cabinet_and_furniture_paints
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  folder_id text not null references public.folders on delete cascade,
  item_id text not null,               -- sub-folder name, e.g. the MPN
  title text,
  attributes jsonb not null default '{}',
  images text[] not null,              -- file names in slide order
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  claimed_by uuid references auth.users,
  claimed_until timestamptz,
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  primary key (folder_id, item_id)
);
create index if not exists items_queue on public.items (folder_id, status, item_id);

create table if not exists public.rejected_images (
  folder_id text not null,
  item_id text not null,
  file text not null,
  slide int not null,                  -- position of the image in the item (1-based)
  reviewer uuid not null references auth.users,
  reviewer_name text,
  rejected_at timestamptz not null default now(),
  primary key (folder_id, item_id, file),
  foreign key (folder_id, item_id) references public.items on delete cascade
);

-- Who may use the app: people sign in with Google, and only emails listed here (and active) get in.
create table if not exists public.members (
  email text primary key check (email = lower(email)),
  role text not null default 'reviewer' check (role in ('admin', 'reviewer')),
  active boolean not null default true,
  added_at timestamptz not null default now()
);
insert into public.members (email, role) values ('ashish.dkhardware@gmail.com', 'admin')
on conflict (email) do update set role = 'admin', active = true;

-- The caller's role ('admin' / 'reviewer'), or null when their email is not an active member.
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where email = lower(auth.jwt() ->> 'email') and active
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() is not null $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- Hand out the next free items to the caller. FOR UPDATE SKIP LOCKED makes two reviewers pressing
-- Space at the same moment get different items. Claims expire after 10 minutes so abandoned items return.
create or replace function public.claim_next(p_folder text, p_count int default 3)
returns setof public.items
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'no access'; end if;
  return query
  update public.items i
     set claimed_by = auth.uid(), claimed_until = now() + interval '10 minutes'
   where (i.folder_id, i.item_id) in (
     select folder_id, item_id from public.items
      where folder_id = p_folder and status = 'pending'
        and (claimed_until is null or claimed_until < now() or claimed_by = auth.uid())
      order by item_id
      limit p_count
      for update skip locked)
  returning i.*;
end $$;

-- Save one item: replaces its rejected images (empty array = all fine) and releases the claim.
-- Only the reviewer holding the claim, or who reviewed it before, may save it.
create or replace function public.save_review(p_folder text, p_item text, p_rejected text[])
returns void
language plpgsql security definer set search_path = public as $$
declare imgs text[];
begin
  if not public.is_member() then raise exception 'no access'; end if;
  select images into imgs from public.items
   where folder_id = p_folder and item_id = p_item
     and (claimed_by = auth.uid() or reviewed_by = auth.uid())
     for update;
  if not found then raise exception 'item is not claimed by you'; end if;

  delete from public.rejected_images where folder_id = p_folder and item_id = p_item;
  insert into public.rejected_images (folder_id, item_id, file, slide, reviewer, reviewer_name)
  select p_folder, p_item, f, array_position(imgs, f), auth.uid(), (select name from public.profiles where id = auth.uid())
    from unnest(coalesce(p_rejected, '{}')) f
   where f = any(imgs);

  update public.items
     set status = case when cardinality(coalesce(p_rejected, '{}')) > 0 then 'rejected' else 'approved' end,
         reviewed_by = auth.uid(), reviewed_at = now(), claimed_by = null, claimed_until = null
   where folder_id = p_folder and item_id = p_item;
end $$;

-- Admin dashboard: members with their name and last sign-in.
create or replace function public.admin_members()
returns table (email text, role text, active boolean, added_at timestamptz, name text, last_sign_in timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select m.email, m.role, m.active, m.added_at, p.name, u.last_sign_in_at
    from public.members m
    left join auth.users u on lower(u.email) = m.email
    left join public.profiles p on p.id = u.id
   order by m.role, m.email;
end $$;

-- Admin dashboard: review counts per reviewer (last 24 hours, last 7 days, all time).
create or replace function public.admin_reviewer_stats()
returns table (reviewer uuid, name text, email text, day bigint, week bigint, total bigint, with_rejects bigint, images_rejected bigint, last_review timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select i.reviewed_by, p.name, u.email::text,
         count(*) filter (where i.reviewed_at > now() - interval '24 hours'),
         count(*) filter (where i.reviewed_at > now() - interval '7 days'),
         count(*),
         count(*) filter (where i.status = 'rejected'),
         (select count(*) from public.rejected_images r where r.reviewer = i.reviewed_by),
         max(i.reviewed_at)
    from public.items i
    left join public.profiles p on p.id = i.reviewed_by
    left join auth.users u on u.id = i.reviewed_by
   where i.reviewed_by is not null
   group by i.reviewed_by, p.name, u.email
   order by count(*) desc;
end $$;

-- Admin dashboard: progress per folder.
create or replace function public.admin_folder_stats()
returns table (folder_id text, name text, total bigint, approved bigint, rejected bigint, in_progress bigint, images_rejected bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select f.id, f.name, count(i.item_id),
         count(i.item_id) filter (where i.status = 'approved'),
         count(i.item_id) filter (where i.status = 'rejected'),
         count(i.item_id) filter (where i.status = 'pending' and i.claimed_until > now()),
         (select count(*) from public.rejected_images r where r.folder_id = f.id)
    from public.folders f
    left join public.items i on i.folder_id = f.id
   group by f.id, f.name, f.created_at
   order by f.created_at;
end $$;

-- Row level security: members can read; all writes go through the functions above
-- (or the upload script, which uses the service role key and bypasses these rules).
alter table public.members enable row level security;
alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.items enable row level security;
alter table public.rejected_images enable row level security;

drop policy if exists "read" on public.folders;
create policy "read" on public.folders for select to authenticated using (public.is_member());
drop policy if exists "read" on public.items;
create policy "read" on public.items for select to authenticated using (public.is_member());
drop policy if exists "read" on public.rejected_images;
create policy "read" on public.rejected_images for select to authenticated using (public.is_member());
drop policy if exists "read" on public.profiles;
create policy "read" on public.profiles for select to authenticated using (public.is_member());
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "admins manage" on public.members;
create policy "admins manage" on public.members for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on function public.claim_next(text, int) from public, anon;
revoke all on function public.save_review(text, text, text[]) from public, anon;
revoke all on function public.admin_members() from public, anon;
revoke all on function public.admin_reviewer_stats() from public, anon;
revoke all on function public.admin_folder_stats() from public, anon;
grant execute on function public.claim_next(text, int) to authenticated;
grant execute on function public.save_review(text, text, text[]) to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.admin_members() to authenticated;
grant execute on function public.admin_reviewer_stats() to authenticated;
grant execute on function public.admin_folder_stats() to authenticated;
