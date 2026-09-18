import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { doemCalendlyEvent, genaabnerRet } from "../_shared/calendlyWebhookDom.ts";
import { hentAnsoegning, udfoerOvergang } from "../_shared/ansoegningMotor.ts";

// Bucket C: ekstern webhook fra Calendly. Signaturverifikation FOER parsing.
// Modtager invitee.created / invitee.canceled, beviser beskeden aegte via HMAC-signatur,
// laeser VORES booking-id ud (indlejret i booking_url som salesforce_uuid / utm_content) og
// opdaterer session_bookings.
//
// TRE SPOR, TO ABONNEMENTER, TO NOEGLER (13/9, recon-calendly-reparationen.md §5b):
//   Mortens inkluderede   — abonnement i Mortens Calendly-org (oprettet 23/6), noeglen
//                           CALENDLY_WEBHOOK_SIGNING_KEY (navnet er arv; den er Mortens).
//   Jonas' inkluderede    — abonnement i Jonas' org (oprettet 13/9 kl. 22:16, daekker hele
//   Jonas' koebte            organisationen), noeglen CALENDLY_WEBHOOK_SIGNING_KEY_JONAS.
// Alle tre spor indlejrer raekkens id i linket (create-free-intro-booking for de inkluderede,
// stripe-webhook for det koebte), saa matchningen er ens; raekkens advisor + amount_dkk
// styrer sideeffekterne (dommen i _shared/calendlyWebhookDom.ts, testet). Foer 13/9
// filtrerede UPDATE'erne paa advisor='morten', saa Jonas' spor aldrig blev ramt — det
// filter er aabnet.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, calendly-webhook-signature",
};

// SPEJLER verifyStripeSignature noejagtigt. Eneste forskel: header-navnet laeses i kaldet,
// ikke her. Calendly bruger hex som Stripe (bekraeftet via Calendly developer community).
// Hvis live-signatur fejler, er hex vs base64 foerste sted at kigge.
async function verifyCalendlySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.slice(2);
  const v1 = parts.find(p => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return expected === v1;
}

