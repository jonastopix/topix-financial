import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ALARM_TYPER, ALDRIG_TYPER, COMMUNITY_TYPER, klassificer, LEGACY_TYPER, MORGEN_TYPER, SELVMAILENDE_REFERENCER } from "../../../supabase/functions/_shared/klokkeMail.ts";

/**
 * Kildeværn for rådgivernes klokker som mail (udkast 21/9-2026). Hver dom bevist
 * på en kopi med fejlen indsat (klaviyoProfil.guard-mønstret):
 *   1. TYPELISTEN DÆKKER ALLE KLOKKE-TYPER I KODEN: hver type, der kan nå
 *      advisor_notifications gennem skrivRaadgiverBesked (RAADGIVER_BESKED,
 *      TYPE_*-konstanterne, SAMTALE_KLOKKE, *_KLOKKE_TYPE, literale `type: "…"` hos
 *      kalderne) og SQL-vagternes 'drift', står i ALARM, COMMUNITY, MORGEN eller
 *      ALDRIG — ingen i to. Legacy-inserts (uden advisor_id) står i LEGACY og
 *      aldrig i en mail-liste. En ny type uden plads fælder dommen.
 *   2. DRIFT-MODTAGEREN ÉT STED: adressen står som streng kun i driftModtager.ts
 *      (og raadgiverModtager.ts' midlertidige omvej); gensenderen, profil-cronen og
 *      klokke-mail-cron sender deres alarm til driftModtager() og importerer ikke
 *      raadgiverModtager.
 *   3. INGEN KAST: kørslen ligger i try/catch i Deno.serve; sendManagedEmail kaldes
 *      ét sted, await'et, inde i sendKlokkeMail's try; hvert kald af sendKlokkeMail
 *      er await'et.
 *   4. TØRKØRSEL STANDARD: dry_run !== false; «return» i tørkørslen FØR første
 *      sendKlokkeMail; sendManagedEmail og stemplingen (update mailet_at) findes
 *      kun i sendKlokkeMail.
 *   5. STRIKS-BODY + BUCKET B: KENDTE_FELTER præcis dry_run · nu; ukendteFelter +
 *      -Besked; authenticateServiceRole FØR createClient; config.toml verify_jwt = true.
 *   6. QUERYEN: kun rækker med advisor_id, ulæste, umailede — de tre filtre står i
 *      hentRaekker.
 *   7. ÉN GANG: email_send_log slås op FØR sendManagedEmail; stemplingen kommer
 *      EFTER res.sent; rækkerne stemples kun hvor mailet_at endnu er null.
 *   8. MIGRATIONERNE: begge starter «-- IKKE KØRT. DEPLOY:»; kolonnen mailet_at
 *      timestamptz og delindekset; cron-jobbet '4-59/15 * * * *' rammer intet andet
 *      minut i nogen plan (målt over alle cron.schedule i migrationerne), kald_edge
 *      60000/900000, unschedule.
 *   9. DEN RENE FIL: klokkeMail.ts er Deno-fri og importerer kun hverdage.ts.
 *  10. klokkeCommunity.guard dom 4 gælder send-notification-email og samlemail — den
 *      nævner ikke klokke-mail-cron (fundet, ikke rettet).
 *  11. SELVMAILENDE ALARMER (rettelse 21/9): en function, der både kalder sendManagedEmail
 *      og skriver en «drift»-klokke (skrivRaadgiverBesked med type "drift" eller en
 *      *_KLOKKE_TYPE-konstant), mailer selv — dens reference_type SKAL stå i
 *      SELVMAILENDE_REFERENCER (klokkeMail.ts, det eneste sted), så klokke-mail-cron ikke
 *      mailer samme alarm igen. Fundet i koden, ikke skrevet af: en ny alarm uden plads fælder.
 *  12. MORGENMAILEN KUN PÅ HVERDAGE (Jonas 21/9): erMorgenkoersel går gennem hverdage.ts'
 *      erHverdag, og «siden» regnes af forrigeHverdagFra — ingen egen ugedags- eller
 *      helligdagsregel i klokkeMail.ts.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const FUNKTIONER = "supabase/functions";
const FUNKTION = "supabase/functions/klokke-mail-cron/index.ts";
const REN = "supabase/functions/_shared/klokkeMail.ts";
const DRIFT = "supabase/functions/_shared/driftModtager.ts";
const GENSEND = "supabase/functions/klaviyo-gensend-cron/index.ts";
const PROFIL = "supabase/functions/klaviyo-profil-cron/index.ts";
const CONFIG = "supabase/config.toml";
const MIG_KOLONNE = "supabase/migrations/20260922070000_advisor_notifications_mailet_at.sql";
const MIG_CRON = "supabase/migrations/20260922071000_klokke_mail_cron.sql";
const MIG_DIR = "supabase/migrations";
const KLOKKE_COMMUNITY_GUARD = "src/lib/__tests__/klokkeCommunity.guard.test.ts";

/** Alle .ts-filer under supabase/functions (rekursivt), som {sti, kilde}. */
export function alleFunktionsfiler(rod = FUNKTIONER): { sti: string; kilde: string }[] {
  const ud: { sti: string; kilde: string }[] = [];
  const gaa = (dir: string) => {
    for (const navn of readdirSync(resolve(ROD, dir)).sort()) {
      const sti = `${dir}/${navn}`;
      if (statSync(resolve(ROD, sti)).isDirectory()) gaa(sti);
      else if (navn.endsWith(".ts")) ud.push({ sti, kilde: laes(sti) });
    }
  };
  gaa(rod);
  return ud;
}

