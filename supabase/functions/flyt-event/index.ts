/**
 * flyt-event — flyt dato/tid på et event OG giv de tilmeldte besked
 * (UDKAST 18/9-2026, recon-event-aendring.md §7).
 *
 * Bucket A, kopi af cancel-events skelet: authenticateUser →
 * advisor-rolletjek via user_roles → service-role.
 *
 * Målt (reconen): en datoændring var en almindelig UPDATE fra editoren —
 * ingen klokke, ingen mail, ingen kalenderopdatering. Denne funktion er
 * den ENE vej for en flytning af et publiceret event; editoren sender
 * aldrig starts_at/ends_at til updateEvent for et publiceret event
 * (kildeværn flytEvent.guard).
 *
 * Rækkefølgen: modtagerne læses FØR (som cancel-event), UPDATE FØR
 * beskederne (publish-event-reglen: fejler den, sendes intet), derefter
 * writeNotificationToMany med flyttetBesked. Modtagere = tilmeldte
 * (response='attending' AND cancelled_at IS NULL) — kun dem der har sat
 * tid af; afbud får ingen besked. Udkast (status='draft') → kun UPDATE,
 * ingen besked. Uændret tid → no-op. Aflyst → 409. Dedup bærer den nye
 * starttid: event_flyttet:{id}:{ny starts_at}.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";
import { erFlytning, flyttetBesked } from "../_shared/eventMails.ts";

const LOG = "[flyt-event]";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Gyldigt tidspunkt → ISO/UTC; ellers null. */
function tilIso(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // .limit(1) + længdetjek — IKKE .maybeSingle() (cancel-event: en bruger med
  // både advisor- og admin-rækken ville ellers få falsk 403).
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

  const body = (await req.json().catch(() => null)) as { event_id?: unknown; starts_at?: unknown; ends_at?: unknown } | null;
  const eventId = typeof body?.event_id === "string" ? body.event_id.trim() : "";
  if (!eventId) return json({ error: "event_id is required" }, 400);
  const nyStart = tilIso(body?.starts_at);
  if (!nyStart) return json({ error: "starts_at skal være et gyldigt tidspunkt" }, 400);
  // ends_at: undefined = urørt; null = fjernes; streng = sættes.
  const endsGivet = body !== null && Object.prototype.hasOwnProperty.call(body, "ends_at");
  const nySlut = endsGivet ? (body?.ends_at === null ? null : tilIso(body?.ends_at)) : undefined;
  if (endsGivet && body?.ends_at !== null && nySlut === null) return json({ error: "ends_at skal være et gyldigt tidspunkt eller null" }, 400);
  if (nySlut && new Date(nySlut).getTime() <= new Date(nyStart).getTime()) return json({ error: "ends_at skal ligge efter starts_at" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, starts_at, ends_at, status, meet_url")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) {
    console.error(`${LOG} event lookup failed:`, eventError);
    return json({ error: "Event lookup failed" }, 500);
  }
  if (!event) return json({ error: "Event not found" }, 404);
  if (event.status === "cancelled") return json({ error: "Et aflyst event kan ikke flyttes" }, 409);

  const patch: { starts_at: string; ends_at?: string | null } = { starts_at: nyStart };
  if (nySlut !== undefined) patch.ends_at = nySlut;
  if (!erFlytning(event, patch)) return json({ ok: true, unchanged: true, notified: 0 });

  // Modtagerne FØR opdateringen (cancel-event): tilmeldte, ikke afmeldt.
  const { data: regs, error: regsError } = await admin
    .from("event_registrations")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("response", "attending")
    .is("cancelled_at", null);
  if (regsError) {
    console.error(`${LOG} registrations lookup failed:`, regsError);
    return json({ error: "Registrations lookup failed" }, 500);
  }
  const recipientIds = [...new Set((regs ?? []).map((r: { user_id: string }) => r.user_id))];

  // UPDATE FØR beskederne: fejler den, sendes intet.
  const { error: updateError } = await admin.from("events").update(patch).eq("id", eventId);
  if (updateError) {
    console.error(`${LOG} update failed:`, updateError);
    return json({ error: "Could not move event" }, 500);
  }

  // Kun et PUBLICERET event har tilmeldte der skal have besked; en kladde
  // flyttes i stilhed (ingen kan have set den).
  if (event.status !== "published") {
    console.log(`${LOG} moved ${eventId} (${event.status}) — no notifications`);
    return json({ ok: true, moved: true, notified: 0, status: event.status });
  }

  let notified = 0;
  let notifyError: string | undefined;
  if (recipientIds.length > 0) {
    try {
      notified = await writeNotificationToMany(
        admin,
        recipientIds,
        flyttetBesked({ id: event.id, title: event.title, starts_at: nyStart, meet_url: event.meet_url }, event.starts_at),
      );
    } catch (e) {
      // Eventet ER flyttet; beskederne udeblev. Sig det, kast ikke (publish-event).
      notifyError = e instanceof Error ? e.message : String(e);
      console.error(`${LOG} notifications failed:`, notifyError);
    }
  }

  console.log(`${LOG} done`, { event_id: eventId, from: event.starts_at, to: nyStart, recipients: recipientIds.length, notified });
  return json({ ok: true, moved: true, recipients: recipientIds.length, notified, ...(notifyError ? { notify_error: notifyError } : {}) });
});
