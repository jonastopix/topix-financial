import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOFT_NOEGLE, LOFT_SECRET } from "../../../supabase/functions/_shared/cvrLoft.ts";

/**
 * Kildeværn for CVR-dagsloftet (udkast 19/9-2026, recon-boelgen-2 §3). Fem
 * domme, hver bevist på en kopi med fejlen indsat:
 *
 *   1. Nøglen i koden og nøglen i migrationen er den SAMME streng. Drifter de
 *      fra hinanden, læser functionen en række der ikke findes, falder tavst
 *      tilbage på 20 — og Jonas' rettelse mandag gør ingenting.
 *   2. Functionen læser loftet PR. KALD gennem vaelgLoft. Læses det ved
 *      opstart, virker en ændring først ved næste kolde start, og «uden en
 *      udrulning» er en påstand.
 *   3. Den gamle NaN-fælde er VÆK: intet `Number(Deno.env...)` uden validering.
 *   4. Advarslen sendes FØR loftet er ramt — grenen for «advarsel» ligger i
 *      else-grenen, hvor der stadig slås op.
 *   5. Markøren «uden CVR» står på den LUKKEDE række (i <summary>), ikke kun i
 *      folden — en bunke på tredive læses lukket.
 *   6. ALLE TRE forbrugere af DataCVR-nøglen skriver i cvr_opslag_cache
 *      (19/9). Skriver en af dem ikke, er dens opslag usynlige for tælleren,
 *      og dagsloftet og klokken ved 80 % taler om en delmængde af forbruget.
 *   7. Rækken bygges ÉT sted (cacheRaekkeAf) og bærer aldrig den rå body.
 *      Byggede de tre hver sin række, ville en «fundet» uden `visning` kunne
 *      slippe ind — og den læser formularen som «findes ikke».
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FN = "supabase/functions/ansoegning-cvr/index.ts";
const DOM = "supabase/functions/_shared/cvrLoft.ts";
const MIGRATION = "supabase/migrations/20260919180000_cvr_dagsloft_i_config.sql";
const LISTE = "src/components/hjemmebane/ansoegninger/AnsoegningslisteView.tsx";
const SKEMA = "src/lib/ansoegning/skema.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const noeglenErEns = (sql: string, noegle: string): boolean =>
  sql.includes(`'${noegle}'`) && /insert into public\.app_config/i.test(sql) && /on conflict \(config_key\) do nothing/i.test(sql);

// ── 2 ──────────────────────────────────────────────────────────────────────
export const loftetLaesesPrKald = (fn: string): boolean => {
  const k = udenKommentarer(fn);
  return k.includes("async function hentLoft(") &&
    k.includes("await hentLoft(adminClient)") &&
    k.includes('.eq("config_key", LOFT_NOEGLE)') &&
    k.includes("vaelgLoft(") &&
    // Ingen modul-konstant der fryser loftet ved opstart.
    !/^const DAGSLOFT =/m.test(k);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const nanFaeldenErVaek = (fn: string): boolean => {
  const k = udenKommentarer(fn);
  return !/Number\(\s*Deno\.env\.get/.test(k) && !/Number\([^)]*ANSOEGNING_CVR_DAGSLOFT/.test(k);
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const advarslenKommerFoer = (fn: string): boolean => {
  const k = udenKommentarer(fn);
  const ramt = k.indexOf('=== "ramt"');
  const advarsel = k.indexOf('dom.tilstand === "advarsel"');
  const opslag = k.indexOf("await hentDataCvrRaa(cvr)");
  // Advarslen skal stå EFTER ramt-grenen (altså i else-grenen) og FØR opslaget.
  return ramt !== -1 && advarsel !== -1 && opslag !== -1 && ramt < advarsel && advarsel < opslag &&
    k.includes('meldLoft(adminClient, "naermer_sig"');
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const maerketStaarPaaRaekken = (liste: string): boolean => {
  const k = udenKommentarer(liste);
  const summary = k.indexOf("<summary");
  const fold = k.indexOf("{aaben && <Fold");
  const maerke = k.indexOf("data-uden-cvr");
  return summary !== -1 && fold !== -1 && maerke !== -1 && summary < maerke && maerke < fold &&
    k.includes("cvrMangler(a.cvr_opslag");
};

const BERIG = "supabase/functions/berig-virksomheder/index.ts";
const UNDERSKRIFT = "supabase/functions/send-til-underskrift/index.ts";
const CACHE = "supabase/functions/_shared/cvrCache.ts";

// ── 6 ──────────────────────────────────────────────────────────────────────
/** Ingen HTTP-indgang må slå op uden at gemme: slaaCvrOp er erstattet af slaaOpOgGem. */
export const alleTreSkriverICachen = (berig: string, underskrift: string, formular: string): boolean => {
  const b = udenKommentarer(berig);
  const u = udenKommentarer(underskrift);
  const f = udenKommentarer(formular);
  return b.includes("slaaOpOgGem(supabase,") && !/await slaaCvrOp\(/.test(b) &&
    u.includes("slaaOpOgGem(admin,") && !/await slaaCvrOp\(/.test(u) &&
    f.includes('.from("cvr_opslag_cache")') && f.includes("cacheRaekkeAf(");
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const raekkenByggesEtSted = (cache: string, formular: string): boolean => {
  const c = udenKommentarer(cache);
  const f = udenKommentarer(formular);
  return c.includes("export function cacheRaekkeAf(") &&
    c.includes("tolkCvrTilAnsoeger(raa.body)") &&
    // Kun den navngivne delmængde i basen — aldrig den rå body.
    !/svar:\s*raa\.body/.test(c) &&
    !/upsert\([^)]*raa\.body/.test(c) &&
    // Formularen bygger den IKKE selv længere.
    !f.includes("tolkCvrTilAnsoeger(") &&
    f.includes("cacheRaekkeAf(cvr, await hentDataCvrRaa(cvr))");
};

describe("CVR-dagsloftets kildeværn", () => {
  it("1. nøglen i koden er nøglen i migrationen", () => {
    const sql = laes(MIGRATION);
    expect(LOFT_NOEGLE).toBe("ansoegning_cvr_dagsloft");
    expect(noeglenErEns(sql, LOFT_NOEGLE)).toBe(true);
    expect(noeglenErEns(sql, "en_anden_noegle")).toBe(false);
    expect(noeglenErEns(sql.replace(/on conflict \(config_key\) do nothing/i, ""), LOFT_NOEGLE)).toBe(false);
    // Secret'ens navn må heller ikke drive: beskeden og migrationen nævner den.
    expect(LOFT_SECRET).toBe("ANSOEGNING_CVR_DAGSLOFT");
    expect(sql).toContain(LOFT_SECRET);
  });

  it("2. loftet læses ved hvert opslag, ikke ved opstart", () => {
    const fn = laes(FN);
    expect(loftetLaesesPrKald(fn)).toBe(true);
    expect(loftetLaesesPrKald(fn.replace("await hentLoft(adminClient)", "20"))).toBe(false);
    expect(loftetLaesesPrKald(`const DAGSLOFT = 20;\n${fn}`)).toBe(false);
  });

  it("3. NaN-fælden er væk — et ubrugeligt tal kan ikke slukke loftet", () => {
    const fn = laes(FN);
    expect(nanFaeldenErVaek(fn)).toBe(true);
    // Præcis den gamle linje, genindsat:
    expect(nanFaeldenErVaek(`${fn}\nconst D = Number(Deno.env.get("ANSOEGNING_CVR_DAGSLOFT") ?? "20");`)).toBe(false);
    // Og dommen selv nægter tekst.
    expect(laes(DOM)).toContain("Number.isSafeInteger");
  });

  it("4. advarslen sendes før loftet er ramt, ikke efter", () => {
    const fn = laes(FN);
    expect(advarslenKommerFoer(fn)).toBe(true);
    expect(advarslenKommerFoer(fn.replace('if (dom.tilstand === "advarsel")', "if (false)"))).toBe(false);
    expect(advarslenKommerFoer(fn.replace(/meldLoft\(adminClient, "naermer_sig"/g, 'meldLoft(adminClient, "dagsloft"'))).toBe(false);
  });

  it("6. alle tre forbrugere af nøglen skriver i cachen", () => {
    const berig = laes(BERIG), underskrift = laes(UNDERSKRIFT), formular = laes(FN);
    expect(alleTreSkriverICachen(berig, underskrift, formular)).toBe(true);
    // Præcis tilbagefaldet: en af dem slår op uden at gemme.
    expect(alleTreSkriverICachen(berig.replace("slaaOpOgGem(supabase,", "slaaCvrOp("), underskrift, formular)).toBe(false);
    expect(alleTreSkriverICachen(berig, underskrift.replace("slaaOpOgGem(admin,", "slaaCvrOp("), formular)).toBe(false);
    // /g: formularen rører tabellen TO steder (læsning og skrivning) — en
    // replace uden g lader den anden stå, og værnet ville bestå.
    expect(alleTreSkriverICachen(berig, underskrift, formular.replace(/\.from\("cvr_opslag_cache"\)/g, '.from("andet")'))).toBe(false);
    expect(alleTreSkriverICachen(berig, underskrift, formular.replace(/cacheRaekkeAf\(/g, "byggSelv("))).toBe(false);
  });

  it("7. rækken bygges ét sted og bærer aldrig den rå body", () => {
    const cache = laes(CACHE), formular = laes(FN);
    expect(raekkenByggesEtSted(cache, formular)).toBe(true);
    expect(raekkenByggesEtSted(`${cache}\nconst x = { svar: raa.body };`, formular)).toBe(false);
    expect(raekkenByggesEtSted(cache, `${formular}\nconst v = tolkCvrTilAnsoeger(raa.body);`)).toBe(false);
    expect(raekkenByggesEtSted(cache.replace("export function cacheRaekkeAf(", "function cacheRaekkeAf("), formular)).toBe(false);
  });

  it("5. «uden CVR» står på den lukkede række, ikke kun i folden", () => {
    const liste = laes(LISTE);
    expect(maerketStaarPaaRaekken(liste)).toBe(true);
    expect(maerketStaarPaaRaekken(liste.replace("data-uden-cvr", "data-andet"))).toBe(false);
    expect(maerketStaarPaaRaekken(liste.replace(/cvrMangler\(a\.cvr_opslag/g, "false && (a.cvr_opslag"))).toBe(false);
    // Dommen kommer fra det spejlede skema, ikke fra en ny betingelse i fladen.
    expect(liste).toContain('from "@/lib/ansoegning/skema"');
    expect(laes(SKEMA)).toContain("export function cvrMangler");
    expect(udenKommentarer(liste)).not.toMatch(/kilde === "ansoeger"/);
  });
});
