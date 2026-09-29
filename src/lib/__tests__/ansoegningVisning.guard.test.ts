import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPOR_KOLONNER, VISNINGS_TRIN as SERVER_TRIN } from "../../../supabase/functions/_shared/ansoegningVisning";
import { VISNINGS_TRIN as KLIENT_TRIN } from "@/lib/ansoegning/visning";

/**
 * Kildeværn for sporet før ansøgningen (udkast 28/9-2026). Syv domme, hver
 * bevist nedenfor på en kopi med fejlen indsat:
 *
 *   1. SIDEN VENTER ALDRIG: sporVisning returnerer void og fanger sin egen
 *      afvisning; Ansoeg.tsx afventer eller kæder aldrig på sporet, og kalder
 *      det kun gennem engangs-sporeren.
 *   2. INGEN PERSONDATA: tabellens kolonner er SPOR_KOLONNER + id, ansoegning_id,
 *      created_at — og ingen af dem hedder noget med e-mail, navn, telefon, CVR,
 *      svar, token eller rå IP. Klientens krop er de seks nøgler, intet andet.
 *   3. TOKEN-FRI: grenen «spor» står FØR token-prædikatet i ansoegning-gem, og
 *      hverken grenen eller klientens krop nævner et token.
 *   4. RATE-GRÆNSE FØR SKRIVNING, FAIL-CLOSED: loftetNaaet dømmes før upsert'en,
 *      og tællingen svarer null (= loftet nået), når den fejler.
 *   5. ID'ET KUN I HUKOMMELSEN: visnings-id'et laves med useRef(nytVisningsId()),
 *      og hverken visning.ts eller sporets linjer i Ansoeg.tsx rører localStorage,
 *      sessionStorage eller document.cookie.
 *   6. TRINENE ER ÉN LISTE: klientens, serverens og migrationens CHECK er ens.
 *   7. SPORET RØRER ALDRIG ANSOEGNINGER, og migrationen er bogført
 *      «-- KØRT i prod — …målt kørt 29/9-2026 kl. 14:26» (vendt 29/9; var
 *      «-- IKKE KØRT. DEPLOY:», CLAUDE.md 19/9-lærdommen, indtil kørslen var målt).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/ [^\n]*/g, "");

const API = "src/lib/ansoegning/api.ts";
const SIDE = "src/pages/Ansoeg.tsx";
const KLIENT = "src/lib/ansoegning/visning.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const MIGRATION = "supabase/migrations/20260928170000_ansoegning_visninger.sql";

const sporFunktion = (api: string): string => {
  const i = api.indexOf("export function sporVisning(");
  if (i === -1) return "";
  const j = api.indexOf("\n}\n", i);
  return j === -1 ? "" : api.slice(i, j + 2);
};
const sporGren = (gem: string): string => {
  const i = gem.indexOf('if (handling === "spor") {');
  const j = gem.indexOf('if (handling === "opret") {');
  return i === -1 || j === -1 || j < i ? "" : gem.slice(i, j);
};
const tabelKolonner = (sql: string): string[] => {
  const m = /create table if not exists public\.ansoegning_visninger \(([\s\S]*?)\n\);/.exec(sql);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[a-z_]+ /.test(l) && !l.startsWith("constraint"))
    .map((l) => l.split(" ")[0]);
};

