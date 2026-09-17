import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026, rådgivernes forside PR 5 — «Ikke relevant» på
// tilstandslinjerne; analyse-raadgivernes-forside.md §3.1 pkt. 3 / §6
// forslag 6). Fire domme, læst i kilden:
//   1. DOMMEN (forsidensDom.ts): Tilstandslinje.virksomheder bærer hver sit
//      grundlag ({nøgle: grundlag}), og samlingen skriver det fra grunden.
//   2. LÆSNINGEN (lib/opgaveLukning.ts + AdvisorDashboard.tsx): en
//      virksomheds kvitteringer FLETTES (fletKvitteringer, nyeste vinder pr.
//      nøgle) — datalaget springer ikke længere ældre rækker over.
//   3. FLADEN (RaadgiverForsideView.tsx): tilstandsgrenen er en fold
//      (TilstandFold) med kvittering pr. navn (`onLuk(t, udfald, v.companyId)`)
//      og de to ord for hele linjen; mutationen har en tilstand-gren der
//      lukker pr. virksomhed med DENS grundlag (`kun` filtrerer til ét navn);
//      tilstandene under stregen har samme fold og ord; puklen har INGEN ord.
//   4. DESIGNET (docs/forsiden-design.md §7) bærer regelen.
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const DOM = "src/lib/forsidensDom.ts";
const LIB = "src/lib/opgaveLukning.ts";
const DATALAG = "src/components/AdvisorDashboard.tsx";
const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const DESIGN = "docs/forsiden-design.md";

/** Dom 1. */
export const tilstandenBaererGrundlag = (dom: string): boolean => {
  const type = dom.slice(dom.indexOf("export interface Tilstandslinje {"), dom.indexOf("export interface Pukkellinje {"));
  return (
    type.includes("virksomheder: { companyId: string; navn: string; grund: Grund; grundlag: Record<string, string> }[];") &&
    dom.includes("liste.push({ companyId: v.companyId, navn: v.navn, grund: g, grundlag: { [g.noegle]: g.grundlag } });")
  );
};

/** Dom 2. */
export const kvitteringerneFlettes = (lib: string, datalag: string): boolean => {
  const flet = lib.slice(lib.indexOf("export function fletKvitteringer("), lib.indexOf("export function laesKvittering("));
  return (
    flet.includes("if (!(noegle in grundlag)) grundlag[noegle] = g;") &&
    flet.includes("return { udfald: nyesteFoerst[0].udfald, grundlag, lukketAt: nyesteFoerst[0].lukketAt };") &&
    datalag.includes('import { fletKvitteringer, laesKvittering, type Kvittering } from "@/lib/opgaveLukning";') &&
    datalag.includes("const k = fletKvitteringer(liste);") &&
    !datalag.includes("kvitteringByCompany.has(r.company_id)) continue;")
  );
};

/** Blokken for tilstanden i DomLinje: fra `if (l.linje === "tilstand") {` til puklens return. */
function tilstandBlok(flade: string): string {
  const start = flade.indexOf('if (l.linje === "tilstand") {');
  const slut = flade.indexOf("export const RaadgiverForsideView = () => {", start);
  return start === -1 || slut === -1 ? "" : flade.slice(start, slut);
}

/** Dom 3. */
export const fladenKvittererTilstande = (flade: string): boolean => {
  const fold = flade.slice(flade.indexOf("const TilstandFold = ("), flade.indexOf("const DomLinje = ("));
  const blok = tilstandBlok(flade);
  const pukkel = blok.slice(blok.lastIndexOf("return ("));
  const mut = flade.slice(flade.indexOf('} else if (input.linje.linje === "tilstand") {'), flade.indexOf("await invaliderForsiden(queryClient);"));
  const under = flade.slice(flade.indexOf("{under.tilstande.map((t) => ("), flade.indexOf("{under.pukler.map((p) => ("));
  return (
    fold.includes("<details className=") &&
    fold.includes("to={samletLinjeLink(t)}") &&
    fold.includes("<Link to={grundLink(v.companyId, v.grund.slags)} className={TEKSTLINK}>") &&
    fold.includes("onClick={() => onLuk(t, udfald, v.companyId)}") &&
    blok.includes("<TilstandFold t={l} onLuk={onLuk} lukker={lukker}") &&
    blok.includes("onClick={() => onLuk(l, udfald)}") &&
    !pukkel.includes("LUKNINGS_UDFALD") &&
    mut.includes("const liste = input.kun ? input.linje.virksomheder.filter((v) => v.companyId === input.kun) : input.linje.virksomheder;") &&
    mut.includes("await lukOpgave({ companyId: v.companyId, advisorId: user.id, udfald: input.udfald, grundlag: v.grundlag });") &&
    under.includes("<TilstandFold t={t}") &&
    under.includes("onClick={() => lukning.mutate({ linje: t, udfald })}")
  );
};

