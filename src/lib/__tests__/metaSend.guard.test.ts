import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONDATA_AFSNIT } from "@/lib/ansoegning/persondata";

/**
 * Kildeværn for Metas Conversions API fra platformen (udkast 21/9-2026 aften). Hver dom bevist
 * på en kopi med fejlen indsat:
 *   1. NØGLEN ÉT STED: metaSend.ts er Deno-fri; Deno.env i afsendelsen KUN META_SEND_TOKEN_NAVN;
 *      cronen læser kun SUPABASE_*; fetch findes kun i metaSendAfsendelse.ts.
 *   2. INGEN UHASHET PERSONDATA (udvidet 22/9): user_data bygges af `...hashet` + external_id +
 *      client_user_agent, og fbc/fbp kommer KUN med, når de findes; HASHEDE_NOEGLER kræver
 *      64 hex; findForbudteNoegler jager rå e-mail og rå telefon/CVR i hele objektet; Metas
 *      normaliseringsregler står ordret i filen; cronen læser de tolv kolonner i RAEKKE_FELTER
 *      og rører ALDRIG klarteksten selv (den rækker rækken til normaliserBrugerdata).
 *   3. TØRKØRSEL STANDARD + LÅSEN: dry_run !== false; `if (!r.sender_rigtigt) return`
 *      før første sendTilMeta; låsen læses af app_config fail-closed.
 *   4. STRIKS-BODY + BUCKET B: KENDTE_FELTER præcis dry_run · nu · test_event_code ·
 *      ansoegning_id; authenticateServiceRole før createClient; config verify_jwt = true.
 *   5. USER AGENT FOR ALLE (vendt 22/9): ansoegning-gem læser headeren gennem laesUserAgent
 *      (≤ 512) og skriver den gennem sporMedUserAgent i gemAnnoncespor, UDEN fbclid-betingelse;
 *      updaten sker, når der er ENTEN spor ELLER user agent; fail-soft gentagelse med sporet
 *      alene står stadig EFTER fejlen; ingen anden function skriver user_agent på ansoegninger.
 *   6. SPORET FØR SVARET: upsert på meta_haendelser (onConflict event_id) inde i løkken,
 *      før r.sendt/r.fejlede tælles.
 *   7. MIGRATIONERNE: alle tre bogført KØRT i prod — de to første 21/9 15:50 (FØR merge),
 *      cron-migrationen 21/9 16:18 (EFTER merge, job 568 «meta-send», låsen stadig false);
 *      filhovederne rettet, efterhånden som de blev kørt (var «IKKE KØRT» indtil da); kolonnen user_agent text; sporet med
 *      event_id primary key, udfald-CHECK, låsen 'false'::jsonb; cron-minutterne rammer
 *      ingen anden plan (målt over alle cron.schedule + udkastene), kald_edge 60000/300000.
 *   8. ALARMEN: kun rigtig kørsel med fejlede > 0; nøglen bærer datoen (kbhDato); loggen
 *      slås op FØR sendManagedEmail; til driftModtager(); klokke drift.
 *   9. PERSONDATATEKSTEN: Meta-afsnittet står ORDRET — ERSTATTET 22/9 (godkendt af chatten med
 *      Jonas' fulde mandat), fordi den gamle tekst lovede «vi sender aldrig dit navn, din
 *      e-mail, dit telefonnummer» og «kom du ikke fra en annonce, sender vi ingenting». Begge
 *      dele holdt op med at være sandt. «Hvor du kom fra» er ét FORSLAG, der venter på Jonas.
 *      Rækkefølgen er stadig: hvorfra → GA-opsamlingen (gaOpsamling.guard dom 6) → Meta.
 *  10. METAS COOKIER ÉT STED (22/9): én parser i skema.ts (+ spejlet), fladen læser ved mount,
 *      body'en bærer «meta», serveren dømmer formen igen, og værdien røres aldrig.
 *  11. DE TO META-MIGRATIONER (linjen om «sidste kørte i mappen» strammet 22/9 til
 *      ventepladser-reglen som ren dom — se ukoerteFoerKoerte):
 *      begge bogført KØRT i prod 21/9 — trin 1 «… 22:15» (FØR merge),
 *      trin 2 «… 23:20» (før udrulningen; var «IKKE KØRT» indtil da) med præcis ÉN udvidet CHECK — og trin 2
 *      sorterer efter hver eneste kørte migration.
 *  12. ALLE ANSØGERE + FRAVALGET: «ingen_fbclid» findes ikke længere, ANSØGNINGSforespørgslen
 *      filtrerer ikke på fbclid (webinaropslaget gør med rette), og meta_fravalg dømmes FØRST.
 *  13. TRIN 2 — NAVNENE OG DE TO SLAGS: fem arter; Lead/Schedule/Purchase er Metas standarder,
 *      «Kvalificeret» er vores eget navn; CRM-arterne bærer system_generated + event_source
 *      «crm» + lead_event_source og HVERKEN client_user_agent ELLER event_source_url; dommen
 *      kræver user agent og landing af website-arterne alene.
 *  14. TRIN 2 — FBC I TRE LED: URL → _fbc-cookien ordret → webinartilmeldingens klik-id med
 *      TILMELDINGENS eget tidspunkt, bundet af 90 dage. Ét opslag, «nyeste FØR ansøgningen».
 *  15. TRIN 2 — PURCHASE: value i KRONER, currency ét sted, beløbet fra den FØRSTE
 *      indgangsperiode (en fornyelse er ikke et køb), og ingen Purchase uden beløb.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DOM = "supabase/functions/_shared/metaSend.ts";
const AFSENDELSE = "supabase/functions/_shared/metaSendAfsendelse.ts";
const CRON = "supabase/functions/meta-send-cron/index.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const UA = "supabase/functions/_shared/ansoegningUserAgent.ts";
const CONFIG = "supabase/config.toml";
const MIG_UA = "supabase/migrations/20260921233000_ansoegninger_user_agent.sql";
const MIG_SPOR = "supabase/migrations/20260921234000_meta_haendelser.sql";
const MIG_CRON = "supabase/migrations/20260921235500_meta_send_cron.sql";
const MIG_DIR = "supabase/migrations";
const MIG_UDV = "supabase/migrations/20260922040000_ansoegninger_meta_udvidelse.sql";
const MIG_TRIN2 = "supabase/migrations/20260922050000_meta_haendelser_trin2.sql";

/**
 * Migrationsmappen delt i to efter filhovedets FØRSTE linje. Husreglen er, at den, der kører
 * migrationer, scanner mappen efter «-- IKKE KØRT. DEPLOY:» — så en ukørt migration, der
 * sorterer før en kørt, bliver sprunget over (19/9: forsiden nede i tolv timer).
 */
export function migrationsOrden(dir: string): { koert: string[]; ikkeKoert: string[] } {
  const koert: string[] = [], ikkeKoert: string[] = [];
  for (const fil of readdirSync(resolve(ROD, dir)).filter((f) => f.endsWith(".sql")).sort()) {
    const foerste = laes(`${dir}/${fil}`).split("\n")[0] ?? "";
    if (foerste.startsWith("-- IKKE KØRT. DEPLOY:")) ikkeKoert.push(fil);
    else if (/^--\s*KØRT i prod/.test(foerste)) koert.push(fil);
  }
  return { koert, ikkeKoert };
}

/**
 * VENTEPLADSER-REGLEN som en ren dom (tilføjet 22/9, udkast-ewebinar-afmelding).
 *
 * «En migration, der ikke er kørt, må aldrig sortere før en, der ER kørt» — det
 * var dén fejl, der tog forsiden ned i tolv timer 19/9. Svarer de filer, der
 * BRYDER reglen. Begrænset til stykket fra `fra` og frem, fordi 35 ældre filer
 * fejlagtigt bærer «IKKE KØRT» (se dom 11); en dom over hele mappen ville være
 * rød af en grund, der ikke er vores — og et rødt værn, man lærer at se bort
 * fra, er intet værn.
 */
export function ukoerteFoerKoerte(koert: readonly string[], ikkeKoert: readonly string[], fra: string): string[] {
  const k = [...koert].filter((f) => f >= fra).sort();
  const u = [...ikkeKoert].filter((f) => f >= fra).sort();
  const sidste = k[k.length - 1];
  if (sidste === undefined) return [];
  return u.filter((f) => f < sidste);
}
const SKEMA = "src/lib/ansoegning/skema.ts";
const SKEMA_DENO = "supabase/functions/_shared/ansoegningSkema.ts";
const SIDE = "src/pages/Ansoeg.tsx";
const API = "src/lib/ansoegning/api.ts";

