/**
 * cancel-event — aflys et event OG giv alle aktive tilmeldte besked.
 *
 * Bucket A (advisor-broadcast-mønstret): authenticateUser →
 * advisor-rolletjek via user_roles → service-role.
 *
 * Modtagerne hentes DIREKTE fra event_registrations (cancelled_at IS
 * NULL) — IKKE via get_event_participants, som filtrerer på aktivt
 * medlemskab: et udløbet medlem har stadig sat tid af og skal have
 * besked. Modtagerne hentes FØR statusskiftet, så en fejl undervejs
 * ikke efterlader et aflyst event uden beskeder. Idempotens: allerede
 * aflyst → ok uden beskeder, og dedup_key er stabil pr. event, så et
 * retry aldrig dobbelt-notificerer.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("[cancel-event] invoked", { method: req.method });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) {
    console.error("[cancel-event] auth failed — returning early");
    return auth;
  }
  const { callerId, callerClient } = auth;
  console.log("[cancel-event] authenticated", { callerId });

  // Verify caller is advisor via user_roles (not profiles).
  // .limit(1) + længdetjek — IKKE .maybeSingle(): en bruger med BÅDE
  // advisor- og admin-rækken matcher to rækker, og maybeSingle
  // returnerer da en fejl i stedet for en række → falsk 403 for præcis
  // de brugere funktionen er til for.
  const { data: roleRows, error: roleError } = await callerClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .in("role", ["advisor", "admin"])
    .limit(1);

  if (roleError) {
    console.error("[cancel-event] role lookup failed:", roleError);
    return new Response(JSON.stringify({ error: "Role lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[cancel-event] role rows", { count: (roleRows ?? []).length });

  const isAdvisor = (roleRows ?? []).length > 0;
  if (!isAdvisor) {
    console.error("[cancel-event] forbidden — caller has no advisor/admin role");
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { event_id, reason } = (await req.json()) as {
    event_id: string;
    reason?: string;
  };
  console.log("[cancel-event] body", { event_id, hasReason: !!reason });

  if (!event_id) {
    console.error("[cancel-event] bad request — event_id missing");
    return new Response(JSON.stringify({ error: "event_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: event } = await adminClient
    .from("events")
    .select("id, title, starts_at, status")
    .eq("id", event_id)
    .maybeSingle();

  if (!event) {
    console.error("[cancel-event] event not found", { event_id });
    return new Response(JSON.stringify({ error: "Event not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (event.status === "cancelled") {
    return new Response(JSON.stringify({ ok: true, already_cancelled: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Modtagerne FØR statusskiftet (se filheader).
  const { data: regs, error: regsError } = await adminClient
    .from("event_registrations")
    .select("user_id")
    .eq("event_id", event_id)
    .is("cancelled_at", null);

  if (regsError) {
    console.error("[cancel-event] registrations lookup failed:", regsError);
    return new Response(JSON.stringify({ error: "Registrations lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const recipientIds = [...new Set((regs ?? []).map((r: { user_id: string }) => r.user_id))];

  const { error: updateError } = await adminClient
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", event_id);

  if (updateError) {
    console.error("[cancel-event] status update failed:", updateError);
    return new Response(JSON.stringify({ error: "Could not cancel event" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let notified = 0;
  if (recipientIds.length > 0) {
    const dateLabel = new Date(event.starts_at).toLocaleDateString("da-DK", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    notified = await writeNotificationToMany(adminClient, recipientIds, {
      type: "event_cancelled",
      priority: "important",
      title: `Aflyst: ${event.title}`,
      body: reason?.trim() || `Sessionen den ${dateLabel} er aflyst.`,
      reference_type: "event",
      reference_id: event_id,
      deep_link: `/events/${event_id}`,
      dedup_key: `event_cancelled:${event_id}`,
    });
  }

  console.log("[cancel-event] done", { notified, event_id });
  return new Response(JSON.stringify({ ok: true, notified }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
