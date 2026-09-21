// ENGANGSIMPORT af eWebinars eksisterende tilmeldinger (udkast 19/9-2026,
// ~/Downloads/udkast-ewebinar-import/README.md) — DATAHENTNING, ikke ny
// funktionalitet. Webhooken (ewebinar-webhook) fanger alt FREMOVER; denne
// henter det der allerede står i eWebinar: de 330 tilmeldte til 22/9 OG
// tidligere webinarer, så historikken er der, når de ansøger. Uden den står
// der «deltagelse ukendt» for alle 330.
//
// SAMME FORM SOM berig-virksomheder: HTTP-indgang, Bucket B
// (authenticateServiceRole bag verify_jwt = true), og TØRKØRSEL SOM
// STANDARD — uden body hentes og rapporteres alt, men INTET skrives. Kun et
// eksplicit { "dry_run": false } skriver.
//
// ÉN AFVIGELSE fra berig-virksomheder, med vilje: DENS tørkørsel kalder
// IKKE det eksterne API (DataCVR har 25 opslag/dag, og en tørkørsel ville
// æde den rigtige kørsels kvote). eWebinar har INGEN dokumenteret kvote, og
// hele pointen med tørkørslen her er at SE hvad API'et svarer — derfor
// henter tørkørslen alt. Rammer vi alligevel en grænse, svarer API'et 429,
// og importen er idempotent: kør igen senere.
//
// TRE TILSTANDE:
//   { "maal": true }        MÅLINGEN (README §2): henter ÉN registrant og
//                           svarer med HELE objektet + feltrapporten — alle
//                           nøgler, typer, hvor mange der har værdi, og
//                           hvilke vi ikke bruger endnu. Skriver INTET.
//                           { "maal": "<registrant-id>" } måler en bestemt.
//   { }                     TØRKØRSEL: henter alle registranter + webinarer,
//                           regner hvad der ville blive skrevet, svarer med
//                           rapporten. Skriver INTET.
//   { "dry_run": false }    SKRIVER: samme hentning, og skriver så loggen
//                           (webinar_haendelser, kilde 'import') og de
//                           aktuelle rækker (webinar_tilmeldinger).
//
// FREMMØDE FOR ÉN SESSION (udkast 21/9-2026, recon-no-show-sender /
// recon-import-fremmoede). Bruges KUN, hvis eWebinar ikke selv melder no-shows
// via webhooken. Med { "send_fremmoede": true, "session_dato": "YYYY-MM-DD" }
// (dansk dato) dømmes de registranter, hvis session ligger på datoen, som
// webhooken dømmer dem: gradFoer af den kendte række, grad af den flettede,
// afgoerOvergang, byggFremmoede — SAMME unique_id `${ewebinar_id}:${grad}`.
//   tørkørsel (standard)     sender intet; svaret viser `fremmoede.ville_sende`.
//   dry_run: false           SENDER FØRST (fem ad gangen gennem sendHvisMail),
//                            SKRIVER BAGEFTER — omvendt af webhooken, se
//                            koerImport trin 5. Et tidsbudget (BUDGET_MS)
//                            afbryder afsendelsen, før edge-loftet gør det;
//                            så skrives INTET, svaret siger `afbrudt: true`,
//                            og kørslen køres blot igen. Svaret bærer
//                            `fremmoede.sendt` + udfald pr. type. Det er
//                            beviset på den nye kode.
// Replay/OnDemand (session_tid null) kommer aldrig i betragtning. Uden de to
// felter er ALT som før. Ukendte felter afvises (kendteFelter.ts, STRIKS).
//
// INGEN DUBLETTER, uanset rækkefølge: nøglen er registrantens id
// (webinar_tilmeldinger.ewebinar_id, UNIQUE), og fletningen er webhookens
// egen (fletTilmelding) — den nye værdi vinder, null overskriver aldrig en
// kendt værdi, og procenten gaar ALDRIG ned. Loggen er idempotent paa
// aftrykket af den kanoniske registrant-JSON: koerer importen to gange uden
// aendringer i eWebinar, giver anden koersel nul nye lograekker og
// «uaendret» paa alle.
//
// KALD (SQL editoren, samme vej som berig-virksomheder):
//   SELECT net.http_post(
//     url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/ewebinar-import',
//     headers := jsonb_build_object(
//       'Content-Type', 'application/json',
//       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
//     ),
//     body := '{"maal": true}'::jsonb      -- maaling; '{}' toerkoersel; '{"dry_run": false}' skriver
//   ) AS request_id;
//   -- svaret: SELECT status_code, content::text FROM net._http_response WHERE id = <request_id>;

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import {
  EwebinarFejl,
  hentAlleRegistranter,
  hentAlleWebinarer,
  hentBase,
  hentNoegle,
  hentRegistrant,
  type ApiOpsaetning,
} from "../_shared/ewebinarApi.ts";
import { doemSetGrad, fletTilmelding, type SetGrad, type WebinarTilmelding } from "../_shared/webinarDom.ts";
import {
  doemFremmoedeForImport,
  erForskellig,
  erISessionen,
  feltRapport,
  gyldigSessionDato,
  kanoniskJson,
  plukRestRegistrant,
  somFremmoedeLinje,
  tomFremmoedeRapport,
  type FeltRapport,
  type FremmoedeDom,
  type FremmoedeRapport,
  type ImportRaekke,
} from "../_shared/webinarImport.ts";
import { sha256Hex } from "../_shared/aftryk.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
// Afsendelsen til Klaviyo: KUN gennem sendHvisMail (nøglen læses dér, ikke her).
import { sendHvisMail } from "../_shared/klaviyoAfsendelse.ts";