// Lille UUID-tjek saa fremmede events (uden vores id) afvises tidligt med 200.
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 2. Signing keys — EN PR. ABONNEMENT, ikke en delt (13/9). En delt noegle kobler de to
  //    spor sammen: roteres den et sted, fejler BEGGE abonnementer med 401, Calendly retry'er
  //    i 24 timer og saetter dem derefter `disabled`, hvilket ikke kan genaktiveres (skal
  //    slettes og oprettes igen). To noegler goer sporene uafhaengige.
  //    Funktionen SKAL taale at den anden secret MANGLER: kun en noegle i listen -> praecis
  //    som foer 13/9. Det goer det ufarligt at udrulle koden foer secret + abonnement findes.
  //    Ingen noegle overhovedet -> graceful 503 som hidtil. Ingen crash.
  const signingKeys = [
    { spor: "morten", key: Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY") },
    { spor: "jonas", key: Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY_JONAS") },
  ].filter((k): k is { spor: string; key: string } => !!k.key);
  if (signingKeys.length === 0) {
    console.error("[calendly-webhook] Ingen signing key (CALENDLY_WEBHOOK_SIGNING_KEY / _JONAS), ikke konfigureret endnu.");
    return json(503, { error: "Webhook ikke konfigureret endnu." });
  }

  // 3. RAA body FOER parse (re-stringify braekker signaturen). INGEN service-role-handling foer
  //    signaturen er bevist aegte. Proev hver noegle; husk HVILKEN der matchede — den er i sig
  //    selv beviset for hvilket abonnement (og dermed hvilken vaert) beskeden kommer fra.
  const rawBody = await req.text();
  const sig = req.headers.get("Calendly-Webhook-Signature") || "";
  let verificeretMed: string | null = null;
  for (const k of signingKeys) {
    if (await verifyCalendlySignature(rawBody, sig, k.key)) {
      verificeretMed = k.spor;
      break;
    }
  }
  if (!verificeretMed) {
    console.error(`[calendly-webhook] Ugyldig signatur (proevet ${signingKeys.length} noegle(r)), afviser.`);
    return json(401, { error: "invalid signature" });
  }

  // 4. Parse FOERST efter verifikation. Service-role-klient til UPDATE (RLS: service_role FOR ALL).
  const event = JSON.parse(rawBody);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 4b. MAAL vaertsidentiteten foer den evt. haandhaeves (13/9, recon B7). Spec'en lover
  //     top-level created_by (abonnementets opretter) og scheduled_event.event_memberships[]
  //     (vaerten: user, user_email) — ikke maalt mod en faktisk payload. Logges ved HVER event,
  //     ogsaa fremmede, sammen med den noegle der verificerede. Haandhaeves IKKE: raekkens
  //     advisor styrer sideeffekterne (dommen), indtil disse felter er set i function-logs.
  const vaert = event?.payload?.scheduled_event?.event_memberships?.[0];
  console.log(
    `[calendly-webhook] ${event?.event ?? "?"} verificeret med '${verificeretMed}'. ` +
    `created_by=${event?.created_by ?? "?"} vaert.user=${vaert?.user ?? "?"} vaert.user_email=${vaert?.user_email ?? "?"}`,
  );

  // 5. Udtraek VORES booking-id. salesforce_uuid er Calendlys dedikerede pass-through; utm_content
  //    er fallback. Mangler/ugyldigt -> 200 (fremmed event, ikke vores; Calendly maa ikke retry'e).
  const tracking = event?.payload?.tracking || {};
  const bookingId: string = tracking.salesforce_uuid || tracking.utm_content || "";
  if (!bookingId || !isUuid(bookingId)) {
    console.log("[calendly-webhook] Fremmed event uden gyldigt booking-id, ignoreres.");
    return json(200, { received: true, skipped: "fremmed event" });
  }

  // 6. Dommen FOER nogen DB-adgang (ren, testet: _shared/calendlyWebhookDom.ts):
  //    event-type + rescheduled -> book / aflys / ignorer.
  const dom = doemCalendlyEvent({ eventType: event.event, rescheduled: event?.payload?.rescheduled });

  if (dom.handling === "ignorer") {
    if (dom.grund === "flytning") {
      // Flytning: Calendly sender canceled (rescheduled=true) + en ny created. Roer intet,
      // saa bookingen forbliver 'booked' indtil den foelgende created bekraefter det nye tidspunkt.
      console.log("[calendly-webhook] invitee.canceled (rescheduled=true): flytning, beholder booket, roerer intet.");
      return json(200, { received: true, skipped: "flytning" });
    }
    console.log(`[calendly-webhook] Ubehandlet event-type: ${event.event}`);
    return json(200, { received: true, skipped: "ubehandlet event-type" });
  }

  if (dom.handling === "book") {
    // Matcher paa id alene (13/9) — id er PRIMARY KEY, og linket bar det kun hvis VI
    // udstedte det (create-free-intro-booking eller stripe-webhook). Advisor-filteret
    // (.eq("advisor","morten")) er fjernet her: det gjorde ikke matchet mere entydigt, det
    // afskar bare Jonas' betalte spor.
    // neq cancelled lader en flytning opdatere det nye tidspunkt paa en allerede-booket
    // raekke, mens en aflyst booking ikke genoplives af en forsinket created.
    //
    // TIDEN (8/9): payload.scheduled_event.start_time / end_time (UTC, Calendlys
    // dokumenterede felter — ikke maalt mod en faktisk payload) gemmes i SAMME
    // update som status = 'booked' (migration 20260908190000). Laeses DEFENSIVT:
    // mangler scheduled_event, eller er feltet ikke en dato, gemmes ingen tid —
    // en booking uden tid er bedre end en webhook der kaster. Null-kolonnerne
    // roeres saa ikke (spread'et er tomt), saa en tidligere gemt tid ikke
    // overskrives med null af en ufuldstaendig payload.
    //
    // FLYTNING: Calendly sender invitee.canceled (rescheduled=true) — som dommen
    // ovenfor lader ligge — og derefter en ny invitee.created med det NYE
    // scheduled_event. Den rammer denne update (raekken er 'booked', ikke
    // 'cancelled'), saa status, URI og start_tid/slut_tid overskrives: den nye
    // tid foelger med af sig selv. En retry af samme created skriver de samme
    // vaerdier og er harmloes.
    const scheduledEvent = event?.payload?.scheduled_event;
    const somTid = (v: unknown): string | null =>
      typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
    const startTid = somTid(scheduledEvent?.start_time);
    const slutTid = somTid(scheduledEvent?.end_time);
    if (!startTid) {
      console.log("[calendly-webhook] invitee.created uden laeselig scheduled_event.start_time — booking gemmes uden tid.");
    }
    const { data: updated, error } = await admin
      .from("session_bookings")
      .update({
        status: "booked",
        calendly_event_uri: event.payload.event,
        ...(startTid ? { start_tid: startTid } : {}),
        ...(slutTid ? { slut_tid: slutTid } : {}),
      })
      .eq("id", bookingId)
      .neq("status", "cancelled")
      .select("id, advisor");

    if (error) {
      // AEgte DB-fejl: returnér 500 saa Calendly proever igen. En retry er sikker: created
      // skriver de samme vaerdier (status booked + samme event_uri), saa gentagelse er harmloes.
      console.error("[calendly-webhook] DB-fejl ved booked-opdatering, Calendly proever igen:", error);
      return json(500, { error: "db error" });
    }
    if (!updated || updated.length === 0) {
      // ANSØGNINGSMOTOREN (18/9): er id'et ikke en session_bookings-række, kan det
      // være en ANSØGNING — afklaringssamtalens link bærer ansoegninger.id på
      // samme to parametre (bygBookingUrl). Dommen og trappen (indkaldt
      // annulleres, booket planlægges) ligger i motoren; her kun opslag + kald.
      const ansoegning = await hentAnsoegning(admin, bookingId);
      if (ansoegning) {
        const res = await udfoerOvergang(admin, {
          ansoegning,
          handling: { art: "book" },
          via: "calendly",
          truffetAf: null,
          nu: new Date(),
          samtale: { start: startTid ? new Date(startTid) : new Date(), slut: slutTid ? new Date(slutTid) : null, eventUri: typeof event.payload?.event === "string" ? event.payload.event : null },
        });
        if (res.ok === false) {
          // 409 = allerede booket / lukket / ikke indkaldt endnu: intet at gense — 200, ingen retry.
          console.log(`[calendly-webhook] invitee.created for ansøgning : `);
          return json(res.status >= 500 ? 500 : 200, { received: true, ansoegning: bookingId, skipped: res.grund });
        }
        console.log(`[calendly-webhook] invitee.created: ansøgning  →  ( planlagt,  annulleret).`);
        return json(200, { received: true, ansoegning: bookingId, trin: res.til });
      }
      console.log("[calendly-webhook] invitee.created: ukendt id eller aflyst.");
      return json(200, { received: true, skipped: "ukendt id eller aflyst" });
    }
    console.log(`[calendly-webhook] invitee.created: booking ${bookingId} (${updated[0].advisor}) -> booked${startTid ? ` (${startTid} – ${slutTid ?? "?"})` : " (uden tid)"}.`);
    return json(200, { received: true });
  }

  // dom.handling === "aflys": aegte aflysning. Hvem der aflyste OG hvilket spor raekken er
  // paa afgoer om en ret genaabnes (genaabnerRet, testet):
  //   host aflyser Mortens inkluderede ('morten', 0) -> intro_session_used_at nulstilles.
  //   host aflyser Jonas' inkluderede ('jonas', 0)   -> jonas_session_used_at nulstilles.
  //   host aflyser Jonas' koebte ('jonas', > 0)      -> ALDRIG genaabning (F4): en koebt session
  //                                                    har ingen ret, og at nulstille en ret herfra
  //                                                    ville give virksomheden en ekstra inkluderet.
  //   invitee (medlemmet) eller ukendt               -> retten forbliver brugt; genaabning er en
  //                                                    admin-handling.
  // Advisor-filteret paa UPDATE'en er FLYTTET hertil (ikke fjernet): matchet er paa id alene,
  // gaten laeser raekkens advisor og amount_dkk, som select'en returnerer.
  const cancelerType = event?.payload?.cancellation?.canceler_type;

  const { data: cancelled, error } = await admin
    .from("session_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .select("id, company_id, advisor, amount_dkk");

  if (error) {
    console.error("[calendly-webhook] DB-fejl ved cancelled-opdatering, Calendly proever igen:", error);
    return json(500, { error: "db error" });
  }

  const ramt = cancelled && cancelled.length > 0 ? cancelled[0] : null;
  if (!ramt) {
    // ANSØGNINGSMOTOREN (18/9): en ægte aflysning af en afklaringssamtale →
    // tilbage til «indkaldt» med ny trappe (aflys_booking). Hvem der aflyste
    // ændrer intet her: der er ingen ret at genåbne på en ansøgning.
    const ansoegning = await hentAnsoegning(admin, bookingId);
    if (ansoegning) {
      const res = await udfoerOvergang(admin, { ansoegning, handling: { art: "aflys_booking" }, via: "calendly", truffetAf: null, nu: new Date() });
      console.log(`[calendly-webhook] invitee.canceled (${cancelerType ?? "?"}): ansøgning ${bookingId} → ${res.ok ? res.til : `uændret (${res.grund})`}.`);
      return json(res.ok === false && res.status >= 500 ? 500 : 200, { received: true, ansoegning: bookingId });
    }
  }
  const ret = ramt ? genaabnerRet({ cancelerType, advisor: ramt.advisor, amount_dkk: ramt.amount_dkk }) : null;
  if (ramt && ret && ramt.company_id) {
    // Host-aflysning af en inkluderet session: genaabn retten paa virksomheden, saa medlemmet
    // kan booke igen. Kolonnen vaelges af dommen — samme form for begge raadgivere.
    const { error: reopenError } = await admin
      .from("companies")
      .update({ [ret]: null })
      .eq("id", ramt.company_id);
    if (reopenError) {
      console.error("[calendly-webhook] Host-aflysning: genaabning fejlede, Calendly proever igen:", reopenError);
      return json(500, { error: "reopen error" });
    }
    console.log(`[calendly-webhook] invitee.canceled (host): booking ${bookingId} (${ramt.advisor}) -> cancelled, ${ret} genaabnet.`);
    return json(200, { received: true });
  }

  // Invitee-aflysning, ukendt afsender eller Jonas' koebte spor: status cancelled, retten uroert.
  // 0 rows (ukendt id) ignoreres bevidst -> 200.
  console.log(`[calendly-webhook] invitee.canceled (${cancelerType ?? "?"}): booking ${bookingId} (${ramt?.advisor ?? "ingen raekke"}) -> cancelled. Ingen ret genaabnet.`);
  return json(200, { received: true });
});
