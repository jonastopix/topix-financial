import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: kontrakter skrives af sig selv ved indgang og fornyelse (18/9-2026).
// Fire domme:
//   1. Hvert sted webhooken skriver en company_perioder-række (indgang via
//      checkout, indgang via faktura, fornyelse) — og hver gensendelses-gren
//      der fuldfører arbejdet — kalder skrivKontraktraekke: seks kald.
//   2. Skriveren er idempotent: upsert på "company_id,periode_start" med
//      ignoreDuplicates, og den KASTER ALDRIG (intet throw i kroppen; fejl
//      logges) — betalingen må ikke svares 500 for regnskabslagets skyld.
//   3. Rækken bygges kun af den rene funktion i _shared/kontraktRaekke.ts
//      (nul imports; Jonas' regel ordret i filhovedet): pris = beloeb_oere
//      (det fakturerede inkl. tillæg), grundpris = grundbeloeb_oere.
//   4. Bilaget følger med: opretIndgangsPeriode returnerer periodens id, og
//      fornyelsens gensendelses-opslag læser periode_start med.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";
const REN = "supabase/functions/_shared/kontraktRaekke.ts";

/** Dom 1: seks kald — tre første-gangs, tre gensendelser. */
export const seksKald = (w: string): boolean => {
  const kald = w.match(/await skrivKontraktraekke\(adminClient, \{/g) ?? [];
  const gensendelser = w.match(/\}, " \(gensendelse\)"\);/g) ?? [];
  return kald.length === 6 && gensendelser.length === 3 &&
    (w.match(/art: "indgang", stripe_reference: invoiceId,/g) ?? []).length === 2 &&
    (w.match(/art: "indgang", stripe_reference: session\.id,/g) ?? []).length === 2 &&
    (w.match(/art: "fornyelse", stripe_reference: session\.id,/g) ?? []).length === 2;
};

/** Dom 2: idempotent og kaster aldrig. */
export const idempotentOgKasterAldrig = (w: string): boolean => {
  const start = w.indexOf("async function skrivKontraktraekke(");
  if (start === -1) return false;
  const krop = w.slice(start, w.indexOf("\n}\n", start));
  return krop.includes('.from("kontrakter")') &&
    krop.includes('.upsert(bygget.raekke, { onConflict: "company_id,periode_start", ignoreDuplicates: true })') &&
    !/\bthrow\b/.test(krop) &&
    krop.includes("if (bygget.ok === false) {") &&
    krop.includes("} catch (err) {");
};

/** Dom 3: den rene funktion. */
export const renFunktion = (ren: string, renRaa: string, w: string): boolean =>
  !/^\s*import\s/m.test(ren) &&
  renRaa.includes("JONAS 17/9 (ordret): «Prisen er det, der faktisk er faktureret. Grundprisen\n * er det, fornyelsen regner fra.»") &&
  ren.includes("pris_eks_moms_oere: Math.round(input.beloeb_oere),") &&
  ren.includes("grundpris_oere: Math.round(input.grundbeloeb_oere),") &&
  w.includes('import { bygKontraktRaekke, type KontraktInput } from "../_shared/kontraktRaekke.ts";') &&
  w.includes("const bygget = bygKontraktRaekke(input);");

/** Dom 4: bilaget følger med. */
export const bilagetFoelgerMed = (w: string): boolean =>
  w.includes("): Promise<string | null> {\n  const { data, error } = await adminClient.from(\"company_perioder\").insert({") &&
  w.includes('\n  }).select("id").maybeSingle();') && // opretIndgangsPeriode (to mellemrum — fornyelsens insert står dybere)
  (w.match(/const periodeId = await opretIndgangsPeriode\(adminClient, \{/g) ?? []).length === 2 &&
  w.includes('.select("id, periode_start, periode_slut")\n        .eq("stripe_reference", session.id)') &&
  w.includes("periode_id: (nyPeriodeRaekke as { id?: string } | null)?.id ?? null, periode_start, periode_slut,");

describe("kontraktWebhook.guard — kontrakter skrives ved indgang og fornyelse, idempotent, uden at vælte betalingen", () => {
  const w = udenKommentarer(laes(WEBHOOK));
  const renRaa = laes(REN);
  const ren = udenKommentarer(renRaa);

  it("dom 1: seks kald — indgang (faktura, checkout) og fornyelse, hver med gensendelses-gren", () => {
    expect(seksKald(w)).toBe(true);
  });
  it("dom 2: upsert på (company_id, periode_start) med ignoreDuplicates; kaster aldrig", () => {
    expect(idempotentOgKasterAldrig(w)).toBe(true);
  });
  it("dom 3: rækken bygges af den rene funktion med Jonas' regel i filhovedet", () => {
    expect(renFunktion(ren, renRaa, w)).toBe(true);
  });
  it("dom 4: periode_id følger med fra alle tre skrivere", () => {
    expect(bilagetFoelgerMed(w)).toBe(true);
  });

  it("selvbevis 1: et kald færre falder", () => {
    const i = w.indexOf("await skrivKontraktraekke(adminClient, {");
    const j = w.indexOf('}, "");', i);
    expect(seksKald(w.slice(0, i) + w.slice(j + 7))).toBe(false);
  });
  it("selvbevis 2: et throw i skriveren, eller insert uden onConflict, falder", () => {
    expect(idempotentOgKasterAldrig(w.replace("console.error(`[stripe-webhook] kontraktår kunne ikke skrives", "throw new Error(`[stripe-webhook] kontraktår kunne ikke skrives"))).toBe(false);
    expect(idempotentOgKasterAldrig(w.replace('.upsert(bygget.raekke, { onConflict: "company_id,periode_start", ignoreDuplicates: true })', ".insert(bygget.raekke)"))).toBe(false);
  });
  it("selvbevis 3: grundprisen byttet med prisen, eller en import i den rene fil, falder", () => {
    expect(renFunktion(ren.replace("grundpris_oere: Math.round(input.grundbeloeb_oere),", "grundpris_oere: Math.round(input.beloeb_oere),"), renRaa, w)).toBe(false);
    expect(renFunktion('import { x } from "./y.ts";\n' + ren, renRaa, w)).toBe(false);
  });
  it("selvbevis 4: opretIndgangsPeriode uden id falder", () => {
    expect(bilagetFoelgerMed(w.replace('\n  }).select("id").maybeSingle();', "\n  });"))).toBe(false);
  });
});
