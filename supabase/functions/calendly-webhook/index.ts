import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

// Bucket C: ekstern webhook fra Mortens Calendly-konto. Signaturverifikation FOER parsing.
// Modtager invitee.created / invitee.canceled, beviser beskeden aegte via HMAC-signatur,
// laeser VORES booking-id ud (indlejret i etape 1 som salesforce_uuid / utm_content) og
// opdaterer session_bookings. Mortens signing key saettes som secret i etape 3.

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

  // 2. Signing key. Saettes foerst i etape 3 -> graceful 503 indtil da. Ingen crash.
  const signingKey = Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY");
  if (!signingKey) {
    console.error("[calendly-webhook] CALENDLY_WEBHOOK_SIGNING_KEY mangler, ikke konfigureret endnu.");
    return json(503, { error: "Webhook ikke konfigureret endnu." });
  }

  // 3. RAA body FOER parse (re-stringify braekker signaturen). INGEN service-role-handling foer
  //    signaturen er bevist aegte.
  const rawBody = await req.text();
  const sig = req.headers.get("Calendly-Webhook-Signature") || "";
  if (!await verifyCalendlySignature(rawBody, sig, signingKey)) {
    console.error("[calendly-webhook] Ugyldig signatur, afviser.");
    return json(401, { error: "invalid signature" });
  }

  // 4. Parse FOERST efter verifikation. Service-role-klient til UPDATE (RLS: service_role FOR ALL).
  const event = JSON.parse(rawBody);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 5. Udtraek VORES booking-id. salesforce_uuid er Calendlys dedikerede pass-through; utm_content
  //    er fallback. Mangler/ugyldigt -> 200 (fremmed event, ikke vores; Calendly maa ikke retry'e).
  const tracking = event?.payload?.tracking || {};
  const bookingId: string = tracking.salesforce_uuid || tracking.utm_content || "";
  if (!bookingId || !isUuid(bookingId)) {
    console.log("[calendly-webhook] Fremmed event uden gyldigt booking-id, ignoreres.");
    return json(200, { received: true, skipped: "fremmed event" });
  }

  // 6. Behandl event-typen.
  switch (event.event) {
    case "invitee.created": {
      // advisor='morten' = sikkerhedsnet (denne webhook er Mortens konto).
      // neq cancelled lader en flytning opdatere det nye tidspunkt paa en allerede-booket
      // raekke, mens en aflyst booking ikke genoplives af en forsinket created.
      const { data: updated, error } = await admin
        .from("session_bookings")
        .update({ status: "booked", calendly_event_uri: event.payload.event })
        .eq("id", bookingId)
        .eq("advisor", "morten")
        .neq("status", "cancelled")
        .select("id");

      if (error) {
        // AEgte DB-fejl: returnér 500 saa Calendly proever igen. En retry er sikker: created
        // skriver de samme vaerdier (status booked + samme event_uri), saa gentagelse er harmloes.
        console.error("[calendly-webhook] DB-fejl ved booked-opdatering, Calendly proever igen:", error);
        return json(500, { error: "db error" });
      }
      if (!updated || updated.length === 0) {
        console.log("[calendly-webhook] invitee.created: ukendt id eller aflyst.");
        return json(200, { received: true, skipped: "ukendt id eller aflyst" });
      }
      console.log(`[calendly-webhook] invitee.created: booking ${bookingId} -> booked.`);
      return json(200, { received: true });
    }

    case "invitee.canceled": {
      // Flytning: Calendly sender canceled (rescheduled=true) + en ny created. Roer intet,
      // saa bookingen forbliver 'booked' indtil den foelgende created bekraefter det nye tidspunkt.
      if (event.payload.rescheduled === true) {
        console.log("[calendly-webhook] invitee.canceled (rescheduled=true): flytning, beholder booket, roerer intet.");
        return json(200, { received: true, skipped: "flytning" });
      }

      // AEgte aflysning -> status 'cancelled'. VIGTIGT: roer IKKE companies.intro_session_used_at;
      // den gratis forbliver brugt. Genaabning er en bevidst admin-handling via fluebenet (etape 4+).
      const { error } = await admin
        .from("session_bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId)
        .eq("advisor", "morten")
        .select("id");

      if (error) {
        // AEgte DB-fejl: returnér 500 saa Calendly proever igen.
        console.error("[calendly-webhook] DB-fejl ved cancelled-opdatering, Calendly proever igen:", error);
        return json(500, { error: "db error" });
      }
      // 0 rows (ukendt id ved aflysning) ignoreres bevidst -> 200.
      console.log(`[calendly-webhook] invitee.canceled (aegte): booking ${bookingId} -> cancelled. intro_session_used_at uroert.`);
      return json(200, { received: true });
    }

    default: {
      console.log(`[calendly-webhook] Ubehandlet event-type: ${event.event}`);
      return json(200, { received: true, skipped: "ubehandlet event-type" });
    }
  }
});
