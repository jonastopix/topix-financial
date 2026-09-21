/**
 * KILDEVÆRN — GA's klient-id og session-id på ansøgningen (21/9-2026 aften). Syv domme,
 * hver med selvbevis på en muteret kopi (metaSend.guard-formen):
 *   1. PARSEREN FINDES ÉT STED: laesGaClientId/laesGaSessionId/laesGa er defineret i
 *      skema.ts og spejlet ordret i _shared/ansoegningSkema.ts — og ingen anden fil i src/
 *      eller supabase/functions læser «_ga» selv.
 *   2. INGEN GENEREREDE ID'ER: GA-blokken i skema.ts kalder hverken random, uuid, Date.now
 *      eller crypto — et manglende id er null.
 *   3. EGEN UPDATE EFTER gemAnnoncespor: ansoegning-gem kalder gemGa EFTER gemAnnoncespor;
 *      gemGa opdaterer KUN ga_client_id/ga_session_id (ingen utm/fbclid/landing/user_agent i
 *      samme update), kun når harGa, og kaster aldrig.
 *   4. ALDRIG I INSERT'EN: insert'en i «opret» bærer ingen ga_-nøgle.
 *   5. IKKE I META-PAYLOADEN: FORBUDTE_NOEGLER indeholder ga_client_id og ga_session_id.
 *   6. FLADEN OG BODY'EN: Ansoeg.tsx læser document.cookie gennem laesGa ét sted og sender
 *      `ga: ga.current` med «opret»; KENDTE_FELTER kender «ga»; serveren dømmer med gaAf.
 *      Persondatateksten bærer GA-afsnittet ORDRET (godkendt 21/9, chatten med Jonas' fulde
 *      mandat — uden ordet «anonyme») lige efter «hvor du kom fra».
 *   7. MIGRATIONEN: bogført KØRT i prod (21/9 17:01, FØR merge — filhovedet rettet ved
 *      ilægningen; var «IKKE KØRT» indtil da); præcis de to kolonner, text null, med kommentarer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONDATA_AFSNIT } from "@/lib/ansoegning/persondata";

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const SKEMA = "src/lib/ansoegning/skema.ts";
const SKEMA_DENO = "supabase/functions/_shared/ansoegningSkema.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const SIDE = "src/pages/Ansoeg.tsx";
const API = "src/lib/ansoegning/api.ts";
const DOM = "supabase/functions/_shared/metaSend.ts";
const MIG = "supabase/migrations/20260922003000_ansoegninger_ga.sql";

export const GA_TEKST_ORDRET =
  "Har du sagt ja til cookies på theboardroom.dk, gemmer vi også det id, Google Analytics har givet din browser, så vi kan se, hvilken kanal din ansøgning kom fra.";

/** GA-blokken i skema.ts: fra dens overskrift til «Kilden». */
const gaBlok = (skema: string): string => {
  const s = udenKommentarer(skema);
  const i = s.indexOf("export const GA_MAALING_ID"), j = s.indexOf("export interface KildeInput");
  return i !== -1 && j !== -1 && i < j ? s.slice(i, j) : "";
};

/** Alle .ts/.tsx under src/ og supabase/functions (uden tests og node_modules). */
const alleFiler = (): { sti: string; kilde: string }[] => {
  const ud: { sti: string; kilde: string }[] = [];
  const gaa = (dir: string) => {
    for (const e of readdirSync(resolve(ROD, dir), { withFileTypes: true })) {
      const sti = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|__tests__|\.git/.test(e.name)) gaa(sti); }
      else if (/\.(ts|tsx)$/.test(e.name)) ud.push({ sti, kilde: laes(sti) });
    }
  };
  gaa("src"); gaa("supabase/functions");
  return ud;
};

