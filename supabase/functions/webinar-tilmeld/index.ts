// webinar-tilmeld — tilmeldingen til husets egen webinarmotor (skive 1, 30/9-2026).
//
// OFFENTLIG. Kalderen er en besøgende på topix.dk uden konto; der findes intet
// token, før tilmeldingen skaber det. Værnet (verifyOffentligTilmelding,
// _shared/webinarTilmeldVaern.ts) kaldes FØR enhver skrivning: origin på
// listen, honningfelt, IP-dagshash-loft (fail-closed). Kroppens felter dømmes
// FØR værnet (kendteFelter.ts — ukendte afvises, bodyFelter.guard STRIKS).
// verify_jwt = false i config.toml af samme grund som ansoegning-gem.
//
// HANDLINGER
//   { handling: "sessioner", slug }
//       De næste sessioner (højst 3, ikke fulde) for et AKTIVT webinar, og det,
//       tilmeldingssiden /w/<slug> viser om webinaret (titel, beskrivelse, vært,
//       varighed, intro — skive 2). Ingen persondata ind eller ud.
//   { handling: "tilmeld", slug, session_id, fornavn, email, samtykke_nyhedsbrev?,
//     utm_*?, fbclid?, landing?, referrer?, fbp?, fbc?, ga_client_id?, hjemmeside? }
//       Dubletdommen (webinarMotor/tilmelding.ts:offentligTilmeldDom — rådets
//       fund 30/9, HØJ + MELLEM):
//         sessionens afvisninger FØRST (aflyst · forbi · fuld), for alle
//         samme mail + samme session → «kendt»: rækken røres ikke
//         alt andet → NY række — også når mailen står på en anden session.
//         Der FLYTTES ALDRIG her: kalderen har intet bevist, og en flytning
//         uden legitimation lod enhver med en andens mail flytte vedkommendes
//         tilmelding. Flyt kræver tokenet (webinar-rum «gen_tilmeld»).
//       ÉT ENSARTET SVAR for alt andet end en ny række (og for honningfeltet):
//         { ok: true, session, token: null, link_paa_mail: true } — intet
//         `dublet`-felt, der fortæller, om mailen stod på listen.
//       En NY række svarer { ok: true, session, token, rum_sti } — tokenet ÉN gang.
//       «Én pr. (mail, session)» er også databasens dom (delindekset
//       webinar_tilmeldinger_platform_email_session_uidx) — et kapløb giver 23505,
//       og så svares der ensartet.
//
// LÅSEN (rådets fund 30/9, MELLEM): app_config.webinarmotor_offentlig_aktiv
// (fraværende = false). Lukket: «sessioner» viser ingen offentlig session
// (bagLaasen), og «tilmeld» til en offentlig session svarer 403 «ikke_aaben» —
// dømt FØR dubletdommen, for alle, så svaret ikke afslører en kendt mail.
//
// PARITET (spec §C5): rækken skrives i webinar_tilmeldinger med eWebinars ord —
// ewebinar_id 'P-<id>', state/sidste_action «Registered», session_tid =
// sessionens starter_at, session_type = sessionens type, utm_*/fbclid/
// referrer/origin fra formularen — så webinar-mail-cron, klaviyo-profil-cron,
// meta-send-cron (webinarens fbclid) og /webinar læser den UÆNDRET.
// join_link/kalender_link skrives ALDRIG: de udledes af tokenet (skive 2).
//
// TOKENET kun til den, der netop skabte rækken. En «kendt» svarer uden token —
// ellers kunne enhver hente en andens rum-link ved at taste mailen. REST-RISIKO
// (bevidst, rådets dom): «ny» (token) og «kendt» (intet token) kan skelnes —
// men at prøve en fremmed mail, der ikke står på listen, OPRETTER en
// tilmelding og sender personen en bekræftelse. Det er støjende og synligt.
//
// AFMELDINGER: en mail i webinar_afmeldinger tilmeldes stadig (et udtrykkeligt
// valg), men afmeldingen OPHÆVES IKKE her — det er en sletning i en eksisterende
// tabel og venter på Jonas (spec §A1; claude-regelsaet §3). Loggen bærer
// `afmeldt: true`; webinar-mail-cron springer stadig mailen over.
//
// DEN INTERNE PRØVESESSION (skive 3, 30/9-2026 — Jonas' D2.7: ingen offentlig
// parallelkørsel): en session med webinar_sessioner.intern = true står ALDRIG
// i «sessioner»-listen. Med `session_id` i kroppen svares med netop den ene
// (rådgiverens prøvelink /w/<slug>/tilmeld?session=<id>, markeret intern: true),
// og «tilmeld» til den kræver en adresse på topix.dk/theboardroom.dk
// (internDom, FØR dubletdommen; ellers 403 «intern»). Rækken får raa.intern.
//
// BEVISET I SVARET: `motor: "boardroom-3"` (MOTOR_VERSION) — kun den nye kode
// kan svare med det.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { tilladtOrigin, verifyOffentligTilmelding } from "../_shared/webinarTilmeldVaern.ts";
import { joinSecret } from "../_shared/webinarDeltagerAuth.ts";
import { hentOffentligLaas } from "../_shared/webinarMotorHent.ts";
import {
  internDom,
  laasDom,
  laesTilmeldInput,
  offentligTilmeldDom,
  platformEwebinarId,
  SLUG_FORM,
  UUID_FORM,
  TILMELD_HANDLINGER,
  TILMELD_KENDTE_FELTER,
  type EksisterendeTilmelding,
  type TilmeldHandling,
} from "../_shared/webinarMotor/tilmelding.ts";
import { bagLaasen, naesteSessioner, type SessionValg } from "../_shared/webinarMotor/sessionplan.ts";
import { sessionTider } from "../_shared/webinarMotor/ur.ts";
import { byggDeltagertoken, rumSti } from "../_shared/webinarMotor/token.ts";
import { findMotorForbudte, MOTOR_VERSION } from "../_shared/webinarMotor/svar.ts";

