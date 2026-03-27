import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Automated chat nudges have been intentionally disabled.
  // Rationale: Chat is the personal channel between member and
  // advisor. Sending automated messages from the advisor's
  // user_id creates false impressions of human contact and
  // damages trust.
  //
  // Instead, advisor engagement signals are surfaced on the
  // advisor dashboard (passive/active filter, engagement dots)
  // so advisors can choose to reach out personally when relevant.
  //
  // The welcome message (sent once on member activation) is
  // handled by a separate function and is kept.
  return new Response(
    JSON.stringify({
      status: "disabled",
      reason: "Automated chat nudges removed to preserve chat authenticity",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
