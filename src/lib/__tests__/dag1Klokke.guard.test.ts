import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { raadgiverSti } from "@/lib/hjemmebane/klokke";
import { dag1Besked, TYPE_VENTER_PAA_VELKOMST } from "../../../supabase/functions/_shared/dag1Klokke.ts";
import { klassificer, klokkeSti, morgenGraense } from "../../../supabase/functions/_shared/klokkeMail.ts";

/**
 * Kildeværn for dag-1-klokken (2/10-2026, a1002-velkomst; _shared/dag1Klokke.ts +
 * stille-klokker-cron). Hver dom er en ren funktion over kildeteksten og bevist på
 * en kopi med fejlen indsat (selvbeviset), så værnet ikke kan stå grønt af sig selv:
 *   1. TYPEN HAR PLADS I MORGENMAILEN: «venter_paa_velkomst» står i klokkeMail.ts'
 *      MORGEN_TYPER (klassificer → «morgen»).
 *   2. DOMMEN ER FORSIDENS: dag1Klokke.ts kalder doemVenterPaaVelkomst (spejlet) og
 *      har ingen egen tærskel; dagene tælles i den DANSKE kalender (kbhDato), aldrig
 *      i maskinens (getFullYear/getMonth/getDate).
 *   3. TØRKØRSEL STANDARD OG LÅSEN: dry_run !== false; i koerDag1Klokke læses låsen
 *      FØR første hentning, og skrivRaadgiverBesked står EFTER både tørkørslens og
 *      låsens «continue».
 *   4. ISOLERET: koerDag1Klokke kaldes UDEN FOR try'en om koerStilleKlokker, og begge
 *      svar (200 og 500) bærer "dag1_klokke": DAG1_SKIVE.
 *   5. TJENESTEKONTI FÅR ALDRIG MAILEN: klokke-mail-cron lægger dem udenfor
 *      (udenTjenestekonti) FØR fordel.
 *   6. INGEN NAVNE I SVARET: Dag1Resultat har kun tal, sandhedsværdier, tavse-tællere
 *      og fejl; koerDag1Klokke skubber aldrig et navn, en mail eller en titel i svaret.
 *   7. MIGRATIONEN: første linje præcis husets; låsen 'false'::jsonb med ON CONFLICT DO
 *      NOTHING; det delvise unikke indeks; FØR/EFTER/REVERT; intet cron-job; og ingen
 *      ikke-kørt migration sorterer før en kørt (fra 2/10, metaSend.guard dom 11's regel).
 *   8. TIDSPUNKTET: stille-klokker-jobbets skema giver en klokke FØR kl. 07 dansk
 *      (morgenGraense) hver eneste dag 2026–2028, sommer- og vintertid, med kørslens
 *      60 s oveni.
 *   9. LINKET: klokken peger på virksomhedens chat (/chat?companyId=…) i både mailen
 *      (klokkeSti) og klokken i platformen (raadgiverSti).
 *  10. ÉN GANG: cronen slår eksisterende klokker op på typen og giver harKlokke videre.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const DOM = "supabase/functions/_shared/dag1Klokke.ts";
const CRON = "supabase/functions/stille-klokker-cron/index.ts";
const KLOKKE_MAIL = "supabase/functions/_shared/klokkeMail.ts";
const KLOKKE_MAIL_CRON = "supabase/functions/klokke-mail-cron/index.ts";
const MIG_DIR = "supabase/migrations";
const MIG = "supabase/migrations/20261002276000_dag1_klokke.sql";
const MIG_STILLE_CRON = "supabase/migrations/20260921100000_stille_klokker_cron.sql";
const FOERSTE_LINJE = "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).";

/** Funktionens krop fra `export async function navn(` til næste top-level-linje, der starter med «}». */
const funktionskrop = (k: string, navn: string): string => {
  const i = k.indexOf(`function ${navn}(`);
  if (i === -1) return "";
  const j = k.indexOf("\n}\n", i);
  return k.slice(i, j === -1 ? undefined : j);
};

// ── Dommene ──────────────────────────────────────────────────────────────────
export function typenHarPlads(klokkeMail: string): boolean {
  const m = udenKommentarer(klokkeMail).match(/export const MORGEN_TYPER = \[([\s\S]*?)\] as const;/);
  return !!m && m[1].includes(`"${TYPE_VENTER_PAA_VELKOMST}"`);
}