// ── 1 ──────────────────────────────────────────────────────────────────────
/**
 * Klokke-typerne, koden kan skrive gennem skrivRaadgiverBesked:
 *   - RAADGIVER_BESKED = { …: "…" } (ansoegningMotor.ts)
 *   - export const TYPE_X = "…" (alle _shared-filer)
 *   - SAMTALE_KLOKKE = { …: "…" } (samtaleBeskedDom.ts)
 *   - export const X_KLOKKE_TYPE = "…" (alarmerne)
 *   - literale `type: "…"` i en fil, der kalder skrivRaadgiverBesked(
 */
export function klokkeTyperIKoden(filer: readonly { sti: string; kilde: string }[]): Set<string> {
  const typer = new Set<string>();
  const objektVaerdier = (k: string, navn: string) => {
    const m = k.match(new RegExp(`export const ${navn} = \\{([\\s\\S]*?)\\} as const;`));
    if (!m) return;
    for (const v of m[1].matchAll(/:\s*"([a-z_]+)"/g)) typer.add(v[1]);
  };
  for (const { kilde } of filer) {
    const k = udenKommentarer(kilde);
    objektVaerdier(k, "RAADGIVER_BESKED");
    objektVaerdier(k, "SAMTALE_KLOKKE");
    for (const m of k.matchAll(/export const TYPE_[A-Z_]+ = "([a-z_]+)";/g)) typer.add(m[1]);
    for (const m of k.matchAll(/export const [A-Z_]+_KLOKKE_TYPE = "([a-z_]+)";/g)) typer.add(m[1]);
    if (k.includes("skrivRaadgiverBesked(") && !k.includes("export async function skrivRaadgiverBesked(")) {
      // Den literale type i KALDETS argument (første `type: "…"` inden for 500 tegn efter kaldet) —
      // ikke filens andre objekter (stripe-webhook skriver også notifications med `type: "session_booked"`).
      for (const m of k.matchAll(/skrivRaadgiverBesked\(/g)) {
        const arg = k.slice(m.index!, m.index! + 500).match(/(?<![a-z_])type: "([a-z_]+)"/); // ikke reference_type
        if (arg) typer.add(arg[1]);
      }
      // …og klokke-objekter, en hjælper returnerer (ansoegning-rykker-cron: raadgiverKlokke → `return { type: "venteliste", …`).
      for (const m of k.matchAll(/return \{ type: "([a-z_]+)"/g)) typer.add(m[1]);
    }
  }
  return typer;
}

/** Typerne i legacy-inserts (from("advisor_notifications").insert({ … type: "…" })). */
export function legacyTyperIKoden(filer: readonly { sti: string; kilde: string }[]): Set<string> {
  const typer = new Set<string>();
  for (const { sti, kilde } of filer) {
    if (sti.endsWith("_shared/raadgiverBesked.ts") || sti === FUNKTION) continue;
    const k = udenKommentarer(kilde);
    for (const m of k.matchAll(/from\("advisor_notifications"\)\s*\.insert\(\{[\s\S]{0,400}?type: "([a-z_]+)"/g)) typer.add(m[1]);
  }
  return typer;
}

export function typerneErDaekket(
  typer: ReadonlySet<string>,
  legacy: ReadonlySet<string>,
  klasse: (t: string) => string,
): { ok: boolean; udenPlads: string[]; legacyIMail: string[]; dobbelt: string[] } {
  const udenPlads = [...typer].filter((t) => !["alarm", "community", "morgen", "aldrig"].includes(klasse(t)));
  const legacyIMail = [...legacy].filter((t) => klasse(t) !== "legacy");
  const alle = [...ALARM_TYPER, ...COMMUNITY_TYPER, ...MORGEN_TYPER, ...Object.keys(ALDRIG_TYPER), ...LEGACY_TYPER];
  const dobbelt = alle.filter((t, i) => alle.indexOf(t) !== i);
  return { ok: udenPlads.length === 0 && legacyIMail.length === 0 && dobbelt.length === 0, udenPlads, legacyIMail, dobbelt };
}

// ── 11 ─────────────────────────────────────────────────────────────────────
/** Selvmailende alarmer i koden: sendManagedEmail( OG et skrivRaadgiverBesked(-kald med type «drift» i samme fil → reference_type. */
export function selvmailendeIKoden(filer: readonly { sti: string; kilde: string }[]): { sti: string; reference: string }[] {
  const ud: { sti: string; reference: string }[] = [];
  for (const { sti, kilde } of filer) {
    const k = udenKommentarer(kilde);
    if (!k.includes("sendManagedEmail(") || !k.includes("skrivRaadgiverBesked(")) continue;
    if (k.includes("export async function skrivRaadgiverBesked(")) continue;
    for (const m of k.matchAll(/skrivRaadgiverBesked\(/g)) {
      const arg = k.slice(m.index!, m.index! + 500);
      if (!/(?<![a-z_])type: (?:"drift"|[A-Z_]*_KLOKKE_TYPE(?![A-Za-z0-9_]))/.test(arg)) continue;
      ud.push({ sti, reference: arg.match(/reference_type: "([a-z_]+)"/)?.[1] ?? "(ingen)" });
    }
  }
  return ud;
}
/** Alle fundne står på listen; listen er defineret ét sted; hver *_KLOKKE_TYPE-konstant er "drift" (ellers ville mønstret ovenfor lyve). */
export const selvmailendeErDaekket = (filer: readonly { sti: string; kilde: string }[], liste: readonly string[]): { ok: boolean; mangler: string[] } => {
  const fund = selvmailendeIKoden(filer);
  const mangler = fund.filter((f) => !liste.includes(f.reference)).map((f) => `${f.sti}: ${f.reference}`);
  const definitioner = filer.filter(({ kilde }) => /export const SELVMAILENDE_REFERENCER = \[/.test(udenKommentarer(kilde))).map((f) => f.sti);
  const klokkeTyper = filer.flatMap(({ kilde }) => [...udenKommentarer(kilde).matchAll(/export const [A-Z_]+_KLOKKE_TYPE = "([a-z_]+)";/g)].map((m) => m[1]));
  const ok = fund.length >= 2 && mangler.length === 0 && definitioner.length === 1 && definitioner[0].endsWith("_shared/klokkeMail.ts") &&
    klokkeTyper.length >= 2 && klokkeTyper.every((t) => t === "drift") && liste.every((r) => fund.some((f) => f.reference === r));
  return { ok, mangler };
};

// ── 12 ─────────────────────────────────────────────────────────────────────
export const morgenenErHverdagsreglen = (ren: string): boolean => {
  const k = udenKommentarer(ren);
  const morgen = k.slice(k.indexOf("export function erMorgenkoersel("), k.indexOf("export function forrigeMorgenDato("));
  return /import \{[^}]*\berHverdag\b[^}]*\bforrigeHverdagFra\b[^}]*\} from "\.\/hverdage\.ts";/.test(k) &&
    morgen.includes("return erHverdag(nu) && kbhDele(nu).time >= MORGEN_TIME;") &&
    k.includes("return forrigeHverdagFra(kbhDato(nu), false);") &&
    !/getDay\(|getUTCDay\(|ugedag === 0|ugedag === 6/.test(k) && !/danskeHelligdage|paaskedag/.test(k);
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const driftModtagerenEtSted = (filer: readonly { sti: string; kilde: string }[], drift: string, gensend: string, profil: string, funktion: string): boolean => {
  const medAdresse = filer.filter(({ kilde }) => udenKommentarer(kilde).includes("jonas@theboardroom.dk")).map((f) => f.sti);
  const kunDeTo = medAdresse.every((s) => s.endsWith("_shared/driftModtager.ts") || s.endsWith("_shared/raadgiverModtager.ts")) && medAdresse.some((s) => s.endsWith("_shared/driftModtager.ts"));
  const d = udenKommentarer(drift);
  const alarmer = [gensend, profil, funktion].map(udenKommentarer);
  return kunDeTo &&
    d.includes('export const DRIFT_MODTAGER = "jonas@theboardroom.dk";') && d.includes("export function driftModtager(): string") &&
    alarmer.every((k) => k.includes('from "../_shared/driftModtager.ts"') && k.includes("driftModtager()") && !k.includes("raadgiverModtager") && !k.includes("jonas@theboardroom.dk"));
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const kanIkkeKaste = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const send = f.slice(f.indexOf("async function sendKlokkeMail("), f.indexOf("export async function koerKlokkeMail("));
  return serve.includes("try {\n    svar = await koerKlokkeMail(admin, { toerKoersel, nu });\n  } catch (err) {") &&
    (f.match(/sendManagedEmail\(\{/g) ?? []).length === 1 && send.includes("await sendManagedEmail({") &&
    /try \{[\s\S]*await sendManagedEmail\(\{[\s\S]*\} catch \(err\) \{/.test(send) &&
    (f.match(/await sendKlokkeMail\(/g) ?? []).length === 1 && f.includes("await sendKlokkeMail(admin, p, a.nu, r);");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const toerkoerselErStandard = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const koer = f.slice(f.indexOf("export async function koerKlokkeMail("), f.indexOf("Deno.serve("));
  const send = f.slice(f.indexOf("async function sendKlokkeMail("), f.indexOf("export async function koerKlokkeMail("));
  return f.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    foer(koer, "if (a.toerKoersel) {", "await sendKlokkeMail(") &&
    /if \(a\.toerKoersel\) \{[\s\S]*?return \{ status: 200, resultat: r \};/.test(koer) &&
    (f.match(/sendManagedEmail\(\{/g) ?? []).length === 1 && send.includes("sendManagedEmail({") &&
    (f.match(/\.update\(\{ mailet_at/g) ?? []).length === 1 && send.includes(".update({ mailet_at");
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const striksOgBucketB = (funktion: string, config: string): boolean => {
  const f = udenKommentarer(funktion);
  const blok = config.slice(config.indexOf("[functions.klokke-mail-cron]"));
  return f.includes('export const KENDTE_FELTER = ["dry_run", "nu"] as const;') &&
    f.includes("ukendteFelter(raaBody, KENDTE_FELTER)") && f.includes("ukendteFelterBesked(ukendte, KENDTE_FELTER)") &&
    foer(f.slice(f.indexOf("Deno.serve(")), "authenticateServiceRole(req)", "createClient(") &&
    /^\s*\[functions\.klokke-mail-cron\]\s*\n\s*verify_jwt = true/m.test(blok);
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const queryenErRigtig = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const hent = f.slice(f.indexOf("async function hentRaekker("), f.indexOf("interface Plan"));
  return hent.includes('.not("advisor_id", "is", null).is("read_at", null).is("mailet_at", null)') &&
    hent.includes('.gte("created_at", fra.toISOString())') && hent.includes(".range(start, start + SIDE - 1)");
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const mailesEnGang = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const send = f.slice(f.indexOf("async function sendKlokkeMail("), f.indexOf("export async function koerKlokkeMail("));
  return foer(send, 'from("email_send_log")', "await sendManagedEmail({") &&
    send.includes('.in("status", ["sent", "suppressed"])') &&
    foer(send, 'if (res.sent) { svar.mail = "sendt"; stempl = true; }', ".update({ mailet_at: nu.toISOString() })") &&
    send.includes('.in("id", ids).is("mailet_at", null)') &&
    send.includes("idempotencyKey: noegle,");
};

// ── 8 ──────────────────────────────────────────────────────────────────────
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
    const t = udenSqlKommentarer(laes(`${dir}/${fil}`));
    for (const m of t.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi)) ud.push({ fil, job: m[1], udtryk: m[2] });
  }
  return ud;
}
/** Planer (fem felter), der rammer minuttet — på NOGET tidspunkt, ikke kun hver time. */
export function kolliderer(minut: number, planer: readonly { job: string; udtryk: string }[], egetJob: string): string[] {
  return planer
    .filter((p) => p.job !== egetJob && p.udtryk.trim().split(/\s+/).length === 5)
    .filter((p) => minutterI(p.udtryk).includes(minut))
    .map((p) => `${p.job} (${p.udtryk})`);
}
export const migrationerneErRigtige = (kolonne: string, cron: string): boolean => {
  const k = udenSqlKommentarer(kolonne), c = udenSqlKommentarer(cron);
  return kolonne.startsWith("-- IKKE KØRT. DEPLOY:") && cron.startsWith("-- IKKE KØRT. DEPLOY:") &&
    /ALTER TABLE public\.advisor_notifications\s+ADD COLUMN IF NOT EXISTS mailet_at timestamptz NULL;/.test(k) &&
    /CREATE INDEX IF NOT EXISTS advisor_notifications_umailet_idx[\s\S]*WHERE advisor_id IS NOT NULL AND read_at IS NULL AND mailet_at IS NULL;/.test(k) &&
    !/security definer/i.test(k) && !/drop policy/i.test(k) &&
    /cron\.schedule\(\s*'klokke-mail',\s*'4-59\/15 \* \* \* \*'/.test(c) &&
    /kald_edge\(\s*'klokke-mail-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*900000/.test(c) &&
    cron.includes("cron.unschedule('klokke-mail')");
};

// ── 9 ──────────────────────────────────────────────────────────────────────
export const renFilErRen = (ren: string): boolean => {
  const k = udenKommentarer(ren);
  const imports = k.match(/^import .*$/gm) ?? [];
  return !/\bDeno\b/.test(k) && !/\bfetch\s*\(/.test(k) && imports.length === 1 && imports[0].includes('from "./hverdage.ts"');
};

describe("klokkeMail.guard — rådgivernes klokker som mail", () => {
  const filer = alleFunktionsfiler();
  const funktion = laes(FUNKTION);

  it("1. typelisten dækker alle klokke-typer i koden — ingen uden plads, ingen legacy i en mail, ingen i to lister", () => {
    const typer = klokkeTyperIKoden(filer);
    const legacy = legacyTyperIKoden(filer);
    // Målt 21/9: 23 typer gennem skrivRaadgiverBesked (+ 'drift' fra SQL), 5 legacy.
    expect(typer.size).toBeGreaterThanOrEqual(23);
    expect(typer.has("drift")).toBe(true);
    expect(typer.has("ansoegning_webhook_afvist")).toBe(true);
    expect([...legacy].sort()).toEqual(["agent_insight", "feedback_submitted", "handout_completed", "new_message", "report_uploaded"]);
    expect(typerneErDaekket(typer, legacy, klassificer)).toEqual({ ok: true, udenPlads: [], legacyIMail: [], dobbelt: [] });
    // SQL-vagterne skriver 'drift' — og drift er en alarm.
    expect(udenSqlKommentarer(laes("supabase/migrations/20260916170000_vagtens_samlemail.sql"))).toContain("'drift'");
    expect(udenSqlKommentarer(laes("supabase/migrations/20260921090000_meta_annoncer_cron.sql"))).toContain("'drift'");
    expect(klassificer("drift")).toBe("alarm");
  });
  it("2. drift-modtageren står ét sted, og de tre alarmer sender dertil", () => {
    expect(driftModtagerenEtSted(filer, laes(DRIFT), laes(GENSEND), laes(PROFIL), funktion)).toBe(true);
  });
  it("3. kan ikke kaste: try/catch om kørslen; sendManagedEmail ét sted, await'et, i try", () => expect(kanIkkeKaste(funktion)).toBe(true));
  it("4. tørkørsel er standard, og intet sendes eller stemples før return", () => expect(toerkoerselErStandard(funktion)).toBe(true));
  it("5. STRIKS-body (dry_run · nu) og Bucket B med verify_jwt = true", () => expect(striksOgBucketB(funktion, laes(CONFIG))).toBe(true));
  it("6. queryen: kun rækker med advisor_id, ulæste, umailede, i vinduet, side for side", () => expect(queryenErRigtig(funktion)).toBe(true));
  it("7. én gang: loggen først, stemplingen efter sendt, kun hvor mailet_at er null", () => expect(mailesEnGang(funktion)).toBe(true));
  it("8. migrationerne: IKKE KØRT, kolonnen og indekset, cron 4-59/15 uden kollision, kald_edge 60000/900000", () => {
    expect(migrationerneErRigtige(laes(MIG_KOLONNE), laes(MIG_CRON))).toBe(true);
    const planer = cronUdtryk(MIG_DIR);
    expect(planer.some((p) => p.job === "klokke-mail" && p.udtryk === "4-59/15 * * * *")).toBe(true);
    for (const minut of [4, 19, 34, 49]) expect(`${minut}: ${kolliderer(minut, planer, "klokke-mail").join(", ")}`).toBe(`${minut}: `);
  });
  it("9. den rene fil er Deno-fri og importerer kun hverdage.ts", () => expect(renFilErRen(laes(REN))).toBe(true));
  it("11. de selvmailende alarmer i koden (gensenderen, profil-cronen) står alle i SELVMAILENDE_REFERENCER — listen ét sted, ingen overflødig", () => {
    const fund = selvmailendeIKoden(filer);
    expect(fund.map((f) => f.reference).sort()).toEqual(["ga_haendelser", "klaviyo_haendelser", "klaviyo_profil", "meta_haendelser"]);
    expect(selvmailendeErDaekket(filer, SELVMAILENDE_REFERENCER)).toEqual({ ok: true, mangler: [] });
    // Og reglen virker på det, listen siger: en drift-klokke med den reference er «aldrig».
    for (const r of SELVMAILENDE_REFERENCER) expect(klassificer("drift", r)).toBe("aldrig");
  });
  it("12. morgenmailen bruger hverdage.ts' regel (erHverdag, forrigeHverdagFra) — ingen egen ugedag/helligdag", () => expect(morgenenErHverdagsreglen(laes(REN))).toBe(true));
  it("10. klokkeCommunity.guard dom 4 gælder send-notification-email og samlemail — ikke den nye function (fundet, ikke rettet)", () => {
    const g = laes(KLOKKE_COMMUNITY_GUARD);
    expect(g).toContain('const MAILKOE = "supabase/functions/send-notification-email/index.ts";');
    expect(g).toContain('const SAMLEMAIL = "supabase/functions/_shared/samlemail.ts";');
    expect(g).not.toContain("klokke-mail-cron");
  });
});

describe("klokkeMail.guard — dommene fanger fejlen på en kopi", () => {
  const filer = alleFunktionsfiler();
  const funktion = laes(FUNKTION);

  it("1. en ny TYPE_-konstant uden plads, en literal type hos en kalder, eller en legacy-type i en mail-liste, fælder dom 1", () => {
    const typer = klokkeTyperIKoden([...filer, { sti: "x.ts", kilde: 'export const TYPE_NY = "helt_ny_klokke";' }]);
    expect(typer.has("helt_ny_klokke")).toBe(true);
    expect(typerneErDaekket(typer, legacyTyperIKoden(filer), klassificer).udenPlads).toEqual(["helt_ny_klokke"]);
    const kalder = klokkeTyperIKoden([{ sti: "y.ts", kilde: 'await skrivRaadgiverBesked(admin, { type: "endnu_en", title: "x", reference_type: "ansoegning" });\nawait writeNotification(admin, { type: "session_booked" });' }]);
    expect([...kalder]).toEqual(["endnu_en"]); // filens andre objekter (notifications) tæller ikke
    expect([...klokkeTyperIKoden([{ sti: "v.ts", kilde: 'function k() { return { type: "fra_hjaelper", title: "t" }; }\nawait skrivRaadgiverBesked(admin, { ...k() });' }])]).toEqual(["fra_hjaelper"]);
    expect(typerneErDaekket(klokkeTyperIKoden(filer), new Set(["drift"]), klassificer).legacyIMail).toEqual(["drift"]);
    // Uden kalder-kaldet tæller literale typer ikke (fx notifications-typer i andre functions).
    expect([...klokkeTyperIKoden([{ sti: "z.ts", kilde: 'writeNotification(admin, { type: "community_svar" })' }])]).toEqual([]);
    // Legacy-inserts findes: én type pr. direkte insert.
    expect(legacyTyperIKoden([{ sti: "w.ts", kilde: 'await admin.from("advisor_notifications").insert({\n  type: "new_message",\n  title: t,\n});' }]).has("new_message")).toBe(true);
  });
  it("2. adressen hårdkodet i functionen, eller raadgiverModtager tilbage i en alarm, fælder dom 2", () => {
    const d = laes(DRIFT), g = laes(GENSEND), p = laes(PROFIL);
    expect(driftModtagerenEtSted(filer, d, g, p, funktion.replace("to: p.modtager,", 'to: "jonas@theboardroom.dk",'))).toBe(false);
    expect(driftModtagerenEtSted(filer, d, g.replace("to: driftModtager(),", "to: raadgiverModtager(nu),"), p, funktion)).toBe(false);
    expect(driftModtagerenEtSted([...filer, { sti: "supabase/functions/x/index.ts", kilde: 'const a = "jonas@theboardroom.dk";' }], d, g, p, funktion)).toBe(false);
  });
  it("3. kørslen uden try/catch, eller et sendManagedEmail nr. to, fælder dom 3", () => {
    const udenTry = funktion.replace("  try {\n    svar = await koerKlokkeMail(", "  {\n    svar = await koerKlokkeMail(");
    expect(udenTry).not.toBe(funktion);
    expect(kanIkkeKaste(udenTry)).toBe(false);
    expect(kanIkkeKaste(funktion + "\nasync function x(a: any) { await sendManagedEmail({} as any); }\n")).toBe(false);
  });
  it("4. dry_run som standard falsk, eller afsendelse før tørkørslens return, fælder dom 4", () => {
    expect(toerkoerselErStandard(funktion.replace("raaBody?.dry_run !== false", "raaBody?.dry_run === true"))).toBe(false);
    const flyttet = funktion.replace("  if (a.toerKoersel) {\n", "  for (const p of planer) await sendKlokkeMail(admin, p, a.nu, r);\n  if (a.toerKoersel) {\n");
    expect(flyttet).not.toBe(funktion);
    expect(toerkoerselErStandard(flyttet)).toBe(false);
  });
  it("5. et felt mere i KENDTE_FELTER, eller createClient før auth, fælder dom 5", () => {
    const c = laes(CONFIG);
    expect(striksOgBucketB(funktion.replace('["dry_run", "nu"] as const', '["dry_run", "nu", "email"] as const'), c)).toBe(false);
    expect(striksOgBucketB(funktion, c.replace("[functions.klokke-mail-cron]\n    verify_jwt = true", "[functions.klokke-mail-cron]\n    verify_jwt = false"))).toBe(false);
  });
  it("6. et filter, der falder væk, fælder dom 6", () => {
    expect(queryenErRigtig(funktion.replace('.is("mailet_at", null)', ""))).toBe(false);
    expect(queryenErRigtig(funktion.replace('.not("advisor_id", "is", null)', ""))).toBe(false);
  });
  it("7. stempling før afsendelsen, eller uden log-opslag, fælder dom 7", () => {
    expect(mailesEnGang(funktion.replace('from("email_send_log")', 'from("noget_andet")'))).toBe(false);
    expect(mailesEnGang(funktion.replace('.in("id", ids).is("mailet_at", null)', '.in("id", ids)'))).toBe(false);
  });
  it("8. et minut, der kolliderer, eller en migration uden IKKE KØRT, fælder dom 8 — og kolliderer() ser */5, 1-59/5, :07, :17 og faste tider", () => {
    const planer = cronUdtryk(MIG_DIR);
    expect(kolliderer(0, planer, "klokke-mail").length).toBeGreaterThan(0);
    expect(kolliderer(6, planer, "klokke-mail").some((s) => s.includes("1-59/5"))).toBe(true);
    expect(kolliderer(7, planer, "klokke-mail").some((s) => s.includes("7 * * * *"))).toBe(true);
    expect(kolliderer(17, planer, "klokke-mail").some((s) => s.includes("17 * * * *"))).toBe(true);
    expect(kolliderer(33, planer, "klokke-mail").some((s) => s.includes("33 3 * * *"))).toBe(true); // en fast tid tæller også
    expect(kolliderer(4, [...planer, { fil: "x", job: "andet-job", udtryk: "4 9 * * *" }], "klokke-mail")).toEqual(["andet-job (4 9 * * *)"]);
    expect(minutterI("4-59/15 * * * *")).toEqual([4, 19, 34, 49]);
    const k = laes(MIG_KOLONNE), c = laes(MIG_CRON);
    expect(migrationerneErRigtige(k.replace("-- IKKE KØRT. DEPLOY:", "-- DEPLOY:"), c)).toBe(false);
    expect(migrationerneErRigtige(k, c.replace("'4-59/15 * * * *'", "'3-59/15 * * * *'"))).toBe(false);
    expect(migrationerneErRigtige(k.replace("mailet_at timestamptz NULL", "mailet_at text NULL"), c)).toBe(false);
  });
  it("11. en ny alarm, der både mailer og skriver en drift-klokke uden plads på listen, fælder dom 11 — også via en *_KLOKKE_TYPE-konstant; en reference på listen uden alarm i koden fælder; listen defineret to steder fælder", () => {
    const ny = { sti: "supabase/functions/zz-ny-vagt-cron/index.ts", kilde: 'await sendManagedEmail({ to: driftModtager() });\nawait skrivRaadgiverBesked(admin, { type: "drift", title: t, reference_type: "ny_vagt", reference_id: null });' };
    expect(selvmailendeIKoden([ny])).toEqual([{ sti: ny.sti, reference: "ny_vagt" }]);
    expect(selvmailendeErDaekket([...filer, ny], SELVMAILENDE_REFERENCER)).toEqual({ ok: false, mangler: [`${ny.sti}: ny_vagt`] });
    // Fund nr. 3 kom af sig selv, da #1069 landede i main — værnet fandt meta-send-cron uden at nogen fortalte det.
    expect(selvmailendeIKoden(filer).some((f) => f.sti.endsWith("meta-send-cron/index.ts"))).toBe(true);
    expect(selvmailendeIKoden(filer).some((f) => f.sti.endsWith("ga-send-cron/index.ts"))).toBe(true);
    const viaKonstant = { ...ny, kilde: ny.kilde.replace('type: "drift"', "type: NY_ALARM_KLOKKE_TYPE") };
    expect(selvmailendeIKoden([viaKonstant])).toEqual([{ sti: ny.sti, reference: "ny_vagt" }]);
    // En function, der mailer men skriver en IKKE-drift-klokke (ansoegningMotor: ansoegning_ny), tæller ikke.
    expect(selvmailendeIKoden([{ sti: "x.ts", kilde: 'await sendManagedEmail({});\nawait skrivRaadgiverBesked(admin, { type: RAADGIVER_BESKED.ny, title: t, reference_type: "ansoegning" });' }])).toEqual([]);
    expect(selvmailendeErDaekket(filer, [...SELVMAILENDE_REFERENCER, "overfloedig"]).ok).toBe(false);
    expect(selvmailendeErDaekket(filer, ["klaviyo_haendelser"]).mangler).toEqual([
      "supabase/functions/ga-send-cron/index.ts: ga_haendelser",
      "supabase/functions/klaviyo-profil-cron/index.ts: klaviyo_profil",
      "supabase/functions/meta-send-cron/index.ts: meta_haendelser",
    ]);
    expect(selvmailendeErDaekket([...filer, { sti: "supabase/functions/_shared/andet.ts", kilde: 'export const SELVMAILENDE_REFERENCER = ["x"] as const;' }], SELVMAILENDE_REFERENCER).ok).toBe(false);
  });
  it("12. en morgen uden hverdagsreglen, eller en egen ugedagsregel, fælder dom 12", () => {
    const ren = laes(REN);
    expect(morgenenErHverdagsreglen(ren.replace("return erHverdag(nu) && kbhDele(nu).time >= MORGEN_TIME;", "return kbhDele(nu).time >= MORGEN_TIME;"))).toBe(false);
    expect(morgenenErHverdagsreglen(ren + "\nconst weekend = (d: Date) => d.getDay() === 0;\n")).toBe(false);
  });
  it("9. Deno i den rene fil fælder dom 9", () => {
    expect(renFilErRen(laes(REN) + '\nconst x = Deno.env.get("X");')).toBe(false);
    expect(renFilErRen(laes(REN).replace('from "./hverdage.ts"', 'from "./klaviyo.ts"'))).toBe(false);
  });
});
