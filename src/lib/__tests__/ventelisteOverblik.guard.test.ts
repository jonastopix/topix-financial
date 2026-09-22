import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for ventelisten under Ansøgninger (udkast 22/9-2026). Samme form som
 * `webinarFlade.guard`: fladen tegner en FÆRDIG dom og regner ikke selv.
 *
 *   1. DE TO FLADER BRUGER SAMME DOM. Hverken listen, overblikket eller
 *      ansøgningen kalder `erPladsLedig`, `klarTilTilbud`, `naesteIKoen`,
 *      `harTilbudUde` eller `sorterKoe` — de læser `tilstand` fra
 *      `bygVentelisteOverblik`. Ellers kunne to skærme sige forskelligt om den
 *      SAMME venteplads, og brugeren ville se «kan tilbydes» ét sted og intet
 *      det andet.
 *   2. SAMME KALD SOM I DAG. Begge nye steder tilbyder gennem `tilbydPladsen`
 *      (ventelisteApi → venteliste-handling) — ikke en ny vej, ikke et direkte
 *      skriv til `ventepladser`.
 *   3. GATEN ER DOMMENS. Knappen vises kun ved `tilstand === "kan_tilbydes_nu"`,
 *      og der står ingen egen betingelse om status, dato eller fornyelse ved siden af.
 *   4. DOMMEN ER REN. `ventelisteOverblik.ts` rører hverken supabase, fetch eller
 *      Date.now — tiden gives ind, som huset kræver det.
 *   5. RÆKKEFØLGEN AF TJEK i `tilstandFor` er den, filhovedet beskriver: tilbuddet
 *      først, så pladsens ledighed, så et andet tilbud ude, så «tidligst»-datoen.
 *   6. DATAEN LÆSES ÉN GANG, ikke pr. venteplads (N+1-fælden fra
 *      `hentVentepladserForAnsoegning`, som er rigtig dér og forkert her).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const DOM = "src/lib/ansoegninger/ventelisteOverblik.ts";
const HOOK = "src/hooks/ventelisteOverblik.ts";
const OVERBLIK = "src/components/hjemmebane/ansoegninger/VentelisteOverblik.tsx";
const LISTE = "src/components/hjemmebane/ansoegninger/AnsoegningslisteView.tsx";
const ANSOEGNING = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";

/** Dommene, kun dommen må kalde. */
const DOMME = ["erPladsLedig", "klarTilTilbud", "naesteIKoen", "harTilbudUde", "sorterKoe", "anciennitet"];

