import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// HMAC-SHA256 verification for Monday.com webhook JWT
async function verifyMondayJwt(authHeader: string | null, signingSecret: string): Promise<boolean> {
  if (!authHeader) return false;

  try {
    // Monday sends a JWT in the Authorization header
    const parts = authHeader.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Import the signing secret as HMAC key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Convert base64url signature to ArrayBuffer
    const signatureStr = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = signatureStr.length % 4;
    const paddedSig = pad ? signatureStr + "=".repeat(4 - pad) : signatureStr;
    const sigBytes = Uint8Array.from(atob(paddedSig), (c) => c.charCodeAt(0));

    // Verify signature
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

// Flexible mapping: Monday column ID -> companies table field
// We log all columns on first run so you can adjust these IDs
const COLUMN_MAPPING: Record<string, string> = {
  // Adjust these column IDs after checking logs from the first webhook call
  "tekst": "cvr_number",
  "tekst0": "contact_person",
  "e_mail": "contact_email",
  "telefon": "contact_phone",
  "tekst6": "industry",
  "tekst8": "website",
  "tekst3": "address",
  "tekst4": "city",
  "tekst5": "postal_code",
  "tekst7": "slack_channel",
  // Numeric and date fields — column IDs are guessed, will be verified from logs
  "tal": "annual_revenue",
  "dato": "start_date",
  "dato0": "end_date",
};

async function fetchMondayItemData(itemId: number, apiToken: string) {
  const query = `query {
    items(ids: [${itemId}]) {
      name
      column_values {
        id
        title
        text
        value
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

  return json.data?.items?.[0] || null;
}

const NUMERIC_FIELDS = new Set(["annual_revenue"]);
const DATE_FIELDS = new Set(["start_date", "end_date"]);

function mapColumnValues(columnValues: Array<{ id: string; title: string; text: string; value: string }>) {
  const companyData: Record<string, string | number> = {};

  // Log all columns for debugging/mapping
  console.log("=== Monday Column Values ===");
  for (const col of columnValues) {
    console.log(`  Column ID: "${col.id}" | Title: "${col.title}" | Text: "${col.text}"`);

    const dbField = COLUMN_MAPPING[col.id];
    if (dbField && col.text) {
      if (NUMERIC_FIELDS.has(dbField)) {
        const num = parseFloat(col.text.replace(/[^0-9.-]/g, ""));
        if (!isNaN(num)) companyData[dbField] = num;
      } else if (DATE_FIELDS.has(dbField)) {
        // Monday dates come as "YYYY-MM-DD" in text
        const dateMatch = col.text.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) companyData[dbField] = dateMatch[0];
      } else {
        companyData[dbField] = col.text;
      }
    }
  }
  console.log("=== Mapped company data ===", JSON.stringify(companyData));

  return companyData;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Monday webhook received:", JSON.stringify(body));

    // Handle Monday.com webhook challenge verification (must respond before signature check)
    if (body.challenge) {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Monday.com JWT signature
    const MONDAY_SIGNING_SECRET = Deno.env.get("MONDAY_SIGNING_SECRET");
    if (MONDAY_SIGNING_SECRET) {
      const authHeader = req.headers.get("Authorization");
      const isValid = await verifyMondayJwt(authHeader, MONDAY_SIGNING_SECRET);
      if (!isValid) {
        console.error("Invalid Monday.com webhook signature");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("Monday.com webhook signature verified ✓");
    } else {
      console.warn("MONDAY_SIGNING_SECRET not configured — skipping signature verification");
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
      newStatus = parsed?.label || parsed?.text || "";
    } catch {
      newStatus = String(columnValue || "");
    }

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if company already exists by name
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("name", pulseName)
      .maybeSingle();

    if (existing) {
      console.log(`Company "${pulseName}" already exists, skipping`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "already_exists", company_id: existing.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch full item data from Monday API
    let companyFields: Record<string, string> = {};
    if (MONDAY_API_TOKEN) {
      console.log(`Fetching Monday item data for pulseId: ${pulseId}`);
      const itemData = await fetchMondayItemData(pulseId, MONDAY_API_TOKEN);
      if (itemData?.column_values) {
        companyFields = mapColumnValues(itemData.column_values);
      }
    } else {
      console.warn("MONDAY_API_TOKEN not set - creating company with name only");
    }

    // Create company with all mapped data
    const { data: newCompany, error: insertError } = await supabase
      .from("companies")
      .insert({
        name: pulseName,
        status: "active",
        ...companyFields,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating company:", insertError);
      throw new Error(`Failed to create company: ${insertError.message}`);
    }

    console.log(`Company "${pulseName}" created with ID: ${newCompany.id}`);

    // Auto-create invitation if contact email is available
    const contactEmail = companyFields.contact_email;
    if (contactEmail) {
      // We need a system user ID for invited_by. Use a service-level approach:
      // Find any advisor to use as the inviter
      const { data: advisor } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "advisor")
        .limit(1)
        .maybeSingle();

      if (advisor) {
        const { error: inviteError } = await supabase
          .from("company_invitations")
          .insert({
            company_id: newCompany.id,
            email: contactEmail,
            invited_by: advisor.user_id,
            status: "pending",
          });

        if (inviteError) {
          console.error("Error creating invitation:", inviteError);
        } else {
          console.log(`Invitation created for ${contactEmail} to company ${newCompany.id}`);

          // Trigger invitation email (test-mode controlled by EMAIL_SENDING_ENABLED secret)
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
                signup_url: "https://id-preview--0bcda7a6-4154-4a81-9f82-fcdf623eb7ea.lovable.app/auth",
              }),
            });
            const emailData = await emailRes.json();
            console.log("Invitation email result:", JSON.stringify(emailData));
          } catch (emailErr) {
            console.error("Could not trigger invitation email:", emailErr);
          }
        }
      } else {
        console.warn("No advisor found to set as inviter - skipping invitation");
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        company_id: newCompany.id,
        name: pulseName,
        fields_mapped: Object.keys(companyFields),
        invitation_sent: !!contactEmail,
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
