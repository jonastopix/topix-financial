/**
 * publish-event — publicér et event OG giv alle aktive medlemmer besked
 * (10/9-2026, recon-eventmails.md §1).
 *
 * AFGJORT: en edge function kaldt fra editorens «Publicér» — samme form som
 * cancel-event (Bucket A: authenticateUser → advisor-rolletjek via
 * user_roles → service-role). Ikke en trigger (notificationWriter.ts:
 * «NO database triggers. Edge functions are the sole writers»), ikke et
 * cron-vindue (op til et døgns forsinkelse for noget der er en handling).
 * Statusskiftet OG beskederne sker i samme kald: en kladde sender aldrig
 * noget, og et allerede publiceret event er en no-op.
 *
 * MODTAGERNE er husets dom get_event_non_responders(event_id): aktivt
 * medlemskab, ikke advisor, ikke legat, intet aktivt svar — for et nyt event
 * er det alle aktive medlemmer; ved «Genåbn som publiceret» udelukker den dem
 * der allerede har svaret. dedup_key event_published:{id} er stabil, så et
 * retry aldrig dobbelt-notificerer. Mailen går ad notifikationsvejen
 * (send-notification-email: important, 15 min, 07–20, prefs, klokken).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";
import { publiceringsBesked } from "../_shared/eventMails.ts";

const LOG = "[publish-event]";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // Rolletjek som cancel-event: .limit(1) + længde, ikke maybeSingle (advisor+admin = to rækker).
  const { data: roleRows, error: roleError } = await callerClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .in("role", ["advisor", "admin"])
    .limit(1);
  if (roleError) {
    console.error(`${LOG} role lookup failed:`, roleError);
    return json({ error: "Role lookup failed" }, 500);
  }
  if ((roleRows ?? []).length === 0) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const eventId = typeof body?.event_id === "string" ? body.event_id : "";
  if (!eventId) return json({ error: "event_id is required" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, starts_at, meet_url, status")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) {
    console.error(`${LOG} event lookup failed:`, eventError);
    return json({ error: "Event lookup failed" }, 500);
  }
  if (!event) return json({ error: "Event not found" }, 404);
  if (!event.title?.trim() || !event.starts_at) return json({ error: "Titel og starttidspunkt skal være sat før publicering" }, 400);
  if (event.status === "published") return json({ ok: true, already_published: true, notified: 0 });

  // Statusskiftet FØR beskederne: fejler det, sendes intet.
  const { error: updateError } = await admin.from("events").update({ status: "published" }).eq("id", eventId);
  if (updateError) {
    console.error(`${LOG} status update failed:`, updateError);
    return json({ error: "Could not publish event" }, 500);
  }

  const { data: modtagere, error: rpcError } = await admin.rpc("get_event_non_responders", { p_event_id: eventId });
  if (rpcError) {
    // Eventet ER publiceret; beskederne udeblev. Sig det, kast ikke.
    console.error(`${LOG} recipients lookup failed:`, rpcError);
    return json({ ok: true, published: true, notified: 0, notify_error: rpcError.message });
  }
  const recipientIds = [...new Set(((modtagere ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  const notified = await writeNotificationToMany(admin, recipientIds, publiceringsBesked(event));

  console.log(`${LOG} done`, { eventId, recipients: recipientIds.length, notified });
  return json({ ok: true, published: true, recipients: recipientIds.length, notified });
});