// ── 1 ──────────────────────────────────────────────────────────────────────
export const sidenVenterAldrig = (api: string, side: string): boolean => {
  const f = sporFunktion(udenKommentarer(api));
  const s = udenKommentarer(side);
  const kaldAfSpor = [...s.matchAll(/sporVisning\(/g)].length;
  return (
    /export function sporVisning\([^)]*\): void \{/.test(f) &&
    f.includes(".catch(() => undefined);") &&
    !/\breturn\b/.test(f) &&
    !/await\s+(spor|sporVisning)/.test(s) &&
    !/spor\.current\([^)]*\)\s*\./.test(s) &&
    kaldAfSpor === 1 &&
    s.includes("lavSporer((trin) => sporVisning(")
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
const FORBUDT = /mail|navn|telefon|phone|cvr|svar|token|^ip$|ip_adresse|adresse/;
export const ingenPersondata = (sql: string, api: string): boolean => {
  const kolonner = tabelKolonner(sql);
  const forventet = ["id", ...SPOR_KOLONNER, "ansoegning_id", "created_at"].sort();
  const krop = /kald\("ansoegning-gem", \{ ([^}]*) \}\)/.exec(sporFunktion(udenKommentarer(api)))?.[1] ?? "";
  const noegler = krop.split(",").map((d) => d.trim().split(":")[0].trim()).sort();
  return (
    JSON.stringify([...kolonner].sort()) === JSON.stringify(forventet) &&
    !kolonner.some((k) => FORBUDT.test(k)) &&
    JSON.stringify(noegler) === JSON.stringify(["annoncespor", "handling", "kilde", "kilde_raa", "trin", "visning_id"])
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const tokenFri = (gem: string, api: string): boolean => {
  const g = udenKommentarer(gem);
  const gren = sporGren(g);
  const prædikat = g.indexOf("verifyAnsoegningstoken(token");
  return gren !== "" && prædikat !== -1 && g.indexOf(gren) < prædikat && !/token/i.test(gren) && !/token/i.test(sporFunktion(udenKommentarer(api)));
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const loftFoerSkrivning = (gem: string): boolean => {
  const g = udenKommentarer(gem);
  const gren = sporGren(g);
  const loft = gren.indexOf("loftetNaaet(");
  const skriv = gren.indexOf(".upsert(");
  const tael = g.slice(g.indexOf("async function sporSidsteTime("), g.indexOf("async function koblVisning("));
  return loft !== -1 && skriv !== -1 && loft < skriv && /if \(error\) \{[\s\S]*?return null;/.test(tael);
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const idKunIHukommelsen = (klient: string, side: string): boolean => {
  const k = udenKommentarer(klient);
  const s = udenKommentarer(side);
  const sporLinjer = s.split("\n").filter((l) => /visningsId|spor\.current|lavSporer|nytVisningsId/.test(l)).join("\n");
  const lager = /localStorage|sessionStorage|document\.cookie|indexedDB/;
  return s.includes("const visningsId = useRef(nytVisningsId());") && !lager.test(k) && !lager.test(sporLinjer);
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const trinEns = (klient: readonly string[], server: readonly string[], sql: string): boolean => {
  const m = /check \(trin in \(([^)]*)\)\)/.exec(sql);
  const sqlTrin = m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [];
  return JSON.stringify([...klient]) === JSON.stringify([...server]) && JSON.stringify([...server]) === JSON.stringify(sqlTrin);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const roererIkkeAnsoegninger = (gem: string, sql: string): boolean =>
  !sporGren(udenKommentarer(gem)).includes('.from("ansoegninger")') &&
  sporGren(udenKommentarer(gem)).includes('.from("ansoegning_visninger")') &&
  sql.split("\n")[0].startsWith("-- KØRT i prod — kørselstidspunkt ikke bogført; målt kørt 29/9-2026 kl. 14:26") &&
  sql.split("\n")[0].includes("kolonner 17 · rls_slaaet_til true · policies 0");

describe("sporet før ansøgningen — kildeværn", () => {
  const api = laes(API), side = laes(SIDE), klient = laes(KLIENT), gem = laes(GEM), sql = laes(MIGRATION);
  it("1. siden venter aldrig på sporet", () => expect(sidenVenterAldrig(api, side)).toBe(true));
  it("2. ingen persondata — tabel og krop", () => expect(ingenPersondata(sql, api)).toBe(true));
  it("3. token-fri", () => expect(tokenFri(gem, api)).toBe(true));
  it("4. rate-grænsen dømmes før skrivningen, og tællingen er fail-closed", () => expect(loftFoerSkrivning(gem)).toBe(true));
  it("5. visnings-id'et lever kun i sidens hukommelse", () => expect(idKunIHukommelsen(klient, side)).toBe(true));
  it("6. trinene er én liste — klient, server og CHECK", () => expect(trinEns(KLIENT_TRIN, SERVER_TRIN, sql)).toBe(true));
  it("7. sporet rører aldrig ansoegninger, og migrationen er bogført KØRT (målt 29/9 14:26)", () => expect(roererIkkeAnsoegninger(gem, sql)).toBe(true));
});

describe("sporet før ansøgningen — værnet fælder (selvbevis på kopier)", () => {
  const api = laes(API), side = laes(SIDE), klient = laes(KLIENT), gem = laes(GEM), sql = laes(MIGRATION);

  it("et spor, der returnerer et løfte, mangler sin catch, eller afventes, fælder dom 1", () => {
    expect(sidenVenterAldrig(api.split("annoncespor: Annoncespor): void {").join("annoncespor: Annoncespor): Promise<unknown> {"), side)).toBe(false);
    expect(sidenVenterAldrig(api.split(".catch(() => undefined);").join(";"), side)).toBe(false);
    expect(sidenVenterAldrig(api, side.split('spor.current("start");').join('await spor.current("start");'))).toBe(false);
    expect(sidenVenterAldrig(api, side.split('spor.current("vist");\n      return;').join('sporVisning(visningsId.current, "vist", kilde.current.kilde, null, annoncespor.current);\n      return;'))).toBe(false);
  });

  it("en kolonne med e-mail eller rå IP, eller et ekstra felt i kroppen, fælder dom 2", () => {
    expect(ingenPersondata(sql.split("  user_agent text,").join("  user_agent text,\n  email text,"), api)).toBe(false);
    expect(ingenPersondata(sql.split("  ip_hash text not null,").join("  ip text not null,"), api)).toBe(false);
    expect(ingenPersondata(sql, api.split("trin, kilde, kilde_raa: kildeRaa, annoncespor })").join("trin, kilde, kilde_raa: kildeRaa, annoncespor, email })"))).toBe(false);
  });

  it("en spor-gren efter token-prædikatet, eller et token i kroppen, fælder dom 3", () => {
    const gren = sporGren(gem);
    const flyttet = gem.split(gren).join("").split("const ansoegning = await verifyAnsoegningstoken(token, adminClient);").join(`const ansoegning = await verifyAnsoegningstoken(token, adminClient);\n    ${gren}`);
    expect(tokenFri(flyttet, api)).toBe(false);
    expect(tokenFri(gem, api.split('{ handling: "spor", visning_id').join('{ handling: "spor", token: laesLokaltToken(), visning_id'))).toBe(false);
  });

  it("et loft efter skrivningen, uden loft, eller en tælling der svarer 0 ved fejl, fælder dom 4", () => {
    const g = sporGren(gem);
    const loftBlok = g.slice(g.indexOf("if (loftetNaaet("), g.indexOf("const { error } = await adminClient"));
    const efter = gem.split(loftBlok).join("").split('return jsonResponse({ ok: true });\n    }\n\n    // ── OPRET').join(`${loftBlok}return jsonResponse({ ok: true });\n    }\n\n    // ── OPRET`);
    expect(loftFoerSkrivning(efter)).toBe(false);
    expect(loftFoerSkrivning(gem.split(loftBlok).join(""))).toBe(false);
    expect(loftFoerSkrivning(gem.split('console.error("[ansoegning-gem] spor-tællingen fejlede:", error.message);\n    return null;').join('console.error("[ansoegning-gem] spor-tællingen fejlede:", error.message);\n    return 0;'))).toBe(false);
  });

  it("et id i localStorage, eller uden useRef, fælder dom 5", () => {
    expect(idKunIHukommelsen(klient.split("export function nytVisningsId(): string {").join('export function nytVisningsId(): string {\n  const gemt = localStorage.getItem("visning");'), side)).toBe(false);
    expect(idKunIHukommelsen(klient, side.split("const visningsId = useRef(nytVisningsId());").join('const visningsId = useRef(localStorage.getItem("v") ?? nytVisningsId());'))).toBe(false);
  });

  it("et trin i den ene liste, der mangler i en anden, fælder dom 6", () => {
    expect(trinEns([...KLIENT_TRIN, "sendt"], SERVER_TRIN, sql)).toBe(false);
    expect(trinEns(KLIENT_TRIN, SERVER_TRIN, sql.split("'vist', 'start', 'tastet'").join("'vist', 'start'"))).toBe(false);
  });

  it("en spor-gren, der skriver i ansoegninger, en migration uden KØRT-linjen eller tilbage på IKKE KØRT, fælder dom 7", () => {
    expect(roererIkkeAnsoegninger(gem.split('.from("ansoegning_visninger")\n        .upsert(').join('.from("ansoegninger")\n        .upsert('), sql)).toBe(false);
    expect(roererIkkeAnsoegninger(gem, sql.split("\n").slice(1).join("\n"))).toBe(false);
    const tilbage = ["-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).", ...sql.split("\n").slice(1)].join("\n");
    expect(roererIkkeAnsoegninger(gem, tilbage)).toBe(false);
  });
});
