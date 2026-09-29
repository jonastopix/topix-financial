// webinar-rum — rummets tilstand for én seer (skive 1, 30/9-2026). INGEN flade endnu.
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
// BUNNYS EMBED signeres KUN i intro og afspilning, som get-video-embed/chat-video:
// sha256hex(TOKEN_AUTH_KEY + guid + expires) — men i webinarbiblioteket (egne
// secrets BUNNY_WEBINAR_LIBRARY_ID + BUNNY_WEBINAR_TOKEN_AUTH_KEY, aldrig
// Akademiets eller chattens) og med udløb = exitrummets slut + 30 min.
// Mangler de, svarer rummet stadig — med embed: null og embed_status «ikke_sat_op».
//
// INGEN PERSONDATA i svaret (findMotorForbudte går hele svaret igennem, 500 ellers).
// BEVISET: `motor: "boardroom-1"`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { type Deltager, verifyDeltagertoken } from "../_shared/webinarDeltagerAuth.ts";
import { frysTidslinje, hentRumData, type RumData } from "../_shared/webinarMotorHent.ts";
import { embedParametre, embedUdloebSek, faarEmbed, positionDom, type Rum, senIndgangDom } from "../_shared/webinarMotor/ur.ts";
import { aktiveInteraktioner, ctaVindue, kapitler, somSeerSer, type Tidslinje } from "../_shared/webinarMotor/interaktioner.ts";
import { naesteSessioner } from "../_shared/webinarMotor/sessionplan.ts";
import { bygIcs } from "../_shared/webinarMotor/ics.ts";
import { rumSti } from "../_shared/webinarMotor/token.ts";
import { findMotorForbudte, MOTOR_VERSION } from "../_shared/webinarMotor/svar.ts";

const LOG = "[webinar-rum]";
const KENDTE_FELTER = ["t", "handling"] as const;
const HANDLINGER = ["tilstand"] as const;
const APP_URL = "https://app.theboardroom.dk";

function json(body: Record<string, unknown>, status = 200): Response {
  const ud = { motor: MOTOR_VERSION, ...body };
  const forbudte = findMotorForbudte(ud);
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
    const aktive = aktiveInteraktioner(tidslinje, pos.rum, pos.forventetPosSek, { svar: egneSvar, setProcent });
    const interaktioner = aktive.map((i) => ({
      ...somSeerSer(i, i.id in egneSvar),
      besvaret: i.id in egneSvar,
      ...(i.art === "cta" ? { cta_vindue: ctaVindue(i, { sessionSlutMs: pos.tider.exitrumSlutMs, naesteSessionMs: naeste ? naeste.starterMs : null, optagFristMs: null }, nuMs) } : {}),
    }));
    const e = await embed(rd, pos.rum, pos.rum === "intro" ? pos.introPosSek : pos.forventetPosSek);

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
      kapitler: kapitler(tidslinje),
      tidslinje_version: tidslinje?.version ?? null,
      set_procent: setProcent,
    });
  } catch (err) {
    console.error(`${LOG} uventet fejl:`, err);
    return json({ fejl: "uventet" }, 500);
  }
});