// ── 1 ──────────────────────────────────────────────────────────────────────
export const fladenRegnerIkkeSelv = (overblik: string, liste: string, ansoegning: string): boolean => {
  const flader = [overblik, liste, ansoegning].map(udenKommentarer);
  return flader.every((k) => DOMME.every((d) => !new RegExp(`\\b${d}\\s*\\(`).test(k))) &&
    // Overblikket tegner dommens tilstand.
    udenKommentarer(overblik).includes("TILSTAND_ORD[r.tilstand]") &&
    udenKommentarer(ansoegning).includes("TILSTAND_ORD[o.tilstand]");
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const sammeKaldSomIDag = (overblik: string, ansoegning: string): boolean => {
  const o = udenKommentarer(overblik), a = udenKommentarer(ansoegning);
  return o.includes("await tilbydPladsen(r.companyId)") &&
    a.includes("await tilbydPladsen(r.companyId)") &&
    // Ingen af dem skriver til ventepladser udenom.
    [o, a].every((k) => !/from\(\s*["']ventepladser["']/.test(k));
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const gatenErDommens = (overblik: string, ansoegning: string): boolean => {
  const o = udenKommentarer(overblik), a = udenKommentarer(ansoegning);
  return /r\.tilstand === "kan_tilbydes_nu" && \(/.test(o) &&
    a.includes('r.tilstand === "kan_tilbydes_nu"') &&
    // Ingen egen betingelse på status/dato/fornyelse ved siden af knappen.
    [o, a].every((k) => !/tilbud_udloeber_at\s*===|fornyelseStatus\s*===|tidligst_tilbud_at\s*[<>]/.test(k));
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const dommenErRen = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  return !/supabase|fetch\s*\(|Date\.now\(\)|new Date\(\)/.test(d) &&
    // Tiden gives ind.
    /export function bygVentelisteOverblik\([^)]*nu: Date\)/.test(d.replace(/\s+/g, " ")) &&
    /export function tilstandFor\([^)]*nu: Date\)/.test(d.replace(/\s+/g, " "));
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const raekkefoelgenAfTjek = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  const krop = d.slice(d.indexOf("export function tilstandFor"), d.indexOf("export function nummerFor"));
  const i = (s: string) => krop.indexOf(s);
  return i('"tilbudt"') !== -1 &&
    i('"tilbudt"') < i("erPladsLedig") &&
    i("erPladsLedig") < i("harTilbudUde") &&
    i("harTilbudUde") < i("klarTilTilbud");
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const dataenLaesesEnGang = (hook: string): boolean => {
  const h = udenKommentarer(hook);
  // Præcis ét kald til ventepladser — ikke ét pr. plads.
  return (h.match(/from\("ventepladser" as never\)/g) ?? []).length === 1 &&
    // Køen samles i kode.
    h.includes("const koeFor = new Map<string, VentepladsRaekke[]>()") &&
    // Ingen læsning inde i en løkke.
    !/for \([^)]*\) \{[\s\S]{0,400}await supabase/.test(h);
};

describe("ventelisteOverblik — kildeværn", () => {
  it("1. fladen regner ikke selv — begge steder tegner dommens tilstand", () => {
    const o = laes(OVERBLIK), l = laes(LISTE), a = laes(ANSOEGNING);
    expect(fladenRegnerIkkeSelv(o, l, a)).toBe(true);
    // Kalder fladen en dom selv, falder værnet.
    expect(fladenRegnerIkkeSelv(`${o}\nconst x = erPladsLedig(s);`, l, a)).toBe(false);
    expect(fladenRegnerIkkeSelv(o, l, `${a}\nconst y = naesteIKoen(k);`)).toBe(false);
    expect(fladenRegnerIkkeSelv(o.replace(/TILSTAND_ORD\[r\.tilstand\]/g, '"Venter"'), l, a)).toBe(false);
  });

  it("2. begge nye steder tilbyder gennem tilbydPladsen — ingen ny vej", () => {
    const o = laes(OVERBLIK), a = laes(ANSOEGNING);
    expect(sammeKaldSomIDag(o, a)).toBe(true);
    expect(sammeKaldSomIDag(o.replace("await tilbydPladsen(r.companyId)", "await supabase.from('ventepladser').update({})"), a)).toBe(false);
    expect(sammeKaldSomIDag(o, a.replace("await tilbydPladsen(r.companyId)", "await noget()"))).toBe(false);
  });

  it("3. gaten er dommens «kan_tilbydes_nu», ikke en egen betingelse", () => {
    const o = laes(OVERBLIK), a = laes(ANSOEGNING);
    expect(gatenErDommens(o, a)).toBe(true);
    expect(gatenErDommens(o.replace(/r\.tilstand === "kan_tilbydes_nu" && \(/g, "true && ("), a)).toBe(false);
    expect(gatenErDommens(`${o}\nconst z = r.fornyelseStatus === "ophoert";`, a)).toBe(false);
  });

  it("4. dommen er ren — ingen supabase, ingen fetch, tiden gives ind", () => {
    const d = laes(DOM);
    expect(dommenErRen(d)).toBe(true);
    expect(dommenErRen(`${d}\nconst n = new Date();`)).toBe(false);
    expect(dommenErRen(d.replace("nu: Date): Ventepladstilstand", "): Ventepladstilstand"))).toBe(false);
  });

  it("5. rækkefølgen af tjek i tilstandFor er den, filhovedet beskriver", () => {
    const d = laes(DOM);
    expect(raekkefoelgenAfTjek(d)).toBe(true);
    // Flyttes ledigheds-tjekket før «tilbudt», ville et sendt tilbud forsvinde
    // fra skærmen i samme øjeblik virksomheden fornyede — netop mens fristen løb.
    const byttet = d.replace(
      'if (i.venteplads.status === "tilbudt") return "tilbudt";\n  if (!erPladsLedig(i.fornyelseStatus)) return "venter_paa_plads";',
      'if (!erPladsLedig(i.fornyelseStatus)) return "venter_paa_plads";\n  if (i.venteplads.status === "tilbudt") return "tilbudt";',
    );
    expect(raekkefoelgenAfTjek(byttet)).toBe(false);
  });

  it("6. dataen læses én gang — ikke ét kald pr. venteplads", () => {
    const h = laes(HOOK);
    expect(dataenLaesesEnGang(h)).toBe(true);
    expect(dataenLaesesEnGang(h.replace("const koeFor = new Map<string, VentepladsRaekke[]>()", "const koeFor = lav()"))).toBe(false);
  });
});