export function dommenErForsidens(dom: string): boolean {
  const k = udenKommentarer(dom);
  return /import \{[^}]*\bdoemVenterPaaVelkomst\b[^}]*\} from "\.\/venterPaaVelkomst\.ts";/.test(k)
    && /doemVenterPaaVelkomst\(/.test(k.replace(/import[^\n]*\n/g, ""))
    && /import \{[^}]*\bkbhDato\b[^}]*\} from "\.\/hverdage\.ts";/.test(k)
    && !/\bget(FullYear|Month|Date)\(/.test(k)
    && !/VELKOMST_FRA_DAGE/.test(k)
    // Rådgiverens stempel bruges ÉN gang i dommen: givet videre til forsidens dom — ingen egen «har skrevet»-regel.
    && (funktionskrop(k, "doemDag1Klokke").match(/\ba\.sidsteRaadgiverBeskedAt\b/g) ?? []).length === 1;
}

export function toerkoerselOgLaas(cron: string): boolean {
  const k = udenKommentarer(cron);
  const krop = funktionskrop(k, "koerDag1Klokke");
  return /raaBody\?\.dry_run !== false/.test(k)
    && foer(krop, "laesDag1Laas(", "alleSider<")
    && foer(krop, "if (toerKoersel) { r.ville_ringe++; continue; }", "if (!r.skriver_rigtigt) { r.holdt_af_laas++; continue; }")
    && foer(krop, "if (!r.skriver_rigtigt) { r.holdt_af_laas++; continue; }", "skrivRaadgiverBesked(")
    && (krop.match(/skrivRaadgiverBesked\(/g) ?? []).length === 1
    && /\.eq\("config_key", DAG1_LAAS_NOEGLE\)/.test(funktionskrop(k, "laesDag1Laas"));
}

export function isoleret(cron: string): boolean {
  const k = udenKommentarer(cron);
  const serve = k.slice(k.indexOf("Deno.serve("));
  // try'en om koerStilleKlokker (ikke body-parsingens try længere oppe).
  const kald = serve.indexOf("resultat = await koerStilleKlokker(");
  const catchIdx = serve.indexOf("} catch (err) {", kald);
  const tryKrop = kald === -1 || catchIdx === -1 ? "" : serve.slice(serve.lastIndexOf("try {", kald), catchIdx);
  return tryKrop.includes("koerStilleKlokker(")
    && !tryKrop.includes("koerDag1Klokke(")
    && serve.indexOf("await koerDag1Klokke(admin, toerKoersel, nu)", catchIdx) > catchIdx
    && (serve.match(/dag1_klokke: DAG1_SKIVE, dag1/g) ?? []).length === 2
    && /const ok = resultat\.ok && dag1\.fejlet === 0;/.test(serve);
}

export function tjenestekontiUdenfor(mailCron: string): boolean {
  const k = udenKommentarer(mailCron);
  return foer(k, "udenTjenestekonti(", "fordel(");
}

export function ingenNavneISvaret(dom: string, cron: string): boolean {
  const d = udenKommentarer(dom);
  const iface = d.match(/export interface Dag1Resultat \{([\s\S]*?)\n\}/);
  if (!iface) return false;
  const felter = [...iface[1].matchAll(/^\s*([a-z_]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]);
  const tilladt = (navn: string, type: string) =>
    type === "number" || type === "boolean" || (navn === "tavse" && type === "Record<string, number>") || (navn === "fejl" && type === "string[]");
  if (felter.length === 0 || !felter.every(([n, t]) => tilladt(n, t))) return false;
  const krop = funktionskrop(udenKommentarer(cron), "koerDag1Klokke");
  const skub = [...krop.matchAll(/r\.fejl\.push\(([^\n]*)\);/g)].map((m) => m[1]);
  return skub.length > 0 && skub.every((a) => !/\b(name|navn|email|mail|titel|title)\b/.test(a));
}

export function migrationenHolder(sql: string): boolean {
  const linjer = sql.split("\n");
  const kode = linjer.filter((l) => !/^\s*--/.test(l)).join("\n");
  return (linjer[0] === FOERSTE_LINJE || /^-- KØRT i prod \d{1,2}\/\d{1,2}-\d{4} /.test(linjer[0]))
    && /insert into public\.app_config \(config_key, config_value, description\)\s*values \('dag1_klokke_aktiv', 'false'::jsonb,[\s\S]*?on conflict \(config_key\) do nothing;/.test(kode)
    && /create unique index if not exists advisor_notifications_venter_paa_velkomst_uidx\s+on public\.advisor_notifications \(advisor_id, company_id\)\s+where type = 'venter_paa_velkomst';/.test(kode)
    && !/cron\.schedule/.test(kode)
    && !/\b(drop|alter|security definer)\b/i.test(kode)
    && /── FØR/.test(sql) && /── EFTER/.test(sql) && /REVERT:/.test(sql);
}

/** «En migration, der ikke er kørt, må aldrig sortere før en, der ER kørt» — fra `fra` og frem. */
export function ukoerteFoerKoerte(filer: readonly { navn: string; foerste: string }[], fra: string): string[] {
  const koert = filer.filter((f) => f.navn >= fra && /^--\s*KØRT i prod/.test(f.foerste)).map((f) => f.navn).sort();
  const sidste = koert[koert.length - 1];
  if (sidste === undefined) return [];
  return filer.filter((f) => f.navn >= fra && f.foerste.startsWith("-- IKKE KØRT")).map((f) => f.navn).filter((n) => n < sidste).sort();
}

const migrationsfiler = () =>
  readdirSync(resolve(ROD, MIG_DIR)).filter((f) => f.endsWith(".sql")).sort().map((navn) => ({ navn, foerste: laes(`${MIG_DIR}/${navn}`).split("\n")[0] ?? "" }));

/** Jobbets skema → for hver dag i perioden: en klokke skrevet ved fyringen + 60 s er fra FØR kl. 07 dansk. */
export function naarMorgenmailen(migration: string, fra = "2026-01-01", til = "2028-12-31"): boolean {
  const m = migration.match(/cron\.schedule\(\s*'stille-klokker',\s*'(\d+) (\d+) \* \* \*'/);
  if (!m) return false;
  const [minut, time] = [Number(m[1]), Number(m[2])];
  for (let t = Date.parse(`${fra}T00:00:00Z`); t <= Date.parse(`${til}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t);
    const fyring = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), time, minut));
    const skrevet = new Date(fyring.getTime() + 60_000);
    if (skrevet.getTime() >= morgenGraense(skrevet).getTime()) return false;
  }
  return true;
}

export function enGang(cron: string): boolean {
  const krop = funktionskrop(udenKommentarer(cron), "koerDag1Klokke");
  return /from\("advisor_notifications"\)\.select\("company_id"\)\.eq\("type", TYPE_VENTER_PAA_VELKOMST\)\.in\("company_id", del\)/.test(krop)
    && /harKlokke: harKlokke\.has\(id\)/.test(krop);
}

// ── Prøverne ─────────────────────────────────────────────────────────────────
describe("dag1Klokke.guard — dommene holder i koden", () => {
  it("1. typen har plads i morgenmailen", () => {
    expect(typenHarPlads(laes(KLOKKE_MAIL))).toBe(true);
    expect(klassificer(TYPE_VENTER_PAA_VELKOMST)).toBe("morgen");
  });
  it("2. dommen er forsidens, i den danske kalender", () => expect(dommenErForsidens(laes(DOM))).toBe(true));
  it("3. tørkørsel standard, låsen før skrivningen", () => expect(toerkoerselOgLaas(laes(CRON))).toBe(true));
  it("4. passet er isoleret, og beviset står i begge svar", () => expect(isoleret(laes(CRON))).toBe(true));
  it("5. tjenestekonti får aldrig mailen", () => expect(tjenestekontiUdenfor(laes(KLOKKE_MAIL_CRON))).toBe(true));
  it("6. ingen navne i svaret", () => expect(ingenNavneISvaret(laes(DOM), laes(CRON))).toBe(true));
  it("7. migrationen — og rækkefølgen i mappen", () => {
    expect(migrationenHolder(laes(MIG))).toBe(true);
    expect(ukoerteFoerKoerte(migrationsfiler(), "20261002")).toEqual([]);
    const navne = migrationsfiler().map((f) => f.navn);
    // KØRT 2/10 kl. 18:43 og omdøbt fra 330000 til 276000 (efter den seneste kørte, før de ventende 280000/290000).
    expect(navne.indexOf("20261002276000_dag1_klokke.sql")).toBeGreaterThan(navne.indexOf("20261002275000_community_mest_laest.sql"));
    expect(navne.indexOf("20261002276000_dag1_klokke.sql")).toBeLessThan(navne.indexOf("20261002280000_milestones_with_check.sql"));
  });
  it("8. jobbet skriver klokken før kl. 07 dansk hver dag (sommer og vinter)", () => expect(naarMorgenmailen(laes(MIG_STILLE_CRON))).toBe(true));
  it("9. linket er virksomhedens chat — i mailen og i klokken", () => {
    const b = dag1Besked("c1", { titel: "T", tekst: "B" });
    expect(klokkeSti(b)).toBe("/chat?companyId=c1");
    expect(raadgiverSti(b)).toBe("/chat?companyId=c1");
  });
  it("10. én gang: eksisterende klokker slås op på typen", () => expect(enGang(laes(CRON))).toBe(true));
});

describe("dag1Klokke.guard — selvbeviset: hver dom fælder fejlen på en kopi", () => {
  it("1. typen fjernet fra MORGEN_TYPER", () => {
    expect(typenHarPlads(laes(KLOKKE_MAIL).replace(`"${TYPE_VENTER_PAA_VELKOMST}",`, ""))).toBe(false);
  });
  it("2. maskinens kalender, en egen tærskel eller uden forsidens dom", () => {
    const k = laes(DOM);
    expect(dommenErForsidens(k.replace("return Math.round(", "void start.valueOf(); new Date().getFullYear(); return Math.round("))).toBe(false);
    expect(dommenErForsidens(k.replace("const velkomst = doemVenterPaaVelkomst(", "const velkomst = egenDom("))).toBe(false);
    expect(dommenErForsidens(k + "\nconst x = VELKOMST_FRA_DAGE;\n")).toBe(false);
    expect(dommenErForsidens(k.replace("if (a.harKlokke)", "if (a.sidsteRaadgiverBeskedAt) return { klokke: \"tavs\", grund: \"hilst_paa\" };\n  if (a.harKlokke)"))).toBe(false);
  });
  it("3. låsens gate fjernet, tørkørslen fjernet, eller en ekstra skrivning", () => {
    const k = laes(CRON);
    expect(toerkoerselOgLaas(k.replace("if (!r.skriver_rigtigt) { r.holdt_af_laas++; continue; }", ""))).toBe(false);
    expect(toerkoerselOgLaas(k.replace("if (toerKoersel) { r.ville_ringe++; continue; }", ""))).toBe(false);
    expect(toerkoerselOgLaas(k.replace("raaBody?.dry_run !== false", "raaBody?.dry_run === true"))).toBe(false);
    expect(toerkoerselOgLaas(k.replace("r.ring++;", "r.ring++; await skrivRaadgiverBesked(admin, dag1Besked(id, dom));"))).toBe(false);
  });
  it("4. passet flyttet ind i try'en, eller beviset mangler i ét svar", () => {
    const k = laes(CRON);
    expect(isoleret(k.replace("resultat = await koerStilleKlokker(admin, toerKoersel, nu);", "resultat = await koerStilleKlokker(admin, toerKoersel, nu); await koerDag1Klokke(admin, toerKoersel, nu);"))).toBe(false);
    expect(isoleret(k.replace("fejl: stilleFejl, dag1_klokke: DAG1_SKIVE, dag1", "fejl: stilleFejl, dag1"))).toBe(false);
  });
  it("5. tjenestekonti-filtret fjernet", () => {
    expect(tjenestekontiUdenfor(laes(KLOKKE_MAIL_CRON).replace(/udenTjenestekonti\(/g, "alleRaadgivere("))).toBe(false);
  });
  it("6. et navn i svaret", () => {
    expect(ingenNavneISvaret(laes(DOM).replace("fejl: string[];\n}", "fejl: string[];\n  navne: string[];\n}"), laes(CRON))).toBe(false);
    expect(ingenNavneISvaret(laes(DOM), laes(CRON).replace("r.fejl.push(skrevet.fejl.join(\"; \"));", "r.fejl.push(virksomheder.get(id)?.name ?? id);"))).toBe(false);
  });
  it("7. et andet første linje, en åben lås, intet indeks, et cron-job — og en ukørt før en kørt", () => {
    const k = laes(MIG);
    expect(migrationenHolder(k.replace(k.split("\n")[0], "-- Dag-1-klokken. IKKE KØRT."))).toBe(false);
    expect(migrationenHolder(k.replace("'dag1_klokke_aktiv', 'false'::jsonb", "'dag1_klokke_aktiv', 'true'::jsonb"))).toBe(false);
    expect(migrationenHolder(k.replace("create unique index if not exists", "create index if not exists"))).toBe(false);
    expect(migrationenHolder(k + "\nselect cron.schedule('dag1', '0 5 * * *', $$select 1$$);\n")).toBe(false);
    expect(ukoerteFoerKoerte([
      { navn: "20261002100000_a.sql", foerste: "-- IKKE KØRT. DEPLOY: …" },
      { navn: "20261002200000_b.sql", foerste: "-- KØRT i prod 2/10" },
    ], "20261002")).toEqual(["20261002100000_a.sql"]);
  });
  it("8. et skema efter kl. 07 dansk om sommeren (05:30 UTC = 07:30) fælder", () => {
    expect(naarMorgenmailen(laes(MIG_STILLE_CRON).replace("'30 4 * * *'", "'30 5 * * *'"))).toBe(false);
    // 04:59 UTC + 60 s = 05:00 UTC = 07:00 dansk sommertid — grænsen er eksklusiv.
    expect(naarMorgenmailen(laes(MIG_STILLE_CRON).replace("'30 4 * * *'", "'59 4 * * *'"))).toBe(false);
    expect(naarMorgenmailen("intet skema")).toBe(false);
  });
  it("10. opslaget fjernet", () => {
    expect(enGang(laes(CRON).replace("harKlokke: harKlokke.has(id)", "harKlokke: false"))).toBe(false);
  });
});
