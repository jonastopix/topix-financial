import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { verifyEwebinarSignature } from "../_shared/ewebinarSignatur.ts";
import { doemSetGrad, fletTilmelding, plukTilmelding, type WebinarTilmelding } from "../_shared/webinarDom.ts";
import { afgoerOvergang, byggFremmoede } from "../_shared/webinarHaendelser.ts";
import { afmeldHvisNoegle, sendHvisMail } from "../_shared/klaviyoAfsendelse.ts";
import { erAfmeldt, skalAfmeldes } from "../_shared/webinarAfmelding.ts";
import { sha256Hex } from "../_shared/aftryk.ts";

// Bucket C: ekstern webhook fra eWebinar (udkast 19/9-2026,
// ~/Downloads/udkast-ewebinar-webhook/README.md). Signaturverifikation FOER
// parsing, FOER service role — samme form som calendly-webhook, som er det
// taetteste forbillede (Stripe-formen t=,v1= over «<tidsstempel>.<raa body>»).
//
// HVAD DEN GOER: eWebinar POSTer registrant-objektet ved HVER aendring
// (trigger «All» — README §5). Vi gemmer ALT raat i webinar_haendelser (én
// raekke pr. modtaget besked, idempotent paa SHA-256 af den raa body) og
// holder EN aktuel raekke pr. tilmelding i webinar_tilmeldinger (upsert paa
// eWebinars registrant-id), hvor procenten aldrig gaar ned (fletTilmelding).
// Dommen «har set / delvist / moedte ikke op» ligger i _shared/webinarDom.ts
// (ren, testet) og regnes af laeserne — her logges den kun.
//
// AFMELDINGEN VIDERE TIL KLAVIYO (22/9-2026, ~/Downloads/recon-ewebinar-afmelding.md):
// eWebinars «Unsubscribed» blev gemt og ellers ikke brugt til noget. Nu goer den to
// ting i samme kald: (a) mailen afmeldes fra e-mailmarkedsfoering hos Klaviyo
// (afmeldHvisNoegle), og (b) fremmoede-haendelsen SENDES IKKE for en tilmelding, der
// er afmeldt. Begge fail-soft: en afmelding maa aldrig faa eWebinar til at gensende.
//
// SVARKODERNE: 401 uden gyldig signatur (afvis, aldrig retry); 503 uden
// hemmelighed (ikke konfigureret endnu); 400 naar en aegte besked ikke er
// JSON; 200 for alt vi ikke kan bruge (ukendt form, gensendelse) saa eWebinar
// ikke gensender; 500 KUN ved DB-fejl, saa en gensendelse faar en ny chance.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ewebinar-signature, x-ewebinar-timestamp",
};

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
  // En GET/HEAD (eWebinars «Connect» KAN probe URL'en — ikke dokumenteret) faar
  //    200 uden at roere noget; alt andet end POST er 405.
  if (req.method === "GET" || req.method === "HEAD") {
    return json(200, { ok: true });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method not allowed" });
  }

  // 2. Hemmeligheden — EWEBINAR_WEBHOOK_SIGNING_SECRET (README §5: vises én gang
  //    i eWebinar ved oprettelse/rotation). Mangler den, er webhooken ikke sat op
  //    endnu: graceful 503 som calendly-webhook. Ingen crash.
  const secret = Deno.env.get("EWEBINAR_WEBHOOK_SIGNING_SECRET");
  if (!secret) {
    console.error("[ewebinar-webhook] Ingen EWEBINAR_WEBHOOK_SIGNING_SECRET, ikke konfigureret endnu.");
    return json(503, { error: "Webhook ikke konfigureret endnu." });
  }

  // 3. RAA body FOER parse (re-stringify braekker signaturen). INGEN service-
  //    role-handling foer signaturen er bevist aegte.
  const rawBody = await req.text();
  const dom = await verifyEwebinarSignature({
    rawBody,
    signaturHeader: req.headers.get("X-EWebinar-Signature"),
    tidsstempelHeader: req.headers.get("X-EWebinar-Timestamp"),
    secret,
  });
  if (dom.ok === false) {
    console.error(`[ewebinar-webhook] Ugyldig signatur (${dom.grund}), afviser.`);
    return json(401, { error: "invalid signature" });
  }

  // 4. Parse FOERST efter verifikation. En aegte besked der ikke er JSON er
  //    en fejl hos afsenderen — 400, ikke 500 (ingen DB-fejl at gense).
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("[ewebinar-webhook] Signeret besked er ikke JSON.");
    return json(400, { error: "body is not json" });
  }

  // 5. Pluk det vi kender (ren dom). Fejler plukket, gemmes beskeden ALLIGEVEL
  //    raat nedenfor — saa er intet tabt, og feltet kan plukkes bagefter.
  const pluk = plukTilmelding(event);
  const t = pluk.ok ? pluk.tilmelding : null;

  // 6. Service-role-klient til skrivning (RLS: service_role FOR ALL; ingen
  //    klient skriver disse tabeller).
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 7. Loggen: én raekke pr. modtaget besked, idempotent paa aftrykket af den
  //    raa body (gensender eWebinar den samme besked, rammer den unikhedsreglen
  //    og springes over — ignoreDuplicates). Raa payload gemmes altid.
  const aftryk = await sha256Hex(rawBody);
  const { data: logget, error: logFejl } = await admin
    .from("webinar_haendelser")
    .upsert(
      {
        aftryk,
        signatur_t: /^\d+$/.test(dom.t) ? Number(dom.t) : null,
        noegleform: dom.form,
        action: t?.sidste_action ?? null,
        state: t?.state ?? null,
        ewebinar_id: t?.ewebinar_id ?? null,
        email: t?.email ?? null,
        webinar_id: t?.webinar_id ?? null,
        pluk_grund: pluk.ok ? null : pluk.grund,
        raa: event,
      },
      { onConflict: "aftryk", ignoreDuplicates: true },
    )
    .select("id");
  if (logFejl) {
    console.error("[ewebinar-webhook] DB-fejl ved log-insert, eWebinar maa gensende:", logFejl);
    return json(500, { error: "db error" });
  }
  if (!logget || logget.length === 0) {
    console.log(`[ewebinar-webhook] Gensendelse (aftryk ${aftryk.slice(0, 12)}…), springes over.`);
    return json(200, { received: true, skipped: "gensendelse" });
  }
  if (!t) {
    // Signeret og logget, men uden id/email/webinarId: intet at holde aktuelt.
    console.log(`[ewebinar-webhook] Besked uden brugbar form (${pluk.ok ? "?" : pluk.grund}) — gemt raat, ingen tilmelding.`);
    return json(200, { received: true, skipped: pluk.ok ? "ukendt" : pluk.grund });
  }

  // 8. Den aktuelle raekke: laes den eksisterende (samme registrant-id), flet
  //    (ny vinder, null overskriver aldrig, procenten gaar aldrig ned), upsert.
  const { data: eksisterende, error: laesFejl } = await admin
    .from("webinar_tilmeldinger")
    .select("ewebinar_id, email, navn, webinar_id, webinar_titel, session_tid, session_type, registreret_at, state, sidste_action, attended, subscribed, set_procent, set_procent_kilde, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, origin, first_origin, referrer, first_referrer, widget_source, by, land, enhed, tidszone, join_link, kalender_link, replay_link")
    .eq("ewebinar_id", t.ewebinar_id)
    .maybeSingle();
  if (laesFejl) {
    console.error("[ewebinar-webhook] DB-fejl ved opslag paa tilmelding, eWebinar maa gensende:", laesFejl);
    return json(500, { error: "db error" });
  }
  // numeric kommer som streng fra PostgREST — tallet skal vaere et tal for fletningen.
  const kendt = eksisterende ? { ...(eksisterende as WebinarTilmelding), set_procent: eksisterende.set_procent === null ? null : Number(eksisterende.set_procent) } : null;
  const flettet = fletTilmelding(kendt, t);
  const nu = new Date();
  const { error: skrivFejl } = await admin
    .from("webinar_tilmeldinger")
    .upsert({ ...flettet, raa: event, sidste_haendelse_at: nu.toISOString() }, { onConflict: "ewebinar_id" });
  if (skrivFejl) {
    console.error("[ewebinar-webhook] DB-fejl ved upsert af tilmelding, eWebinar maa gensende:", skrivFejl);
    return json(500, { error: "db error" });
  }

  // 9. Log dommen (regnes af laeserne; her kun til function-loggen) og hvilken
  //    noegleform der matchede — det er maalingen README §4/§5 beder om.
  const grad = doemSetGrad(flettet, nu);
  console.log(
    `[ewebinar-webhook] ${flettet.sidste_action ?? "?"} (state ${flettet.state ?? "?"}) registrant ${flettet.ewebinar_id} webinar ${flettet.webinar_id} ` +
      `procent=${flettet.set_procent ?? "?"}${flettet.set_procent_kilde ? ` (${flettet.set_procent_kilde})` : ""} grad=${grad} noegleform=${dom.form}.`,
  );

  // 9b. AFMELDINGEN TIL KLAVIYO (22/9-2026). EFTER fletningen, saa raekken staar
  //     skrevet foerst — praecis som fremmoedet nedenfor. Dommen faar den NYE
  //     besked (`t`), ikke den flettede: fletningen lader null staa, saa en besked
  //     uden `action` ville arve en aeldre «Unsubscribed» og se ud som en ny
  //     afmelding hver gang (webinarAfmelding.ts).
  //
  //     EN GANG PR. MAIL bor i SPORET, ikke her: klaviyo_afmeldinger er unik paa
  //     (email) where udfald = 'ok'. To registranter med samme mail giver altsaa
  //     hoejst én vellykket afmelding.
  //
  //     FAIL-SOFT: afmeldHvisNoegle kaster aldrig. En afmelding maa ikke kunne faa
  //     eWebinar til at gensende — raekken er allerede skrevet ovenfor.
  const afmeldes = skalAfmeldes(kendt, t);
  let afmeldSendt: boolean | null = null;
  let afmeldUdfald: string | null = null;
  if (afmeldes) {
    const a = await afmeldHvisNoegle(admin, { email: flettet.email, kilde: "webhook", ewebinarId: flettet.ewebinar_id }, nu);
    afmeldSendt = a.sendt;
    afmeldUdfald = a.spor.udfald;
    if (a.sendt) {
      console.log(`[ewebinar-webhook] afmeldt hos Klaviyo: ${flettet.email} (registrant ${flettet.ewebinar_id}).`);
    } else {
      console.error(`[ewebinar-webhook] afmeldingen af ${flettet.email} gik IKKE igennem (${a.spor.udfald}) — ${a.spor.grund ?? ""}`);
    }
  }

  // 10. FREMMOEDE TIL KLAVIYO (19/9, recon-klaviyo-fremmoede). Klaviyo ved intet
  //     om fremmoede: profilens eneste egenskab er `eWebinar`, en datostreng, og
  //     den OVERSKRIVES ved naeste tilmelding. Efter-flowet er datostyret og
  //     fyrer derfor paa alle tilmeldte — ogsaa dem der aldrig kom.
  //
  //     HER, og ikke i en cron: webhooken har baade den gamle raekke (`kendt`)
  //     og den nye (`flettet`) i haanden og kan se OVERGANGEN. En cron ville
  //     skulle udlede den af en tilstand, og saa er vi tilbage ved
  //     oejebliksbilledet. Den ved det ogsaa foerst — «1,5 time efter» har ikke
  //     raad til at vente paa naeste koersel.
  //
  //     KUN VED SKIFT. eWebinar POSTer ved hver aendring; sendte vi hver gang,
  //     ville «deltog» staa femten gange paa samme person.
  //
  //     PORTEN (22/9): en tilmelding, der ER afmeldt, faar INGEN fremmoede-
  //     haendelse. Det er ikke en optimering — det er det, afmeldingen betyder.
  //     Dommen ser paa den FLETTEDE raekke (tilstanden, som den staar nu) OG paa
  //     den nye besked, saa baade «subscribed = Unsubscribed» og en ankommen
  //     «action = Unsubscribed» lukker porten. Vaernet: klaviyoAfmelding.guard dom 4.
  const erAfmeldtNu = erAfmeldt(flettet) || erAfmeldt(t);
  const gradFoer = kendt ? doemSetGrad(kendt, nu) : null;
  const overgang = erAfmeldtNu ? "ingen" : afgoerOvergang(gradFoer, grad);
  const haendelse = byggFremmoede(overgang, {
    ewebinarId: flettet.ewebinar_id,
    email: flettet.email,
    grad,
    setProcent: flettet.set_procent ?? null,
    webinarId: flettet.webinar_id,
    webinarTitel: flettet.webinar_titel ?? null,
    sessionTid: flettet.session_tid,
    tid: nu,
  });
  //     LOGGEN SKAL SIGE SANDHEDEN (20/9, recon-platformsiden §1.3): foer stod
  //     «fremmoede sendt» uanset udfald, og svaret til eWebinar sagde det samme.
  //     Tirsdag aften er loggen det, nogen kigger i. Nu logges `sendt` og
  //     udfaldet — og de sendes med i svaret, saa en proeve kan laese dem.
  let fremmoedeSendt: boolean | null = null;
  let fremmoedeUdfald: string | null = null;
  if (haendelse) {
    // KASTER ALDRIG (sendHvisMail). En marketingmail maa ikke kunne faa
    // eWebinar til at gensende — raekken er allerede skrevet ovenfor.
    const a = await sendHvisMail(admin, haendelse);
    fremmoedeSendt = a.sendt;
    fremmoedeUdfald = a.spor.udfald;
    if (a.sendt) {
      console.log(`[ewebinar-webhook] fremmoede sendt: ${overgang} (${gradFoer ?? "ny"} -> ${grad}) for ${flettet.ewebinar_id}.`);
    } else {
      console.error(`[ewebinar-webhook] fremmoede IKKE sendt (${a.spor.udfald}): ${overgang} (${gradFoer ?? "ny"} -> ${grad}) for ${flettet.ewebinar_id} — ${a.spor.grund ?? ""}`);
    }
  }

  return json(200, {
    received: true,
    ewebinar_id: flettet.ewebinar_id,
    grad,
    fremmoede: overgang,
    fremmoede_sendt: fremmoedeSendt,
    fremmoede_udfald: fremmoedeUdfald,
    // Det, KUN den nye kode kan svare (CLAUDE.md, «Deployment af edge functions»
    // trin 4): tre felter om afmeldingen. Er de der ikke i svaret, koerer den
    // gamle bundle — uanset hvad «View code» viser.
    afmeldt: erAfmeldtNu,
    afmeld_sendt: afmeldSendt,
    afmeld_udfald: afmeldUdfald,
  });
});
