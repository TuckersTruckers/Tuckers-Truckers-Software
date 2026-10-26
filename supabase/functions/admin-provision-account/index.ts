// Supabase Edge Function: admin-provision-account
// Deploy with SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY set as function secrets.
// Creates carrier or driver profiles. Carrier setup links are generated in a separate admin action.
// Only an existing portal_admins administrator may call this function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.tuckerstruckers.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalize = (value: string) => value.trim().toLowerCase();
const digits = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://www.tuckerstruckers.com" && origin !== "https://tuckerstruckers.github.io") {
    return json({ error: "Origin not allowed." }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server configuration is incomplete." }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in as platform administrator first." }, 401);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: callerUser }, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerUser) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: adminRow, error: adminError } = await admin.from("portal_admins").select("user_id").eq("user_id", callerUser.id).maybeSingle();
  if (adminError || !adminRow) return json({ error: "Only an authorized platform administrator can create accounts." }, 403);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  if (input.action === "send_setup_link") {
    const targetUserId = typeof input.target_user_id === "string" ? input.target_user_id : "";
    if (!targetUserId) return json({ error: "Choose a carrier account first." }, 400);
    const { data: profile, error: profileError } = await admin.from("carrier_profiles").select("user_id,business_name").eq("user_id", targetUserId).maybeSingle();
    if (profileError || !profile) return json({ error: "The selected carrier profile was not found." }, 404);
    const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    if (targetError || !target.user?.email) return json({ error: "Could not find the carrier's authentication email." }, 404);
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery", email: target.user.email,
      options: { redirectTo: "https://www.tuckerstruckers.com/portal/index.html" },
    });
    if (linkError || !linkData.properties?.action_link) return json({ error: "Setup link could not be generated: " + (linkError?.message || "unknown error") }, 500);
    const { error: stampError } = await admin.from("carrier_profiles").update({ setup_link_generated_at: new Date().toISOString() }).eq("user_id", targetUserId);
    if (stampError) return json({ error: "Link generated, but the record could not be updated with the link-generation timestamp. Refresh the carrier list before retrying. " + stampError.message }, 500);
    return json({
      success: true,
      account: { user_id: targetUserId, email: target.user.email, username: null, role: "carrier_admin" },
      setup_link: linkData.properties.action_link,
      message: "Setup link generated for " + (profile.business_name || "carrier") + ". Copy and send it privately; this function does not send email automatically.",
    });
  }

  const kind = input.kind === "driver" ? "driver" : input.kind === "carrier" ? "carrier" : "";
  const onboardingMode = input.onboarding_mode === "admin_assisted" ? "admin_assisted" : "self_service";
  const email = typeof input.email === "string" ? normalize(input.email) : "";
  const username = typeof input.username === "string" ? normalize(input.username) : "";
  const passwordSeed = crypto.randomUUID() + crypto.randomUUID();
  const deferCarrierSetupLink = kind === "carrier";
  if (!kind) return json({ error: "Choose carrier or driver account type." }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "A valid email is required for account recovery and setup links." }, 400);
  if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) return json({ error: "Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens." }, 400);

  const carrierUserId = typeof input.carrier_user_id === "string" ? input.carrier_user_id : "";
  if (kind === "driver" && !carrierUserId) return json({ error: "Select the carrier before creating a driver account." }, 400);
  if (kind === "driver") {
    const { data: carrierProfile, error } = await admin.from("carrier_profiles").select("user_id,mc_number,dot_number,business_name").eq("user_id", carrierUserId).maybeSingle();
    if (error || !carrierProfile) return json({ error: "The selected carrier account was not found." }, 400);
  }

  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const businessName = typeof input.business_name === "string" ? input.business_name.trim() : "";
  const mc = typeof input.mc_number === "string" ? input.mc_number.trim() : "";
  const dot = typeof input.dot_number === "string" ? input.dot_number.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (kind === "carrier" && (!businessName || !mc || !dot || !fullName)) return json({ error: "Carrier name, MC number, USDOT number, and authorized contact name are required." }, 400);
  if (kind === "carrier" && onboardingMode === "admin_assisted") {
    const requiredAdminFields = [
      ["fmcsa_address", "FMCSA business address"],
      ["fmcsa_email", "FMCSA email"],
      ["personal_address", "Owner personal address"],
      ["personal_phone", "Owner personal phone"],
      ["personal_email", "Owner personal email"],
      ["cell_phone", "Owner cell phone"],
    ];
    const missing = requiredAdminFields.find(([key]) => typeof input[key] !== "string" || !(input[key] as string).trim());
    if (missing) return json({ error: "Admin-assisted setup requires " + missing[1] + ". Switch to self-service if the carrier will finish the missing information." }, 400);
  }
  if (kind === "driver" && !fullName) return json({ error: "Driver full legal name is required." }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: passwordSeed,
    email_confirm: true,
    user_metadata: { full_name: fullName, portal_provisioned: true },
  });
  if (createError || !created.user) return json({ error: createError?.message || "Could not create authentication account." }, 400);
  const userId = created.user.id;
  const cleanup = async () => { await admin.from("portal_login_identifiers").delete().eq("user_id", userId); await admin.from("driver_profiles").delete().eq("user_id", userId); await admin.from("carrier_profiles").delete().eq("user_id", userId); await admin.from("portal_user_roles").delete().eq("user_id", userId); await admin.auth.admin.deleteUser(userId); };

  if (kind === "carrier") {
    const { error } = await admin.from("carrier_profiles").insert({
      user_id: userId, username: username || null, business_name: businessName, mc_number: mc, dot_number: dot,
      contact_name: fullName, contact_email: email, phone, fmcsa_phone: phone,
      fmcsa_email: typeof input.fmcsa_email === "string" && input.fmcsa_email.trim() ? input.fmcsa_email.trim() : email,
      fmcsa_address: typeof input.fmcsa_address === "string" ? input.fmcsa_address.trim() : "",
      dba_name: typeof input.dba_name === "string" ? input.dba_name.trim() : "",
      personal_address: typeof input.personal_address === "string" ? input.personal_address.trim() : "",
      personal_phone: typeof input.personal_phone === "string" ? input.personal_phone.trim() : phone,
      personal_email: typeof input.personal_email === "string" && input.personal_email.trim() ? input.personal_email.trim() : email,
      cell_phone: typeof input.cell_phone === "string" && input.cell_phone.trim() ? input.cell_phone.trim() : phone,
      secondary_phone: typeof input.secondary_phone === "string" ? input.secondary_phone.trim() : null,
      mailing_address: typeof input.fmcsa_address === "string" ? input.fmcsa_address.trim() : "",
      fleet_size: Number.isFinite(Number(input.fleet_size)) && Number(input.fleet_size) > 0 ? Number(input.fleet_size) : null,
      equipment: Array.isArray(input.equipment) ? input.equipment.filter((x) => typeof x === "string") : [],
      onboarding_mode: onboardingMode,
      admin_setup_complete: onboardingMode === "admin_assisted",
      updated_at: new Date().toISOString(),
    });
    if (error) { await cleanup(); return json({ error: "Carrier profile could not be saved: " + error.message }, 400); }
  } else {
    const { error } = await admin.from("driver_profiles").insert({
      user_id: userId, carrier_user_id: carrierUserId, username: username || null, full_name: fullName, email,
      phone: phone || null,
      mailing_address: typeof input.address === "string" ? input.address.trim() : null,
      license_state: typeof input.license_state === "string" ? input.license_state.trim() : null,
      license_number: typeof input.license_number === "string" ? input.license_number.trim() : null,
      owns_truck: input.owns_truck === true, updated_at: new Date().toISOString(),
    });
    if (error) { await cleanup(); return json({ error: "Driver profile could not be saved: " + error.message }, 400); }
  }

  const role = kind === "carrier" ? "carrier_admin" : "driver";
  const { error: roleError } = await admin.from("portal_user_roles").upsert({ user_id: userId, role, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (roleError) { await cleanup(); return json({ error: "Role could not be assigned: " + roleError.message }, 400); }

  const identifiers: { identifier_type: string; identifier_value_normalized: string }[] = [];
  if (username) identifiers.push({ identifier_type: "username", identifier_value_normalized: username });
  if (phone) identifiers.push({ identifier_type: "phone", identifier_value_normalized: digits(phone) });
  if (kind === "carrier" && mc) identifiers.push({ identifier_type: "mc_number", identifier_value_normalized: digits(mc) });
  if (identifiers.length) {
    const { error } = await admin.from("portal_login_identifiers").insert(identifiers.map((item) => ({ ...item, user_id: userId })));
    if (error) { await cleanup(); return json({ error: "Login identifiers could not be saved: " + error.message }, 400); }
  }

  let setupLink: string | null = null;
  if (!deferCarrierSetupLink) {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery", email, options: { redirectTo: "https://www.tuckerstruckers.com/portal/index.html" },
    });
    if (linkError || !linkData.properties?.action_link) {
      await cleanup();
      return json({ error: "Account setup link could not be generated: " + (linkError?.message || "unknown error") }, 500);
    }
    setupLink = linkData.properties.action_link;
  }

  return json({
    success: true,
    account: { user_id: userId, email, username: username || null, role, carrier_user_id: kind === "driver" ? carrierUserId : null },
    setup_link: setupLink,
    message: deferCarrierSetupLink ? "Carrier account and profile saved. No setup link was generated." : "Account created and profile assigned. Copy the one-time setup link and send it securely to the user. The user will choose their own password.",
  });
});
