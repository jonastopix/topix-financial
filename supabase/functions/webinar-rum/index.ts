// webinar-rum — rummets tilstand for én seer (skive 1, 30/9-2026; skive 2 samme dag:
// fladen /w/<slug> bruger den, og tre ting er kommet til — se «SKIVE 2» nedenfor).
//
// LEGITIMATIONEN er deltagertokenet fra linket /w/<slug>?t=… (HMAC,
// _shared/webinarMotor/token.ts), verificeret af verifyDeltagertoken
// (_shared/webinarDeltagerAuth.ts) FØR enhver anden service-role-handling.
// verify_jwt = false: seeren har ingen konto. Ét svar udadtil for alt ugyldigt: 403.
//
// SERVEREN EJER URET (spec §A): rummet og positionen regnes af
// webinarMotor/ur.ts:positionDom på SERVERENS tid. Kroppen bærer aldrig en
// position — kun tokenet og handlingen.
//
// HANDLINGER
//   POST { t, handling: "tilstand" } → { motor, server_nu_ms, rum, forventet_pos_sek,
//        intro_pos_sek, sek_til_start, sek_til_slut, tider, webinar, embed,
//        embed_status, sen_indgang, naeste_session, interaktioner, kapitler,
//        tidslinje_version, set_procent }
//        Første kald efter lobby-åbning FRYSER tidslinjen (frysTidslinje; skive 2's
//        cron overtager). Deltagelsen oprettes ved første kald i et åbent rum;
//        første kald under afspilning er «gik ind» — sen indgang måles, og
//        tilmeldingens state bliver «Joined» (eWebinars ord), kun fra «Registered».
//   GET ?t=…&handling=ics → husets egen .ics (webinarMotor/ics.ts), METHOD:REQUEST,
//        stabil UID, SEQUENCE = sessionens ics_sekvens.
//
// SKIVE 2 (30/9-2026 — fladen skal bruge dem):
//   «tilstand» bærer også `tidslinje` (HELE den frosne tidslinje, som seeren må
//        se den — seerTidslinje: med betingelsen, quiz' facit først efter svar,
//        CTA'ernes sande nedtælling regnet her), `egne_svar` og `hilsen:
//        { fornavn }`. Med tidslinjen afgør klienten selv, HVORNÅR et kort kommer
//        frem (på serverens position, rettet med urForskydning) — uden at spørge
//        hvert sekund. Hvert SVAR dømmes stadig af webinar-puls
//        (svarKanModtages, doemSvar).
//   POST { t, handling: "gen_tilmeld" } → «Tag den næste session» med ét klik
//        (spec §A5 sen indgang, §A10). Serveren vælger sessionen (den næste
//        efter nu, ikke den nuværende, ikke fuld); tilmeldDom afgør samme/flyt/ny
//        præcis som webinar-tilmeld. En NY række arver navnet og annoncesporet
//        (ARVET_SPOR: utm_*, fbclid, origin, referrer, fbp, fbc_cookie,
//        ga_client_id) fra den række, tokenet peger på — ALDRIG samtykket, som
//        hører til den oprindelige tilmelding (webinarRum.guard dom 2). Svaret bærer
//        tokenet til den række, personen nu står på — også ved «samme» og «flyt»:
//        kalderen HAR et gyldigt token til samme mail, så det er personen selv
//        (modsat webinar-tilmeld, hvor enhver kan taste en mail).
//   POST { t, handling: "forudfyld" } → { forudfyld: { navn, email } } til
//        ansøgningen fra exitrummets knap (spec §A9): /ansoeg får tokenet i
//        #-fragmentet (aldrig i en query, aldrig til en server i en Referer) og
//        henter navnet og mailen HER — intet persondata i en URL.
//   Personfelterne i «hilsen» og «forudfyld» går gennem NAVNGIVNE_UNDTAGELSER
//   (webinarMotor/svar.ts): præcise stier, kun i de to svar.
//
// BUNNYS EMBED signeres KUN i intro og afspilning, som get-video-embed/chat-video:
// sha256hex(TOKEN_AUTH_KEY + guid + expires) — men i webinarbiblioteket (egne
// secrets BUNNY_WEBINAR_LIBRARY_ID + BUNNY_WEBINAR_TOKEN_AUTH_KEY, aldrig
// Akademiets eller chattens) og med udløb = exitrummets slut + 30 min.
// Mangler de, svarer rummet stadig — med embed: null og embed_status «ikke_sat_op».
//
// INGEN PERSONDATA i svaret (findMotorForbudte går hele svaret igennem, 500 ellers)
// — undtagen de to navngivne stier ovenfor.
// BEVISET: `motor: "boardroom-2"`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { type Deltager, joinSecret, verifyDeltagertoken } from "../_shared/webinarDeltagerAuth.ts";
import { frysTidslinje, hentRumData, type RumData } from "../_shared/webinarMotorHent.ts";
import { ipDagshash } from "../_shared/webinarTilmeldVaern.ts";
import { embedParametre, embedUdloebSek, faarEmbed, positionDom, type Rum, senIndgangDom, sessionTider } from "../_shared/webinarMotor/ur.ts";
import { aktiveInteraktioner, ctaVindue, type Interaktion, kapitler, type NedtaellingsKilder, seerTidslinje, somSeerSer, type Tidslinje } from "../_shared/webinarMotor/interaktioner.ts";
import { naesteSessioner, type SessionValg } from "../_shared/webinarMotor/sessionplan.ts";
import { bygIcs } from "../_shared/webinarMotor/ics.ts";
import { byggDeltagertoken, rumSti } from "../_shared/webinarMotor/token.ts";
import { type EksisterendeTilmelding, platformEwebinarId, tilmeldDom } from "../_shared/webinarMotor/tilmelding.ts";
import { findMotorForbudte, findMotorForbudteMed, MOTOR_VERSION, type Undtagelse } from "../_shared/webinarMotor/svar.ts";

