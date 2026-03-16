import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Accept either service-role key OR verify caller is advisor
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  
  let authorized = false;
  if (token === serviceRoleKey) {
    authorized = true;
  } else {
    // Check if caller is advisor
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData } = await authClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (callerId) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data } = await adminClient.from("user_roles").select("role").eq("user_id", callerId).eq("role", "advisor").maybeSingle();
      if (data) authorized = true;
    }
  }
  
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { email } = await req.json();
  if (!email) {
    return new Response(JSON.stringify({ error: "email required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: email,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      action_link: data.properties?.action_link,
      hashed_token: data.properties?.hashed_token,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
