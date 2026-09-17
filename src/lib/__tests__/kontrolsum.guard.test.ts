import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: kontrolsummen som ÉT tal pr. rapport (17/9-2026). Fem domme:
//   1. omkostningsnoegler.ts (begge spejle): kontrolsum() regner resultat − (omsætning + andre
//      driftsindtægter + finansielle indtægter − Σ|alle omkostninger|), grænserne 5 % / 10.000 kr.
//   2. rimelighed.ts (begge spejle): fjerde tjek resultat_udaekket med tekst og felter; «vendt»
//      kræver to driftsgrupper; tjek 1 nøjes med loggen når kontrolsummen forklarer afvigelsen.
//   3. Motoren: begge canonical-outputs bærer kontrolsum: kontrolsum(metrics, OMK); typen har feltet.
//   4. extract-financial-data: quality_signals.udaekket = canonical.kontrolsum (og null på
//      early-exit-vejen) — gemmes ALTID.
//   5. Virksomhedssiden: RapportTal får kontrolsummen fra rapportens quality_signals og viser
//      udaekketLinje (kun over grænsen).
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const OMK = ["supabase/functions/_shared/omkostningsnoegler.ts", "src/lib/omkostningsnoegler.ts"];
const RIM = ["supabase/functions/_shared/rimelighed.ts", "src/lib/rimelighed.ts"];
const ENGINE = "supabase/functions/_shared/canonicalEngine.ts";
const TYPES = "supabase/functions/_shared/canonicalTypes.ts";
const INDEX = "supabase/functions/extract-financial-data/index.ts";
const VIEW = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";

/** Dom 1. */
export const modulet = (o: string): boolean =>
  o.includes("export const UDAEKKET_GRAENSE_PCT = 0.05;") &&
  o.includes("export const UDAEKKET_GRAENSE_KR = 10_000;") &&
  o.includes('export const KONTROLSUM_KILDE = "grupper_mod_resultat" as const;') &&
  o.includes("const regnet = basis + andreDriftsindtaegter(m, s) + finansielleIndtaegter(m, s) - drift.sum - (finans === null ? 0 : Math.abs(finans));") &&
  o.includes("    : daekningsbidrag !== null ? daekningsbidrag : Math.abs(omsaetning);") &&
  o.includes("const udaekket = Math.round(resultat - regnet);") &&
  o.includes("if (abs > UDAEKKET_GRAENSE_KR) return true;") &&
  o.includes("return k.udaekket_pct_af_omsaetning !== null && Math.abs(k.udaekket_pct_af_omsaetning) > UDAEKKET_GRAENSE_PCT;") &&
  o.includes('  omsaetning: "revenue",\n  daekningsbidrag: "gross_profit",\n  resultat: "ebt",');

/** Dom 2. */
export const fjerdeTjek = (r: string): boolean =>
  r.includes('import { CANONICAL as OMK, ANDEL_NOEGLER_TIL_RIMELIGHED, ebtRegnet, kontrolsum, sumOmkostninger, udaekketErStort, udaekketTekst } from "./omkostningsnoegler.ts";') &&
  r.includes('name: "ebt_reconciles" | "result_vs_revenue" | "magnitude_plausibility" | "resultat_udaekket";') &&
  r.includes("const ks = kontrolsum(m, OMK);") &&
  r.includes('vendt = Math.abs(beregnet + ebt) <= tolerance && sumOmkostninger(m, OMK, "drift").fundet >= 2;') &&
  r.includes("const forklaretAfKontrolsummen = !vendt && udaekketStort;") &&
  r.includes('      name: "resultat_udaekket",\n      result: "WARN",') &&
  r.includes("      tekst: udaekketTekst(ks),\n      felter: [\"ebt\"],");

/** Dom 3. */
export const motoren = (e: string, t: string): boolean =>
  e.includes('import { CANONICAL as OMK, ebitdaRegnet, kontrolsum } from "./omkostningsnoegler.ts";') &&
  (e.match(/kontrolsum: kontrolsum\(metrics, OMK\),/g) ?? []).length === 2 &&
  t.includes("kontrolsum: Kontrolsum | null;");

/** Dom 4. */
export const gemmes = (i: string): boolean =>
  i.includes("udaekket: canonical.kontrolsum ?? null,") &&
  i.includes("      canonical_checks: [],\n      udaekket: null,");

/** Dom 5. */
export const siden = (v: string): boolean =>
  v.includes('import { type Kontrolsum, kontrolsumAf, udaekketLinje } from "@/lib/omkostningsnoegler";') &&
  v.includes("const udaekketTekst = udaekketLinje(udaekket);") &&
  v.includes("<RapportTal fact={fact} forrige={forrige} udaekket={kontrolsumAf(r.quality_signals)} />") &&
  v.includes("{udaekketTekst && <p className=\"text-xs text-hb-ink-soft sm:col-span-3\" data-udaekket={udaekket?.udaekket}>{udaekketTekst}</p>}");

describe("kontrolsum.guard — ét tal pr. rapport, sagt højt når det er stort", () => {
  const o = OMK.map((f) => udenKommentarer(laes(f)));
  const r = RIM.map((f) => udenKommentarer(laes(f)));
  const e = udenKommentarer(laes(ENGINE));
  const t = udenKommentarer(laes(TYPES));
  const i = udenKommentarer(laes(INDEX));
  const v = udenKommentarer(laes(VIEW));

  it("dom 1: modulet — begge spejle", () => { for (const x of o) expect(modulet(x)).toBe(true); });
  it("dom 2: det fjerde tjek — begge spejle", () => { for (const x of r) expect(fjerdeTjek(x)).toBe(true); });
  it("dom 3: motoren bærer kontrolsummen i begge outputs", () => { expect(motoren(e, t)).toBe(true); });
  it("dom 4: quality_signals.udaekket gemmes altid", () => { expect(gemmes(i)).toBe(true); });
  it("dom 5: virksomhedssiden viser linjen ved månedens tal", () => { expect(siden(v)).toBe(true); });

  it("selvbevis 1: en anden grænse, eller finansielle indtægter ude af regnestykket, falder", () => {
    expect(modulet(o[0].replace("UDAEKKET_GRAENSE_KR = 10_000", "UDAEKKET_GRAENSE_KR = 50_000"))).toBe(false);
    expect(modulet(o[0].replace(" + finansielleIndtaegter(m, s) - drift.sum", " - drift.sum"))).toBe(false);
  });
  it("selvbevis 2: tjek 4 uden tekst, eller «vendt» uden to-gruppers-kravet, falder", () => {
    expect(fjerdeTjek(r[0].replace("      tekst: udaekketTekst(ks),\n      felter: [\"ebt\"],", "      tekst: \"\",\n      felter: [\"ebt\"],"))).toBe(false);
    expect(fjerdeTjek(r[0].replace(' && sumOmkostninger(m, OMK, "drift").fundet >= 2;', ";"))).toBe(false);
  });
  it("selvbevis 3–5: motoren uden kontrolsum i ét output, quality_signals uden tallet, siden uden linjen falder", () => {
    expect(motoren(e.replace("kontrolsum: kontrolsum(metrics, OMK),", ""), t)).toBe(false);
    expect(gemmes(i.replace("udaekket: canonical.kontrolsum ?? null,", ""))).toBe(false);
    expect(siden(v.replace("const udaekketTekst = udaekketLinje(udaekket);", "const udaekketTekst = null;"))).toBe(false);
  });
});