const LOG = "[webinar-rum]";
const KENDTE_FELTER = ["t", "handling"] as const;
const HANDLINGER = ["tilstand", "gen_tilmeld", "forudfyld"] as const;
const APP_URL = "https://app.theboardroom.dk";

function json(body: Record<string, unknown>, status = 200, undtagelse: Undtagelse | null = null): Response {
  const ud = { motor: MOTOR_VERSION, ...body };
  const forbudte = undtagelse === null ? findMotorForbudte(ud) : findMotorForbudteMed(ud, undtagelse);
  if (forbudte.length > 0) {
    console.error(`${LOG} svar afvist — forbudte nøgler: ${forbudte.join(", ")}`);
    return new Response(JSON.stringify({ motor: MOTOR_VERSION, fejl: "svar_afvist" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify(ud), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

const ukendt = () => json({ fejl: "ukendt" }, 403);

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function logHaendelse(admin: SupabaseClient, raekke: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from("webinar_motor_log").insert({ kilde: "server", ...raekke });
  if (error) console.error(`${LOG} loggen kunne ikke skrives (${String(raekke.art)}): ${error.message}`);
}

/** Den signerede embed — eller hvorfor der ingen er. */
async function embed(rd: RumData, rum: Rum, posSek: number): Promise<{ embed: { url: string; udloeber: number } | null; status: string }> {
  if (!faarEmbed(rum)) return { embed: null, status: "intet_rum" };
  const guid = rum === "intro" ? rd.webinar.intro_video_id : rd.webinar.bunny_video_id;
  if (!guid) return { embed: null, status: "ingen_video" };
  const libraryId = (Deno.env.get("BUNNY_WEBINAR_LIBRARY_ID") ?? "").trim();
  const noegle = (Deno.env.get("BUNNY_WEBINAR_TOKEN_AUTH_KEY") ?? "").trim();
  if (!libraryId || !noegle) return { embed: null, status: "ikke_sat_op" };
  const udloeber = embedUdloebSek(rd.ur);
  const token = await sha256Hex(`${noegle}${guid}${udloeber}`);
  const url = `https://iframe.mediadelivery.net/embed/${libraryId}/${guid}?token=${token}&expires=${udloeber}` + embedParametre(posSek);
  return { embed: { url, udloeber }, status: "ok" };
}

async function icsSvar(admin: SupabaseClient, d: Deltager, rd: RumData, token: string, nuMs: number): Promise<Response> {
  const pos = positionDom(rd.ur, nuMs);
  const url = `${APP_URL}${rumSti(rd.webinar.slug, token)}`;
  const tekst = bygIcs({
    tilmeldingId: d.id,
    sekvens: rd.session.ics_sekvens,
    metode: rd.session.status === "aflyst" ? "CANCEL" : "REQUEST",
    startMs: rd.ur.starterMs,
    slutMs: pos.tider.afspilningSlutMs,
    stempelMs: nuMs,
    titel: rd.webinar.titel,
    beskrivelse: `Gå ind i rummet her: ${url}\n\nDu kan stille ${rd.webinar.vaert_navn ?? "værten"} et spørgsmål allerede i venteværelset.`,
    url,
    deltagerMail: d.email,
  });
  await logHaendelse(admin, { art: "ics_hentet", tilmelding_id: d.id, session_id: d.session_id, data: { via: "mail_link" } });
  return new Response(tekst, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/calendar; charset=utf-8; method=" + (rd.session.status === "aflyst" ? "CANCEL" : "REQUEST"), "Content-Disposition": 'attachment; filename="webinar.ics"', "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Motor": MOTOR_VERSION },
  });
}

/** Personens egne felter — kun til «hilsen» og «forudfyld», aldrig andetsteds i et svar. */
async function hentPerson(admin: SupabaseClient, id: string): Promise<{ fornavn: string | null; navn: string | null; email: string } | null> {
  const { data, error } = await admin.from("webinar_tilmeldinger").select("fornavn, navn, email").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return { fornavn: (data.fornavn as string | null) ?? null, navn: (data.navn as string | null) ?? null, email: data.email as string };
}

/** Webinarets kommende sessioner (planlagt/åben, efter nu, uden den nuværende), med platformens tilmeldte talt for dem med kapacitet. */
async function kommendeSessioner(admin: SupabaseClient, webinarId: string, nuMs: number, udenId: string): Promise<SessionValg[] | null> {
  const { data, error } = await admin
    .from("webinar_sessioner")
    .select("id, starter_at, type, status, kapacitet")
    .eq("webinar_id", webinarId)
    .in("status", ["planlagt", "aaben"])
    .gt("starter_at", new Date(nuMs).toISOString())
    .neq("id", udenId)
    .order("starter_at", { ascending: true })
    .limit(20);
  if (error) return null;
  const ud: SessionValg[] = [];
  for (const s of data ?? []) {
    const kapacitet = (s.kapacitet as number | null) ?? null;
    let tilmeldte: number | null = null;
    if (kapacitet !== null) {
      const { count, error: cFejl } = await admin
        .from("webinar_tilmeldinger")
        .select("id", { count: "exact", head: true })
        .eq("kilde_system", "platform")
        .eq("session_id", s.id as string);
      if (cFejl) return null;
      tilmeldte = count ?? 0;
    }
    ud.push({ id: s.id as string, starterMs: Date.parse(s.starter_at as string), status: s.status as string, type: s.type as string, kapacitet, tilmeldte });
  }
  return ud;
}

/** Annoncesporet, en ny række arver fra den række, tokenet peger på. ALDRIG samtykket (det hører til den oprindelige tilmelding). */
const ARVET_SPOR = "navn, fornavn, webinar_titel, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, origin, referrer, fbp, fbc_cookie, ga_client_id";

/**
 * «Tag den næste session» — samme dom som webinar-tilmeld (tilmeldDom), men
 * legitimationen er tokenet, og serveren vælger sessionen.
 */
async function genTilmeld(admin: SupabaseClient, req: Request, d: Deltager, rd: RumData, nuMs: number): Promise<Response> {
  const secret = joinSecret();
  if (!secret) return json({ fejl: "ikke_sat_op" }, 503);
  const kommende = await kommendeSessioner(admin, rd.webinar.id, nuMs, d.session_id);
  if (!kommende) return json({ fejl: "opslag" }, 500);
  const naeste = naesteSessioner(kommende, nuMs, 1)[0] ?? null;
  if (!naeste) return json({ ok: false, fejl: "ingen_naeste_session" }, 409);
  const { data: naesteRaekke } = await admin.from("webinar_sessioner").select("starter_at, type").eq("id", naeste.id).maybeSingle();
  if (!naesteRaekke) return json({ fejl: "opslag" }, 500);

  const { data: egne, error: eFejl } = await admin
    .from("webinar_tilmeldinger")
    .select("id, session_id, session_tid")
    .eq("kilde_system", "platform")
    .eq("email", d.email)
    .eq("webinar_id", rd.webinar.id);
  if (eFejl) return json({ fejl: "opslag" }, 500);
  const eksisterende: EksisterendeTilmelding[] = (egne ?? []).map((e) => ({
    id: e.id as string,
    sessionId: (e.session_id as string | null) ?? null,
    sessionStarterMs: e.session_tid ? Date.parse(e.session_tid as string) : null,
  }));
  const tider = sessionTider({ starterMs: naeste.starterMs, varighedSek: rd.webinar.varighed_sek, introSek: rd.webinar.intro_sek, lobbyMin: rd.webinar.lobby_min, exitrumMin: rd.webinar.exitrum_min });
  const dom = tilmeldDom(naeste.id, eksisterende, { id: naeste.id, status: naeste.status, starterMs: naeste.starterMs, slutMs: tider.exitrumSlutMs, kapacitet: naeste.kapacitet, tilmeldte: naeste.tilmeldte ?? 0 }, nuMs);
  if (dom.art === "afvis") return json({ ok: false, fejl: dom.grund }, 409);

  const nuIso = new Date(nuMs).toISOString();
  let id: string;
  if (dom.art === "samme") {
    id = dom.id;
  } else if (dom.art === "flyt") {
    const { data: flyttet, error: fFejl } = await admin
      .from("webinar_tilmeldinger")
      .update({ session_id: naeste.id, session_tid: naesteRaekke.starter_at, session_type: naesteRaekke.type, flyttet_fra_session_id: dom.fraSessionId, sidste_haendelse_at: nuIso })
      .eq("id", dom.id)
      .eq("session_id", dom.fraSessionId)
      .select("id");
    if (fFejl || !flyttet || flyttet.length !== 1) {
      console.error(`${LOG} gen_tilmeld: flytningen af ${dom.id} ramte ${flyttet?.length ?? 0} rækker: ${fFejl?.message ?? "ingen fejl"}`);
      return json({ fejl: "flyt" }, 500);
    }
    id = dom.id;
  } else {
    const { data: kilde, error: kFejl } = await admin.from("webinar_tilmeldinger").select(ARVET_SPOR).eq("id", d.id).maybeSingle();
    if (kFejl || !kilde) return json({ fejl: "opslag" }, 500);
    id = crypto.randomUUID();
    const { error: iFejl } = await admin.from("webinar_tilmeldinger").insert({
      ...(kilde as Record<string, unknown>),
      id,
      ewebinar_id: platformEwebinarId(id),
      kilde_system: "platform",
      email: d.email,
      webinar_id: rd.webinar.id,
      session_id: naeste.id,
      session_tid: naesteRaekke.starter_at,
      session_type: naesteRaekke.type,
      registreret_at: nuIso,
      state: "Registered",
      sidste_action: "Registered",
      sidste_haendelse_at: nuIso,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500) || null,
      ip_dagshash: await ipDagshash(req, nuMs),
      token_version: 1,
      raa: { kilde: "platform", motor: MOTOR_VERSION, via: "gen_tilmeld" },
    });
    if (iFejl) {
      if (iFejl.code !== "23505") {
        console.error(`${LOG} gen_tilmeld: insert fejlede: ${iFejl.message}`);
        return json({ fejl: "gem" }, 500);
      }
      // Kapløb (to tryk): den anden anmodning vandt — det er «samme».
      const { data: vandt } = await admin.from("webinar_tilmeldinger").select("id").eq("kilde_system", "platform").eq("email", d.email).eq("session_id", naeste.id).maybeSingle();
      if (!vandt) return json({ fejl: "gem" }, 500);
      id = vandt.id as string;
    }
  }

  const { data: raekke } = await admin.from("webinar_tilmeldinger").select("token_version").eq("id", id).maybeSingle();
  if (!raekke) return json({ fejl: "opslag" }, 500);
  const token = await byggDeltagertoken(secret, id, raekke.token_version as number);
  await logHaendelse(admin, { art: "gen_tilmeldt", tilmelding_id: id, session_id: naeste.id, data: { fra_tilmelding_id: d.id, fra_session_id: d.session_id, udfald: dom.art } });
  return json({ ok: true, dublet: dom.art, session: { id: naeste.id, starter_at: naesteRaekke.starter_at }, token, rum_sti: rumSti(rd.webinar.slug, token) });
}

/** CTA'ens sande nedtælling, regnet her, så klienten kun tæller ned til et tidspunkt, vi ejer. */
function medCtaVindue(i: Interaktion, kilder: NedtaellingsKilder, nuMs: number): Record<string, unknown> {
  return i.art === "cta" ? { ...i, cta_vindue: ctaVindue(i, kilder, nuMs) } : { ...i };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── GET: kalenderfilen ────────────────────────────────────────────────
    if (req.method === "GET") {
      const u = new URL(req.url);
      if (u.searchParams.get("handling") !== "ics") return json({ fejl: "ukendt_handling" }, 400);
      const token = u.searchParams.get("t") ?? "";
      const dom = await verifyDeltagertoken(token, admin);
      if (!dom.ok) return ukendt();
      const nuMs = Date.now();
      const rd = await hentRumData(admin, dom.deltager.session_id, nuMs, true);
      if (!rd.ok) return json({ fejl: "session" }, 500);
      return await icsSvar(admin, dom.deltager, rd.data, token, nuMs);
    }

    if (req.method !== "POST") return json({ fejl: "kun_post_eller_get" }, 405);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const ukendte = ukendteFelter(body, KENDTE_FELTER);
    if (ukendte.length > 0) return json({ fejl: ukendteFelterBesked(ukendte, KENDTE_FELTER) }, 400);

    // ── TOKENET FØRST ─────────────────────────────────────────────────────
    const dom = await verifyDeltagertoken(body?.t, admin);
    if (!dom.ok) return ukendt();
    const d = dom.deltager;
    if (!(HANDLINGER as readonly string[]).includes(body?.handling as string)) return json({ fejl: "ukendt_handling" }, 400);

    const nuMs = Date.now();
    const hentet = await hentRumData(admin, d.session_id, nuMs, true);
    if (!hentet.ok) {
      console.error(`${LOG} rummet kunne ikke hentes: ${hentet.grund}`);
      return json({ fejl: "session" }, 500);
    }
    const rd = hentet.data;
    const pos = positionDom(rd.ur, nuMs);

    if (body?.handling === "forudfyld") {
      const p = await hentPerson(admin, d.id);
      if (!p) return json({ fejl: "opslag" }, 500);
      await logHaendelse(admin, { art: "ansoegning_fra_webinar", tilmelding_id: d.id, session_id: d.session_id, data: { trin: "forudfyld", rum: pos.rum } });
      return json({ forudfyld: { navn: p.fornavn ?? p.navn ?? "", email: p.email } }, 200, "forudfyld");
    }
    if (body?.handling === "gen_tilmeld") return await genTilmeld(admin, req, d, rd, nuMs);

    // Tidslinjen fryses ved første kald efter lobby-åbning.
    let tidslinje: Tidslinje | null = rd.tidslinje;
    if (!tidslinje && pos.rum !== "foer_lobby" && pos.rum !== "aflyst") {
      const frosset = await frysTidslinje(admin, rd);
      if (!frosset.ok) console.error(`${LOG} tidslinjen kunne ikke fryses: ${frosset.grund}`);
      else tidslinje = frosset.tidslinje;
    }

    // Deltagelsen: oprettes i et åbent rum; første kald under afspilning er «gik ind».
    const aabentRum = pos.rum === "lobby" || pos.rum === "intro" || pos.rum === "afspilning" || pos.rum === "exitrum";
    const erInde = pos.rum === "intro" || pos.rum === "afspilning";
    let setProcent = 0;
    let deltagelseId: string | null = null;
    if (aabentRum) {
      const nuIso = new Date(nuMs).toISOString();
      await admin.from("webinar_deltagelser").upsert(
        { tilmelding_id: d.id, session_id: d.session_id, foerste_lobby_at: pos.rum === "lobby" ? nuIso : null },
        { onConflict: "tilmelding_id,session_id", ignoreDuplicates: true },
      );
      const { data: del } = await admin
        .from("webinar_deltagelser")
        .select("id, foerste_ind_at, set_procent")
        .eq("tilmelding_id", d.id)
        .eq("session_id", d.session_id)
        .maybeSingle();
      if (del) {
        deltagelseId = del.id as string;
        setProcent = Number(del.set_procent ?? 0);
        if (erInde && !del.foerste_ind_at) {
          const senSek = pos.rum === "afspilning" ? pos.forventetPosSek : 0;
          const { data: ind } = await admin
            .from("webinar_deltagelser")
            .update({ foerste_ind_at: nuIso, sen_indgang_sek: senSek })
            .eq("id", deltagelseId)
            .is("foerste_ind_at", null)
            .select("id");
          if (ind && ind.length === 1) {
            await logHaendelse(admin, { art: "gik_ind", tilmelding_id: d.id, session_id: d.session_id, data: { forventet_pos_sek: senSek, sen: senSek > 0 } });
            // eWebinars ord — kun fra «Registered», aldrig ned fra en senere tilstand.
            await admin.from("webinar_tilmeldinger")
              .update({ state: "Joined", sidste_action: "Joined", sidste_haendelse_at: nuIso })
              .eq("id", d.id)
              .eq("state", "Registered");
          }
        }
      }
    }

    // Seerens egne svar (til betingelserne og quiz' facit).
    const egneSvar: Record<string, unknown> = {};
    if (deltagelseId) {
      const { data: sv } = await admin.from("webinar_svar").select("interaktion_id, svar").eq("deltagelse_id", deltagelseId);
      for (const s of sv ?? []) egneSvar[s.interaktion_id as string] = s.svar;
    }

    // Næste session (til sen indgang og «Tag den næste session»).
    const { data: senere } = await admin
      .from("webinar_sessioner")
      .select("id, starter_at, type, status, kapacitet")
      .eq("webinar_id", rd.webinar.id)
      .in("status", ["planlagt", "aaben"])
      .gt("starter_at", new Date(nuMs).toISOString())
      .order("starter_at", { ascending: true })
      .limit(5);
    const naeste = naesteSessioner(
      (senere ?? []).map((s) => ({ id: s.id as string, starterMs: Date.parse(s.starter_at as string), status: s.status as string, type: s.type as string, kapacitet: null, tilmeldte: null })),
      nuMs,
      1,
    )[0] ?? null;

    const sen = pos.rum === "afspilning" ? senIndgangDom(pos.forventetPosSek, rd.webinar.varighed_sek) : null;
    const kilder: NedtaellingsKilder = { sessionSlutMs: pos.tider.exitrumSlutMs, naesteSessionMs: naeste ? naeste.starterMs : null, optagFristMs: null };
    const aktive = aktiveInteraktioner(tidslinje, pos.rum, pos.forventetPosSek, { svar: egneSvar, setProcent });
    const interaktioner = aktive.map((i) => ({
      ...somSeerSer(i, i.id in egneSvar),
      besvaret: i.id in egneSvar,
      ...(i.art === "cta" ? { cta_vindue: ctaVindue(i, kilder, nuMs) } : {}),
    }));
    const e = await embed(rd, pos.rum, pos.rum === "intro" ? pos.introPosSek : pos.forventetPosSek);
    const person = await hentPerson(admin, d.id);

    return json({
      server_nu_ms: nuMs,
      rum: pos.rum,
      forventet_pos_sek: pos.forventetPosSek,
      intro_pos_sek: pos.introPosSek,
      sek_til_start: pos.sekTilStart,
      sek_til_slut: pos.sekTilSlut,
      tider: {
        lobby_aabner_at: new Date(pos.tider.lobbyAabnerMs).toISOString(),
        starter_at: rd.session.starter_at,
        afspilning_start_at: new Date(pos.tider.afspilningStartMs).toISOString(),
        afspilning_slut_at: new Date(pos.tider.afspilningSlutMs).toISOString(),
        exitrum_slut_at: new Date(pos.tider.exitrumSlutMs).toISOString(),
      },
      webinar: { slug: rd.webinar.slug, titel: rd.webinar.titel, vaert_navn: rd.webinar.vaert_navn, vaert_billede: rd.webinar.vaert_billede, varighed_sek: rd.webinar.varighed_sek, intro_sek: rd.webinar.intro_sek },
      embed: e.embed,
      embed_status: e.status,
      sen_indgang: sen,
      naeste_session: naeste ? { id: naeste.id, starter_at: new Date(naeste.starterMs).toISOString() } : null,
      interaktioner,
      tidslinje: seerTidslinje(tidslinje, egneSvar).map((i) => medCtaVindue(i, kilder, nuMs)),
      egne_svar: egneSvar,
      hilsen: { fornavn: person?.fornavn ?? null },
      kapitler: kapitler(tidslinje),
      tidslinje_version: tidslinje?.version ?? null,
      set_procent: setProcent,
    }, 200, "hilsen");
  } catch (err) {
    console.error(`${LOG} uventet fejl:`, err);
    return json({ fejl: "uventet" }, 500);
  }
});