const LOG = "[webinar-tilmeld]";

function svar(req: Request, body: Record<string, unknown>, status = 200): Response {
  const origin = tilladtOrigin(req);
  const ud = { motor: MOTOR_VERSION, ...body };
  const forbudte = findMotorForbudte(ud);
  if (forbudte.length > 0) {
    console.error(`${LOG} svar afvist — forbudte nøgler: ${forbudte.join(", ")}`);
    return new Response(JSON.stringify({ motor: MOTOR_VERSION, fejl: "svar_afvist" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify(ud), {
    status,
    headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin ?? "https://topix.dk", Vary: "Origin", "Content-Type": "application/json" },
  });
}

interface WebinarRaekke {
  id: string;
  slug: string;
  titel: string;
  beskrivelse: string | null;
  vaert_navn: string | null;
  vaert_billede: string | null;
  varighed_sek: number;
  intro_sek: number;
  lobby_min: number;
  exitrum_min: number;
  status: string;
}

async function hentAktivtWebinar(admin: SupabaseClient, slug: string): Promise<WebinarRaekke | null | "fejl"> {
  const { data, error } = await admin
    .from("webinarer")
    .select("id, slug, titel, beskrivelse, vaert_navn, vaert_billede, varighed_sek, intro_sek, lobby_min, exitrum_min, status")
    .eq("slug", slug)
    .eq("status", "aktiv")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} webinaropslag fejlede: ${error.message}`);
    return "fejl";
  }
  return (data as WebinarRaekke | null) ?? null;
}

/** Platformens tilmeldte pr. session — kun for sessioner med kapacitet. */
async function tilmeldteI(admin: SupabaseClient, sessionId: string): Promise<number | null> {
  const { count, error } = await admin
    .from("webinar_tilmeldinger")
    .select("id", { count: "exact", head: true })
    .eq("kilde_system", "platform")
    .eq("session_id", sessionId);
  return error ? null : count ?? 0;
}

/**
 * DET ENSARTEDE SVAR (rådets fund 30/9, MELLEM «enumeration»): alt, der ikke
 * er en ny række — en kendt mail, et kapløb, honningfeltet — svarer ens.
 * `session` er kun ekkoet af det, kalderen selv valgte.
 */
function ensartet(req: Request, session: { id: string; starter_at: string } | null): Response {
  return svar(req, { ok: true, session, token: null, link_paa_mail: true });
}

async function logHaendelse(admin: SupabaseClient, raekke: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from("webinar_motor_log").insert({ kilde: "server", ...raekke });
  if (error) console.error(`${LOG} loggen kunne ikke skrives (${String(raekke.art)}): ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const origin = tilladtOrigin(req);
    return new Response(null, { headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin ?? "https://topix.dk", Vary: "Origin" } });
  }
  if (req.method !== "POST") return svar(req, { fejl: "kun_post" }, 405);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const handling = body?.handling as TilmeldHandling | undefined;
    if (!handling || !(TILMELD_HANDLINGER as readonly string[]).includes(handling)) return svar(req, { fejl: "ukendt_handling" }, 400);
    // En krop, man ikke forstår, må aldrig blive en stille standardkørsel (#1027).
    const ukendte = ukendteFelter(body, TILMELD_KENDTE_FELTER);
    if (ukendte.length > 0) return svar(req, { fejl: ukendteFelterBesked(ukendte, TILMELD_KENDTE_FELTER) }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const nuMs = Date.now();

    // ── VÆRNET FØRST ─────────────────────────────────────────────────────
    const vaern = await verifyOffentligTilmelding(req, body, admin, nuMs, handling === "tilmeld");
    if (!vaern.ok) return svar(req, { fejl: vaern.fejl }, vaern.status);

    // ── SESSIONER: læsning, ingen persondata ─────────────────────────────
    if (handling === "sessioner") {
      const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
      if (!SLUG_FORM.test(slug)) return svar(req, { fejl: "slug" }, 400);
      const webinar = await hentAktivtWebinar(admin, slug);
      if (webinar === "fejl") return svar(req, { fejl: "opslag" }, 500);
      if (!webinar) return svar(req, { fejl: "ukendt_webinar" }, 404);
      // SKIVE 3: med `session_id` spørges der om ÉN bestemt session — rådgiverens
      // prøvelink til en INTERN session (tilmeldSti). Uden: de offentlige.
      const bestemt = typeof body?.session_id === "string" ? body.session_id.trim().toLowerCase() : null;
      if (bestemt !== null && !UUID_FORM.test(bestemt)) return svar(req, { fejl: "session_id" }, 400);
      let q = admin
        .from("webinar_sessioner")
        .select("id, starter_at, type, status, kapacitet, intern")
        .eq("webinar_id", webinar.id)
        .in("status", ["planlagt", "aaben"])
        .gt("starter_at", new Date(nuMs).toISOString());
      if (bestemt !== null) q = q.eq("id", bestemt);
      const { data, error } = await q.order("starter_at", { ascending: true }).limit(20);
      if (error) return svar(req, { fejl: "opslag" }, 500);
      const valg: SessionValg[] = [];
      for (const s of data ?? []) {
        const kapacitet = (s.kapacitet as number | null) ?? null;
        valg.push({ id: s.id, starterMs: Date.parse(s.starter_at), status: s.status, type: s.type, kapacitet, tilmeldte: kapacitet === null ? null : await tilmeldteI(admin, s.id), intern: s.intern === true });
      }
      // En INTERN session står aldrig i den offentlige liste (D2.7). Den bestemte
      // vises — også intern — men tilmeldingen til den dømmes af internDom.
      // LÅSEN: lukket → ingen offentlig session, heller ikke den bestemte.
      const offentligAaben = await hentOffentligLaas(admin);
      const naeste = naesteSessioner(bagLaasen(valg, offentligAaben), nuMs, bestemt !== null ? 1 : undefined, bestemt !== null);
      return svar(req, {
        webinar: {
          slug: webinar.slug, titel: webinar.titel, beskrivelse: webinar.beskrivelse, vaert_navn: webinar.vaert_navn,
          vaert_billede: webinar.vaert_billede, varighed_sek: webinar.varighed_sek, intro_sek: webinar.intro_sek,
        },
        sessioner: naeste.map((s) => ({ id: s.id, starter_at: new Date(s.starterMs).toISOString(), type: s.type, ...(s.intern === true ? { intern: true } : {}) })),
      });
    }

    // ── TILMELD ──────────────────────────────────────────────────────────
    // Honningfeltet: svar som om alt gik godt, skriv intet, lær botten intet.
    if (vaern.honning) return ensartet(req, null);

    const dom = laesTilmeldInput(body as Record<string, unknown>);
    if (!dom.ok) return svar(req, { fejl: "ugyldig", felter: dom.fejl }, 400);
    const ind = dom.input;

    const secret = joinSecret();
    if (!secret) {
      console.error(`${LOG} deltagertokenets secret er ikke sat (webinarDeltagerAuth.ts) — ingen tilmelding uden et token at give`);
      return svar(req, { fejl: "ikke_sat_op" }, 503);
    }

    const webinar = await hentAktivtWebinar(admin, ind.slug);
    if (webinar === "fejl") return svar(req, { fejl: "opslag" }, 500);
    if (!webinar) return svar(req, { fejl: "ukendt_webinar" }, 404);

    const { data: session, error: sFejl } = await admin
      .from("webinar_sessioner")
      .select("id, webinar_id, starter_at, type, status, kapacitet, intern")
      .eq("id", ind.sessionId)
      .eq("webinar_id", webinar.id)
      .maybeSingle();
    if (sFejl) return svar(req, { fejl: "opslag" }, 500);
    if (!session) return svar(req, { fejl: "ukendt_session" }, 404);
    // DEN INTERNE PRØVESESSION (skive 3, D2.7): kun husets egne adresser — dømt
    // FØR dubletdommen, så en fremmed adresse aldrig oprettes eller slås op.
    const sessionIntern = session.intern === true;
    const intern = internDom(sessionIntern, ind.email);
    if (!intern.ok) return svar(req, { fejl: intern.grund }, 403);
    // LÅSEN foran enhver tilmelding til en OFFENTLIG session — før dubletdommen.
    const laas = laasDom(sessionIntern, sessionIntern ? false : await hentOffentligLaas(admin));
    if (!laas.ok) return svar(req, { fejl: laas.grund }, 403);
    const starterMs = Date.parse(session.starter_at);
    const tider = sessionTider({ starterMs, varighedSek: webinar.varighed_sek, introSek: webinar.intro_sek, lobbyMin: webinar.lobby_min, exitrumMin: webinar.exitrum_min });

    // Platformens rækker for samme mail og SAMME webinar — og deres sessioners start.
    const { data: egne, error: eFejl } = await admin
      .from("webinar_tilmeldinger")
      .select("id, session_id, session_tid")
      .eq("kilde_system", "platform")
      .eq("email", ind.email)
      .eq("webinar_id", webinar.id);
    if (eFejl) return svar(req, { fejl: "opslag" }, 500);
    const eksisterende: EksisterendeTilmelding[] = (egne ?? []).map((e) => ({
      id: e.id as string,
      sessionId: (e.session_id as string | null) ?? null,
      sessionStarterMs: e.session_tid ? Date.parse(e.session_tid as string) : null,
    }));

    const kapacitet = (session.kapacitet as number | null) ?? null;
    const tilmeldte = kapacitet === null ? 0 : await tilmeldteI(admin, session.id);
    if (tilmeldte === null) return svar(req, { fejl: "opslag" }, 500);

    const { data: afm } = await admin.from("webinar_afmeldinger").select("email").eq("email", ind.email).maybeSingle();
    const afmeldt = !!afm;

    const valg = offentligTilmeldDom(session.id, eksisterende, { id: session.id, status: session.status, starterMs, slutMs: tider.exitrumSlutMs, kapacitet, tilmeldte }, nuMs);
    const sessionUd = { id: session.id, starter_at: session.starter_at };

    if (valg.art === "afvis") return svar(req, { fejl: valg.grund }, 409);

    if (valg.art === "kendt") {
      // Rækken røres IKKE. Loggen (service-role-only) bærer, hvad der skete.
      await logHaendelse(admin, { art: "tilmeldt", tilmelding_id: valg.id, session_id: session.id, data: { dublet: "kendt", kilde_system: "platform" } });
      return ensartet(req, sessionUd);
    }

    // ── NY ─────────────────────────────────────────────────────────────
    const id = crypto.randomUUID();
    const nuIso = new Date(nuMs).toISOString();
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;
    const { error: iFejl } = await admin.from("webinar_tilmeldinger").insert({
      id,
      ewebinar_id: platformEwebinarId(id),
      kilde_system: "platform",
      email: ind.email,
      navn: ind.fornavn,
      fornavn: ind.fornavn,
      webinar_id: webinar.id,
      webinar_titel: webinar.titel,
      session_id: session.id,
      session_tid: session.starter_at,
      session_type: session.type,
      registreret_at: nuIso,
      state: "Registered",
      sidste_action: "Registered",
      sidste_haendelse_at: nuIso,
      samtykke_nyhedsbrev_at: ind.samtykkeNyhedsbrev ? nuIso : null,
      ...ind.spor,
      user_agent: userAgent,
      ip_dagshash: vaern.ipHash,
      token_version: 1,
      // `intern` kun på en prøvesessions rækker — så de kan filtreres fra i tal senere.
      raa: { kilde: "platform", motor: MOTOR_VERSION, ...(sessionIntern ? { intern: true } : {}) },
    });
    if (iFejl) {
      if (iFejl.code === "23505") {
        // Kapløb: en anden anmodning med samme mail og session vandt. Det er «kendt».
        return ensartet(req, sessionUd);
      }
      console.error(`${LOG} insert fejlede: ${iFejl.message}`);
      return svar(req, { fejl: "gem" }, 500);
    }

    await logHaendelse(admin, {
      art: "tilmeldt",
      tilmelding_id: id,
      session_id: session.id,
      data: { dublet: "ny", kilde_system: "platform", har_fbclid: ind.spor.fbclid !== null, samtykke_nyhedsbrev: ind.samtykkeNyhedsbrev, afmeldt, andre_sessioner: eksisterende.length },
    });

    const token = await byggDeltagertoken(secret, id, 1);
    return svar(req, { ok: true, session: sessionUd, token, rum_sti: rumSti(webinar.slug, token) });
  } catch (err) {
    console.error(`${LOG} uventet fejl:`, err);
    return svar(req, { fejl: "uventet" }, 500);
  }
});
