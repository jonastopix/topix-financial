import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { hardDeleteCompany } from "../_shared/companyHardDelete.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CleanupRequest {
  action:
    | "hard_delete_company"
    | "delete_orphan_user"
    | "delete_dangling_invitations"
    | "purge_old_email_log";
  company_id?: string;
  user_id?: string;
  delete_users?: boolean;
  dry_run?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin, error: roleErr } = await adminClient.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });

    if (roleErr || !isAdmin) {
      console.warn(`[admin-cleanup-test-data] Forbidden for user ${callerId}`);
      return new Response(
        JSON.stringify({ error: "Forbidden — admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as CleanupRequest;
    const dryRun = body.dry_run ?? false;

    console.log(`[admin-cleanup-test-data] action=${body.action} dry_run=${dryRun} caller=${callerId}`);

    if (body.action === "hard_delete_company") {
      if (!body.company_id) {
        return new Response(
          JSON.stringify({ error: "company_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: company, error: coErr } = await adminClient
        .from("companies")
        .select("id, name")
        .eq("id", body.company_id)
        .maybeSingle();

      if (coErr || !company) {
        return new Response(
          JSON.stringify({ error: "Company not found", company_id: body.company_id }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (dryRun) {
        return new Response(
          JSON.stringify({ ok: true, dry_run: true, would_delete: company }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await hardDeleteCompany(adminClient, body.company_id, {
        deleteUsers: body.delete_users ?? false,
      });

      console.log(
        `[admin-cleanup-test-data] hard_delete_company done: ${company.name} — users=${result.userIds.length} conversations=${result.conversationIds.length} handouts=${result.handoutIds.length}`,
      );

      return new Response(
        JSON.stringify({ ok: true, deleted: company, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "delete_orphan_user") {
      if (!body.user_id) {
        return new Response(
          JSON.stringify({ error: "user_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: memberships } = await adminClient
        .from("company_members")
        .select("company_id")
        .eq("user_id", body.user_id);

      if (memberships && memberships.length > 0) {
        return new Response(
          JSON.stringify({
            error: "User is not orphan — still attached to companies",
            user_id: body.user_id,
            companies: memberships.map((m: any) => m.company_id),
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (dryRun) {
        return new Response(
          JSON.stringify({ ok: true, dry_run: true, would_delete_user: body.user_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Best-effort cleanup of supporting rows
      await adminClient.from("profiles").delete().eq("user_id", body.user_id);
      await adminClient.from("notifications").delete().eq("user_id", body.user_id);
      try {
        await adminClient.from("user_login_log").delete().eq("user_id", body.user_id);
      } catch (_) {
        // table may not exist in all envs
      }

      const { error: authDelErr } = await adminClient.auth.admin.deleteUser(body.user_id);
      if (authDelErr) {
        return new Response(
          JSON.stringify({ error: `Failed to delete auth user: ${authDelErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log(`[admin-cleanup-test-data] Deleted orphan user ${body.user_id}`);

      return new Response(
        JSON.stringify({ ok: true, deleted_user_id: body.user_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "delete_dangling_invitations") {
      if (dryRun) {
        const { count } = await adminClient
          .from("company_invitations")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .is("company_id", null);
        return new Response(
          JSON.stringify({ ok: true, dry_run: true, would_delete: count }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { error, count } = await adminClient
        .from("company_invitations")
        .delete({ count: "exact" })
        .eq("status", "pending")
        .is("company_id", null);
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ ok: true, deleted: count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "purge_old_email_log") {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      if (dryRun) {
        const { count } = await adminClient
          .from("email_send_log")
          .select("*", { count: "exact", head: true })
          .lt("created_at", cutoff);
        return new Response(
          JSON.stringify({ ok: true, dry_run: true, would_delete: count, cutoff }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { error, count } = await adminClient
        .from("email_send_log")
        .delete({ count: "exact" })
        .lt("created_at", cutoff);
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ ok: true, deleted: count, cutoff }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error(`[admin-cleanup-test-data] Error:`, err);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