/** Ét sted læses miljøet til eWebinar-klienten, som er Deno-fri (og derfor testbar i vitest). */
const miljoe = (navn: string): string | undefined => Deno.env.get(navn);

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["maal", "dry_run", "send_fremmoede", "session_dato"] as const;

/** Hvor mange rækker der læses/skrives ad gangen. 330 er to-tre klumper. */
const KLUMPE = 200;

/**
 * TIDSBUDGETTET for afsendelsen — målt fra functionens start (Deno.serve).
 *
 * Regnestykket: edge-loftet er 150 s («Request idle timeout», kald_edge_loft_ms).
 * Budgettet er 100 s, så der er 50 s tilbage til det, der kommer EFTER den
 * sidste pulje: den pulje, der var i gang, da budgettet blev brugt (værst
 * 5 × Klaviyo-timeout 3 s = én pulje på 3 s + skrivSpor-inserts), de seks
 * upserts (⌈597/200⌉ klumper × log + rækker) og svaret. Hentningen tæller
 * MED i budgettet (den ligger før afsendelsen): tre sider à op til 20 s +
 * pauser = op til 61 s hentning efterlader 39 s afsendelse = ~78 puljer à
 * 0,5 s = 390 hændelser; ved 10 sider (204 s) er budgettet brugt, før den
 * første pulje sendes, og svaret siger afbrudt med udsat = alle.
 */
export const BUDGET_MS = 100_000;
/** Puljen: fem afsendelser ad gangen (sendHvisMail kaster aldrig). Klaviyos loft er 350/s. */
export const PULJE = 5;

/** Alle kolonner dommen kender — inkl. annoncesporet (19/9), så fletningen ser hele rækken. */
const TILMELDING_KOLONNER =
  "ewebinar_id, email, navn, webinar_id, webinar_titel, session_tid, session_type, registreret_at, state, sidste_action, attended, subscribed, set_procent, set_procent_kilde, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, origin, first_origin, referrer, first_referrer, widget_source, by, land, enhed, tidszone";

interface WebinarLinje {
  webinarId: string;
  titel: string | null;
  registranter: number;
  medProcent: number;
  grader: Record<SetGrad, number>;
}

