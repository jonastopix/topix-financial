import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Kildeværn for «Kunne du bruge den?» (16/9-2026, motoren uden UI).
// Tre ting låses, så svaret ALDRIG siver ind i de eksisterende skriveveje
// eller i læsere der ikke er besluttet endnu:
//   1. ProgressPatch (akademiApi.ts) nævner ikke brugbar — medlemmets
//      almindelige upsert (kvittér/fortryd/spring/position) må ikke kunne
//      bære svaret; det har sin egen skrivevej.
//   2. batchAcknowledge og clearAcknowledge (adminContentApi.ts) nævner
//      ikke brugbar — rådgiverens markering og fortryd rører aldrig svaret.
//   3. Ingen fil under src/ nævner brugbar_at ud over types.ts, lektionBrugbar.ts,
//      akademiApi.ts og testfiler — ingen læser af de nye kolonner ved navn
//      i denne omgang (mangellistens (4): UI og tal kommer senere, bevidst).
// Kilde-læsning (emailSendLogStatus.guard-/fornyelseSkrivevej.guard-mønstret),
// og værnet beviser sig selv på en KOPI af kilden med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");

const AKADEMI_API = "src/lib/hjemmebane/akademiApi.ts";
const ADMIN_API = "src/lib/hjemmebane/adminContentApi.ts";
const MAA_NAEVNE_BRUGBAR_AT = [
  "src/integrations/supabase/types.ts",
  "src/lib/hjemmebane/lektionBrugbar.ts",
  AKADEMI_API,
];

/** Blokken `export type ProgressPatch = …;` — frem til det første `;`. */
export function progressPatchBlok(kilde: string): string {
  const start = kilde.indexOf("export type ProgressPatch");
  if (start === -1) throw new Error("akademiApi.ts: fandt ikke `export type ProgressPatch`");
  const slut = kilde.indexOf(";", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut);
}

/** Funktionskroppen for `export async function <navn>(` frem til den
    første `}` i kolonne 0 — husets funktioner er top-level. */
export function funktionsBlok(kilde: string, navn: string): string {
  const start = kilde.indexOf(`export async function ${navn}(`);
  if (start === -1) throw new Error(`fandt ikke \`export async function ${navn}(\``);
  const slut = kilde.indexOf("\n}", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + 2);
}

export const naevnerBrugbar = (tekst: string): boolean => /brugbar/.test(tekst);
export const naevnerBrugbarAt = (tekst: string): boolean => /brugbar_at/.test(tekst);

function alleKildefiler(mappe: string): string[] {
  return readdirSync(mappe).flatMap((navn) => {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) return navn === "node_modules" ? [] : alleKildefiler(sti);
    return /\.(ts|tsx)$/.test(navn) ? [sti] : [];
  });
}

export const erTestfil = (sti: string): boolean => /\.test\.tsx?$/.test(sti) || /\/__tests__\//.test(sti);

/** De filer under src/ der nævner brugbar_at uden lov. Ren over (sti, kilde)-par. */
export function ulovligeBrugbarAtFiler(filer: Array<{ sti: string; kilde: string }>): string[] {
  return filer
    .filter(({ sti }) => !erTestfil(sti) && !MAA_NAEVNE_BRUGBAR_AT.includes(sti))
    .filter(({ kilde }) => naevnerBrugbarAt(kilde))
    .map(({ sti }) => sti);
}

const filer = alleKildefiler(resolve(ROD, "src")).map((sti) => ({
  sti: relative(ROD, sti),
  kilde: readFileSync(sti, "utf8"),
}));

describe("lektionBrugbar.guard — svaret siver ikke ind i de eksisterende skriveveje", () => {
  const akademi = laes(AKADEMI_API);
  const admin = laes(ADMIN_API);

  it("1. ProgressPatch nævner ikke brugbar (medlemmets upsert bærer ikke svaret)", () => {
    const blok = progressPatchBlok(akademi);
    expect(blok).toContain("acknowledged_at"); // blokken er den rigtige
    expect(naevnerBrugbar(blok)).toBe(false);
  });

  it("2. batchAcknowledge og clearAcknowledge nævner ikke brugbar (rådgiverens markering rører aldrig svaret)", () => {
    for (const navn of ["batchAcknowledge", "clearAcknowledge"]) {
      const blok = funktionsBlok(admin, navn);
      expect(blok, navn).toContain("acknowledged_at"); // blokken er den rigtige
      expect(naevnerBrugbar(blok), navn).toBe(false);
    }
  });

  it("3. ingen fil under src/ nævner brugbar_at ud over types.ts, lektionBrugbar.ts, akademiApi.ts og testfiler", () => {
    expect(ulovligeBrugbarAtFiler(filer)).toEqual([]);
  });

  it("træ-gangen ser kildefilerne, og de tre tilladte filer nævner faktisk brugbar_at (positiv kontrol)", () => {
    expect(filer.length).toBeGreaterThan(100);
    for (const sti of MAA_NAEVNE_BRUGBAR_AT) {
      const fil = filer.find((f) => f.sti === sti);
      expect(fil, sti).toBeDefined();
      expect(naevnerBrugbarAt(fil!.kilde), sti).toBe(true);
    }
  });

  it("VÆRNET VIRKER: kopier med fejlen indsat fanges (filerne er ikke rørt)", () => {
    // 1: ProgressPatch med brugbar i Pick-listen.
    const kopiPatch = akademi.replace('"acknowledged_at" | "skipped_at"', '"acknowledged_at" | "brugbar" | "skipped_at"');
    expect(kopiPatch).not.toBe(akademi);
    expect(naevnerBrugbar(progressPatchBlok(kopiPatch))).toBe(true);

    // 2: batchAcknowledge der også sender brugbar_at; clearAcknowledge der nulstiller brugbar.
    const kopiBatch = admin.replace("acknowledged_at: now,", "acknowledged_at: now,\n      brugbar_at: now,");
    expect(kopiBatch).not.toBe(admin);
    expect(naevnerBrugbar(funktionsBlok(kopiBatch, "batchAcknowledge"))).toBe(true);
    expect(naevnerBrugbar(funktionsBlok(kopiBatch, "clearAcknowledge"))).toBe(false); // kun den ene blok ramt
    const kopiClear = admin.replace(".update({ acknowledged_at: null })", ".update({ acknowledged_at: null, brugbar: null })");
    expect(kopiClear).not.toBe(admin);
    expect(naevnerBrugbar(funktionsBlok(kopiClear, "clearAcknowledge"))).toBe(true);

    // 3: en kildefil uden lov der nævner brugbar_at — og en testfil/tilladt fil der må.
    const smuglet = [
      ...filer,
      { sti: "src/components/hjemmebane/akademi/views/ElementView.tsx", kilde: "const x = progress?.brugbar_at;" },
    ];
    expect(ulovligeBrugbarAtFiler(smuglet)).toEqual(["src/components/hjemmebane/akademi/views/ElementView.tsx"]);
    expect(
      ulovligeBrugbarAtFiler([
        { sti: "src/lib/hjemmebane/__tests__/x.test.ts", kilde: "brugbar_at" },
        { sti: "src/lib/hjemmebane/lektionBrugbar.ts", kilde: "brugbar_at" },
      ]),
    ).toEqual([]);

    // Og en tekst uden blokken fanges, ikke overses.
    expect(() => progressPatchBlok("export type Andet = 1;")).toThrow(/ProgressPatch/);
    expect(() => funktionsBlok("", "batchAcknowledge")).toThrow(/batchAcknowledge/);
  });
});
