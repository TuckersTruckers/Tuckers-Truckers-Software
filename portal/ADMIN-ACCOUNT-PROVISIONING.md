# Admin-Managed Carrier and Driver Setup

This feature is committed to the repository, but it is **not ready for live use until the Supabase migration and Edge Functions are deployed and tested**.

## What it is designed to do

- **Self-service carrier:** The administrator creates the carrier account and enters basic company information. The carrier signs in and completes the remaining profile/documents.
- **Admin-assisted carrier:** The administrator can save the account and profile first, including available FMCSA, owner-contact, fleet, and equipment details. Carrier creation does not generate a setup link. When ready, the administrator uses **Send setup email** from the Existing carriers list. The action sends a password-recovery/setup email to the saved Auth email via Supabase Auth; it does not reveal the recovery token in the admin page. The recipient chooses a password at the portal redirect. Documents and the agreement still need their own completion checks; do not treat a profile-only setup as fully onboarded.
- **Drivers:** The administrator creates each driver's account and profile, assigns it to an existing carrier profile, and generates an individual password-setup link.
- **Sign-in identifiers:** Email uses Supabase Auth directly. Username, phone, and MC number resolve through the private `portal_login_identifiers` table and the `identifier-sign-in` Edge Function. MC numbers should be entered with an `MC-` prefix if the digits might be confused with a phone number.

## Deploy prerequisites

1. Confirm the existing portal database/admin setup and `portal_user_roles` migration have already run.
2. In the Supabase SQL Editor for project `bvrlpwkzqmqfcupqjugf`, run `portal/admin-provisioning-migration.sql`.
3. Deploy both Edge Functions from the repository root using the Supabase CLI:

   ```bash
   supabase login
   supabase link --project-ref bvrlpwkzqmqfcupqjugf
   supabase functions deploy admin-provision-account
   supabase functions deploy identifier-sign-in
   ```

4. Verify Edge Function secrets are configured in Supabase. The functions require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Use the project's secret manager/CLI for the service-role key; **never put the service-role key in HTML, JavaScript, GitHub, or chat**.
5. Verify Supabase Auth's allowed redirect URLs include `https://www.tuckerstruckers.com/portal/index.html`. Keep the portal's existing administrator account in `portal_admins`; do not change its role.
6. Open `https://www.tuckerstruckers.com/portal/workspace.html` as the platform owner and use **Open Carrier & Driver Administration**.

## Required safe test plan before real carrier data

- Use a separate test email and a clearly fake test carrier; never create a duplicate or alter the existing administrator.
- Test carrier creation and confirm the profile is saved without sending email. Then use Send setup email and verify the test inbox receives the message, its link opens the password setup screen, and the test user can set a password and sign in. Confirm the carrier directory records the sent timestamp and count.
- Test admin-assisted validation: missing required owner/FMCSA fields should block account creation; complete test data should create the profile.
- Test duplicate email, username, phone, and MC number; each should fail cleanly without leaving a half-created Auth user or profile.
- Create two test carriers and one driver under each. Confirm each driver is assigned to the correct carrier and that neither carrier can read the other's driver/profile/documents.
- Test sign-in with email, username, phone, and `MC-123456` (using the test account's actual seeded identifiers). Confirm invalid credentials produce a generic error.
- Test an unassigned role and ensure it cannot enter carrier/driver workspaces.
- Check Edge Function logs for errors and remove test accounts after verification.

## Important limitations

- A setup link is a sensitive one-time credential. Copy it only into a private message to the intended person; do not store it in notes, commits, logs, or the maintenance checklist.
- Carrier creation and setup-link generation are separate actions. The link action returns the setup link to the authorized administrator; it does not automatically email the link. The send timestamp and send count are tracked by `setup_link_sent_at` and `setup_link_send_count` after the migration is deployed. An email request returning successfully means Supabase Auth accepted the request, not that delivery to the inbox is guaranteed. A previous send can be resent; use only the newest email link.
- The current admin-assisted form captures profile data, not file uploads or legally binding agreement signatures. Document completion and agreement execution remain separate steps.
- Frontend role checks are not a security boundary. Supabase RLS/storage policies and tenant-isolation tests are required before storing real carrier documents.
- Identifier login must not be advertised until the migration and Edge Function are deployed and all identifier paths have been tested.
