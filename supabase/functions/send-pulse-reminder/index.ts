import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.includes(serviceKey)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const now = new Date();
  const dayOfMonth = now.getDate();

  // Only send on day 10
  if (dayOfMonth !== 10) {
    return new Response(JSON.stringify({ skipped: true, reason: "Not day 10" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Find all active companies that haven't done pulse this month
  const { data: allCompanies } = await supabase
    .from("companies")
    .select("id, name");

  const { data: doneThisMonth } = await supabase
    .from("pulse_checkins")
    .select("company_id")
    .eq("period_key", periodKey);

  const doneIds = new Set((doneThisMonth || []).map((r: any) => r.company_id));
  const missing = (allCompanies || []).filter((c: any) => !doneIds.has(c.id));

  let sent = 0;
  for (const company of missing) {
    // Get primary member email for this company
    const { data: members } = await supabase
      .from("company_members")
      .select("user_id, profiles:user_id(email, full_name)")
      .eq("company_id", company.id)
      .eq("role", "member")
      .limit(1);

    const member = members?.[0] as any;
    if (!member?.profiles?.email) continue;

    await supabase.functions.invoke("send-template-email", {
      body: {
        to: member.profiles.email,
        templateKey: "pulse_reminder",
        variables: {
          first_name: member.profiles.full_name?.split(" ")[0] || "dig",
          company_name: company.name,
          pulse_url: "https://topix.lovable.app/pulse",
        },
      },
    });
    sent++;
  }

  return new Response(JSON.stringify({ sent, missing: missing.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