/** Dom 4. */
export const designetBaererRegelen = (design: string): boolean =>
  design.includes("**Også på tilstandslinjerne (rådgivernes forside PR 5, 17/9") &&
  design.includes("FLETTES dens kvitteringer (nyeste vinder pr. nøgle)");

describe("forsideTilstandLukning.guard — «Ikke relevant» og «Færdiggjort» på tilstandslinjerne, pr. virksomhed", () => {
  const dom = udenKommentarer(laes(DOM));
  const lib = udenKommentarer(laes(LIB));
  const datalag = udenKommentarer(laes(DATALAG));
  const flade = udenKommentarer(laes(FLADE));
  const design = laes(DESIGN);

  it("1. dommen: hver virksomhed i en tilstandslinje bærer sit grundlag for netop tilstanden", () => {
    expect(tilstandenBaererGrundlag(dom)).toBe(true);
  });
  it("2. læsningen: kvitteringerne flettes — nyeste vinder pr. nøgle; datalaget springer ingen række over", () => {
    expect(kvitteringerneFlettes(lib, datalag)).toBe(true);
  });
  it("3. fladen: fold med kvittering pr. navn og for hele linjen, over og under stregen; mutationen lukker pr. virksomhed; puklen har ingen ord", () => {
    expect(fladenKvittererTilstande(flade)).toBe(true);
  });
  it("4. designet §7 bærer regelen", () => {
    expect(designetBaererRegelen(design)).toBe(true);
  });
});

describe("forsideTilstandLukning.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const dom = udenKommentarer(laes(DOM));
  const lib = udenKommentarer(laes(LIB));
  const datalag = udenKommentarer(laes(DATALAG));
  const flade = udenKommentarer(laes(FLADE));
  const design = laes(DESIGN);

  it("1. samlingen uden grundlag (den gamle form) fælder dom 1", () => {
    // Før PR 5 ordret: `liste.push({ companyId: v.companyId, navn: v.navn, grund: g });`
    expect(tilstandenBaererGrundlag(dom.replace("liste.push({ companyId: v.companyId, navn: v.navn, grund: g, grundlag: { [g.noegle]: g.grundlag } });", "liste.push({ companyId: v.companyId, navn: v.navn, grund: g });"))).toBe(false);
  });
  it("2. datalaget der kun tager den nyeste række (den gamle form), eller en flet hvor den ældste vinder, fælder dom 2", () => {
    // Før PR 5 ordret: `if (!r.company_id || kvitteringByCompany.has(r.company_id)) continue;`
    expect(kvitteringerneFlettes(lib, datalag.replace("if (!r.company_id) continue;", "if (!r.company_id || kvitteringByCompany.has(r.company_id)) continue;"))).toBe(false);
    expect(kvitteringerneFlettes(lib.replace("if (!(noegle in grundlag)) grundlag[noegle] = g;", "grundlag[noegle] = g;"), datalag)).toBe(false);
  });
  it("3. en tilstand uden fold, uden kvittering pr. navn, en mutation der lukker alle uanset `kun`, ord på puklen, eller tilstande under stregen uden ord, fælder dom 3", () => {
    expect(fladenKvittererTilstande(flade.replace("<TilstandFold t={l} onLuk={onLuk} lukker={lukker}", "<span"))).toBe(false);
    expect(fladenKvittererTilstande(flade.replace("onClick={() => onLuk(t, udfald, v.companyId)}", "onClick={() => onLuk(t, udfald)}"))).toBe(false);
    expect(fladenKvittererTilstande(flade.replace("const liste = input.kun ? input.linje.virksomheder.filter((v) => v.companyId === input.kun) : input.linje.virksomheder;", "const liste = input.linje.virksomheder;"))).toBe(false);
    const blok = tilstandBlok(flade);
    const medOrdPaaPuklen = flade.replace(blok, blok.replace('<span className="block text-[15px] leading-snug text-hb-ink">{l.tekst}</span>', '<span className="block text-[15px] leading-snug text-hb-ink">{l.tekst}</span>{LUKNINGS_UDFALD.map((u) => u)}'));
    expect(medOrdPaaPuklen).not.toBe(flade);
    expect(fladenKvittererTilstande(medOrdPaaPuklen)).toBe(false);
    expect(fladenKvittererTilstande(flade.replace("onClick={() => lukning.mutate({ linje: t, udfald })}", "onClick={() => undefined}"))).toBe(false);
  });
  it("4. et design uden regelen fælder dom 4", () => {
    expect(designetBaererRegelen(design.replace("FLETTES dens kvitteringer (nyeste vinder pr. nøgle)", "…"))).toBe(false);
  });
});
