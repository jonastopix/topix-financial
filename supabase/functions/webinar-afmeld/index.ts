// webinar-afmeld — «afmeld dig her» i platformens før-webinar-mails (22/9-2026).
//
// KALDEREN ER ET MENNESKE UDEN KONTO — eller mailklienten selv. Legitimationen
// er tokenet i URL'en (_shared/webinarAfmeldToken.ts: HMAC over mailen,
// sammenlignet i konstant tid), verificeret FØR enhver service-role-handling —
// samme klasse og invariant som aftale-underskrift og webinar-delt.
// verify_jwt = false i config.toml, bevidst: en mailklient sender hverken
// Authorization eller apikey.
//
// TO METODER, ÉN handling:
//   GET   mennesket klikker på linket → en lille side, der siger det er gjort
//   POST  mailklientens One-Click (RFC 8058, List-Unsubscribe-Post) → 200, tom
// Begge er IDEMPOTENTE: en upsert på mailen, så to klik ikke er to rækker.
//
// HVAD DEN AFMELDER — BESLUTTET AF JONAS 22/9: BEGGE DELE.
//   1. Platformens egne webinarmails (webinar_afmeldinger).
//   2. Klaviyos GLOBALE e-mailmarkedsføring — samme regel og samme vej som en
//      afmelding i eWebinar (#1088): husets `afmeldHvisNoegle`,
//      POST /api/profile-subscription-bulk-delete-jobs, consent UNSUBSCRIBED,
//      UDEN list_id. Sporet er `klaviyo_afmeldinger` med den nye kilde
//      'webinar_mail'. Ét klik, én betydning.
//
// RÆKKEFØLGEN ER VORES FØRST. Klaviyo-kaldet er fail-soft: lykkes det ikke,
// er personen stadig afmeldt hos OS, og mennesket får «Du er afmeldt» —
// for det er sandt om det, linket lovede. «Én gang pr. mail» bor i
// klaviyo_afmeldingers eget unikke indeks (#1088), så et andet klik på samme
// link ikke bliver til to kald.
//
// IKKE eWebinar: deres afmelding er deres egen, og et kald dertil ville være
// en tredje vej med en tredje nøgle.
//
// SVARER ALDRIG MED, OM MAILEN FINDES. Et ugyldigt token og en ukendt adresse
// giver det samme svar. Ellers ville linket være et opslagsværk over, hvem der
// er tilmeldt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { AFMELD_SECRET, laesAfmeldToken } from "../_shared/webinarAfmeldToken.ts";
import { afmeldHvisNoegle } from "../_shared/klaviyoAfsendelse.ts";

const LOG = "[webinar-afmeld]";

const side = (overskrift: string, linje: string, status = 200): Response =>
  new Response(
    `<!DOCTYPE html><html lang="da"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>` +
      `<title>${overskrift}</title></head>` +
      `<body style="margin:0;background:#FAF8F5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#152825;">` +
      `<div style="max-width:520px;margin:0 auto;padding:64px 24px;">` +
      `<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#5C6B66;">TOPIX</div>` +
      `<h1 style="font-size:26px;line-height:1.3;margin:20px 0 0 0;">${overskrift}</h1>` +
      `<p style="font-size:16px;line-height:1.7;color:#5C6B66;margin:16px 0 0 0;">${linje}</p>` +
      `</div></body></html>`,
    { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Kun GET eller POST" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── 1. Tokenet FØRST — før enhver service-role-handling. ──
  const url = new URL(req.url);
  let token: unknown = url.searchParams.get("t");
  if (req.method === "POST" && token === null) {
    // One-Click sender application/x-www-form-urlencoded; nogle klienter
    // lægger intet i URL'en. Tokenet må så komme i kroppen.
    try {
      const form = await req.formData();
      token = form.get("t");
    } catch {
      token = null;
    }
  }

  const secret = Deno.env.get(AFMELD_SECRET);
  const dom = await laesAfmeldToken(secret, token);
  if (!dom.ok) {
    if (dom.grund === "ingen_secret") {
      console.error(`${LOG} ${AFMELD_SECRET} mangler — afmeldingen kan ikke verificeres`);
      return req.method === "POST"
        ? new Response(null, { status: 503, headers: corsHeaders })
        : side("Noget gik galt", "Vi kunne ikke behandle afmeldingen lige nu. Skriv til kontakt@topix.dk, så ordner vi det i hånden.", 503);
    }
    // ALDRIG hvorfor, og aldrig om adressen findes. Kun loggen ved det.
    console.error(`${LOG} afvist: ${dom.grund}`);
    return req.method === "POST"
      ? new Response(null, { status: 200, headers: corsHeaders })
      : side("Linket virker ikke", "Linket er ufuldstændigt eller udløbet. Skriv til kontakt@topix.dk, så fjerner vi dig med det samme.", 200);
  }

  // ── 2. Service role — først nu. ──
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent")?.trim().slice(0, 512) || null;

  const { error } = await admin
    .from("webinar_afmeldinger")
    .upsert({ email: dom.email, kilde: "mail", ip, user_agent: ua }, { onConflict: "email" });
  if (error) {
    console.error(`${LOG} kunne IKKE gemme afmeldingen for en adresse:`, error.message);
    return req.method === "POST"
      ? new Response(null, { status: 500, headers: corsHeaders })
      : side("Noget gik galt", "Vi kunne ikke gemme din afmelding. Skriv til kontakt@topix.dk, så ordner vi det i hånden.", 500);
  }
  console.log(`${LOG} afmeldt hos os (metode ${req.method})`);

  // ── 3. Og i Klaviyo (Jonas 22/9). KASTER ALDRIG, og stopper aldrig svaret. ──
  const klaviyo = await afmeldHvisNoegle(admin, { email: dom.email, kilde: "webinar_mail" }, new Date());
  if (klaviyo.sendt) console.log(`${LOG} også afmeldt global e-mailmarkedsføring i Klaviyo`);
  else console.error(`${LOG} Klaviyo-afmeldingen gik IKKE igennem (${klaviyo.spor.udfald}): ${klaviyo.spor.grund ?? ""} — personen er stadig afmeldt hos os`);

  return req.method === "POST"
    ? new Response(null, { status: 200, headers: corsHeaders })
    : side(
        "Du er afmeldt",
        "Du får ikke flere påmindelser fra os om webinaret. Har du allerede meldt dig til, gælder din plads stadig — og du får optagelsen som aftalt.",
      );
});
