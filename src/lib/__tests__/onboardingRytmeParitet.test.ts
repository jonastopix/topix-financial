import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerRytme, harBegyndtMedTal, historikSituation, historikTekst, introPaamindelseModen, komIGangTekst } from "@/lib/onboardingRytme";
// Paritetsimport — Deno-kopien er et spejl; siden 16/9 (instruks F) har begge
// ÉN import (maanedsnoegle, selv spejlet), og importstien er den eneste
// tilladte forskel. Ud over den skal de to filer være ordret ens efter
// filhovederne. vitest fejler højt hvis de driver.
import {
  afgoerRytme as afgoerRytmeDeno,
  harBegyndtMedTal as harBegyndtMedTalDeno,
  historikSituation as historikSituationDeno,
  historikTekst as historikTekstDeno,
  introPaamindelseModen as introPaamindelseModenDeno,
  komIGangTekst as komIGangTekstDeno,
} from "../../../supabase/functions/_shared/onboardingRytme.ts";

const NU = new Date(2026, 8, 9, 9, 0);
const start = (d: number) => new Date(2026, 8, 9 - d, 14).toISOString();
const PERIODER: readonly (readonly (string | null)[])[] = [[], ["2026-08"], ["2026-09"], [null], ["2026-09", "2026-08"]];
const INPUTS = [0, 1, 2, 9, 10, 13, 14, 20, 21, 90, 400].flatMap((d) =>
  PERIODER.flatMap((uploadPerioder) => [
    { erLegat: false, uploadPerioder, harMaaltRapport: false, alleredeSendt: [] as string[] },
    { erLegat: true, uploadPerioder, harMaaltRapport: false, alleredeSendt: [] as string[] },
    { erLegat: false, uploadPerioder, harMaaltRapport: true, alleredeSendt: [] as string[] },
    { erLegat: false, uploadPerioder, harMaaltRapport: false, alleredeSendt: ["onboarding-dag0", "onboarding-dag14"] },
  ]).map((r) => ({ medlemSiden: start(d), ...r })),
).concat([{ medlemSiden: null, erLegat: false, uploadPerioder: [], harMaaltRapport: false, alleredeSendt: [] }]);

const NUER = [NU, new Date("2026-09-30T21:59:59Z"), new Date("2026-09-30T22:00:00Z"), new Date("2026-12-31T23:00:00Z"), new Date("2027-01-05T07:15:00Z")];

describe("onboardingRytme — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("dommen, modenheden, begyndt-reglen, situationen og teksterne er ens for alle input", () => {
    for (const nu of NUER) {
      for (const i of INPUTS) {
        expect(afgoerRytmeDeno(i, nu)).toEqual(afgoerRytme(i, nu));
        expect(introPaamindelseModenDeno(i.medlemSiden, nu)).toBe(introPaamindelseModen(i.medlemSiden, nu));
        expect(harBegyndtMedTalDeno(i, nu)).toBe(harBegyndtMedTal(i, nu));
        expect(historikSituationDeno(i)).toBe(historikSituation(i));
      }
      for (const navn of ["Mette", null]) {
        expect(komIGangTekstDeno(navn, true, nu)).toEqual(komIGangTekst(navn, true, nu));
        expect(komIGangTekstDeno(navn, false, nu)).toEqual(komIGangTekst(navn, false, nu));
        expect(historikTekstDeno(navn, nu)).toEqual(historikTekst(navn, nu));
        expect(historikTekstDeno(navn, nu, "kun_for_tidlige")).toEqual(historikTekst(navn, nu, "kun_for_tidlige"));
        expect(historikTekstDeno(navn, nu, "uden_upload")).toEqual(historikTekst(navn, nu, "uden_upload"));
      }
    }
  });
  it("kildekoden er ordret ens efter filhovedet — importstien til maanedsnoegle er den eneste tilladte forskel", () => {
    const krop = (sti: string) => {
      const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
      return kilde.slice(kilde.indexOf("*/") + 2);
    };
    const deno = krop("supabase/functions/_shared/onboardingRytme.ts");
    const web = krop("src/lib/onboardingRytme.ts");
    expect(deno).toContain('import { afsluttedeMaanederTekst, erMaanedAfsluttet } from "./maanedsnoegle.ts";');
    expect(web).toContain('import { afsluttedeMaanederTekst, erMaanedAfsluttet } from "./maanedsnoegle";');
    expect(deno.replace('from "./maanedsnoegle.ts";', 'from "./maanedsnoegle";')).toBe(web);
    // Præcis én import i hver — ingen anden afhængighed må snige sig ind.
    expect(web.match(/^import /gm) ?? []).toHaveLength(1);
    expect(deno.match(/^import /gm) ?? []).toHaveLength(1);
  });
});
