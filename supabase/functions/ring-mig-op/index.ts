// ring-mig-op — «Må vi ringe til dig?» efter webinaret (2/10-2026,
// docs/samtykke-og-opkald.md del 2; Jonas' fem svar 2/10 kl. 07:38–07:39).
//
// KALDEREN ER ET MENNESKE UDEN KONTO: en webinarDELTAGER, der klikker på linket
// i Klaviyos «Deltog»-mail. Legitimationen er tokenet i body'en
// (_shared/ringToken.ts: HMAC over ewebinar_id, sammenlignet i konstant tid),
// verificeret FØR enhver service-role-handling — samme klasse og invariant som
// webinar-afmeld, aftale-underskrift og webinar-delt. verify_jwt = false i
// config.toml, bevidst: siden kaldes med anon-nøglen, uden session.
//
// TOKENET ÅBNER IKKE ALENE. Rækken i webinar_tilmeldinger afgør: KUN en
// tilmelding, der har DELTAGET (doemSetGrad → set/delvist, opkaldDom.harDeltaget),
// kan bede om et opkald (Jonas: «Kun dem, der deltog i webinaret — ja»). Ukendt
// token, ukendt tilmelding og «mødte ikke op» giver ÉT svar (403 «ukendt») —
// functionen er ikke et opslagsværk over, hvem der var der.
//
// TO HANDLINGER, STRIKS BODY (kendteFelter-reglen):
//   opslag   {t, handling}                      → navn og sessionens tid til at forudfylde
//   indsend  {t, handling, navn, telefon, samtykke: {kryds: true, ordlyd}} → rækken
// Krydset SKAL være true, og ordlyden SKAL være opkaldDom.SAMTYKKE_ORDLYD tegn
// for tegn — det, der gemmes, er det, der stod på skærmen (bevisbyrden).
// Nummeret gemmes KUN i E.164 (normaliserTelefon) — aldrig et rået tal.
//
// ÉN RÆKKE PR. TILMELDING (unique tilmelding_id): et nyt «indsend» på samme
// tilmelding OPDATERER navn, nummer og samtykke_at og åbner anmodningen igen
// (ringet_at/ringet_af nulles); klokken dedupper på rækkens id, så rådgiverne
// får den ÉN gang pr. tilmelding — en gentagelse er ikke en ny opgave.
//
// EFTER RÆKKEN, FAIL-SOFT, I DENNE RÆKKEFØLGE:
//   1. Klokken «opkald_anmodet» til ALLE rådgivere (skrivRaadgiverBesked, én
//      række pr. rådgiver — Jonas: «Både Morten og Jonas får klokken — ja»).
//      Typen står på MORGEN_TYPER i klokkeMail.ts: morgenmailen kl. 07 på en
//      hverdag, ALDRIG straks (Jonas: «Besked i morgenmailen, ikke straks — ja»).
//      Titlen bærer navn og dato — ALDRIG nummeret (opkaldDom.klokkeTitel).
//   2. Klaviyo-hændelsen «Bad om opkald» (HAENDELSE.badOmOpkald) på mailen —
//      UDEN nummer og uden navn (Jonas: «… uden nummer — ja»); unikt id =
//      rækkens id, så en gentagelse ikke bliver to hændelser. sendHvisMail
//      kaster aldrig, og sporet skrives i klaviyo_haendelser.
// Fejler 1 eller 2, står rækken, og mennesket får «Tak» — for det er sandt om
// det, siden lovede. Udfaldene står i svaret og i loggen.
//
// LOFTET: højst ANMODNINGER_PR_IP_PR_TIME «indsend» pr. IP-dagshash pr. time og
// ANMODNINGER_PR_TIME_I_ALT i alt (opkaldDom.loftetNaaet, tælling på rækkernes
// samtykke_at og ip_hash — fail-closed: kan vi ikke tælle, gemmer vi ikke).
// IP'en gemmes ALDRIG rå: sha256(ip + ":" + dag), som ansoegning-gem.
//
// BEVISET FOR UDRULNINGEN (CLAUDE.md «Deployment af edge functions» trin 4):
// feltet "ring_mig_op": "skive-1" i ETHVERT svar, også 400/403 — kun den nye
// kode har det. Et POST uden body → 400 med feltet.
//
// SVARER ALDRIG MED NUMMERET. Ingen deling, ingen Klaviyo, ingen Meta bærer det.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { laesRingToken, RING_SECRET } from "../_shared/ringToken.ts";
import { doemSetGrad } from "../_shared/webinarDom.ts";
import {
  ANMODNINGER_PR_IP_PR_TIME,
  ANMODNINGER_PR_TIME_I_ALT,
  doemAnmodning,
  erHandling,
  harDeltaget,
  KENDTE_FELTER,
  KLOKKE_BODY,
  KLOKKE_REFERENCE,
  klokkeTitel,
  loftetNaaet,
} from "../_shared/opkaldDom.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { sendHvisMail } from "../_shared/klaviyoAfsendelse.ts";
import { HAENDELSE } from "../_shared/klaviyoHaendelser.ts";

