import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// HMAC-SHA256 verification for Monday.com webhook JWT
async function verifyMondayJwt(authHeader: string | null, signingSecret: string): Promise<boolean> {
  if (!authHeader) return false;

  try {
    const parts = authHeader.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureStr = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = signatureStr.length % 4;
    const paddedSig = pad ? signatureStr + "=".repeat(4 - pad) : signatureStr;
    const sigBytes = Uint8Array.from(atob(paddedSig), (c) => c.charCodeAt(0));

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, data);

    return valid;
  } catch (e) {
    console.error("JWT verification error:", e);
    return false;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_COLUMN_ID = "e_mail";

async function fetchMondayContactEmail(itemId: number, apiToken: string): Promise<string | null> {
  const query = `query {
    items(ids: [${itemId}]) {
      column_values(ids: ["${EMAIL_COLUMN_ID}"]) {
        id
        text
      }
    }
  }`;

  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Monday API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const columns = json.data?.items?.[0]?.column_values || [];
  const emailCol = columns.find((c: { id: string }) => c.id === EMAIL_COLUMN_ID);
  return emailCol?.text || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Monday webhook received:", JSON.stringify(body));

    // Handle Monday.com webhook challenge verification
    if (body.challenge) {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Monday.com JWT signature (if present)
    const MONDAY_SIGNING_SECRET = Deno.env.get("MONDAY_SIGNING_SECRET");
    const authHeader = req.headers.get("Authorization");

    if (MONDAY_SIGNING_SECRET && authHeader) {
      const isValid = await verifyMondayJwt(authHeader, MONDAY_SIGNING_SECRET);
      if (!isValid) {
        console.error("Invalid Monday.com webhook signature");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("Monday.com webhook signature verified ✓");
    } else if (!authHeader) {
      console.warn("No Authorization header — accepting webhook (API-subscription mode)");
    }

    const event = body.event;
    if (!event) {
      return new Response(JSON.stringify({ error: "No event in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const columnValue = event.value;
    const pulseId = event.pulseId;
    const pulseName = event.pulseName;

    // Parse the status value
    let newStatus = "";
    try {
      const parsed = typeof columnValue === "string" ? JSON.parse(columnValue) : columnValue;
      if (parsed?.label?.text) {
        newStatus = parsed.label.text;
      } else if (typeof parsed?.label === "string") {
        newStatus = parsed.label;
      } else if (parsed?.text) {
        newStatus = parsed.text;
      } else {
        newStatus = String(parsed || "");
      }
    } catch {
      newStatus = String(columnValue || "");
    }
    console.log(`[DEBUG] Parsed status: "${newStatus}"`);

    // Only proceed if status is "I gang"
    if (newStatus !== "I gang") {
      console.log(`Status "${newStatus}" is not "I gang", skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MONDAY_API_TOKEN = Deno.env.get("MONDAY_API_TOKEN");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    // Fetch contact email from Monday
    let contactEmail: string | null = null;
    if (MONDAY_API_TOKEN) {
      console.log(`Fetching contact email for pulseId: ${pulseId}`);
      contactEmail = await fetchMondayContactEmail(pulseId, MONDAY_API_TOKEN);
      console.log(`Contact email: ${contactEmail || "(not found)"}`);
    } else {
      console.warn("MONDAY_API_TOKEN not set - cannot fetch contact email");
    }

    if (!contactEmail) {
      console.warn(`No contact email found for "${pulseName}", cannot send invitation`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "no_contact_email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if there's already a pending invitation for this email
    const { data: existingInvite } = await supabase
      .from("company_invitations")
      .select("id")
      .eq("email", contactEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      console.log(`Pending invitation already exists for ${contactEmail}, skipping`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "invitation_exists" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find an advisor to set as inviter
    const { data: advisor } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "advisor")
      .limit(1)
      .maybeSingle();

    if (!advisor) {
      console.error("No advisor found to set as inviter");
      return new Response(
        JSON.stringify({ ok: false, error: "No advisor found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create invitation WITHOUT company_id — user creates their own company at signup
    const { data: invResult, error: inviteError } = await supabase
      .from("company_invitations")
      .insert({
        company_id: null,
        email: contactEmail,
        invited_by: advisor.user_id,
        status: "pending",
      })
      .select("token")
      .single();

    if (inviteError) {
      console.error("Error creating invitation:", inviteError);
      throw new Error(`Failed to create invitation: ${inviteError.message}`);
    }

    const tokenParam = invResult?.token ? `&invite=${invResult.token}` : "";
    console.log(`Invitation created for ${contactEmail} (no company, token: ${invResult.token})`);

    // Send invitation email
    try {
      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-invitation-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          email: contactEmail,
          company_name: pulseName,
          signup_url: `https://topix.lovable.app/auth?mode=signup${tokenParam}`,
        }),
      });
      const emailData = await emailRes.json();
      console.log("Invitation email result:", JSON.stringify(emailData));
    } catch (emailErr) {
      console.error("Could not trigger invitation email:", emailErr);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        email: contactEmail,
        monday_item: pulseName,
        invitation_sent: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Monday webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
