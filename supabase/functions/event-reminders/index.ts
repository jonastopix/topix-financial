/**
 * event-reminders — daglig cron (Bucket B) for event-påmindelser.
 *
 * TO vinduer målt mod starts_at (kalenderdage i Europe/Copenhagen —
 * starts_at er UTC, og en 00:30-session må ikke rykke en dag ved
 * UTC-sammenligning), begge priority "important" så de også mailes
 * (send-notification-email mailer kun action_required/important —
 * klokken alene ses ikke):
 *   A) Om 7 dage → aktive medlemmer der hverken har sagt ja eller nej
 *      (get_event_non_responders-RPC'en — begge svar udelukker).
 *      Teksten inviterer til at svare BEGGE veje og nævner ALDRIG at
 *      man ikke har svaret — fraværet må ikke gøres synligt.
 *   B) I morgen → tilmeldte (response='attending', mødelink med).
 *      Ingen samme-dags-påmindelse: det ville være tredje besked om
 *      samme event, og B dagen før med mødelinket er den der får folk
 *      til at møde op.
 *
 * Modtagere til A via get_event_non_responders (20260810210000) —
 * RPC'en bærer selv hele dommen (aktivt medlemskab, ikke legat, ikke
 * advisor, intet aktivt svar) og har EXECUTE til service_role netop
 * til dette kald. Ingen replikeret dom her.
 *
 * dedup_key pr. vindue er `event_reminder:{event_id}:{a|b}` UDEN
 * user_id: notifications har UNIQUE (user_id, dedup_key)
 * (20260323112326), så nøglen er allerede scoped pr. modtager.
 * Daglig/hyppigere genkørsel dobbelt-sender derfor aldrig.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";

const TZ = "Europe/Copenhagen";

/** Kalenderdag i dansk tid som "YYYY-MM-DD" (sv-SE giver ISO-formen). */
const dayKey = (d: Date): string => d.toLocaleDateString("sv-SE", { timeZone: TZ });

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });

const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // MIDLERTIDIG DIAGNOSTIK — fjernes når auth-sporet er lukket.
  // Afgør om SUPABASE_SERVICE_ROLE_KEY i runtime er en legacy-JWT
  // (praefiks "eyJ") eller en ny sb_secret-noegle (praefiks "sb_").
  const _diagEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const _diagHdr = req.headers.get("Authorization") ?? "";
  console.log("auth-diagnostik", JSON.stringify({
    env_laengde: _diagEnv.length,
    env_praefiks: _diagEnv.slice(0, 3),
    header_laengde: _diagHdr.length,
    header_praefiks: _diagHdr.slice(0, 10),
    er_ens: _diagHdr === `Bearer ${_diagEnv}`,
  }));

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const tomorrowKey = dayKey(new Date(now.getTime() + 1 * 86400000));
  const weekKey = dayKey(new Date(now.getTime() + 7 * 86400000));

  // Published events fra i dag og en uge frem (lidt slæk i begge ender —
  // bucket-afgørelsen er kalenderdags-nøglerne, ikke intervallet).
  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("id, title, starts_at, meet_url, status")
    .eq("status", "published")
    .gte("starts_at", new Date(now.getTime() - 86400000).toISOString())
    .lte("starts_at", new Date(now.getTime() + 8 * 86400000).toISOString());

  if (eventsError) {
    console.error("[event-reminders] events lookup failed:", eventsError);
    return new Response(JSON.stringify({ error: "Events lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let notifiedA = 0;
  let notifiedB = 0;

  for (const event of events ?? []) {
    const eventDay = dayKey(new Date(event.starts_at));

    // A) Om 7 dage — dem der hverken har sagt ja eller nej. Teksten
    // inviterer begge veje og nævner aldrig det manglende svar.
    if (eventDay === weekKey) {
      const { data: nonResponders, error: rpcError } = await admin.rpc(
        "get_event_non_responders",
        { p_event_id: event.id },
      );
      if (rpcError) {
        console.error("[event-reminders] non-responders lookup failed:", rpcError);
      } else {
        const recipients = ((nonResponders ?? []) as { user_id: string }[]).map(
          (r) => r.user_id,
        );
        notifiedA += await writeNotificationToMany(admin, recipients, {
          type: "event_reminder",
          priority: "important",
          title: `Om en uge: ${event.title}`,
          body: `${fmtDate(event.starts_at)} kl. ${fmtTime(event.starts_at)}. Sig til om du kommer.`,
          reference_type: "event",
          reference_id: event.id,
          deep_link: `/events/${event.id}`,
          dedup_key: `event_reminder:${event.id}:a`,
        });
      }
    }

    // B) I morgen — tilmeldte, mødelink med. response='attending' er
    // nødvendigt efter 20260810210000: et afbud er også en aktiv række,
    // og folk der har sagt nej skal ikke mindes om at møde op.
    if (eventDay === tomorrowKey) {
      const { data: regs } = await admin
        .from("event_registrations")
        .select("user_id")
        .eq("event_id", event.id)
        .eq("response", "attending")
        .is("cancelled_at", null);
      const recipients = [...new Set((regs ?? []).map((r: { user_id: string }) => r.user_id))];
      notifiedB += await writeNotificationToMany(admin, recipients, {
        type: "event_reminder",
        priority: "important",
        title: `I morgen: ${event.title}`,
        body: `${fmtTime(event.starts_at)}.${event.meet_url ? ` Mødelink: ${event.meet_url}` : ""}`,
        reference_type: "event",
        reference_id: event.id,
        deep_link: `/events/${event.id}`,
        dedup_key: `event_reminder:${event.id}:b`,
      });
    }
  }

  console.log("[event-reminders] done", {
    events: (events ?? []).length,
    window_a: notifiedA,
    window_b: notifiedB,
  });

  return new Response(JSON.stringify({ ok: true, window_a: notifiedA, window_b: notifiedB }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
