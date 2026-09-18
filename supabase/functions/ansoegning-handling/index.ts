// ansoegning-handling — rådgiverens handlinger på en ansøgning (18/9-2026).
// Bucket A: authenticateUser FØRST, så advisor-gaten (has_role via
// callerClient), FØR service-role-klienten konstrueres — samme form som
// saet-indgangs-prisniveau.
//
// Body: { ansoegning_id, handling, begrundelse?, lukkeaarsag?, aftale_url?, pris_oere? }
//   handling ∈ MENNESKE_HANDLINGER: tal_med_dem · afvis · afholdt · tilbud ·
//   afslag · underskrevet · luk (kræver lukkeaarsag) · genaabn ·
//   saet_pause (kræver pause_til «YYYY-MM-DD» efter i dag — sætter ELLER
//   flytter pausen; tilladt fra ethvert åbent trin) · genoptag (18/9 aften:
//   pausen tages af nu — samme dom som ansøgerens knap og køens pause_slut).
//   SAMTALEN I KALENDEREN (udkast 18/9, rev. 2): rådgiveren kan også book
//   (kræver samtale_start = et ledigt slot — serveren regner selv mod
//   Calendly) og aflys_booking; samtale_tider giver slots til fladen. Samme
//   rækkefølge som ansoegning-samtale: Calendly FØRST (kalender + Meet),
//   platformen bagefter, kompensation hvis platformen siger nej. Fra
//   «indkaldt» er book en booking på ansøgerens vegne; fra «booket» en
//   flytning (nyt event, det gamle aflyses). Ansøgeren får mail straks;
//   ingen klokke — rådgiveren handlede selv (samtaleBeskedDom).
//   afvis/afslag tager valgfrit afslagsgrund ∈ niche · for_tidligt · andet
//   (niche og for_tidligt giver afslagsmailen; andet giver ingen mail).
//   VENTELISTEN REJSER MED (19/9, Jonas 18/9 pkt. 8): afslagsmailen sendes
//   STRAKS, og pladsen skal stå i den — derfor tager afvis/afslag valgfrit
//   venteliste_company_id (+ venteliste_hvorfor): lukningen først, så C's
//   saetPaaVenteliste (kræver trin = lukket), så afslagsmailen gennem
//   motorens sendSvarMailNu. Uden venteliste sender motoren mailen selv i
//   overgangen. Svaret bærer mail ∈ sendt · reserve · fejlet · ingen_adresse
//   · ingen_raekke (ingen dag 0-mail på trappen).
//   tilbud kræver aftale_url (C's /aftale?token=… eller en PDF) og sætter
//   pris_oere hvis den gives (bliver prisniveau_oere ved underskrift).
// Dommen (afgoerOvergang), trappen (rykkerkoe) og konverteringen
// (underskrevet → virksomheden med samme id → det eksisterende
// betalingsforløb) ligger i _shared/ansoegningMotor.ts. Denne fil er kun
// auth, validering og svar. Svar: 200 { ok, fra, til, planlagt, annulleret,
// company_id? } · 400 ugyldigt · 401/403 auth · 404 ukendt · 409 ikke
// tilladt fra trinnet (dommens grund ordret) · 500.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { AFSLAGSGRUNDE, LUKKEAARSAGER, MENNESKE_HANDLINGER, type Afslagsgrund, type Handling, type Lukkeaarsag } from "../_shared/ansoegningTrin.ts";
import { hentAnsoegning, udfoerOvergang, type Samtale } from "../_shared/ansoegningMotor.ts";
import { erSlotLedig, slutAf } from "../_shared/samtaleSlots.ts";
import { CalendlyFejl } from "../_shared/calendlyApi.ts";
import { aflysIKalenderen, bookIKalenderen, hentLedigeSamtaletider } from "../_shared/samtaleTider.ts";
import { meldSamtaleAendring } from "../_shared/samtaleBesked.ts";
import { saetPaaVenteliste } from "../_shared/venteliste.ts";
import { sendSvarMailNu, type StraksUdfald } from "../_shared/ansoegningMotor.ts";

