/**
 * flyt-event — flyt dato/tid på et event OG giv ALLE med adgang besked
 * (UDKAST 18/9-2026, recon-event-aendring.md §7; udvidet 21/9 efter Jonas'
 * beslutning, recon-eventflytning.md).
 *
 * Bucket A, kopi af cancel-events skelet: authenticateUser →
 * advisor-rolletjek via user_roles → service-role.
 *
 * Målt (reconen 18/9): en datoændring var en almindelig UPDATE fra editoren —
 * ingen klokke, ingen mail, ingen kalenderopdatering. Denne funktion er
 * den ENE vej for en flytning af et publiceret event; editoren sender
 * aldrig starts_at/ends_at til updateEvent for et publiceret event
 * (kildeværn flytEvent.guard).
 *
 * MODTAGERNE (21/9): ikke længere kun de tilmeldte. SQL-funktionen
 * public.event_svar_grupper(event_id) (migration 20260921210000, samme regel
 * som _shared/eventSvar.ts) giver alle med ADGANG til eventet (events-RLS'ens
 * har_aktivt_medlemskab), uden rådgivere, i tre grupper. De TILMELDTE får
 * tekst A (flyttetBesked: «passer det stadig?»); KAN IKKE og HAR IKKE SVARET
 * får tekst B (nytTidspunktBesked: «måske passer det bedre nu»). Samme
 * dedup-form for begge — én besked pr. person pr. ny tid.
 *
 * Rækkefølgen: modtagerne læses FØR (som cancel-event), UPDATE FØR
 * beskederne (publish-event-reglen: fejler den, sendes intet), derefter
 * writeNotificationToMany to gange (A, så B). Udkast (status='draft') → kun
 * UPDATE, ingen besked. Uændret tid → no-op. Aflyst → 409.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";
import { erFlytning, flyttetBesked, nytTidspunktBesked } from "../_shared/eventMails.ts";
import { delModtagere, type GruppeRaekke } from "../_shared/eventSvar.ts";

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

  // Modtagerne FØR opdateringen (cancel-event): ALLE med adgang, i tre
  // grupper — SQL'ens ene regel (event_svar_grupper), delt i A og B her.
  const { data: grupper, error: grupperError } = await admin.rpc("event_svar_grupper", { p_event_id: eventId });
  if (grupperError) {
    console.error(`${LOG} event_svar_grupper failed:`, grupperError);
    return json({ error: "Recipients lookup failed" }, 500);
  }
  const modtagere = delModtagere((grupper ?? []) as GruppeRaekke[]);
  const recipientIds = [...modtagere.tilmeldte, ...modtagere.andre];

  // UPDATE FØR beskederne: fejler den, sendes intet.
  const { error: updateError } = await admin.from("events").update(patch).eq("id", eventId);
  if (updateError) {
    console.error(`${LOG} update failed:`, updateError);
    return json({ error: "Could not move event" }, 500);
  }

  // Kun et PUBLICERET event har tilmeldte der skal have besked; en kladde
  // flyttes i stilhed (ingen kan have set den).
  if (event.status !== "published") {
    // BEVISET for udrulningen (CLAUDE.md «Deployment af edge functions»):
    // også en kladde svarer med `grupper` — det gjorde koden før 21/9 ikke.
    // Flyt en kladde efter deployet: svaret bærer feltet, eller bundlen er gammel.
    console.log(`${LOG} moved ${eventId} (${event.status}) — no notifications`, { grupper: { tilmeldte: modtagere.tilmeldte.length, andre: modtagere.andre.length } });
    return json({ ok: true, moved: true, notified: 0, status: event.status, grupper: { tilmeldte: modtagere.tilmeldte.length, andre: modtagere.andre.length } });
  }

  const tilMail = { id: event.id, title: event.title, starts_at: nyStart, meet_url: event.meet_url };
  const notifiedGrupper = { tilmeldte: 0, andre: 0 };
  let notifyError: string | undefined;
  try {
    // Tekst A til de tilmeldte, tekst B til de andre — samme dedup-nøgle, så én person får højst én.
    if (modtagere.tilmeldte.length > 0) {
      notifiedGrupper.tilmeldte = await writeNotificationToMany(admin, modtagere.tilmeldte, flyttetBesked(tilMail, event.starts_at));
    }
    if (modtagere.andre.length > 0) {
      notifiedGrupper.andre = await writeNotificationToMany(admin, modtagere.andre, nytTidspunktBesked(tilMail, event.starts_at));
    }
  } catch (e) {
    // Eventet ER flyttet; beskederne udeblev. Sig det, kast ikke (publish-event).
    notifyError = e instanceof Error ? e.message : String(e);
    console.error(`${LOG} notifications failed:`, notifyError);
  }
  const notified = notifiedGrupper.tilmeldte + notifiedGrupper.andre;

  console.log(`${LOG} done`, { event_id: eventId, from: event.starts_at, to: nyStart, recipients: recipientIds.length, grupper: { tilmeldte: modtagere.tilmeldte.length, andre: modtagere.andre.length }, notified, notified_grupper: notifiedGrupper });
  return json({
    ok: true,
    moved: true,
    recipients: recipientIds.length,
    grupper: { tilmeldte: modtagere.tilmeldte.length, andre: modtagere.andre.length },
    notified,
    notified_grupper: notifiedGrupper,
    ...(notifyError ? { notify_error: notifyError } : {}),
  });
});