// ── 1 ──────────────────────────────────────────────────────────────────────
export const parserenEtSted = (skema: string, deno: string, filer: readonly { sti: string; kilde: string }[]): string[] => {
  const fejl: string[] = [];
  for (const fn of ["export function laesGaClientId(", "export function laesGaSessionId(", "export function laesGa(", "export function gaAf("]) {
    if (!skema.includes(fn)) fejl.push(`${fn} mangler i skema.ts`);
    if (!deno.includes(fn)) fejl.push(`${fn} mangler i _shared`);
  }
  if (gaBlok(skema) === "" || gaBlok(skema) !== gaBlok(deno)) fejl.push("GA-blokken er ikke ordret ens i de to skema-filer");
  const andre = filer.filter((f) => f.sti !== SKEMA && f.sti !== SKEMA_DENO)
    .filter((f) => /["'`]_ga["'`=]|GS2\.|GS1\.|split\("\$"\)/.test(udenKommentarer(f.kilde)));
  for (const f of andre) fejl.push(`${f.sti} læser _ga selv`);
  return fejl;
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ingenGenereredeIder = (skema: string): boolean => {
  const b = gaBlok(skema);
  return b !== "" && !/random|uuid|Date\.now|crypto|Math\./i.test(b) && b.includes("return { ...TOM_GA };");
};

// ── 3 + 4 ──────────────────────────────────────────────────────────────────
export const egenUpdateEfterSporet = (gem: string): string[] => {
  const g = udenKommentarer(gem);
  const fejl: string[] = [];
  const krop = g.slice(g.indexOf("async function gemGa("), g.indexOf("Deno.serve("));
  if (krop === "" || g.indexOf("async function gemGa(") === -1) fejl.push("gemGa findes ikke");
  if (!krop.includes("if (!harGa(ga)) return;")) fejl.push("gemGa skriver også når intet er sat");
  if (!krop.includes('.update({ ga_client_id: ga.client_id, ga_session_id: ga.session_id }).eq("id", id)')) fejl.push("gemGa opdaterer ikke præcis de to kolonner");
  if (/utm_|fbclid|landing|referrer|user_agent|sporMedUserAgent/.test(krop)) fejl.push("gemGa rører annoncesporet eller user agent");
  if (/throw /.test(krop)) fejl.push("gemGa kaster");
  if (!foer(g, "await gemAnnoncespor(adminClient, data.id,", "await gemGa(adminClient, data.id, gaAf(body?.ga));")) fejl.push("gemGa kaldes ikke efter gemAnnoncespor (eller ikke med gaAf)");
  if ((g.match(/await gemGa\(/g) ?? []).length !== 1) fejl.push("gemGa kaldes ikke præcis én gang");
  if (/\.insert\(\{[^}]*ga_/.test(g)) fejl.push("ga_-kolonne i insert'en");
  if (!g.includes(".insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, ...del.svar })")) fejl.push("insert'en er ikke den kendte");
  // Sporets update må ikke bære ga_ — og gemGa's update må ikke bære sporet.
  const sporKrop = g.slice(g.indexOf("async function gemAnnoncespor("), g.indexOf("async function gemGa("));
  if (/ga_client_id|ga_session_id/.test(sporKrop)) fejl.push("annoncesporets update bærer ga_");
  return fejl;
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const ikkeIMetaPayloaden = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  const liste = d.slice(d.indexOf("export const FORBUDTE_NOEGLER"), d.indexOf("] as const;", d.indexOf("export const FORBUDTE_NOEGLER")));
  return liste.includes('"ga_client_id"') && liste.includes('"ga_session_id"');
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const fladenOgBodyen = (side: string, api: string, gem: string): string[] => {
  const s = udenKommentarer(side), a = udenKommentarer(api), g = udenKommentarer(gem);
  const fejl: string[] = [];
  if (!s.includes('const ga = useRef(laesGa(typeof document !== "undefined" ? document.cookie : null));')) fejl.push("Ansoeg.tsx læser ikke document.cookie gennem laesGa ét sted");
  if ((s.match(/document\.cookie/g) ?? []).length !== 1) fejl.push("document.cookie læses flere steder i Ansoeg.tsx");
  if (!s.includes("ga: ga.current,")) fejl.push("«opret» sender ikke ga");
  if (!/opretAnsoegning\(args: \{[^}]*ga: GaOpsamling;/.test(a)) fejl.push("api.ts' opret-type mangler ga");
  const m = /const KENDTE_FELTER = \[([^\]]*)\] as const;/.exec(g);
  if (!m || !m[1].includes('"ga"')) fejl.push("KENDTE_FELTER kender ikke «ga»");
  if (!g.includes("gaAf(body?.ga)")) fejl.push("serveren dømmer ikke med gaAf");
  return fejl;
};

/** GA-afsnittet står ORDRET (godkendt 21/9) lige efter «hvor du kom fra» — og kun én gang. */
export const gaAfsnittetStaarRigtigt = (afsnit: readonly { titel: string; afsnit: readonly string[] }[]): boolean => {
  const gemmer = afsnit.find((x) => x.titel === "Hvad vi gemmer")?.afsnit ?? [];
  const hvorfra = gemmer.findIndex((x) => x.startsWith("Hvor du kom fra"));
  return hvorfra !== -1 && gemmer[hvorfra + 1] === GA_TEKST_ORDRET && gemmer.filter((x) => x === GA_TEKST_ORDRET).length === 1;
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const migrationenErRigtig = (sql: string): boolean => {
  const s = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  return sql.startsWith("-- KØRT i prod — 21/9-2026 kl. 17:01") &&
    /add column if not exists ga_client_id\s+text null,/.test(s) &&
    /add column if not exists ga_session_id text null;/.test(s) &&
    s.includes("comment on column public.ansoegninger.ga_client_id is") &&
    s.includes("comment on column public.ansoegninger.ga_session_id is") &&
    !/drop column/.test(s) && (s.match(/add column if not exists/g) ?? []).length === 2;
};

describe("gaOpsamling.guard — GA's id'er på ansøgningen", () => {
  const filer = alleFiler();
  it("1. parseren findes ét sted (skema.ts, spejlet ordret) — ingen anden fil læser _ga", () => expect(parserenEtSted(laes(SKEMA), laes(SKEMA_DENO), filer)).toEqual([]));
  it("2. ingen genererede id'er — et manglende id er null", () => expect(ingenGenereredeIder(laes(SKEMA))).toBe(true));
  it("3+4. gemGa: egen update efter gemAnnoncespor, kun de to kolonner, kun når sat, kaster aldrig; aldrig i insert'en", () => expect(egenUpdateEfterSporet(laes(GEM))).toEqual([]));
  it("5. ga_client_id og ga_session_id står i FORBUDTE_NOEGLER", () => expect(ikkeIMetaPayloaden(laes(DOM))).toBe(true));
  it("6. fladen læser cookien ét sted og sender «ga»; KENDTE_FELTER og gaAf kender det; GA-afsnittet står ordret lige efter «hvor du kom fra»", () => {
    expect(fladenOgBodyen(laes(SIDE), laes(API), laes(GEM))).toEqual([]);
    expect(gaAfsnittetStaarRigtigt(PERSONDATA_AFSNIT)).toBe(true);
    // Ordet «anonyme» er taget ud med vilje (21/9): id'et genkender samme browser igen.
    expect(GA_TEKST_ORDRET).not.toContain("anonyme");
  });
  it("7. migrationen: bogført KØRT i prod (17:01), præcis de to kolonner med kommentarer", () => expect(migrationenErRigtig(laes(MIG))).toBe(true));
});

describe("gaOpsamling.guard — dommene fanger fejlen på en kopi", () => {
  const skema = laes(SKEMA), deno = laes(SKEMA_DENO), gem = laes(GEM), side = laes(SIDE), api = laes(API), dom = laes(DOM), sql = laes(MIG);
  const filer = alleFiler();
  it("1. en anden fil, der parser _ga selv, eller et spejl, der afviger, fælder dom 1", () => {
    expect(parserenEtSted(skema, deno, [...filer, { sti: "src/x.ts", kilde: 'const id = document.cookie.split("_ga=")[1];' }])).not.toEqual([]);
    expect(parserenEtSted(skema, deno.replace("if (dele.length < 4", "if (dele.length < 3"), filer)).not.toEqual([]);
  });
  it("2. et genereret id (crypto.randomUUID / Date.now) i GA-blokken fælder dom 2", () => {
    expect(ingenGenereredeIder(skema.replace("return { ...TOM_GA };", "return { client_id: crypto.randomUUID(), session_id: String(Date.now()) };"))).toBe(false);
  });
  it("3+4. ga_ i insert'en, gemGa før sporet, eller sporet i samme update fælder dom 3/4", () => {
    expect(egenUpdateEfterSporet(gem.replace(".insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, ...del.svar })", ".insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, ga_client_id: null, ...del.svar })"))).not.toEqual([]);
    const kald = "      await gemGa(adminClient, data.id, gaAf(body?.ga));\n";
    const spor = "      await gemAnnoncespor(adminClient, data.id, annoncesporAf(body?.annoncespor), laesUserAgent(req));\n";
    expect(egenUpdateEfterSporet(gem.replace(kald, "").replace(spor, kald + spor))).not.toEqual([]);
    expect(egenUpdateEfterSporet(gem.replace(".update({ ga_client_id: ga.client_id, ga_session_id: ga.session_id })", ".update({ ...spor, ga_client_id: ga.client_id, ga_session_id: ga.session_id })"))).not.toEqual([]);
    expect(egenUpdateEfterSporet(gem.replace("if (!harGa(ga)) return;", ""))).not.toEqual([]);
  });
  it("5. en liste uden ga_session_id fælder dom 5", () => {
    expect(ikkeIMetaPayloaden(dom.replace('"ga_client_id", "ga_session_id",', '"ga_client_id",'))).toBe(false);
  });
  it("6. «opret» uden ga, KENDTE_FELTER uden «ga», eller GA-afsnittet et andet sted, fælder dom 6", () => {
    expect(fladenOgBodyen(side.replace("ga: ga.current, ", ""), api, gem)).not.toEqual([]);
    expect(fladenOgBodyen(side, api, gem.replace('"annoncespor", "ga", "svar"', '"annoncespor", "svar"'))).not.toEqual([]);
    const gemmer = PERSONDATA_AFSNIT.find((x) => x.titel === "Hvad vi gemmer")!;
    const flyttet = [...gemmer.afsnit.filter((x) => x !== GA_TEKST_ORDRET), GA_TEKST_ORDRET];
    expect(gaAfsnittetStaarRigtigt([{ titel: "Hvad vi gemmer", afsnit: flyttet }])).toBe(false);
    expect(gaAfsnittetStaarRigtigt([{ titel: "Hvad vi gemmer", afsnit: gemmer.afsnit.filter((x) => x !== GA_TEKST_ORDRET) }])).toBe(false);
  });
  it("7. et filhoved tilbage på IKKE KØRT, en tredje kolonne, eller en manglende kommentar fælder dom 7", () => {
    // #1064-formen: mutationen på den FAKTISKE fil — tilbage til «IKKE KØRT» falder, for den ER kørt (17:01).
    expect(migrationenErRigtig(sql.replace("-- KØRT i prod — 21/9-2026 kl. 17:01", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    expect(migrationenErRigtig(sql.replace("add column if not exists ga_session_id text null;", "add column if not exists ga_session_id text null,\n  add column if not exists ga_x text null;"))).toBe(false);
    expect(migrationenErRigtig(sql.replace("comment on column public.ansoegninger.ga_session_id is", "-- comment on column public.ansoegninger.ga_session_id is"))).toBe(false);
  });
});