/** Rådgiverens to samtalehandlinger — uden for MENNESKE_HANDLINGER (de er ikke knapper i handlingsrækken, men i afsnittet «Samtalen»). */
const RAADGIVER_SAMTALE: readonly string[] = ["book", "aflys_booking"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Body → Handling; null ved ugyldig form. Kun menneskets handlinger — systemets kan ikke kaldes herfra. */
export function laesHandling(body: Record<string, unknown>): Handling | null {
  const art = typeof body.handling === "string" ? body.handling : "";
  if (RAADGIVER_SAMTALE.includes(art)) return { art } as Handling;
  if (!MENNESKE_HANDLINGER.includes(art as Handling["art"])) return null;
  if (art === "luk") {
    const aarsag = typeof body.lukkeaarsag === "string" ? body.lukkeaarsag : "";
    if (!(LUKKEAARSAGER as readonly string[]).includes(aarsag)) return null;
    return { art: "luk", aarsag: aarsag as Lukkeaarsag };
  }
  if (art === "afvis" || art === "afslag") {
    const grund = typeof body.afslagsgrund === "string" ? body.afslagsgrund : null;
    if (grund !== null && !(AFSLAGSGRUNDE as readonly string[]).includes(grund)) return null;
    return { art, ...(grund ? { grund: grund as Afslagsgrund } : {}) } as Handling;
  }
  if (art === "saet_pause") {
    const til = typeof body.pause_til === "string" ? body.pause_til.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(til) || Number.isNaN(Date.parse(`${til}T00:00:00Z`))) return null;
    // Efter i dag (dansk dato): en pause der slutter i dag eller før er ingen pause.
    const iDag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
    if (til <= iDag) return null;
    return { art: "saet_pause", til };
  }
  return { art } as Handling;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Kun POST" }, 405);

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId: userId, callerClient } = auth;

  const { data: erRaadgiver, error: rolleErr } = await callerClient.rpc("has_role", { _user_id: userId, _role: "advisor" });
  if (rolleErr || erRaadgiver !== true) return json({ error: "Kun rådgivere" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON" }, 400);
  }
  const ansoegningId = typeof body.ansoegning_id === "string" ? body.ansoegning_id : "";
  if (!UUID.test(ansoegningId)) return json({ error: "ansoegning_id mangler eller er ugyldigt" }, 400);
  const handling = body.handling === "samtale_tider" ? null : laesHandling(body);
  if (!handling && body.handling !== "samtale_tider") return json({ error: "Ukendt handling (lukkeaarsag mangler ved luk, eller pause_til mangler/er ikke efter i dag ved saet_pause)" }, 400);
  const begrundelse = typeof body.begrundelse === "string" ? body.begrundelse.trim().slice(0, 2000) || null : null;
  const aftaleUrl = typeof body.aftale_url === "string" && /^https:\/\//.test(body.aftale_url.trim()) ? body.aftale_url.trim() : null;
  const prisOere = typeof body.pris_oere === "number" && Number.isInteger(body.pris_oere) && body.pris_oere > 0 ? body.pris_oere : null;
  // Ventelisten med i samme kald (kun afvis/afslag): pladsen sættes efter lukningen og FØR afslagsmailen.
  const ventelisteCompanyId = (handling?.art === "afvis" || handling?.art === "afslag") && typeof body.venteliste_company_id === "string" && UUID.test(body.venteliste_company_id) ? body.venteliste_company_id : null;
  const ventelisteHvorfor = typeof body.venteliste_hvorfor === "string" ? body.venteliste_hvorfor.trim().slice(0, 500) || null : null;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ansoegning = await hentAnsoegning(admin, ansoegningId);
  if (!ansoegning) return json({ error: "Ansøgningen findes ikke" }, 404);

  // Slots til fladen (SamtaleAfsnit): Calendlys bookbare tider gennem platformens dom — egen samtale tæller ikke som optaget.
  if (body.handling === "samtale_tider") {
    try {
      const t = await hentLedigeSamtaletider(admin, { nu: new Date(), udenAnsoegningId: ansoegningId });
      return json({ ok: true, slots: t.slots, varighed_min: t.varighedMin });
    } catch (err) {
      console.error("[ansoegning-handling] kalenderen kunne ikke læses — fail-closed:", err);
      return json({ error: "Kalenderen kunne ikke læses lige nu — prøv igen om lidt" }, 503);
    }
  }
  if (!handling) return json({ error: "Ukendt handling" }, 400);

  // «tilbud» med indtastet link er IKKE en rådgiverhandling længere (Jonas 18/9 aften): e-underskriften
  // (send-til-underskrift) er den eneste vej til en aftale — den sætter prisen. Den gamle vej sprang prisen over.
  if (handling.art === "tilbud") return json({ error: "brug_e_underskriften", grund: "Aftalen sendes fra «Send til e-underskrift» på ansøgningen — den sætter prisen og laver aftalen." }, 409);

  // Prisen sættes FØR overgangen — papirvejen («underskrevet») bærer den fra dialogen (forudfyldt 50.000).
  if (prisOere !== null && handling.art === "underskrevet") {
    const { error } = await admin.from("ansoegninger").update({ pris_oere: prisOere }).eq("id", ansoegningId);
    if (error) return json({ error: `Kunne ikke sætte prisen: ${error.message}` }, 500);
    ansoegning.pris_oere = prisOere;
  }
  // Ingen underskrift uden pris: ellers oprettes betalingslinket med prisniveau null, og sagen går i stå ved betalingen.
  if (handling.art === "underskrevet" && ansoegning.pris_oere === null) return json({ error: "pris_mangler", grund: "Vælg prisniveauet først — uden pris går betalingen i stå." }, 409);

  const nu = new Date();

  // Samtalen i kalenderen — Calendly FØRST, platformen bagefter (samme rækkefølge som ansoegning-samtale).
  let samtale: Samtale | null = null;
  const gammelStart = ansoegning.samtale_start ? new Date(ansoegning.samtale_start) : null;
  const gammelEvent = ansoegning.calendly_event_uri;
  if (handling.art === "aflys_booking") {
    if (gammelEvent && !(await aflysIKalenderen(gammelEvent, "Aflyst af rådgiveren fra The Boardroom"))) {
      return json({ error: "Kalenderen kunne ikke aflyse lige nu — prøv igen om lidt" }, 502);
    }
    // Webhooken (invitee.canceled) kan have nået overgangen og mailen først — så er alt gjort.
    const frisk = await hentAnsoegning(admin, ansoegningId);
    if (frisk && frisk.trin !== "booket") {
      console.log(`[ansoegning-handling] aflys_booking på ${ansoegningId}: webhooken nåede først (${frisk.trin}).`);
      return json({ ok: true, fra: "booket", til: frisk.trin, planlagt: 0, annulleret: 0 });
    }
  }
  if (handling.art === "book") {
    const start = typeof body.samtale_start === "string" && !Number.isNaN(Date.parse(body.samtale_start)) ? new Date(body.samtale_start).toISOString() : null;
    if (!start) return json({ error: "samtale_start (ISO-tidspunkt) kræves ved book" }, 400);
    let tider;
    try {
      tider = await hentLedigeSamtaletider(admin, { nu, udenAnsoegningId: ansoegningId });
    } catch (err) {
      console.error("[ansoegning-handling] kalenderen kunne ikke læses — fail-closed:", err);
      return json({ error: "Kalenderen kunne ikke læses lige nu — prøv igen om lidt" }, 503);
    }
    if (!erSlotLedig(start, tider.input)) return json({ error: "Tiden er ikke ledig — vælg en anden" }, 409);
    try {
      const kalender = await bookIKalenderen(ansoegning, start);
      samtale = { start: new Date(start), slut: new Date(slutAf(start, tider.varighedMin)), eventUri: kalender.eventUri, moedeLink: kalender.moedeLink };
    } catch (err) {
      console.error(`[ansoegning-handling] Calendly afviste ${start} for ${ansoegningId}:`, err);
      const status = err instanceof CalendlyFejl && (err.status === 400 || err.status === 409 || err.status === 422) ? 409 : 502;
      return json({ error: status === 409 ? "Tiden er ikke ledig — vælg en anden" : "Kalenderen svarede ikke — prøv igen om lidt" }, status);
    }
  }

  const res = await udfoerOvergang(admin, { ansoegning, handling, via: "raadgiver", truffetAf: userId, begrundelse, nu, aftaleUrl, samtale, svarMailStraks: ventelisteCompanyId === null });
  if (res.ok === false) {
    // Kompensation: platformen sagde nej efter at Calendly bookede — eventet må ikke blive stående.
    if (samtale?.eventUri) await aflysIKalenderen(samtale.eventUri, "Platformen kunne ikke gemme bookingen — aflyst automatisk");
    return json({ error: res.grund }, res.status);
  }

  if (handling.art === "book" || handling.art === "aflys_booking") {
    const aendring = handling.art === "aflys_booking" ? "aflys" : res.fra === "booket" ? "flyt" : "book";
    if (aendring === "flyt" && gammelEvent && gammelEvent !== samtale?.eventUri) await aflysIKalenderen(gammelEvent, "Flyttet af rådgiveren fra The Boardroom — ny tid er booket");
    const besked = await meldSamtaleAendring(admin, { a: ansoegning, aendring, af: "raadgiver", nyStart: samtale?.start ?? null, gammelStart, moedeLink: samtale?.moedeLink ?? null, varighedMin: 30 });
    console.log(`[ansoegning-handling] ${aendring} på ${ansoegningId}: mail ${besked.mail}`);
  }

  // Ventelisten (rejser med afvis/afslag): sat efter lukningen, og afslagsmailen sendes FØRST HEREFTER, så pladsen står i den.
  let mail: StraksUdfald | null = res.mail;
  let venteliste: { udfald: string; virksomhed: string | null } | null = null;
  if (ventelisteCompanyId) {
    try {
      const { data: c } = await admin.from("companies").select("name").eq("id", ventelisteCompanyId).maybeSingle();
      const r = await saetPaaVenteliste(admin, { ansoegningId, companyId: ventelisteCompanyId, hvorfor: ventelisteHvorfor, satAf: userId });
      venteliste = { udfald: r.udfald, virksomhed: (c as { name?: string } | null)?.name ?? null };
    } catch (err) {
      console.error(`[ansoegning-handling] ventelisten kunne ikke sættes for ${ansoegningId} — afslagsmailen sendes uden pladsen:`, err);
      venteliste = { udfald: "fejl", virksomhed: null };
    }
    const frisk = await hentAnsoegning(admin, ansoegningId);
    mail = frisk ? await sendSvarMailNu(admin, frisk, "afslag", nu) : "ingen_raekke";
  }

  console.log(`[ansoegning-handling] ${handling.art} på ${ansoegningId} af ${userId}: ${res.fra} → ${res.til} (${res.planlagt} planlagt, ${res.annulleret} annulleret, mail ${mail ?? "-"})`);
  return json({
    ok: true,
    fra: res.fra,
    til: res.til,
    planlagt: res.planlagt,
    annulleret: res.annulleret,
    mail,
    ...(venteliste ? { venteliste } : {}),
    ...(res.konvertering && res.konvertering.ok ? { company_id: res.konvertering.company_id, genbrugt: res.konvertering.genbrugt, mail: res.konvertering.mail } : {}),
  });
});