interface ImportRapport {
  ok: boolean;
  dry_run: boolean;
  /** Hvad API'et gav. */
  hentet: {
    registranter: number;
    sider: number;
    /** true = loftet stoppede os; der mangler data. Kør igen eller hæv MAKS_SIDER. */
    afkortet: boolean;
    webinarer: number | null;
    webinarer_fejl?: string;
    base: string;
  };
  /** Hvad importen ville gøre (tørkørsel) eller gjorde. */
  raekker: { i_alt: number; ny: number; opdateret: number; uaendret: number; sprunget_over: number };
  /** Procenten — kernespørgsmålet (README §2 og §4). */
  procent: { med_tal: number; uden_tal: number; kilder: Record<string, number>; mindst: number | null; mest: number | null };
  /** Dommen på tværs, som rådgiveren vil se den. */
  grader: Record<SetGrad, number>;
  /** Pr. webinar — «hvor mange er tilmeldt det næste» i rå form. */
  webinarer: WebinarLinje[];
  /** MÅLINGEN: hvilke felter API'et faktisk sender. */
  felter: FeltRapport;
  /** Kun rækker der ikke kunne bruges — navngivet, så de kan tages i hånden. */
  sprunget_over: ImportRaekke[];
  /** Skrivningen (kun ved dry_run: false). */
  skrevet?: { log_raekker: number; tilmeldinger: number; fejl: string[] };
  /** Fremmøde for én session (kun ved send_fremmoede: true) — beviset på den nye kode. */
  fremmoede?: FremmoedeRapport;
  error?: string;
}

