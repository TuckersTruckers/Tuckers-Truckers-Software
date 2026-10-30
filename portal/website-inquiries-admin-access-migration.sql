-- Allow authenticated platform administrators to review website inquiries.
-- Public visitors still cannot read inquiries; submissions remain service-role only.

grant select on table public.website_inquiries to authenticated;

create policy "Portal admins can read website inquiries"
on public.website_inquiries
for select
to authenticated
using (
  exists (
    select 1
    from public.portal_admins pa
    where pa.user_id = (select auth.uid())
  )
);
