import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for webinarets tidspunkt på Klaviyo-profilen (udkast 21/9-2026). Otte domme,
 * hver bevist på en kopi med fejlen indsat:
 *   1. NØGLEN ÉT STED: klaviyoDato.ts og klaviyoProfil.ts er Deno-frie; functionen læser
 *      hverken KLAVIYO_API_KEY/KLAVIYO_SECRET, kalder fetch eller kald — kun
 *      skrivProfilHvisNoegle i klaviyoAfsendelse.ts, som har try/catch om alt.
 *   2. INGEN T/Z: datoen bygges af Intl-dele, aldrig toISOString; skrivProfil dømmer formen
 *      (erKlaviyoDato) FØR kaldet; functionen bygger ingen properties selv.
 *   3. INGEN KAST: kørslen ligger i try/catch i Deno.serve; hvert kald af skrivProfilHvisNoegle
 *      er await'et; skrivProfilHvisNoegle fanger alt.
 *   4. TØRKØRSEL STANDARD: dry_run !== false; «return» før nogen skrivning i tørkørsel.
 *   5. STRIKS-BODY: KENDTE_FELTER præcis dry_run · nu · email; ukendteFelter + -Besked kaldes.
 *   6. BUCKET B: authenticateServiceRole FØR createClient; config.toml verify_jwt = true.
 *   7. TILSTANDEN SKRIVES FØR HVER RETURN i skrivProfil (klaviyo.guard dom 7's regel).
 *   8. MIGRATIONERNE: begge bogført KØRT i prod 22/9 — tabellen «… kl. 14:24», cronen
 *      «… kl. 14:31» (vendt 22/9; var «IKKE KØRT» indtil da); tabellen med RLS og udfald-CHECK
 *      uden SECURITY DEFINER; cron-jobbet på et minut, INGEN anden plan rammer hver time
 *      (målt over alle cron.schedule i migrationerne), kald_edge med 60000/3600000.
 *   9. ALARMEN (princip 1): kun en RIGTIG kørsel med fejlede > 0 kalder skrivAlarm; nøglen
 *      bærer den danske DATO (én mail pr. døgn — kbhDato, ikke time); email_send_log slås op
 *      FØR sendManagedEmail; klokken skrives med skrivRaadgiverBesked; svaret bærer «alarm».
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DATO = "supabase/functions/_shared/klaviyoDato.ts";
const PROFIL = "supabase/functions/_shared/klaviyoProfil.ts";
const AFSENDELSE = "supabase/functions/_shared/klaviyoAfsendelse.ts";
const FUNKTION = "supabase/functions/klaviyo-profil-cron/index.ts";
const CONFIG = "supabase/config.toml";
const MIG_TABEL = "supabase/migrations/20260921190000_klaviyo_profil.sql";
const MIG_CRON = "supabase/migrations/20260921200000_klaviyo_profil_cron.sql";
const MIG_DIR = "supabase/migrations";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const noeglenEtSted = (dato: string, profil: string, afsendelse: string, funktion: string): boolean => {
  const d = udenKommentarer(dato), p = udenKommentarer(profil), a = udenKommentarer(afsendelse), f = udenKommentarer(funktion);
  const envKald = [...f.matchAll(/Deno\.env\.get\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  return !/Deno\.env/.test(d) && !/Deno\.env/.test(p) &&
    a.includes("export async function skrivProfilHvisNoegle(") && /skrivProfil\(skriver, Deno\.env\.get\(KLAVIYO_SECRET\)/.test(a) &&
    f.includes('from "../_shared/klaviyoAfsendelse.ts"') && f.includes("skrivProfilHvisNoegle(") &&
    !/\bfetch\s*\(/.test(f) && !/\bkald\s*\(/.test(f) && !f.includes("KLAVIYO_API_KEY") && !f.includes("KLAVIYO_SECRET") &&
    !/Deno\.env\.get\([^"']/.test(f) && envKald.length > 0 && envKald.every((n) => n === "SUPABASE_URL" || n === "SUPABASE_SERVICE_ROLE_KEY");
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ingenTZ = (dato: string, profil: string, funktion: string): boolean => {
  const d = udenKommentarer(dato), p = udenKommentarer(profil), f = udenKommentarer(funktion);
  const iDato = d.slice(d.indexOf("export function klaviyoDato"), d.indexOf("export function erKlaviyoDato"));
  const iSkriv = p.slice(p.indexOf("export async function skrivProfil("));
  return !iDato.includes("toISOString") && !iDato.includes("toJSON") &&
    /KLAVIYO_DATO_FORM = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\} \\d\{2\}:\\d\{2\}:\\d\{2\}\$\//.test(d) &&
    d.includes("!/[TZ]/.test(s)") &&
    foer(iSkriv, "!erKlaviyoDato(oensket.tb_naeste_webinar)", "await kald(noegle, PROFIL_STI") &&
    iSkriv.includes('udfald: "ugyldig"') &&
    // Functionen bygger ingen krop/properties selv — kun klaviyoProfil.bygProfilKrop gør.
    !f.includes("properties") && !f.includes("patch_properties");
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const kanIkkeKaste = (funktion: string, afsendelse: string): boolean => {
  const f = udenKommentarer(funktion), a = udenKommentarer(afsendelse);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const alle = (f.match(/skrivProfilHvisNoegle\(/g) ?? []).length;
  const afsendelseFanger = new RegExp(
    `function skrivProfilHvisNoegle\\((?:(?!\\nexport |\\nasync function |\\nfunction )[\\s\\S])*?try \\{(?:(?!\\nexport |\\nasync function |\\nfunction )[\\s\\S])*?\\} catch \\(e\\) \\{`,
  ).test(a);
  return /try \{[\s\S]*?await koerProfil\([\s\S]*?\} catch \(err\) \{/.test(serve) &&
    alle >= 1 && (f.match(/await skrivProfilHvisNoegle\(/g) ?? []).length === alle && afsendelseFanger;
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const toerkoerselErStandard = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const koer = f.slice(f.indexOf("export async function koerProfil"), f.indexOf("Deno.serve("));
  return f.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    foer(koer, "if (a.toerKoersel) return r;", "await skrivProfilHvisNoegle(");
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const striksBody = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  return /export const KENDTE_FELTER = \["dry_run", "nu", "email"\] as const;/.test(f) && f.includes("ukendteFelter(") && f.includes("ukendteFelterBesked(");
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const bucketB = (funktion: string, config: string): boolean =>
  foer(udenKommentarer(funktion), "authenticateServiceRole(req)", "createClient(") &&
  /\[functions\.klaviyo-profil-cron\]\s*\n\s*verify_jwt = true/.test(config);

// ── 7 ──────────────────────────────────────────────────────────────────────
export const tilstandFoerHverReturn = (profil: string): boolean => {
  const p = udenKommentarer(profil);
  // Kun skrivProfil selv — alarmens rene funktioner ligger efter den i samme fil.
  const start = p.indexOf("export async function skrivProfil(");
  const slut = p.indexOf("export const PROFIL_ALARM_NOEGLE_PRAEFIKS");
  const k = p.slice(start, slut === -1 ? undefined : slut);
  const returns = [...k.matchAll(/return \{/g)].map((m) => m.index!);
  const skriv = [...k.matchAll(/await skrivTilstand\(/g)].map((m) => m.index!);
  return returns.length === 2 && skriv.length === 2 && returns.every((r, i) => skriv[i] !== undefined && skriv[i] < r);
};

// ── 8 ──────────────────────────────────────────────────────────────────────
/** Minutterne i timen, et cron-udtryks minutfelt rammer (kun det, huset bruger: stjerne, stjerne-slash-n, a-b-slash-n, faste tal, lister). */
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
/** Alle cron-udtryk i migrationerne (uden kommentarlinjer) med jobnavn. */
export function cronUdtryk(dir: string): { fil: string; job: string; udtryk: string }[] {
  const ud: { fil: string; job: string; udtryk: string }[] = [];
  for (const fil of readdirSync(resolve(process.cwd(), dir)).filter((f) => f.endsWith(".sql")).sort()) {
    const t = udenSqlKommentarer(laes(`${dir}/${fil}`));
    for (const m of t.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi)) ud.push({ fil, job: m[1], udtryk: m[2] });
  }
  return ud;
}
/** Kolliderer et minut med en anden plan, der rammer det HVER time (timefelt «*»)? */
export function kolliderer(minut: number, planer: readonly { job: string; udtryk: string }[], egetJob: string): string[] {
  return planer
    .filter((p) => p.job !== egetJob)
    .filter((p) => p.udtryk.trim().split(/\s+/)[1] === "*" && minutterI(p.udtryk).includes(minut))
    .map((p) => `${p.job} (${p.udtryk})`);
}
export const migrationerneErRigtige = (tabel: string, cron: string): boolean => {
  const t = udenSqlKommentarer(tabel), c = udenSqlKommentarer(cron);
  // VENDT 22/9 kl. 14:24 og 14:31: BEGGE migrationer ER kørt i prod (Jonas, Lovable
  // SQL editor) — filhovederne sagde «IKKE KØRT» indtil da. Dommen er vendt, ikke
  // fjernet: den krævede før den ene linje, nu kræver den den anden med KLOKKESLÆTTET,
  // og den afviser stadig det forkerte hoved. Samme form som afslagLuk.guard dom 5 og
  // klaviyoAfmelding.guard dom 7. Rækkefølgen stod i hovederne og blev overholdt:
  // tabellen FØR cronen, og cronen EFTER udrulningen af functionen.
  return tabel.startsWith("-- KØRT i prod — 22/9-2026 kl. 14:24") && cron.startsWith("-- KØRT i prod — 22/9-2026 kl. 14:31") &&
    t.includes("create table if not exists public.klaviyo_profil") && t.includes("enable row level security") &&
    /klaviyo_profil_udfald_check check \(udfald in \('ok', 'ingen_noegle', 'noegle_afvist', 'loft', 'ugyldig', 'fejl', 'timeout'\)\)/.test(t) &&
    t.includes("email = lower(email)") && !/security definer/i.test(t) && !/security definer/i.test(c) &&
    /cron\.schedule\(\s*'klaviyo-profil',\s*'17 \* \* \* \*'/.test(c) &&
    /kald_edge\(\s*'klaviyo-profil-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*3600000/.test(c) &&
    cron.includes("cron.unschedule('klaviyo-profil')");
};

// ── 9 ──────────────────────────────────────────────────────────────────────
export const alarmenErRigtig = (funktion: string, profil: string): boolean => {
  const f = udenKommentarer(funktion), p = udenKommentarer(profil);
  const koer = f.slice(f.indexOf("export async function koerProfil"), f.indexOf("async function skrivAlarm"));
  const alarm = f.slice(f.indexOf("async function skrivAlarm"), f.indexOf("Deno.serve("));
  return koer.includes("if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);") &&
    foer(koer, "if (a.toerKoersel) return r;", "await skrivAlarm(") &&
    (f.match(/skrivAlarm\(/g) ?? []).length === 2 &&
    p.includes("return `${PROFIL_ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;") &&
    !/danskDatoOgTime|kbhDele\(nu\)\.time/.test(p.slice(p.indexOf("export function profilAlarmNoegle"))) &&
    foer(alarm, 'from("email_send_log")', "await sendManagedEmail({") &&
    alarm.includes('r.alarm = "allerede_sendt_i_dag";') && alarm.includes('r.alarm = res.sent ? "sendt"') &&
    alarm.includes("idempotencyKey: noegle,") && alarm.includes("await skrivRaadgiverBesked(admin, {") &&
    /reference_id: null,/.test(alarm) && f.includes('alarm: "ingen"');
};

describe("klaviyoProfil.guard — de ni domme på repoets filer", () => {
  it("1. nøglen læses ét sted; motoren er Deno-fri; functionen kender hverken fetch, kald eller nøglen", () => expect(noeglenEtSted(laes(DATO), laes(PROFIL), laes(AFSENDELSE), laes(FUNKTION))).toBe(true));
  it("2. ingen T/Z: Intl-dele, formen dømt før kaldet, ingen properties i functionen", () => expect(ingenTZ(laes(DATO), laes(PROFIL), laes(FUNKTION))).toBe(true));
  it("3. kan ikke kaste", () => expect(kanIkkeKaste(laes(FUNKTION), laes(AFSENDELSE))).toBe(true));
  it("4. tørkørsel er standard, og tørkørslen returnerer før nogen skrivning", () => expect(toerkoerselErStandard(laes(FUNKTION))).toBe(true));
  it("5. STRIKS-body: dry_run · nu · email", () => expect(striksBody(laes(FUNKTION))).toBe(true));
  it("6. Bucket B: service role før klienten; verify_jwt = true", () => expect(bucketB(laes(FUNKTION), laes(CONFIG))).toBe(true));
  it("7. tilstanden skrives før hver return i skrivProfil", () => expect(tilstandFoerHverReturn(laes(PROFIL))).toBe(true));
  it("8. migrationerne: bogført KØRT i prod (14:24 og 14:31), tabel med RLS og CHECK, cron på minut 17 med 60000/3600000 — og minut 17 er ledigt hver time", () => {
    expect(migrationerneErRigtige(laes(MIG_TABEL), laes(MIG_CRON))).toBe(true);
    const planer = cronUdtryk(MIG_DIR);
    expect(planer.length).toBeGreaterThanOrEqual(25);
    const egen = planer.find((p) => p.job === "klaviyo-profil");
    expect(egen?.udtryk).toBe("17 * * * *");
    expect(kolliderer(17, planer, "klaviyo-profil")).toEqual([]);
  });
  it("9. alarmen: kun rigtig kørsel med fejlede > 0; én mail pr. dansk døgn; loggen først; klokken; feltet alarm", () => expect(alarmenErRigtig(laes(FUNKTION), laes(PROFIL))).toBe(true));
});

describe("klaviyoProfil.guard — dommene fanger fejlen på en kopi", () => {
  it("1. nøglen i functionen, Deno.env i motoren, eller et fetch, fælder dom 1", () => {
    const d = laes(DATO), p = laes(PROFIL), a = laes(AFSENDELSE), f = laes(FUNKTION);
    expect(noeglenEtSted(d, p, a, `${f}\nconst n = Deno.env.get("KLAVIYO_API_KEY");`)).toBe(false);
    expect(noeglenEtSted(`${d}\nconst n = Deno.env.get("X");`, p, a, f)).toBe(false);
    expect(noeglenEtSted(d, `${p}\nconst n = Deno.env.get("X");`, a, f)).toBe(false);
    expect(noeglenEtSted(d, p, a, `${f}\nawait fetch("https://a.klaviyo.com/api/profile-import/");`)).toBe(false);
    expect(noeglenEtSted(d, p, a.replace("export async function skrivProfilHvisNoegle(", "export async function noget("), f)).toBe(false);
  });
  it("2. toISOString i datoen, formen dømt EFTER kaldet, eller properties bygget i functionen, fælder dom 2", () => {
    const d = laes(DATO), p = laes(PROFIL), f = laes(FUNKTION);
    expect(ingenTZ(d.replace("return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;", "return d.toISOString();"), p, f)).toBe(false);
    expect(ingenTZ(d.replace("!/[TZ]/.test(s)", "true"), p, f)).toBe(false);
    const tjek = "if (oensket !== null && !erKlaviyoDato(oensket.tb_naeste_webinar)) {";
    const i = p.indexOf(tjek), j = p.indexOf("\n  }\n", i) + 5;
    const blok = p.slice(i, j);
    expect(ingenTZ(d, p.replace(blok, "").replace("await skrivTilstand(skriver, mail, oensket, svar.spor, nu);", "await skrivTilstand(skriver, mail, oensket, svar.spor, nu);\n" + blok), f)).toBe(false);
    expect(ingenTZ(d, p, `${f}\nconst krop = { properties: { tb_naeste_webinar: new Date().toISOString() } };`)).toBe(false);
  });
  it("3. en løs promise eller et finally i stedet for catch fælder dom 3", () => {
    const f = laes(FUNKTION), a = laes(AFSENDELSE);
    expect(kanIkkeKaste(f.replace(/await skrivProfilHvisNoegle\(/g, "void skrivProfilHvisNoegle("), a)).toBe(false);
    expect(kanIkkeKaste(f.replace(/\} catch \(err\) \{/g, "} finally {"), a)).toBe(false);
    expect(kanIkkeKaste(f, a.replace(/\} catch \(e\) \{/g, "} finally {"))).toBe(false);
  });
  it("4./5./6. dry_run som standard true-skrivende, et ekstra felt, eller klienten før auth fælder dom 4/5/6", () => {
    const f = laes(FUNKTION);
    expect(toerkoerselErStandard(f.replace("const toerKoersel = raaBody?.dry_run !== false;", "const toerKoersel = raaBody?.dry_run === true;"))).toBe(false);
    expect(toerkoerselErStandard(f.replace("if (a.toerKoersel) return r;", ""))).toBe(false);
    expect(striksBody(f.replace('"email"] as const', '"email", "alt"] as const'))).toBe(false);
    expect(bucketB(f.replace("const auth = authenticateServiceRole(req);\n  if (auth !== true) return auth;", ""), laes(CONFIG))).toBe(false);
    expect(bucketB(f, laes(CONFIG).replace("[functions.klaviyo-profil-cron]\n    verify_jwt = true", "[functions.klaviyo-profil-cron]\n    verify_jwt = false"))).toBe(false);
  });
  it("7. en return før tilstanden fælder dom 7", () => {
    const p = laes(PROFIL);
    expect(tilstandFoerHverReturn(p.replace("await skrivTilstand(skriver, mail, oensket, svar.spor, nu);\n", ""))).toBe(false);
  });
  it("8. et andet minut, en migration tilbage på IKKE KØRT, eller et forkert klokkeslæt fælder dom 8 — og kolliderer() ser */5, 1-59/5 og :07", () => {
    const planer = cronUdtryk(MIG_DIR);
    expect(kolliderer(0, planer, "klaviyo-profil").length).toBeGreaterThan(0); // */5 og */15
    expect(kolliderer(6, planer, "klaviyo-profil").some((s) => s.includes("1-59/5"))).toBe(true); // gensenderen
    expect(kolliderer(7, planer, "klaviyo-profil").some((s) => s.includes("7 * * * *"))).toBe(true); // vagten
    expect(kolliderer(17, [...planer, { fil: "x", job: "andet-job", udtryk: "17 * * * *" }], "klaviyo-profil")).toEqual(["andet-job (17 * * * *)"]);
    expect(minutterI("*/15 * * * *")).toEqual([0, 15, 30, 45]);
    expect(minutterI("1-59/5 * * * *")).toEqual([1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56]);
    expect(minutterI("33 3 * * *")).toEqual([33]);
    // #1064-formen, på DEN FAKTISKE fil: tilbage til «IKKE KØRT» falder — begge ER kørt.
    expect(migrationerneErRigtige(laes(MIG_TABEL).replace("-- KØRT i prod — 22/9-2026 kl. 14:24", "-- IKKE KØRT. DEPLOY:"), laes(MIG_CRON))).toBe(false);
    expect(migrationerneErRigtige(laes(MIG_TABEL), laes(MIG_CRON).replace("-- KØRT i prod — 22/9-2026 kl. 14:31", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    // Et forkert klokkeslæt falder også — hovedet skal bære DEN kørsel, der fandt sted.
    expect(migrationerneErRigtige(laes(MIG_TABEL).replace("kl. 14:24", "kl. 09:00"), laes(MIG_CRON))).toBe(false);
    // Og en forklaring skubbet op foran linje 1 falder (ventepladser-fælden).
    expect(migrationerneErRigtige(`-- En forklaring først\n${laes(MIG_TABEL)}`, laes(MIG_CRON))).toBe(false);
    expect(migrationerneErRigtige(laes(MIG_TABEL), laes(MIG_CRON).replace("'17 * * * *'", "'7 * * * *'"))).toBe(false);
    expect(migrationerneErRigtige(laes(MIG_TABEL), laes(MIG_CRON).replace("3600000 ", "900000 "))).toBe(false);
  });
  it("9. alarm i tørkørslen, en nøgle med time, mailen sendt uden opslag, eller uden klokke fælder dom 9", () => {
    const f = laes(FUNKTION), p = laes(PROFIL);
    expect(alarmenErRigtig(f.replace("if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);", "await skrivAlarm(admin, r.fejlede_liste, a.nu, r);"), p)).toBe(false);
    const toer = "if (a.toerKoersel) return r;";
    const i = f.indexOf(toer);
    expect(alarmenErRigtig(f.slice(0, i) + f.slice(i + toer.length).replace("r.ok = r.fejlede === 0;", toer + "\n  r.ok = r.fejlede === 0;"), p)).toBe(false);
    expect(alarmenErRigtig(f, p.replace("return `${PROFIL_ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;", "return `${PROFIL_ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}T${kbhDele(nu).time}`;"))).toBe(false);
    const opslag = f.indexOf('from("email_send_log")'), send = f.indexOf("await sendManagedEmail({");
    expect(alarmenErRigtig(f.slice(0, opslag) + f.slice(opslag, send).replace('from("email_send_log")', 'from("noget_andet")') + f.slice(send), p)).toBe(false);
    expect(alarmenErRigtig(f.replace("await skrivRaadgiverBesked(admin, {", "await ingenKlokke(admin, {"), p)).toBe(false);
  });
});