/** Hvad kalderen bad om, når fremmøde skal sendes. null = som før. */
interface FremmoedeValg {
  sessionDato: string;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tomGrader(): Record<SetGrad, number> {
  return { set: 0, delvist: 0, moedte_ikke: 0, tilmeldt: 0, ukendt: 0 };
}

/** numeric kommer som streng fra PostgREST — tallet skal være et tal for fletningen. */
function somRaekke(r: Record<string, unknown>): WebinarTilmelding {
  const p = r.set_procent;
  return { ...(r as unknown as WebinarTilmelding), set_procent: p === null || p === undefined ? null : Number(p) };
}

async function laesEksisterende(admin: SupabaseClient, ids: string[]): Promise<Map<string, WebinarTilmelding>> {
  const kort = new Map<string, WebinarTilmelding>();
  for (let i = 0; i < ids.length; i += KLUMPE) {
    const del = ids.slice(i, i + KLUMPE);
    const { data, error } = await admin.from("webinar_tilmeldinger").select(TILMELDING_KOLONNER).in("ewebinar_id", del);
    if (error) throw new Error(`Opslag på webinar_tilmeldinger fejlede: ${error.message}`);
    for (const raa of (data ?? []) as Record<string, unknown>[]) {
      const r = somRaekke(raa);
      kort.set(r.ewebinar_id, r);
    }
  }
  return kort;
}

async function koerImport(admin: SupabaseClient, api: ApiOpsaetning, dryRun: boolean, fremmoede: FremmoedeValg | null, start: number): Promise<ImportRapport> {
  const nu = new Date();

  // 1. HENT ALT. Ingen updatedSince: engangsimporten vil have historikken med.
  const hentet = await hentAlleRegistranter(api);

  // 2. Webinarerne — kun til rapporten («hvor mange webinarer»), fail-soft:
  //    registranterne bærer selv setId og webinarTitle.
  let webinarer: number | null = null;
  let webinarerFejl: string | undefined;
  try {
    webinarer = (await hentAlleWebinarer(api)).raekker.length;
  } catch (err) {
    webinarerFejl = err instanceof Error ? err.message : String(err);
    console.error("[ewebinar-import] webinar-listen kunne ikke hentes (rapporten mangler tallet):", webinarerFejl);
  }

  const rapport: ImportRapport = {
    ok: true,
    dry_run: dryRun,
    hentet: { registranter: hentet.raekker.length, sider: hentet.sider, afkortet: hentet.afkortet, webinarer, ...(webinarerFejl ? { webinarer_fejl: webinarerFejl } : {}), base: api.base ?? "" },
    raekker: { i_alt: hentet.raekker.length, ny: 0, opdateret: 0, uaendret: 0, sprunget_over: 0 },
    procent: { med_tal: 0, uden_tal: 0, kilder: {}, mindst: null, mest: null },
    grader: tomGrader(),
    webinarer: [],
    felter: feltRapport(hentet.raekker),
    sprunget_over: [],
  };

  // 3. Pluk alle (webhookens egen plukker, gennem REST-oversættelsen).
  const plukket: { raa: Record<string, unknown>; t: WebinarTilmelding }[] = [];
  for (const raa of hentet.raekker) {
    const p = plukRestRegistrant(raa);
    if (p.ok === false) {
      rapport.raekker.sprunget_over++;
      rapport.sprunget_over.push({
        ewebinarId: typeof raa?.id === "string" ? raa.id : null,
        email: typeof raa?.email === "string" ? raa.email : null,
        webinarId: typeof raa?.setId === "string" ? raa.setId : null,
        udfald: "sprunget_over",
        grund: p.grund,
      });
      continue;
    }
    plukket.push({ raa, t: p.tilmelding });
  }

  // 4. Læs de eksisterende rækker og flet — webhookens fletning, så de to
  //    veje ikke kan skabe dubletter og importen aldrig sænker en procent.
  const eksisterende = await laesEksisterende(admin, plukket.map((p) => p.t.ewebinar_id));
  const tilSkrivning: { raa: Record<string, unknown>; flettet: WebinarTilmelding; ny: boolean }[] = [];
  const perWebinar = new Map<string, WebinarLinje>();
  // Fremmøde-dommene for sessionen — regnet HER, hvor både den kendte række
  // (foer) og den flettede (flettet) er i hånden, præcis som webhooken har dem.
  const fremmoedeDomme: FremmoedeDom[] = [];
  const fremmoedeRapport = fremmoede ? tomFremmoedeRapport(fremmoede.sessionDato) : null;

  for (const { raa, t } of plukket) {
    const foer = eksisterende.get(t.ewebinar_id) ?? null;
    const flettet = fletTilmelding(foer, t);
    const ny = foer === null;
    const aendret = erForskellig(foer, flettet);
    if (ny) rapport.raekker.ny++;
    else if (aendret) rapport.raekker.opdateret++;
    else rapport.raekker.uaendret++;
    tilSkrivning.push({ raa, flettet, ny });

    if (fremmoede && fremmoedeRapport && erISessionen(flettet, fremmoede.sessionDato)) {
      fremmoedeRapport.i_sessionen++;
      const dom = doemFremmoedeForImport(foer, flettet, nu);
      fremmoedeRapport.overgange[dom.overgang]++;
      if (dom.haendelse) fremmoedeDomme.push(dom);
    }

    if (flettet.set_procent !== null) {
      rapport.procent.med_tal++;
      const kilde = flettet.set_procent_kilde ?? "(ukendt felt)";
      rapport.procent.kilder[kilde] = (rapport.procent.kilder[kilde] ?? 0) + 1;
      rapport.procent.mindst = rapport.procent.mindst === null ? flettet.set_procent : Math.min(rapport.procent.mindst, flettet.set_procent);
      rapport.procent.mest = rapport.procent.mest === null ? flettet.set_procent : Math.max(rapport.procent.mest, flettet.set_procent);
    } else {
      rapport.procent.uden_tal++;
    }

    const grad = doemSetGrad(flettet, nu);
    rapport.grader[grad]++;

    const linje = perWebinar.get(flettet.webinar_id) ?? { webinarId: flettet.webinar_id, titel: flettet.webinar_titel, registranter: 0, medProcent: 0, grader: tomGrader() };
    linje.registranter++;
    if (flettet.set_procent !== null) linje.medProcent++;
    linje.grader[grad]++;
    if (!linje.titel && flettet.webinar_titel) linje.titel = flettet.webinar_titel;
    perWebinar.set(flettet.webinar_id, linje);
  }
  rapport.webinarer = [...perWebinar.values()].sort((a, b) => b.registranter - a.registranter);

  if (fremmoedeRapport) {
    // Tørkørslen viser det, der VILLE blive sendt; den rigtige kørsel fylder `sendt` nedenfor.
    if (dryRun) fremmoedeRapport.ville_sende = fremmoedeDomme.map(somFremmoedeLinje);
    rapport.fremmoede = fremmoedeRapport;
  }

  if (dryRun) return rapport;

  // 5. FREMMØDET FØRST — SEND FØRST, SKRIV BAGEFTER. Omvendt af webhooken
  //    (rækken før Klaviyo), med vilje: afbrydes kørslen — tidsbudgettet
  //    nedenfor eller edge-loftet — er INTET skrevet, så en ny kørsel læser de
  //    samme kendte rækker, ser de samme overgange og sender igen; Klaviyo
  //    kasserer de allerede sendte på unique_id («only the first processed
  //    event will be recorded»). En fejlet afsendelse ligger stadig i
  //    klaviyo_haendelser, fordi sendHvisMail skriver sporet selv, også ved
  //    timeout/loft/fejl — dér finder klaviyo-gensend-cron den. Skrev vi
  //    rækkerne først, ville en afbrudt kørsel efterlade de usendte uden
  //    spor OG uden overgang (gradFoer = grad ved næste kørsel) — tabt for
  //    både gensenderen og en genkørsel.
  //    Fem ad gangen (PULJE); sendHvisMail kaster aldrig. Budgettet tjekkes
  //    før hver pulje: er det brugt, stoppes afsendelsen, intet skrives, og
  //    svaret siger afbrudt + udsat. Kørslen køres blot igen.
  let afbrudt = false;
  if (fremmoede !== null && fremmoedeRapport) {
    const sendt: FremmoedeRapport["sendt"] = [];
    const koe = fremmoedeDomme.filter((d) => d.haendelse !== null);
    for (let i = 0; i < koe.length; i += PULJE) {
      if (Date.now() - start > BUDGET_MS) {
        afbrudt = true;
        break;
      }
      const pulje = koe.slice(i, i + PULJE);
      const svar = await Promise.all(pulje.map((d) => sendHvisMail(admin, d.haendelse!)));
      svar.forEach((a, j) => {
        const dom = pulje[j];
        const udfald = a.spor.udfald;
        fremmoedeRapport.udfald[udfald] = (fremmoedeRapport.udfald[udfald] ?? 0) + 1;
        sendt.push({ ...somFremmoedeLinje(dom), udfald });
        if (!a.sendt) fremmoedeRapport.fejl.push(`${dom.ewebinar_id} (${dom.overgang}): ${udfald}${a.spor.grund ? ` — ${a.spor.grund}` : ""}`);
      });
    }
    fremmoedeRapport.sendt = sendt;
    if (afbrudt) {
      fremmoedeRapport.afbrudt = true;
      fremmoedeRapport.udsat = koe.length - sendt.length;
    }
    console.log(
      `[ewebinar-import] fremmoede ${fremmoede.sessionDato}: ${sendt.length} sendt, udfald ${JSON.stringify(fremmoedeRapport.udfald)}, ${fremmoedeRapport.fejl.length} fejl` +
        (afbrudt ? `, AFBRUDT efter ${Math.round((Date.now() - start) / 1000)} s — ${fremmoedeRapport.udsat} udsat, intet skrevet` : "") + ".",
    );
  }
  // AFBRUDT-VÆRNET: intet skrives i denne kørsel — de samme overgange skal ses igen næste gang.
  if (afbrudt) return rapport;

  // 6. SKRIVNINGEN. Loggen først (den er beviset på hvad vi modtog), så de
  //    aktuelle rækker. Fejl standser ikke resten — de samles i rapporten.
  const skrevet = { log_raekker: 0, tilmeldinger: 0, fejl: [] as string[] };

  const logRaekker: Record<string, unknown>[] = [];
  for (const { raa, flettet } of tilSkrivning) {
    logRaekker.push({
      aftryk: await sha256Hex(kanoniskJson(raa)),
      signatur_t: null,
      noegleform: null,
      kilde: "import",
      action: flettet.sidste_action,
      state: flettet.state,
      ewebinar_id: flettet.ewebinar_id,
      email: flettet.email,
      webinar_id: flettet.webinar_id,
      pluk_grund: null,
      raa,
    });
  }
  for (let i = 0; i < logRaekker.length; i += KLUMPE) {
    const del = logRaekker.slice(i, i + KLUMPE);
    const { data, error } = await admin.from("webinar_haendelser").upsert(del, { onConflict: "aftryk", ignoreDuplicates: true }).select("id");
    if (error) skrevet.fejl.push(`log-klump ${i / KLUMPE + 1}: ${error.message}`);
    else skrevet.log_raekker += (data ?? []).length;
  }

  const raekkerUd = tilSkrivning.map(({ raa, flettet }) => ({ ...flettet, raa, sidste_haendelse_at: nu.toISOString() }));
  for (let i = 0; i < raekkerUd.length; i += KLUMPE) {
    const del = raekkerUd.slice(i, i + KLUMPE);
    const { error } = await admin.from("webinar_tilmeldinger").upsert(del, { onConflict: "ewebinar_id" });
    if (error) skrevet.fejl.push(`tilmeldinger-klump ${i / KLUMPE + 1}: ${error.message}`);
    else skrevet.tilmeldinger += del.length;
  }

  rapport.skrevet = skrevet;
  rapport.ok = skrevet.fejl.length === 0;

  return rapport;
}

Deno.serve(async (req: Request) => {
  // Tidsbudgettets nulpunkt: functionens start, før auth og hentning.
  const start = Date.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Bucket B: service-role FØRST, før nogen nøgle læses og før noget hentes.
  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // Body'en: tom = {} (tørkørsel), ellers JSON via req.json() — det er den
  // form, bodyFelter.guard genkender som «læser body-felter», og som
  // sætter denne function på STRIKS-listen. Ikke-JSON er stadig 400.
  let body: Record<string, unknown> = {};
  const tekst = await req.clone().text();
  if (tekst.trim() !== "") {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(400, { error: "body er ikke JSON" });
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { error: "body skal være et JSON-objekt" });
  }

  // UKENDTE FELTER AFVISES (kendteFelter.ts): et felt, vi ikke forstår, må
  // aldrig blive til en standardkørsel.
  const ukendte = ukendteFelter(body, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`[ewebinar-import] ${besked}`);
    return json(400, { ok: false, grund: "ukendt_felt", error: besked });
  }