/** Alle .ts/.tsx under src og supabase/functions — til «findes det kun ét sted»-dommene. */
function alleFiler(): { sti: string; kilde: string }[] {
  const ud: { sti: string; kilde: string }[] = [];
  const gaa = (rel: string) => {
    for (const e of readdirSync(resolve(ROD, rel), { withFileTypes: true })) {
      const sti = `${rel}/${e.name}`;
      if (e.isDirectory()) gaa(sti);
      else if (/\.tsx?$/.test(e.name)) ud.push({ sti, kilde: laes(sti) });
    }
  };
  gaa("src"); gaa("supabase/functions");
  return ud;
}

export const META_TEKST_ORDRET =
  "Vi fortæller Meta, at der er sket noget — at en ansøgning er påbegyndt, at den er sendt, at vi har sagt ja til en samtale, at der er booket en tid, og at et medlemskab er betalt — så vi kan se, om vores annoncer virker. Ved betalingen fortæller vi også, hvad medlemskabet kostede. Vi sender en krypteret udgave af din e-mail, dit telefonnummer og dit navn, det klik-id og de cookies, Meta selv har sat, hvilken slags browser du brugte, og et id, vi selv har lavet. Klikket kan også være det, du gjorde, da du tilmeldte dig vores webinar. Meta kan ikke se selve oplysningerne, men kan genkende dem, hvis du har en profil hos Meta med samme e-mail eller telefonnummer. Vi sender aldrig dit CVR-nummer eller dine svar. Vil du helst være fri, så skriv til kontakt@theboardroom.dk.";

