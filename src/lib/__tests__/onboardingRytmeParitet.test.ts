import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerRytme, historikTekst, introPaamindelseModen, komIGangTekst } from "@/lib/onboardingRytme";
// Paritetsimport — Deno-kopien er et spejl uden imports, så de to filer
// skal være ordret ens ud over filhovederne. vitest fejler højt hvis de driver.
import {
  afgoerRytme as afgoerRytmeDeno,
  historikTekst as historikTekstDeno,
  introPaamindelseModen as introPaamindelseModenDeno,
  komIGangTekst as komIGangTekstDeno,
} from "../../../supabase/functions/_shared/onboardingRytme.ts";

const NU = new Date(2026, 8, 9, 9, 0);
const start = (d: number) => new Date(2026, 8, 9 - d, 14).toISOString();
const INPUTS = [0, 1, 2, 9, 10, 13, 14, 20, 21, 90, 400].flatMap((d) =>
  [
    { erLegat: false, antalUploads: 0, harMaaltRapport: false, alleredeSendt: [] as string[] },
    { erLegat: false, antalUploads: 1, harMaaltRapport: false, alleredeSendt: [] as string[] },
    { erLegat: true, antalUploads: 0, harMaaltRapport: false, alleredeSendt: [] as string[] },
    { erLegat: false, antalUploads: 0, harMaaltRapport: false, alleredeSendt: ["onboarding-dag0", "onboarding-dag14"] },
  ].map((r) => ({ medlemSiden: start(d), ...r })),
).concat([{ medlemSiden: null, erLegat: false, antalUploads: 0, harMaaltRapport: false, alleredeSendt: [] }]);

describe("onboardingRytme — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("dommen, modenheden og teksterne er ens for alle input", () => {
    for (const i of INPUTS) {
      expect(afgoerRytmeDeno(i, NU)).toEqual(afgoerRytme(i, NU));
      expect(introPaamindelseModenDeno(i.medlemSiden, NU)).toBe(introPaamindelseModen(i.medlemSiden, NU));
    }
    for (const navn of ["Mette", null]) {
      expect(komIGangTekstDeno(navn, true)).toEqual(komIGangTekst(navn, true));
      expect(komIGangTekstDeno(navn, false)).toEqual(komIGangTekst(navn, false));
      expect(historikTekstDeno(navn)).toEqual(historikTekst(navn));
    }
  });
  it("kildekoden er ordret ens efter filhovedet (ingen imports at undtage)", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    expect(krop("supabase/functions/_shared/onboardingRytme.ts")).toBe(krop("src/lib/onboardingRytme.ts"));
  });
});