const LOG = "[ring-mig-op]";
/** Beviset for udrulningen — i hvert svar. */
const SKIVE = "skive-1";

const json = (status: number, krop: Record<string, unknown>): Response =>
  new Response(JSON.stringify({ ring_mig_op: SKIVE, ...krop }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256(ip + ":" + YYYY-MM-DD) — kun i hukommelsen her; gemmes aldrig (ansoegning-gem-mønstret). */
async function ipDagshash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "ukendt";
  return await sha256Hex(`${ip}:${new Date().toISOString().slice(0, 10)}`);
}

/** Anmodninger den seneste time — for IP-dagshashen, eller i alt (null). null = tællingen fejlede (= loftet nået). */
async function antalSidsteTime(admin: SupabaseClient, ipHash: string | null): Promise<number | null> {
  const siden = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let q = admin.from("opkaldsanmodninger").select("id", { count: "exact", head: true }).gte("samtykke_at", siden);
  if (ipHash) q = q.eq("ip_hash", ipHash);
  const { count, error } = await q;
  if (error) {
    console.error(`${LOG} tællingen fejlede — loftet regnes som nået:`, error.message);
    return null;
  }
  return count ?? 0;
}

interface Tilmelding {
  id: string;
  ewebinar_id: string;
  email: string;
  navn: string | null;
  webinar_id: string;
  session_tid: string | null;
  state: string | null;
  attended: string | null;
  set_procent: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Kun POST" });

  // ── 1. Body'en og tokenet FØRST — før enhver service-role-handling. ──
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  const ukendte = ukendteFelter(body, KENDTE_FELTER);
  if (ukendte.length > 0) return json(400, { error: ukendteFelterBesked(ukendte, KENDTE_FELTER), kendte: KENDTE_FELTER });
  if (!erHandling(body.handling)) return json(400, { error: "handling skal være «opslag» eller «indsend»", kendte: KENDTE_FELTER });

  const dom = await laesRingToken(Deno.env.get(RING_SECRET), body.t);
  if (!dom.ok) {
    if (dom.grund === "ingen_secret") {
      console.error(`${LOG} ${RING_SECRET} mangler — anmodninger kan ikke verificeres`);
      return json(503, { error: "Vi kunne ikke behandle anmodningen lige nu. Skriv til kontakt@theboardroom.dk." });
    }
    // ALDRIG hvorfor. Kun loggen ved det.
    console.error(`${LOG} afvist: ${dom.grund}`);
    return json(403, { error: "ukendt" });
  }

  // ── 2. Service role — først nu. Tilmeldingen afgør, om tokenet åbner. ──
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nu = new Date();

  const { data: t, error: tFejl } = await admin
    .from("webinar_tilmeldinger")
    .select("id, ewebinar_id, email, navn, webinar_id, session_tid, state, attended, set_procent")
    .eq("ewebinar_id", dom.ewebinarId)
    .maybeSingle();
  if (tFejl) {
    console.error(`${LOG} opslag på tilmeldingen fejlede:`, tFejl.message);
    return json(500, { error: "Vi kunne ikke slå din tilmelding op lige nu. Prøv igen om lidt." });
  }
  const tilmelding = (t ?? null) as Tilmelding | null;
  const grad = tilmelding ? doemSetGrad(tilmelding, nu) : null;
  if (!tilmelding || !harDeltaget(grad)) {
    // Samme svar som et ugyldigt token — ingen må kunne læse fremmøde ud af denne function.
    console.error(`${LOG} afvist: ${tilmelding ? `ikke deltaget (${grad})` : "ukendt tilmelding"}`);
    return json(403, { error: "ukendt" });
  }

  // ── 3. opslag: det, siden forudfylder. Aldrig mailen i klartekst, aldrig nummeret. ──
  if (body.handling === "opslag") {
    const { data: findes } = await admin.from("opkaldsanmodninger").select("id, ringet_at").eq("tilmelding_id", tilmelding.id).maybeSingle();
    return json(200, {
      ok: true,
      navn: tilmelding.navn ?? "",
      session_tid: tilmelding.session_tid,
      // Har personen allerede bedt om det (og er ikke ringet op endnu), siger siden det.
      har_anmodet: !!findes && (findes as { ringet_at: string | null }).ringet_at === null,
    });
  }

  // ── 4. indsend: formen, loftet, rækken. ──
  const anm = doemAnmodning(body);
  if (!anm.ok) return json(400, { error: "ugyldig", grund: anm.grund });

  const ipHash = await ipDagshash(req);
  if (loftetNaaet(await antalSidsteTime(admin, ipHash), await antalSidsteTime(admin, null))) {
    console.error(`${LOG} loftet nået (ip ${ANMODNINGER_PR_IP_PR_TIME}/t, i alt ${ANMODNINGER_PR_TIME_I_ALT}/t) — ingen række`);
    return json(429, { error: "For mange anmodninger lige nu. Prøv igen om en time, eller skriv til kontakt@theboardroom.dk." });
  }

  const { data: raekke, error: skrivFejl } = await admin
    .from("opkaldsanmodninger")
    .upsert(
      {
        tilmelding_id: tilmelding.id,
        navn: anm.navn,
        telefon: anm.telefon,
        samtykke_ordlyd: anm.ordlyd,
        samtykke_at: nu.toISOString(),
        ringet_at: null,
        ringet_af: null,
        ip_hash: ipHash,
      },
      { onConflict: "tilmelding_id" },
    )
    .select("id")
    .single();
  if (skrivFejl || !raekke) {
    console.error(`${LOG} kunne IKKE gemme anmodningen:`, skrivFejl?.message ?? "ingen række");
    return json(500, { error: "Vi kunne ikke gemme din anmodning. Skriv til kontakt@theboardroom.dk, så ringer vi alligevel." });
  }
  const anmodningId = (raekke as { id: string }).id;
  console.log(`${LOG} anmodning gemt for tilmelding ${tilmelding.ewebinar_id} (grad ${grad})`);

  // ── 5. Klokken til alle rådgivere — MORGEN-typen, aldrig nummeret. KASTER ALDRIG. ──
  const klokke = await skrivRaadgiverBesked(admin, {
    type: "opkald_anmodet",
    title: klokkeTitel(anm.navn, tilmelding.session_tid),
    body: KLOKKE_BODY,
    reference_type: KLOKKE_REFERENCE,
    reference_id: anmodningId,
  });
  if (klokke.fejl.length) console.error(`${LOG} klokken: ${klokke.fejl.join("; ")}`);

  // ── 6. Klaviyo: «Bad om opkald» — mailen og tilmeldingens id'er, ALDRIG nummer eller navn. ──
  const klaviyo = await sendHvisMail(admin, {
    metric: HAENDELSE.badOmOpkald,
    email: tilmelding.email,
    uniktId: anmodningId,
    egenskaber: { ewebinar_id: tilmelding.ewebinar_id, webinar_id: tilmelding.webinar_id, session_tid: tilmelding.session_tid },
    tid: nu,
  });
  if (!klaviyo.sendt) console.error(`${LOG} Klaviyo «Bad om opkald» ikke sendt (${klaviyo.spor.udfald}) — anmodningen står`);

  return json(200, {
    ok: true,
    klokke: { raadgivere: klokke.raadgivere, skrevet: klokke.skrevet, fandtes: klokke.fandtes },
    klaviyo_udfald: klaviyo.spor.udfald,
  });
});
