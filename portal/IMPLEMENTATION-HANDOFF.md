# Tucker's Truckers Portal — Implementation Handoff

Updated: 2026-10-29

Latest implementation commits are recorded in PR #7; the branch is still draft and unmerged.

## Authorization and guardrails
- Tucker explicitly authorized implementation work in the repository to get the portal working.
- Prior repo prohibition is superseded for implementation work by that explicit authorization.
- This handoff records work and outstanding actions so a future ChatGPT session can resume accurately.
- Supabase migration `admin_carrier_provisioning_and_setup_email_tracking` was applied successfully on 2026-10-29 and then verified against the live schema.
- No Edge Function has been deployed, no PR has been merged, and no live Auth email-template settings have been changed by this implementation pass.
- Supabase AI data access was returned to **Schema Only** by the user. Preserve that lower-access setting.

## Current project
- Repository: https://github.com/TuckersTruckers/Tuckers-Truckers-Website
- Existing PR #7: https://github.com/TuckersTruckers/Tuckers-Truckers-Website/pull/7
- Working branch: `feature/separate-carrier-setup-link`
- Supabase project ref: `bvrlpwkzqmqfcupqjugf`
- Portal redirect allowlisted: `https://www.tuckerstruckers.com/portal/index.html`
- User confirmed custom SMTP is configured.
- No secrets should be copied into GitHub, files, or chat.

## Live Supabase audit on 2026-10-29
- Project is ACTIVE_HEALTHY in `us-east-2`.
- Live `carrier_profiles` has the columns `setup_link_generated_at`, `setup_link_sent_at`, and `setup_link_send_count`; send count defaults to zero and has a nonnegative check.
- Applied migration recorded as version `20261029201434`, name `admin_carrier_provisioning_and_setup_email_tracking`.
- Unique carrier MC and username indexes, driver username index, private `portal_login_identifiers` table restrictions, and carrier-driver RLS policies were checked after migration.
- No duplicate normalized carrier MC values were found at the time of the check.
- Deployed `admin-provision-account` was still version 1, with the older generate-link-and-return flow; it has NOT been deployed from the feature branch.
- Deployed `identifier-sign-in` remains version 2 with `verify_jwt=false`; it was not changed.
- The Supabase connector does not expose Auth email-template settings in the available tools. The recovery template is therefore still unverified.
- Existing carrier profile count at the schema check was 1; do not modify existing real accounts during testing.

## Workflow requirements
1. Admin can pre-create a carrier account/profile and edit/review data before sending an invitation.
2. Creating the account must not automatically send an email.
3. A separate action sends a password setup email to the saved account email; recipient chooses a password and lands in the portal.
4. Preserve self-service onboarding for new carriers, driver account creation/assignment, and role isolation.
5. Admin-side document/photo management and agreement review/signature workflow are not yet implemented.
6. No automatic approval should be inferred from profile creation or email delivery.

## Implementation review finding
The previous PR generated a recovery link with `admin.auth.admin.generateLink()` and returned the token-bearing URL to the administrator for manual copying. That method does not send an email. Supabase's documented `resetPasswordForEmail()` sends the email through Auth. Because the administrator triggers the send but the carrier opens the email in another browser/device, the Edge Function uses a separate Auth client configured for implicit flow so the recipient does not need the administrator browser's PKCE verifier. The portal detects `type=recovery` in the URL hash and has a password setup form using `auth.updateUser({ password })`; this path still needs end-to-end testing with a test account.

## Changes implemented on the PR branch
- Replace the carrier's manual copy-link action with a Send/Resend setup email action.
- Use a separate short-lived Auth client configured with implicit flow to request the recovery email through Supabase Auth.
- Track `setup_link_sent_at` and `setup_link_send_count` in `carrier_profiles`.
- Update admin status/result copy and setup documentation.
- Keep driver setup-link behavior unchanged.
- Do not log or display recovery tokens.

## Validation performed
- GitHub Actions workflow run `40934904430` (Portal static checks) completed successfully for PR head `55434ff060805c32766579774f404ae39d294908` on 2026-10-29.
- Its `syntax` job passed Deno type-checking of `admin-provision-account/index.ts` and Node syntax checks for inline JavaScript in `portal/admin.html` and `portal/index.html`.
- Applied the Supabase migration and re-read live tables/migration history to verify the new columns and migration record.
- Inspected the currently deployed function source and confirmed it is still the older version.
- These checks do not establish browser functionality, email delivery, successful password reset, role isolation, or production readiness.

## Required next steps before live use
1. In Supabase Dashboard, open Authentication → Email Templates → Reset Password (labels may vary) and verify the link uses `{{ .ConfirmationURL }}` or correctly honors `{{ .RedirectTo }}`. Custom templates can override redirect behavior even when the redirect URL is allowlisted.
2. Once the recovery template is verified, deploy `admin-provision-account` from the reviewed feature branch. Do not deploy `identifier-sign-in` as part of this email-only change unless separately required and tested.
3. Use a dedicated test carrier with an inbox under your control. Verify: no email at account creation; Send setup email delivers; recipient can open it on another browser/device; password can be set; sign-in works; resend is tracked; expired/old links fail safely.
4. Confirm carrier cannot access other carrier records or restricted features before approval. Frontend visibility is not a security boundary.
5. Test duplicate email, username, phone, and MC handling and confirm failed provisioning leaves no orphan Auth/profile/role records.
6. Confirm driver setup-link behavior still works.
7. Add a later separate phase for admin-side file/photo management and manual signed-agreement upload/review/approval.

## Known gaps and cautions
- Email request success means Auth accepted the request; it does not prove final inbox delivery.
- The migration is applied, but the new Edge Function is not deployed.
- Current create-account form is carrier/driver-oriented, not a universal role-management interface.
- Current admin page does not provide full carrier-document/photo management.
- No end-to-end browser or email-delivery tests have been performed.
