/**
 * Kildeværn for «de tre sidste skabeloner» (17/9-2026): Dinero CSV/PDF og generic PDF fordeler via
 * kontogrupper.ts (netto med fortegn, kredit-netto → indtægt, uklassificeret → øvrige, kontrolsum), og
 * XLSX-P&L + combined via subtotalGrupper.ts (finansielle indtægter, øvrige omkostninger, kredit-netto,
 * grupper uden nøgle bevist af resultatlinjen). Værnet læser KILDEN og fælder hvis nogen genindfører
 * `Math.abs(sums[...])` pr. klasse, springer uklassificerede linjer over igen, fjerner de to nøgler fra
 * motorens legacy-map, eller lader Dinero-profilen abs'e/vende de positive dele igen.
 *
 * SELVBEVIS: hvert prædikat køres også på en muteret kopi af kilden, hvor bruddet er lagt ind — og skal
 * fælde dér. Et værn der ikke kan fælde beviser ingenting.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rod = resolve(__dirname, "../../..");
const laes = (sti: string) => readFileSync(resolve(rod, sti), "utf8");

const FILER = {
  kontogrupper: "supabase/functions/_shared/kontogrupper.ts",
  subtotal: "supabase/functions/_shared/subtotalGrupper.ts",
  csv: "supabase/functions/_shared/templates/dkDineroResultatopgoerelseCsvV1.ts",
  dineroPdf: "supabase/functions/_shared/templates/dkDineroResultatopgoerelsePdfV1.ts",
  genericPdf: "supabase/functions/_shared/templates/dkGenericResultatopgoerelsePdfV1.ts",
  xlsx: "supabase/functions/_shared/templates/dkEconomicResultatopgoerelseXlsxV1.ts",
  combined: "supabase/functions/_shared/templates/dkCombinedBalancePnlV1.ts",
  engine: "supabase/functions/_shared/canonicalEngine.ts",
  profiler: "supabase/functions/_shared/normalizationProfiles.ts",
} as const;

// ── Prædikaterne (rene, så selvbeviset kan køre dem på muteret kilde) ──

/** Kontoskabelonerne fordeler via modulet og abs'er ikke klassernes netto. */
const fordelerViaModul = (kilde: string) =>
  /import \{[^}]*fordelKontogrupper[^}]*\} from "\.\.\/kontogrupper\.ts"/.test(kilde) &&
  /fordelKontogrupper\(/.test(kilde) &&
  !/Math\.abs\(sums\[/.test(kilde) &&
  !/Math\.abs\(sums\.[a-z_]+\)/.test(kilde) &&
  /kontrolsumTjek\(fordeling\)/.test(kilde);

/** Ingen linje springes over ved klassen «unclassified» i fordelingen. */
const springerIkkeOver = (kilde: string) => !/if \(line\.cls === "unclassified"\) continue;/.test(kilde);

/** Motorens legacy-map kender de to nøgler. */
const legacyMapHarNoegler = (kilde: string) => {
  const i = kilde.indexOf("KF_TO_CANONICAL");
  const blok = kilde.slice(i, kilde.indexOf("};", i));
  return /oevrige_omkostninger: "other_costs"/.test(blok) && /andre_driftsindtaegter: "other_operating_income"/.test(blok);
};

/** Dinero-profilen: omsætning vendes (NEGATE), omkostninger ABS (no-op på de positive dele; omkostningsFortegn.guard), indtægterne KEEP, net KEEP. */
const dineroProfilHolder = (kilde: string) => {
  const i = kilde.indexOf('profile_id: "dinero_pnl_credit_v1"');
  const blok = kilde.slice(i, kilde.indexOf("\n};", i));
  return /revenue_like:\s+NEGATE/.test(blok) && /cost_like:\s+ABS/.test(blok) &&
    /andre_driftsindtaegter: \{ action: "keep"/.test(blok) && /finansielle_indtaegter: \{ action: "keep"/.test(blok) &&
    /resultat_efter_skat: KEEP_DERIVED/.test(blok);
};

/** Subtotal-skabelonerne fordeler via subtotalGrupper og lægger kontrolsummen i tjekkene. */
const subtotalViaModul = (kilde: string) =>
  /from "\.\.\/subtotalGrupper\.ts"/.test(kilde) && /fordelSubtotaler\(gruppeRaekker, signConvention, "(first|last)"\)/.test(kilde) &&
  /checks\.push\(fordeling\.kontrolsum\)/.test(kilde) &&
  /key: "finansielle_indtaegter", pattern: FINANSIELLE_INDTAEGTER_RE/.test(kilde) &&
  /key: "oevrige_omkostninger", pattern: OEVRIGE_OMKOSTNINGER_RE/.test(kilde);

/** De fire XLSX-profiler beholder andre_driftsindtaegter (ellers vender NEGATE den). */
const xlsxProfilerBeholderAndre = (kilde: string) =>
  ["economic_pnl_credit_v1", "economic_pnl_business_v1", "combined_dk_credit_v1", "combined_dk_business_v1"].every((pid) => {
    const i = kilde.indexOf(`profile_id: "${pid}"`);
    const blok = kilde.slice(i, kilde.indexOf("\n};", i));
    return /andre_driftsindtaegter: \{ action: "keep"/.test(blok);
  });

/** Tjek 18 dømmer KUN de fire afledte resultatlinjer — ikke omkostnings-/indtægtskandidater (17/9 aften). */
const tjek18KunResultatlinjer = (kilde: string) =>
  /export const AFLEDTE_RESULTATLINJER: readonly string\[\] = \["resultat_foer_skat", "daekningsbidrag", "ebitda", "resultat_efter_skat"\];/.test(kilde) &&
  /const businessTrail = \(signTrail \?\? \[\]\)\.filter\(e => e\.sign_convention === "business" && AFLEDTE_RESULTATLINJER\.includes\(e\.source_field_id\)/.test(kilde);

/** Modulets kontrolsum-kommentar siger hvad den beviser (pr. konstruktion), så ingen læser den som mere. */
const kontogrupperSigerHvadKontrolsummenBeviser = (kilde: string) => /PR\. KONSTRUKTION/.test(kilde) && /HVER linje tæller PRÆCIS én gang/.test(kilde);

describe("skabelonerRest.guard — de tre sidste skabeloner (17/9-2026)", () => {
  it("Dinero CSV, Dinero PDF og generic PDF fordeler via kontogrupper.ts uden abs pr. klasse og uden at springe uklassificerede over", () => {
    for (const f of [FILER.csv, FILER.dineroPdf, FILER.genericPdf]) {
      const k = laes(f);
      expect(fordelerViaModul(k), f).toBe(true);
      expect(springerIkkeOver(k), f).toBe(true);
    }
  });

  it("motorens legacy-map kender oevrige_omkostninger og andre_driftsindtaegter", () => {
    expect(legacyMapHarNoegler(laes(FILER.engine))).toBe(true);
  });

  it("Dinero-profilen vender omsætningen og beholder de positive dele, indtægterne og nettoresultatet", () => {
    expect(dineroProfilHolder(laes(FILER.profiler))).toBe(true);
  });

  it("XLSX-P&L og combined fordeler via subtotalGrupper.ts med de to matchere og kontrolsummen", () => {
    expect(subtotalViaModul(laes(FILER.xlsx))).toBe(true);
    expect(subtotalViaModul(laes(FILER.combined))).toBe(true);
    expect(xlsxProfilerBeholderAndre(laes(FILER.profiler))).toBe(true);
  });

  it("tjek 18 (derived_sign_preserved) dømmer kun de fire afledte resultatlinjer", () => {
    expect(tjek18KunResultatlinjer(laes(FILER.engine))).toBe(true);
  });

  it("kontogrupper.ts siger hvad kontrolsummen beviser", () => {
    expect(kontogrupperSigerHvadKontrolsummenBeviser(laes(FILER.kontogrupper))).toBe(true);
  });

  describe("selvbevis — hvert prædikat fælder på den muterede kilde", () => {
    it("abs pr. klasse genindført → fælder", () => {
      const k = laes(FILER.csv).replace("const revenue = fordeling.revenue;", "const revenue = Math.abs(sums.revenue);");
      expect(fordelerViaModul(k)).toBe(false);
    });
    it("kontrolsummen fjernet → fælder", () => {
      const k = laes(FILER.dineroPdf).replace("checks.push(kontrolsumTjek(fordeling));", "");
      expect(fordelerViaModul(k)).toBe(false);
    });
    it("uklassificerede sprunget over igen → fælder", () => {
      const k = laes(FILER.genericPdf).replace("const fordeling = fordelKontogrupper(", 'for (const line of classified) { if (line.cls === "unclassified") continue; }\n    const fordeling = fordelKontogrupper(');
      expect(springerIkkeOver(k)).toBe(false);
    });
    it("nøgle fjernet fra legacy-mappet → fælder", () => {
      expect(legacyMapHarNoegler(laes(FILER.engine).replace('oevrige_omkostninger: "other_costs",', ""))).toBe(false);
    });
    it("Dinero-profilen abs'er omsætningen igen (i stedet for at vende) → fælder", () => {
      const k = laes(FILER.profiler);
      const i = k.indexOf('profile_id: "dinero_pnl_credit_v1"');
      const m = k.slice(0, i) + k.slice(i).replace(/revenue_like:(\s+)NEGATE/, "revenue_like:$1ABS");
      expect(dineroProfilHolder(m)).toBe(false);
    });
    it("subtotal-skabelonen uden kontrolsum eller uden matcher → fælder", () => {
      expect(subtotalViaModul(laes(FILER.xlsx).replace("checks.push(fordeling.kontrolsum);", ""))).toBe(false);
      expect(subtotalViaModul(laes(FILER.combined).replace('key: "oevrige_omkostninger", pattern: OEVRIGE_OMKOSTNINGER_RE', 'key: "x", pattern: /x/'))).toBe(false);
    });
    it("en XLSX-profil uden keep på andre_driftsindtaegter → fælder", () => {
      const k = laes(FILER.profiler);
      const i = k.indexOf('profile_id: "combined_dk_business_v1"');
      const m = k.slice(0, i) + k.slice(i).replace(/andre_driftsindtaegter: \{ action: "keep"[^\n]*\n/, "");
      expect(xlsxProfilerBeholderAndre(m)).toBe(false);
    });
    it("tjek 18 udvidet til alle business-kandidater igen → fælder", () => {
      expect(tjek18KunResultatlinjer(laes(FILER.engine).replace(' && AFLEDTE_RESULTATLINJER.includes(e.source_field_id)', ""))).toBe(false);
    });
    it("modulets forklaring af kontrolsummen fjernet → fælder", () => {
      expect(kontogrupperSigerHvadKontrolsummenBeviser(laes(FILER.kontogrupper).replace("PR. KONSTRUKTION", "helt sikkert"))).toBe(false);
    });
  });
});
