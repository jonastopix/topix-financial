import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Monday.com sends a challenge for webhook verification
    const body = await req.json();
    console.log("Monday webhook received:", JSON.stringify(body));

    // Handle Monday.com webhook challenge verification
    if (body.challenge) {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = body.event;
    if (!event) {
      return new Response(JSON.stringify({ error: "No event in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if the status column changed to "I gang" (or equivalent)
    const columnId = event.columnId;
    const columnValue = event.value;
    const previousValue = event.previousValue;
    const pulseId = event.pulseId;
    const pulseName = event.pulseName;
    const boardId = event.boardId;

    console.log(`Column ${columnId} changed from`, previousValue, "to", columnValue, "for item:", pulseName);

    // Parse the status value - Monday sends it as JSON string
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

    // Create new company from Monday item
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
      console.log(`Company "${pulseName}" already exists, skipping creation`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "already_exists", company_id: existing.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract column values from the event if available
    // Monday sends column values in the event payload
    const columnValues = event.columnValues || {};

    const { data: newCompany, error: insertError } = await supabase
      .from("companies")
      .insert({
        name: pulseName,
        status: "active",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating company:", insertError);
      throw new Error(`Failed to create company: ${insertError.message}`);
    }

    console.log(`Company "${pulseName}" created with ID: ${newCompany.id}`);

    return new Response(
      JSON.stringify({ ok: true, company_id: newCompany.id, name: pulseName }),
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
