// webinar-video — klikket på Mortens hilsen i mailen «dagen før» (udkast 30/9-2026).
//
// OFFENTLIG (Bucket C-klassen), verify_jwt = false: et menneske, der klikker i sin
// indbakke, sender hverken Authorization eller apikey. Legitimationen er id'et i
// URL'en (`?m=<webinar_mails.id>`, 122 tilfældige bit, trukket af webinar-mail-cron
// FØR mailen blev bygget) — samme klasse som verifyAftaletoken: formen dømmes FØR
// noget opslag, og kun en RIGTIG, SENDT en_dag-række (verifyVideoKlik) logges.
//
//   GET   → ét anonymt klik i webinar_video_klik (mail_id + tidspunkt, INTET andet:
//           ingen IP, ingen user agent, ingen adresse), derefter 302 til Bunnys
//           afspilningsside https://iframe.mediadelivery.net/play/<library>/<video>.
//   HEAD  → samme 302, INTET logges (link-forhåndsvisninger og scannere spørger ofte
//           med HEAD; et klik er et GET).
//
// VIDERESTILLINGEN ER IKKE ÅBEN: målet bygges af app_config.webinar_en_dag_video
// (dømt af laesVideoKonfig: library = cifre, video = GUID) på den FASTE vært
// iframe.mediadelivery.net (bunnyAfspilUrl) — aldrig af noget i URL'en. Et ukendt
// eller ugyldigt id viderestilles ALLIGEVEL (samme mål for alle — ét svar udadtil,
// kun loggen ved hvorfor), men logges aldrig. Konfigurationens `aktiv` gælder
// mailene, ikke klikket: en sendt prøve skal kunne afspilles, før der tændes.
// Er konfigurationen null/ugyldig (videoen slukket, efter mails er gået ud),
// svarer siden høfligt uden viderestilling.
//
// FAIL-SOFT MOD MENNESKET: kan klikket ikke logges, viderestilles der alligevel —
// målingen må aldrig stå i vejen for hilsenen.
//
// ET FORBEHOLD, DER HØRER TIL TALLET: mailsikkerhed (fx Outlooks Safe Links,
// virksomheders gateways) kan «klikke» et link, før mennesket gør. Et klik i
// tabellen er derfor et GET fra NOGEN med mailen — unikke mail_id er det bedste
// tal, ikke et bevis for, at videoen blev set.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { bunnyAfspilUrl, laesKlikId, laesVideoKonfig, VIDEO_KONFIG_NOEGLE, verifyVideoKlik } from "../_shared/webinarVideo.ts";

const LOG = "[webinar-video]";

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
    { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Kun GET eller HEAD" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── 1. Formen FØRST — et id, der ikke er et uuid, når aldrig databasen. ──
  const raaId = new URL(req.url).searchParams.get("m");
  const formOk = laesKlikId(raaId) !== null;

  // ── 2. Service role — kun til opslaget af konfigurationen og (ved GET) klikket. ──
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 3. Klikket — KUN et GET med et id, der er en sendt en_dag-række. ──
  if (req.method === "GET" && formOk) {
    const dom = await verifyVideoKlik(admin, raaId);
    if (dom.kendt) {
      const { error } = await admin.from("webinar_video_klik").insert({ mail_id: dom.mailId });
      if (error) console.error(`${LOG} klikket kunne IKKE logges (viderestiller alligevel):`, error.message);
    } else {
      console.error(`${LOG} klik ikke logget: ${dom.grund}`);
    }
  } else if (req.method === "GET") {
    console.error(`${LOG} klik ikke logget: form`);
  }

  // ── 4. Målet — ALTID af konfigurationen, aldrig af URL'en. ──
  let maal: string | null = null;
  try {
    const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", VIDEO_KONFIG_NOEGLE).maybeSingle();
    if (error) throw new Error(error.message);
    const k = laesVideoKonfig((data as { config_value?: unknown } | null)?.config_value ?? null);
    if (k.status === "gyldig") maal = bunnyAfspilUrl(k.konfig);
    else console.error(`${LOG} konfigurationen er ${k.status}${k.status === "ugyldig" ? ` (${k.grund})` : ""} — ingen viderestilling`);
  } catch (e) {
    console.error(`${LOG} kunne ikke læse ${VIDEO_KONFIG_NOEGLE}:`, e instanceof Error ? e.message : String(e));
  }

  if (maal === null) {
    return side("Hilsenen er ikke tilgængelig lige nu", "Videoen kan ikke vises i øjeblikket. Dit personlige link til webinaret står stadig i mailen — vi ses.");
  }
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: maal, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
});
