# Tucker's Truckers Portal — Implementation Handoff

Updated: 2026-10-29

## Authorization and guardrails
- Tucker explicitly authorized implementation work in the repository to get the portal working.
- Prior repo prohibition is superseded for implementation work by that explicit authorization.
- This handoff records work and outstanding actions so a future ChatGPT session can resume accurately.
- No Supabase migration has been applied, no Edge Function has been deployed, no PR has been merged, and no live settings have been changed by this implementation pass.
- Supabase AI data access was returned to **Schema Only** by the user. Preserve that lower-access setting.

## Current project
- Repository: https://github.com/TuckersTruckers/Tuckers-Truckers-Website
- Existing PR #7: https://github.com/TuckersTruckers/Tuckers-Truckers-Website/pull/7
- Working branch: `feature/separate-carrier-setup-link`
- Supabase project ref: `bvrlpwkzqmqfcupqjugf`
- Portal redirect allowed: `https://www.tuckerstruckers.com/portal/index.html`
- User confirmed custom SMTP is configured.
- No secrets should be copied into GitHub, files, or chat.

## Workflow requirements
1. Admin can pre-create a carrier account/profile and edit/review data before sending an invitation.
2. Creating the account must not automatically send an email.
3. A separate action sends a password setup email to the saved account email; recipient chooses a password and lands in the portal.
4. Preserve self-service onboarding for new carriers, driver account creation/assignment, and role isolation.
5. Admin-side document/photo management and agreement review/signature workflow are not yet implemented.
6. No automatic approval should be inferred from profile creation or email delivery.

## Implementation review finding
The previous PR generated a recovery link with `admin.auth.admin.generateLink()` and returned the token-bearing URL to the administrator for manual copying. That method does not send an email. Supabase's documented `resetPasswordForEmail()` sends the email through Auth. Because the administrator triggers the send but the carrier opens the email in another browser/device, the Edge Function must request an **implicit-flow** recovery email so the recipient does not need the administrator browser's PKCE verifier. The portal already detects `type=recovery` in the URL hash and has a password setup form using `auth.updateUser({ password })`; this path must still be validated end-to-end with a test account.

## Changes intended in this PR update
- Replace the carrier's manual copy-link action with a Send/Resend setup email action.
- Use a separate short-lived Auth client configured with implicit flow to request the recovery email through Supabase Auth.
- Track `setup_link_sent_at` and `setup_link_send_count` in `carrier_profiles`.
- Update admin status/result copy and setup documentation.
- Keep driver setup-link behavior unchanged.
- Do not log or display recovery tokens.

## Required next steps before live use
1. Review the PR diff and run syntax/static checks on the updated Edge Function and portal JS.
2. Apply `portal/admin-provisioning-migration.sql` only after confirming the target schema and migration are correct.
3. Deploy `admin-provision-account` from this branch only after the migration is applied and function code reviewed. Do not deploy `identifier-sign-in` as part of this email-only change unless separately required and tested.
4. Use a dedicated test carrier with an email inbox under your control. Verify: no email at account creation; Send setup email delivers; recipient can open it on another browser/device; password can be set; sign-in works; resend is tracked; expired/old links fail safely.
5. Confirm carrier cannot access other carrier records or restricted features before approval. Frontend visibility is not a security boundary.
6. Test duplicate email, username, phone, and MC handling and confirm failed provisioning leaves no orphan Auth/profile/role records.
7. Confirm driver invitation behavior still works.
8. Add a later separate phase for admin-side file/photo management and manual signed-agreement upload/review/approval.

## Known gaps and cautions
- Email request success means Auth accepted the request; it does not prove final inbox delivery.
- The new timestamp/count fields require the migration before the updated function can run.
- Current create-account form is carrier/driver-oriented, not a universal role-management interface.
- Current admin page does not provide full carrier-document/photo management.
- No live tests have been performed in this pass.
