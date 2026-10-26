-- Admin-managed carrier and driver account provisioning
-- Run this migration in Supabase SQL Editor before deploying the admin-provision-account Edge Function.
-- Safe to re-run. Does not change existing administrator membership.

alter table public.carrier_profiles
  add column if not exists username text,
  add column if not exists dba_name text,
  add column if not exists fmcsa_address text,
  add column if not exists fmcsa_phone text,
  add column if not exists fmcsa_email text,
  add column if not exists personal_address text,
  add column if not exists personal_phone text,
  add column if not exists personal_email text,
  add column if not exists cell_phone text,
  add column if not exists secondary_phone text,
  add column if not exists onboarding_mode text not null default 'self_service'
    check (onboarding_mode in ('self_service','admin_assisted')),
  add column if not exists admin_setup_complete boolean not null default false,
  add column if not exists setup_link_generated_at timestamptz;

create unique index if not exists carrier_profiles_username_lower_unique
  on public.carrier_profiles (lower(username)) where username is not null and btrim(username) <> '';
create unique index if not exists carrier_profiles_mc_number_unique
  on public.carrier_profiles (regexp_replace(regexp_replace(lower(mc_number), '[^a-z0-9]', '', 'g'), '^mc', ''))
  where mc_number is not null and btrim(mc_number) <> '';

alter table public.driver_profiles
  add column if not exists carrier_user_id uuid references public.carrier_profiles(user_id) on delete set null,
  add column if not exists username text;

create unique index if not exists driver_profiles_username_lower_unique
  on public.driver_profiles (lower(username)) where username is not null and btrim(username) <> '';

-- Login identifiers are private lookup data. Only the Edge Function using the service role reads/writes this table.
create table if not exists public.portal_login_identifiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('username','phone','mc_number')),
  identifier_value_normalized text not null,
  created_at timestamptz not null default now(),
  unique(identifier_type, identifier_value_normalized),
  unique(user_id, identifier_type)
);
alter table public.portal_login_identifiers enable row level security;
revoke all on public.portal_login_identifiers from anon, authenticated;

-- A carrier administrator can view/manage driver profiles assigned to their own carrier.
drop policy if exists "Carrier admins view assigned drivers" on public.driver_profiles;
create policy "Carrier admins view assigned drivers"
on public.driver_profiles for select to authenticated
using (
  carrier_user_id = auth.uid()
  and exists (
    select 1 from public.portal_user_roles r
    where r.user_id = auth.uid() and r.role in ('carrier_admin','carrier')
  )
);

drop policy if exists "Carrier admins add assigned drivers" on public.driver_profiles;
create policy "Carrier admins add assigned drivers"
on public.driver_profiles for insert to authenticated
with check (
  carrier_user_id = auth.uid()
  and exists (
    select 1 from public.portal_user_roles r
    where r.user_id = auth.uid() and r.role in ('carrier_admin','carrier')
  )
);

drop policy if exists "Carrier admins update assigned drivers" on public.driver_profiles;
create policy "Carrier admins update assigned drivers"
on public.driver_profiles for update to authenticated
using (
  carrier_user_id = auth.uid()
  and exists (
    select 1 from public.portal_user_roles r
    where r.user_id = auth.uid() and r.role in ('carrier_admin','carrier')
  )
)
with check (
  carrier_user_id = auth.uid()
  and exists (
    select 1 from public.portal_user_roles r
    where r.user_id = auth.uid() and r.role in ('carrier_admin','carrier')
  )
);

-- This migration only prepares storage and tenant relationships. It does not make identifier login work by itself;
-- deploy the login resolver Edge Function before advertising username, phone, or MC-number sign-in.