  // FREMMØDE FOR ÉN SESSION: begge felter, eller ingen af dem.
  if (body.send_fremmoede !== undefined && typeof body.send_fremmoede !== "boolean") {
    return json(400, { ok: false, grund: "ugyldigt_send_fremmoede", error: "«send_fremmoede» skal være true eller false" });
  }
  const sendFremmoede = body.send_fremmoede === true;
  if (sendFremmoede && !gyldigSessionDato(body.session_dato)) {
    return json(400, { ok: false, grund: "ugyldig_session_dato", error: "«send_fremmoede»: true kræver «session_dato» som dansk dato «YYYY-MM-DD», fx 2026-09-22" });
  }
  if (!sendFremmoede && body.session_dato !== undefined) {
    return json(400, { ok: false, grund: "session_dato_uden_send", error: "«session_dato» bruges kun sammen med «send_fremmoede»: true — uden den ville feltet blive ignoreret i tavshed" });
  }
  const fremmoede: FremmoedeValg | null = sendFremmoede ? { sessionDato: body.session_dato as string } : null;

  // Nøglen — pænt fra, ikke et 500, når den mangler.
  let api: ApiOpsaetning;
  try {
    api = { noegle: hentNoegle(miljoe), base: hentBase(miljoe) };
  } catch (err) {
    if (err instanceof EwebinarFejl) {
      console.error("[ewebinar-import]", err.message);
      return json(err.status, { ok: false, error: err.message });
    }
    throw err;
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Målingen og fremmødet er to forskellige kald — sammen ville det ene blive ignoreret i tavshed.
  if (body.maal !== undefined && sendFremmoede) {
    return json(400, { ok: false, grund: "maal_og_send", error: "«maal» og «send_fremmoede» bruges hver for sig" });
  }

  try {
    // MÅLINGEN: én registrant, alle felter, intet skrives.
    if (body.maal === true || typeof body.maal === "string") {
      let registrant: Record<string, unknown> | null = null;
      if (typeof body.maal === "string") {
        registrant = await hentRegistrant(body.maal, api);
      } else {
        const foerste = await hentAlleRegistranter({ ...api, maksSider: 1 });
        registrant = foerste.raekker[0] ?? null;
        // Listen kan være smallere end detaljen — hent den fulde, hvis id findes.
        const id = typeof registrant?.id === "string" ? registrant.id : null;
        if (id) {
          try {
            registrant = await hentRegistrant(id, api);
          } catch (err) {
            console.error("[ewebinar-import] detalje-opslaget fejlede, bruger listens række:", err instanceof Error ? err.message : String(err));
          }
        }
      }
      if (!registrant) {
        return json(200, { ok: true, maal: true, error: "eWebinar svarede uden registranter — er der tilmeldinger på teamet?" });
      }
      const felter = feltRapport([registrant]);
      const pluk = plukRestRegistrant(registrant);
      console.log(`[ewebinar-import] MÅLING: ${felter.linjer.length} felter, procent-kandidater: ${felter.procentFundet.join(", ") || "INGEN"}.`);
      return json(200, {
        ok: true,
        maal: true,
        base: api.base,
        /** ADVARSEL: indeholder persondata (navn, mail, IP). Masker før den klistres i README. */
        registrant,
        felter,
        plukket: pluk.ok ? pluk.tilmelding : { fejl: pluk.grund },
      });
    }

    // Tørkørsel som standard; kun et eksplicit dry_run: false skriver.
    const dryRun = body.dry_run !== false;
    const rapport = await koerImport(admin, api, dryRun, fremmoede, start);
    console.log(
      `[ewebinar-import] ${dryRun ? "TØRKØRSEL" : "SKREVET"}: ${rapport.hentet.registranter} registranter på ${rapport.hentet.sider} side(r), ` +
        `${rapport.webinarer.length} webinar(er); ny ${rapport.raekker.ny}, opdateret ${rapport.raekker.opdateret}, uændret ${rapport.raekker.uaendret}, ` +
        `sprunget over ${rapport.raekker.sprunget_over}; med procent ${rapport.procent.med_tal}, uden ${rapport.procent.uden_tal}` +
        (rapport.fremmoede ? `; fremmoede ${rapport.fremmoede.session_dato}: ${rapport.fremmoede.i_sessionen} i sessionen, ${JSON.stringify(rapport.fremmoede.overgange)}` : "") + ".",
    );
    return json(rapport.ok ? 200 : 500, rapport as unknown as Record<string, unknown>);
  } catch (err) {
    if (err instanceof EwebinarFejl) {
      console.error("[ewebinar-import] eWebinar:", err.message);
      return json(err.status >= 500 ? 502 : err.status, { ok: false, error: err.message });
    }
    const besked = err instanceof Error ? err.message : String(err);
    console.error("[ewebinar-import] fejlede:", besked);
    return json(500, { ok: false, error: besked });
  }
});