/** FORSLAGET, der venter på Jonas: «hvor du kom fra» skal skille de tre ting ad. */
export const HVORFRA_TEKST_ORDRET =
  "Hvor du kom fra — for eksempel vores webinar, en annonce, LinkedIn eller direkte — og de mærker, der står i linket, du klikkede på. Vi gemmer altid, hvilken slags browser du brugte. Kom du fra en annonce på Facebook eller Instagram, gemmer vi også det klik-id, Meta selv satte på linket. Har du sagt ja til cookies på theboardroom.dk, gemmer vi desuden de cookies, Meta selv har sat i din browser.";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const noeglenEtSted = (dom: string, afsendelse: string, cron: string): boolean => {
  const d = udenKommentarer(dom), a = udenKommentarer(afsendelse), c = udenKommentarer(cron);
  const env = (k: string) => [...k.matchAll(/Deno\.env\.get\(\s*([^)]+?)\s*\)/g)].map((m) => m[1]);
  return !/\bDeno\b/.test(d) && !/\bfetch\s*\(/.test(d) &&
    env(a).join(",") === "META_SEND_TOKEN_NAVN" && (a.match(/\bfetch\s*\(/g) ?? []).length === 1 &&
    !/\bfetch\s*\(/.test(c) && env(c).every((n) => n === '"SUPABASE_URL"' || n === '"SUPABASE_SERVICE_ROLE_KEY"') &&
    c.includes('from "../_shared/metaSendAfsendelse.ts"') && !c.includes("META_SEND_TOKEN");
};

// ── 2 ──────────────────────────────────────────────────────────────────────
/**
 * UDVIDET 22/9: persondata er ikke længere forbudt i payloaden — det er UHASHET persondata,
 * der er det. Dommen prøver derfor tre ting i stedet for én: at user_data bygges af de
 * hashede felter (og kun får fbc/fbp med, når de findes), at de hashede nøgler kræver et
 * 64-tegns aftryk, og at værnet jager rå e-mail og rå telefon/CVR i HELE objektet. Dertil
 * at cronen aldrig rører klarteksten selv — den rækker rækken videre til dommen og ser aftryk igen.
 * Metas normaliseringsregler læses på den RÅ kilde (udenKommentarer tømmer jo blokken).
 */
export const ingenUhashetPersondata = (dom: string, cron: string): boolean => {
  const d = udenKommentarer(dom), c = udenKommentarer(cron);
  const byg = d.slice(d.indexOf("export function bygPayload("), d.indexOf("export const FORBUDTE_NOEGLER"));
  const citat = (t: string) => dom.includes(t);
  return /user_data: \{\s*\n\s*\.\.\.hashet,\s*\n\s*external_id: \[externalIdAftryk\],\s*\n\s*\.\.\.\(crm \|\| ua === "" \? \{\} : \{ client_user_agent: ua \}\),\s*\n\s*\.\.\.\(fbc !== null \? \{ fbc \} : \{\}\),\s*\n\s*\.\.\.\(fbp !== null \? \{ fbp \} : \{\}\),\s*\n\s*\},/.test(byg) &&
    !/\br\.(email|navn|telefon)\b/.test(byg) &&
    d.includes('export const HASHEDE_NOEGLER = ["em", "ph", "fn", "ln", "country", "external_id"] as const;') &&
    d.includes("export const AFTRYK_FORM = /^[0-9a-f]{64}$/;") &&
    d.includes("ikke et 64-tegns aftryk") && d.includes("rå e-mail") && d.includes("rå telefon/CVR") &&
    // Metas egne regler skal stå i filen, ordret — de er grundlaget for normaliseringen.
    citat("Trim any leading and trailing spaces. Convert all characters to lowercase.") &&
    citat("Remove symbols, letters, and any leading zeros. Phone numbers") &&
    citat("Lowercase only with no punctuation.") &&
    // Efternavnet er SIDSTE ord, ikke resten samlet (Jonas 21/9 22:40): «Jonas Breum Herlev»
    // skal give «herlev», ikke «breumherlev» — et sammenskrevet mellemnavn matcher ingen profil.
    d.includes("return { fn: normaliserNavnedel(ord[0]), ln: ord.length > 1 ? normaliserNavnedel(ord[ord.length - 1]) : null };") &&
    citat("Use the lowercase, 2-letter country codes in ISO 3166-1 alpha-2.") &&
    // cronen: præcis de tolv kolonner, aldrig klarteksten i hånden, hashning før payloaden
    c.includes('const RAEKKE_FELTER = "id, created_at, indsendt_at, fbclid, landing, user_agent, email, navn, telefon, fbp, fbc_cookie, meta_fravalg, company_id";') &&
    !/\b(cvr|ip_hash|udfordring|hjemmeside)\b/.test(c) &&
    // navn og telefon læses ALDRIG i hånden af cronen — kun dommen rører dem. E-mailen er
    // undtaget ÉT sted: den er nøglen til webinartilmeldingen (trin 2, pkt. 17), og den
    // bruges som opslagsnøgle, aldrig som en værdi i payloaden.
    !/\.(navn|telefon)\b/.test(c) &&
    // AFSENDELSESLØKKEN må ikke røre klarteksten overhovedet — der går alt gennem dommen.
    !/\.(email|navn|telefon)\b/.test(c.slice(c.indexOf("for (const p of planer) {"), c.indexOf("if (r.fejlede > 0) await skrivAlarm("))) &&
    c.includes("const hashet = await hashBrugerdata(normaliserBrugerdata(p.raekke), sha256Hex);") &&
    foer(c, "const hashet = await hashBrugerdata(", "const payload = bygPayload(") &&
    foer(c, "const forbudte = findForbudteNoegler(payload);", "await sendTilMeta(payload, a.testEventCode)") &&
    /if \(forbudte\.length > 0\) \{[\s\S]*?continue;\n\s*\}/.test(c);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const toerkoerselOgLaas = (cron: string, dom: string): boolean => {
  const c = udenKommentarer(cron), d = udenKommentarer(dom);
  const koer = c.slice(c.indexOf("export async function koerMetaSend("), c.indexOf("Deno.serve("));
  return c.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    foer(koer, "if (!r.sender_rigtigt) return { status: 200, resultat: r };", "await sendTilMeta(") &&
    (c.match(/await sendTilMeta\(/g) ?? []).length === 1 &&
    /async function hentLaas\([\s\S]*?from\("app_config"\)[\s\S]*?\.eq\("config_key", META_SEND_LAAS_NOEGLE\)[\s\S]*?return false; \}/.test(c) &&
    d.includes('export const META_SEND_LAAS_NOEGLE = "meta_send_aktiv";') &&
    d.includes('return configValue === true || configValue === "true";') &&
    d.includes("if (a.dryRun) return false;\n  return a.laasAktiv || a.testEventCode !== null;");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const striksOgBucketB = (cron: string, config: string): boolean => {
  const c = udenKommentarer(cron);
  const blok = config.slice(config.indexOf("[functions.meta-send-cron]"));
  return c.includes('export const KENDTE_FELTER = ["dry_run", "nu", "test_event_code", "ansoegning_id"] as const;') &&
    c.includes("ukendteFelter(raaBody, KENDTE_FELTER)") && c.includes("ukendteFelterBesked(ukendte, KENDTE_FELTER)") &&
    foer(c.slice(c.indexOf("Deno.serve(")), "authenticateServiceRole(req)", "createClient(") &&
    /^\s*\[functions\.meta-send-cron\]\s*\n\s*verify_jwt = true/m.test(blok);
};

// ── 5 ──────────────────────────────────────────────────────────────────────
/**
 * VENDT 22/9: før hed dommen «user agent KUN med fbclid». Nu gemmes den for ALLE, fordi alle
 * ansøgninger sendes, og Meta kræver client_user_agent for website-hændelser. Dommen låser
 * det nye: ingen fbclid-betingelse nogen steder i ansoegningUserAgent.ts, feltet med i
 * updaten når og kun når der ER en user agent, og updaten skrevet, så snart der er ENTEN
 * spor ELLER user agent — ellers ville webinar-ansøgeren (ingen utm, intet klik-id) miste sin.
 * Den fail-softe gentagelse med sporet alene står stadig EFTER fejlen.
 */
export const userAgentForAlle = (gem: string, ua: string, filer: readonly { sti: string; kilde: string }[]): boolean => {
  const g = udenKommentarer(gem), u = udenKommentarer(ua);
  const andre = filer.filter((f) => f.sti !== GEM && !f.sti.includes("_shared/metaSend") && !f.sti.includes("meta-send-cron"))
    .filter((f) => /from\("ansoegninger"\)[\s\S]{0,300}user_agent/.test(udenKommentarer(f.kilde)) && /\.(update|insert|upsert)\(/.test(udenKommentarer(f.kilde)) && /user_agent:/.test(udenKommentarer(f.kilde)));
  return u.includes('req.headers.get("user-agent") ?? "").trim().slice(0, USER_AGENT_MAKS)') && u.includes("export const USER_AGENT_MAKS = 512;") &&
    u.includes("return userAgent === null ? { ...spor } : { ...spor, user_agent: userAgent };") &&
    !/fbclid/.test(u) &&
    g.includes('import { laesUserAgent, sporMedUserAgent } from "../_shared/ansoegningUserAgent.ts";') &&
    g.includes(".update(sporMedUserAgent(spor, userAgent)).eq(\"id\", id)") &&
    g.includes("if (!harAnnoncespor(spor) && userAgent === null) return;") &&
    g.includes('const { error: fejlUden } = await admin.from("ansoegninger").update({ ...spor }).eq("id", id);') &&
    foer(g, "if (!harAnnoncespor(spor) && userAgent === null) return;", ".update(sporMedUserAgent(spor, userAgent)).eq(\"id\", id)") &&
    foer(g, ".update(sporMedUserAgent(spor, userAgent)).eq(\"id\", id)", "if (!error) return;") &&
    foer(g, "if (!error) return;", 'update({ ...spor }).eq("id", id)') &&
    g.includes("await gemAnnoncespor(adminClient, data.id, annoncesporAf(body?.annoncespor), laesUserAgent(req));") &&
    !/\.insert\(\{[^}]*user_agent/.test(g) && !/user_agent/.test(g) &&
    andre.length === 0;
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const sporetFoerSvaret = (cron: string): boolean => {
  const c = udenKommentarer(cron);
  const loekke = c.slice(c.indexOf("for (const p of planer) {\n    if (Date.now()"), c.indexOf("if (r.fejlede > 0) await skrivAlarm("));
  return loekke.includes('from("meta_haendelser").upsert({') && loekke.includes('{ onConflict: "event_id" }') &&
    foer(loekke, "await sendTilMeta(", 'from("meta_haendelser").upsert({') &&
    foer(loekke, '{ onConflict: "event_id" }', 'if (svar.udfald === "sendt") r.sendt++;') &&
    loekke.includes("test_event_code: a.testEventCode") && !/payload:/.test(loekke);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export function minutterI(udtryk: string): number[] {
  const felt = udtryk.trim().split(/\s+/)[0];
  const ud = new Set<number>();
  for (const del of felt.split(",")) {
    const m = del.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`minutterI: ukendt form «${del}»`);
    const [, basis, trin] = m;
    let fra = 0, til = 59;
    if (basis !== "*") { const [a, b] = basis.split("-").map(Number); fra = a; til = b ?? (trin ? 59 : a); }
    const step = trin ? Number(trin) : 1;
    for (let i = fra; i <= til; i += step) ud.add(i);
  }
  return [...ud].sort((a, b) => a - b);
}
export function cronUdtryk(dir: string): { fil: string; job: string; udtryk: string }[] {
  const ud: { fil: string; job: string; udtryk: string }[] = [];
  for (const fil of readdirSync(resolve(ROD, dir)).filter((f) => f.endsWith(".sql")).sort()) {
    const t = udenSql(laes(`${dir}/${fil}`));
    for (const m of t.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi)) ud.push({ fil, job: m[1], udtryk: m[2] });
  }
  return ud;
}
/** Planer (fem felter), der rammer minuttet på NOGET tidspunkt — plus udkastenes jobs, hvis de ikke står i mappen endnu. */
export function kolliderer(minut: number, planer: readonly { job: string; udtryk: string }[], egetJob: string): string[] {
  const kendte = [...planer];
  for (const [job, udtryk] of [["klokke-mail", "4-59/15 * * * *"], ["klaviyo-profil", "17 * * * *"], ["webinar-delinger-opbevaring", "52 4 * * *"]] as const) {
    if (!kendte.some((p) => p.job === job)) kendte.push({ job: `${job} (udkast)`, udtryk });
  }
  return kendte.filter((p) => p.job !== egetJob && p.udtryk.trim().split(/\s+/).length === 5).filter((p) => minutterI(p.udtryk).includes(minut)).map((p) => `${p.job} (${p.udtryk})`);
}
export const migrationerneErRigtige = (ua: string, spor: string, cron: string): boolean => {
  const u = udenSql(ua), s = udenSql(spor), c = udenSql(cron);
  return ua.startsWith("-- KØRT i prod — 21/9-2026 kl. 15:50") && spor.startsWith("-- KØRT i prod — 21/9-2026 kl. 15:50") &&
    cron.startsWith("-- KØRT i prod — 21/9-2026 kl. 16:18") &&
    /ALTER TABLE public\.ansoegninger\s+ADD COLUMN IF NOT EXISTS user_agent text NULL;/.test(u) &&
    s.includes("create table if not exists public.meta_haendelser") && /event_id\s+text primary key/.test(s) &&
    /check \(udfald in \('sendt', 'fejl', 'timeout', 'ugyldig', 'ingen_noegle'\)\)/.test(s) &&
    s.includes("values ('meta_send_aktiv', 'false'::jsonb,") && s.includes("enable row level security") && !/security definer/i.test(s) && !/to anon/i.test(s) &&
    /cron\.schedule\(\s*'meta-send',\s*'3,8,13,18,23,28,38,43,48,53,58 \* \* \* \*'/.test(c) &&
    /kald_edge\(\s*'meta-send-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*300000/.test(c) &&
    cron.includes("cron.unschedule('meta-send')") && spor.includes("ingen jurist; låsen er bevisets, ikke juraens");
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const alarmenErRigtig = (cron: string, dom: string): boolean => {
  const c = udenKommentarer(cron), d = udenKommentarer(dom);
  const koer = c.slice(c.indexOf("export async function koerMetaSend("), c.indexOf("Deno.serve("));
  const alarm = c.slice(c.indexOf("async function skrivAlarm("), c.indexOf("export async function koerMetaSend("));
  return koer.includes("if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);") &&
    foer(koer, "if (!r.sender_rigtigt) return", "await skrivAlarm(") && (c.match(/skrivAlarm\(/g) ?? []).length === 2 &&
    d.includes("return `${ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;") &&
    foer(alarm, 'from("email_send_log")', "await sendManagedEmail({") && alarm.includes("to: driftModtager(),") &&
    alarm.includes('r.alarm = "allerede_sendt_i_dag";') && alarm.includes("idempotencyKey: noegle,") &&
    alarm.includes("await skrivRaadgiverBesked(admin, { type: ALARM_KLOKKE_TYPE,") && alarm.includes('reference_type: "meta_haendelser"');
};

// ── 10 ─────────────────────────────────────────────────────────────────────
/**
 * METAS COOKIER LÆSES ÉT STED (22/9), som GA's: én parser i skema.ts (spejlet i
 * _shared/ansoegningSkema.ts, paritetstesten holder dem ens), fladen kalder den ved mount,
 * body'en bærer «meta», serveren dømmer formen IGEN, og værdien røres ALDRIG — Metas ord er
 * «do not apply any modifications before using, such as lower or upper case».
 */
export const metaCookierneEtSted = (skema: string, gem: string, side: string, api: string, filer: readonly { sti: string; kilde: string }[]): boolean => {
  const s = udenKommentarer(skema), g = udenKommentarer(gem), si = udenKommentarer(side), a = udenKommentarer(api);
  const blok = s.slice(s.indexOf("export const META_FBP_COOKIE"), s.indexOf("export function harMetaCookies"));
  // Prøver og værn er undtaget: de NÆVNER cookienavnene for at holde dem fast — det er
  // driftskoden, der ikke må have sin egen parser. Uden undtagelsen ville dommen falde over
  // sin egen mutationstest, og så var den ikke en dom om koden længere.
  const andre = filer
    .filter((f) => f.sti !== SKEMA && f.sti !== SKEMA_DENO && !/\.test\.tsx?$|__tests__/.test(f.sti))
    // Både «_fbp» som helt navn og «_fbp=» midt i en håndparsning fanges.
    .filter((f) => /["'`]_fb[pc][="'`]/.test(udenKommentarer(f.kilde)));
  return s.includes('export const META_FBP_COOKIE = "_fbp";') && s.includes('export const META_FBC_COOKIE = "_fbc";') &&
    s.includes("fbp: fbp !== null && META_FBP_FORM.test(fbp) ? fbp : null,") &&
    s.includes("fbp: META_FBP_FORM.test(fbp) ? fbp : null,") &&
    s.includes("fbc: META_FBC_FORM.test(fbc) ? fbc : null,") &&
    !/toLowerCase\(\)|toUpperCase\(\)|normalize\(/.test(blok) &&
    si.includes("const metaCookies = useRef(laesMetaCookies(") && si.includes("meta: metaCookies.current,") &&
    a.includes("meta: MetaCookies;") &&
    g.includes('"annoncespor", "ga", "meta", "svar"') &&
    g.includes("await gemMetaCookies(adminClient, data.id, metaCookiesAf(body?.meta));") &&
    g.includes('.update({ fbp: meta.fbp, fbc_cookie: meta.fbc }).eq("id", id)') &&
    foer(g, "await gemGa(adminClient", "await gemMetaCookies(adminClient") &&
    andre.length === 0;
};

// ── 11 ─────────────────────────────────────────────────────────────────────
/** Migrationen: KØRT-hovedet først (ordret — kørt i prod 21/9 22:15), præcis de tre kolonner med kommentarer, intet drop. */
export const udvidelsesMigrationen = (sql: string): boolean => {
  const s = udenSql(sql);
  return sql.startsWith("-- KØRT i prod — 21/9-2026 kl. 22:15") &&
    /add column if not exists fbp\s+text\s+null,/.test(s) &&
    /add column if not exists fbc_cookie\s+text\s+null,/.test(s) &&
    /add column if not exists meta_fravalg boolean not null default false;/.test(s) &&
    s.includes("comment on column public.ansoegninger.fbp is") &&
    s.includes("comment on column public.ansoegninger.fbc_cookie is") &&
    s.includes("comment on column public.ansoegninger.meta_fravalg is") &&
    !/drop column/.test(s) && (s.match(/add column if not exists/g) ?? []).length === 3;
};

/** Trin 2's migration: KØRT-hovedet først (ordret — kørt i prod 21/9 23:20), præcis ÉN udvidet CHECK, ingen ny tabel, intet drop af data. */
export const trin2Migrationen = (sql: string): boolean => {
  const t = udenSql(sql);
  return sql.startsWith("-- KØRT i prod — 21/9-2026 kl. 23:20") &&
    /alter table public\.meta_haendelser drop constraint if exists meta_haendelser_art_check;/.test(t) &&
    /check \(art in \('started', 'submitted', 'kvalificeret', 'booket', 'purchase'\)\)/.test(t) &&
    t.includes("comment on column public.meta_haendelser.art is") &&
    // Den MINDSTE udvidelse: ingen ny tabel, ingen ny kolonne, intet slettet.
    !/create table/i.test(t) && !/add column/i.test(t) && !/drop table/i.test(t) && !/delete from/i.test(t) &&
    !/drop constraint meta_haendelser_event_id_form/.test(t) &&
    (t.match(/add constraint/g) ?? []).length === 1;
};

// ── 12 ─────────────────────────────────────────────────────────────────────
/**
 * ALLE ANSØGERE + FRAVALGET (pkt. 11 og 14): «ingen_fbclid» findes ikke længere som grund,
 * kandidatforespørgslen filtrerer ikke på fbclid, og fravalget dømmes FØRST — før user agent,
 * før landing, før alt. En ansøger, der har bedt sig fri, prøves ikke af på noget andet.
 */
export const alleAnsoegereOgFravalg = (dom: string, cron: string): boolean => {
  const d = udenKommentarer(dom), c = udenKommentarer(cron);
  const doemBlok = d.slice(d.indexOf("export function doem("), d.indexOf("export interface MetaPayload"));
  const grunde = d.slice(d.indexOf("export const SPRUNGET_GRUNDE = ["), d.indexOf("] as const;", d.indexOf("export const SPRUNGET_GRUNDE = [")));
  return /"fravalgt",\s*"ingen_user_agent",\s*"ingen_landing",\s*"ikke_indsendt",/.test(grunde) &&
    /"ikke_kvalificeret",\s*"ikke_booket",\s*"ikke_betalt",\s*"ingen_beloeb",/.test(grunde) &&
    /"ingen_tidspunkt",\s*"for_gammel",/.test(grunde) &&
    !/ingen_fbclid/.test(d) && !/ingen_fbclid/.test(c) &&
    doemBlok.includes('if (r.meta_fravalg === true) return { ok: false, grund: "fravalgt" };') &&
    foer(doemBlok, 'grund: "fravalgt"', 'grund: "ingen_user_agent"') &&
    // ANSØGNINGSFORESPØRGSLEN må ikke filtrere på klik-id. Bemærk: webinaropslaget (trin 2)
    // filtrerer med rette på fbclid — det er dér, klik-id'et ER pointen — så forbuddet
    // gælder kun de forespørgsler, der henter ansøgninger.
    !/from\("ansoegninger"\)[\s\S]{0,400}\.not\("fbclid"/.test(c) &&
    /from\("webinar_tilmeldinger"\)[\s\S]{0,300}\.not\("fbclid", "is", null\)/.test(c) &&
    c.includes("fravalgt: 0,");
};

// ── 13 ─────────────────────────────────────────────────────────────────────
/**
 * TRIN 2 — NAVNENE OG DE TO SLAGS. Lead, Schedule og Purchase er Metas standardnavne;
 * «Kvalificeret» er vores eget, så den aldrig kan kollidere med eWebinars egen pixel på
 * samme datasæt. Og de tre CRM-arter SKAL bære action_source «system_generated» +
 * custom_data event_source «crm» og lead_event_source — og HVERKEN client_user_agent
 * ELLER event_source_url, som Meta kun kræver for website-hændelser.
 */
export const arterneOgFormen = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  const byg = d.slice(d.indexOf("export function bygPayload("), d.indexOf("export function oereTilKroner"));
  return d.includes('export const ARTER = ["started", "submitted", "kvalificeret", "booket", "purchase"] as const;') &&
    d.includes('export const ARTER_CRM = ["kvalificeret", "booket", "purchase"] as const;') &&
    d.includes('kvalificeret: { event_name: "Kvalificeret", content_name: "application_qualified" },') &&
    d.includes('booket: { event_name: "Schedule", content_name: "application_scheduled" },') &&
    d.includes('purchase: { event_name: "Purchase", content_name: "membership_purchase" },') &&
    d.includes('export const EVENT_SOURCE_CRM = "crm";') &&
    d.includes('export const LEAD_EVENT_SOURCE = "The Boardroom";') &&
    // Payloaden skelner, og gør det på erCrmArt — ikke på en liste, der kan skride fra ARTER_CRM.
    byg.includes("const crm = erCrmArt(art);") &&
    byg.includes('action_source: crm ? "system_generated" : "website",') &&
    byg.includes("...(crm ? {} : { event_source_url: (r.landing ?? \"\").trim() }),") &&
    byg.includes('...(crm ? { event_source: EVENT_SOURCE_CRM, lead_event_source: LEAD_EVENT_SOURCE } : {}),') &&
    /\.\.\.\(crm \|\| ua === "" \? \{\} : \{ client_user_agent: ua \}\),/.test(byg) &&
    // Dommen må kun kræve user agent og landing af website-hændelserne.
    /if \(!erCrmArt\(art\)\) \{[\s\S]{0,260}grund: "ingen_landing"[\s\S]{0,20}\}/.test(d);
};

// ── 14 ─────────────────────────────────────────────────────────────────────
/**
 * TRIN 2 — FBC I TRE LED, i den rækkefølge: URL'ens klik-id, så _fbc-cookien ORDRET, så
 * webinartilmeldingens klik-id. Webinarleddet bærer TILMELDINGENS tidspunkt (Metas regel om
 * «when you first observed or received this fbclid value») og er bundet af 90 dage — den
 * eneste levetid, Meta dokumenterer. Cronen henter det ét sted og vælger «nyeste før».
 */
export const fbcITreLed = (dom: string, cron: string): boolean => {
  const d = udenKommentarer(dom), c = udenKommentarer(cron);
  const byg = d.slice(d.indexOf("export function bygFbcFelt("), d.indexOf("/** Hvilket led fbc"));
  const kilde = d.slice(d.indexOf("export function fbcKilde("), d.indexOf("export function bygFbpFelt("));
  return d.includes("export const WEBINAR_FBCLID_MAKS_DAGE = 90;") &&
    // rækkefølgen i koden ER rækkefølgen i dommen
    foer(byg, "if (klik !== \"\") return bygFbc(klik, setTid);", "if (FBC_FORM.test(c)) return c;") &&
    foer(byg, "if (FBC_FORM.test(c)) return c;", "return webinarFbc(r);") &&
    foer(kilde, '"klik_id"', '"cookie"') && foer(kilde, '"cookie"', '"webinar"') &&
    // webinarleddet bruger tilmeldingens EGET tidspunkt, ikke ansøgningens
    d.includes("const set = somTid(r.webinar_fbclid_at);") &&
    d.includes("return webinarKlikIdGaelder(set, somTid(r.created_at)) ? bygFbc(klik, set as Date) : null;") &&
    // og 90-dagesgrænsen gælder BEGGE veje: ikke ældre end 90 dage, og ikke efter ansøgningen
    /const alder = ansoegningTid\.getTime\(\) - webinarTid\.getTime\(\);\s*\n\s*return alder >= 0 && alder <= WEBINAR_FBCLID_MAKS_DAGE \* 86_400_000;/.test(d) &&
    // cronen: ét opslag, koblet på lower(email), og «nyeste FØR ansøgningen» vælges i koden
    c.includes('from("webinar_tilmeldinger")') && (c.match(/from\("webinar_tilmeldinger"\)/g) ?? []).length === 1 &&
    c.includes("function nyesteWebinarFoer(") && c.includes("if (!Number.isFinite(t) || (Number.isFinite(graense) && t > graense)) continue;") &&
    /\(k\.email \?\? ""\)\.trim\(\)\.toLowerCase\(\)/.test(c);
};

// ── 15 ─────────────────────────────────────────────────────────────────────
/**
 * TRIN 2 — PURCHASE'ENS BELØB. Metas krav er «Required: currency and value». value er
 * KRONER (Meta vil have hovedenheden), currency står ét sted, og kilden er den FØRSTE
 * indgangsperiode — en fornyelse er ikke et køb. Dommen nægter en Purchase uden beløb.
 */
export const purchaseBeloebet = (dom: string, cron: string): boolean => {
  const d = udenKommentarer(dom), c = udenKommentarer(cron);
  const byg = d.slice(d.indexOf("export function bygPayload("), d.indexOf("export function oereTilKroner"));
  return d.includes('export const META_VALUTA = "DKK";') &&
    byg.includes('...(art === "purchase" ? { value: oereTilKroner(r.purchase_beloeb_oere ?? 0), currency: META_VALUTA } : {}),') &&
    d.includes("return Math.round(oere) / 100;") &&
    // ingen Purchase uden beløb — Meta afviser den, og et 0-køb er ikke et køb
    d.includes('if (art === "purchase" && !(typeof r.purchase_beloeb_oere === "number" && r.purchase_beloeb_oere > 0)) {') &&
    d.includes('return { ok: false, grund: "ingen_beloeb" };') &&
    // kilden: FØRSTE række med art «indgang», beløbet fra samme række
    c.includes('const PERIODE_ART_INDGANG = "indgang";') &&
    /from\("company_perioder"\)\.select\("company_id, created_at, beloeb_oere"\)[\s\S]{0,200}\.eq\("art", PERIODE_ART_INDGANG\)[\s\S]{0,120}ascending: true/.test(c) &&
    c.includes("if (!ud.has(r.company_id)) ud.set(r.company_id, { at: r.created_at, oere: r.beloeb_oere });") &&
    !/fornyelse/.test(c);
};

describe("metaSend.guard — Metas Conversions API fra platformen", () => {
  const filer = alleFiler().filter((f) => f.sti.startsWith("supabase/functions/"));
  it("1. nøglen læses ét sted (META_SEND_TOKEN i afsendelsen); dommen er Deno-fri; cronen kalder aldrig fetch", () => expect(noeglenEtSted(laes(DOM), laes(AFSENDELSE), laes(CRON))).toBe(true));
  it("2. ingen UHASHET persondata: user_data af hashet + external_id + client_user_agent (fbc/fbp kun når de findes); 64-hex krævet; rå værdier jaget; cronen rører aldrig klarteksten", () => expect(ingenUhashetPersondata(laes(DOM), laes(CRON))).toBe(true));
  it("3. tørkørsel er standard; låsen (app_config, fail-closed) eller en testkode åbner kun med dry_run: false", () => expect(toerkoerselOgLaas(laes(CRON), laes(DOM))).toBe(true));
  it("4. STRIKS-body og Bucket B med verify_jwt = true", () => expect(striksOgBucketB(laes(CRON), laes(CONFIG))).toBe(true));
  it("5. user agent gemmes for ALLE i den fail-softe update, ≤ 512 — og af ingen anden function", () => expect(userAgentForAlle(laes(GEM), laes(UA), filer)).toBe(true));
  it("6. sporet skrives (upsert på event_id) efter hvert kald, før tællingen — uden payloaden", () => expect(sporetFoerSvaret(laes(CRON))).toBe(true));
  it("7. migrationerne: alle tre bogført KØRT i prod (15:50 × 2, cron 16:18), kolonnen, sporet + låsen false, cron-minutterne uden kollision", () => {
    expect(migrationerneErRigtige(laes(MIG_UA), laes(MIG_SPOR), laes(MIG_CRON))).toBe(true);
    const planer = cronUdtryk(MIG_DIR);
    for (const m of [3, 8, 13, 18, 23, 28, 38, 43, 48, 53, 58]) expect(`${m}: ${kolliderer(m, planer, "meta-send").join(", ")}`).toBe(`${m}: `);
    expect(kolliderer(33, planer, "meta-send").length).toBeGreaterThan(0); // derfor er :33 udeladt
    expect(kolliderer(4, planer, "meta-send").some((s) => s.includes("4-59/15"))).toBe(true);
  });
  it("8. alarmen: kun rigtig kørsel med fejlede > 0; én pr. døgn; loggen først; driftModtager; drift-klokke", () => expect(alarmenErRigtig(laes(CRON), laes(DOM))).toBe(true));
  it("9. persondatateksten: Meta-afsnittet ORDRET (godkendt 21/9 med Jonas' mandat) og de tre ting skilt ad i «hvor du kom fra»", () => {
    const gemmer = PERSONDATA_AFSNIT.find((a) => a.titel === "Hvad vi gemmer")!.afsnit;
    expect(gemmer).toContain(META_TEKST_ORDRET);
    expect(gemmer).toContain(HVORFRA_TEKST_ORDRET);
    // Rækkefølgen: «hvor du kom fra» → GA-opsamlingen (gaOpsamling.guard dom 6) → Meta.
    const hvorfra = gemmer.indexOf(HVORFRA_TEKST_ORDRET);
    expect(gemmer[hvorfra + 1]).toContain("Google Analytics");
    expect(gemmer.indexOf(META_TEKST_ORDRET)).toBe(hvorfra + 2);
    // Teksten skal sige det, koden GØR — og ikke mere.
    expect(META_TEKST_ORDRET).toContain("en krypteret udgave af din e-mail, dit telefonnummer og dit navn");
    // TRIN 2: teksten skal nævne de tre nye hændelser, beløbet og webinar-klikket —
    // ellers lover den færre ting, end koden sender.
    expect(META_TEKST_ORDRET).toContain("at vi har sagt ja til en samtale, at der er booket en tid, og at et medlemskab er betalt");
    expect(META_TEKST_ORDRET).toContain("Ved betalingen fortæller vi også, hvad medlemskabet kostede.");
    expect(META_TEKST_ORDRET).toContain("Klikket kan også være det, du gjorde, da du tilmeldte dig vores webinar.");
    expect(META_TEKST_ORDRET).toContain("de cookies, Meta selv har sat");
    expect(META_TEKST_ORDRET).toContain("Vi sender aldrig dit CVR-nummer eller dine svar.");
    expect(META_TEKST_ORDRET).toContain("Vil du helst være fri, så skriv til kontakt@theboardroom.dk.");
    // Det gamle løfte er væk: vi sender nu OGSÅ når ansøgeren ikke kom fra en annonce.
    expect(META_TEKST_ORDRET).not.toContain("Kom du ikke fra en annonce");
    expect(META_TEKST_ORDRET).not.toContain("Vi sender aldrig dit navn");
    // Browseren gemmes for alle; cookierne kun med samtykke; klik-id'et kun fra en annonce.
    expect(HVORFRA_TEKST_ORDRET).toContain("Vi gemmer altid, hvilken slags browser du brugte.");
    expect(HVORFRA_TEKST_ORDRET).toContain("Har du sagt ja til cookies på theboardroom.dk, gemmer vi desuden de cookies, Meta selv har sat i din browser.");
    expect(HVORFRA_TEKST_ORDRET.startsWith("Hvor du kom fra")).toBe(true); // gaOpsamling.guard dom 6
  });
  it("10. Metas cookier læses ét sted, sendes som «meta», dømmes igen serverside og røres aldrig", () => {
    expect(metaCookierneEtSted(laes(SKEMA), laes(GEM), laes(SIDE), laes(API), alleFiler())).toBe(true);
  });
  it("11. begge meta-migrationer bogført KØRT — og trin 2 er den sidste kørte i mappen", () => {
    // Begge ER nu kørt i prod: trin 1 21/9 22:15 (FØR merge), trin 2 21/9 23:20 (før
    // udrulningen af meta-send-cron). Begge domme kræver derfor KØRT-hovedet ordret.
    expect(udvidelsesMigrationen(laes(MIG_UDV))).toBe(true);
    expect(trin2Migrationen(laes(MIG_TRIN2))).toBe(true);
    // Reglen, der erstattede «min migration er sidst i mappen»: en migration, der ikke er
    // kørt, må aldrig sortere før en, der ER kørt — det var dén fejl, der tog forsiden ned
    // i tolv timer 19/9. Efter bogføringen af trin 2 har vi INGEN ukørte filer tilbage, og
    // dommen vender derfor den anden vej: ingen af vores to må stå på ikke-kørt-listen, og
    // trin 2 skal være den sidste kørte i hele mappen.
    //
    // DOMMEN GÆLDER KUN VORES EGNE FILER, med vilje. Målt 22/9: 35 ældre migrationer bærer
    // stadig «IKKE KØRT» i filhovedet, selv om de er kørt i prod (samme modsigelse som
    // recon-meta-kvalificeret-medlem-webinar.md §0 fandt). En dom over hele mappen ville
    // derfor være rød af en grund, der ikke er vores — og et rødt værn, man lærer at se
    // bort fra, er intet værn. Oprydningen står i README'en som et fund.
    const { koert, ikkeKoert } = migrationsOrden(MIG_DIR);
    const vores = ["20260922040000_ansoegninger_meta_udvidelse.sql", "20260922050000_meta_haendelser_trin2.sql"];
    for (const f of vores) expect(koert).toContain(f);
    const stadigUkoert = vores.filter((f) => ikkeKoert.includes(f));
    expect(`vores ukørte: ${stadigUkoert.join(", ")}`).toBe("vores ukørte: ");
    // STRAMMET 22/9 kl. 13:26 (udkast-ewebinar-afmelding). Linjen var:
    //   expect(koert[koert.length - 1]).toBe("20260922050000_meta_haendelser_trin2.sql")
    // — sand, så længe trin 2 var den nyeste migration OVERHOVEDET. Samme dag blev
    // 20260922060000_klaviyo_afmeldinger.sql kørt i prod (13:26, FØR merge), og den
    // sorterer efter. Dommen var altså en DATERET IAGTTAGELSE, ikke invarianten.
    // Invarianten står i afsnittet ovenfor og er nu skrevet ud som en ren dom:
    // ingen UKØRT fil må sortere før den sidst kørte — på stykket fra vores to og frem.
    expect(ukoerteFoerKoerte(koert, ikkeKoert, vores[0])).toEqual([]);
    // Og trin 2 er stadig den sidste kørte TIL OG MED sit eget tidsstempel — den
    // oprindelige linjes bid, bevaret for alt, der ligger før den.
    const tilOgMedTrin2 = koert.filter((f) => f <= vores[1]);
    expect(tilOgMedTrin2[tilOgMedTrin2.length - 1]).toBe("20260922050000_meta_haendelser_trin2.sql");
    // Og trin 2 skal komme efter trin 1 — den udvider jo den tabel, trin 1 ikke rører.
    expect(vores[1] > vores[0]).toBe(true);
  });
  it("12. alle ansøgere (ingen fbclid-filtrering, «ingen_fbclid» findes ikke) og fravalget dømmes FØRST", () => {
    expect(alleAnsoegereOgFravalg(laes(DOM), laes(CRON))).toBe(true);
  });
  it("13. trin 2: de fem arter, Metas standardnavne, vores eget «Kvalificeret» — og CRM-formen uden user agent og url", () => {
    expect(arterneOgFormen(laes(DOM))).toBe(true);
  });
  it("14. trin 2: fbc i tre led (URL → cookie → webinar), tilmeldingens eget tidspunkt, 90-dagesgrænsen, ét opslag", () => {
    expect(fbcITreLed(laes(DOM), laes(CRON))).toBe(true);
  });
  it("15. trin 2: Purchase bærer value i kroner og currency ét sted; beløbet er FØRSTE indgangsperiode; ingen Purchase uden beløb", () => {
    expect(purchaseBeloebet(laes(DOM), laes(CRON))).toBe(true);
  });
});

describe("metaSend.guard — dommene fanger fejlen på en kopi", () => {
  const dom = laes(DOM), afs = laes(AFSENDELSE), cron = laes(CRON), gem = laes(GEM);
  const filerF = alleFiler().filter((f) => f.sti.startsWith("supabase/functions/"));
  it("1. tokenet læst i cronen, eller et fetch i dommen, fælder dom 1", () => {
    expect(noeglenEtSted(dom, afs, cron + '\nconst t = Deno.env.get("META_SEND_TOKEN");\n')).toBe(false);
    expect(noeglenEtSted(dom + "\nconst r = fetch('https://x');\n", afs, cron)).toBe(false);
    expect(noeglenEtSted(dom, afs.replace("Deno.env.get(META_SEND_TOKEN_NAVN)", 'Deno.env.get("META_CAPI_TOKEN")'), cron)).toBe(false);
  });
  it("2. et uhashet felt, en glemt hashning, en rå kolonne læst i hånden, eller værnet gjort tandløst, fælder dom 2", () => {
    // Præcis den fejl, reglen findes for: em sat til den RÅ værdi i stedet for aftrykket.
    expect(ingenUhashetPersondata(dom.replace("      ...hashet,\n", "      ...hashet,\n      em: [r.email ?? \"\"],\n"), cron)).toBe(false);
    // Kravet om 64 hex fjernet — så kunne en tom streng slippe igennem.
    expect(ingenUhashetPersondata(dom.split("export const HASHEDE_NOEGLER").join("export const HASHEDE_NOEGLER_UBRUGT"), cron)).toBe(false);
    // Jagten på rå værdier fjernet.
    expect(ingenUhashetPersondata(dom.split("rå telefon/CVR").join("noget andet"), cron)).toBe(false);
    // Cronen læser klarteksten selv i stedet for at række rækken videre.
    expect(ingenUhashetPersondata(dom, cron.replace("const hashet = await hashBrugerdata(normaliserBrugerdata(p.raekke), sha256Hex);", "const hashet = { em: [p.raekke.email ?? \"\"] };"))).toBe(false);
    // En kolonne mere i select'en.
    expect(ingenUhashetPersondata(dom, cron.replace('landing, user_agent, email, navn, telefon', 'landing, user_agent, email, navn, telefon, cvr'))).toBe(false);
    // TRIN 2: klarteksten læst i AFSENDELSESLØKKEN fælder dommen, selv om opslaget uden for
    // løkken må bruge e-mailen som nøgle.
    expect(ingenUhashetPersondata(dom, cron.replace("const hashet = await hashBrugerdata(normaliserBrugerdata(p.raekke), sha256Hex);", "const hashet = await hashBrugerdata(normaliserBrugerdata(p.raekke), sha256Hex);\n    console.log(p.raekke.email);"))).toBe(false);
    // Værnet kørt, men uden virkning.
    expect(ingenUhashetPersondata(dom, cron.replace("const forbudte = findForbudteNoegler(payload);", "const forbudte: string[] = [];"))).toBe(false);
    // Metas normaliseringsregel fjernet fra filhovedet — grundlaget må ikke kunne forsvinde.
    expect(ingenUhashetPersondata(dom.replace("Trim any leading and trailing spaces. Convert all characters to lowercase.", "…"), cron)).toBe(false);
    // Efternavnet tilbage til «resten samlet» — den regel, der blev afgjort væk 21/9 22:40.
    expect(ingenUhashetPersondata(dom.replace("normaliserNavnedel(ord[ord.length - 1])", 'normaliserNavnedel(ord.slice(1).join(" "))'), cron)).toBe(false);
  });
  it("3. afsendelse uden låsen/testkoden, eller dry_run vendt, fælder dom 3", () => {
    expect(toerkoerselOgLaas(cron.replace("if (!r.sender_rigtigt) return { status: 200, resultat: r };", "if (a.toerKoersel) return { status: 200, resultat: r };"), dom)).toBe(false);
    expect(toerkoerselOgLaas(cron.replace("raaBody?.dry_run !== false", "raaBody?.dry_run === true"), dom)).toBe(false);
    expect(toerkoerselOgLaas(cron, dom.replace("if (a.dryRun) return false;\n  return a.laasAktiv || a.testEventCode !== null;", "return true;"))).toBe(false);
  });
  it("4. et felt mere, eller verify_jwt vendt, fælder dom 4", () => {
    expect(striksOgBucketB(cron.replace('["dry_run", "nu", "test_event_code", "ansoegning_id"]', '["dry_run", "nu", "test_event_code", "ansoegning_id", "email"]'), laes(CONFIG))).toBe(false);
    expect(striksOgBucketB(cron, laes(CONFIG).replace("[functions.meta-send-cron]\n    verify_jwt = true", "[functions.meta-send-cron]\n    verify_jwt = false"))).toBe(false);
  });
  it("5. fbclid-betingelsen tilbage, user agent i insert'en, en tom update-betingelse, eller en anden function, fælder dom 5", () => {
    const ua = laes(UA);
    // PRÆCIS DEN GAMLE KODE — den må ikke kunne komme tilbage ubemærket.
    expect(userAgentForAlle(gem, ua.replace("return userAgent === null ? { ...spor } : { ...spor, user_agent: userAgent };", "return spor.fbclid ? { ...spor, user_agent: userAgent } : { ...spor };"), filerF)).toBe(false);
    // Betingelsen tilbage til «kun spor» — så mister webinar-ansøgeren sin user agent.
    expect(userAgentForAlle(gem.replace("if (!harAnnoncespor(spor) && userAgent === null) return;", "if (!harAnnoncespor(spor)) return;"), ua, filerF)).toBe(false);
    expect(userAgentForAlle(gem.replace(".insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, ...del.svar })", ".insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, user_agent: laesUserAgent(req), ...del.svar })"), ua, filerF)).toBe(false);
    expect(userAgentForAlle(gem, ua, [{ sti: "supabase/functions/x/index.ts", kilde: 'await admin.from("ansoegninger").update({ user_agent: ua }).eq("id", id);' }])).toBe(false);
    const anden = 'const { error: fejlUden } = await admin.from("ansoegninger").update({ ...spor }).eq("id", id);';
    expect(userAgentForAlle(gem.replace(anden, "const fejlUden = null;"), ua, filerF)).toBe(false);
    const foerste = 'const { error } = await admin.from("ansoegninger").update(sporMedUserAgent(spor, userAgent)).eq("id", id);';
    expect(userAgentForAlle(gem.replace(anden, "").replace(foerste, `${anden}\n  ${foerste}`), ua, filerF)).toBe(false);
  });
  it("6. sporet skrevet efter tællingen, eller payloaden gemt, fælder dom 6", () => {
    expect(sporetFoerSvaret(cron.replace("test_event_code: a.testEventCode, varighed_ms: svar.varighed_ms,", "test_event_code: a.testEventCode, varighed_ms: svar.varighed_ms, payload: payload,"))).toBe(false);
    expect(sporetFoerSvaret(cron.replace('{ onConflict: "event_id" }', '{ onConflict: "ansoegning_id" }'))).toBe(false);
  });
  it("7. en anden lås-standard, et kollisionsminut, eller et filhoved tilbage på IKKE KØRT på en af de tre kørte migrationer fælder dom 7", () => {
    const ua = laes(MIG_UA), spor = laes(MIG_SPOR), c = laes(MIG_CRON);
    expect(migrationerneErRigtige(ua, spor.replace("'meta_send_aktiv', 'false'::jsonb", "'meta_send_aktiv', 'true'::jsonb"), c)).toBe(false);
    expect(migrationerneErRigtige(ua, spor, c.replace("'3,8,13,18,23,28,38,43,48,53,58 * * * *'", "'*/5 * * * *'"))).toBe(false);
    expect(migrationerneErRigtige(ua.replace("-- KØRT i prod — 21/9-2026 kl. 15:50", "-- IKKE KØRT. DEPLOY:"), spor, c)).toBe(false);
    expect(migrationerneErRigtige(ua, spor.replace("-- KØRT i prod — 21/9-2026 kl. 15:50", "-- IKKE KØRT. DEPLOY:"), c)).toBe(false);
    expect(migrationerneErRigtige(ua, spor, c.replace("-- KØRT i prod — 21/9-2026 kl. 16:18", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    expect(kolliderer(33, cronUdtryk(MIG_DIR), "meta-send").some((s) => s.includes("33"))).toBe(true);
  });
  it("8. alarmen i tørkørslen, eller til rådgiveradressen, fælder dom 8", () => {
    const flyttet = cron.replace("  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);\n", "").replace("  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n", "  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);\n  if (!r.sender_rigtigt) return { status: 200, resultat: r };\n");
    expect(flyttet).not.toBe(cron);
    expect(alarmenErRigtig(flyttet, dom)).toBe(false);
    expect(alarmenErRigtig(cron.replace("to: driftModtager(),", "to: raadgiverModtager(nu),"), dom)).toBe(false);
  });
  it("10. en anden fil, der parser _fbp/_fbc, en cookie der normaliseres, eller «meta» væk af body'en, fælder dom 10", () => {
    const skema = laes(SKEMA), side = laes(SIDE), api = laes(API), alle = alleFiler();
    expect(metaCookierneEtSted(skema, gem, side, api, [...alle, { sti: "src/x.ts", kilde: 'const c = document.cookie.split("_fbp=")[1];' }])).toBe(false);
    // Metas ord: «do not apply any modifications before using, such as lower or upper case».
    expect(metaCookierneEtSted(skema.replace("fbc: META_FBC_FORM.test(fbc) ? fbc : null,", "fbc: META_FBC_FORM.test(fbc) ? fbc.toLowerCase() : null,"), gem, side, api, alle)).toBe(false);
    expect(metaCookierneEtSted(skema, gem.replace('"annoncespor", "ga", "meta", "svar"', '"annoncespor", "ga", "svar"'), side, api, alle)).toBe(false);
    expect(metaCookierneEtSted(skema, gem.replace("await gemMetaCookies(adminClient, data.id, metaCookiesAf(body?.meta));", ""), side, api, alle)).toBe(false);
    expect(metaCookierneEtSted(skema, gem, side.replace("meta: metaCookies.current,", ""), api, alle)).toBe(false);
  });
  it("11. et andet filhoved, et hoved tilbage på «IKKE KØRT», en kolonne mindre, eller et drop, fælder dom 11", () => {
    const m = laes(MIG_UDV);
    expect(udvidelsesMigrationen(m.replace("-- KØRT i prod — 21/9-2026 kl. 22:15", "-- Migration: Metas cookier"))).toBe(false);
    // #1064-formen: tilbage til «IKKE KØRT» falder — den ER kørt (21/9 22:15, FØR merge).
    expect(udvidelsesMigrationen(m.replace("-- KØRT i prod — 21/9-2026 kl. 22:15", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    expect(udvidelsesMigrationen(m.replace("  add column if not exists meta_fravalg boolean not null default false;", "  add column if not exists meta_fravalg boolean null;"))).toBe(false);
    expect(udvidelsesMigrationen(m.replace("comment on column public.ansoegninger.meta_fravalg is", "-- comment on column public.ansoegninger.meta_fravalg is"))).toBe(false);
    const t = laes(MIG_TRIN2);
    expect(trin2Migrationen(t.replace("-- KØRT i prod — 21/9-2026 kl. 23:20", "-- Migration: tre arter mere"))).toBe(false);
    // #1064-formen: tilbage til «IKKE KØRT» falder — den ER kørt (21/9 23:20, før udrulningen).
    expect(trin2Migrationen(t.replace("-- KØRT i prod — 21/9-2026 kl. 23:20", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    // Og den mindste udvidelse: en art mindre i CHECK'en fælder den.
    expect(trin2Migrationen(t.replace("'started', 'submitted', 'kvalificeret', 'booket', 'purchase'", "'started', 'submitted', 'kvalificeret', 'booket'"))).toBe(false);
    // VENTEPLADSER-REGLEN bider: en UKØRT fil, der sorterer før den sidst kørte, fanges.
    expect(ukoerteFoerKoerte(["20260101_a.sql", "20260103_c.sql"], ["20260102_b.sql"], "20260101_a.sql")).toEqual(["20260102_b.sql"]);
    // En ukørt fil EFTER den sidst kørte er den normale arbejdsgang — og fældes ikke.
    expect(ukoerteFoerKoerte(["20260101_a.sql", "20260103_c.sql"], ["20260104_d.sql"], "20260101_a.sql")).toEqual([]);
    // Og reglen ser kun på stykket fra «fra» og frem: en ældre ukørt fil er ikke vores.
    expect(ukoerteFoerKoerte(["20260103_c.sql"], ["20260101_gammel.sql"], "20260103_c.sql")).toEqual([]);
  });
  it("13. et standardnavn på «Kvalificeret», en CRM-hændelse med user agent, eller website-formen på alle, fælder dom 13", () => {
    // PRÆCIS DEN FEJL, det danske navn findes for: kollision med eWebinars egen pixel på samme datasæt.
    expect(arterneOgFormen(dom.replace('kvalificeret: { event_name: "Kvalificeret", content_name: "application_qualified" },', 'kvalificeret: { event_name: "Lead", content_name: "application_qualified" },'))).toBe(false);
    expect(arterneOgFormen(dom.replace('booket: { event_name: "Schedule", content_name: "application_scheduled" },', 'booket: { event_name: "Booking", content_name: "application_scheduled" },'))).toBe(false);
    // action_source låst til website for alle — så ville de tre CRM-hændelser mangle det, Meta kræver.
    expect(arterneOgFormen(dom.replace('action_source: crm ? "system_generated" : "website",', 'action_source: "website",'))).toBe(false);
    // user agent sendt på CRM-hændelserne: en påstand om en browser, vi ikke har set.
    expect(arterneOgFormen(dom.replace('...(crm || ua === "" ? {} : { client_user_agent: ua }),', "client_user_agent: ua,"))).toBe(false);
    // event_source/lead_event_source væk — Metas CRM-side kræver dem begge.
    expect(arterneOgFormen(dom.replace("...(crm ? { event_source: EVENT_SOURCE_CRM, lead_event_source: LEAD_EVENT_SOURCE } : {}),", ""))).toBe(false);
    // dommen kræver user agent af ALLE igen: hver ansøgning fra før 21/9 aften ville ryge ud.
    expect(arterneOgFormen(dom.replace("if (!erCrmArt(art)) {", "if (true) {"))).toBe(false);
  });
  it("14. et led byttet om, ansøgningens tid på webinarleddet, eller 90-dagesgrænsen udvandet, fælder dom 14", () => {
    // cookien foran URL'ens klik-id — vi ville tabe det id, vi selv så.
    const byttet = dom
      .split('  if (klik !== "") return bygFbc(klik, setTid);\n  const c = (r.fbc_cookie ?? "").trim();\n  if (FBC_FORM.test(c)) return c;')
      .join('  const c = (r.fbc_cookie ?? "").trim();\n  if (FBC_FORM.test(c)) return c;\n  if (klik !== "") return bygFbc(klik, setTid);');
    expect(byttet).not.toBe(dom);
    expect(fbcITreLed(byttet, cron)).toBe(false);
    // webinarleddet med ANSØGNINGENS tid — så ville fbc'et lyve om, hvornår klikket skete.
    expect(fbcITreLed(dom.replace("const set = somTid(r.webinar_fbclid_at);", "const set = somTid(r.created_at);"), cron)).toBe(false);
    // grænsen fjernet: et klik-id fra et halvt år siden ville blive lånt.
    expect(fbcITreLed(dom.replace("return alder >= 0 && alder <= WEBINAR_FBCLID_MAKS_DAGE * 86_400_000;", "return true;"), cron)).toBe(false);
    // «nyeste før» fjernet i cronen — en tilmelding EFTER ansøgningen ville kunne vinde.
    expect(fbcITreLed(dom, cron.replace("if (!Number.isFinite(t) || (Number.isFinite(graense) && t > graense)) continue;", "if (!Number.isFinite(t)) continue;"))).toBe(false);
    // et andet sted, der også slår webinaret op — parseren skal bo ét sted.
    expect(fbcITreLed(dom, cron + '\nconst x = admin.from("webinar_tilmeldinger").select("fbclid");\n')).toBe(false);
  });
  it("15. et beløb i øre, en hardkodet valuta, en fornyelse talt med, eller en Purchase uden beløb, fælder dom 15", () => {
    // øre sendt som value: 5.250.000 «kroner» i Metas rapporter.
    expect(purchaseBeloebet(dom.replace("value: oereTilKroner(r.purchase_beloeb_oere ?? 0)", "value: r.purchase_beloeb_oere ?? 0"), cron)).toBe(false);
    // valutaen skrevet ind i payloaden i stedet for ét sted — så kan en måling ikke rettes ét sted.
    expect(purchaseBeloebet(dom.replace("currency: META_VALUTA", 'currency: "DKK"'), cron)).toBe(false);
    // kravet om et beløb fjernet — Meta afviser hændelsen, og et 0-køb er ikke et køb.
    expect(purchaseBeloebet(dom.replace('if (art === "purchase" && !(typeof r.purchase_beloeb_oere === "number" && r.purchase_beloeb_oere > 0)) {', "if (false) {"), cron)).toBe(false);
    // art-filteret væk: en FORNYELSE ville blive til et køb. GLOBALT (split/join) — udtrykket
    // står to steder (kandidatopslaget og beløbsopslaget), og .replace() uden /g ramte kun
    // det første, så mutationen ikke bed. Samme fælde som mutationstest-replace-med-g.
    const udenArt = cron.split('.eq("art", PERIODE_ART_INDGANG)').join("");
    expect(udenArt).not.toBe(cron);
    expect(purchaseBeloebet(dom, udenArt)).toBe(false);
    // «første» byttet til «seneste»: et andet kontraktår ville blive medlemskabets køb.
    expect(purchaseBeloebet(dom, cron.replace("if (!ud.has(r.company_id)) ud.set(r.company_id, { at: r.created_at, oere: r.beloeb_oere });", "ud.set(r.company_id, { at: r.created_at, oere: r.beloeb_oere });"))).toBe(false);
  });
  it("12. fbclid-filteret tilbage, «ingen_fbclid» genopstået, eller fravalget dømt for sent, fælder dom 12", () => {
    // PRÆCIS DEN GAMLE KODE: filteret, der gjorde webinarvejen usynlig for Meta.
    expect(alleAnsoegereOgFravalg(dom, cron.replace('.or(`created_at.gte.${fra},indsendt_at.gte.${fra}`)', '.or(`created_at.gte.${fra},indsendt_at.gte.${fra}`)\n      .not("fbclid", "is", null)'))).toBe(false);
    // TRIN 2: webinaropslaget SKAL derimod filtrere på fbclid — ellers henter det rækker
    // uden klik-id og lader «nyeste før» vælge en tom.
    expect(alleAnsoegereOgFravalg(dom, cron.replace('.in("email", del).not("fbclid", "is", null)', '.in("email", del)'))).toBe(false);
    expect(alleAnsoegereOgFravalg(dom.replace('if (r.meta_fravalg === true) return { ok: false, grund: "fravalgt" };', ""), cron)).toBe(false);
    // Fravalget dømt EFTER user agent: en fravalgt ansøger uden user agent ville så blive
    // talt som «ingen_user_agent» — og tallet for fravalg ville lyve.
    const senere = dom
      .replace('  if (r.meta_fravalg === true) return { ok: false, grund: "fravalgt" };\n', "")
      .replace('  if (!r.landing || r.landing.trim() === "") return { ok: false, grund: "ingen_landing" };', '  if (!r.landing || r.landing.trim() === "") return { ok: false, grund: "ingen_landing" };\n  if (r.meta_fravalg === true) return { ok: false, grund: "fravalgt" };');
    expect(senere).not.toBe(dom);
    expect(alleAnsoegereOgFravalg(senere, cron)).toBe(false);
  });
});
