-- Carrier onboarding approval gate. Review before applying to production.
drop policy if exists "Carriers can create own profile" on public.carrier_profiles;
drop policy if exists "Carriers create their own profile" on public.carrier_profiles;
drop policy if exists "Carriers can update own profile" on public.carrier_profiles;
drop policy if exists "Carriers update their own profile" on public.carrier_profiles;
create policy "Carriers create own profile before submission" on public.carrier_profiles for insert to authenticated
with check (user_id=(select auth.uid()) and not exists(select 1 from public.carrier_onboarding o where o.user_id=(select auth.uid()) and o.review_status in ('submitted','agreement_sent')));
create policy "Carriers update own profile before submission" on public.carrier_profiles for update to authenticated
using (user_id=(select auth.uid()) and not exists(select 1 from public.carrier_onboarding o where o.user_id=(select auth.uid()) and o.review_status in ('submitted','agreement_sent')))
with check (user_id=(select auth.uid()));
drop policy if exists "Carriers submit own onboarding" on public.carrier_onboarding;
create policy "Carriers submit own onboarding" on public.carrier_onboarding for insert to authenticated
with check (user_id=(select auth.uid()) and profile_complete=true and review_status='submitted');
