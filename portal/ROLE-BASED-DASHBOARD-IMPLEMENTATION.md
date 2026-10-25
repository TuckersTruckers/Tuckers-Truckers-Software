# Role-Based Portal Dashboard — Implementation Notes

## What this change adds
- A **Carrier Portal Sign In** link to the desktop navigation on Home, About, Services, and Contact, plus the mobile menu.
- A single portal dashboard entry point at `/portal/dashboard.html`.
- Successful password sign-ins, invite password setup, and existing authenticated sessions now route to that dashboard.
- Role-aware dashboard views for platform owner, dispatcher/dispatcher admin, carrier owner/manager, driver, and unassigned accounts.
- A platform-owner assignment form in `portal/admin.html` to grant or remove a dispatcher's access to a specific carrier company.
- A Supabase SQL migration that introduces dispatcher-to-carrier assignments and read-only access to assigned carrier profiles, documents, setup progress, drivers, and private document storage.

## Important scope notes
- The migration is committed as source code only. It has **not** been run against the live Supabase project.
- Apply `portal/dispatcher-carrier-assignments-migration.sql` in the Supabase SQL Editor before using dispatcher carrier assignments.
- A dispatcher account must already have the `dispatcher` or `dispatcher_admin` role. Carrier assignments are managed from the platform-owner page after the migration is applied.
- Load-board provider integration, quote creation/storage, and the manual agreement-upload/approval workflow are **not implemented by this change**. Dashboard sections are visible as planned entry points and clearly indicate that those modules are not connected yet.
- This change does not introduce an Adobe Acrobat Sign API integration or send email notifications.
- The existing role table stores one primary role per login. An owner-operator can use their carrier-owner account to manage the business and drive without a second login. A separate driver login remains an individual driver account.

## Apply and verify
1. Review and merge the branch after reviewing the diff.
2. In Supabase SQL Editor, run `portal/dispatcher-carrier-assignments-migration.sql`.
3. Open the portal as the platform owner and go to **Carrier & Driver Administration → Dispatcher access assignments**.
4. Assign a carrier to an existing dispatcher account using that dispatcher's sign-in email.
5. Sign in as the dispatcher and confirm only assigned carrier companies appear.
6. Sign in as a carrier and confirm the carrier sees only their own company and its assigned drivers.
7. Sign in as a driver and confirm only their own driver record is shown.
8. Test document access with two carriers and two dispatchers before using real sensitive documents.

## Tenant-isolation expectations
- Carrier users do not get read access to another carrier's profile, documents, drivers, or setup progress.
- Dispatchers get read access only to carriers explicitly assigned to them. The assignment migration does not grant dispatchers write access to carrier documents or agreement state.
- Driver users see only their own driver profile.
- The dashboard's hidden tabs are only presentation; Supabase RLS and server-side checks remain the security boundary.
