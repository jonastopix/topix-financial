// ansoegning-link — ansøgerens egen side EFTER indsendelse (18/9-2026):
// status og «ikke nu». Kalderen har ingen session; legitimationen er tokenet
// i body (verifyAnsoegningslink, _shared/ansoegningLinkAuth.ts — samme
// mekanisme som B's verifyAnsoegningstoken, fasen indsendt) — prædikatet
// FØR enhver anden service-role-handling. verify_jwt = false i config.toml
// af samme grund som ansoegning-gem.
//
// Body: { token, handling: "hent" | "ikke_nu" }
//   hent    → { trin, paa_pause_til, samtale_start, samtale_slut, moede_link,
//              aftale_url, virksomhedsnavn, fornavn } — ALDRIG anbefalingen,
//              aldrig beslutningerne, aldrig noget om rådgiveren.
//   ikke_nu → pausen (afgoerOvergang: alle trapper annulleres, paa_pause_til
//              = i dag + 3 måneder, én række pause_slut til rådgiveren).
//              Idempotent: allerede på pause → 200 { ok, allerede: true }.
// Bookingen sker ikke her — den går gennem ansoegning-samtale (samme token):
// tider, book, flyt, aflys. Platformen selv, ingen Calendly (udkast 18/9).

import { svarPaaPlads } from "../_shared/venteliste.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { verifyAnsoegningslink } from "../_shared/ansoegningLinkAuth.ts";
import { fornavnAf, udfoerOvergang, virksomhedsnavnAf } from "../_shared/ansoegningMotor.ts";
import { erAabentTrin } from "../_shared/ansoegningTrin.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Kun POST" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON" }, 400);
  }
  const token = typeof body.token === "string" ? body.token : "";
  const handling = body.handling === "ikke_nu" ? "ikke_nu"
    : body.handling === "hent" ? "hent"
    : body.handling === "tag_pladsen" ? "tag_pladsen"
    : body.handling === "afslaa_pladsen" ? "afslaa_pladsen"
    : null;
  if (!token || !handling) return json({ error: "token og handling kræves" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prædikatet FØRST — svarer null for ukendt token, kladde eller ugyldigt format; grunden røbes ikke.
  const a = await verifyAnsoegningslink(token, admin);
  if (!a) return json({ error: "Ukendt link" }, 404);

  const svar = () => ({
    trin: a.trin,
    paa_pause_til: a.paa_pause_til,
    samtale_start: a.samtale_start,
    samtale_slut: a.samtale_slut,
    moede_link: a.trin === "booket" ? a.samtale_link : null,
    aftale_url: a.trin === "aftalegrundlag_sendt" ? a.aftale_url : null,
    virksomhedsnavn: virksomhedsnavnAf(a),
    fornavn: fornavnAf(a.navn),
  });

  if (handling === "hent") return json(svar());

  // Ventelisten (udkast 18/9): ja/nej til en tilbudt plads. Ansøgningen ER
  // lukket her — det er hele pointen — så den går FØR erAabentTrin-tjekket.
  // Intet tilbud ude → 409; svaret røber ikke hvilke køer ansøgeren står i.
  if (handling === "tag_pladsen" || handling === "afslaa_pladsen") {
    const res = await svarPaaPlads(admin, a.id, handling === "tag_pladsen" ? "accepteret" : "afslaaet", new Date());
    if (res.udfald === "intet_tilbud") return json({ error: "Der er ikke noget tilbud at svare på" }, 409);
    console.log(`[ansoegning-link] ${handling} på ${a.id}: ${res.aendret} rækker, genåbnet ${res.genaabnet}`);
    return json({ ok: true, svar: handling === "tag_pladsen" ? "ja" : "nej", genaabnet: res.genaabnet, ...svar() });
  }

  if (!erAabentTrin(a.trin)) return json({ error: "Ansøgningen er afsluttet" }, 409);
  if (a.paa_pause_til) return json({ ok: true, allerede: true, ...svar() });
  const res = await udfoerOvergang(admin, { ansoegning: a, handling: { art: "ikke_nu" }, via: "ansoeger_link", truffetAf: null, nu: new Date() });
  if (res.ok === false) return json({ error: res.grund }, res.status);
  const efter = await verifyAnsoegningslink(token, admin);
  console.log(`[ansoegning-link] ikke_nu på ${a.id}: ${res.annulleret} annulleret, pause til ${efter?.paa_pause_til ?? "?"}`);
  return json({ ok: true, allerede: false, ...svar(), paa_pause_til: efter?.paa_pause_til ?? null });
});
